import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createAnimal, updateAnimalStatus, updateAnimalStage, updateAnimal, deleteAnimal } from './api';

describe('animals api', () => {
  beforeEach(async () => {
    await db.animals.clear();
  });

  it('createAnimal stores a new unsynced active animal', async () => {
    const id = await createAnimal({ type: 'pig', tag: 'P-01', birth_date: null, notes: null });
    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ type: 'pig', tag: 'P-01', status: 'active', synced: 0 });
  });

  it('updateAnimalStatus updates status and marks unsynced', async () => {
    const id = await createAnimal({ type: 'goat', tag: 'G-01', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1 });

    await updateAnimalStatus(id, 'sold');

    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ status: 'sold', synced: 0 });
  });

  it('updateAnimalStage sets the stage and marks unsynced', async () => {
    const id = await createAnimal({ type: 'pig', tag: 'P-02', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1 });

    await updateAnimalStage(id, 'grower');

    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ stage: 'grower', synced: 0 });
  });

  it('updateAnimal patches given fields, bumps updated_at, and marks unsynced', async () => {
    const id = await createAnimal({ type: 'pig', tag: 'P-03', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await updateAnimal(id, { tag: 'P-03-renamed', type: 'goat' });

    const stored = await db.animals.get(id);
    expect(stored).toMatchObject({ tag: 'P-03-renamed', type: 'goat', synced: 0 });
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('deleteAnimal sets deleted_at, bumps updated_at, and marks unsynced', async () => {
    const id = await createAnimal({ type: 'goat', tag: 'G-02', birth_date: null, notes: null });
    await db.animals.update(id, { synced: 1, updated_at: '2020-01-01T00:00:00.000Z' });

    await deleteAnimal(id);

    const stored = await db.animals.get(id);
    expect(stored!.deleted_at).toBeTruthy();
    expect(stored!.synced).toBe(0);
    expect(stored!.updated_at).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
