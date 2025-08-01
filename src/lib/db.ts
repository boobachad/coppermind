import Database from "@tauri-apps/plugin-sql";

// Mock Database interface for browser environment
class MockDatabase {
  async execute(query: string, args?: any[]) {
    console.log('[MockDB] Execute:', query, args);
    // Basic localStorage implementation for demo purposes
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
      // Check if we are updating parent_id (different query structure?)
      // Assuming standard update: title, content, updated_at, id
      // If we add parent_id update support, we need to handle it.
      // For now, let's look at how UPDATE is called in the app.
      
      // If the query has 4 args, it's the standard update.
      if (args?.length === 4) {
        const id = args?.[3];
        const index = notes.findIndex((n: any) => n.id === id);
        if (index !== -1) {
          notes[index].title = args?.[0];
          notes[index].content = args?.[1];
          notes[index].updated_at = args?.[2];
          localStorage.setItem('mock_notes', JSON.stringify(notes));
        }
      }
    }
    return Promise.resolve();
  }
  async select<T>(query: string, args?: any[]): Promise<T> {
    console.log('[MockDB] Select:', query, args);
    if (query.includes('FROM notes')) {
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      if (query.includes('WHERE id')) {
        return Promise.resolve(notes.filter((n: any) => n.id === args?.[0]) as any);
      }
      return Promise.resolve(notes as any);
    }
    return Promise.resolve([] as any);
  }
}

let db: Database | MockDatabase | null = null;

export const initDb = async () => {
  if (db) return db;
  
  try {
    // Check if we are running in Tauri environment
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      db = await Database.load("sqlite:coppermind.db");
      
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
      
      // Try to add parent_id column if it doesn't exist (for migration)
      try {
        await db.execute('ALTER TABLE notes ADD COLUMN parent_id TEXT');
      } catch (e) {
        // Ignore error if column already exists
      }

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
    // Fallback to mock if initialization fails (e.g. in browser)
    console.warn("Falling back to Mock Database due to error.");
    db = new MockDatabase();
    return db;
  }
};

export const getDb = async () => {
  if (!db) {
    return await initDb();
  }
  return db;
};
