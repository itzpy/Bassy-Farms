import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createPlot, updatePlot, deletePlot } from './api';

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

  it('updatePlot patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createPlot({
      name: 'North Field', crop_type: 'Maize', planted_date: '2026-04-01', area: 2.5, notes: null,
    });
    await db.plots.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updatePlot(id, { name: 'North Field renamed', area: 3 });

    const stored = await db.plots.get(id);
    expect(stored).toMatchObject({ name: 'North Field renamed', area: 3, synced: 0 });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deletePlot sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createPlot({
      name: 'South Field', crop_type: null, planted_date: null, area: null, notes: null,
    });
    await db.plots.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deletePlot(id);

    const stored = await db.plots.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
