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
    codingCount?: number;
    readingMinutes?: number;
    productivePercentage?: number;
    goalCompletionRate?: number;
}

export function SkillTree({ 
    codingCount = 0, 
    readingMinutes = 0, 
    productivePercentage = 0,
    goalCompletionRate = 0 
}: SkillTreeProps) {
    // Calculate levels from actual data (0-5 scale)
    const codingLevel = Math.min(5, Math.floor(codingCount / 10)); // 10 activities per level
    const readingLevel = Math.min(5, Math.floor(readingMinutes / 300)); // 5 hours per level
    const focusLevel = Math.min(5, Math.floor(productivePercentage / 20)); // 20% per level
    const goalsLevel = Math.min(5, Math.floor(goalCompletionRate / 20)); // 20% per level

    const skills: Skill[] = [
        { id: 'coding', name: 'Coding', level: codingLevel, maxLevel: 5, icon: Code, color: 'var(--pos-activity-coding-leetcode)' },
        { id: 'reading', name: 'Reading', level: readingLevel, maxLevel: 5, icon: Book, color: 'var(--pos-activity-book)' },
        { id: 'focus', name: 'Focus', level: focusLevel, maxLevel: 5, icon: Zap, color: 'var(--color-accent-primary)' },
        { id: 'goals', name: 'Goals', level: goalsLevel, maxLevel: 5, icon: Target, color: 'var(--color-success)' },
    ];

    return (
        <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
                <Trophy className="w-6 h-6" style={{ color: 'var(--color-accent-primary)' }} />
                <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Skill Tree
                </h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {skills.map((skill) => {
                    const Icon = skill.icon;
                    const progress = (skill.level / skill.maxLevel) * 100;

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
