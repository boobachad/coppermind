import React from 'react';
import { ChevronRight } from 'lucide-react';

interface CodeforcesCardProps {
    title: string;
    subtitle: string;
    description?: string;
    tags?: { label: string; color: string; bgColor: string }[];
    icon?: React.ReactNode;
    progress: {
        solved: number;
        total: number;
    };
    onClick: () => void;
}

export function CodeforcesCard({
    title,
    subtitle,
    description,
    tags,
    icon,
    progress,
    onClick,
}: CodeforcesCardProps) {
    const percentage = progress.total > 0 ? Math.round((progress.solved / progress.total) * 100) : 0;
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    const getProgressColor = () => {
        return '#3b82f6';
    };

    const progressColor = getProgressColor();

    return (
        <div
            onClick={onClick}
            className="p-6 rounded-xl transition-all hover:scale-[1.02] cursor-pointer group relative overflow-hidden"
            style={{
                backgroundColor: 'var(--glass-bg)',
                // Dynamic border using box-shadow or background manipulation is complex with rounded corners
                // Using a pseudo-element approach via localized style for the "ring" effect
                background: `linear-gradient(var(--glass-bg), var(--glass-bg)) padding-box,
                             conic-gradient(from 0deg, var(--color-accent-primary) ${percentage}%, var(--glass-border) ${percentage}%) border-box`,
                border: '2px solid transparent',
                backdropFilter: 'blur(8px)',
            }}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-3 mb-2">
                        {icon && (
                            <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                                {icon}
                            </div>
                        )}
                        {tags && tags.map((tag, i) => (
                            <span
                                key={i}
                                className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                    backgroundColor: tag.bgColor,
                                    color: tag.color,
                                }}
                            >
                                {tag.label}
                            </span>
                        ))}
                    </div>
                    <h3 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {title}
                    </h3>
                </div>

                {/* Progress Ring */}
                <div className="relative flex items-center justify-center" style={{ width: '60px', height: '60px' }}>
                    <svg className="transform -rotate-90 w-full h-full">
                        <circle
                            cx="30"
                            cy="30"
                            r={radius}
                            stroke="var(--surface-secondary)"
                            strokeWidth="5"
                            fill="transparent"
                        />
                        <circle
                            cx="30"
                            cy="30"
                            r={radius}
                            stroke={progressColor}
                            strokeWidth="5"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                            {percentage}%
                        </span>
                    </div>
                </div>
            </div>

            {description && (
                <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text-secondary)', minHeight: '2.5em' }}>
                    {description}
                </p>
            )}

            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</span>

                <div className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    <span>{progress.solved} / {progress.total}</span>
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
            </div>
        </div>
    );
}
