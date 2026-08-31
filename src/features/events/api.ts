import { db } from '../../lib/db';
import type { EventType, EntityType } from '../../lib/types';

export interface NewEventInput {
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string | null;
  event_date: string;
  amount: number | null;
  category: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}

export async function createEvent(input: NewEventInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.events.put({
    id,
    client_id: id,
    event_type: input.event_type,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    event_date: input.event_date,
    amount: input.amount,
    category: input.category,
    notes: input.notes,
    metadata: input.metadata,
    created_at: now,
    updated_at: now,
    synced: 0,
  });
  return id;
}
