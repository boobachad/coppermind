// Canvas-based D3 force graph — area51 pattern, 8 bugs corrected vs SVG version:
//   1. zoom.filter() — prevents simultaneous zoom-pan + node-drag
//   2. dragDistRef — prevents ghost click firing onNodeClick after a drag
//   3. Cursor changes to 'grabbing' during drag
//   4. colorCacheRef + MutationObserver — cssVar read once per theme, not per frame
//   5. centerForceRef — forceCenter updated on canvas resize so nodes re-settle
//   6. globalAlpha set once before link loop, reset once after (not per-link)
//   7. Label ellipsis when title exceeds 24 chars
//   8. Empty-state UI when 0 KB items exist
//   + Link Mode: click two nodes to create a knowledge_link between them
import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, KnowledgeLink } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';

// ─── Internal graph types ─────────────────────────────────────────────────
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

const NODE_R = 12;
const SEL_R  = 18;
const DRAG_THRESHOLD = 5; // px — below this is a click, above is a drag

// ─── Label helper: truncate with ellipsis ────────────────────────────────
function truncate(text: string, max = 24): string {
    return text.length > max ? text.substring(0, max) + '…' : text;
}

// ─── Component ──────────────────────────────────────────────────────────
export function KnowledgeGraph({ selectedItemId, onNodeClick }: KnowledgeGraphProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loading, setLoading]         = useState(true);
    const [isEmpty, setIsEmpty]         = useState(false);
    const [zoomPct, setZoomPct]         = useState(100);
    const [linkMode, setLinkMode]       = useState(false);

    // Refs — never trigger re-renders
    const transformRef   = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const zoomRef        = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
    const simRef         = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
    const centerForceRef = useRef<d3.ForceCenter<GraphNode> | null>(null);
    const nodesRef       = useRef<GraphNode[]>([]);
    const linksRef       = useRef<GraphLink[]>([]);
    const dragNodeRef    = useRef<GraphNode | null>(null);
    const dragDistRef    = useRef(0);
    const dragStartRef   = useRef<{ x: number; y: number } | null>(null);
    const selectedRef    = useRef<string | null | undefined>(selectedItemId);
    const linkModeRef    = useRef(false);
    const linkSourceRef  = useRef<GraphNode | null>(null);
    // Bug 4 fix: CSS var cache, invalidated when data-theme changes
    const colorCacheRef  = useRef<Record<string, string>>({});
    selectedRef.current = selectedItemId;
    linkModeRef.current = linkMode;

    // ── Cached CSS var reader (reads getComputedStyle once per var per theme)
    const cv = useCallback((name: string): string => {
        if (!colorCacheRef.current[name]) {
            colorCacheRef.current[name] =
                getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        }
        return colorCacheRef.current[name];
    }, []);

    // ── Draw one frame ───────────────────────────────────────────────────
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(transformRef.current.x, transformRef.current.y);
        ctx.scale(transformRef.current.k, transformRef.current.k);

        // Bug 6 fix: globalAlpha set once for all links, reset once after
        ctx.globalAlpha = 0.55;
        ctx.lineWidth   = 1.5;
        for (const l of linksRef.current) {
            const s = l.source as GraphNode;
            const t = l.target as GraphNode;
            ctx.beginPath();
            ctx.moveTo(s.x ?? 0, s.y ?? 0);
            ctx.lineTo(t.x ?? 0, t.y ?? 0);
            ctx.strokeStyle = l.linkType === 'blocks'
                ? cv('--color-error')
                : l.linkType === 'requires'
                    ? cv('--color-accent-primary')
                    : cv('--glass-border');
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Draw nodes
        const linkSrc = linkSourceRef.current;
        for (const n of nodesRef.current) {
            const sel = n.id === selectedRef.current;
            const isLinkSrc = n.id === linkSrc?.id;
            const r   = sel ? SEL_R : NODE_R;
            const nx  = n.x ?? 0;
            const ny  = n.y ?? 0;

            // Link-source highlight ring
            if (isLinkSrc) {
                ctx.beginPath();
                ctx.arc(nx, ny, r + 5, 0, 2 * Math.PI);
                ctx.strokeStyle = cv('--color-accent-primary');
                ctx.lineWidth   = 2;
                ctx.globalAlpha = 0.4;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            ctx.beginPath();
            ctx.arc(nx, ny, r, 0, 2 * Math.PI);
            ctx.fillStyle   = sel
                ? cv('--color-accent-primary')
                : n.type === 'Link'    ? cv('--pos-activity-coding-leetcode')
                : n.type === 'Problem' ? cv('--pos-activity-coding-codeforces')
                : n.type === 'NoteRef' ? cv('--pos-activity-book')
                : n.type === 'Quest'   ? cv('--color-highlight-yellow')
                : cv('--text-tertiary');
            ctx.fill();
            ctx.strokeStyle = cv('--glass-border-highlight');
            ctx.lineWidth   = sel ? 2.5 : 1.2;
            ctx.stroke();

            // Bug 7 fix: label with ellipsis
            ctx.fillStyle    = cv('--text-secondary');
            ctx.font         = '10px system-ui, sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(n.label, nx, ny + r + 3);
        }

        ctx.restore();
    }, [cv]);

    // ── Hit-test (accounts for zoom/pan transform) ───────────────────────
    const nodeAt = useCallback((cx: number, cy: number): GraphNode | null => {
        const tx = (cx - transformRef.current.x) / transformRef.current.k;
        const ty = (cy - transformRef.current.y) / transformRef.current.k;
        for (const n of nodesRef.current) {
            const r  = n.id === selectedRef.current ? SEL_R : NODE_R;
            const dx = (n.x ?? 0) - tx;
            const dy = (n.y ?? 0) - ty;
            if (dx * dx + dy * dy <= r * r) return n;
        }
        return null;
    }, []);

    // ── Force simulation ─────────────────────────────────────────────────
    const initSim = useCallback((nodes: GraphNode[], links: GraphLink[], w: number, h: number) => {
        simRef.current?.stop();
        const cf = d3.forceCenter<GraphNode>(w / 2, h / 2);
        centerForceRef.current = cf;
        simRef.current = d3.forceSimulation<GraphNode>(nodes)
            .force('link',    d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(110).strength(0.5))
            .force('charge',  d3.forceManyBody().strength(-280))
            .force('center',  cf)
            .force('collide', d3.forceCollide(36))
            .on('tick', draw)
            .on('end',  draw);
    }, [draw]);

    // ── Load from real backend ───────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [items, links] = await Promise.all([
                invoke<KnowledgeItem[]>('get_knowledge_items', { filters: {} }),
                invoke<KnowledgeLink[]>('get_knowledge_links', { itemId: null }),
            ]);
            // Bug 8 fix: track empty state
            setIsEmpty(items.length === 0);
            if (items.length === 0) return;

            const canvas = canvasRef.current;
            const w = canvas?.width  ?? 800;
            const h = canvas?.height ?? 600;

            nodesRef.current = items.map(it => ({
                id:    it.id,
                label: truncate(it.metadata?.title ?? it.content),
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

    // ── Zoom — Bug 1 fix: zoom.filter excludes node hits so drag and zoom
    //    never activate simultaneously ────────────────────────────────────
    const setupZoom = useCallback((hitTest: (x: number, y: number) => GraphNode | null) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .filter((event: Event) => {
                // Always allow wheel-to-zoom; block drag-to-pan when over a node
                if (event.type === 'wheel') return true;
                const e = event as PointerEvent;
                const rect = canvas.getBoundingClientRect();
                return hitTest(e.clientX - rect.left, e.clientY - rect.top) === null;
            })
            .scaleExtent([0.08, 5])
            .on('zoom', (ev: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
                transformRef.current = ev.transform;
                setZoomPct(Math.round(ev.transform.k * 100));
                draw();
            });
        d3.select(canvas).call(zoom);
        zoomRef.current = zoom;
    }, [draw]);

    // ── Pointer events: drag + click + link mode ─────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onDown = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            const hit  = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (!hit) return;
            // Bug 2 fix: reset drag tracking
            dragDistRef.current  = 0;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            // Bug 3 fix: cursor to grabbing
            canvas.style.cursor  = 'grabbing';
            simRef.current?.alphaTarget(0.3).restart();
            hit.fx = hit.x;
            hit.fy = hit.y;
            dragNodeRef.current = hit;
            canvas.setPointerCapture(e.pointerId);
        };

        const onMove = (e: PointerEvent) => {
            const n = dragNodeRef.current;
            if (!n) return;
            // Bug 2 fix: accumulate drag distance
            if (dragStartRef.current) {
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                dragDistRef.current = Math.sqrt(dx * dx + dy * dy);
            }
            const rect = canvas.getBoundingClientRect();
            n.fx = (e.clientX - rect.left  - transformRef.current.x) / transformRef.current.k;
            n.fy = (e.clientY - rect.top   - transformRef.current.y) / transformRef.current.k;
        };

        const onUp = (e: PointerEvent) => {
            const n = dragNodeRef.current;
            if (!n) return;
            simRef.current?.alphaTarget(0);
            n.fx = null;
            n.fy = null;
            dragNodeRef.current  = null;
            dragStartRef.current = null;
            // Bug 3 fix: restore cursor
            canvas.style.cursor  = linkModeRef.current ? 'crosshair' : 'grab';
            canvas.releasePointerCapture(e.pointerId);
        };

        const onClick = async (e: MouseEvent) => {
            // Bug 2 fix: ignore click if it was a drag
            if (dragDistRef.current > DRAG_THRESHOLD) return;
            const rect = canvas.getBoundingClientRect();
            const hit  = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
            if (!hit) return;

            if (!linkModeRef.current) {
                if (onNodeClick) onNodeClick(hit.item);
                return;
            }
            // Link mode: first click = source, second click = target
            if (!linkSourceRef.current) {
                linkSourceRef.current = hit;
                draw();
                return;
            }
            if (linkSourceRef.current.id === hit.id) {
                linkSourceRef.current = null; // deselect same node
                draw();
                return;
            }
            try {
                await invoke('create_knowledge_link', {
                    sourceId: linkSourceRef.current.id,
                    targetId: hit.id,
                    linkType: 'related',
                });
                toast.success('Link created');
                linkSourceRef.current = null;
                await loadData();
            } catch (err) {
                toast.error('Failed to create link', { description: String(err) });
                linkSourceRef.current = null;
                draw();
            }
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
    }, [nodeAt, onNodeClick, draw, loadData]);

    // ── ResizeObserver — Bug 5 fix: update forceCenter on resize ────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                canvas.width  = width;
                canvas.height = height;
                // Update force center so nodes gently re-settle to new center
                if (centerForceRef.current) {
                    centerForceRef.current.x(width / 2).y(height / 2);
                    simRef.current?.alpha(0.1).restart();
                }
                draw();
            }
        });
        ro.observe(canvas.parentElement ?? canvas);
        return () => ro.disconnect();
    }, [draw]);

    // ── Bug 4 fix: MutationObserver clears color cache on theme change ───
    useEffect(() => {
        const mo = new MutationObserver(() => {
            colorCacheRef.current = {};
            draw();
        });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => mo.disconnect();
    }, [draw]);

    // ── Initial setup ────────────────────────────────────────────────────
    useEffect(() => {
        setupZoom(nodeAt);
        loadData();
        return () => { simRef.current?.stop(); };
    }, [setupZoom, nodeAt, loadData]);

    // ── Redraw when selection changes (no reload needed) ─────────────────
    useEffect(() => { draw(); }, [selectedItemId, draw]);

    // ── Link mode cursor ─────────────────────────────────────────────────
    useEffect(() => {
        if (canvasRef.current) {
            canvasRef.current.style.cursor = linkMode ? 'crosshair' : 'grab';
        }
        if (!linkMode) {
            linkSourceRef.current = null;
            draw();
        }
    }, [linkMode, draw]);

    // ── Zoom button handlers — share the single zoomRef instance ─────────
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
            {/* Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2"
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
                <Button size="sm" onClick={zoomReset} title="Reset Zoom"
                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                    <Maximize2 className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={() => setLinkMode(m => !m)} title="Link Mode"
                    style={{
                        background: linkMode ? 'var(--color-accent-primary)' : 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: linkMode ? 'var(--color-pure-white)' : 'var(--text-secondary)',
                    }}>
                    <Link2 className="w-4 h-4" />
                </Button>
                <div className="text-xs text-center pt-2 border-t"
                    style={{ color: 'var(--text-tertiary)', borderColor: 'var(--glass-border)' }}>
                    {zoomPct}%
                </div>
            </div>

            {/* Link mode hint */}
            {linkMode && (
                <div className="absolute top-4 left-4 z-10 text-xs px-3 py-2 rounded"
                    style={{ background: 'var(--color-accent-primary)', color: 'var(--color-pure-white)' }}>
                    {linkSourceRef.current ? 'Click target node to link' : 'Click source node'}
                </div>
            )}

            {/* Loading overlay */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(12px)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Loading graph…</span>
                </div>
            )}

            {/* Bug 8 fix: empty state */}
            {!loading && isEmpty && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                    style={{ color: 'var(--text-tertiary)' }}>
                    <span className="text-4xl">⬡</span>
                    <span className="text-sm">No knowledge items yet.</span>
                    <span className="text-xs">Add items in the Inbox tab to see the graph.</span>
                </div>
            )}

            {/* Canvas */}
            <canvas ref={canvasRef} className="w-full h-full"
                style={{ background: 'var(--bg-base)', cursor: 'grab' }} />
        </div>
    );
}
