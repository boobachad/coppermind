import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, X, Maximize2 } from 'lucide-react';
import clsx from 'clsx';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const updateMaximizedState = async () => {
      try {
        const appWindow = getCurrentWindow();
        setIsMaximized(await appWindow.isMaximized());
      } catch (e) {
        console.error('Failed to get window state', e);
      }
    };

    updateMaximizedState();

    const handleResize = () => {
      updateMaximizedState();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const minimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error(e);
    }
  };

  const toggleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    } catch (e) {
      console.error(e);
    }
  };

  const close = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error(e);
    }
  };

  const startDrag = async (e: React.MouseEvent) => {
    // Prevent dragging if clicking on buttons (just in case)
    if ((e.target as HTMLElement).closest('button')) return;

    try {
      const appWindow = getCurrentWindow();
      await appWindow.startDragging();
    } catch (e) {
      console.error('Failed to start dragging', e);
    }
  };

  return (
    <div
      onMouseDown={startDrag}
      className={clsx(
        "h-[36px] flex items-center justify-between select-none z-9999 shrink-0",
        "material-glass-subtle transition-colors duration-300"
      )}
    >
      {/* App Title */}
      <div className="flex-1 h-full flex items-center px-4 text-xs font-medium text-(--text-secondary) tracking-wide cursor-default select-none transition-colors duration-300">
        coppermind
      </div>

      {/* Window Controls (macOS Traffic Lights) */}
      <div className="flex items-center h-full z-50 px-4 gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); minimize(); }}
          className="w-3 h-3 rounded-full bg-[#FEBC2E] hover:bg-[#FFD60A] border border-[#D3A100] flex items-center justify-center group focus:outline-none cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-2 h-2 text-[#4c3b0b] opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMaximize(); }}
          className="w-3 h-3 rounded-full bg-[#28C840] hover:bg-[#32D74B] border border-[#1CA62B] flex items-center justify-center group focus:outline-none cursor-pointer"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Maximize2 className="w-2 h-2 text-[#0b3310] opacity-0 group-hover:opacity-100" strokeWidth={3} />
          ) : (
            <Maximize2 className="w-2 h-2 text-[#0b3310] opacity-0 group-hover:opacity-100 rotate-45" strokeWidth={3} />
          )}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); close(); }}
          className="w-3 h-3 rounded-full bg-[#FF5F57] hover:bg-[#FF3B30] border border-[#E0443E] flex items-center justify-center group focus:outline-none cursor-pointer"
          title="Close"
        >
          <X className="w-2 h-2 text-[#4c0b0b] opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
