import Database from "@tauri-apps/plugin-sql";
import { Note, Todo, StickyNote, GraphNode, GraphEdge } from "./types";

// Mock Database interface for browser environment
class MockDatabase {
  async execute(query: string, args?: any[]) {
    console.log('[MockDB] Execute:', query, args);

    // Notes Operations
    if (query.includes('INSERT INTO notes')) {
      const note: Note = {
        id: args?.[0],
        title: args?.[1],
        content: args?.[2],
        created_at: args?.[3],
        updated_at: args?.[4],
        parent_id: args?.[5] || null,
        position: args?.[6] || 0
      };
      const notes: Note[] = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      notes.push(note);
      localStorage.setItem('mock_notes', JSON.stringify(notes));
    } else if (query.includes('UPDATE notes')) {
      const notes: Note[] = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const id = args?.[args.length - 1]; // ID is usually last
      const index = notes.findIndex((n) => n.id === id);

      if (index !== -1) {
        if (query.includes('title =')) notes[index].title = args?.[0];
        if (query.includes('content =')) notes[index].content = args?.[1];
        if (query.includes('updated_at =')) notes[index].updated_at = args?.[2];
        if (query.includes('position =')) notes[index].position = args?.[0];
        if (query.includes('source_urls =')) notes[index].source_urls = JSON.parse(args?.[0] || '[]');
        localStorage.setItem('mock_notes', JSON.stringify(notes));
      }
    } else if (query.includes('DELETE FROM notes')) {
      let notes: Note[] = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const id = args?.[0];

      // Cascading delete: Remove sticky notes associated with this note
      let stickies: StickyNote[] = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      const stickiesBefore = stickies.length;
      stickies = stickies.filter(s => s.note_id !== id);
      if (stickies.length !== stickiesBefore) {
        console.log(`[MockDB] Cascading delete: Removed ${stickiesBefore - stickies.length} sticky notes.`);
        localStorage.setItem('mock_stickies', JSON.stringify(stickies));
      }

      notes = notes.filter((n) => n.id !== id);
      localStorage.setItem('mock_notes', JSON.stringify(notes));
    }

    // Todos Operations
    else if (query.includes('INSERT INTO todos')) {
      const todo: Todo = {
        id: args?.[0],
        text: args?.[1],
        completed: args?.[2] === 1 || args?.[2] === true, // handle variations
        description: args?.[3],
        priority: args?.[4],
        labels: args?.[5] ? JSON.parse(args[5]) : [], // Assuming stored as string in DB
        urgent: args?.[6] === 1 || args?.[6] === true,
        due_date: args?.[7],
        created_at: args?.[8]
      };
      const todos: Todo[] = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      todos.push(todo);
      localStorage.setItem('mock_todos', JSON.stringify(todos));
    } else if (query.includes('UPDATE todos')) {
      const todos: Todo[] = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      const id = args?.[args.length - 1];
      const index = todos.findIndex((t) => t.id === id);

      if (index !== -1) {
        if (query.includes('completed =')) todos[index].completed = args?.[0];
        // Basic update support
        localStorage.setItem('mock_todos', JSON.stringify(todos));
      }
    } else if (query.includes('DELETE FROM todos')) {
      let todos: Todo[] = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      const id = args?.[0];
      todos = todos.filter((t) => t.id !== id);
      localStorage.setItem('mock_todos', JSON.stringify(todos));
    }

    // Nodes & Edges Operations (Mock)
    else if (query.includes('INSERT INTO nodes')) {
      const node: GraphNode = {
        id: args?.[0],
        type: args?.[1],
        data: JSON.parse(args?.[2] || '{}'),
        position: { x: args?.[3], y: args?.[4] }
      };
      const nodes: GraphNode[] = JSON.parse(localStorage.getItem('mock_nodes_graph') || '[]');
      nodes.push(node);
      localStorage.setItem('mock_nodes_graph', JSON.stringify(nodes));
    } else if (query.includes('DELETE FROM nodes')) {
      // Support delete node
      let nodes: GraphNode[] = JSON.parse(localStorage.getItem('mock_nodes_graph') || '[]');
      const id = args?.[0];
      nodes = nodes.filter(n => n.id !== id);
      localStorage.setItem('mock_nodes_graph', JSON.stringify(nodes));

      // Cascade delete edges connected to this node
      let edges: GraphEdge[] = JSON.parse(localStorage.getItem('mock_edges') || '[]');
      edges = edges.filter(e => e.source !== id && e.target !== id);
      localStorage.setItem('mock_edges', JSON.stringify(edges));

    } else if (query.includes('INSERT INTO edges')) {
      const edge: GraphEdge = {
        id: args?.[0],
        source: args?.[1],
        target: args?.[2],
        type: args?.[3]
      };
      const edges: GraphEdge[] = JSON.parse(localStorage.getItem('mock_edges') || '[]');
      edges.push(edge);
      localStorage.setItem('mock_edges', JSON.stringify(edges));
    }

    // Sticky Notes Operations (Mock)
    else if (query.includes('INSERT INTO sticky_notes')) {
      const sticky: StickyNote = {
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
      const stickies: StickyNote[] = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      stickies.push(sticky);
      localStorage.setItem('mock_stickies', JSON.stringify(stickies));
    } else if (query.includes('UPDATE sticky_notes')) {
      const stickies: StickyNote[] = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      const id = args?.[args.length - 1];
      const index = stickies.findIndex((s) => s.id === id);

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
      let stickies: StickyNote[] = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      const id = args?.[0];
      stickies = stickies.filter((s) => s.id !== id);
      localStorage.setItem('mock_stickies', JSON.stringify(stickies));
    }

    return Promise.resolve();
  }

  async select<T>(query: string, args?: any[]): Promise<T> {
    console.log('[MockDB] Select:', query, args);

    if (query.includes('FROM notes')) {
      const notes: Note[] = JSON.parse(localStorage.getItem('mock_notes') || '[]');

      if (query.includes('WHERE id =')) {
        return Promise.resolve(notes.filter((n) => n.id === args?.[0]) as unknown as T);
      } else if (query.includes('WHERE parent_id IS NULL')) {
        return Promise.resolve(notes.filter((n) => !n.parent_id) as unknown as T);
      } else if (query.includes('WHERE parent_id =')) {
        return Promise.resolve(notes.filter((n) => n.parent_id === args?.[0]) as unknown as T);
      }

      return Promise.resolve(notes as unknown as T);
    }

    if (query.includes('FROM sticky_notes')) {
      const stickies: StickyNote[] = JSON.parse(localStorage.getItem('mock_stickies') || '[]');
      if (query.includes('WHERE note_id =')) {
        return Promise.resolve(stickies.filter((s) => s.note_id === args?.[0]) as unknown as T);
      }
      return Promise.resolve(stickies as unknown as T);
    }

    if (query.includes('FROM todos')) {
      const todos: Todo[] = JSON.parse(localStorage.getItem('mock_todos') || '[]');
      return Promise.resolve(todos as unknown as T);
    }

    if (query.includes('FROM nodes')) {
      const nodes: any[] = JSON.parse(localStorage.getItem('mock_nodes_graph') || '[]');
      // Map back to DB format if needed, but here we just return stored objects
      // Ideally we store flat structure and map back to match SQL
      const mappedNodes = nodes.map(n => ({
        id: n.id,
        type: n.type,
        data: JSON.stringify(n.data), // SQL returns stringified JSON
        position_x: n.position.x,
        position_y: n.position.y,
        created_at: Date.now()
      }));
      return Promise.resolve(mappedNodes as unknown as T);
    }

    if (query.includes('FROM edges')) {
      const edges: GraphEdge[] = JSON.parse(localStorage.getItem('mock_edges') || '[]');
      return Promise.resolve(edges as unknown as T);
    }

    return Promise.resolve([] as unknown as T);
  }
}

let db: Database | MockDatabase | null = null;

export const initDb = async () => {
  if (db) return db;

  // Try to initialize SQLite first
  try {
    // In Tauri v2, we can just try to load the plugin. 
    // If it fails (e.g. in browser), it throws/returns null, then we fall back.
    db = await Database.load("sqlite:coppermind.db");

    // Check if db is actually usable (sometimes load returns an object even if plugin missing?)
    // But usually load() throws if backend not found.
    console.log("[db] SQLite plugin loaded successfully");

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

    // Migration helpers
    const addCol = async (table: string, col: string, type: string) => {
      try {
        await db?.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      } catch (e) { /* ignore if exists */ }
    };

    await addCol('notes', 'parent_id', 'TEXT');
    await addCol('notes', 'position', 'INTEGER');
    await addCol('notes', 'source_urls', 'TEXT'); // JSON array of source URLs

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

    await addCol('todos', 'description', 'TEXT');
    await addCol('todos', 'priority', 'TEXT');
    await addCol('todos', 'labels', 'TEXT');
    await addCol('todos', 'urgent', 'INTEGER');
    await addCol('todos', 'due_date', 'INTEGER');
    await addCol('todos', 'created_at', 'INTEGER');

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

    // Stickers Columns
    await addCol('sticky_notes', 'type', 'TEXT');
    await addCol('sticky_notes', 'rotation', 'REAL');
    await addCol('sticky_notes', 'scale', 'REAL');

    // Journal Entries Table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        expected_schedule_image TEXT NOT NULL DEFAULT '',
        actual_schedule_image TEXT NOT NULL DEFAULT '',
        reflection_text TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await addCol('journal_entries', 'schedule_data', 'TEXT');
    await addCol('journal_entries', 'expected_schedule_data', 'TEXT');
    await addCol('journal_entries', 'actual_schedule_data', 'TEXT');

    // Tombstone Table for deletion tracking
    await db.execute(`
      CREATE TABLE IF NOT EXISTS deleted_items (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        deleted_at INTEGER NOT NULL
      )
    `);

    console.log("Database initialized (SQLite)");
    return db;

  } catch (error) {
    console.error("CRITICAL: Failed to load SQLite plugin.", error);
    // Explicitly alert in dev mode to make sure we see it
    if (import.meta.env.DEV) {
      alert(`Failed to load SQLite: ${error}`);
    }
    console.warn("Falling back to MockDB.");
    db = new MockDatabase();
    return db;
  }
};

export const getDb = initDb;
