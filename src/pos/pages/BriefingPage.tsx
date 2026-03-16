import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Loader } from '../../components/Loader';
import { MonthSelector } from '../components/MonthSelector';
import { DailyBriefingView } from '../components/briefing/DailyBriefingView';
import { MonthlyBriefingView } from '../components/briefing/Monthly/MonthlyBriefingView';
import { YearlyBriefingView } from '../components/briefing/Yearly/YearlyBriefingView';
import { getLocalDateString } from '../lib/time';
import type { BriefingMode, MonthlyBriefingResponse, YearlyBriefingResponse } from '../lib/types';

const MODE_KEY = 'briefing-mode';

function getInitialMode(): BriefingMode {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'daily' || stored === 'monthly' || stored === 'yearly') return stored;
    return 'daily';
}

function getInitialDate(): string {
    return getLocalDateString();
}

function getInitialMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getInitialYear(): string {
    return `${new Date().getFullYear()}`;
}

export function BriefingPage() {
    const [mode, setMode] = useState<BriefingMode>(getInitialMode);

    // Selector values per mode
    const [selectedDate, setSelectedDate] = useState(getInitialDate);
    const [selectedMonth, setSelectedMonth] = useState(getInitialMonth);
    const [selectedYear, setSelectedYear] = useState(getInitialYear);

    // Data state
    const [monthlyData, setMonthlyData] = useState<MonthlyBriefingResponse | null>(null);
    const [yearlyData, setYearlyData] = useState<YearlyBriefingResponse | null>(null);
    const [loading, setLoading] = useState(false);

    // Persist mode to localStorage
    useEffect(() => {
        localStorage.setItem(MODE_KEY, mode);
    }, [mode]);

    const loadMonthly = useCallback(async () => {
        setLoading(true);
        try {
            const [year, month] = selectedMonth.split('-').map(Number);
            const data = await invoke<MonthlyBriefingResponse>('get_monthly_briefing', { year, month });
            setMonthlyData(data);
        } catch (err) {
            toast.error('Failed to load monthly briefing', { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [selectedMonth]);

    const loadYearly = useCallback(async () => {
        setLoading(true);
        try {
            const year = Number(selectedYear);
            const data = await invoke<YearlyBriefingResponse>('get_yearly_briefing', { year });
            setYearlyData(data);
        } catch (err) {
            toast.error('Failed to load yearly briefing', { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [selectedYear]);

    // Fetch data when mode or selector changes
    useEffect(() => {
        if (mode === 'monthly') loadMonthly();
    }, [mode, loadMonthly]);

    useEffect(() => {
        if (mode === 'yearly') loadYearly();
    }, [mode, loadYearly]);

    const selectorMode = mode === 'daily' ? 'day' : mode === 'monthly' ? 'month' : 'year';
    const selectorValue = mode === 'daily' ? selectedDate : mode === 'monthly' ? selectedMonth : selectedYear;
    const selectorOnChange = mode === 'daily' ? setSelectedDate : mode === 'monthly' ? setSelectedMonth : setSelectedYear;

    return (
        <div className="h-screen overflow-y-auto p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="max-w-[1400px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Briefing</h1>
                    {/* Mode pill switcher */}
                    <div
                        className="flex items-center gap-1 p-1 rounded-lg"
                        style={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}
                    >
                        {(['daily', 'monthly', 'yearly'] as BriefingMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className="px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors"
                                style={{
                                    backgroundColor: mode === m ? 'var(--bg-secondary)' : 'transparent',
                                    color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    border: mode === m ? '1px solid var(--border-color)' : '1px solid transparent',
                                }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date/month/year selector */}
                <MonthSelector
                    mode={selectorMode}
                    value={selectorValue}
                    onChange={selectorOnChange}
                    showDayName={mode === 'daily'}
                />

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader />
                    </div>
                ) : (
                    <>
                        {mode === 'daily' && (
                            <DailyBriefingView
                                selectedDate={selectedDate}
                            />
                        )}
                        {mode === 'monthly' && (
                            monthlyData
                                ? <MonthlyBriefingView data={monthlyData} />
                                : <p className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>No data for this month</p>
                        )}
                        {mode === 'yearly' && (
                            yearlyData
                                ? <YearlyBriefingView data={yearlyData} />
                                : <p className="text-center py-12 text-sm" style={{ color: 'var(--text-tertiary)' }}>No data for this year</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
