import { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, ChevronDown, FileText, StickyNote, Trash2, ExternalLink, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

interface FloatingHeaderProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  breadcrumbs: Array<{ id: string; title: string }>;
  onAction: (action: string) => void;
}

export function FloatingHeader({ title, onTitleChange, breadcrumbs, onAction }: FloatingHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempTitle, setTempTitle] = useState(title);
  const [showMenu, setShowMenu] = useState(false);
  const [showBreadcrumbDropdown, setShowBreadcrumbDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setTempTitle(title);
  }, [title]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTitleSubmit = () => {
    setIsEditing(false);
    if (tempTitle.trim() !== title) {
      onTitleChange(tempTitle);
    }
  };

  const getBreadcrumbLabel = () => {
    if (breadcrumbs.length === 0) return 'Root';
    
    if (breadcrumbs.length > 2) {
      const lastParent = breadcrumbs[breadcrumbs.length - 1];
      return (
        <span className="flex items-center">
          <span className="opacity-60">...</span>
          <span className="mx-1">/</span>
          <span className="truncate max-w-[80px]">{lastParent.title}</span>
        </span>
      );
    }

    return (
      <span className="flex items-center truncate max-w-[200px]">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center">
            {i > 0 && <span className="mx-1">/</span>}
            <span className="truncate">{crumb.title}</span>
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="absolute top-6 left-1/2 transform -translate-x-1/2 flex items-center gap-3 z-50">
      
      {/* Pill #1: Note Title */}
      <div className="relative group">
        <div className={clsx(
          "flex items-center justify-center px-4 py-2 rounded-full backdrop-blur-2xl shadow-lg border border-white/40 transition-all duration-300",
          "bg-white/10 hover:bg-white/20 dark:bg-black/20 dark:hover:bg-black/40 shadow-[inset_0_0_20px_rgba(255,255,255,0.3)]",
          "hover:shadow-xl hover:scale-[1.02]",
          "text-sm font-medium text-white",
          isEditing ? "w-64" : "min-w-[120px] max-w-[200px]"
        )}>
          {isEditing ? (
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              autoFocus
              className="w-full bg-transparent outline-none text-center"
            />
          ) : (
            <span 
              onClick={() => setIsEditing(true)}
              className="truncate cursor-pointer w-full text-center"
            >
              {title || 'Untitled'}
            </span>
          )}
        </div>
      </div>

      {/* Pill #2: Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div 
          className="relative"
          onMouseEnter={() => setShowBreadcrumbDropdown(true)}
          onMouseLeave={() => setShowBreadcrumbDropdown(false)}
        >
          <div className={clsx(
            "flex items-center justify-center px-3 py-2 rounded-full backdrop-blur-2xl shadow-lg border border-white/40 cursor-pointer transition-all duration-300",
            "bg-white/10 hover:bg-white/20 dark:bg-black/20 dark:hover:bg-black/40 shadow-[inset_0_0_20px_rgba(255,255,255,0.3)]",
            "hover:shadow-xl hover:scale-[1.02]",
            "text-sm text-white"
          )}>
            {getBreadcrumbLabel()}
            <ChevronDown className="w-3 h-3 ml-2 opacity-60" />
          </div>

          {showBreadcrumbDropdown && (
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-white/95 dark:bg-black/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/40 dark:border-white/10 overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex flex-col">
                {breadcrumbs.map((crumb, index) => (
                  <div 
                    key={crumb.id}
                    onClick={() => navigate(`/notes/${crumb.id}`)}
                    className="px-4 py-2 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-xs flex items-center text-gray-700 dark:text-gray-200"
                  >
                     <span className="truncate flex-1">{crumb.title || 'Untitled'}</span>
                     <ChevronRight className="w-3 h-3 text-gray-400 ml-1" />
                  </div>
                ))}
                <div className="px-4 py-2 bg-black/5 dark:bg-white/5 text-xs font-semibold text-gray-900 dark:text-white truncate border-t border-gray-200 dark:border-gray-700">
                  {title || 'Current Note'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAB: Hamburger Menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={clsx(
            "w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-2xl shadow-lg border border-white/40 transition-all duration-300",
            "bg-white/10 hover:bg-white/20 dark:bg-black/20 dark:hover:bg-black/40 shadow-[inset_0_0_20px_rgba(255,255,255,0.3)]",
            "hover:shadow-xl hover:scale-105",
            "text-white"
          )}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>

        {showMenu && (
          <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-black rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200 z-50">
            <button
              onClick={() => { onAction('new-nested'); setShowMenu(false); }}
              className="w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 text-sm text-black dark:text-white text-left transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>New Nested Note</span>
            </button>
            
            <button
              onClick={() => { onAction('new-sticky'); setShowMenu(false); }}
              className="w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-3 text-sm text-black dark:text-white text-left transition-colors"
            >
              <StickyNote className="w-4 h-4" />
              <span>New Sticky Note</span>
            </button>

            <button
              disabled
              className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-gray-400 dark:text-gray-500 text-left cursor-not-allowed"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in New Tab</span>
            </button>
            
            <button
              disabled
              className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-gray-400 dark:text-gray-500 text-left cursor-not-allowed"
            >
              <div className="w-4 h-4 flex items-center justify-center">✨</div>
              <span>Stickers</span>
            </button>

            <div className="h-px bg-gray-200 dark:bg-gray-700 my-1 mx-2" />

            <button
              onClick={() => { onAction('delete'); setShowMenu(false); }}
              className="w-full px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 text-sm text-red-600 dark:text-red-400 text-left transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Note</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
