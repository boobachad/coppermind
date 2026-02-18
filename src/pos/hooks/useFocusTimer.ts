import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { ActivityCategory } from '../lib/config';
import { formatLocalAsUTC } from '../lib/time';

interface FocusTimerState {
    mode: 'idle' | 'work' | 'break';
    timerType: 'pomodoro' | 'stopwatch';
    timeLeft: number; // For pomodoro (seconds)
    elapsedTime: number; // For stopwatch (seconds)
    totalDuration: number; // Initial duration for pomodoro
    isCompleted: boolean;
    isActive: boolean;
    startTime: Date | null;
    category: ActivityCategory | null;
    name: string;
    description: string;
}

// Simple oscillator beep for notification
const playNotificationSound = () => {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5); // Drop to A4

        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio playback failed", e);
    }
};

export function useFocusTimer() {
    const [state, setState] = useState<FocusTimerState>({
        mode: 'idle',
        timerType: 'pomodoro',
        timeLeft: 45 * 60, // Default 45m
        elapsedTime: 0,
        totalDuration: 45 * 60,
        isActive: false,
        isCompleted: false,
        startTime: null,
        category: null,
        name: '',
        description: '',
    });

    const intervalRef = useRef<number | null>(null);

    // Helper ref to access current action functions inside interval without triggering re-renders
    const actionsRef = useRef({
        saveActivity: async (s: FocusTimerState) => {
            // We need a version of saveActivity that takes the state snapshot
            await internalSaveActivity(s);
        },
        playSound: playNotificationSound
    });

    // WORK STATE SAVING (Defined here to be used in effect)
    const [savedWorkState, setSavedWorkState] = useState<{ timeLeft: number, totalDuration: number, timerType: 'pomodoro' | 'stopwatch', elapsedTime: number } | null>(null);

    // ─── Timer Logic ─────────────────────────────────────────────────────
    useEffect(() => {
        if (state.isActive) {
            intervalRef.current = window.setInterval(() => {
                setState(prev => {
                    if (prev.timerType === 'stopwatch') {
                        return { ...prev, elapsedTime: prev.elapsedTime + 1 };
                    } else {
                        // Pomodoro Logic
                        if (prev.timeLeft <= 1) { // Hit zero (or close enough)
                            // Trigger completion actions
                            actionsRef.current.playSound();
                            actionsRef.current.saveActivity(prev);

                            // Handle Break -> Work transition
                            if (prev.mode === 'break') {
                                if (savedWorkState) {
                                    // Auto-resume if we have a saved work state
                                    return {
                                        ...prev,
                                        mode: 'work',
                                        isActive: true,
                                        isCompleted: false,
                                        startTime: new Date(),
                                        // Restore Work State
                                        ...savedWorkState
                                    };
                                }
                                // If no saved work state, fall through to completion
                            }

                            return {
                                ...prev,
                                isActive: false,
                                isCompleted: true,
                                timeLeft: 0,
                                // Keep startTime for log accuracy if needed, 
                                // but logic uses "now" as end time anyway.
                            };
                        }
                        return { ...prev, timeLeft: prev.timeLeft - 1 };
                    }
                });
            }, 1000);
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [state.isActive, state.timerType, savedWorkState]);

    // ─── Actions ─────────────────────────────────────────────────────────

    const setDetails = (updates: Partial<Pick<FocusTimerState, 'name' | 'description' | 'category' | 'timerType' | 'totalDuration'>>) => {
        setState(prev => {
            let next = { ...prev, ...updates };
            // If updating duration while idle/pomodoro, update timeLeft too
            if (updates.totalDuration && prev.mode === 'idle' && prev.timerType === 'pomodoro') {
                next.timeLeft = updates.totalDuration;
            }
            return next;
        });
    };

    const start = () => {
        if (!state.category || !state.name.trim()) {
            toast.error("Category and Name are required");
            return;
        }
        setState(prev => ({
            ...prev,
            isActive: true,
            isCompleted: false,
            mode: prev.mode === 'idle' ? 'work' : prev.mode,
            startTime: prev.startTime || new Date(), // Keep existing start time if resuming
        }));
    };



    const stop = async () => {
        // Save Activity
        if (state.mode !== 'idle' && state.startTime && !state.isCompleted) {
            // If strictly creating a partial log, we do it here. 
            await internalSaveActivity(state);
        }
        reset();
    };

    const restartSession = () => {
        setState(prev => ({
            ...prev,
            isActive: true,
            isCompleted: false,
            timeLeft: prev.totalDuration,
            startTime: new Date(), // New session start
            // retain name, description, category, totalDuration
        }));
    };


    const takeBreakWithStateValues = async () => {
        // If coming from 'isCompleted', we don't save activity again (it auto-saved).
        // If coming from active work (interruption), we save.

        if (state.mode === 'work') {
            if (!state.isCompleted) {
                await internalSaveActivity(state);
            }
        }

        // Save Work State (Snapshot for resume)
        const nextTimeLeft = state.isCompleted
            ? state.totalDuration // If finished, resume with full duration (new session)
            : state.timeLeft;     // If paused mid-way, resume with remaining time

        setSavedWorkState({
            timeLeft: nextTimeLeft,
            totalDuration: state.totalDuration,
            timerType: state.timerType,
            elapsedTime: state.elapsedTime
        });


        setState(prev => ({
            ...prev,
            mode: 'break',
            isActive: true,
            isCompleted: false,
            timerType: 'pomodoro',
            timeLeft: 10 * 60,
            totalDuration: 10 * 60,
            startTime: new Date(),
        }));
    };

    const resumeWorkWithStateValues = async () => {
        if (state.mode !== 'break') return;

        // If completed, it auto-saved. If running, save now.
        if (!state.isCompleted) {
            await internalSaveActivity(state, true); // Save Break
        }

        setState(prev => ({
            ...prev,
            mode: 'work',
            isActive: true,
            isCompleted: false, // Reset completion
            startTime: new Date(),
            // Restore Work State
            ...(savedWorkState || {
                timerType: 'pomodoro',
                timeLeft: 25 * 60,
                totalDuration: 25 * 60,
                elapsedTime: 0
            })
        }));
    };

    const extendTime = () => {
        setState(prev => {
            if (prev.timerType === 'pomodoro') {
                return {
                    ...prev,
                    timeLeft: prev.timeLeft + (10 * 60),
                };
            }
            return prev;
        });
    };

    // Internal helper to avoid closure staleness in refs
    const internalSaveActivity = async (s: FocusTimerState, forceBreak = false) => {
        const endTime = new Date();
        const startTime = s.startTime || new Date(); // Fallback

        const isBreak = forceBreak || s.mode === 'break';

        const payload = {
            category: isBreak ? 'break' : s.category,
            title: isBreak ? 'Break' : s.name,
            description: isBreak ? 'Break Session' : s.description,
            start_time: formatLocalAsUTC(startTime),
            end_time: formatLocalAsUTC(endTime),
            is_productive: isBreak ? false : true,
            is_shadow: false,
            goal_id: null,
            // Derive local YYYY-MM-DD from startTime
            date: (() => {
                const offset = startTime.getTimezoneOffset() * 60000;
                const local = new Date(startTime.getTime() - offset);
                return local.toISOString().split('T')[0];
            })(),
        };

        try {
            await invoke('create_activity', {
                req: {
                    startTime: payload.start_time,
                    endTime: payload.end_time,
                    category: payload.category,
                    title: payload.title,
                    description: payload.description,
                    isProductive: payload.is_productive,
                    goalId: payload.goal_id,
                    date: payload.date
                }
            });
            toast.success(isBreak ? "Break logged" : "Activity logged");
        } catch (e) {
            toast.error("Failed to save activity: " + String(e));
        }
    };


    const reset = () => {
        setState(prev => ({
            ...prev,
            mode: 'idle',
            isActive: false,
            isCompleted: false,
            timeLeft: prev.totalDuration,
            elapsedTime: 0,
            startTime: null
        }));
        setSavedWorkState(null);
    };

    return {
        state,
        start,
        stop,
        takeBreak: takeBreakWithStateValues,
        resumeWork: resumeWorkWithStateValues,
        extendTime,
        setDetails,
        restartSession
    };
}
