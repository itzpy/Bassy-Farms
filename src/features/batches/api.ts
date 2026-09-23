import { db } from '../../lib/db';

export interface NewBatchInput {
  name: string;
  purchase_date: string;
  initial_count: number;
  purchase_cost: number | null;
  notes: string | null;
}

export async function createBatch(input: NewBatchInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batches.put({
    id,
    name: input.name,
    purchase_date: input.purchase_date,
    initial_count: input.initial_count,
    purchase_cost: input.purchase_cost,
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}

export async function updateBatch(id: string, patch: Partial<NewBatchInput>): Promise<void> {
  await db.batches.update(id, { ...patch, updated_at: new Date().toISOString(), synced: 0 });
}

export async function deleteBatch(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.batches.update(id, { deleted_at: now, updated_at: now, synced: 0 });
}
