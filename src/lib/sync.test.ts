import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from './db';

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from './supabase';
import { pushTable, pullTable, resetSyncCursors, syncAll, unsyncedCount, startSyncLoop } from './sync';

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

describe('unsyncedCount', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.plots.clear();
    await db.events.clear();
  });

  it('sums unsynced records across all tables', async () => {
    await db.animals.put({
      id: 'a4', type: 'pig', tag: 'P-04', birth_date: null, status: 'active',
      notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.events.put({
      id: 'e1', client_id: 'e1', event_type: 'feeding', entity_type: 'animal', entity_id: 'a4',
      event_date: '2026-01-01', amount: null, category: null, notes: null, metadata: {},
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    const count = await unsyncedCount();
    expect(count).toBe(2);
  });
});

describe('syncAll reentrancy guard', () => {
  beforeEach(async () => {
    await db.animals.clear();
    await db.plots.clear();
    await db.events.clear();
    resetSyncCursors();
  });

  it('blocks a concurrent syncAll from reaching a later table, not just the stalled one', async () => {
    // The first syncAll() is stalled inside pushTable('animals')'s upsert
    // (there's an unsynced animals record so the upsert actually fires).
    // A SEPARATE unsynced record lives in `plots`, a table SYNC_TABLES
    // processes *after* animals. pushTable's own per-table `pushInProgress`
    // guard only ever covers 'animals' at this point (it's set synchronously
    // before the first await, so the stalled call already holds it) — it says
    // nothing about 'plots'. So if syncAllInProgress did NOT exist, the second
    // syncAll() call's pushTable('animals') would merely no-op on that guard,
    // then continue on to pushTable('plots') and call its upsert. Asserting
    // that never happens isolates syncAllInProgress specifically, independent
    // of pushTable's per-table guard.
    let resolveAnimalsUpsert: (value: { error: null }) => void = () => {};
    const animalsUpsert = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveAnimalsUpsert = resolve;
        })
    );
    const animalsGt = vi.fn().mockResolvedValue({ data: [], error: null });
    const animalsSelect = vi.fn().mockReturnValue({ gt: animalsGt });

    const plotsUpsert = vi.fn().mockResolvedValue({ error: null });
    const plotsGt = vi.fn().mockResolvedValue({ data: [], error: null });
    const plotsSelect = vi.fn().mockReturnValue({ gt: plotsGt });

    const eventsUpsert = vi.fn().mockResolvedValue({ error: null });
    const eventsGt = vi.fn().mockResolvedValue({ data: [], error: null });
    const eventsSelect = vi.fn().mockReturnValue({ gt: eventsGt });

    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'animals') return { upsert: animalsUpsert, select: animalsSelect };
      if (table === 'plots') return { upsert: plotsUpsert, select: plotsSelect };
      return { upsert: eventsUpsert, select: eventsSelect };
    });

    // Seed an unsynced animals record so pushTable('animals') actually calls
    // upsert (and stalls on it), plus a separate unsynced record in `plots` —
    // a table processed *after* animals — to prove the guard, not just an
    // unsynced-record check.
    await db.animals.put({
      id: 'a5', type: 'pig', tag: 'P-05', birth_date: null, status: 'active',
      notes: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });
    await db.plots.put({
      id: 'p1', name: 'North Field', crop_type: null, planted_date: null, area: null, notes: null,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    });

    const first = syncAll();

    // Wait for the first sync cycle to actually reach the stalled animals upsert.
    await vi.waitFor(() => {
      expect(animalsUpsert).toHaveBeenCalled();
    });

    const second = syncAll(); // should no-op immediately since first is still in-flight
    await second; // resolves right away because of the reentrancy guard

    // The second call must not have reached plots at all.
    expect(plotsUpsert).not.toHaveBeenCalled();

    // Unblock the first call and let it run to completion.
    resolveAnimalsUpsert({ error: null });
    await first;

    // Now that the (only) in-flight syncAll has finished its own traversal,
    // it should have reached and pushed the plots record itself.
    expect(plotsUpsert).toHaveBeenCalled();
  });
});

describe('startSyncLoop', () => {
  // Only setInterval/clearInterval are faked so real async work (IndexedDB via
  // Dexie/fake-indexeddb, and the mocked supabase promises) keeps flowing on its
  // own (real, unfaked) timers. A single macrotask tick isn't always enough to
  // drain a whole syncAll() cycle (3 tables x push+pull, each round-tripping
  // through fake-indexeddb), so wait for the call count to actually reach the
  // expected value instead of guessing how many ticks are needed.
  const waitForCallCount = (n: number) =>
    vi.waitFor(
      () => {
        expect(supabase.from).toHaveBeenCalledTimes(n);
      },
      { timeout: 2000, interval: 10 }
    );
  const realDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await db.animals.clear();
    await db.plots.clear();
    await db.events.clear();
    resetSyncCursors();

    // No unsynced records exist (tables were just cleared), so pushTable makes
    // zero supabase calls per table; pullTable makes exactly one (`select().gt()`)
    // per table. That gives a clean, predictable "3 calls == one syncAll ran".
    (supabase.from as ReturnType<typeof vi.fn>).mockReset();
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        gt: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediately, on the online event, and on each interval tick; cleanup stops both', async () => {
    const cleanup = startSyncLoop(1000);

    // (a) triggers a sync immediately, synchronously on call.
    await waitForCallCount(3);

    // (b) triggers again on the 'online' event.
    window.dispatchEvent(new Event('online'));
    await waitForCallCount(6);

    // (c) triggers again on each interval tick.
    vi.advanceTimersByTime(1000);
    await waitForCallCount(9);

    vi.advanceTimersByTime(1000);
    await waitForCallCount(12);

    // (d) cleanup stops BOTH future interval ticks AND future 'online' events.
    cleanup();

    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(5000);
    await realDelay(100);
    expect(supabase.from).toHaveBeenCalledTimes(12);
  });
});
