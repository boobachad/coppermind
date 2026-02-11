declare module '@xyflow/react' {
  import { ComponentType } from 'react';
  export * from '@xyflow/system';
  
  // Core components
  export const ReactFlow: ComponentType<any>;
  export const ReactFlowProvider: ComponentType<any>;
  export const Handle: ComponentType<any>;
  export const Position: any;
  
  // Additional components
  export const MiniMap: ComponentType<any>;
  export const Controls: ComponentType<any>;
  export const Background: ComponentType<any>;
  export const BackgroundVariant: any;
  export const Panel: ComponentType<any>;
  
  // Hooks
  export function useNodesState<T = any>(initialNodes: T[]): [T[], (changes: any) => void, (nodes: T[]) => void];
  export function useEdgesState<T = any>(initialEdges: T[]): [T[], (changes: any) => void, (edges: T[]) => void];
  export function addEdge(connection: any, edges: any[]): any[];
  export function useReactFlow(): any;
  
  // Types
  export type Connection = any;
  export type Edge = any;
  export type Node = any;
  export type NodeTypes = any;
}
