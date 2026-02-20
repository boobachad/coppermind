// Pre-flight: A(toLocalDate for timezone conversion) D(no colors - CSS vars in component)
//             F(no mock) G(<600L) O(types match Rust camelCase)
import type * as d3 from 'd3';
import { formatMonthYear, getMonthShort } from '@/pos/lib/time';
import type {
    YearlyGraphData, ActivitySummary, GoalSummary, SubmissionSummary,
    KbGraphItem, RetroSummary, JournalSummary, NoteSummary,
} from '@/pos/lib/types';

// ─── Node kinds ──────────────────────────────────────────────────────────
export type NodeKind = 'year' | 'month' | 'date' | 'activity' | 'goal' |
                       'submission' | 'kb' | 'retro' | 'journal' | 'note';

// Base radius per kind — item nodes grow with connection count
export const BASE_RADIUS: Record<NodeKind, number> = {
    year:       32,
    month:      22,
    date:       15,
    activity:   9,
    goal:       9,
    submission: 9,
    kb:         9,
    retro:      9,
    journal:    9,
    note:       9,
};

// CSS var name for each kind (read via getComputedStyle in canvas component)
export const KIND_COLOR_VAR: Record<NodeKind, string> = {
    year:       '--color-accent-primary',
    month:      '--pos-heatmap-level-3',
    date:       '--text-tertiary',
    activity:   '--pos-activity-coding-codeforces',
    goal:       '--color-highlight-yellow',
    submission: '--pos-activity-coding-leetcode',
    kb:         '--pos-activity-book',
    retro:      '--pos-heatmap-level-4',
    journal:    '--color-accent-secondary',
    note:       '--text-secondary',
};

// ─── Graph node / link types ─────────────────────────────────────────────
export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    kind: NodeKind;
    /** Only present on item nodes; used by DateSummaryPanel */
    itemKind?: NodeKind;
    /** Raw source data for click handling */
    sourceId?: string;
}

export type LinkKind = 'hierarchy' | 'related' | 'blocks' | 'requires';

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    linkKind: LinkKind;
}

// ─── Hierarchy builder ───────────────────────────────────────────────────

interface DateItem {
    id: string;
    date: string;   // YYYY-MM-DD
    label: string;
    kind: NodeKind;
    sourceId: string;
}

function truncate(s: string, max = 22): string {
    return s.length > max ? s.substring(0, max) + '…' : s;
}

function activityLabel(a: ActivitySummary): string {
    return truncate(a.title || a.category);
}

function goalLabel(g: GoalSummary): string {
    return truncate(g.text);
}

function submissionLabel(s: SubmissionSummary): string {
    return truncate(`${s.platform}: ${s.problemTitle}`);
}

function kbLabel(k: KbGraphItem): string {
    return truncate(k.metadataTitle ?? k.content);
}

function retroLabel(r: RetroSummary): string {
    return truncate(`${r.periodType} retro`);
}

function journalLabel(j: JournalSummary): string {
    const preview = j.reflectionText.replace(/\n/g, ' ').substring(0, 20);
    return truncate(preview || 'Journal entry');
}

function noteLabel(n: NoteSummary): string {
    return truncate(n.title ?? 'Note');
}

/** Month key: "2026-02" */
function monthKey(date: string): string { return date.substring(0, 7); }

export interface HierarchyResult {
    nodes:          GraphNode[];
    hierarchyLinks: GraphLink[];
    kbLinks:        GraphLink[];
}

/**
 * Convert UTC timestamp to local date string (YYYY-MM-DD)
 * This ensures items appear on the correct date in the user's timezone
 */
function toLocalDate(utcTimestamp: string): string {
    const date = new Date(utcTimestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Build the full Obsidian-style hierarchy:
 *   Year → Month → Date → All item nodes
 * KB knowledge links (related / blocks / requires) are returned separately
 * so the simulation can apply different force strengths.
 * 
 * Timestamps are converted to local dates to ensure items appear on the
 * correct date in the user's timezone (not UTC).
 */
export function buildHierarchy(data: YearlyGraphData, year: number): HierarchyResult {
    const nodes: GraphNode[]          = [];
    const hierarchyLinks: GraphLink[] = [];
    const kbLinks: GraphLink[]        = [];

    // Flatten all items with their date (convert UTC timestamps to local dates)
    const allItems: DateItem[] = [
        ...data.activities.map(a => ({
            id: a.id, date: a.date, label: activityLabel(a),
            kind: 'activity' as NodeKind, sourceId: a.id,
        })),
        ...data.goals.map(g => ({
            id: g.id, date: toLocalDate(g.dueDate), label: goalLabel(g),
            kind: 'goal' as NodeKind, sourceId: g.id,
        })),
        ...data.submissions.map(s => ({
            id: s.id, date: toLocalDate(s.submittedTime), label: submissionLabel(s),
            kind: 'submission' as NodeKind, sourceId: s.id,
        })),
        ...data.kbItems.map(k => ({
            id: k.id, date: toLocalDate(k.createdAt), label: kbLabel(k),
            kind: 'kb' as NodeKind, sourceId: k.id,
        })),
        ...data.retrospectives.map(r => ({
            id: r.id, date: toLocalDate(r.periodStart), label: retroLabel(r),
            kind: 'retro' as NodeKind, sourceId: r.id,
        })),
        ...data.journalEntries.map(j => ({
            id: `journal-${j.id}`, date: j.date, label: journalLabel(j),
            kind: 'journal' as NodeKind, sourceId: j.id,
        })),
        ...data.notes.map(n => ({
            id: `note-${n.id}`, date: toLocalDate(new Date(n.createdAtMs).toISOString()), label: noteLabel(n),
            kind: 'note' as NodeKind, sourceId: n.id,
        })),
    ];

    // Group items: year → month → date
    const yearNode = `year-${year}`;
    nodes.push({ id: yearNode, label: String(year), kind: 'year' });

    const monthsSeen   = new Set<string>();
    const datesSeen    = new Set<string>();
    const nodeIdsSeen  = new Set<string>();

    for (const item of allItems) {
        const mk = monthKey(item.date);
        const monthId = `month-${mk}`;
        if (!monthsSeen.has(mk)) {
            monthsSeen.add(mk);
            const d = new Date(mk + '-01T12:00:00Z');
            nodes.push({ id: monthId, label: formatMonthYear(d), kind: 'month' });
            hierarchyLinks.push({ source: yearNode, target: monthId, linkKind: 'hierarchy' });
        }

        if (!datesSeen.has(item.date)) {
            datesSeen.add(item.date);
            const d = new Date(item.date + 'T12:00:00Z');
            const dateId = `date-${item.date}`;
            nodes.push({
                id: dateId,
                label: `${d.getDate()} ${getMonthShort(d)}`,
                kind: 'date',
            });
            hierarchyLinks.push({ source: monthId, target: dateId, linkKind: 'hierarchy' });
        }

        if (!nodeIdsSeen.has(item.id)) {
            nodeIdsSeen.add(item.id);
            nodes.push({ id: item.id, label: item.label, kind: item.kind, sourceId: item.sourceId });
            hierarchyLinks.push({
                source: `date-${item.date}`,
                target: item.id,
                linkKind: 'hierarchy',
            });
        }
    }

    // KB knowledge links (Obsidian "wiki-links" between KB nodes)
    for (const lk of data.kbLinks) {
        kbLinks.push({
            source: lk.sourceId,
            target: lk.targetId,
            linkKind: lk.linkType as LinkKind,
        });
    }

    return { nodes, hierarchyLinks, kbLinks };
}

/** Build a map: nodeId → Set<connected nodeIds> (for hover highlight) */
export function buildConnectionMap(
    nodes: GraphNode[],
    links: GraphLink[],
): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const n of nodes) {
        map.set(n.id, new Set());
    }
    for (const l of links) {
        const s = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
        const t = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
        map.get(s)?.add(t);
        map.get(t)?.add(s);
    }
    return map;
}

/** Radius for a node accounting for connection count (Obsidian sizing) */
export function nodeRadius(kind: NodeKind, connectionCount: number, selected: boolean): number {
    if (selected) return BASE_RADIUS[kind] + 6;
    const growth = Math.min(connectionCount * 1.2, 10);
    return BASE_RADIUS[kind] + growth;
}
