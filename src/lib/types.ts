export interface Note {
  id: string;
  title: string;
  content: string; // JSON
  created_at: number;
  updated_at: number;
  parent_id?: string | null;
  position?: number;
  source_urls?: string[]; // Source URLs captured via double-shift
}

export interface Message {
  id: string;
  role: 'question' | 'answer';
  content: string; // HTML string or plain text
  created_at: number;
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
  data: {
    label?: string;
    text?: string;
    title?: string;
    preview?: string;
    completed?: boolean;
    url?: string;
    fileName?: string;
    onChange?: (val: string) => void;
    [key: string]: any; // Keep flexibilty for now but bounded
  };
  position: { x: number, y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}


