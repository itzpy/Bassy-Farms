import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from './db';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from './supabase';
import { pushTable } from './sync';

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
