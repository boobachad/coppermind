import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Image as ImageIcon, FileText, CheckSquare, Type, BarChart, Trash2 } from 'lucide-react';
import { getDb } from '../lib/db';
import { useTheme } from '../lib/ThemeContext';

// Custom Node Components
const NodeWrapper = ({ children, label, icon: Icon, selected, id }: { children: React.ReactNode, label: string, icon: React.ElementType, selected?: boolean, id: string }) => {
  const { deleteElements } = useReactFlow();

  return (
    <div className={`bg-themed-surface rounded-lg shadow-md border-2 min-w-[200px] ${selected ? 'border-blue-500' : 'border-themed-border'}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-themed-bg border-b border-themed-border rounded-t-lg group">
        <div className="flex items-center">
          <Icon className="w-4 h-4 text-themed-text-secondary mr-2" />
          <span className="text-sm font-medium text-themed-text-primary">{label}</span>
        </div>
        <button
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            deleteElements({ nodes: [{ id }] });
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
      <Handle type="target" position={Position.Top} id="top-target" className="w-3 h-3 bg-blue-500" style={{ left: '40%' }} />
      <Handle type="source" position={Position.Top} id="top-source" className="w-3 h-3 bg-blue-500" style={{ left: '60%' }} />

      {/* Bottom Handles */}
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-3 h-3 bg-blue-500" style={{ left: '40%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="w-3 h-3 bg-blue-500" style={{ left: '60%' }} />

      {/* Left Handles */}
      <Handle type="target" position={Position.Left} id="left-target" className="w-3 h-3 bg-blue-500" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Left} id="left-source" className="w-3 h-3 bg-blue-500" style={{ top: '60%' }} />

      {/* Right Handles */}
      <Handle type="target" position={Position.Right} id="right-target" className="w-3 h-3 bg-blue-500" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Right} id="right-source" className="w-3 h-3 bg-blue-500" style={{ top: '60%' }} />
    </div>
  );
};

const TextNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Text" icon={Type} selected={selected} id={id}>
    <textarea
      className="w-full text-sm border-none resize-none focus:ring-0 p-0 bg-transparent text-themed-text-primary"
      placeholder="Enter text..."
      defaultValue={data.text}
      rows={3}
      onChange={(e) => data.onChange?.(e.target.value)}
    />
  </NodeWrapper>
);

const NoteNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Note" icon={FileText} selected={selected} id={id}>
    <div className="text-sm font-medium text-themed-text-primary mb-1">{data.title}</div>
    <div className="text-xs text-themed-text-secondary line-clamp-3">
      {data.preview || "Empty note"}
    </div>
  </NodeWrapper>
);

const TaskNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="Task" icon={CheckSquare} selected={selected} id={id}>
    <div className="flex items-center space-x-2">
      <div className={`w-4 h-4 rounded border ${data.completed ? 'bg-green-500 border-green-500' : 'border-themed-border'}`} />
      <span className={`text-sm ${data.completed ? 'line-through text-themed-text-secondary' : 'text-themed-text-primary'}`}>
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
      <div className="w-full h-32 bg-themed-bg flex items-center justify-center rounded text-themed-text-secondary">
        No Image
      </div>
    )}
  </NodeWrapper>
);

const GraphNode = ({ id, selected }: { id: string, selected?: boolean }) => (
  <NodeWrapper label="Graph" icon={BarChart} selected={selected} id={id}>
    <div className="w-full h-32 flex items-end justify-between space-x-1 px-2 pt-4 pb-0 bg-themed-bg rounded">
      {[40, 70, 30, 85, 50, 65].map((h, i) => (
        <div key={i} className="w-full bg-blue-500 rounded-t" style={{ height: `${h}%`, opacity: 0.6 + (i * 0.05) }} />
      ))}
    </div>
    <div className="text-xs text-center mt-2 text-themed-text-secondary">Sales Report</div>
  </NodeWrapper>
);

const FileNode = ({ id, data, selected }: { id: string, data: any, selected?: boolean }) => (
  <NodeWrapper label="PDF File" icon={FileText} selected={selected} id={id}>
    <div className="flex flex-col items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-800 h-32">
      <FileText className="w-12 h-12 text-red-500 dark:text-red-400 mb-2" />
      <span className="text-xs font-medium text-red-700 dark:text-red-300 text-center line-clamp-2 px-1">
        {data.fileName || "Document.pdf"}
      </span>
      <a href={data.url} download={data.fileName} className="mt-2 text-[10px] text-blue-500 dark:text-blue-400 hover:underline" onClick={(e) => e.stopPropagation()}>
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
  const { theme } = useTheme();
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
        await db.execute(
          'INSERT INTO nodes (id, type, data, position_x, position_y, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [node.id, node.type, JSON.stringify(node.data), node.position.x, node.position.y, Date.now()]
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
    setEdges((eds) => addEdge(params, eds));
    // Save edge to DB
    if (db) {
      const edge = { ...params, id: uuidv4() };
      db.execute(
        'INSERT INTO edges (id, source, target, type, created_at) VALUES (?, ?, ?, ?, ?)',
        [edge.id, edge.source, edge.target, 'default', Date.now()]
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
    setNodes((nds) => [...nds, newNode]);
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

  const updateNodeData = (id: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...data } };
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
    <div className="h-screen w-full flex flex-col bg-themed-bg relative">
      <div className="h-14 border-b border-themed-border flex items-center px-4 justify-between bg-themed-surface z-10">
        <div className="font-semibold text-themed-text-primary">Graph View</div>
        <div className="flex space-x-2">
          <button onClick={() => addNode('textNode')} className="p-2 hover:bg-themed-bg rounded text-themed-text-secondary" title="Add Text">
            <Type className="w-4 h-4" />
          </button>
          <button onClick={() => addNode('graphNode')} className="p-2 hover:bg-themed-bg rounded text-themed-text-secondary" title="Add Graph">
            <BarChart className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-themed-border mx-2" />
          <button onClick={() => openLinkModal('note')} className="p-2 hover:bg-themed-bg rounded text-themed-text-secondary" title="Link Note">
            <FileText className="w-4 h-4" />
          </button>
          <button onClick={() => openLinkModal('todo')} className="p-2 hover:bg-themed-bg rounded text-themed-text-secondary" title="Link Task">
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
        >
          <Background color={theme === 'dark' ? '#555' : '#aaa'} gap={16} variant={BackgroundVariant.Dots} />
          <Controls className="bg-themed-surface text-themed-text-primary border-themed-border" />
          <MiniMap className="bg-themed-surface border-themed-border" maskColor={theme === 'dark' ? 'rgba(30, 30, 30, 0.7)' : 'rgba(240, 240, 240, 0.7)'} nodeColor={theme === 'dark' ? '#555' : '#e0e0e0'} />
        </ReactFlow>
      </div>

      {/* Link Modal */}
      {isLinkModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-themed-surface rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-themed-border flex justify-between items-center">
              <h3 className="font-semibold text-themed-text-primary">
                Link {linkType === 'note' ? 'Note' : 'Task'}
              </h3>
              <button
                onClick={() => setIsLinkModalOpen(false)}
                className="text-themed-text-secondary hover:text-themed-text-primary"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {linkOptions.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No items found</div>
              ) : (
                <div className="space-y-1">
                  {linkOptions.map(item => (
                    <button
                      key={item.id}
                      onClick={() => confirmLink(item)}
                      className="w-full text-left px-3 py-2 hover:bg-themed-bg rounded text-sm text-themed-text-primary truncate"
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
