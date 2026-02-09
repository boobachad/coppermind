import { useState } from 'react';
import { X, ExternalLink, Plus, Link2 } from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import clsx from 'clsx';

interface SourceUrlsDisplayProps {
    urls: string[];
    onAdd: (url: string) => void;
    onRemove: (url: string) => void;
}

// Extract domain from URL for display
function getDomain(url: string): string {
    try {
        const domain = new URL(url).hostname;
        return domain.replace('www.', '');
    } catch {
        return url;
    }
}

// Get favicon URL using Google's service
function getFavicon(url: string, size: number = 16): string {
    try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
    } catch {
        return '';
    }
}

export function SourceUrlsDisplay({ urls, onAdd, onRemove }: SourceUrlsDisplayProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newUrl, setNewUrl] = useState('');

    const handleAdd = () => {
        if (newUrl.trim()) {
            let url = newUrl.trim();
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }
            onAdd(url);
            setNewUrl('');
            setIsAdding(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAdd();
        } else if (e.key === 'Escape') {
            setIsAdding(false);
            setNewUrl('');
        }
    };

    if (urls.length === 0 && !isAdding) {
        return (
            <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 text-gray-400 dark:text-dark-text-secondary hover:text-gray-600 dark:hover:text-dark-text-primary cursor-pointer transition-colors text-sm"
            >
                <Link2 className="w-4 h-4" />
                <span>Add source link...</span>
            </button>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* URL Pills */}
            {urls.map((url, index) => (
                <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                        "group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer",
                        "bg-gray-100 dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary",
                        "hover:bg-gray-200 dark:hover:bg-dark-border transition-colors",
                        "border border-gray-200 dark:border-dark-border"
                    )}
                    onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            await writeText(url);
                            toast.success('Copied URL to clipboard');
                            await open(url);
                        } catch (err) {
                            console.error('Failed to open URL:', err);
                            toast.error('Failed to open URL');
                        }
                    }}
                >
                    <img
                        src={getFavicon(url)}
                        alt=""
                        className="w-3.5 h-3.5 rounded-sm"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                    <span className="max-w-[150px] truncate">{getDomain(url)}</span>
                    <ExternalLink className="w-3 h-3 opacity-50" />
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRemove(url);
                        }}
                        className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-0.5"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </a>
            ))}

            {/* Add button or input */}
            {isAdding ? (
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => {
                            if (!newUrl.trim()) setIsAdding(false);
                        }}
                        placeholder="https://..."
                        className={clsx(
                            "w-48 px-2.5 py-1 rounded-full text-xs",
                            "bg-gray-100 dark:bg-dark-surface text-gray-700 dark:text-dark-text-primary",
                            "border border-gray-300 dark:border-dark-border",
                            "focus:outline-none focus:ring-1 focus:ring-blue-500"
                        )}
                        autoFocus
                    />
                </div>
            ) : (
                <button
                    onClick={() => setIsAdding(true)}
                    className={clsx(
                        "flex items-center justify-center w-6 h-6 rounded-full",
                        "bg-gray-100 dark:bg-dark-surface text-gray-500 dark:text-dark-text-secondary",
                        "hover:bg-gray-200 dark:hover:bg-dark-border hover:text-gray-700 dark:hover:text-dark-text-primary",
                        "transition-colors border border-dashed border-gray-300 dark:border-dark-border"
                    )}
                    title="Add source link"
                >
                    <Plus className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
