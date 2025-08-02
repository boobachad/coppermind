import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
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
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Image as ImageIcon, FileText, CheckSquare, Type, Share2, Trash2, BarChart, Link as LinkIcon } from 'lucide-react';
import { getDb } from '../lib/db';
import { Note, Todo } from '../lib/types';

// Custom Node Components
const NodeWrapper = ({ children, label, icon: Icon, selected }: any) => {
  // Common handle styles
  const handleStyle = { w: 3, h: 3, bg: 'bg-blue-500' };
  
  return (
    <div className={`bg-white rounded-lg shadow-md border-2 min-w-[200px] ${selected ? 'border-blue-500' : 'border-gray-200'}`}>
      <div className="flex items-center px-3 py-2 bg-gray-50 border-b border-gray-100 rounded-t-lg">
        <Icon className="w-4 h-4 text-gray-500 mr-2" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
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

const TextNode = ({ data, selected }: any) => (
  <NodeWrapper label="Text" icon={Type} selected={selected}>
    <textarea 
      className="w-full text-sm border-none resize-none focus:ring-0 p-0 bg-transparent"
      placeholder="Enter text..."
      defaultValue={data.text}
      rows={3}
      onChange={(e) => data.onChange?.(e.target.value)}
    />
  </NodeWrapper>
);

const NoteNode = ({ data, selected }: any) => (
  <NodeWrapper label="Note" icon={FileText} selected={selected}>
    <div className="text-sm font-medium text-gray-800 mb-1">{data.title}</div>
    <div className="text-xs text-gray-600 line-clamp-3">
      {data.preview || "Empty note"}
    </div>
  </NodeWrapper>
);

const TaskNode = ({ data, selected }: any) => (
  <NodeWrapper label="Task" icon={CheckSquare} selected={selected}>
    <div className="flex items-center space-x-2">
      <div className={`w-4 h-4 rounded border ${data.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'}`} />
      <span className={`text-sm ${data.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
        {data.label || "New Task"}
      </span>
    </div>
  </NodeWrapper>
);

const ImageNode = ({ data, selected }: any) => (
  <NodeWrapper label="Image" icon={ImageIcon} selected={selected}>
    {data.url ? (
      <img src={data.url} alt="Node" className="w-full h-32 object-cover rounded" />
    ) : (
      <div className="w-full h-32 bg-gray-100 flex items-center justify-center rounded text-gray-400">
        No Image
      </div>
    )}
  </NodeWrapper>
);

const GraphNode = ({ data, selected }: any) => (
  <NodeWrapper label="Graph" icon={BarChart} selected={selected}>
    <div className="w-full h-32 flex items-end justify-between space-x-1 px-2 pt-4 pb-0 bg-gray-50 rounded">
      {[40, 70, 30, 85, 50, 65].map((h, i) => (
        <div key={i} className="w-full bg-blue-500 rounded-t" style={{ height: `${h}%`, opacity: 0.6 + (i * 0.05) }} />
      ))}
    </div>
    <div className="text-xs text-center mt-2 text-gray-500">Sales Report</div>
  </NodeWrapper>
);

const FileNode = ({ data, selected }: any) => (
  <NodeWrapper label="PDF File" icon={FileText} selected={selected}>
    <div className="flex flex-col items-center justify-center p-4 bg-red-50 rounded border border-red-100 h-32">
      <FileText className="w-12 h-12 text-red-500 mb-2" />
      <span className="text-xs font-medium text-red-700 text-center line-clamp-2 px-1">
        {data.fileName || "Document.pdf"}
      </span>
      <a href={data.url} download={data.fileName} className="mt-2 text-[10px] text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
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
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [db, setDb] = useState<any>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      const database = await getDb();
      setDb(database);
      loadGraph(database);
    };
    init();
  }, []);

  const loadGraph = async (database: any) => {
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
  };

  const saveNode = async (node: Node) => {
    if (!db) return;
    try {
      // Check if exists
      const exists = await db.select('SELECT id FROM nodes WHERE id = ?', [node.id]);
      if (exists.length > 0) {
        // Update (simplified, real app would update specific fields)
        // For now we just re-insert or ignore, but better to support position update
        // We'll rely on periodic save or explicit save for now to keep it simple
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

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

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
    [reactFlowInstance]
  );

  const addNode = (type: string, data: any = {}, position?: { x: number; y: number }) => {
    const id = uuidv4();
    const newNode: Node = {
      id,
      type,
      position: position || { x: Math.random() * 500, y: Math.random() * 500 },
      data: { 
        label: `New ${type}`, 
        onChange: (val: string) => updateNodeData(id, { text: val }),
        ...data 
      },
    };
    setNodes((nds) => [...nds, newNode]);
    saveNode(newNode);
  };

  const updateNodeData = (id: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          node.data = { ...node.data, ...data };
        }
        return node;
      })
    );
  };

  const linkNote = async () => {
    // For demo: fetch first note
    if (!db) return;
    const result = await db.select('SELECT * FROM notes LIMIT 1');
    if (result && result.length > 0) {
      const note = result[0];
      addNode('noteNode', { title: note.title, preview: note.content });
    }
  };

  const linkTodo = async () => {
    // For demo: fetch first todo
    if (!db) return;
    const result = await db.select('SELECT * FROM todos LIMIT 1');
    if (result && result.length > 0) {
      const todo = result[0];
      addNode('taskNode', { label: todo.text, completed: todo.completed });
    }
  };

  return (
    <div className="h-screen w-full flex flex-col">
      <div className="h-14 border-b border-gray-200 flex items-center px-4 justify-between bg-white z-10">
        <div className="font-semibold text-gray-700">Graph View</div>
        <div className="flex space-x-2">
          <button onClick={() => addNode('textNode')} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="Add Text">
            <Type className="w-4 h-4" />
          </button>
          <button onClick={() => addNode('graphNode')} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="Add Graph">
            <BarChart className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-2" />
          <button onClick={linkNote} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="Link Note">
            <FileText className="w-4 h-4" />
          </button>
          <button onClick={linkTodo} className="p-2 hover:bg-gray-100 rounded text-gray-600" title="Link Task">
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
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          fitView
        >
          <Background color="#aaa" gap={16} variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
}
