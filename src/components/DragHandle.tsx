import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { GripVertical, Trash, Copy, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Quote, Code, Type } from 'lucide-react';
import { NodeSelection } from '@tiptap/pm/state';
import tippy, { Instance } from 'tippy.js';
import 'tippy.js/dist/tippy.css';

interface DragHandleProps {
  editor: Editor;
}

export function DragHandle({ editor }: DragHandleProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [currentNode, setCurrentNode] = useState<{ node: any; pos: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tippyInstance = useRef<Instance | null>(null);

  useEffect(() => {
    if (!editor) return;

    const handleMouseMove = (e: MouseEvent | Event) => {
      if (menuOpen) return;
      
      const { view } = editor;
      if (!view) return;


      // Handle scroll event (which doesn't have clientX/Y)
      // We need to use the last known mouse position or just re-validate current hover?
      // Actually, on scroll, the element under mouse changes.
      // But we can't get clientX from scroll event.
      // We should track mouse position in a ref.
      
      let clientX = 0;
      let clientY = 0;
      
      if (e instanceof MouseEvent) {
        clientX = e.clientX;
        clientY = e.clientY;
        // Store last pos if we want to handle scroll better
      } else {
        // For scroll, we can't easily know where the mouse is relative to viewport 
        // without tracking it.
        // Let's just return for now on scroll unless we track it.
        return; 
      }

      const coords = { left: clientX, top: clientY };
      const pos = view.posAtCoords(coords);

      if (!pos) return;

      // Find the closest block-level element
      const resolvePos = view.state.doc.resolve(pos.pos);
      let depth = resolvePos.depth;
      
      if (depth === 0) return; 
      
      const blockPos = resolvePos.before(1);
      const blockNode = view.state.doc.nodeAt(blockPos);
      
      if (!blockNode) return;

      const domNode = view.nodeDOM(blockPos) as HTMLElement;
      
      if (domNode && domNode.getBoundingClientRect) {
        const rect = domNode.getBoundingClientRect();
        
        setPosition({
          top: rect.top,
          left: rect.left - 24,
        });
        setCurrentNode({ node: blockNode, pos: blockPos });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    // document.addEventListener('scroll', handleMouseMove, true); 
    // Commented out scroll for now as it needs mouse pos tracking

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      // document.removeEventListener('scroll', handleMouseMove, true);
    };
  }, [editor, menuOpen]);
  
    const handleDragStart = (e: React.DragEvent) => {
      if (!currentNode || !editor) return;
      
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
      e.dataTransfer.setData('application/x-notes-drag', 'true');
  
      const selection = NodeSelection.create(editor.state.doc, currentNode.pos);
      const transaction = editor.state.tr.setSelection(selection);
      editor.view.dispatch(transaction);
    };
  
    const openMenu = () => {
      if (!dragHandleRef.current || !menuRef.current) return;
  
      if (!tippyInstance.current) {
        tippyInstance.current = tippy(dragHandleRef.current, {
          content: menuRef.current,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          theme: 'transparent',
          arrow: false,
          appendTo: document.body,
          onShow: () => setMenuOpen(true),
          onHide: () => setMenuOpen(false),
        });
      }
      
      tippyInstance.current.show();
    };

  const closeMenu = () => {
    tippyInstance.current?.hide();
  };

  const deleteBlock = () => {
    if (currentNode) {
      editor.chain().focus().setNodeSelection(currentNode.pos).deleteSelection().run();
    }
    closeMenu();
  };
  
  const duplicateBlock = () => {
    if (currentNode) {
        const json = currentNode.node.toJSON();
        const endPos = currentNode.pos + currentNode.node.nodeSize;
        editor.chain().insertContentAt(endPos, json).run();
    }
    closeMenu();
  };

  if (!position) return null;

  return (
    <>
      <div
        ref={dragHandleRef}
        draggable
        onDragStart={handleDragStart}
        onClick={openMenu}
        className="fixed z-50 cursor-grab flex items-center justify-center w-6 h-6 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <GripVertical size={16} />
      </div>

      <div className="hidden">
        <div ref={menuRef} className="bg-white text-black shadow-md border border-stone-200 rounded-lg py-1 min-w-[160px] flex flex-col z-[9999]">
           <button onClick={deleteBlock} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left w-full outline-none">
             <Trash size={14} /> Delete
           </button>
           <button onClick={duplicateBlock} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Copy size={14} /> Duplicate
           </button>
           
           <div className="h-px bg-gray-200 my-1" />
           <div className="px-4 py-1 text-xs font-semibold text-gray-500">Turn into</div>
           
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).setParagraph().run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Type size={14} /> Text
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).setHeading({ level: 1 }).run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Heading1 size={14} /> Heading 1
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).setHeading({ level: 2 }).run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Heading2 size={14} /> Heading 2
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).setHeading({ level: 3 }).run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Heading3 size={14} /> Heading 3
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).toggleBulletList().run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <List size={14} /> Bullet List
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).toggleOrderedList().run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <ListOrdered size={14} /> Numbered List
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).toggleTaskList().run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <CheckSquare size={14} /> To-do List
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).setBlockquote().run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Quote size={14} /> Quote
           </button>
           <button onClick={() => { editor.chain().focus().setNodeSelection(currentNode!.pos).setCodeBlock().run(); closeMenu(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-black hover:bg-gray-100 text-left w-full outline-none">
             <Code size={14} /> Code
           </button>
        </div>
      </div>
    </>
  );
}
