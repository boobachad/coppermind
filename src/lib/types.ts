export interface Note {
  id: string;
  title: string;
  content: string; // JSON
  created_at: number;
  updated_at: number;
  parent_id?: string | null;
  position?: number;
}

export interface StickyNote {
  id: string;
  note_id: string;
  content: string; // Used for text or sticker type/image source
  color: string;
  x: number;
  y: number;
  created_at: number;
  type?: 'text' | 'stamp' | 'emoji'; // Default to 'text' for backward compatibility
  rotation?: number;
  scale?: number;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  labels: string[]; // JSON string in DB
  urgent: boolean;
  due_date?: number;
  created_at: number;
}

export interface GraphNode {
  id: string;
  type: string;
  data: any;
  position: { x: number, y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}
