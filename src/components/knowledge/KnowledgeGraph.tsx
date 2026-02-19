// Canvas-based D3 force graph — chosen over SVG for:
//   1. No simulation cleanup bug (SVG leaked running sims on re-render)
//   2. Zoom state persists in transformRef (SVG lost it on selectAll('*').remove())
//   3. Zoom buttons work — they share the single zoomRef instance
//   4. No React re-render on every zoom/pan tick
//   5. O(1) draw cost regardless of node count (canvas vs 3 DOM nodes per node)
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, KnowledgeLink } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';

// ─── Internal graph types ──────────────────────────────────────────────────
interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    type: string;
    item: KnowledgeItem;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    linkType: 'related' | 'blocks' | 'requires';
}

interface KnowledgeGraphProps {
    selectedItemId?: string | null;
    onNodeClick?: (item: KnowledgeItem) => void;
}

// ─── CSS var reader — Canvas cannot use CSS vars natively ──────────────────
function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function nodeColor(type: string, selected: boolean): string {
    if (selected) return cssVar('--color-accent-primary');
    switch (type) {
        case 'Link':     return cssVar('--pos-activity-coding-leetcode');
        case 'Problem':  return cssVar('--pos-activity-coding-codeforces');
        case 'NoteRef':  return cssVar('--pos-activity-book');
        case 'Quest':    return cssVar('--color-highlight-yellow');
        default:         return cssVar('--text-tertiary');
    }
}

// ─── Link stroke by relationship type ──────────────────────────────────────
function linkColor(type: string): string {
    switch (type) {
        case 'blocks':   return cssVar('--color-error');
        case 'requires': return cssVar('--color-accent-primary');
        default:         return cssVar('--glass-border');
    }
}

// ─── Component ─────────────────────────────────────────────────────────────
export function KnowledgeGraph({ selectedItemId, onNodeClick }: KnowledgeGraphProps) {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const [loading, setLoading]   = useState(true);
    const [zoomPct, setZoomPct]   = useState(100);

    // Refs that must not trigger re-renders
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const zoomRef      = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
    const simRef       = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
    const nodesRef     = useRef<GraphNode[]>([]);
    const linksRef     = useRef<GraphLink[]>([]);
    const dragNodeRef  = useRef<GraphNode | null>(null);
    const selectedRef  = useRef<string | null | undefined>(selectedItemId);
    selectedRef.current = selectedItemId;

    // ── Draw one frame onto the canvas ────────────────────────────────────
    const draw = useCallback(() => {
        const canvas  = canvasRef.current;
        if (!canvas) return;
        const ctx     = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(transformRef.current.x, transformRef.current.y);
        ctx.scale(transformRef.current.k, transformRef.current.k);

        // Draw links
        for (const l of linksRef.current) {
            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            ctx.beginPath();
            ctx.moveTo(s.x ?? 0, s.y ?? 0);
            ctx.lineTo(t.x ?? 0, t.y ?? 0);
            ctx.strokeStyle = linkColor(l.linkType);
            ctx.lineWidth   = 1.5;
            ctx.globalAlpha = 0.55;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Draw nodes
        const NODE_R  = 12;
        const SEL_R   = 18;
        for (const n of nodesRef.current) {
            const sel = n.id === selectedRef.current;
            const r   = sel ? SEL_R : NODE_R;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
            ctx.fillStyle   = nodeColor(n.type, sel);
            ctx.fill();
            ctx.strokeStyle = cssVar('--glass-border-highlight');
            ctx.lineWidth   = sel ? 2.5 : 1.2;
            ctx.stroke();

            // Label
            ctx.fillStyle  = cssVar('--text-secondary');
            ctx.font       = '10px system-ui, sans-serif';
            ctx.textAlign  = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(n.label, n.x ?? 0, (n.y ?? 0) + r + 3);
        }

        ctx.restore();
    }, []);

    // ── Hit-test: find node at canvas point (accounting for zoom/pan) ─────
    const nodeAt = useCallback((cx: number, cy: number): GraphNode | null => {
        const tx = (cx - transformRef.current.x) / transformRef.current.k;
        const ty = (cy - transformRef.current.y) / transformRef.current.k;
        const SEL_R = 18;
        const NODE_R = 12;
        for (const n of nodesRef.current) {
            const r  = n.id === selectedRef.current ? SEL_R : NODE_R;
            const dx = (n.x ?? 0) - tx;
            const dy = (n.y ?? 0) - ty;
            if (dx * dx + dy * dy <= r * r) return n;
        }
        return null;
    }, []);

    // ── Build and start force simulation ─────────────────────────────────
    const initSim = useCallback((nodes: GraphNode[], links: GraphLink[], w: number, h: number) => {
        simRef.current?.stop();

        simRef.current = d3.forceSimulation<GraphNode>(nodes)
            .force('link',     d3.forceLink<GraphNode, GraphLink>(links)
                                  .id(d => d.id)
                                  .distance(110)
                                  .strength(0.5))
            .force('charge',   d3.forceManyBody().strength(-280))
            .force('center',   d3.forceCenter(w / 2, h / 2))
            .force('collide',  d3.forceCollide(36))
            .on('tick', draw)
            .on('end',  draw);  // final stable frame
    }, [draw]);

    // ── Fetch KB items + links from real backend ──────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [items, links] = await Promise.all([
                invoke<KnowledgeItem[]>('get_knowledge_items', { filters: {} }),
                invoke<KnowledgeLink[]>('get_knowledge_links', { itemId: null }),
            ]);

            const canvas = canvasRef.current;
            const w = canvas?.width  ?? 800;
            const h = canvas?.height ?? 600;

            nodesRef.current = items.map(it => ({
                id:    it.id,
                label: (it.metadata?.title ?? it.content).substring(0, 24),
                type:  it.itemType,
                item:  it,
            }));

            linksRef.current = links.map(lk => ({
                source:   lk.sourceId,
                target:   lk.targetId,
                linkType: lk.linkType,
            }));

            initSim(nodesRef.current, linksRef.current, w, h);
        } catch (err) {
            toast.error('Failed to load graph', { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [initSim]);

    // ── Zoom setup — single instance shared with zoom buttons ────────────
    const setupZoom = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([0.08, 5])
            .on('zoom', (ev: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                transformRef.current = ev.transform;
                setZoomPct(Math.round(ev.transform.k * 100));
                draw();
            });

        d3.select(canvas).call(zoom);
        zoomRef.current = zoom;
    }, [draw]);

    // ── Pointer events for drag + click on canvas ─────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onDown = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const hit  = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (!hit) return;
            e.stopPropagation(); // don't pass to d3 zoom
            simRef.current?.alphaTarget(0.3).restart();
            hit.fx = hit.x;
            hit.fy = hit.y;
            dragNodeRef.current = hit;
            canvas.setPointerCapture(e.pointerId);
        };

        const onMove = (e: PointerEvent) => {
            const n = dragNodeRef.current;
            if (!n) return;
            const rect = canvas.getBoundingClientRect();
            const tx   = (e.clientX - rect.left  - transformRef.current.x) / transformRef.current.k;
            const ty   = (e.clientY - rect.top   - transformRef.current.y) / transformRef.current.k;
            n.fx = tx;
            n.fy = ty;
        };

        const onUp = (e: PointerEvent) => {
            const n = dragNodeRef.current;
            if (!n) return;
            simRef.current?.alphaTarget(0);
            n.fx = null;
            n.fy = null;
            dragNodeRef.current = null;
            canvas.releasePointerCapture(e.pointerId);
        };

        const onClick = (e: MouseEvent) => {
            if (dragNodeRef.current) return;
            const rect = canvas.getBoundingClientRect();
            const hit  = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (hit && onNodeClick) onNodeClick(hit.item);
        };

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup',   onUp);
        canvas.addEventListener('click',       onClick);
        return () => {
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup',   onUp);
            canvas.removeEventListener('click',       onClick);
        };
    }, [nodeAt, onNodeClick]);

    // ── Resize observer — keeps canvas pixel size in sync with layout ─────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                canvas.width  = width;
                canvas.height = height;
                draw();
            }
        });
        ro.observe(canvas.parentElement ?? canvas);
        return () => ro.disconnect();
    }, [draw]);

    // ── Initial load + zoom setup ─────────────────────────────────────────
    useEffect(() => {
        setupZoom();
        loadData();
        return () => { simRef.current?.stop(); };
    }, [setupZoom, loadData]);

    // ── Redraw on selectedItemId change (no full reload needed) ──────────
    useEffect(() => {
        draw();
    }, [selectedItemId, draw]);

    // ── Zoom button handlers — reuse the single zoomRef instance ─────────
    const zoomBy = (factor: number) => {
        const canvas = canvasRef.current;
        if (!canvas || !zoomRef.current) return;
        d3.select(canvas).transition().duration(200).call(zoomRef.current.scaleBy, factor);
    };

    const zoomReset = () => {
        const canvas = canvasRef.current;
        if (!canvas || !zoomRef.current) return;
        d3.select(canvas).transition().duration(250).call(zoomRef.current.transform, d3.zoomIdentity);
    };

    return (
        <div className="relative h-full w-full">
            {/* Zoom controls */}
            <div
                className="absolute top-4 right-4 z-10 flex flex-col gap-2"
                style={{
                    background:    'var(--glass-bg)',
                    border:        '1px solid var(--glass-border)',
                    borderRadius:  'var(--radius)',
                    padding:       '0.5rem',
                    backdropFilter:'blur(12px)',
                }}
            >
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
                <div className="text-xs text-center pt-2 border-t"
                    style={{ color: 'var(--text-tertiary)', borderColor: 'var(--glass-border)' }}>
                    {zoomPct}%
                </div>
            </div>

            {/* Loading overlay */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Loading graph…</span>
                </div>
            )}

            {/* Canvas — fills parent, ResizeObserver keeps it sized */}
            <canvas ref={canvasRef} className="w-full h-full"
                style={{ background: 'var(--bg-base)', cursor: 'grab' }} />
        </div>
    );
}
