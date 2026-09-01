import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../lib/db';
import { createAnimal, updateAnimalStatus, updateAnimalStage } from './api';

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
});
