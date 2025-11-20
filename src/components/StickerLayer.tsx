import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { getDb } from '../lib/db';
import { StickyNote } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';
import { Smile, Check, Stamp, X, RotateCw, Maximize2 } from 'lucide-react';
import { STICKER_TYPES } from '../lib/constants';

interface StickerProps {
  noteId: string;
}

export interface StickerLayerRef {
  addSticker: (type: string) => void;
}

export const StickerLayer = forwardRef<StickerLayerRef, StickerProps>(({ noteId }, ref) => {
  const [stickers, setStickers] = useState<StickyNote[]>([]);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string, startX: number, startY: number, initialX: number, initialY: number } | null>(null);
  const transformRef = useRef<{ id: string, type: 'rotate' | 'scale', startX: number, startY: number, initialVal: number } | null>(null);

  useImperativeHandle(ref, () => ({
    addSticker: (type: string) => {
      // Spawn in center of container (or screen if container is large)
      const container = containerRef.current;
      let x = 100;
      let y = 100;
      
      if (container) {
        const rect = container.getBoundingClientRect();
        // Visible center
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        
        // Center of the viewport relative to the document
        const viewportCenterX = scrollLeft + window.innerWidth / 2;
        const viewportCenterY = scrollTop + window.innerHeight / 2;

        // Position relative to the container
        x = viewportCenterX - rect.left - 50; // 50 is half sticker width approx
        y = viewportCenterY - rect.top - 50;
      }

      addStickerToDb(type, x, y);
    }
  }));

  useEffect(() => {
    loadStickers();
  }, [noteId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { id, startX, startY, initialX, initialY } = dragRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        updateStickerLocal(id, { x: initialX + dx, y: initialY + dy });
      } else if (transformRef.current) {
        const { id, type, startX, startY, initialVal } = transformRef.current;
        if (type === 'rotate') {
          // Simple rotation logic based on x-axis movement
          const dx = e.clientX - startX;
          updateStickerLocal(id, { rotation: initialVal + dx });
        } else if (type === 'scale') {
          const dy = startY - e.clientY; // Drag up to scale up
          const scale = Math.max(0.5, Math.min(3, initialVal + dy * 0.01));
          updateStickerLocal(id, { scale });
        }
      }
    };

    const handleMouseUp = async () => {
      if (dragRef.current) {
        // Need to find sticker from state or just use the dragRef id
        const id = dragRef.current.id;
        // We need the *current* position to save.
        // Since we updated state via updateStickerLocal, the state has the new pos.
        // But we can't access 'stickers' state here if we don't depend on it.
        // Using a functional state update in saveStickerUpdate? No, that's async db.
        
        // Alternative: read from DOM or keep a ref for currentStickers
        // For now, let's keep the dependency on 'stickers' but REMOVE loadStickers() from this effect.
        const sticker = stickers.find(s => s.id === id);
        if (sticker) {
           await saveStickerUpdate(sticker.id, { x: sticker.x, y: sticker.y });
        }
        dragRef.current = null;
      }
      if (transformRef.current) {
        const id = transformRef.current.id;
        const sticker = stickers.find(s => s.id === id);
        if (sticker) {
           await saveStickerUpdate(sticker.id, { rotation: sticker.rotation, scale: sticker.scale });
        }
        transformRef.current = null;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [stickers]);

  const loadStickers = async () => {
    try {
      const db = await getDb();
      const result = await db.select<StickyNote[]>('SELECT * FROM sticky_notes WHERE note_id = ?', [noteId]);
      setStickers(result);
    } catch (err) {
      console.error("Failed to load stickers", err);
    }
  };

  const addStickerToDb = async (type: string, x: number, y: number) => {
    const id = uuidv4();
    const stickerData = STICKER_TYPES.find(s => s.id === type);
    if (!stickerData) return;

    const newSticker: StickyNote = {
      id,
      note_id: noteId,
      content: type,
      color: stickerData.color,
      x,
      y,
      created_at: Date.now(),
      type: 'stamp',
      rotation: 0,
      scale: 1
    };

    setStickers(prev => [...prev, newSticker]);
    
    try {
      const db = await getDb();
      await db.execute(
        'INSERT INTO sticky_notes (id, note_id, content, color, x, y, created_at, type, rotation, scale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, noteId, type, newSticker.color, x, y, newSticker.created_at, 'stamp', newSticker.rotation, newSticker.scale]
      );
    } catch (err) {
      console.error("Failed to save sticker", err);
    }
  };

  const updateStickerLocal = (id: string, updates: Partial<StickyNote>) => {
    setStickers(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const saveStickerUpdate = async (id: string, updates: Partial<StickyNote>) => {
    try {
      const db = await getDb();
      if (updates.x !== undefined && updates.y !== undefined) {
        await db.execute('UPDATE sticky_notes SET x = ?, y = ? WHERE id = ?', [updates.x, updates.y, id]);
      }
      if (updates.rotation !== undefined) {
        await db.execute('UPDATE sticky_notes SET rotation = ? WHERE id = ?', [updates.rotation, id]);
      }
      if (updates.scale !== undefined) {
        await db.execute('UPDATE sticky_notes SET scale = ? WHERE id = ?', [updates.scale, id]);
      }
    } catch (err) {
      console.error("Failed to update sticker", err);
    }
  };

  const removeSticker = async (id: string) => {
    setStickers(prev => prev.filter(s => s.id !== id));
    try {
      const db = await getDb();
      await db.execute('DELETE FROM sticky_notes WHERE id = ?', [id]);
    } catch (err) {
      console.error("Failed to remove sticker", err);
    }
  };

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-visible z-20">
      {stickers.map(sticker => {
        const typeData = STICKER_TYPES.find(s => s.id === sticker.content);
        if (!typeData) return null;
        const Icon = typeData.icon;
        const isSelected = selectedSticker === sticker.id;

        return (
          <div
            key={sticker.id}
            className="absolute pointer-events-auto cursor-move group"
            style={{
              transform: `translate(${sticker.x}px, ${sticker.y}px) rotate(${sticker.rotation || 0}deg) scale(${sticker.scale || 1})`,
              color: sticker.color,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setSelectedSticker(sticker.id);
              dragRef.current = { id: sticker.id, startX: e.clientX, startY: e.clientY, initialX: sticker.x, initialY: sticker.y };
            }}
          >
            {/* Sticker Content */}
            <div className={`relative p-2 ${isSelected ? 'ring-2 ring-blue-500 rounded-lg bg-white/10' : ''}`}>
               <Icon className="w-16 h-16 opacity-90 drop-shadow-md" />
               
               {/* Controls (Only when selected) */}
               {isSelected && (
                 <>
                   {/* Delete Button */}
                   <button 
                     className="absolute -top-3 -right-3 p-1 bg-white dark:bg-dark-surface text-red-500 dark:text-red-400 rounded-full shadow-md hover:bg-red-50 dark:hover:bg-red-900/20"
                     onClick={(e) => { e.stopPropagation(); removeSticker(sticker.id); }}
                   >
                     <X className="w-3 h-3" />
                   </button>

                   {/* Rotate Handle */}
                   <div 
                     className="absolute -top-6 left-1/2 transform -translate-x-1/2 cursor-ew-resize p-1 bg-white dark:bg-dark-surface text-blue-500 dark:text-blue-400 rounded-full shadow-md"
                     onMouseDown={(e) => {
                       e.stopPropagation();
                       transformRef.current = { id: sticker.id, type: 'rotate', startX: e.clientX, startY: e.clientY, initialVal: sticker.rotation || 0 };
                     }}
                   >
                     <RotateCw className="w-3 h-3" />
                   </div>

                   {/* Scale Handle */}
                   <div 
                     className="absolute -bottom-3 -right-3 cursor-nwse-resize p-1 bg-white dark:bg-dark-surface text-blue-500 dark:text-blue-400 rounded-full shadow-md"
                     onMouseDown={(e) => {
                       e.stopPropagation();
                       transformRef.current = { id: sticker.id, type: 'scale', startX: e.clientX, startY: e.clientY, initialVal: sticker.scale || 1 };
                     }}
                   >
                     <Maximize2 className="w-3 h-3" />
                   </div>
                 </>
               )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
