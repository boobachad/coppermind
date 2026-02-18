import { useState, useEffect } from 'react';
import { useFocusTimer } from '../hooks/useFocusTimer';
import { ACTIVITY_CATEGORIES, getActivityColor, ActivityCategory } from '../lib/config';
import {
    Play, Square, Coffee, Briefcase,
    Minimize2, Timer, Watch, Plus,
    AlignLeft, CheckCircle2, Circle
} from 'lucide-react';
import clsx from 'clsx';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// Helper for duration formatting (mm:ss or hh:mm:ss)
const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} `;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} `;
};

export function FocusWidget({ alwaysExpanded = false }: { alwaysExpanded?: boolean }) {
    const { state, start, stop, takeBreak, resumeWork, extendTime, setDetails, restartSession } = useFocusTimer();
    const [isExpandedState, setIsExpanded] = useState(false);
    const isExpanded = alwaysExpanded || isExpandedState;

    // Auto-collapse on work start (only relevant when not alwaysExpanded)
    useEffect(() => {
        if (!alwaysExpanded && state.isActive && state.mode === 'work') {
            setIsExpanded(false);
        }
    }, [alwaysExpanded, state.isActive, state.mode]);

    // Derived values
    const progress = state.timerType === 'pomodoro'
        ? ((state.totalDuration - state.timeLeft) / state.totalDuration) * 100
        : 100; // Stopwatch always full? or pulsing?

    // Title for collapsed view
    const collapsedTitle = state.mode === 'break' ? 'On Break' : (state.name || 'Focus Timer');

    // Main color based on category or mode
    const mainColor = state.mode === 'break'
        ? 'var(--pos-activity-break)'
        : (state.category ? getActivityColor(state.category) : 'var(--text-primary)');

    // ─── Collapsed View ──────────────────────────────────────────────────
    if (!isExpanded) {
        return (
            <div
                className={clsx(
                    "fixed bottom-6 right-6 z-50 flex items-center gap-3 p-2 rounded-full shadow-2xl transition-all duration-300 border border-(--glass-border)",
                    state.isActive ? "bg-(--glass-bg) backdrop-blur-md" : "bg-(--glass-bg) hover:bg-(--glass-bg-subtle)"
                )}
            >
                {/* Timer Display */}
                <button
                    onClick={() => setIsExpanded(true)}
                    className="flex flex-col items-start px-2 min-w-[80px]"
                >
                    <span className="text-xs font-medium text-muted-foreground truncate max-w-[100px]">
                        {collapsedTitle}
                    </span>
                    <span className="text-lg font-bold font-mono text-(--text-primary) tabular-nums leading-none">
                        {formatDuration(state.timerType === 'stopwatch' ? state.elapsedTime : state.timeLeft)}
                    </span>
                </button>

                {/* Quick Actions */}
                <div className="flex items-center gap-1 pr-1">
                    {state.isActive ? (
                        <button
                            onClick={stop}
                            className="p-2 rounded-full hover:bg-(--glass-bg-subtle)"
                            style={{ color: mainColor }}
                        >
                            <Square className="w-4 h-4 fill-current" />
                        </button>
                    ) : (
                        <button
                            onClick={state.mode === 'idle' && !state.name ? () => setIsExpanded(true) : start} // Expand if new
                            className="p-2 rounded-full hover:bg-(--glass-bg-subtle)"
                            style={{ color: mainColor }}
                        >
                            <Play className="w-4 h-4 fill-current" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={clsx(
            "z-50 material-glass flex flex-col gap-4 transition-all duration-300",
            alwaysExpanded
                ? "fixed inset-0 w-full h-full rounded-none p-6"
                : "fixed bottom-6 right-6 w-[320px] rounded-2xl p-5"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-muted-foreground">
                    {state.timerType === 'pomodoro' ? <Timer className="w-4 h-4" /> : <Watch className="w-4 h-4" />}
                    <span className="text-xs font-medium uppercase tracking-wider">
                        {state.mode === 'idle' ? 'Ready' : state.mode}
                    </span>
                </div>
                {!alwaysExpanded && (
                    <button
                        onClick={() => setIsExpanded(false)}
                        className="p-1 rounded-md hover:bg-(--glass-bg-subtle) text-muted-foreground"
                    >
                        <Minimize2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Inputs (Editable anytime) */}
            <div className={clsx("flex flex-col", alwaysExpanded ? "flex-1 gap-4" : "space-y-3")}>
                <input
                    type="text"
                    placeholder="What are you working on?"
                    value={state.name}
                    onChange={(e) => setDetails({ name: e.target.value })}
                    className="w-full bg-transparent text-xl font-bold text-(--text-primary) placeholder:text-(--text-tertiary) outline-none"
                // autoFocus={!state.name} // Maybe annoying?
                />

                <div className="relative">
                    <AlignLeft className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Add details (optional)"
                        value={state.description}
                        onChange={(e) => setDetails({ description: e.target.value })}
                        className="w-full bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground outline-none pl-6"
                    />
                </div>

                <div className="flex gap-2">
                    <Select
                        value={state.category || ''}
                        onValueChange={(val) => setDetails({ category: val as ActivityCategory })}
                    >
                        <SelectTrigger className="flex-1 h-8 bg-(--glass-bg-subtle) border-(--glass-border) text-(--text-primary) text-xs">
                            <SelectValue placeholder="Select Category" />
                        </SelectTrigger>
                        <SelectContent className="material-glass border-(--glass-border) max-h-48 overflow-y-auto">
                            {Object.values(ACTIVITY_CATEGORIES).map(cat => (
                                <SelectItem key={cat} value={cat} className="text-(--text-primary) focus:bg-(--glass-bg-subtle) focus:text-(--text-primary)">
                                    {cat}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <button
                        onClick={() => setDetails({
                            timerType: state.timerType === 'pomodoro' ? 'stopwatch' : 'pomodoro'
                        })}
                        className="px-2 py-1 rounded-md bg-(--glass-bg-subtle) border border-(--glass-border) text-xs text-muted-foreground hover:text-(--text-primary) transition-colors"
                        title="Toggle Timer Mode"
                    >
                        {state.timerType === 'pomodoro' ? 'Timer' : 'Stopwatch'}
                    </button>

                    <button
                        onClick={() => setDetails({ isProductive: !state.isProductive })}
                        className={clsx(
                            "p-1 rounded-md border transition-colors",
                            state.isProductive
                                ? "bg-green-500/10 border-green-500/20 text-green-500 hover:bg-green-500/20"
                                : "bg-zinc-500/10 border-zinc-500/20 text-zinc-500 hover:bg-zinc-500/20"
                        )}
                        title={state.isProductive ? "Marked as Productive" : "Marked as Unproductive"}
                    >
                        {state.isProductive ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>
                </div>

                {/* Large Timer Display */}
                <div className={clsx(
                    "flex items-center justify-center relative",
                    alwaysExpanded ? "flex-1 py-8" : "py-4"
                )}>
                    {/* Progress Ring */}
                    <svg className={clsx(
                        "absolute opacity-10 pointer-events-none",
                        alwaysExpanded ? "w-64 h-64" : "w-48 h-48"
                    )}>
                        <circle cx={alwaysExpanded ? "128" : "96"} cy={alwaysExpanded ? "128" : "96"} r={alwaysExpanded ? "120" : "90"} fill="none" stroke="currentColor" strokeWidth="2" />
                        {state.timerType === 'pomodoro' && (
                            <circle
                                cx={alwaysExpanded ? "128" : "96"} cy={alwaysExpanded ? "128" : "96"} r={alwaysExpanded ? "120" : "90"}
                                fill="none" stroke="currentColor" strokeWidth="4"
                                strokeDasharray={alwaysExpanded ? "754" : "565"}
                                strokeDashoffset={(alwaysExpanded ? 754 : 565) - ((alwaysExpanded ? 754 : 565) * progress / 100)}
                                className="text-white transition-all duration-1000 ease-linear"
                                transform={alwaysExpanded ? "rotate(-90 128 128)" : "rotate(-90 96 96)"}
                            />
                        )}
                    </svg>

                    <div className={clsx(
                        "font-mono font-bold text-(--text-primary) tracking-tighter tabular-nums z-10",
                        alwaysExpanded ? "text-8xl" : "text-6xl"
                    )}>
                        {formatDuration(state.timerType === 'stopwatch' ? state.elapsedTime : state.timeLeft)}
                    </div>
                </div>

                {/* Mode Specific Controls - Hide when running or completed */}
                {state.timerType === 'pomodoro' && state.mode === 'idle' && (
                    <div className="flex justify-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {[15, 25, 45, 60].map(m => (
                            <button
                                key={m}
                                onClick={() => setDetails({ totalDuration: m * 60 })}
                                className={clsx(
                                    "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                                    state.totalDuration === m * 60
                                        ? "bg-(--text-primary) text-(--bg-base) border-(--text-primary)"
                                        : "bg-transparent text-muted-foreground border-(--glass-border) hover:border-ring"
                                )}
                            >
                                {m}m
                            </button>
                        ))}
                    </div>
                )}

                {/* Main Controls */}
                <div className="grid grid-cols-2 gap-3 mt-2">
                    {state.isCompleted ? (
                        /* Completion State */
                        state.mode === 'break' ? (
                            <button
                                onClick={resumeWork}
                                className="col-span-2 py-3 rounded-xl bg-(--text-primary) text-(--bg-base) font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-colors"
                            >
                                <Briefcase className="w-5 h-5 fill-current" />
                                Resume Work
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={restartSession}
                                    className="py-3 rounded-xl bg-(--text-primary) text-(--bg-base) font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-colors"
                                >
                                    <Play className="w-5 h-5 fill-current" />
                                    Go Again
                                </button>
                                <button
                                    onClick={takeBreak}
                                    className="py-3 rounded-xl bg-(--pos-activity-break) text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-colors"
                                >
                                    <Coffee className="w-5 h-5" />
                                    Take Break
                                </button>
                            </>
                        )
                    ) : !state.isActive ? (
                        /* Idle State */
                        <button
                            onClick={start}
                            disabled={!state.name || !state.category}
                            className="col-span-2 py-3 rounded-xl bg-(--text-primary) text-(--bg-base) font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Play className="w-5 h-5 fill-current" />
                            Start Focus
                        </button>
                    ) : (
                        /* Running State */
                        <button
                            onClick={stop}
                            className="col-span-2 py-3 rounded-xl bg-(--pos-error-bg) text-(--pos-error-text) font-medium flex items-center justify-center gap-2 hover:bg-(--pos-error-border)/20 transition-colors border border-(--pos-error-border)/20"
                        >
                            <Square className="w-4 h-4 fill-current" />
                            Finish
                        </button>
                    )}
                </div>

                {/* Secondary Actions (Break / Extend) */}
                {state.isActive && state.mode !== 'idle' && (
                    <div className="flex gap-2 mt-1">
                        {/* +10m Button - Only for Pomodoro */}
                        {state.timerType === 'pomodoro' && (
                            <button
                                onClick={extendTime}
                                className="flex-1 py-2 rounded-lg bg-zinc-800/50 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center justify-center gap-1 transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                                10m
                            </button>
                        )}

                        {/* Break/Resume Toggle */}
                        {state.mode === 'work' ? (
                            <button
                                onClick={takeBreak}
                                className="flex-2 py-2 rounded-lg bg-[#3b82f6]/10 text-[#3b82f6] text-xs font-medium hover:bg-[#3b82f6]/20 border border-[#3b82f6]/20 flex items-center justify-center gap-2 transition-colors"
                            >
                                <Coffee className="w-3 h-3" />
                                Take Break (Log & Pause)
                            </button>
                        ) : (
                            <button
                                onClick={resumeWork}
                                className="flex-2 py-2 rounded-lg bg-[#10b981]/10 text-[#10b981] text-xs font-medium hover:bg-[#10b981]/20 border border-[#10b981]/20 flex items-center justify-center gap-2 transition-colors"
                            >
                                <Briefcase className="w-3 h-3" />
                                Resume Work
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
