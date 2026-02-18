import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { invoke } from '@tauri-apps/api/core';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, KnowledgeLink } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    type: string;
    item: KnowledgeItem;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    type: string;
}

interface KnowledgeGraphProps {
    selectedItemId?: string | null;
    onNodeClick?: (item: KnowledgeItem) => void;
}

export function KnowledgeGraph({ selectedItemId, onNodeClick }: KnowledgeGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [links, setLinks] = useState<KnowledgeLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [zoomLevel, setZoomLevel] = useState(1);

    useEffect(() => {
        loadGraphData();
    }, []);

    useEffect(() => {
        if (!loading && items.length > 0) {
            renderGraph();
        }
    }, [items, links, selectedItemId, loading]);

    const loadGraphData = async () => {
        setLoading(true);
        try {
            const [itemsData, linksData] = await Promise.all([
                invoke<KnowledgeItem[]>('get_knowledge_items', { filters: {} }),
                invoke<KnowledgeLink[]>('get_knowledge_links', { itemId: null })
            ]);
            setItems(itemsData);
            setLinks(linksData);
        } catch (err) {
            toast.error('Failed to load graph data', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    const renderGraph = () => {
        if (!svgRef.current || items.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;

        // Create zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                setZoomLevel(event.transform.k);
            });

        svg.call(zoom);

        const g = svg.append('g');

        // Prepare nodes
        const nodes: GraphNode[] = items.map(item => ({
            id: item.id,
            label: item.content.substring(0, 30),
            type: item.itemType,
            item
        }));

        // Prepare links
        const graphLinks: GraphLink[] = links.map(link => ({
            source: link.sourceId,
            target: link.targetId,
            type: link.linkType
        }));

        // Create force simulation
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink<GraphNode, GraphLink>(graphLinks).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(40));

        // Draw links
        const link = g.append('g')
            .selectAll('line')
            .data(graphLinks)
            .join('line')
            .attr('stroke', 'var(--glass-border)')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.6);

        // Draw nodes with proper typing
        const node = g.append('g')
            .selectAll<SVGGElement, GraphNode>('g')
            .data(nodes)
            .join('g')
            .call(d3.drag<SVGGElement, GraphNode>()
                .on('start', (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
                    if (!event.active) simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));

        // Node circles
        node.append('circle')
            .attr('r', d => d.id === selectedItemId ? 20 : 15)
            .attr('fill', d => {
                if (d.id === selectedItemId) return 'var(--color-accent-primary)';
                switch (d.type) {
                    case 'Link': return 'var(--pos-activity-coding-leetcode)';
                    case 'Problem': return 'var(--pos-activity-coding-codeforces)';
                    case 'NoteRef': return 'var(--pos-activity-book)';
                    default: return 'var(--text-tertiary)';
                }
            })
            .attr('stroke', 'var(--glass-border-highlight)')
            .attr('stroke-width', d => d.id === selectedItemId ? 3 : 1.5)
            .style('cursor', 'pointer')
            .on('click', (_, d) => {
                if (onNodeClick) {
                    onNodeClick(d.item);
                }
            });

        // Node labels
        node.append('text')
            .text(d => d.label)
            .attr('x', 0)
            .attr('y', 25)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', 'var(--text-secondary)')
            .style('pointer-events', 'none');

        // Update positions on tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as GraphNode).x || 0)
                .attr('y1', d => (d.source as GraphNode).y || 0)
                .attr('x2', d => (d.target as GraphNode).x || 0)
                .attr('y2', d => (d.target as GraphNode).y || 0);

            node
                .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
        });
    };

    const handleZoomIn = () => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoom = d3.zoom<SVGSVGElement, unknown>();
        svg.transition().call(zoom.scaleBy as any, 1.3);
    };

    const handleZoomOut = () => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoom = d3.zoom<SVGSVGElement, unknown>();
        svg.transition().call(zoom.scaleBy as any, 0.7);
    };

    const handleResetZoom = () => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        const zoom = d3.zoom<SVGSVGElement, unknown>();
        svg.transition().call(zoom.transform as any, d3.zoomIdentity);
    };

    return (
        <div className="relative h-full w-full">
            {/* Controls */}
            <div
                className="absolute top-4 right-4 z-10 flex flex-col gap-2"
                style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius)',
                    padding: '0.5rem',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <Button
                    size="sm"
                    onClick={handleZoomIn}
                    title="Zoom In"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <ZoomIn className="w-4 h-4" />
                </Button>
                <Button
                    size="sm"
                    onClick={handleZoomOut}
                    title="Zoom Out"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <ZoomOut className="w-4 h-4" />
                </Button>
                <Button
                    size="sm"
                    onClick={handleResetZoom}
                    title="Reset Zoom"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <Maximize2 className="w-4 h-4" />
                </Button>
                <div
                    className="text-xs text-center pt-2 border-t"
                    style={{
                        color: 'var(--text-tertiary)',
                        borderColor: 'var(--glass-border)',
                    }}
                >
                    {Math.round(zoomLevel * 100)}%
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                        background: 'var(--glass-bg)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <div style={{ color: 'var(--text-secondary)' }}>Loading graph...</div>
                </div>
            )}

            {/* SVG Canvas */}
            <svg
                ref={svgRef}
                className="w-full h-full"
                style={{ background: 'var(--bg-base)' }}
            />
        </div>
    );
}
