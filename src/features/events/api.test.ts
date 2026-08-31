import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createEvent } from './api';

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
});
