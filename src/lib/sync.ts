import { db } from './db';
import { supabase } from './supabase';

export const SYNC_TABLES = ['animals', 'plots', 'events'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

function localTable(table: SyncTable) {
  return db[table];
}

const pushInProgress = new Set<SyncTable>();

export async function pushTable(table: SyncTable): Promise<void> {
  if (pushInProgress.has(table)) {
    return;
  }
  pushInProgress.add(table);

  try {
    const unsynced = await localTable(table).where('synced').equals(0).toArray();

    for (const record of unsynced) {
      const { synced, ...remoteRecord } = record;
      // Conflict target is `id`, not `client_id`: `id` is generated client-side at
      // creation time (animals/api.ts, events/api.ts) and never regenerated, so it's
      // already a stable idempotency key across all three tables. `client_id` on the
      // `events` table is a redundant belt-and-suspenders column, not the sync key.
      const { error } = await supabase.from(table).upsert(remoteRecord, { onConflict: 'id' });
      if (!error) {
        await localTable(table).update(record.id, { synced: 1 });
      } else {
        console.error(`[sync] push failed for table "${table}":`, error);
      }
    }
  } finally {
    pushInProgress.delete(table);
  }
}

const EPOCH = new Date(0).toISOString();

let lastPullAt: Record<SyncTable, string> = {
  animals: EPOCH,
  plots: EPOCH,
  events: EPOCH,
};

export function resetSyncCursors(): void {
  lastPullAt = { animals: EPOCH, plots: EPOCH, events: EPOCH };
}

export async function pullTable(table: SyncTable): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gt('updated_at', lastPullAt[table]);

  if (error || !data) return;

  for (const remote of data as Array<Record<string, unknown> & { id: string; updated_at: string }>) {
    await localTable(table).put({ ...remote, synced: 1 } as never);
    if (remote.updated_at > lastPullAt[table]) {
      lastPullAt[table] = remote.updated_at;
    }
  }
}
