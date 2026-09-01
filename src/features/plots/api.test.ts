import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createPlot } from './api';

describe('plots api', () => {
  beforeEach(async () => {
    await db.plots.clear();
  });

  it('createPlot stores a new unsynced plot', async () => {
    const id = await createPlot({
      name: 'North Field',
      crop_type: 'Maize',
      planted_date: '2026-04-01',
      area: 2.5,
      notes: null,
    });
    const stored = await db.plots.get(id);
    expect(stored).toMatchObject({
      name: 'North Field',
      crop_type: 'Maize',
      planted_date: '2026-04-01',
      area: 2.5,
      synced: 0,
    });
  });
});
