import { getDb } from './db';

/**
 * Soft delete: Mark item as deleted instead of hard delete
 * This allows sync to propagate deletions across devices
 */
export async function softDelete(tableName: string, id: string): Promise<void> {
    const db = await getDb();
    const now = Date.now();
    
    // Insert tombstone
    await db.execute(
        'INSERT OR REPLACE INTO deleted_items (id, table_name, deleted_at) VALUES (?, ?, ?)',
        [id, tableName, now]
    );
    
    // Hard delete from table
    await db.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
}

/**
 * Check if an item is deleted
 */
export async function isDeleted(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.select<{ id: string }[]>(
        'SELECT id FROM deleted_items WHERE id = ?',
        [id]
    );
    return result.length > 0;
}
