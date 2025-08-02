import Database from "@tauri-apps/plugin-sql";
import { StickyNote } from './types';

// Mock Database interface for browser environment
class MockDatabase {
  async execute(query: string, args?: any[]) {
    console.log('[MockDB] Execute:', query, args);
    
    // Notes Operations
    if (query.includes('INSERT INTO notes')) {
      const note = {
        id: args?.[0],
        title: args?.[1],
        content: args?.[2],
        created_at: args?.[3],
        updated_at: args?.[4],
        parent_id: args?.[5] || null,
        position: args?.[6] || 0
      };
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      notes.push(note);
      localStorage.setItem('mock_notes', JSON.stringify(notes));
    } else if (query.includes('UPDATE notes')) {
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const id = args?.[args.length - 1]; // ID is usually last
      const index = notes.findIndex((n: any) => n.id === id);
      
      if (index !== -1) {
        if (query.includes('title =')) notes[index].title = args?.[0];
        if (query.includes('content =')) notes[index].content = args?.[1];
        if (query.includes('updated_at =')) notes[index].updated_at = args?.[2];
        if (query.includes('position =')) notes[index].position = args?.[0]; // Assumes single update for simplicity in mock
        localStorage.setItem('mock_notes', JSON.stringify(notes));
      }
    } else if (query.includes('DELETE FROM notes')) {
      let notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const id = args?.[0];
      notes = notes.filter((n: any) => n.id !== id);
      localStorage.setItem('mock_notes', JSON.stringify(notes));
    }
    
    // Todos Operations
    else if (query.includes('INSERT INTO todos')) {
      const todo = {
        id: args?.[0],
        text: args?.[1],
        completed: args?.[2],
        description: args?.[3],
        priority: args?.[4],
        labels: args?.[5],
        urgent: args?.[6],
        due_date: args?.[7],
        created_at: args?.[8]
      };
      const todos = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      todos.push(todo);
      localStorage.setItem('mock_todos', JSON.stringify(todos));
    } else if (query.includes('UPDATE todos')) {
      const todos = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      const id = args?.[args.length - 1];
      const index = todos.findIndex((t: any) => t.id === id);
      
      if (index !== -1) {
        if (query.includes('completed =')) todos[index].completed = args?.[0];
        // Add other update logic as needed, for now mostly completed is toggled or full update
        localStorage.setItem('mock_todos', JSON.stringify(todos));
      }
    } else if (query.includes('DELETE FROM todos')) {
      let todos = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      const id = args?.[0];
      todos = todos.filter((t: any) => t.id !== id);
      localStorage.setItem('mock_todos', JSON.stringify(todos));
    }

    // Nodes & Edges Operations (Mock)
    else if (query.includes('INSERT INTO nodes')) {
      const node = {
        id: args?.[0],
        type: args?.[1],
        data: args?.[2],
        position_x: args?.[3],
        position_y: args?.[4],
        created_at: args?.[5]
      };
      const nodes = JSON.parse(localStorage.getItem('mock_nodes_graph') || '[]');
      nodes.push(node);
      localStorage.setItem('mock_nodes_graph', JSON.stringify(nodes));
    } else if (query.includes('INSERT INTO edges')) {
      const edge = {
        id: args?.[0],
        source: args?.[1],
        target: args?.[2],
        type: args?.[3],
        created_at: args?.[4]
      };
      const edges = JSON.parse(localStorage.getItem('mock_edges') || '[]');
      edges.push(edge);
      localStorage.setItem('mock_edges', JSON.stringify(edges));
    }

    // Sticky Notes Operations (Mock)
    else if (query.includes('INSERT INTO sticky_notes')) {
      // args order depends on query. 
      // NotePage: id, note_id, content, color, x, y, created_at (7 args)
      // StickerLayer: id, note_id, content, color, x, y, created_at, type, rotation, scale (10 args)
      // We can map by index if consistent, or use object if we parsed query.
      // Assuming consistent order based on recent code.
      // But NotePage and StickerLayer use different columns?
      // NotePage: INSERT INTO sticky_notes (id, note_id, content, color, x, y, created_at) VALUES ...
      // StickerLayer: INSERT INTO sticky_notes (id, note_id, content, color, x, y, created_at, type, rotation, scale) VALUES ...
      
      const sticky = {
        id: args?.[0],
        note_id: args?.[1],
        content: args?.[2],
        color: args?.[3],
        x: args?.[4],
        y: args?.[5],
        created_at: args?.[6],
        type: args?.[7] || 'text',
        rotation: args?.[8] || 0,
        scale: args?.[9] || 1
      };
      const stickies = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      stickies.push(sticky);
      localStorage.setItem('mock_stickies', JSON.stringify(stickies));
    } else if (query.includes('UPDATE sticky_notes')) {
      const stickies = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      const id = args?.[args.length - 1];
      const index = stickies.findIndex((s: any) => s.id === id);
      
      if (index !== -1) {
        if (query.includes('x =')) {
             stickies[index].x = args?.[0];
             stickies[index].y = args?.[1];
        }
        if (query.includes('rotation =')) stickies[index].rotation = args?.[0];
        if (query.includes('scale =')) stickies[index].scale = args?.[0];
        if (query.includes('content =')) stickies[index].content = args?.[0];
        if (query.includes('color =')) stickies[index].color = args?.[0];
        localStorage.setItem('mock_stickies', JSON.stringify(stickies));
      }
    } else if (query.includes('DELETE FROM sticky_notes')) {
      let stickies = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      const id = args?.[0];
      stickies = stickies.filter((s: any) => s.id !== id);
      localStorage.setItem('mock_stickies', JSON.stringify(stickies));
    }
    
    return Promise.resolve();
  }

  async select<T>(query: string, args?: any[]): Promise<T> {
    console.log('[MockDB] Select:', query, args);
    
    if (query.includes('FROM notes')) {
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      
      if (query.includes('WHERE id =')) {
        return Promise.resolve(notes.filter((n: any) => n.id === args?.[0]) as any);
      } else if (query.includes('WHERE parent_id IS NULL')) {
        return Promise.resolve(notes.filter((n: any) => !n.parent_id) as any);
      } else if (query.includes('WHERE parent_id =')) {
        return Promise.resolve(notes.filter((n: any) => n.parent_id === args?.[0]) as any);
      }
      
      return Promise.resolve(notes as any);
    } 
    
    if (query.includes('FROM sticky_notes')) {
      const stickies = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      if (query.includes('WHERE note_id =')) {
        return Promise.resolve(stickies.filter((s: any) => s.note_id === args?.[0]) as any);
      }
      return Promise.resolve(stickies as any);
    }

    if (query.includes('FROM todos')) {
      const todos = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      return Promise.resolve(todos as any);
    }

    if (query.includes('FROM nodes')) {
      const nodes = JSON.parse(localStorage.getItem('mock_nodes_graph') || '[]');
      return Promise.resolve(nodes as any);
    }

    if (query.includes('FROM edges')) {
      const edges = JSON.parse(localStorage.getItem('mock_edges') || '[]');
      return Promise.resolve(edges as any);
    }

    return Promise.resolve([] as any);
  }
}

let db: Database | MockDatabase | null = null;

export const initDb = async () => {
  if (db) return db;
  
  try {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      db = await Database.load("sqlite:coppermind.db");
      
      // Notes Table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT,
          content TEXT,
          created_at INTEGER,
          updated_at INTEGER,
          parent_id TEXT,
          position INTEGER
        )
      `);
      
      try {
        await db.execute('ALTER TABLE notes ADD COLUMN parent_id TEXT');
      } catch (e) { /* ignore */ }

      try {
        await db.execute('ALTER TABLE notes ADD COLUMN position INTEGER');
      } catch (e) { /* ignore */ }

      // Sticky Notes Table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sticky_notes (
          id TEXT PRIMARY KEY,
          note_id TEXT,
          content TEXT,
          color TEXT,
          x REAL,
          y REAL,
          created_at INTEGER,
          FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
        )
      `);

      // Todos Table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS todos (
          id TEXT PRIMARY KEY,
          text TEXT,
          completed INTEGER,
          description TEXT,
          priority TEXT,
          labels TEXT,
          urgent INTEGER,
          due_date INTEGER,
          created_at INTEGER
        )
      `);
      
      try {
        await db.execute('ALTER TABLE todos ADD COLUMN description TEXT');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE todos ADD COLUMN priority TEXT');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE todos ADD COLUMN labels TEXT');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE todos ADD COLUMN urgent INTEGER');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE todos ADD COLUMN due_date INTEGER');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE todos ADD COLUMN created_at INTEGER');
      } catch (e) { /* ignore */ }

      // Nodes Table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS nodes (
          id TEXT PRIMARY KEY,
          type TEXT,
          data TEXT,
          position_x REAL,
          position_y REAL,
          created_at INTEGER
        )
      `);

      // Edges Table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS edges (
          id TEXT PRIMARY KEY,
          source TEXT,
          target TEXT,
          type TEXT,
          created_at INTEGER
        )
      `);

      // Stickers Table (for global stickers, or modify sticky_notes to include type/rotation)
      try {
        await db.execute('ALTER TABLE sticky_notes ADD COLUMN type TEXT');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE sticky_notes ADD COLUMN rotation REAL');
      } catch (e) { /* ignore */ }
      try {
        await db.execute('ALTER TABLE sticky_notes ADD COLUMN scale REAL');
      } catch (e) { /* ignore */ }
      
      console.log("Database initialized (SQLite)");
    } else {
      console.warn("Tauri environment not detected. Using Mock Database.");
      db = new MockDatabase();
    }
    
    return db;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    db = new MockDatabase();
    return db;
  }
};

export const getDb = initDb;
