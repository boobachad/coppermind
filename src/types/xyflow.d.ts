declare module '@xyflow/react' {
  import { ComponentType, CSSProperties } from 'react';
  export * from '@xyflow/system';
  
  // Position enum
  export enum Position {
    Top = 'top',
    Right = 'right',
    Bottom = 'bottom',
    Left = 'left',
  }
  
  // Background variant enum
  export enum BackgroundVariant {
    Lines = 'lines',
    Dots = 'dots',
    Cross = 'cross',
  }
  
  // Base node/edge types
  export interface XYPosition {
    x: number;
    y: number;
  }
  
  export interface NodeData {
    label?: string;
    [key: string]: unknown;
  }
  
  export interface Node<T = NodeData> {
    id: string;
    position: XYPosition;
    data: T;
    type?: string;
    style?: CSSProperties;
    className?: string;
    sourcePosition?: Position;
    targetPosition?: Position;
    hidden?: boolean;
    selected?: boolean;
    dragging?: boolean;
    draggable?: boolean;
    selectable?: boolean;
    connectable?: boolean;
    deletable?: boolean;
    dragHandle?: string;
    width?: number;
    height?: number;
    parentNode?: string;
    zIndex?: number;
    extent?: 'parent' | [[number, number], [number, number]];
    expandParent?: boolean;
    positionAbsolute?: XYPosition;
    ariaLabel?: string;
    focusable?: boolean;
  }
  
  export interface Edge<T = Record<string, unknown>> {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    animated?: boolean;
    hidden?: boolean;
    deletable?: boolean;
    data?: T;
    className?: string;
    style?: CSSProperties;
    selected?: boolean;
    markerStart?: string;
    markerEnd?: string;
    zIndex?: number;
    ariaLabel?: string;
    interactionWidth?: number;
    focusable?: boolean;
  }
  
  export interface Connection {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }
  
  export interface NodeChange {
    id: string;
    type: string;
    [key: string]: unknown;
  }
  
  export interface EdgeChange {
    id: string;
    type: string;
    [key: string]: unknown;
  }
  
  export type NodeTypes = Record<string, ComponentType<{data: NodeData}>>;
  
  export interface ReactFlowProps<T = NodeData> {
    nodes?: Node<T>[];
    edges?: Edge[];
    onNodesChange?: (changes: NodeChange[]) => void;
    onEdgesChange?: (changes: EdgeChange[]) => void;
    onConnect?: (connection: Connection) => void;
    children?: React.ReactNode;
    [key: string]: unknown;
  }
  
  export interface ReactFlowInstance {
    getNodes: () => Node[];
    getEdges: () => Edge[];
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    [key: string]: unknown;
  }
  
  // Core components
  export const ReactFlow: ComponentType<ReactFlowProps>;
  export const ReactFlowProvider: ComponentType<{ children?: React.ReactNode }>;
  export const Handle: ComponentType<{ type: 'source' | 'target'; position: Position; id?: string }>;
  
  // Additional components
  export const MiniMap: ComponentType<Record<string, unknown>>;
  export const Controls: ComponentType<Record<string, unknown>>;
  export const Background: ComponentType<{ variant?: BackgroundVariant; gap?: number; size?: number }>;
  export const Panel: ComponentType<{ position?: string; children?: React.ReactNode }>;
  
  // Hooks
  export function useNodesState<T = NodeData>(
    initialNodes: Node<T>[]
  ): [Node<T>[], (changes: NodeChange[]) => void, (nodes: Node<T>[]) => void];
  
  export function useEdgesState<T = Record<string, unknown>>(
    initialEdges: Edge<T>[]
  ): [Edge<T>[], (changes: EdgeChange[]) => void, (edges: Edge<T>[]) => void];
  
  export function addEdge(connection: Connection, edges: Edge[]): Edge[];
  export function useReactFlow(): ReactFlowInstance;
}
