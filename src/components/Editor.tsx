import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { all, createLowlight } from 'lowlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { SlashCommand } from './slash-command/extension';
import suggestion from './slash-command/suggestion';
import { Bold, Italic, Underline as UnderlineIcon, Code } from 'lucide-react';
import { DragHandle } from './DragHandle';
import { ContextMenu } from './ContextMenu';
import { PDFExtension } from './extensions/PDFExtension';
import { MindMapTreeExtension, MindMapBlockExtension } from './extensions/MindMapExtension';
import { forwardRef, useImperativeHandle, useState, useEffect, useRef } from 'react';
import { TableControls } from './extensions/TableControls';

const lowlight = createLowlight(all);

export interface EditorRef {
  setTitle: (title: string) => void;
}

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
}

export const Editor = forwardRef<EditorRef, EditorProps>(({ content, onChange }, ref) => {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  // Use a ref to track if we've synced the initial content
  // We only want to force-set content once when the editor loads
  const hasSyncedInitialContent = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: "Type '/' for commands...",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      HorizontalRule,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-lg shadow-md max-w-full my-4 cursor-pointer hover:opacity-90 transition-opacity',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      PDFExtension,
      MindMapTreeExtension,
      MindMapBlockExtension,
      SlashCommand.configure({
        suggestion,
      }),
    ],
    content: content ? tryParse(content) : '',
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none max-w-none pt-32', // Added pt-32 for top spacing
      },
      handleDOMEvents: {
        contextmenu: (_view, event) => {
          event.preventDefault();
          setMenuPos({ x: event.clientX, y: event.clientY });
          return true;
        },
      },
      handleDrop: (view, event: any, _slice, moved) => {
        if (!moved && event.dataTransfer?.getData('application/x-notes-drag')) {
          event.preventDefault();
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coordinates) return false;
          
          const { selection } = view.state;
          const { from, to } = selection;
          
          // Don't drop inside itself
          if (coordinates.pos >= from && coordinates.pos <= to) return false;

          const node = view.state.doc.slice(from, to).content.firstChild;
          if (!node) return false;

          let dropPos = coordinates.pos;
          
          // Adjust drop position to be block-level
          // This is a simplification; ideally we find the block at coordinates and insert before/after
          const resolved = view.state.doc.resolve(dropPos);
          
          // If dropping in the second half of a block, insert after? 
          // For now, just insert at the resolved position which is usually inside a text node?
          // No, we want to move BLOCKS.
          
          // Let's try to insert BEFORE the block we hover over
          // If we are deep inside, we go up to depth 1 (top level blocks usually)
          // Actually, we should check `resolved.depth`.
          
          let targetPos = dropPos;
          if (resolved.depth > 0) {
             targetPos = resolved.before(1);
          }
          
          // Map position if we delete first?
          // If target is AFTER source, we delete first, target shifts by (to-from).
          // If target is BEFORE source, we delete first, target stays same.
          
          let transaction = view.state.tr;
          transaction = transaction.delete(from, to);
          
          const mappedPos = transaction.mapping.map(targetPos);
          transaction = transaction.insert(mappedPos, node);
          
          view.dispatch(transaction);
          return true;
        }
        return false;
      }
    },
  });

  useEffect(() => {
    if (editor && content && !hasSyncedInitialContent.current) {
      const currentContent = JSON.stringify(editor.getJSON());
      if (currentContent !== content) {
        editor.commands.setContent(tryParse(content));
      }
      hasSyncedInitialContent.current = true;
    }
  }, [editor, content]);

  useImperativeHandle(ref, () => ({
    setTitle: (title: string) => {
      if (!editor) return;
      const firstNode = editor.state.doc.firstChild;
      if (firstNode && firstNode.type.name === 'heading' && firstNode.attrs.level === 1) {
        editor.chain()
          .focus()
          .command(({ tr, dispatch }) => {
            if (dispatch) {
              const start = 1;
              const end = firstNode.content.size + 1;
              tr.replaceWith(start, end, editor.schema.text(title));
            }
            return true;
          })
          .run();
      } else {
        editor.chain().insertContentAt(0, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }).run();
      }
    }
  }));

  if (!editor) {
    return null;
  }

  return (
    <>
      <BubbleMenu editor={editor} className="flex bg-white text-black shadow-md border border-stone-200 rounded-lg overflow-hidden divide-x divide-stone-200">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 hover:bg-gray-100 ${editor.isActive('bold') ? 'text-blue-600' : 'text-black'}`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 hover:bg-gray-100 ${editor.isActive('italic') ? 'text-blue-600' : 'text-black'}`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-2 hover:bg-gray-100 ${editor.isActive('underline') ? 'text-blue-600' : 'text-black'}`}
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-2 hover:bg-gray-100 ${editor.isActive('code') ? 'text-blue-600' : 'text-black'}`}
        >
          <Code className="w-4 h-4" />
        </button>
      </BubbleMenu>

      <div className="min-h-screen overflow-x-auto">
        <EditorContent editor={editor} />
      </div>
      <DragHandle editor={editor} />
      <TableControls editor={editor} />
      <ContextMenu editor={editor} position={menuPos} onClose={() => setMenuPos(null)} />
    </>
  );
});

const tryParse = (str: string) => {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
};
