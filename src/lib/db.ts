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
        parent_id: args?.[5] || null
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
        localStorage.setItem('mock_notes', JSON.stringify(notes));
      }
    } else if (query.includes('DELETE FROM notes')) {
      let notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const id = args?.[0];
      notes = notes.filter((n: any) => n.id !== id);
      localStorage.setItem('mock_notes', JSON.stringify(notes));
    }
    
    // Sticky Notes Operations
    else if (query.includes('INSERT INTO sticky_notes')) {
      const sticky = {
        id: args?.[0],
        note_id: args?.[1],
        content: args?.[2],
        color: args?.[3],
        x: args?.[4],
        y: args?.[5],
        created_at: args?.[6]
      };
      const stickies = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      stickies.push(sticky);
      localStorage.setItem('mock_stickies', JSON.stringify(stickies));
    } else if (query.includes('UPDATE sticky_notes')) {
      const stickies = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      const id = args?.[args.length - 1];
      const index = stickies.findIndex((s: any) => s.id === id);
      
      if (index !== -1) {
        // Simple update logic based on arg count or query inspection
        // Assuming: UPDATE sticky_notes SET x=?, y=?, content=?, color=? WHERE id=?
        if (query.includes('x =') && query.includes('y =')) {
             // Position update
             // args: [x, y, id]
             stickies[index].x = args?.[0];
             stickies[index].y = args?.[1];
        } else if (query.includes('content =')) {
             // Content update
             // args: [content, id]
             stickies[index].content = args?.[0];
        }
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
          parent_id TEXT
        )
      `);
      
      try {
        await db.execute('ALTER TABLE notes ADD COLUMN parent_id TEXT');
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
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          text TEXT,
          completed INTEGER
        )
      `);
      
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
