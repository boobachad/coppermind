import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { all, createLowlight } from 'lowlight';

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
  onChange?: (content: string) => void;
  editable?: boolean;
  className?: string; // Allow custom classes
}

export const Editor = forwardRef<EditorRef, EditorProps>(({ content, onChange, editable = true, className }, ref) => {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  // Use a ref to track if we've synced the initial content
  // We only want to force-set content once when the editor loads
  const hasSyncedInitialContent = useRef(false);

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false,
        horizontalRule: false,
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
      // Underline, // Duplicate
      // Link.configure({ // Duplicate
      //   openOnClick: false,
      // }),
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
      onChange?.(JSON.stringify(editor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: className || 'prose mx-auto focus:outline-none max-w-none dark:prose-invert text-white',
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

          const dropPos = coordinates.pos;

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
    if (editor && content) {
      const isInitialSync = !hasSyncedInitialContent.current;
      // If it's the first sync OR we are in read-only mode, we trust the prop.
      // In read-only mode, the prop is the source of truth and we need to update
      // when the parent updates (e.g. after an edit in the modal).
      if (isInitialSync || !editable) {
        const currentContent = JSON.stringify(editor.getJSON());
        // Simple comparison to avoid unnecessary updates
        // parse check is handled by tryParse in setContent usually but here we compare strings
        // This might be imperfect if ordering changes but good enough for now
        if (currentContent !== content && JSON.stringify(tryParse(content)) !== currentContent) {
          editor.commands.setContent(tryParse(content));
        }
        if (isInitialSync) {
          hasSyncedInitialContent.current = true;
        }
      }
    }
  }, [editor, content, editable]);

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
      <BubbleMenu editor={editor} className="flex material-glass p-1 rounded-xl overflow-hidden divide-x divide-white/10 shadow-xl border border-(--glass-border)">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 hover:bg-(--glass-bg-subtle) transition-colors ${editor.isActive('bold') ? 'text-(--text-primary) bg-(--glass-bg-subtle)' : 'text-muted-foreground'}`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 hover:bg-(--glass-bg-subtle) transition-colors ${editor.isActive('italic') ? 'text-(--text-primary) bg-(--glass-bg-subtle)' : 'text-muted-foreground'}`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-2 hover:bg-(--glass-bg-subtle) transition-colors ${editor.isActive('underline') ? 'text-(--text-primary) bg-(--glass-bg-subtle)' : 'text-muted-foreground'}`}
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-2 hover:bg-(--glass-bg-subtle) transition-colors ${editor.isActive('code') ? 'text-(--text-primary) bg-(--glass-bg-subtle)' : 'text-muted-foreground'}`}
        >
          <Code className="w-4 h-4" />
        </button>
      </BubbleMenu>

      <div>
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
