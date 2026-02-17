import { UnifiedGoal } from '../../lib/types';
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Target, CheckCircle2, Loader, Flame, AlertTriangle } from 'lucide-react';

interface GoalStatsProps {
    goals: UnifiedGoal[];
}

export function GoalStats({ goals }: GoalStatsProps) {
    const stats = {
        total: goals.length,
        completed: goals.filter(g => g.completed).length,
        pending: goals.filter(g => !g.completed).length,
        urgent: goals.filter(g => g.urgent && !g.completed).length,
        debt: goals.filter(g => g.isDebt).length,
    };

    const chartData = [
        { name: 'Completed', value: stats.completed, color: '#10B981' },
        { name: 'Pending', value: stats.pending, color: '#EF4444' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
            <div className="p-6 rounded-2xl border bg-card border-border shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium uppercase tracking-wider text-(--text-tertiary)">Total</p>
                    <Target className="w-4 h-4 text-(--text-tertiary)" />
                </div>
                <p className="text-4xl font-bold text-(--text-primary)">{stats.total}</p>
            </div>
            <div className="p-6 rounded-2xl border bg-card border-border shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium uppercase tracking-wider text-(--pos-success-text)">Completed</p>
                    <CheckCircle2 className="w-4 h-4 text-(--pos-success-text)" />
                </div>
                <p className="text-4xl font-bold text-(--text-primary)">{stats.completed}</p>
            </div>
            <div className="p-6 rounded-2xl border bg-card border-border shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium uppercase tracking-wider text-(--pos-warning-text)">Pending</p>
                    <Loader className="w-4 h-4 text-(--pos-warning-text)" />
                </div>
                <p className="text-4xl font-bold text-(--text-primary)">{stats.pending}</p>
            </div>
            <div className="p-6 rounded-2xl border bg-card border-border shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium uppercase tracking-wider text-(--pos-error-text)">Urgent</p>
                    <Flame className="w-4 h-4 text-(--pos-error-text)" />
                </div>
                <p className="text-4xl font-bold text-(--text-primary)">{stats.urgent}</p>
            </div>
            <div className="p-6 rounded-2xl border bg-card border-border shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium uppercase tracking-wider text-(--pos-debt-text)">Debt</p>
                    <AlertTriangle className="w-4 h-4 text-(--pos-debt-text)" />
                </div>
                <p className="text-4xl font-bold text-(--text-primary)">{stats.debt}</p>
            </div>
            <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={30}
                            outerRadius={50}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }}
                            itemStyle={{ color: 'var(--text-primary)' }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
