import { Trophy, Code, Book, Zap, Target } from 'lucide-react';

interface Skill {
    id: string;
    name: string;
    level: number;
    maxLevel: number;
    icon: React.ElementType;
    color: string;
}

interface SkillTreeProps {
    codingMinutes?: number;
    developmentMinutes?: number;
    readingMinutes?: number;
    productivePercentage?: number;
    goalCompletionRate?: number;
}

export function SkillTree({ 
    codingMinutes = 0,
    developmentMinutes = 0,
    readingMinutes = 0, 
    productivePercentage = 0,
    goalCompletionRate = 0 
}: SkillTreeProps) {
    // Progress = actual minutes as % of the cap (5 levels × threshold per level)
    // This gives a smooth continuous bar rather than discrete level jumps
    const CAP_CODING = 300;      // 5h = full bar
    const CAP_DEV    = 300;
    const CAP_READ   = 1500;     // 25h = full bar (reading is slower)
    const CAP_FOCUS  = 100;      // percentage, already 0-100
    const CAP_GOALS  = 100;

    const skills: Skill[] = [
        { id: 'coding',      name: 'Coding',      level: Math.min(100, Math.round((codingMinutes / CAP_CODING) * 100)),      maxLevel: 100, icon: Code,   color: 'var(--pos-activity-leetcode)' },
        { id: 'development', name: 'Development',  level: Math.min(100, Math.round((developmentMinutes / CAP_DEV) * 100)),    maxLevel: 100, icon: Code,   color: 'var(--pos-activity-development)' },
        { id: 'reading',     name: 'Reading',      level: Math.min(100, Math.round((readingMinutes / CAP_READ) * 100)),       maxLevel: 100, icon: Book,   color: 'var(--pos-activity-book)' },
        { id: 'focus',       name: 'Focus',        level: Math.min(100, productivePercentage),                                maxLevel: 100, icon: Zap,    color: 'var(--color-accent-primary)' },
        { id: 'goals',       name: 'Goals',        level: Math.min(100, goalCompletionRate),                                  maxLevel: 100, icon: Target, color: 'var(--color-success)' },
    ];

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <Trophy className="w-6 h-6" style={{ color: 'var(--color-accent-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Skill Tree
                </h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {skills.map((skill) => {
                    const Icon = skill.icon;
                    const progress = skill.level; // already 0-100

                    return (
                        <div
                            key={skill.id}
                            className="p-4 rounded-xl"
                            style={{
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                            }}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div
                                    className="p-2 rounded-lg"
                                    style={{
                                        background: `${skill.color}15`,
                                        color: skill.color,
                                    }}
                                >
                                    <Icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {skill.name}
                                    </div>
                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        {Math.round(progress)}%
                                    </div>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div
                                className="h-2 rounded-full overflow-hidden"
                                style={{ background: 'var(--surface-secondary)' }}
                            >
                                <div
                                    className="h-full transition-all duration-300"
                                    style={{
                                        width: `${progress}%`,
                                        background: skill.color,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
