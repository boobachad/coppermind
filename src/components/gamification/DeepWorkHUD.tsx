import { useState, useEffect } from 'react';
import { Zap, TrendingUp } from 'lucide-react';

interface DeepWorkHUDProps {
    visible?: boolean;
}

export function DeepWorkHUD({ visible = true }: DeepWorkHUDProps) {
    const [sessionTime, setSessionTime] = useState(0);
    const [isActive, setIsActive] = useState(false);
    const [totalToday, setTotalToday] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isActive) {
            interval = setInterval(() => {
                setSessionTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isActive]);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const toggleSession = () => {
        if (isActive) {
            setTotalToday(prev => prev + sessionTime);
            setSessionTime(0);
        }
        setIsActive(!isActive);
    };

    if (!visible) return null;

    return (
        <div
            className="fixed bottom-4 right-4 z-40 rounded-xl p-4 shadow-2xl backdrop-blur-md"
            style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                minWidth: '280px',
            }}
        >
            <div className="flex items-center gap-2 mb-3">
                <div
                    className="p-2 rounded-lg"
                    style={{
                        background: 'var(--color-accent-primary)',
                        color: 'white',
                    }}
                >
                    <Zap className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Deep Work HUD
                    </h3>
                </div>
            </div>

            <div
                className="mb-3 p-3 rounded-lg"
                style={{
                    background: 'var(--surface-secondary)',
                    border: '1px solid var(--border-secondary)',
                }}
            >
                <div className="text-2xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {formatTime(sessionTime)}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Current Session
                </div>
            </div>

            <div
                className="mb-3 p-3 rounded-lg"
                style={{
                    background: 'var(--surface-secondary)',
                    border: '1px solid var(--border-secondary)',
                }}
            >
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                    <div className="text-lg font-semibold font-mono" style={{ color: 'var(--color-success)' }}>
                        {formatTime(totalToday + sessionTime)}
                    </div>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Total Today
                </div>
            </div>

            <button
                onClick={toggleSession}
                className="w-full py-2 px-4 rounded-lg font-medium transition-all"
                style={{
                    background: isActive ? 'var(--color-error)' : 'var(--btn-primary-bg)',
                    color: 'white',
                }}
            >
                {isActive ? 'End Session' : 'Start Session'}
            </button>
        </div>
    );
}
