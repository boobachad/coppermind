export interface Note {
  id: string;
  title: string;
  content: string; // JSON
  created_at: number;
  updated_at: number;
  parent_id?: string | null;
}

export interface StickyNote {
  id: string;
  note_id: string;
  content: string;
  color: string;
  x: number;
  y: number;
  created_at: number;
}

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}
