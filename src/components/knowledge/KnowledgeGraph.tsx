// Knowledge Graph — canvas D3 force simulation
// Fixes: physics (dynamic collide radius, forceX/Y hierarchy separation, better charge),
//        visuals (curved KB links, link weights, node glow, hover tooltip),
//        bugs (CSS vars, null dates, link creation API, drag-end alphaTarget)
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize2, Link2, Filter, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import type { YearlyGraphData, KnowledgeItem } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';
import {
    buildHierarchy, buildConnectionMap, nodeRadius,
    KIND_COLOR_VAR,
    type GraphNode, type GraphLink, type NodeKind,
} from './graphUtils';

const DRAG_THRESHOLD = 5;
const ALL_ITEM_KINDS: NodeKind[] = ['activity','goal','submission','kb','retro','journal','note'];

interface TooltipState { x: number; y: number; label: string; kind: NodeKind; content?: string }

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
    const [tooltip,    setTooltip]    = useState<TooltipState | null>(null);

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
    // Store kb content for tooltip
    const kbContentRef  = useRef<Map<string, string>>(new Map());

    selectedRef.current = selectedItemId;
    linkModeRef.current = linkMode;
    hiddenRef.current   = hidden;

    // ── Cached CSS var reader ────────────────────────────────────────────
    const cv = useCallback((name: string): string => {
        if (!colorCacheRef.current[name]) {
            colorCacheRef.current[name] =
                getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
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

        const isVisible = (n: GraphNode) =>
            !hiddenSet.has(n.kind) || n.kind === 'year' || n.kind === 'month' || n.kind === 'date';
        const isDimmed  = (id: string) =>
            hov !== null && id !== hov && !connSet?.has(id);

        // ── Draw links ───────────────────────────────────────────────────
        for (const l of linksRef.current) {
            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            if (!isVisible(s) || !isVisible(t)) continue;

            const sx = s.x ?? 0, sy = s.y ?? 0;
            const tx = t.x ?? 0, ty = t.y ?? 0;
            const dimmed = isDimmed(s.id) && isDimmed(t.id);

            ctx.beginPath();

            if (l.linkKind === 'hierarchy') {
                // Straight thin lines for hierarchy
                ctx.globalAlpha = dimmed ? 0.04 : 0.2;
                ctx.lineWidth   = 0.5;
                ctx.strokeStyle = cv('--glass-border');
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
            } else {
                // Curved lines for KB semantic links — quadratic bezier with perpendicular offset
                const mx = (sx + tx) / 2;
                const my = (sy + ty) / 2;
                const dx = tx - sx, dy = ty - sy;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                // Perpendicular offset proportional to link length (max 40px)
                const offset = Math.min(len * 0.25, 40);
                const cpx = mx - (dy / len) * offset;
                const cpy = my + (dx / len) * offset;

                ctx.globalAlpha = dimmed ? 0.05 : 0.75;
                ctx.lineWidth   = l.linkKind === 'blocks' ? 2 : l.linkKind === 'requires' ? 1.8 : 1.5;
                ctx.strokeStyle =
                    l.linkKind === 'blocks'   ? cv('--color-error') :
                    l.linkKind === 'requires' ? cv('--color-accent-primary') :
                    cv('--pos-heatmap-level-4');
                ctx.moveTo(sx, sy);
                ctx.quadraticCurveTo(cpx, cpy, tx, ty);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // ── Draw nodes ───────────────────────────────────────────────────
        for (const n of nodesRef.current) {
            if (!isVisible(n)) continue;
            const sel    = n.id === selectedRef.current;
            const hovered = n.id === hoveredRef.current;
            const dimmed = isDimmed(n.id);
            const connCount = connMapRef.current.get(n.id)?.size ?? 0;
            const r     = nodeRadius(n.kind, connCount, sel);
            const nx    = n.x ?? 0;
            const ny    = n.y ?? 0;

            ctx.globalAlpha = dimmed ? 0.07 : 1;

            // Glow for selected node
            if (sel) {
                ctx.save();
                ctx.shadowColor = cv(KIND_COLOR_VAR[n.kind]);
                ctx.shadowBlur  = 18;
                ctx.beginPath();
                ctx.arc(nx, ny, r + 2, 0, 2 * Math.PI);
                ctx.fillStyle = cv(KIND_COLOR_VAR[n.kind]);
                ctx.fill();
                ctx.restore();
                ctx.globalAlpha = dimmed ? 0.07 : 1;
            }

            // Pulse ring for hovered node
            if (hovered && !sel) {
                ctx.beginPath();
                ctx.arc(nx, ny, r + 4, 0, 2 * Math.PI);
                ctx.strokeStyle = cv(KIND_COLOR_VAR[n.kind]);
                ctx.lineWidth   = 1.5;
                ctx.globalAlpha = 0.4;
                ctx.stroke();
                ctx.globalAlpha = dimmed ? 0.07 : 1;
            }

            // Link-source ring
            if (n.id === linkSrcRef.current?.id) {
                ctx.beginPath();
                ctx.arc(nx, ny, r + 5, 0, 2 * Math.PI);
                ctx.strokeStyle = cv('--color-accent-primary');
                ctx.lineWidth   = 2;
                ctx.globalAlpha = dimmed ? 0.05 : 0.5;
                ctx.stroke();
                ctx.globalAlpha = dimmed ? 0.07 : 1;
            }

            // Node fill
            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, 2 * Math.PI);
            ctx.fillStyle   = cv(KIND_COLOR_VAR[n.kind]);
            ctx.fill();
            ctx.strokeStyle = sel ? cv('--color-accent-primary') : cv('--glass-border-highlight');
            ctx.lineWidth   = sel ? 2.5 : 0.8;
            ctx.stroke();

            // Label for structural nodes + hovered/selected items
            const showLabel = n.kind === 'year' || n.kind === 'month' || n.kind === 'date'
                || hovered || sel;
            if (showLabel) {
                ctx.fillStyle    = cv(n.kind === 'year' || n.kind === 'month' ? '--text-primary' : '--text-secondary');
                ctx.font         = n.kind === 'year'  ? 'bold 13px system-ui'
                                 : n.kind === 'month' ? 'bold 10px system-ui'
                                 : n.kind === 'date'  ? '9px system-ui'
                                 : '8px system-ui';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                ctx.globalAlpha  = dimmed ? 0.07 : 1;
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
        nodes: GraphNode[], hLinks: GraphLink[], kLinks: GraphLink[],
        parentMap: Map<string, string>, w: number, h: number,
    ) => {
        simRef.current?.stop();
        const allLinks = [...hLinks, ...kLinks];
        linksRef.current = allLinks;
        connMapRef.current = buildConnectionMap(nodes, allLinks);

        const cf = d3.forceCenter<GraphNode>(w / 2, h / 2);
        centerRef.current = cf;

        // Dynamic collide radius — uses actual rendered radius to prevent overlap
        const collideRadius = (n: GraphNode) =>
            nodeRadius(n.kind, connMapRef.current.get(n.id)?.size ?? 0, false) + 5;

        // Build a nodeId → GraphNode lookup for the orbital force
        const nodeById = new Map<string, GraphNode>();
        for (const n of nodes) nodeById.set(n.id, n);

        // Orbital radii per child kind
        const ORBIT_RADIUS: Partial<Record<NodeKind, number>> = {
            month: 200,   // months orbit year at 200px
            date:  120,   // dates orbit their month at 120px
        };
        const ITEM_ORBIT = 70; // item nodes orbit their date at 70px

        // Custom per-parent orbital force:
        // Each tick, pull every node toward a point on a circle around its parent.
        // This creates the "nodes around dates, dates around months, months around year" layout.
        const orbitalForce = (alpha: number) => {
            for (const n of nodes) {
                const parentId = parentMap.get(n.id);
                if (!parentId || parentId === n.id) continue; // year has no parent

                const parent = nodeById.get(parentId);
                if (!parent || parent.x == null || parent.y == null) continue;
                if (n.x == null || n.y == null) continue;

                const orbitR = ORBIT_RADIUS[n.kind] ?? ITEM_ORBIT;

                // Vector from parent to node
                const dx = n.x - parent.x;
                const dy = n.y - parent.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Target position: on the orbit circle around parent
                const tx = parent.x + (dx / dist) * orbitR;
                const ty = parent.y + (dy / dist) * orbitR;

                // Strength: stronger for structural nodes, weaker for items
                const strength = n.kind === 'month' ? 0.4
                               : n.kind === 'date'  ? 0.3
                               : 0.15;

                n.vx = (n.vx ?? 0) + (tx - n.x) * strength * alpha;
                n.vy = (n.vy ?? 0) + (ty - n.y) * strength * alpha;
            }
        };

        // Per-parent orbital force — the key to the circular grouping
        // D3 Force is a callable (alpha) => void with optional .initialize()
        const orbitalForceObj = Object.assign(orbitalForce, { initialize() {} });
        simRef.current = d3.forceSimulation<GraphNode>(nodes)
            .alphaDecay(0.012)
            .velocityDecay(0.4)
            .force('h-link',
                d3.forceLink<GraphNode, GraphLink>(hLinks)
                    .id(d => d.id)
                    .distance(n => {
                        const t = (n.target as GraphNode).kind;
                        return t === 'month' ? 200 : t === 'date' ? 120 : 70;
                    })
                    .strength(0.6))
            .force('k-link',
                d3.forceLink<GraphNode, GraphLink>(kLinks)
                    .id(d => d.id)
                    .distance(160)
                    .strength(0.2))
            .force('charge',
                d3.forceManyBody<GraphNode>().strength(n =>
                    n.kind === 'year'  ? -1200 :
                    n.kind === 'month' ? -500  :
                    n.kind === 'date'  ? -250  :
                    -80))
            .force('center', cf)
            .force('collide',
                d3.forceCollide<GraphNode>(collideRadius).iterations(2))
            .force('orbital', orbitalForceObj)
            .on('tick', draw)
            .on('end',  draw);
    }, [draw]);

    // ── Load data ────────────────────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await invoke<YearlyGraphData>('get_yearly_graph_data', { year: targetYear });
            onDataLoaded?.(data);

            // Cache KB content for tooltips
            kbContentRef.current.clear();
            data.kbItems.forEach(k => {
                kbContentRef.current.set(k.id, k.metadataTitle ?? k.content.slice(0, 80));
            });

            const total = data.activities.length + data.goals.length + data.submissions.length
                + data.kbItems.length + data.retrospectives.length
                + data.journalEntries.length + data.notes.length;
            setIsEmpty(total === 0);
            if (total === 0) return;

            const canvas = canvasRef.current;
            const w = canvas?.width  ?? 900;
            const h = canvas?.height ?? 600;

            const { nodes, hierarchyLinks, kbLinks, parentMap } = buildHierarchy(data, targetYear);
            nodesRef.current = nodes;
            initSim(nodes, hierarchyLinks, kbLinks, parentMap, w, h);
        } catch (err) {
            const msg = err && typeof err === 'object' && 'message' in err ? String((err as {message:unknown}).message) : String(err);
            toast.error('Failed to load graph', { description: msg });
        } finally {
            setLoading(false);
        }
    }, [targetYear, initSim, onDataLoaded]);

    loadDataRef.current = loadData;

    // ── Zoom ─────────────────────────────────────────────────────────────
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
            .scaleExtent([0.05, 8])
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
                const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
                const newHov = hit?.id ?? null;
                if (newHov !== hoveredRef.current) {
                    hoveredRef.current = newHov;
                    canvas.style.cursor = hit ? 'pointer' : (linkModeRef.current ? 'crosshair' : 'grab');
                    draw();
                    // Update tooltip
                    if (hit) {
                        const content = hit.kind === 'kb' ? kbContentRef.current.get(hit.sourceId ?? '') : undefined;
                        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, label: hit.label, kind: hit.kind, content });
                    } else {
                        setTooltip(null);
                    }
                } else if (hit && tooltip) {
                    // Update position while hovering same node
                    setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
                }
            }
        };

        const onUp = (e: PointerEvent) => {
            const n = dragNodeRef.current;
            if (!n) return;
            // alphaTarget(0) + restart() to properly cool down after drag
            simRef.current?.alphaTarget(0).restart();
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

            if (hit.kind === 'date') {
                onDateClick?.(hit.id.replace('date-', ''));
                return;
            }

            // Link mode: connect two KB nodes
            if (linkModeRef.current && hit.kind === 'kb') {
                if (!linkSrcRef.current) { linkSrcRef.current = hit; draw(); return; }
                if (linkSrcRef.current.id === hit.id) { linkSrcRef.current = null; draw(); return; }
                try {
                    // Fixed: backend expects req object, not flat params
                    await invoke('create_knowledge_link', {
                        req: { sourceId: linkSrcRef.current.id, targetId: hit.id, linkType: 'related' },
                    });
                    toast.success('Link created');
                    linkSrcRef.current = null;
                    await loadDataRef.current();
                } catch (err) {
                    toast.error('Failed to create link', { description: String(err) });
                    linkSrcRef.current = null; draw();
                }
                return;
            }

            if (hit.kind === 'kb' && onNodeClick && hit.sourceId) {
                onNodeClick({ id: hit.sourceId } as KnowledgeItem);
            }
        };

        const onLeave = () => {
            hoveredRef.current = null;
            setTooltip(null);
            draw();
        };

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
    }, [nodeAt, onNodeClick, onDateClick, draw, tooltip]);

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

    // ── Link mode cursor ─────────────────────────────────────────────────
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
        if (c && zoomRef.current) d3.select(c).transition().duration(300).call(zoomRef.current.transform, d3.zoomIdentity);
    };
    const focusSelected = () => {
        const node = nodesRef.current.find(n => n.id === selectedRef.current);
        if (!node || node.x == null || node.y == null) return;
        const canvas = canvasRef.current;
        if (!canvas || !zoomRef.current) return;
        const w = canvas.width, h = canvas.height;
        const scale = 1.5;
        const tx = w / 2 - node.x * scale;
        const ty = h / 2 - node.y * scale;
        d3.select(canvas).transition().duration(400)
            .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };
    const toggleKind = (k: NodeKind) => setHidden(prev => {
        const next = new Set(prev);
        next.has(k) ? next.delete(k) : next.add(k);
        return next;
    });

    const KIND_LABELS: Record<NodeKind, string> = {
        year: 'Year', month: 'Month', date: 'Date',
        activity: 'Activities', goal: 'Goals', submission: 'Submissions',
        kb: 'KB Items', retro: 'Retros', journal: 'Journal', note: 'Notes',
    };

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
                <Button size="sm" onClick={zoomReset} title="Reset View"
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <Maximize2 className="w-4 h-4" />
                </Button>
                {selectedItemId && (
                    <Button size="sm" onClick={focusSelected} title="Focus selected node"
                        style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                        <Crosshair className="w-4 h-4" />
                    </Button>
                )}
                <Button size="sm" onClick={() => setLinkMode(m => !m)} title="Link Mode (KB nodes)"
                    style={{ background: linkMode ? 'var(--color-accent-primary)' : 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: linkMode ? 'white' : 'var(--text-secondary)' }}>
                    <Link2 className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => setShowFilter(f => !f)} title="Filter node types"
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
                <div className="absolute top-4 right-16 z-10 flex flex-col gap-1.5 p-3"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius)', backdropFilter: 'blur(12px)', minWidth: '140px' }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                        Node types
                    </div>
                    {ALL_ITEM_KINDS.map(k => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer select-none"
                            style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                            <input type="checkbox" checked={!hidden.has(k)}
                                onChange={() => { toggleKind(k); draw(); }}
                                style={{ accentColor: 'var(--color-accent-primary)' }} />
                            <span className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: `var(${KIND_COLOR_VAR[k]})` }} />
                            {KIND_LABELS[k]}
                        </label>
                    ))}
                </div>
            )}

            {/* Link mode hint */}
            {linkMode && (
                <div className="absolute top-4 left-4 z-10 text-xs px-3 py-2 rounded-lg"
                    style={{ background: 'var(--color-accent-primary)', color: 'white' }}>
                    {linkSrcRef.current ? 'Click target KB node to link' : 'Click source KB node'}
                </div>
            )}

            {/* Hover tooltip */}
            {tooltip && (
                <div className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-lg text-xs max-w-[200px]"
                    style={{
                        left: tooltip.x + 14,
                        top:  tooltip.y - 10,
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        backdropFilter: 'blur(12px)',
                        color: 'var(--text-primary)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    }}>
                    <div className="font-medium truncate">{tooltip.label}</div>
                    {tooltip.content && (
                        <div className="mt-0.5 opacity-70 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                            {tooltip.content}
                        </div>
                    )}
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider opacity-50"
                        style={{ color: 'var(--text-tertiary)' }}>
                        {KIND_LABELS[tooltip.kind]}
                    </div>
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
