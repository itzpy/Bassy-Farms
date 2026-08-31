import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from './supabase';
import { pushTable, pullTable, resetSyncCursors } from './sync';

describe('pushTable', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('upserts unsynced records and marks them synced on success', async () => {
    await db.animals.put({
      id: 'a1',
      type: 'pig',
      tag: 'P-01',
      birth_date: null,
      status: 'active',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });

    await pushTable('animals');

    expect(supabase.from).toHaveBeenCalledWith('animals');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1', tag: 'P-01' }),
      { onConflict: 'id' }
    );
    const stored = await db.animals.get('a1');
    expect(stored?.synced).toBe(1);
  });

  it('leaves a record unsynced if the upsert fails', async () => {
    await db.animals.put({
      id: 'a2',
      type: 'goat',
      tag: 'G-01',
      birth_date: null,
      status: 'active',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      synced: 0,
    });

    const upsert = vi.fn().mockResolvedValue({ error: { message: 'network error' } });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ upsert });

    await pushTable('animals');

    const stored = await db.animals.get('a2');
    expect(stored?.synced).toBe(0);
  });
});

describe('pullTable', () => {
  beforeEach(async () => {
    await db.animals.clear();
    resetSyncCursors();
  });

  it('upserts remote records into the local table as synced', async () => {
    const gt = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'a3',
          type: 'pig',
          tag: 'P-03',
          birth_date: null,
          status: 'active',
          notes: null,
          created_at: '2026-02-01T00:00:00.000Z',
          updated_at: '2026-02-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ gt });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select });

    await pullTable('animals');

    const stored = await db.animals.get('a3');
    expect(stored).toMatchObject({ id: 'a3', tag: 'P-03', synced: 1 });
  });
});
