import { cn } from "../lib/utils";

export function Loader({ className }: { className?: string }) {
    return (
        <div className={cn("relative w-16 h-16", className)}>
            {/* Three concentric rings with staggered rotation */}
            <div
                className="absolute inset-0 rounded-full border-2"
                style={{
                    borderColor: 'transparent',
                    borderTopColor: 'var(--pos-activity-coding)',
                    animation: 'spin 1.5s linear infinite'
                }}
            />
            <div
                className="absolute inset-2 rounded-full border-2"
                style={{
                    borderColor: 'transparent',
                    borderRightColor: 'var(--pos-activity-entertainment)',
                    animation: 'spin 2s linear infinite reverse'
                }}
            />
            <div
                className="absolute inset-4 rounded-full border-2"
                style={{
                    borderColor: 'transparent',
                    borderBottomColor: 'var(--pos-activity-exercise)',
                    animation: 'spin 1s linear infinite'
                }}
            />

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
