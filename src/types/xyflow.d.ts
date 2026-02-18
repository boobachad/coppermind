declare module '@xyflow/react' {
  import { ComponentType } from 'react';
  export * from '@xyflow/system';
  
  // Core components
  export const ReactFlow: ComponentType<Record<string, unknown>>;
  export const ReactFlowProvider: ComponentType<Record<string, unknown>>;
  export const Handle: ComponentType<Record<string, unknown>>;
  export const Position: Record<string, unknown>;
  
  // Additional components
  export const MiniMap: ComponentType<Record<string, unknown>>;
  export const Controls: ComponentType<Record<string, unknown>>;
  export const Background: ComponentType<Record<string, unknown>>;
  export const BackgroundVariant: Record<string, unknown>;
  export const Panel: ComponentType<Record<string, unknown>>;
  
  // Hooks - using unknown instead of any
  export function useNodesState<T = unknown>(initialNodes: T[]): [T[], (changes: unknown) => void, (nodes: T[]) => void];
  export function useEdgesState<T = unknown>(initialEdges: T[]): [T[], (changes: unknown) => void, (edges: T[]) => void];
  export function addEdge(connection: unknown, edges: unknown[]): unknown[];
  export function useReactFlow(): Record<string, unknown>;
  
  // Types
  export type Connection = Record<string, unknown>;
  export type Edge = Record<string, unknown>;
  export type Node = Record<string, unknown>;
  export type NodeTypes = Record<string, unknown>;
}
