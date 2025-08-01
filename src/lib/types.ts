export interface Note {
  id: string;
  title: string;
  content: string; // JSON
  created_at: number;
  updated_at: number;
  parent_id?: string | null;
}

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}
