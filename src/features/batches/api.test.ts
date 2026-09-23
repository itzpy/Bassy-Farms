import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createBatch, updateBatch, deleteBatch } from './api';

describe('batches api', () => {
  beforeEach(async () => {
    await db.batches.clear();
  });

  it('createBatch stores a new unsynced batch', async () => {
    const id = await createBatch({
      name: 'Batch A',
      purchase_date: '2026-09-01',
      initial_count: 10,
      purchase_cost: 500,
      notes: null,
    });
    const stored = await db.batches.get(id);
    expect(stored).toMatchObject({
      name: 'Batch A',
      purchase_date: '2026-09-01',
      initial_count: 10,
      purchase_cost: 500,
      synced: 0,
    });
  });

  it('updateBatch patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createBatch({
      name: 'Batch A', purchase_date: '2026-09-01', initial_count: 10, purchase_cost: 500, notes: null,
    });
    await db.batches.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updateBatch(id, { name: 'Batch A renamed', initial_count: 12 });

    const stored = await db.batches.get(id);
    expect(stored).toMatchObject({ name: 'Batch A renamed', initial_count: 12, synced: 0 });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteBatch sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createBatch({
      name: 'Batch B', purchase_date: '2026-09-01', initial_count: 5, purchase_cost: null, notes: null,
    });
    await db.batches.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deleteBatch(id);

    const stored = await db.batches.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
