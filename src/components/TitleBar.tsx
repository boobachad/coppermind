import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
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
        "h-[32px] flex items-center justify-between select-none z-[9999] shrink-0",
        "bg-white dark:bg-dark-bgSecondary text-gray-900 dark:text-gray-400 transition-colors duration-300"
      )}
    >
      {/* App Title */}
      <div className="flex-1 h-full flex items-center px-4 text-xs font-medium opacity-80 cursor-default">
        NoteDown
      </div>

      {/* Window Controls */}
      <div className="flex items-center h-full z-50">
        <button
          onClick={(e) => { e.stopPropagation(); minimize(); }}
          className="h-full px-4 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors flex items-center justify-center focus:outline-none cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMaximize(); }}
          className="h-full px-4 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors flex items-center justify-center focus:outline-none cursor-pointer"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <Maximize2 className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); close(); }}
          className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center focus:outline-none cursor-pointer"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
