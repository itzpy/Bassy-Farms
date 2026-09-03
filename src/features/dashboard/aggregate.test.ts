import { describe, it, expect } from 'vitest';
import { aggregateProfitability } from './aggregate';
import type { LocalEvent, LocalAnimal, LocalBatch } from '../../lib/db';

function makeEvent(overrides: Partial<LocalEvent>): LocalEvent {
  return {
    id: 'e', client_id: 'e', event_type: 'expense', entity_type: 'animal', entity_id: 'a1',
    event_date: '2026-02-15', amount: 0, category: null, notes: null, metadata: {},
    created_at: '2026-02-15T00:00:00.000Z', updated_at: '2026-02-15T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

function makeAnimal(overrides: Partial<LocalAnimal>): LocalAnimal {
  return {
    id: 'a1', type: 'pig', tag: 'P-01', birth_date: null, status: 'active', notes: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

function makeBatch(overrides: Partial<LocalBatch>): LocalBatch {
  return {
    id: 'b1', name: 'Batch A', purchase_date: '2026-01-01', initial_count: 10,
    purchase_cost: 500, notes: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
    ...overrides,
  };
}

const BUCKET_LABELS = ['Pigs', 'Goats', 'Batches', 'Plots', 'Farm-wide'];

describe('aggregateProfitability', () => {
  it('returns all 5 zeroed buckets and a zeroed overall for empty input', () => {
    const result = aggregateProfitability([], [], [], '2026-02-01', '2026-02-28');

    expect(result.buckets.map((b) => b.label)).toEqual(BUCKET_LABELS);
    for (const bucket of result.buckets) {
      expect(bucket).toMatchObject({ cost: 0, revenue: 0, profit: 0 });
    }
    expect(result.overall).toMatchObject({ label: 'Overall', cost: 0, revenue: 0, profit: 0 });
  });

  it('includes events exactly on the from/to boundaries, excludes events one day outside', () => {
    const events = [
      makeEvent({ id: 'on-from', event_date: '2026-02-01', amount: 10 }),
      makeEvent({ id: 'on-to', event_date: '2026-02-28', amount: 20 }),
      makeEvent({ id: 'before', event_date: '2026-01-31', amount: 999 }),
      makeEvent({ id: 'after', event_date: '2026-03-01', amount: 999 }),
    ];

    const result = aggregateProfitability(events, [makeAnimal({})], [], '2026-02-01', '2026-02-28');

    const pigs = result.buckets.find((b) => b.label === 'Pigs')!;
    expect(pigs.cost).toBe(30);
  });

  it('routes a pig expense to Pigs and a goat expense to Goats using the animals array', () => {
    const events = [
      makeEvent({ id: 'pig-e', entity_id: 'a1', amount: 15 }),
      makeEvent({ id: 'goat-e', entity_id: 'a2', amount: 25 }),
    ];
    const animals = [
      makeAnimal({ id: 'a1', type: 'pig' }),
      makeAnimal({ id: 'a2', type: 'goat', tag: 'G-01' }),
    ];

    const result = aggregateProfitability(events, animals, [], '2026-02-01', '2026-02-28');

    expect(result.buckets.find((b) => b.label === 'Pigs')!.cost).toBe(15);
    expect(result.buckets.find((b) => b.label === 'Goats')!.cost).toBe(25);
  });

  it('routes batch/plot/farm events to their respective buckets', () => {
    const events = [
      makeEvent({ id: 'batch-e', entity_type: 'batch', entity_id: 'b1', event_type: 'sale', amount: 100 }),
      makeEvent({ id: 'plot-e', entity_type: 'plot', entity_id: 'p1', event_type: 'expense', amount: 40 }),
      makeEvent({ id: 'farm-e', entity_type: 'farm', entity_id: null, event_type: 'expense', amount: 60 }),
    ];

    const result = aggregateProfitability(events, [], [], '2026-02-01', '2026-02-28');

    expect(result.buckets.find((b) => b.label === 'Batches')!.revenue).toBe(100);
    expect(result.buckets.find((b) => b.label === 'Plots')!.cost).toBe(40);
    expect(result.buckets.find((b) => b.label === 'Farm-wide')!.cost).toBe(60);
  });

  it('ignores non-expense/sale event types', () => {
    const events = [
      makeEvent({ id: 'feeding', event_type: 'feeding', amount: null }),
    ];

    const result = aggregateProfitability(events, [makeAnimal({})], [], '2026-02-01', '2026-02-28');

    const pigs = result.buckets.find((b) => b.label === 'Pigs')!;
    expect(pigs).toMatchObject({ cost: 0, revenue: 0, profit: 0 });
  });

  it('includes a batch purchase_cost in Batches when purchase_date is in range, excludes when out of range', () => {
    const inRange = aggregateProfitability(
      [], [], [makeBatch({ id: 'b1', purchase_date: '2026-02-10', purchase_cost: 500 })],
      '2026-02-01', '2026-02-28'
    );
    expect(inRange.buckets.find((b) => b.label === 'Batches')!.cost).toBe(500);

    const outOfRange = aggregateProfitability(
      [], [], [makeBatch({ id: 'b1', purchase_date: '2026-01-10', purchase_cost: 500 })],
      '2026-02-01', '2026-02-28'
    );
    expect(outOfRange.buckets.find((b) => b.label === 'Batches')!.cost).toBe(0);
  });

  it('sums all buckets into overall, and computes profit as revenue minus cost per bucket', () => {
    const events = [
      makeEvent({ id: 'pig-expense', entity_id: 'a1', event_type: 'expense', amount: 10 }),
      makeEvent({ id: 'pig-sale', entity_id: 'a1', event_type: 'sale', amount: 50 }),
      makeEvent({ id: 'plot-expense', entity_type: 'plot', entity_id: 'p1', event_type: 'expense', amount: 5 }),
    ];

    const result = aggregateProfitability(events, [makeAnimal({})], [], '2026-02-01', '2026-02-28');

    const pigs = result.buckets.find((b) => b.label === 'Pigs')!;
    expect(pigs).toMatchObject({ cost: 10, revenue: 50, profit: 40 });
    expect(result.overall).toMatchObject({ cost: 15, revenue: 50, profit: 35 });
  });
});
