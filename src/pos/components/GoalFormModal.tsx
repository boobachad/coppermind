import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { format } from 'date-fns';
import * as chrono from 'chrono-node';
import { UnifiedGoal } from '../lib/types';
import { DatePicker } from '../../components/DatePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { X, Repeat } from 'lucide-react';
import clsx from 'clsx';

interface GoalFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingGoal: UnifiedGoal | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Smart parsing for natural language input
const parseSmartInput = (text: string) => {
    const parsedDate = chrono.parseDate(text);
    const isUrgent = /urgent|asap|immediately/i.test(text);
    const isHighPriority = /high priority|priority high|important/i.test(text) || isUrgent;

    return {
        date: parsedDate,
        urgent: isUrgent,
        priority: isHighPriority ? 'high' : 'medium' as 'low' | 'medium' | 'high'
    };
};

export function GoalFormModal({ isOpen, onClose, onSuccess, editingGoal }: GoalFormModalProps) {
    const [formText, setFormText] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
    const [formUrgent, setFormUrgent] = useState(false);
    const [formDate, setFormDate] = useState<Date | undefined>(undefined);
    const [formTime, setFormTime] = useState('');
    const [formProblemId, setFormProblemId] = useState('');
    const [formMetrics, setFormMetrics] = useState<{ label: string; target: string; unit: string }[]>([]);
    const [newMetric, setNewMetric] = useState({ label: '', target: '', unit: '' });
    const [selectedDays, setSelectedDays] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (editingGoal) {
                setFormText(editingGoal.text);
                setFormDescription(editingGoal.description || '');
                setFormPriority(editingGoal.priority as 'low' | 'medium' | 'high');
                setFormUrgent(editingGoal.urgent);

                if (editingGoal.dueDate) {
                    const d = new Date(editingGoal.dueDate);
                    setFormDate(d);
                    setFormTime(format(d, 'HH:mm'));
                } else {
                    setFormDate(undefined);
                    setFormTime('');
                }

                setFormProblemId(editingGoal.problemId || '');

                if (editingGoal.metrics) {
                    setFormMetrics(editingGoal.metrics.map(m => ({
                        label: m.label,
                        target: m.target.toString(),
                        unit: m.unit
                    })));
                } else {
                    setFormMetrics([]);
                }

                if (editingGoal.recurringPattern) {
                    setSelectedDays(editingGoal.recurringPattern.split(','));
                } else {
                    setSelectedDays([]);
                }
            } else {
                // Reset form for new goal
                setFormText('');
                setFormDescription('');
                setFormPriority('medium');
                setFormUrgent(false);
                setFormDate(undefined);
                setFormTime('');
                setFormProblemId('');
                setFormMetrics([]);
                setNewMetric({ label: '', target: '', unit: '' });
                setSelectedDays([]);
            }
        }
    }, [isOpen, editingGoal]);

    // Smart input parsing
    useEffect(() => {
        if (!formText || editingGoal) return;
        const smart = parseSmartInput(formText);
        if (smart.urgent) setFormUrgent(true);
        if (smart.priority === 'high') setFormPriority('high');
        if (smart.date) {
            setFormDate(smart.date);
            setFormTime(format(smart.date, 'HH:mm'));
        }
    }, [formText, editingGoal]);

    const handleCreateOrUpdateGoal = async () => {
        if (!formText.trim()) return;

        let dueDate = undefined;
        if (formDate) {
            const dateStr = format(formDate, 'yyyy-MM-dd');
            const d = new Date(`${dateStr}T${formTime || '00:00'}`);
            dueDate = d.toISOString();
        }

        const metricsData = formMetrics.map(m => ({
            // Preserve ID if editing and metric existed, OR generate new UUID
            id: editingGoal?.metrics?.find(ex => ex.label === m.label)?.id || crypto.randomUUID(),
            label: m.label,
            target: parseFloat(m.target),
            current: editingGoal?.metrics?.find(ex => ex.label === m.label)?.current || 0,
            unit: m.unit
        }));

        try {
            if (editingGoal) {
                await invoke('update_unified_goal', {
                    id: editingGoal.id,
                    req: {
                        text: formText,
                        description: formDescription || undefined,
                        priority: formPriority,
                        urgent: formUrgent,
                        dueDate,
                        recurringPattern: selectedDays.length > 0 ? selectedDays.join(',') : '',
                        metrics: metricsData.length > 0 ? metricsData : undefined,
                        problemId: formProblemId || undefined,
                    },
                });
                toast.success('Goal updated');
            } else {
                await invoke('create_unified_goal', {
                    req: {
                        text: formText,
                        description: formDescription || undefined,
                        priority: formPriority,
                        urgent: formUrgent,
                        dueDate,
                        recurringPattern: selectedDays.length > 0 ? selectedDays.join(',') : undefined,
                        metrics: metricsData.length > 0 ? metricsData : undefined,
                        problemId: formProblemId || undefined,
                    },
                });
                toast.success('Goal created');
            }

            onSuccess();
        } catch (err) {
            toast.error(editingGoal ? 'Failed to update goal' : 'Failed to create goal', { description: String(err) });
        }
    };

    const addMetric = () => {
        if (newMetric.target && newMetric.unit) {
            setFormMetrics([...formMetrics, { ...newMetric, label: newMetric.label || 'Target' }]);
            setNewMetric({ label: '', target: '', unit: '' });
        }
    };

    const removeMetric = (index: number) => {
        setFormMetrics(formMetrics.filter((_, i) => i !== index));
    };

    const toggleDay = (day: string) => {
        setSelectedDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4 transition-all duration-300">
            <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200 material-glass border shadow-xl">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 z-10 backdrop-blur-xl bg-background/80" style={{ borderColor: 'var(--border-color)' }}>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-(--text-primary)">
                            {editingGoal ? 'Edit Goal' : 'New Goal'}
                        </h3>
                        {selectedDays.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1">
                                <Repeat className="w-3 h-3 text-(--pos-info-text)" />
                                <p className="text-xs font-medium text-(--pos-info-text)">
                                    Recurring Template
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {/* Goal Text */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">Goal Statement</label>
                        <input
                            autoFocus
                            type="text"
                            value={formText}
                            onChange={(e) => setFormText(e.target.value)}
                            placeholder="e.g. Submit report by Friday urgent"
                            className="w-full px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500/50 transition-all text-lg font-medium bg-secondary border border-border placeholder:text-muted-foreground"
                            style={{ color: 'var(--text-primary)' }}
                        />
                        <p className="text-xs italic flex items-center gap-1.5 text-muted-foreground">
                            <span className="font-bold bg-blue-500/10 text-blue-500 px-1 rounded">TIP</span> Try "tomorrow" or "urgent" for smart parsing
                        </p>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">Description</label>
                        <textarea
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl h-24 resize-none focus:ring-2 focus:ring-blue-500/50 bg-secondary border border-border placeholder:text-muted-foreground"
                            style={{ color: 'var(--text-primary)' }}
                            placeholder="Add details, context, or sub-tasks..."
                        />
                    </div>

                    {/* Priority & Urgent */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">Priority</label>
                            <Select value={formPriority} onValueChange={(value: string) => setFormPriority(value as 'low' | 'medium' | 'high')}>
                                <SelectTrigger className="w-full h-11 bg-secondary border-border text-base shadow-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="material-glass">
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end h-full pt-6">
                            <label className={clsx(
                                "flex items-center space-x-3 cursor-pointer p-3 border rounded-xl w-full transition-all h-11 shadow-sm",
                                formUrgent ? "bg-red-500/5 border-red-200 dark:border-red-900" : "bg-secondary border-border hover:bg-secondary/80"
                            )}>
                                <input
                                    type="checkbox"
                                    checked={formUrgent}
                                    onChange={(e) => setFormUrgent(e.target.checked)}
                                    className="w-5 h-5 rounded focus:ring-red-500/50"
                                    style={{ accentColor: 'var(--pos-error-text)' }}
                                />
                                <span className="text-sm font-bold uppercase tracking-wide" style={{ color: formUrgent ? 'var(--pos-error-text)' : 'var(--text-secondary)' }}>Mark Urgent</span>
                            </label>
                        </div>
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">Due Date</label>
                            <DatePicker date={formDate} setDate={setFormDate} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">Time</label>
                            <input
                                type="time"
                                value={formTime}
                                onChange={(e) => setFormTime(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border shadow-sm"
                                style={{ color: 'var(--text-primary)' }}
                            />
                        </div>
                    </div>

                    {/* Problem ID */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary)">Problem ID / URL</label>
                        <input
                            type="text"
                            value={formProblemId}
                            onChange={(e) => setFormProblemId(e.target.value)}
                            placeholder="LeetCode/Codeforces URL or ID"
                            className="w-full px-4 py-2.5 rounded-xl font-mono text-sm bg-secondary border border-border shadow-sm placeholder:text-muted-foreground"
                            style={{ color: 'var(--text-primary)' }}
                        />
                    </div>

                    {/* Metrics */}
                    <div className="rounded-2xl p-6 space-y-5 bg-secondary/30 border border-border/50">
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary) mb-4 block">Quantitative Tracking</label>

                            <div className="space-y-2 mb-4">
                                {formMetrics.map((m, idx) => (
                                    <div key={idx} className="flex items-center gap-3 text-sm p-3 rounded-lg border bg-background border-border shadow-sm">
                                        <span className="font-bold text-(--pos-goal-link-text)">{m.label}:</span>
                                        <span className="font-mono text-(--text-primary)">{m.target} {m.unit}</span>
                                        <button onClick={() => removeMetric(idx)} className="ml-auto hover:text-red-500 text-muted-foreground transition-colors">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2">
                                <input
                                    placeholder="Label (e.g. Pushups)"
                                    className="w-1/3 px-3 py-2.5 rounded-lg text-sm bg-background border border-border shadow-sm placeholder:text-muted-foreground"
                                    style={{ color: 'var(--text-primary)' }}
                                    value={newMetric.label}
                                    onChange={(e) => setNewMetric({ ...newMetric, label: e.target.value })}
                                />
                                <input
                                    type="number"
                                    placeholder="Target"
                                    className="w-1/4 px-3 py-2.5 rounded-lg text-sm bg-background border border-border shadow-sm placeholder:text-muted-foreground"
                                    style={{ color: 'var(--text-primary)' }}
                                    value={newMetric.target}
                                    onChange={(e) => setNewMetric({ ...newMetric, target: e.target.value })}
                                />
                                <input
                                    placeholder="Unit"
                                    className="w-1/4 px-3 py-2.5 rounded-lg text-sm bg-background border border-border shadow-sm placeholder:text-muted-foreground"
                                    style={{ color: 'var(--text-primary)' }}
                                    value={newMetric.unit}
                                    onChange={(e) => setNewMetric({ ...newMetric, unit: e.target.value })}
                                    onKeyDown={(e) => e.key === 'Enter' && addMetric()}
                                />
                                <button onClick={addMetric} className="px-4 rounded-lg font-bold hover:bg-primary/90 bg-primary text-primary-foreground transition-colors shadow-sm">+</button>
                            </div>
                        </div>

                        {/* Recurring Pattern */}
                        <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-(--text-tertiary) mb-3 flex items-center gap-2">
                                <Repeat className="w-3 h-3" /> Repeat On
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {WEEKDAYS.map(day => (
                                    <button
                                        key={day}
                                        onClick={() => toggleDay(day)}
                                        className={clsx(
                                            "w-10 h-10 rounded-full text-xs font-bold transition-all border",
                                            selectedDays.includes(day)
                                                ? "bg-primary border-primary text-primary-foreground shadow-md scale-105"
                                                : "bg-background border-border text-muted-foreground hover:bg-muted"
                                        )}
                                    >
                                        {day.charAt(0)}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setSelectedDays(selectedDays.length === 7 ? [] : [...WEEKDAYS])}
                                    className="text-[10px] uppercase ml-3 hover:text-primary font-medium transition-colors"
                                    style={{ color: 'var(--text-tertiary)' }}
                                >
                                    {selectedDays.length === 7 ? 'Clear' : 'Select All'}
                                </button>
                            </div>
                            <p className="text-[10px] mt-3" style={{ color: 'var(--text-tertiary)' }}>
                                {selectedDays.length === 0
                                    ? "Creating a single, one-time goal."
                                    : `Recurring goal: Will explicitly generate instances every ${selectedDays.join(', ')}.`}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t flex justify-end gap-3 sticky bottom-0 backdrop-blur-xl bg-background/80" style={{ borderColor: 'var(--border-color)' }}>
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 font-medium rounded-xl hover:bg-secondary/80 transition-colors text-muted-foreground"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreateOrUpdateGoal}
                        disabled={!formText.trim()}
                        className="px-7 py-2.5 font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] bg-primary text-primary-foreground"
                    >
                        {editingGoal ? 'Save Changes' : (selectedDays.length > 0 ? 'Create Recurring Goal' : 'Create Goal')}
                    </button>
                </div>
            </div>
        </div>
    );
}
