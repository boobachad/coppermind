import { ExternalLink } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

export interface CapturedUrlData {
    url: string;
    url_type?: string;
    // New shape
    source_title?: string;
    source_type?: string;
    source_context?: string;
    // Old shape (backwards compat)
    activity_title?: string;
    detected_in?: string;
}

interface CapturedLinkItemProps {
    urlData: CapturedUrlData;
    showOpenButton?: boolean;
}

export function CapturedLinkItem({ urlData, showOpenButton = true }: CapturedLinkItemProps) {
    const sourceLabel = urlData.source_title || urlData.activity_title || 'Unknown';
    const sourceType = urlData.source_type || 'activity';
    const sourceContext = urlData.source_context || urlData.detected_in || '';

    const openLink = async () => {
        try {
            await invoke('open_link', { url: urlData.url });
        } catch (err) {
            console.error('Failed to open link:', err);
            toast.error(`Failed to open link: ${urlData.url}`, { description: String(err) });
        }
    };

    return (
        <div
            className="p-2 rounded-lg border"
            style={{
                background: 'var(--glass-bg-subtle)',
                borderColor: 'var(--glass-border)',
            }}
        >
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div
                        onClick={openLink}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openLink(); }}
                        role="button"
                        tabIndex={0}
                        className="text-sm font-medium truncate cursor-pointer hover:opacity-80"
                        style={{ color: 'var(--color-accent-primary)' }}
                    >
                        {urlData.url}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {sourceType} · {sourceLabel}{sourceContext ? ` (${sourceContext})` : ''}
                    </div>
                    {urlData.url_type && urlData.url_type !== 'generic' && urlData.url_type !== 'other' && (
                        <div
                            className="text-xs mt-1 inline-block px-1.5 py-0.5 rounded"
                            style={{
                                background: 'color-mix(in srgb, var(--color-accent-primary) 15%, transparent)',
                                color: 'var(--color-accent-primary)',
                            }}
                        >
                            {urlData.url_type}
                        </div>
                    )}
                </div>
                {showOpenButton && (
                    <button
                        onClick={openLink}
                        className="flex-shrink-0 p-1 rounded hover:bg-secondary"
                    >
                        <ExternalLink className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    </button>
                )}
            </div>
        </div>
    );
}
