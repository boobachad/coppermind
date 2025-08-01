import { useEffect, useRef, useState } from 'react';
import { Editor } from '@tiptap/react';
import tippy from 'tippy.js';

interface TableControlsProps {
  editor: Editor;
}

export function TableControls({ editor }: TableControlsProps) {
  const [tableEl, setTableEl] = useState<HTMLTableElement | null>(null);
  const horizRef = useRef<HTMLDivElement | null>(null);
  const vertRef = useRef<HTMLDivElement | null>(null);
  const horizTip = useRef<any>(null);
  const vertTip = useRef<any>(null);

  useEffect(() => {
    const updateTableEl = () => {
      if (!editor?.view) return;
      const sel = editor.view.state.selection;
      const domSel = editor.view.domAtPos(sel.from);
      const node = domSel.node as HTMLElement;
      const table = node.closest('table');
      if (table) {
        setTableEl(table as HTMLTableElement);
      } else {
        setTableEl(null);
      }
    };
    updateTableEl();
    const onTrans = () => updateTableEl();
    editor.on('transaction', onTrans);
    return () => {
      editor.off('transaction', onTrans);
    };
  }, [editor]);

  useEffect(() => {
    if (horizRef.current && !horizTip.current) {
      horizTip.current = tippy(horizRef.current, {
        content:
          'Click to add a new row\nDrag to add or remove rows',
        allowHTML: true,
        placement: 'top',
        theme: 'transparent',
        arrow: false,
      });
    }
    if (vertRef.current && !vertTip.current) {
      vertTip.current = tippy(vertRef.current, {
        content:
          'Click to add a new column\nDrag to add or remove columns',
        allowHTML: true,
        placement: 'left',
        theme: 'transparent',
        arrow: false,
      });
    }
  }, []);

  useEffect(() => {
    if (!tableEl) return;
    const rect = tableEl.getBoundingClientRect();

    const horiz = horizRef.current!;
    const vert = vertRef.current!;
    horiz.style.position = 'fixed';
    horiz.style.top = `${rect.bottom + 4}px`;
    horiz.style.left = `${rect.left + rect.width / 2 - 40}px`;
    horiz.style.width = `80px`;

    vert.style.position = 'fixed';
    vert.style.top = `${rect.top + rect.height / 2 - 40}px`;
    vert.style.left = `${rect.right + 4}px`;
    vert.style.height = `80px`;
  }, [tableEl]);

  if (!tableEl) return null;

  const focusBottomRightCell = () => {
    const rect = tableEl.getBoundingClientRect();
    const pos = editor.view.posAtCoords({
      left: rect.right - 2,
      top: rect.bottom - 2,
    });
    if (pos?.pos) {
      editor.chain().setTextSelection(pos.pos).run();
    }
  };

  const focusRightEdgeMid = () => {
    const rect = tableEl.getBoundingClientRect();
    const pos = editor.view.posAtCoords({
      left: rect.right - 2,
      top: rect.top + rect.height / 2,
    });
    if (pos?.pos) {
      editor.chain().setTextSelection(pos.pos).run();
    }
  };

  const onHorizClick = () => {
    focusBottomRightCell();
    editor.chain().focus().addRowAfter().run();
  };

  const onVertClick = () => {
    focusRightEdgeMid();
    editor.chain().focus().addColumnAfter().run();
  };

  const startHorizDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    let added = 0;
    const step = 24;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      const steps = Math.floor(delta / step);
      if (steps > added) {
        focusBottomRightCell();
        for (let i = 0; i < steps - added; i++) {
          editor.chain().focus().addRowAfter().run();
        }
        added = steps;
      } else if (steps < added) {
        for (let i = 0; i < added - steps; i++) {
          editor.chain().focus().deleteRow().run();
        }
        added = steps;
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startVertDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    let added = 0;
    const step = 64;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const steps = Math.floor(delta / step);
      if (steps > added) {
        focusRightEdgeMid();
        for (let i = 0; i < steps - added; i++) {
          editor.chain().focus().addColumnAfter().run();
        }
        added = steps;
      } else if (steps < added) {
        for (let i = 0; i < added - steps; i++) {
          editor.chain().focus().deleteColumn().run();
        }
        added = steps;
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <div
        ref={horizRef}
        className="z-50 flex items-center justify-center bg-white text-black border border-gray-300 rounded-full shadow-sm cursor-pointer select-none"
        onClick={onHorizClick}
        onMouseDown={startHorizDrag}
        style={{ height: 28 }}
      >
        <span className="text-xl leading-none">+</span>
      </div>
      <div
        ref={vertRef}
        className="z-50 flex items-center justify-center bg-white text-black border border-gray-300 rounded-full shadow-sm cursor-pointer select-none"
        onClick={onVertClick}
        onMouseDown={startVertDrag}
        style={{ width: 28 }}
      >
        <span className="text-xl leading-none">+</span>
      </div>
    </>
  );
}
