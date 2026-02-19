// Pre-flight: A(no toLocaleDateString) D(all colors via cv()) F(no mock/TODO)
//             G(<600L) H(0 TS errors) O(YearlyGraphData matches Rust camelCase)
// Obsidian-like canvas graph: Year→Month→Date→AllData, hover-dim, type filter,
//   KB wiki-links, node sizing by connection count, single zoomRef, MutationObserver theme cache
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize2, Link2, Filter } from 'lucide-react';
import { toast } from 'sonner';
import type { YearlyGraphData, KnowledgeItem } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';
import {
    buildHierarchy, buildConnectionMap, nodeRadius,
    KIND_COLOR_VAR, BASE_RADIUS,
    type GraphNode, type GraphLink, type NodeKind,
} from './graphUtils';

const DRAG_THRESHOLD = 5;
const ALL_ITEM_KINDS: NodeKind[] = ['activity','goal','submission','kb','retro','journal','note'];

interface KnowledgeGraphProps {
    selectedItemId?: string | null;
    onNodeClick?:    (item: KnowledgeItem) => void;
    onDateClick?:    (date: string) => void;
    onDataLoaded?:   (data: YearlyGraphData) => void;
    year?:           number;
}

export function KnowledgeGraph({ selectedItemId, onNodeClick, onDateClick, onDataLoaded, year }: KnowledgeGraphProps) {
    const targetYear = year ?? new Date().getFullYear();
    const canvasRef  = useRef<HTMLCanvasElement>(null);

    const [loading,    setLoading]    = useState(true);
    const [isEmpty,    setIsEmpty]    = useState(false);
    const [zoomPct,    setZoomPct]    = useState(100);
    const [linkMode,   setLinkMode]   = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [hidden,     setHidden]     = useState<Set<NodeKind>>(new Set());

    // Refs — never trigger re-renders
    const transformRef  = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const zoomRef       = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
    const simRef        = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
    const centerRef     = useRef<d3.ForceCenter<GraphNode> | null>(null);
    const nodesRef      = useRef<GraphNode[]>([]);
    const linksRef      = useRef<GraphLink[]>([]);
    const connMapRef    = useRef<Map<string, Set<string>>>(new Map());
    const dragNodeRef   = useRef<GraphNode | null>(null);
    const dragDistRef   = useRef(0);
    const dragStartRef  = useRef<{ x: number; y: number } | null>(null);
    const hoveredRef    = useRef<string | null>(null);
    const selectedRef   = useRef<string | null | undefined>(selectedItemId);
    const linkModeRef   = useRef(false);
    const linkSrcRef    = useRef<GraphNode | null>(null);
    const hiddenRef     = useRef<Set<NodeKind>>(new Set());
    const colorCacheRef = useRef<Record<string, string>>({});
    const loadDataRef   = useRef<() => Promise<void>>(() => Promise.resolve());

    selectedRef.current = selectedItemId;
    linkModeRef.current = linkMode;
    hiddenRef.current   = hidden;

    // ── Cached CSS var reader ────────────────────────────────────────────
    const cv = useCallback((name: string): string => {
        if (!colorCacheRef.current[name]) {
            colorCacheRef.current[name] =
                getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        }
        return colorCacheRef.current[name];
    }, []);

    // ── Draw ─────────────────────────────────────────────────────────────
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(transformRef.current.x, transformRef.current.y);
        ctx.scale(transformRef.current.k, transformRef.current.k);

        const hov       = hoveredRef.current;
        const connSet   = hov ? (connMapRef.current.get(hov) ?? new Set<string>()) : null;
        const hiddenSet = hiddenRef.current;

        const isVisible = (n: GraphNode) => !hiddenSet.has(n.kind) || n.kind === 'year' || n.kind === 'month' || n.kind === 'date';
        const isDimmed  = (id: string)    => hov !== null && id !== hov && !connSet?.has(id);

        // Draw links
        ctx.lineWidth   = 1;
        ctx.globalAlpha = 0.45;
        for (const l of linksRef.current) {
            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            if (!isVisible(s) || !isVisible(t)) continue;
            const dimmed = isDimmed(s.id) && isDimmed(t.id);
            ctx.globalAlpha = dimmed ? 0.06 : (l.linkKind === 'hierarchy' ? 0.25 : 0.7);
            ctx.beginPath();
            ctx.moveTo(s.x ?? 0, s.y ?? 0);
            ctx.lineTo(t.x ?? 0, t.y ?? 0);
            ctx.strokeStyle =
                l.linkKind === 'blocks'   ? cv('--color-error') :
                l.linkKind === 'requires' ? cv('--color-accent-primary') :
                l.linkKind === 'related'  ? cv('--pos-heatmap-level-4') :
                cv('--glass-border');
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Draw nodes
        for (const n of nodesRef.current) {
            if (!isVisible(n)) continue;
            const sel   = n.id === selectedRef.current;
            const dimmed = isDimmed(n.id);
            const connCount = connMapRef.current.get(n.id)?.size ?? 0;
            const r     = nodeRadius(n.kind, connCount, sel);
            const nx    = n.x ?? 0;
            const ny    = n.y ?? 0;

            ctx.globalAlpha = dimmed ? 0.08 : 1;

            // Link-source ring
            if (n.id === linkSrcRef.current?.id) {
                ctx.beginPath();
                ctx.arc(nx, ny, r + 5, 0, 2 * Math.PI);
                ctx.strokeStyle = cv('--color-accent-primary');
                ctx.lineWidth   = 2;
                ctx.globalAlpha = dimmed ? 0.05 : 0.4;
                ctx.stroke();
                ctx.globalAlpha = dimmed ? 0.08 : 1;
            }

            // Node fill
            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, 2 * Math.PI);
            ctx.fillStyle   = cv(KIND_COLOR_VAR[n.kind]);
            ctx.fill();
            ctx.strokeStyle = sel ? cv('--color-accent-primary') : cv('--glass-border-highlight');
            ctx.lineWidth   = sel ? 2.5 : 1;
            ctx.stroke();

            // Label (only for non-item nodes or hovered/selected items)
            const showLabel = n.kind === 'year' || n.kind === 'month' || n.kind === 'date'
                || n.id === hoveredRef.current || sel;
            if (showLabel) {
                ctx.fillStyle    = cv('--text-secondary');
                ctx.font         = n.kind === 'year' ? 'bold 13px system-ui'
                                 : n.kind === 'month' ? '11px system-ui'
                                 : '9px system-ui';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                ctx.globalAlpha  = dimmed ? 0.08 : 1;
                ctx.fillText(n.label, nx, ny + r + 3);
            }
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }, [cv]);

    // ── Hit-test ─────────────────────────────────────────────────────────
    const nodeAt = useCallback((cx: number, cy: number): GraphNode | null => {
        const tx = (cx - transformRef.current.x) / transformRef.current.k;
        const ty = (cy - transformRef.current.y) / transformRef.current.k;
        for (const n of nodesRef.current) {
            if (hiddenRef.current.has(n.kind) && !['year','month','date'].includes(n.kind)) continue;
            const r  = nodeRadius(n.kind, connMapRef.current.get(n.id)?.size ?? 0, n.id === selectedRef.current);
            const dx = (n.x ?? 0) - tx;
            const dy = (n.y ?? 0) - ty;
            if (dx * dx + dy * dy <= r * r) return n;
        }
        return null;
    }, []);

    // ── Simulation ───────────────────────────────────────────────────────
    const initSim = useCallback((
        nodes: GraphNode[], hLinks: GraphLink[], kLinks: GraphLink[], w: number, h: number,
    ) => {
        simRef.current?.stop();
        const allLinks = [...hLinks, ...kLinks];
        linksRef.current = allLinks;
        connMapRef.current = buildConnectionMap(nodes, allLinks);

        const cf = d3.forceCenter<GraphNode>(w / 2, h / 2);
        centerRef.current = cf;

        simRef.current = d3.forceSimulation<GraphNode>(nodes)
            .force('h-link', d3.forceLink<GraphNode, GraphLink>(hLinks).id(d => d.id).distance(90).strength(0.7))
            .force('k-link', d3.forceLink<GraphNode, GraphLink>(kLinks).id(d => d.id).distance(160).strength(0.3))
            .force('charge', d3.forceManyBody<GraphNode>().strength(n =>
                n.kind === 'year' ? -600 : n.kind === 'month' ? -300 : n.kind === 'date' ? -150 : -80))
            .force('center',  cf)
            .force('collide', d3.forceCollide<GraphNode>(n =>
                BASE_RADIUS[n.kind] + 6))
            .on('tick', draw)
            .on('end',  draw);
    }, [draw]);

    // ── Load data ────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await invoke<YearlyGraphData>('get_yearly_graph_data', { year: targetYear });
            onDataLoaded?.(data);
            const total = data.activities.length + data.goals.length + data.submissions.length
                + data.kbItems.length + data.retrospectives.length
                + data.journalEntries.length + data.notes.length;
            setIsEmpty(total === 0);
            if (total === 0) return;

            const canvas = canvasRef.current;
            const w = canvas?.width  ?? 900;
            const h = canvas?.height ?? 600;

            const { nodes, hierarchyLinks, kbLinks } = buildHierarchy(data, targetYear);
            nodesRef.current = nodes;
            initSim(nodes, hierarchyLinks, kbLinks, w, h);
        } catch (err) {
            toast.error('Failed to load graph', { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [targetYear, initSim]);

    loadDataRef.current = loadData;

    // ── Zoom (zoom.filter prevents zoom activating over nodes) ───────────
    const setupZoom = useCallback((hitTest: (x: number, y: number) => GraphNode | null) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .filter(event => {
                if (event.type === 'wheel') return true;
                const e = event as PointerEvent;
                const r = canvas.getBoundingClientRect();
                return hitTest(e.clientX - r.left, e.clientY - r.top) === null;
            })
            .scaleExtent([0.05, 6])
            .on('zoom', (ev: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                transformRef.current = ev.transform;
                setZoomPct(Math.round(ev.transform.k * 100));
                draw();
            });
        d3.select(canvas).call(zoom);
        zoomRef.current = zoom;
    }, [draw]);

    // ── Pointer events ───────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onDown = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const hit  = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (!hit) return;
            dragDistRef.current  = 0;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            canvas.style.cursor  = 'grabbing';
            simRef.current?.alphaTarget(0.3).restart();
            hit.fx = hit.x;
            hit.fy = hit.y;
            dragNodeRef.current = hit;
            canvas.setPointerCapture(e.pointerId);
        };

        const onMove = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const n = dragNodeRef.current;
            if (n) {
                if (dragStartRef.current) {
                    const dx = e.clientX - dragStartRef.current.x;
                    const dy = e.clientY - dragStartRef.current.y;
                    dragDistRef.current = Math.sqrt(dx * dx + dy * dy);
                }
                n.fx = (e.clientX - rect.left  - transformRef.current.x) / transformRef.current.k;
                n.fy = (e.clientY - rect.top   - transformRef.current.y) / transformRef.current.k;
            } else {
                // Hover highlight
                const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
                const newHov = hit?.id ?? null;
                if (newHov !== hoveredRef.current) {
                    hoveredRef.current = newHov;
                    canvas.style.cursor = hit ? 'pointer' : (linkModeRef.current ? 'crosshair' : 'grab');
                    draw();
                }
            }
        };

        const onUp = (e: PointerEvent) => {
            const n = dragNodeRef.current;
            if (!n) return;
            simRef.current?.alphaTarget(0);
            n.fx = null;
            n.fy = null;
            dragNodeRef.current  = null;
            dragStartRef.current = null;
            canvas.style.cursor  = linkModeRef.current ? 'crosshair' : 'grab';
            canvas.releasePointerCapture(e.pointerId);
        };

        const onClick = async (e: MouseEvent) => {
            if (dragDistRef.current > DRAG_THRESHOLD) return;
            const rect = canvas.getBoundingClientRect();
            const hit  = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (!hit) return;

            // Date node → DateSummaryPanel
            if (hit.kind === 'date') {
                const dateStr = hit.id.replace('date-', '');
                if (onDateClick) onDateClick(dateStr);
                return;
            }

            // Link mode: connect two KB nodes
            if (linkModeRef.current && hit.kind === 'kb') {
                if (!linkSrcRef.current) { linkSrcRef.current = hit; draw(); return; }
                if (linkSrcRef.current.id === hit.id) { linkSrcRef.current = null; draw(); return; }
                try {
                    await invoke('create_knowledge_link', {
                        sourceId: linkSrcRef.current.id, targetId: hit.id, linkType: 'related',
                    });
                    toast.success('Link created');
                    linkSrcRef.current = null;
                    await loadDataRef.current();
                } catch (err) {
                    toast.error('Failed', { description: String(err) });
                    linkSrcRef.current = null; draw();
                }
                return;
            }

            // KB item → onNodeClick (opens KB detail panel)
            if (hit.kind === 'kb' && onNodeClick && hit.sourceId) {
                // We don't have the full KnowledgeItem here — signal via sourceId
                // KnowledgePage handles the lookup
                onNodeClick({ id: hit.sourceId } as KnowledgeItem);
            }
        };

        const onLeave = () => { hoveredRef.current = null; draw(); };

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup',   onUp);
        canvas.addEventListener('click',       onClick);
        canvas.addEventListener('mouseleave',  onLeave);
        return () => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup',   onUp);
            canvas.removeEventListener('click',       onClick);
            canvas.removeEventListener('mouseleave',  onLeave);
        };
    }, [nodeAt, onNodeClick, onDateClick, draw]);

    // ── Resize observer ──────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                canvas.width  = width;
                canvas.height = height;
                if (centerRef.current) {
                    centerRef.current.x(width / 2).y(height / 2);
                    simRef.current?.alpha(0.1).restart();
                }
                draw();
            }
        });
        ro.observe(canvas.parentElement ?? canvas);
        return () => ro.disconnect();
    }, [draw]);

    // ── Theme change → invalidate color cache ────────────────────────────
    useEffect(() => {
        const mo = new MutationObserver(() => { colorCacheRef.current = {}; draw(); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => mo.disconnect();
    }, [draw]);

    // ── Initial setup ────────────────────────────────────────────────────
    useEffect(() => {
        setupZoom(nodeAt);
        loadData();
        return () => { simRef.current?.stop(); };
    }, [setupZoom, nodeAt, loadData]);

    useEffect(() => { draw(); }, [selectedItemId, draw]);

    // ── Link mode cursor + clear ─────────────────────────────────────────
    useEffect(() => {
        if (canvasRef.current) canvasRef.current.style.cursor = linkMode ? 'crosshair' : 'grab';
        if (!linkMode) { linkSrcRef.current = null; draw(); }
    }, [linkMode, draw]);

    // ── Zoom helpers ─────────────────────────────────────────────────────
    const zoomBy = (f: number) => {
        const c = canvasRef.current;
        if (c && zoomRef.current) d3.select(c).transition().duration(200).call(zoomRef.current.scaleBy, f);
    };
    const zoomReset = () => {
        const c = canvasRef.current;
        if (c && zoomRef.current) d3.select(c).transition().duration(250).call(zoomRef.current.transform, d3.zoomIdentity);
    };
    const toggleKind = (k: NodeKind) => setHidden(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    return (
        <div className="relative h-full w-full">
            {/* Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius)', padding: '0.5rem', backdropFilter: 'blur(12px)' }}>
                <Button size="sm" onClick={() => zoomBy(1.3)} title="Zoom In"
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <ZoomIn className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => zoomBy(0.77)} title="Zoom Out"
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <ZoomOut className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={zoomReset} title="Reset"
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <Maximize2 className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => setLinkMode(m => !m)} title="Link Mode (KB nodes)"
                    style={{ background: linkMode ? 'var(--color-accent-primary)' : 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: linkMode ? 'var(--color-pure-white)' : 'var(--text-secondary)' }}>
                    <Link2 className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => setShowFilter(f => !f)} title="Filter types"
                    style={{ background: showFilter ? 'var(--glass-border)' : 'transparent',
                        border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <Filter className="w-4 h-4" />
                </Button>
                <div className="text-xs text-center pt-1 border-t"
                    style={{ color: 'var(--text-tertiary)', borderColor: 'var(--glass-border)' }}>
                    {zoomPct}%
                </div>
            </div>

            {/* Type filter panel */}
            {showFilter && (
                <div className="absolute top-4 right-16 z-10 flex flex-col gap-1 p-3"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius)', backdropFilter: 'blur(12px)', minWidth: '130px' }}>
                    <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                        Filter nodes
                    </div>
                    {ALL_ITEM_KINDS.map(k => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer"
                            style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                            <input type="checkbox" checked={!hidden.has(k)}
                                onChange={() => { toggleKind(k); draw(); }}
                                style={{ accentColor: 'var(--color-accent-primary)' }} />
                            {k.charAt(0).toUpperCase() + k.slice(1)}
                        </label>
                    ))}
                </div>
            )}

            {/* Link mode hint */}
            {linkMode && (
                <div className="absolute top-4 left-4 z-10 text-xs px-3 py-2 rounded"
                    style={{ background: 'var(--color-accent-primary)', color: 'var(--color-pure-white)' }}>
                    {linkSrcRef.current ? 'Click target KB node to link' : 'Click source KB node'}
                </div>
            )}

            {loading && (
                <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Loading graph…</span>
                </div>
            )}

            {!loading && isEmpty && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                    style={{ color: 'var(--text-tertiary)' }}>
                    <span className="text-4xl">⬡</span>
                    <span className="text-sm">No data for {targetYear} yet.</span>
                    <span className="text-xs">Activities, goals, notes and KB items will appear here.</span>
                </div>
            )}

            <canvas ref={canvasRef} className="w-full h-full"
                style={{ background: 'var(--bg-base)', cursor: 'grab' }} />
        </div>
    );
}
