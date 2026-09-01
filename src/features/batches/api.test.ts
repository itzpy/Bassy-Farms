import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createBatch } from './api';

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
});
