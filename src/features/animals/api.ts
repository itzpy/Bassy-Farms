import { db } from '../../lib/db';
import type { AnimalType, AnimalStatus } from '../../lib/types';

export interface NewAnimalInput {
  type: AnimalType;
  tag: string;
  birth_date: string | null;
  notes: string | null;
}

export async function createAnimal(input: NewAnimalInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.animals.put({
    id,
    type: input.type,
    tag: input.tag,
    birth_date: input.birth_date,
    status: 'active',
    notes: input.notes,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}

export async function updateAnimalStatus(id: string, status: AnimalStatus): Promise<void> {
  await db.animals.update(id, { status, updated_at: new Date().toISOString(), synced: 0 });
}
