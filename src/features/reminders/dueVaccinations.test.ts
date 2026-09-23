import { describe, it, expect } from 'vitest';
import { getDueVaccinations } from './dueVaccinations';
import type { LocalEvent, LocalAnimal } from '../../lib/db';

function makeEvent(overrides: Partial<LocalEvent>): LocalEvent {
  return {
    id: 'e', client_id: 'e', event_type: 'vaccination', entity_type: 'animal', entity_id: 'a1',
    event_date: '2026-01-01', amount: null, category: null, notes: null, metadata: {},
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', synced: 0,
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

describe('getDueVaccinations', () => {
  it('returns an empty array for empty input', () => {
    expect(getDueVaccinations([], [], '2026-06-01')).toEqual([]);
  });

  it('excludes a vaccination with no next_due_date', () => {
    const events = [makeEvent({ metadata: {} })];
    expect(getDueVaccinations(events, [makeAnimal({})], '2026-06-01')).toEqual([]);
  });

  it('excludes a next_due_date in the future', () => {
    const events = [makeEvent({ metadata: { next_due_date: '2026-12-01' } })];
    expect(getDueVaccinations(events, [makeAnimal({})], '2026-06-01')).toEqual([]);
  });

  it('includes a next_due_date exactly today or in the past', () => {
    const today = [makeEvent({ id: 'e1', metadata: { next_due_date: '2026-06-01' } })];
    expect(getDueVaccinations(today, [makeAnimal({})], '2026-06-01')).toHaveLength(1);

    const past = [makeEvent({ id: 'e1', metadata: { next_due_date: '2026-01-01' } })];
    expect(getDueVaccinations(past, [makeAnimal({})], '2026-06-01')).toHaveLength(1);
  });

  it('uses only the latest vaccination event per animal', () => {
    const events = [
      makeEvent({ id: 'old', event_date: '2026-01-01', metadata: { next_due_date: '2026-02-01' } }),
      makeEvent({ id: 'new', event_date: '2026-03-01', metadata: {} }),
    ];
    // The latest event has no next_due_date, so nothing should be due, even though
    // an earlier vaccination's due date has since passed.
    expect(getDueVaccinations(events, [makeAnimal({})], '2026-06-01')).toEqual([]);
  });

  it('excludes an inactive animal even with a past-due date', () => {
    const events = [makeEvent({ metadata: { next_due_date: '2026-01-01' } })];
    const animals = [makeAnimal({ status: 'sold' })];
    expect(getDueVaccinations(events, animals, '2026-06-01')).toEqual([]);
  });

  it('sorts results by dueDate ascending', () => {
    const events = [
      makeEvent({ id: 'e1', entity_id: 'a1', metadata: { next_due_date: '2026-05-01' } }),
      makeEvent({ id: 'e2', entity_id: 'a2', metadata: { next_due_date: '2026-01-01' } }),
    ];
    const animals = [
      makeAnimal({ id: 'a1', tag: 'P-01' }),
      makeAnimal({ id: 'a2', tag: 'P-02' }),
    ];

    const result = getDueVaccinations(events, animals, '2026-06-01');
    expect(result.map((r) => r.tag)).toEqual(['P-02', 'P-01']);
  });
});
