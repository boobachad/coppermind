import Database from "@tauri-apps/plugin-sql";
import { getDb } from "./db";
import { toast } from "sonner";

// ─── Config ──────────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PG_URL = import.meta.env.VITE_DATABASE_URL as string | undefined;

let pgDb: Database | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let pgConnected = false;

/** Expose connection status for UI */
export function isPgConnected(): boolean {
    return pgConnected;
}

// ─── Table Definitions (column order matters for upsert) ─────────
interface TableDef {
    name: string;
    columns: string[];
}

const TABLES: TableDef[] = [
    {
        name: "notes",
        columns: ["id", "title", "content", "created_at", "updated_at", "parent_id", "position", "source_urls"],
    },
    {
        name: "todos",
        columns: ["id", "text", "completed", "description", "priority", "labels", "urgent", "due_date", "created_at", "updated_at"],
    },
    {
        name: "sticky_notes",
        columns: ["id", "note_id", "content", "color", "x", "y", "created_at", "type", "rotation", "scale"],
    },
    {
        name: "nodes",
        columns: ["id", "type", "data", "position_x", "position_y", "created_at"],
    },
    {
        name: "edges",
        columns: ["id", "source", "target", "type", "created_at"],
    },
    {
        name: "journal_entries",
        columns: ["id", "date", "expected_schedule_image", "actual_schedule_image", "reflection_text", "expected_schedule_data", "actual_schedule_data", "created_at", "updated_at"],
    },
    {
        name: "deleted_items",
        columns: ["id", "table_name", "deleted_at"],
    },
];

// ─── PG DDL (mirror SQLite schema) ──────────────────────────────
const PG_CREATE_TABLES = [
    `CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        created_at BIGINT,
        updated_at BIGINT,
        parent_id TEXT,
        position INTEGER,
        source_urls TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        text TEXT,
        completed INTEGER,
        description TEXT,
        priority TEXT,
        labels TEXT,
        urgent INTEGER,
        due_date BIGINT,
        created_at BIGINT,
        updated_at BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS sticky_notes (
        id TEXT PRIMARY KEY,
        note_id TEXT,
        content TEXT,
        color TEXT,
        x DOUBLE PRECISION,
        y DOUBLE PRECISION,
        created_at BIGINT,
        type TEXT,
        rotation DOUBLE PRECISION,
        scale DOUBLE PRECISION
    )`,
    `CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT,
        data TEXT,
        position_x DOUBLE PRECISION,
        position_y DOUBLE PRECISION,
        created_at BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        source TEXT,
        target TEXT,
        type TEXT,
        created_at BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        expected_schedule_image TEXT NOT NULL DEFAULT '',
        actual_schedule_image TEXT NOT NULL DEFAULT '',
        reflection_text TEXT NOT NULL DEFAULT '',
        expected_schedule_data TEXT,
        actual_schedule_data TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS deleted_items (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        deleted_at BIGINT NOT NULL
    )`,
];


// ─── Core Sync ──────────────────────────────────────────────────
// ─── Bidirectional Sync: Timestamp-based merge (Last-Write-Wins) ──────────
async function syncTable(sqliteDb: Database, table: TableDef): Promise<{ pushed: number; pulled: number; deleted: number }> {
    if (!pgDb) return { pushed: 0, pulled: 0, deleted: 0 };

    // Special handling for deleted_items table
    if (table.name === 'deleted_items') {
        return await syncDeletions(sqliteDb);
    }

    // Get local tombstones to filter out deleted items
    const tombstones = await sqliteDb.select<{ id: string; table_name: string }[]>(
        'SELECT id, table_name FROM deleted_items WHERE table_name = ?',
        [table.name]
    );
    const deletedIds = new Set(tombstones.map(t => t.id));

    // Fetch both datasets
    const pgRows = await pgDb.select<Record<string, unknown>[]>(
        `SELECT ${table.columns.join(", ")} FROM ${table.name}`
    );
    const sqliteRows = await sqliteDb.select<Record<string, unknown>[]>(
        `SELECT ${table.columns.join(", ")} FROM ${table.name}`
    );

    // Build maps for O(1) lookup
    const pgRowMap = new Map<string, Record<string, unknown>>();
    pgRows.forEach(row => {
        const key = table.name === 'journal_entries' ? String(row.date) : String(row.id);
        pgRowMap.set(key, row);
    });

    const sqliteRowMap = new Map<string, Record<string, unknown>>();
    sqliteRows.forEach(row => {
        const key = table.name === 'journal_entries' ? String(row.date) : String(row.id);
        sqliteRowMap.set(key, row);
    });

    let pulledCount = 0;
    let pushedCount = 0;

    // PHASE 1: Process PG rows (pull if newer or missing locally)
    for (const pgRow of pgRows) {
        const key = table.name === 'journal_entries' ? String(pgRow.date) : String(pgRow.id);
        const rowId = String(pgRow.id);
        
        // Skip if locally deleted
        if (deletedIds.has(rowId)) {
            continue;
        }

        const sqliteRow = sqliteRowMap.get(key);

        // Determine if we should pull this row
        let shouldPull = false;
        if (!sqliteRow) {
            // Row doesn't exist locally, pull it
            shouldPull = true;
        } else if (pgRow.updated_at && sqliteRow.updated_at) {
            // Both have timestamps, compare them (PG wins if newer)
            if (Number(pgRow.updated_at) > Number(sqliteRow.updated_at)) {
                shouldPull = true;
            }
        }

        if (shouldPull) {
            const nonNullCols: string[] = [];
            const nonNullValues: unknown[] = [];

            table.columns.forEach((col) => {
                const val = pgRow[col];
                if (val !== undefined && val !== null) {
                    nonNullCols.push(col);
                    if (typeof val === 'string' && (col === 'data' || col === 'source_urls' || col === 'labels' || col.includes('_data'))) {
                        nonNullValues.push(val);
                    } else {
                        nonNullValues.push(val);
                    }
                }
            });

            const placeholders = nonNullCols.map(() => '?').join(", ");
            const updateSet = nonNullCols
                .filter(col => col !== "id")
                .map(col => `${col} = excluded.${col}`)
                .join(", ");

            const conflictTarget = table.name === 'journal_entries' ? 'date' : 'id';
            const upsertSql = `INSERT INTO ${table.name} (${nonNullCols.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateSet}`;

            await sqliteDb.execute(upsertSql, nonNullValues);
            pulledCount++;
        }
    }

    // PHASE 2: Process SQLite rows (push if newer or missing in PG)
    for (const sqliteRow of sqliteRows) {
        const key = table.name === 'journal_entries' ? String(sqliteRow.date) : String(sqliteRow.id);
        const pgRow = pgRowMap.get(key);

        // Determine if we should push this row
        let shouldPush = false;
        if (!pgRow) {
            // Row doesn't exist in PG, push it
            shouldPush = true;
        } else if (sqliteRow.updated_at && pgRow.updated_at) {
            // Both have timestamps, compare them (SQLite wins if newer)
            if (Number(sqliteRow.updated_at) > Number(pgRow.updated_at)) {
                shouldPush = true;
            }
        }

        if (shouldPush) {
            const nonNullCols: string[] = [];
            const nonNullValues: unknown[] = [];

            table.columns.forEach((col) => {
                const val = sqliteRow[col];
                if (val !== undefined && val !== null) {
                    nonNullCols.push(col);
                    if (typeof val === 'object') {
                        nonNullValues.push(JSON.stringify(val));
                    } else {
                        nonNullValues.push(val);
                    }
                }
            });

            const placeholders = nonNullCols.map((_, i) => `$${i + 1}`).join(", ");
            const updateSet = nonNullCols
                .filter(col => col !== "id")
                .map((col) => {
                    const idx = nonNullCols.indexOf(col) + 1;
                    return `${col} = $${idx}`;
                })
                .join(", ");

            const conflictTarget = table.name === 'journal_entries' ? 'date' : 'id';
            const upsertSql = `INSERT INTO ${table.name} (${nonNullCols.join(", ")}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;

            await pgDb.execute(upsertSql, nonNullValues);
            pushedCount++;
        }
    }

    console.log(`[PgSync] ${table.name}: ${pulledCount} pulled, ${pushedCount} pushed`);
    return { pushed: pushedCount, pulled: pulledCount, deleted: 0 };
}

// Sync deletions: merge tombstones bidirectionally with timestamp checks
async function syncDeletions(sqliteDb: Database): Promise<{ pushed: number; pulled: number; deleted: number }> {
    if (!pgDb) return { pushed: 0, pulled: 0, deleted: 0 };

    // Tables that have updated_at column for timestamp comparison
    const tablesWithTimestamp = new Set(['notes', 'todos', 'journal_entries']);

    // Fetch tombstones from both sides
    const pgTombstones = await pgDb.select<{ id: string; table_name: string; deleted_at: number }[]>(
        'SELECT id, table_name, deleted_at FROM deleted_items'
    );

    const localTombstones = await sqliteDb.select<{ id: string; table_name: string; deleted_at: number }[]>(
        'SELECT id, table_name, deleted_at FROM deleted_items'
    );

    // Build maps for O(1) lookup
    const pgTombMap = new Map<string, { table_name: string; deleted_at: number }>();
    pgTombstones.forEach(t => pgTombMap.set(t.id, { table_name: t.table_name, deleted_at: t.deleted_at }));

    const localTombMap = new Map<string, { table_name: string; deleted_at: number }>();
    localTombstones.forEach(t => localTombMap.set(t.id, { table_name: t.table_name, deleted_at: t.deleted_at }));

    let pulledCount = 0;
    let pushedCount = 0;
    let deletedCount = 0;

    // PHASE 1: Process PG tombstones (pull if newer or missing locally)
    for (const tomb of pgTombstones) {
        const localTomb = localTombMap.get(tomb.id);
        
        let shouldPull = false;
        if (!localTomb) {
            // Check if item exists locally
            if (tablesWithTimestamp.has(tomb.table_name)) {
                // Table has updated_at, check timestamp
                const localItem = await sqliteDb.select<{ id: string; updated_at?: number }[]>(
                    `SELECT id, updated_at FROM ${tomb.table_name} WHERE id = ?`,
                    [tomb.id]
                );

                if (localItem.length > 0 && localItem[0].updated_at) {
                    // Item exists locally, check if deletion is newer
                    if (tomb.deleted_at > localItem[0].updated_at) {
                        shouldPull = true;
                    }
                    // else: local item is newer than deletion, keep it
                } else {
                    // Item doesn't exist locally or has no timestamp, accept tombstone
                    shouldPull = true;
                }
            } else {
                // Table doesn't have updated_at, just check existence
                const localItem = await sqliteDb.select<{ id: string }[]>(
                    `SELECT id FROM ${tomb.table_name} WHERE id = ?`,
                    [tomb.id]
                );
                // If item doesn't exist locally, accept tombstone
                shouldPull = localItem.length === 0;
            }
        } else if (tomb.deleted_at > localTomb.deleted_at) {
            // Tombstone exists locally but PG version is newer
            shouldPull = true;
        }

        if (shouldPull) {
            await sqliteDb.execute(
                'INSERT OR REPLACE INTO deleted_items (id, table_name, deleted_at) VALUES (?, ?, ?)',
                [tomb.id, tomb.table_name, tomb.deleted_at]
            );
            
            // Delete from local table
            await sqliteDb.execute(`DELETE FROM ${tomb.table_name} WHERE id = ?`, [tomb.id]);
            pulledCount++;
        }
    }

    // PHASE 2: Process local tombstones (push if newer or missing in PG)
    for (const tomb of localTombstones) {
        const pgTomb = pgTombMap.get(tomb.id);
        
        let shouldPush = false;
        if (!pgTomb) {
            // Check if item exists in PG
            if (tablesWithTimestamp.has(tomb.table_name)) {
                // Table has updated_at, check timestamp
                const pgItem = await pgDb.select<{ id: string; updated_at?: number }[]>(
                    `SELECT id, updated_at FROM ${tomb.table_name} WHERE id = $1`,
                    [tomb.id]
                );

                if (pgItem.length > 0 && pgItem[0].updated_at) {
                    // Item exists in PG, check if deletion is newer
                    if (tomb.deleted_at > pgItem[0].updated_at) {
                        shouldPush = true;
                    }
                    // else: PG item is newer than deletion, keep it
                } else {
                    // Item doesn't exist in PG or has no timestamp, push tombstone
                    shouldPush = true;
                }
            } else {
                // Table doesn't have updated_at, just check existence
                const pgItem = await pgDb.select<{ id: string }[]>(
                    `SELECT id FROM ${tomb.table_name} WHERE id = $1`,
                    [tomb.id]
                );
                // If item doesn't exist in PG, push tombstone
                shouldPush = pgItem.length === 0;
            }
        } else if (tomb.deleted_at > pgTomb.deleted_at) {
            // Tombstone exists in PG but local version is newer
            shouldPush = true;
        }

        if (shouldPush) {
            // Insert tombstone into PG
            await pgDb.execute(
                'INSERT INTO deleted_items (id, table_name, deleted_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET deleted_at = $3',
                [tomb.id, tomb.table_name, tomb.deleted_at]
            );
            pushedCount++;

            // Delete from PG table
            try {
                await pgDb.execute(`DELETE FROM ${tomb.table_name} WHERE id = $1`, [tomb.id]);
                deletedCount++;
            } catch (e) {
                // Item may not exist in PG, that's fine
            }
        }
    }

    // PHASE 3: Cleanup old tombstones (>30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    await sqliteDb.execute('DELETE FROM deleted_items WHERE deleted_at < ?', [thirtyDaysAgo]);
    await pgDb.execute('DELETE FROM deleted_items WHERE deleted_at < $1', [thirtyDaysAgo]);

    console.log(`[PgSync] deleted_items: ${pulledCount} pulled, ${pushedCount} pushed, ${deletedCount} deleted from PG`);
    return { pushed: pushedCount, pulled: pulledCount, deleted: deletedCount };
}

export async function syncAllTables(): Promise<void> {
    if (isSyncing) {
        console.log("[PgSync] Sync already in progress, skipping");
        return;
    }

    // If not connected yet, try to connect first
    if (!pgDb) {
        try {
            await initPgSync();
        } catch {
            toast.error("PostgreSQL sync failed", { description: "Could not connect to database" });
            return;
        }
        if (!pgDb) {
            toast.error("PostgreSQL sync failed", { description: "Database not connected" });
            return;
        }
    }

    isSyncing = true;

    try {
        const sqliteDb = await getDb();
        if (!sqliteDb) {
            console.warn("[PgSync] SQLite handle not ready, skipping sync");
            toast.error("Sync failed", { description: "Local database not ready" });
            return;
        }

        const start = performance.now();
        let totalPushed = 0;
        let totalPulled = 0;
        let failedTables = 0;

        for (const table of TABLES) {
            try {
                const result = await syncTable(sqliteDb as Database, table);
                totalPushed += result.pushed;
                totalPulled += result.pulled;
            } catch (err) {
                console.error(`[PgSync] Failed to sync ${table.name}:`, err);
                failedTables++;
            }
        }

        const elapsed = (performance.now() - start).toFixed(0);
        console.log(`[PgSync] Sync complete: ${totalPulled} pulled, ${totalPushed} pushed in ${elapsed}ms`);

        if (failedTables > 0) {
            toast.warning("Partial sync", {
                description: `${TABLES.length - failedTables}/${TABLES.length} tables synced (↓${totalPulled} ↑${totalPushed}, ${elapsed}ms)`,
            });
        } else {
            toast.success("Sync complete", {
                description: `↓${totalPulled} pulled, ↑${totalPushed} pushed (${elapsed}ms)`,
            });
        }
    } catch (err) {
        console.error("[PgSync] Sync failed:", err);
        toast.error("Sync failed", { description: String(err) });
    } finally {
        isSyncing = false;
    }
}

// ─── Public API ─────────────────────────────────────────────────
export async function initPgSync(): Promise<void> {
    if (!PG_URL) {
        console.warn("[PgSync] VITE_DATABASE_URL not set, PostgreSQL sync disabled");
        return;
    }

    // Only run in Tauri environment
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
        console.log("[PgSync] Not in Tauri environment, skipping");
        return;
    }

    try {
        console.log(`[PgSync] Connecting to PostgreSQL... (URL prefix: ${PG_URL.split("@")[0]}@***)`);
        pgDb = await Database.load(PG_URL);
        pgConnected = true;
        console.log("[PgSync] Connected to PostgreSQL");

        // Create tables if they don't exist
        for (const stmt of PG_CREATE_TABLES) {
            await pgDb.execute(stmt);
        }
        console.log("[PgSync] Schema ensured");

        // Migration: Add new columns to existing tables
        try {
            await pgDb.execute(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS expected_schedule_data TEXT`);
            await pgDb.execute(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS actual_schedule_data TEXT`);
            await pgDb.execute(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS updated_at BIGINT`);
            console.log("[PgSync] Migration: Added schedule_data and updated_at columns");
        } catch (e) {
            // PostgreSQL doesn't support IF NOT EXISTS in older versions, ignore if columns exist
            console.log("[PgSync] Migration: Columns may already exist");
        }

        // Initial bidirectional sync on startup (Last-Write-Wins based on updated_at)
        console.log("[PgSync] Starting initial bidirectional sync (timestamp-based merge)");
        await syncAllTables();

        // Schedule periodic sync every 1 hour
        if (!syncTimer) {
            syncTimer = setInterval(syncAllTables, SYNC_INTERVAL_MS);
            console.log(`[PgSync] Scheduled sync every ${SYNC_INTERVAL_MS / 1000 / 60} minutes`);
        }
    } catch (err) {
        pgConnected = false;
        console.error("[PgSync] Initialization failed:", err);
        toast.error("PostgreSQL connection failed", {
            description: String(err),
        });
    }
}

export function stopPgSync(): void {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    pgDb = null;
    pgConnected = false;
    console.log("[PgSync] Stopped");
}
