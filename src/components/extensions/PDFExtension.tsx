import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { FileText } from 'lucide-react';

export const PDFExtension = Node.create({
  name: 'pdf',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      name: {
        default: 'document.pdf',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="pdf"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pdf' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(({ node }) => {
      const openPdf = () => {
        // Mock opening for now
        console.log("Opening PDF:", node.attrs.src);
        if (node.attrs.src) {
           window.open(node.attrs.src, '_blank');
        }
      };

      return (
        <NodeViewWrapper className="pdf-component">
          <div 
            onClick={openPdf}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-full cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors select-none"
            contentEditable={false}
          >
            <FileText size={16} className="text-red-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary underline decoration-gray-300 dark:decoration-gray-600 underline-offset-2">{node.attrs.name}</span>
          </div>
        </NodeViewWrapper>
      );
    });
  },
});
