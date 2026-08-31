import { db } from './db';
import { supabase } from './supabase';

export const SYNC_TABLES = ['animals', 'plots', 'events'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

function localTable(table: SyncTable) {
  return db[table];
}

export async function pushTable(table: SyncTable): Promise<void> {
  const unsynced = await localTable(table).where('synced').equals(0).toArray();

  for (const record of unsynced) {
    const { synced, ...remoteRecord } = record;
    const { error } = await supabase.from(table).upsert(remoteRecord, { onConflict: 'id' });
    if (!error) {
      await localTable(table).update(record.id, { synced: 1 });
    }
  }
}
