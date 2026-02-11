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
        columns: ["id", "text", "completed", "description", "priority", "labels", "urgent", "due_date", "created_at"],
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
        created_at BIGINT
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
];


// ─── Core Sync ──────────────────────────────────────────────────
async function syncTable(sqliteDb: Database, table: TableDef): Promise<number> {
    if (!pgDb) return 0;

    const rows = await sqliteDb.select<Record<string, unknown>[]>(
        `SELECT ${table.columns.join(", ")} FROM ${table.name}`
    );

    if (rows.length === 0) {
        console.log(`[PgSync] ${table.name}: 0 rows, skipping`);
        return 0;
    }

    for (const row of rows) {
        // Build dynamic SQL to handle nulls properly
        // Tauri SQL plugin serializes params as JSON, so null becomes JSONB null
        // Workaround: only include non-null columns in the query
        const nonNullCols: string[] = [];
        const nonNullValues: unknown[] = [];
        
        table.columns.forEach((col) => {
            const val = row[col];
            if (val !== undefined && val !== null) {
                nonNullCols.push(col);
                // Stringify objects/arrays for TEXT columns
                if (typeof val === 'object') {
                    nonNullValues.push(JSON.stringify(val));
                } else {
                    nonNullValues.push(val);
                }
            }
        });

        // Build upsert with only non-null columns
        const placeholders = nonNullCols.map((_, i) => `$${i + 1}`).join(", ");
        const updateSet = nonNullCols
            .filter(col => col !== "id")
            .map((col) => {
                const idx = nonNullCols.indexOf(col) + 1;
                return `${col} = $${idx}`;
            })
            .join(", ");

        const upsertSql = `INSERT INTO ${table.name} (${nonNullCols.join(", ")}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`;
        
        await pgDb.execute(upsertSql, nonNullValues);
    }

    console.log(`[PgSync] ${table.name}: ${rows.length} rows synced`);
    return rows.length;
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
        let totalRows = 0;
        let failedTables = 0;

        for (const table of TABLES) {
            try {
                totalRows += await syncTable(sqliteDb as Database, table);
            } catch (err) {
                console.error(`[PgSync] Failed to sync ${table.name}:`, err);
                failedTables++;
            }
        }

        const elapsed = (performance.now() - start).toFixed(0);
        console.log(`[PgSync] Sync complete: ${totalRows} total rows in ${elapsed}ms`);

        if (failedTables > 0) {
            toast.warning("Partial sync", {
                description: `${TABLES.length - failedTables}/${TABLES.length} tables synced (${totalRows} rows, ${elapsed}ms)`,
            });
        } else {
            toast.success("Sync complete", {
                description: `${totalRows} rows synced in ${elapsed}ms`,
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
            console.log("[PgSync] Migration: Added schedule_data columns");
        } catch (e) {
            // PostgreSQL doesn't support IF NOT EXISTS in older versions, ignore if columns exist
            console.log("[PgSync] Migration: Columns may already exist");
        }

        // Initial sync on startup
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
