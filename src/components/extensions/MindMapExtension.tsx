import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';

// --- Tree Mind Map ---

const TreeMindMapComponent = ({ node, updateAttributes }: any) => {
  const [nodes, setNodes] = useState(node.attrs.nodes || [
    { id: 'root', text: 'Central Topic', children: [] }
  ]);

  // Very basic update wrapper
  const updateNodes = (newNodes: any) => {
    setNodes(newNodes);
    updateAttributes({ nodes: newNodes });
  };

  const addChild = (parentId: string) => {
    // Deep clone to avoid mutation issues
    const newNodes = JSON.parse(JSON.stringify(nodes));
    
    const findAndAdd = (list: any[]) => {
      for (let item of list) {
        if (item.id === parentId) {
          item.children.push({
            id: Math.random().toString(36).substr(2, 9),
            text: 'New Node',
            children: []
          });
          return true;
        }
        if (item.children.length > 0) {
          if (findAndAdd(item.children)) return true;
        }
      }
      return false;
    };

    findAndAdd(newNodes);
    updateNodes(newNodes);
  };

  const updateText = (id: string, text: string) => {
    const newNodes = JSON.parse(JSON.stringify(nodes));
    const findAndUpdate = (list: any[]) => {
        for (let item of list) {
            if (item.id === id) {
                item.text = text;
                return true;
            }
            if (item.children.length > 0) {
                if (findAndUpdate(item.children)) return true;
            }
        }
        return false;
    };
    findAndUpdate(newNodes);
    updateNodes(newNodes);
  };

  const renderNode = (item: any) => {
    return (
      <div key={item.id} className="flex flex-col items-center mx-4">
        <div className="relative group">
            <input 
                className="bg-yellow-100 border-2 border-yellow-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-800 focus:outline-none focus:border-yellow-500 text-center min-w-[100px]"
                value={item.text}
                onChange={(e) => updateText(item.id, e.target.value)}
            />
            <button 
                onClick={() => addChild(item.id)}
                className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 bg-blue-100 rounded-full hover:bg-blue-200 text-blue-600 transition-opacity"
                title="Add Child"
            >
                <Plus size={12} />
            </button>
        </div>
        {item.children.length > 0 && (
          <div className="flex mt-4 relative">
             {/* Simple lines would go here, but for now just flex layout */}
             {item.children.map((child: any) => (
                 <div key={child.id} className="relative pt-4">
                    {/* Connector line simulation */}
                    <div className="absolute top-0 left-1/2 w-px h-4 bg-gray-300 -translate-x-1/2"></div>
                    {renderNode(child)}
                 </div>
             ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <NodeViewWrapper className="mindmap-tree-component my-4 overflow-x-auto p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
       <div className="min-w-full flex justify-center">
         {nodes.map((root: any) => renderNode(root))}
       </div>
    </NodeViewWrapper>
  );
};

export const MindMapTreeExtension = Node.create({
  name: 'mindMapTree',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      nodes: {
        default: [{ id: 'root', text: 'Central Topic', children: [] }],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mind-map-tree"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mind-map-tree' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TreeMindMapComponent);
  },
});


// --- Block Mind Map ---

const BlockMindMapComponent = ({ node, updateAttributes }: any) => {
    const [blocks, setBlocks] = useState(node.attrs.blocks || [
        { id: '1', x: 50, y: 50, text: 'Start Here' }
    ]);

    const addBlock = () => {
        const newBlocks = [...blocks, {
            id: Math.random().toString(36).substr(2, 9),
            x: 150,
            y: 150,
            text: 'New Block'
        }];
        setBlocks(newBlocks);
        updateAttributes({ blocks: newBlocks });
    };

    const updateBlockPos = (id: string, x: number, y: number) => {
        const newBlocks = blocks.map((b: any) => b.id === id ? { ...b, x, y } : b);
        setBlocks(newBlocks);
        updateAttributes({ blocks: newBlocks });
    };

    const updateBlockText = (id: string, text: string) => {
        const newBlocks = blocks.map((b: any) => b.id === id ? { ...b, text } : b);
        setBlocks(newBlocks);
        updateAttributes({ blocks: newBlocks });
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('blockId', id);
        // Calculate offset
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        e.dataTransfer.setData('offsetX', (e.clientX - rect.left).toString());
        e.dataTransfer.setData('offsetY', (e.clientY - rect.top).toString());
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const blockId = e.dataTransfer.getData('blockId');
        const offsetX = parseFloat(e.dataTransfer.getData('offsetX'));
        const offsetY = parseFloat(e.dataTransfer.getData('offsetY'));
        
        if (blockId) {
            const containerRect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - containerRect.left - offsetX;
            const y = e.clientY - containerRect.top - offsetY;
            updateBlockPos(blockId, x, y);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    return (
        <NodeViewWrapper className="mindmap-block-component my-4">
            <div 
                className="relative h-[400px] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <div className="absolute top-2 right-2 z-10">
                    <button onClick={addBlock} className="px-3 py-1 bg-white shadow-sm border rounded text-sm hover:bg-gray-50 flex items-center gap-1">
                        <Plus size={14} /> Add Block
                    </button>
                </div>
                
                {blocks.map((block: any) => (
                    <div
                        key={block.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, block.id)}
                        className="absolute bg-white shadow-md border border-gray-200 rounded-lg p-2 min-w-[120px] cursor-move"
                        style={{ left: block.x, top: block.y }}
                    >
                        <textarea
                            className="w-full h-full resize-none outline-none text-sm bg-transparent"
                            value={block.text}
                            onChange={(e) => updateBlockText(block.id, e.target.value)}
                            rows={2}
                        />
                        {/* Simple connectors could be added here */}
                    </div>
                ))}
            </div>
        </NodeViewWrapper>
    );
};

export const MindMapBlockExtension = Node.create({
  name: 'mindMapBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      blocks: {
        default: [{ id: '1', x: 50, y: 50, text: 'Start Here' }],
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="mind-map-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mind-map-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockMindMapComponent);
  },
});
