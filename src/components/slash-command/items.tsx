import { 
  Heading1, 
  Heading2, 
  Heading3, 
  List, 
  ListOrdered, 
  CheckSquare, 
  Quote, 
  Code, 
  Type,
  Minus,
  Image as ImageIcon,
  FileText,
  Workflow,
  Table as TableIcon,
  Highlighter,
  Palette,
  PaintBucket
} from 'lucide-react';
import { Editor } from '@tiptap/react';
import { handleImageUpload, handlePDFUpload } from '../extensions/uploadHelper';

export interface CommandItemProps {
  title: string;
  icon: any;
  command: (props: { editor: Editor; range: any }) => void;
}

export const getSuggestionItems = ({ query }: { query: string }) => {
  return [
    {
      title: 'Text',
      icon: Type,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: 'Heading 1',
      icon: Heading1,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      },
    },
    {
      title: 'Heading 2',
      icon: Heading2,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      },
    },
    {
      title: 'Heading 3',
      icon: Heading3,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      },
    },
    {
      title: 'Bullet List',
      icon: List,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: 'Numbered List',
      icon: ListOrdered,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: 'To-do List',
      icon: CheckSquare,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: 'Blockquote',
      icon: Quote,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: 'Code Block',
      icon: Code,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: 'Divider',
      description: 'Insert a horizontal divider',
      searchTerms: ['divider', 'hr', 'line'],
      icon: Minus,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: 'Image',
      description: 'Upload or paste an image',
      searchTerms: ['image', 'photo', 'picture'],
      icon: ImageIcon,
      command: async ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).run();
        const src = await handleImageUpload();
        if (src) {
          editor.chain().focus().setImage({ src }).run();
        }
      },
    },
    {
      title: 'PDF',
      description: 'Attach a PDF file',
      searchTerms: ['pdf', 'document', 'file'],
      icon: FileText,
      command: async ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).run();
        const result = await handlePDFUpload();
        if (result) {
          editor.chain().focus().insertContent({
            type: 'pdf',
            attrs: { src: result.src, name: result.name }
          }).run();
        }
      },
    },
    {
      title: 'Mind Map (Tree)',
      description: 'Create a tree-style mind map',
      searchTerms: ['mind', 'map', 'tree'],
      icon: Workflow,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).insertContent({ type: 'mindMapTree' }).run();
      },
    },
    {
      title: 'Mind Map (Block)',
      description: 'Create a block-style mind map',
      searchTerms: ['mind', 'map', 'block'],
      icon: Workflow,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).insertContent({ type: 'mindMapBlock' }).run();
      },
    },
    {
      title: 'Table',
      description: 'Insert a table',
      searchTerms: ['table', 'grid'],
      icon: TableIcon,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      title: 'Highlight Text',
      description: 'Highlight selected text',
      searchTerms: ['highlight', 'marker'],
      icon: Highlighter,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleHighlight().run();
      },
    },
    {
      title: 'Text Color (Blue)',
      description: 'Change text color to blue',
      searchTerms: ['color', 'text', 'blue'],
      icon: Palette,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).setColor('#60a5fa').run(); // Light Blue
      },
    },
    {
      title: 'Background (Yellow)',
      description: 'Set yellow background',
      searchTerms: ['background', 'bg', 'yellow'],
      icon: PaintBucket,
      command: ({ editor, range }: any) => {
        editor.chain().focus().deleteRange(range).toggleHighlight({ color: '#fef08a' }).run(); // Soft Yellow
      },
    },
  ].filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 20);
};
