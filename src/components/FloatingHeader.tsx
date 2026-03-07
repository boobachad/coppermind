import { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, ChevronDown, StickyNote, Trash2, ExternalLink, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { STICKER_TYPES } from '../lib/constants';

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
  const [showStickerMenu, setShowStickerMenu] = useState(false);
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
        <div 
          className={clsx(
            "flex items-center justify-center px-4 py-2 rounded-full transition-all duration-300 backdrop-blur-xl shadow-sm border",
            "hover:scale-[1.02] hover:shadow-md text-sm font-semibold tracking-wide",
            isEditing ? "w-64" : "min-w-[120px] max-w-[200px]"
          )}
          style={{
            backgroundColor: 'var(--glass-bg)',
            borderColor: 'var(--glass-border)',
            color: 'var(--text-primary)'
          }}
        >
          {isEditing ? (
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
              autoFocus
              className="w-full bg-transparent outline-none text-center"
              style={{ color: 'var(--text-primary)' }}
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
          <div 
            className={clsx(
              "flex items-center justify-center px-3 py-2 rounded-full backdrop-blur-xl shadow-sm border cursor-pointer transition-all duration-300",
              "hover:shadow-md hover:scale-[1.02] text-sm font-medium"
            )}
            style={{
              backgroundColor: 'var(--glass-bg)',
              borderColor: 'var(--glass-border)',
              color: 'var(--text-primary)'
            }}
          >
            {getBreadcrumbLabel()}
            <ChevronDown className="w-3 h-3 ml-2 opacity-60" />
          </div>

          {showBreadcrumbDropdown && (
            <div 
              className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 backdrop-blur-2xl rounded-2xl shadow-2xl border overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-200"
              style={{
                backgroundColor: 'var(--glass-bg)',
                borderColor: 'var(--glass-border)'
              }}
            >
              <div className="flex flex-col">
                {breadcrumbs.map((crumb) => (
                  <div
                    key={crumb.id}
                    onClick={() => navigate(`/notes/${crumb.id}`)}
                    className="px-4 py-2 cursor-pointer text-xs flex items-center transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--glass-bg-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span className="truncate flex-1">{crumb.title || 'Untitled'}</span>
                    <ChevronRight className="w-3 h-3 ml-1" style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                ))}
                <div 
                  className="px-4 py-2 text-xs font-semibold truncate border-t"
                  style={{
                    backgroundColor: 'var(--glass-bg-subtle)',
                    borderColor: 'var(--glass-border)',
                    color: 'var(--text-primary)'
                  }}
                >
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
            "w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-xl shadow-sm border transition-all duration-300",
            "hover:shadow-md hover:scale-105"
          )}
          style={{
            backgroundColor: 'var(--glass-bg)',
            borderColor: 'var(--glass-border)',
            color: 'var(--text-primary)'
          }}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>

        {showMenu && (
          <div 
            className="absolute top-full right-0 mt-2 w-56 rounded-2xl shadow-xl border overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-200 z-50"
            style={{
              backgroundColor: 'var(--glass-bg)',
              borderColor: 'var(--glass-border)'
            }}
          >
            {showStickerMenu ? (
              <>
                <div 
                  className="px-4 py-2 border-b flex items-center"
                  style={{ borderColor: 'var(--glass-border)' }}
                >
                  <button
                    onClick={() => setShowStickerMenu(false)}
                    className="mr-2 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Stickers</span>
                </div>
                <div className="p-2 grid grid-cols-3 gap-2">
                  {STICKER_TYPES.map(type => (
                    <button
                      key={type.id}
                      onClick={() => {
                        onAction(`add-sticker:${type.id}`);
                        setShowMenu(false);
                        setShowStickerMenu(false);
                      }}
                      className="flex flex-col items-center justify-center p-2 rounded transition-colors"
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--glass-bg-subtle)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      title={type.label}
                    >
                      <type.icon className="w-6 h-6 mb-1" style={{ color: type.color }} />
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{type.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => { onAction('new-sticky'); setShowMenu(false); }}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-left transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--glass-bg-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <StickyNote className="w-4 h-4" />
                  <span>New Sticky Note</span>
                </button>

                <button
                  disabled
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-left cursor-not-allowed"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in New Tab</span>
                </button>

                <button
                  onClick={() => setShowStickerMenu(true)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-left transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--glass-bg-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Stickers</span>
                </button>

                <div className="h-px my-1 mx-2" style={{ backgroundColor: 'var(--glass-border)' }} />

                <button
                  onClick={() => { onAction('delete'); setShowMenu(false); }}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-sm text-left transition-colors"
                  style={{ color: 'var(--color-error)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-error-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Note</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
