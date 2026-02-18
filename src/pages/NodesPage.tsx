import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Image as ImageIcon, FileText, CheckSquare, Type, BarChart, Trash2 } from 'lucide-react';
import { getDb } from '../lib/db';


// Custom Node Components
const NodeWrapper = ({ children, label, icon: Icon, selected, id }: { children: React.ReactNode, label: string, icon: React.ElementType, selected?: boolean, id: string }) => {
  const { deleteElements } = useReactFlow();

  return (
    <div className={`material-card p-0 min-w-[200px] overflow-hidden ${selected ? 'ring-2' : ''}`} style={selected ? { borderColor: 'var(--glass-border-highlight)' } : {}}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-subtle)' }}>
        <div className="flex items-center">
          <Icon className="w-4 h-4 mr-2" style={{ color: 'var(--text-secondary)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <button
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
          style={{ color: 'var(--text-tertiary)' }}
          onClick={(e) => {
            e.stopPropagation();
            (deleteElements as (opts: { nodes: { id: string }[] }) => void)({ nodes: [{ id }] });
          }}
          title="Delete Node"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="p-3">
        {children}
      </div>

      {/* Top Handles */}
      <Handle type="target" position={Position.Top} id="top-target" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ left: '40%' }} />
      <Handle type="source" position={Position.Top} id="top-source" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ left: '60%' }} />

      {/* Bottom Handles */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ left: '40%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ left: '60%' }} />

      {/* Left Handles */}
      <Handle type="target" position={Position.Left} id="left-target" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Left} id="left-source" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ top: '60%' }} />

      {/* Right Handles */}
      <Handle type="target" position={Position.Right} id="right-target" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Right} id="right-source" className="w-3 h-3 bg-blue-500 border border-white/20" style={{ top: '60%' }} />
    </div>
  );
};

const TextNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Text" icon={Type} selected={selected} id={id}>
    <textarea
      className="w-full text-sm border-none resize-none focus:ring-0 p-0 bg-transparent"
      style={{ color: 'var(--text-primary)' }}
      placeholder="Enter text..."
      defaultValue={data.text}
      rows={3}
      onChange={(e) => data.onChange?.(e.target.value)}
    />
  </NodeWrapper>
);

const NoteNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Note" icon={FileText} selected={selected} id={id}>
    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{data.title}</div>
    <div className="text-xs line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
      {data.preview || "Empty note"}
    </div>
  </NodeWrapper>
);

const TaskNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Task" icon={CheckSquare} selected={selected} id={id}>
    <div className="flex items-center space-x-2">
      <div className={`w-4 h-4 rounded border ${data.completed ? 'bg-green-500 border-green-500' : ''}`} style={!data.completed ? { borderColor: 'var(--glass-border)' } : {}} />
      <span className={`text-sm ${data.completed ? 'line-through' : ''}`} style={{ color: data.completed ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
        {data.label || "New Task"}
      </span>
    </div>
  </NodeWrapper>
);

const ImageNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Image" icon={ImageIcon} selected={selected} id={id}>
    {data.url ? (
      <img src={data.url} alt="Node" className="w-full h-32 object-cover rounded" />
    ) : (
      <div className="w-full h-32 flex items-center justify-center rounded" style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-tertiary)' }}>
        No Image
      </div>
    )}
  </NodeWrapper>
);

const GraphNode = ({ id, selected }: { id: string, selected?: boolean }) => (
  <NodeWrapper label="Graph" icon={BarChart} selected={selected} id={id}>
    <div className="w-full h-32 flex items-end justify-between space-x-1 px-2 pt-4 pb-0 rounded" style={{ backgroundColor: 'var(--glass-bg-subtle)' }}>
      {[40, 70, 30, 85, 50, 65].map((h, i) => (
        <div key={i} className="w-full bg-blue-500 rounded-t" style={{ height: `${h}%`, opacity: 0.6 + (i * 0.05) }} />
      ))}
    </div>
    <div className="text-xs text-center mt-2" style={{ color: 'var(--text-tertiary)' }}>Sales Report</div>
  </NodeWrapper>
);

const FileNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="PDF File" icon={FileText} selected={selected} id={id}>
    <div className="flex flex-col items-center justify-center p-4 bg-red-500/10 rounded border border-red-500/20 h-32">
      <FileText className="w-12 h-12 text-red-400 mb-2" />
      <span className="text-xs font-medium text-red-300 text-center line-clamp-2 px-1">
        {data.fileName || "Document.pdf"}
      </span>
      <a href={data.url} download={data.fileName} className="mt-2 text-[10px] text-blue-400 hover:underline" onClick={(e) => e.stopPropagation()}>
        Download
      </a>
    </div>
  </NodeWrapper>
);

const nodeTypes: NodeTypes = {
  textNode: TextNode,
  noteNode: NoteNode,
  taskNode: TaskNode,
  imageNode: ImageNode,
  graphNode: GraphNode,
  fileNode: FileNode,
};

export function NodesPage() {

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [db, setDb] = useState<any>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkType, setLinkType] = useState<'note' | 'todo' | null>(null);
  const [linkOptions, setLinkOptions] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      const database = await getDb();
      setDb(database);
      loadGraph(database);
    };
    init();
  }, []); // loadGraph is stable/dependency-free in this context or could be added if memoized

  const loadGraph = useCallback(async (database: any) => {
    try {
      const savedNodes = await database.select('SELECT * FROM nodes');
      const savedEdges = await database.select('SELECT * FROM edges');

      const parsedNodes = savedNodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        position: { x: n.position_x, y: n.position_y },
        data: JSON.parse(n.data)
      }));

      setNodes(parsedNodes);
      setEdges(savedEdges);
    } catch (err) {
      console.error("Failed to load graph", err);
    }
  }, [setNodes, setEdges]);

  const saveNode = async (node: Node) => {
    if (!db) return;
    try {
      // Check if exists
      const exists = await db.select('SELECT id FROM nodes WHERE id = ?', [node.id]);
      if (exists.length > 0) {
        // Update (simplified) - in real app we'd update position on drag end
      } else {
        const nodePosition = node.position as { x: number; y: number };
        await db.execute(
          'INSERT INTO nodes (id, type, data, position_x, position_y, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [node.id, node.type, JSON.stringify(node.data), nodePosition.x, nodePosition.y, Date.now()]
        );
      }
    } catch (err) {
      console.error("Failed to save node", err);
    }
  };

  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    if (!db) return;
    for (const node of deleted) {
      try {
        await db.execute('DELETE FROM nodes WHERE id = ?', [node.id]);
      } catch (e) {
        console.error("Failed to delete node", e);
      }
    }
  }, [db]);

  const onConnect = useCallback((params: Connection | Edge) => {
    setEdges((eds: Edge[]) => addEdge(params, eds));
    // Save edge to DB
    if (db) {
      const edge = { ...(params as unknown as Record<string, unknown>), id: uuidv4() };
      const edgeWithProps = edge as unknown as { id: string; source: string; target: string };
      db.execute(
        'INSERT INTO edges (id, source, target, type, created_at) VALUES (?, ?, ?, ?)',
        [edgeWithProps.id, edgeWithProps.source, edgeWithProps.target, 'default', Date.now()]
      );
    }
  }, [db, setEdges]);

  // Also handle edge deletion if needed, but for now focus on nodes

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const addNode = useCallback((type: string, data: any = {}, position?: { x: number; y: number }) => {
    const id = uuidv4();
    const newNode: Node = {
      id,
      type,
      position: position || { x: Math.random() * 500 + 100, y: Math.random() * 500 + 100 },
      data: {
        label: `New ${type}`,
        onChange: (val: string) => updateNodeData(id, { text: val }),
        ...data
      },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
    saveNode(newNode);
  }, [setNodes, saveNode]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // Handle Files (Images/PDFs)
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        const reader = new FileReader();

        if (file.type.startsWith('image/')) {
          reader.onload = (e) => {
            const url = e.target?.result as string;
            addNode('imageNode', { url }, position);
          };
          reader.readAsDataURL(file);
        } else if (file.type === 'application/pdf') {
          reader.onload = (e) => {
            const url = e.target?.result as string;
            addNode('fileNode', { url, fileName: file.name }, position);
          };
          reader.readAsDataURL(file);
        }
        return;
      }

      // Handle Node Types Drag (if we implemented a sidebar drag)
      const type = event.dataTransfer.getData('application/reactflow');
      if (type) {
        addNode(type, {}, position);
      }
    },
    [reactFlowInstance, addNode]
  );

  const updateNodeData = (id: string, data: unknown) => {
    setNodes((nds: Node[]) =>
      nds.map((node: Node) => {
        if (node.id === id) {
          return { ...node, data: { ...(node.data as Record<string, unknown>), ...(data as Record<string, unknown>) } };
        }
        return node;
      })
    );
  };

  const openLinkModal = async (type: 'note' | 'todo') => {
    if (!db) return;
    setLinkType(type);
    if (type === 'note') {
      const result = await db.select('SELECT * FROM notes WHERE parent_id IS NULL ORDER BY updated_at DESC');
      setLinkOptions(result);
    } else {
      const result = await db.select('SELECT * FROM todos ORDER BY created_at DESC');
      setLinkOptions(result);
    }
    setIsLinkModalOpen(true);
  };

  const confirmLink = (item: any) => {
    if (linkType === 'note') {
      addNode('noteNode', { title: item.title, preview: item.content });
    } else {
      addNode('taskNode', { label: item.text, completed: item.completed });
    }
    setIsLinkModalOpen(false);
  };

  return (
    <div className="h-full w-full flex flex-col bg-transparent relative">
      <div className="h-14 border-b flex items-center px-4 justify-between material-glass-subtle z-10" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>Graph View</div>
        <div className="flex space-x-2">
          <button onClick={() => addNode('textNode')} className="p-2 rounded transition-colors" style={{ color: 'var(--text-secondary)' }} title="Add Text">
            <Type className="w-4 h-4" />
          </button>
          <button onClick={() => addNode('graphNode')} className="p-2 rounded transition-colors" style={{ color: 'var(--text-secondary)' }} title="Add Graph">
            <BarChart className="w-4 h-4" />
          </button>
          <div className="w-px h-6 mx-2" style={{ backgroundColor: 'var(--glass-border)' }} />
          <button onClick={() => openLinkModal('note')} className="p-2 rounded transition-colors" style={{ color: 'var(--text-secondary)' }} title="Link Note">
            <FileText className="w-4 h-4" />
          </button>
          <button onClick={() => openLinkModal('todo')} className="p-2 rounded transition-colors" style={{ color: 'var(--text-secondary)' }} title="Link Task">
            <CheckSquare className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#555" gap={16} variant={BackgroundVariant.Dots} />
          <Controls className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 p-1.5 rounded-lg material-glass-subtle [&>button]:p-2 [&>button]:rounded-md [&>button]:bg-transparent! [&>button]:border-transparent! [&>button]:text-(--text-secondary)! [&>button]:transition-all [&>button:hover]:bg-(--glass-bg)! [&>button:hover]:text-(--text-primary)! [&>button:hover]:scale-105 shadow-xl" />
          <MiniMap
            className="!absolute !bottom-4 !right-4 z-10 !bg-black/20 !border-white/10 !m-0 rounded-lg overflow-hidden"
            maskColor="rgba(0, 0, 0, 0.4)"
            nodeColor="#666"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      {/* Link Modal */}
      {isLinkModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="material-card w-96 max-h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: 'var(--glass-border)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Link {linkType === 'note' ? 'Note' : 'Task'}
              </h3>
              <button
                onClick={() => setIsLinkModalOpen(false)}
                className="transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {linkOptions.length === 0 ? (
                <div className="p-4 text-center" style={{ color: 'var(--text-tertiary)' }}>No items found</div>
              ) : (
                <div className="space-y-1">
                  {linkOptions.map(item => (
                    <button
                      key={item.id}
                      onClick={() => confirmLink(item)}
                      className="w-full text-left px-3 py-2 rounded text-sm truncate transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {linkType === 'note' ? (item.title || 'Untitled') : item.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
