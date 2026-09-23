import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createEvent, updateEvent, deleteEvent } from './api';

describe('events api', () => {
  beforeEach(async () => {
    await db.events.clear();
  });

  it('createEvent stores an unsynced event with matching client_id and id', async () => {
    const id = await createEvent({
      event_type: 'feeding',
      entity_type: 'animal',
      entity_id: 'a1',
      event_date: '2026-08-31',
      amount: null,
      category: null,
      notes: 'Morning feed',
      metadata: {},
    });

    const stored = await db.events.get(id);
    expect(stored).toMatchObject({
      id,
      client_id: id,
      event_type: 'feeding',
      entity_id: 'a1',
      synced: 0,
    });
  });

  it('updateEvent patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createEvent({
      event_type: 'feeding', entity_type: 'animal', entity_id: 'a1',
      event_date: '2026-08-31', amount: null, category: null, notes: 'Morning feed', metadata: {},
    });
    await db.events.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updateEvent(id, {
      event_date: '2026-09-01', notes: 'Updated note', metadata: { feed_type: 'starter' },
    });

    const stored = await db.events.get(id);
    expect(stored).toMatchObject({
      event_date: '2026-09-01', notes: 'Updated note', metadata: { feed_type: 'starter' }, synced: 0,
    });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteEvent sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createEvent({
      event_type: 'expense', entity_type: 'farm', entity_id: null,
      event_date: '2026-08-31', amount: 10, category: null, notes: null, metadata: {},
    });
    await db.events.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deleteEvent(id);

    const stored = await db.events.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
