// Pre-flight: A(formatDateDDMMYYYY/formatTime/getMonthShort used for display)
//             D(no hardcoded colors) F(no mock/TODO) G(<600L) O(types match Rust camelCase)
import React from 'react';
import { X, Activity, Target, Code2, BookOpen, RefreshCw, BookMarked, FileText } from 'lucide-react';
import { formatDateDDMMYYYY, formatTime, getMonthShort } from '@/pos/lib/time';
import type {
    YearlyGraphData, ActivitySummary, GoalSummary, SubmissionSummary,
    KbGraphItem, RetroSummary, JournalSummary, NoteSummary,
} from '@/pos/lib/types';

interface DateSummaryPanelProps {
    date:       string | null;   // YYYY-MM-DD or null to close
    graphData:  YearlyGraphData | null;
    onClose:    () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function parseDateLabel(date: string): string {
    // Pre-flight A: use date utilities, not toLocaleDateString
    const d = new Date(date + 'T12:00:00Z');
    return `${d.getDate()} ${getMonthShort(d)} ${d.getFullYear()}`;
}

function formatIso(iso: string): string {
    return formatTime(new Date(iso));
}

// ─── Section components ────────────────────────────────────────────────

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
    if (count === 0) return null;
    return (
        <div className="flex items-center gap-2 mb-2 mt-4"
            style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>
            {icon}
            <span>{label}</span>
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>({count})</span>
        </div>
    );
}

function ActivityRow({ a }: { a: ActivitySummary }) {
    return (
        <div className="flex items-start gap-2 py-1.5 border-b"
            style={{ borderColor: 'var(--glass-border)', fontSize: '12px' }}>
            <div className="flex-1" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
            <div style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                {formatIso(a.startTime)}–{formatIso(a.endTime)}
            </div>
            {a.isProductive && (
                <span style={{ color: 'var(--pos-heatmap-level-4)', fontSize: '10px' }}>⚡</span>
            )}
        </div>
    );
}

function GoalRow({ g }: { g: GoalSummary }) {
    return (
        <div className="flex items-center gap-2 py-1.5 border-b"
            style={{ borderColor: 'var(--glass-border)', fontSize: '12px' }}>
            <span style={{ color: g.completed ? 'var(--pos-heatmap-level-3)' : 'var(--text-tertiary)' }}>
                {g.completed ? '✓' : '○'}
            </span>
            <div className="flex-1" style={{
                color: 'var(--text-primary)',
                textDecoration: g.completed ? 'line-through' : 'none',
            }}>{g.text}</div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', textTransform: 'uppercase' }}>
                {g.priority}
            </span>
        </div>
    );
}

function SubmissionRow({ s }: { s: SubmissionSummary }) {
    const accepted = s.verdict === 'Accepted' || s.verdict === 'OK';
    return (
        <div className="flex items-center gap-2 py-1.5 border-b"
            style={{ borderColor: 'var(--glass-border)', fontSize: '12px' }}>
            <span style={{ color: accepted ? 'var(--pos-heatmap-level-3)' : 'var(--color-error)' }}>
                {accepted ? '✓' : '✗'}
            </span>
            <div className="flex-1" style={{ color: 'var(--text-primary)' }}>{s.problemTitle}</div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                {s.platform}{s.difficulty ? ` · ${s.difficulty}` : ''}
            </span>
        </div>
    );
}

function KbRow({ k }: { k: KbGraphItem }) {
    return (
        <div className="flex items-center gap-2 py-1.5 border-b"
            style={{ borderColor: 'var(--glass-border)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px', textTransform: 'uppercase' }}>
                {k.itemType}
            </span>
            <div className="flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                {k.metadataTitle ?? k.content.substring(0, 60)}
            </div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>{k.status}</span>
        </div>
    );
}

function RetroRow({ r }: { r: RetroSummary }) {
    return (
        <div className="py-1.5 border-b" style={{ borderColor: 'var(--glass-border)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {r.periodType} retrospective
            </span>
            <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                {formatDateDDMMYYYY(new Date(r.periodStart))} – {formatDateDDMMYYYY(new Date(r.periodEnd))}
            </span>
        </div>
    );
}

function JournalRow({ j }: { j: JournalSummary }) {
    const preview = j.reflectionText.replace(/\n/g, ' ').substring(0, 120);
    return (
        <div className="py-1.5 border-b" style={{ borderColor: 'var(--glass-border)', fontSize: '12px',
            color: 'var(--text-secondary)' }}>
            {preview || <span style={{ color: 'var(--text-tertiary)' }}>No reflection text</span>}
        </div>
    );
}

function NoteRow({ n }: { n: NoteSummary }) {
    return (
        <div className="py-1.5 border-b" style={{ borderColor: 'var(--glass-border)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-primary)' }}>{n.title ?? 'Untitled note'}</span>
            <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                {formatTime(new Date(n.createdAtMs))}
            </span>
        </div>
    );
}

// ─── Main Panel ──────────────────────────────────────────────────────────

export function DateSummaryPanel({ date, graphData, onClose }: DateSummaryPanelProps) {
    if (!date || !graphData) return null;

    // Filter all data sources to the clicked date
    const activities  = graphData.activities.filter(a => a.date === date);
    const goals       = graphData.goals.filter(g => g.date === date);
    const submissions = graphData.submissions.filter(s => s.date === date);
    const kbItems     = graphData.kbItems.filter(k => k.date === date);
    const retros      = graphData.retrospectives.filter(r => r.date === date);
    const journals    = graphData.journalEntries.filter(j => j.date === date);
    const notes       = graphData.notes.filter(n => n.date === date);

    const total = activities.length + goals.length + submissions.length
        + kbItems.length + retros.length + journals.length + notes.length;

    return (
        <div className="absolute top-0 left-0 h-full z-20 overflow-y-auto"
            style={{
                width: '320px',
                background: 'var(--glass-bg)',
                borderRight: '1px solid var(--glass-border)',
                backdropFilter: 'blur(16px)',
            }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 sticky top-0"
                style={{ background: 'var(--glass-bg)', borderBottom: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(16px)' }}>
                <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
                        {parseDateLabel(date)}
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        {total} items captured
                    </div>
                </div>
                <button onClick={onClose} style={{ color: 'var(--text-tertiary)', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '4px' }}>
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="px-4 pb-6">
                {total === 0 && (
                    <div className="py-8 text-center" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                        No data captured on this date
                    </div>
                )}

                <SectionHeader icon={<Activity className="w-3 h-3" />} label="Activities" count={activities.length} />
                {activities.map(a => <ActivityRow key={a.id} a={a} />)}

                <SectionHeader icon={<Target className="w-3 h-3" />} label="Goals" count={goals.length} />
                {goals.map(g => <GoalRow key={g.id} g={g} />)}

                <SectionHeader icon={<Code2 className="w-3 h-3" />} label="Submissions" count={submissions.length} />
                {submissions.map(s => <SubmissionRow key={s.id} s={s} />)}

                <SectionHeader icon={<BookOpen className="w-3 h-3" />} label="Knowledge Items" count={kbItems.length} />
                {kbItems.map(k => <KbRow key={k.id} k={k} />)}

                <SectionHeader icon={<RefreshCw className="w-3 h-3" />} label="Retrospectives" count={retros.length} />
                {retros.map(r => <RetroRow key={r.id} r={r} />)}

                <SectionHeader icon={<BookMarked className="w-3 h-3" />} label="Journal" count={journals.length} />
                {journals.map(j => <JournalRow key={j.id} j={j} />)}

                <SectionHeader icon={<FileText className="w-3 h-3" />} label="Notes" count={notes.length} />
                {notes.map(n => <NoteRow key={n.id} n={n} />)}
            </div>
        </div>
    );
}
