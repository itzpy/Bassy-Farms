export type AnimalType = 'pig' | 'goat';
export type AnimalStatus = 'active' | 'sold' | 'deceased';

export interface Animal {
  id: string;
  type: AnimalType;
  tag: string;
  birth_date: string | null;
  status: AnimalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plot {
  id: string;
  name: string;
  crop_type: string | null;
  planted_date: string | null;
  area: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EventType =
  | 'feeding'
  | 'vaccination'
  | 'weight'
  | 'health_check'
  | 'breeding'
  | 'death'
  | 'planting'
  | 'harvest'
  | 'expense'
  | 'sale';

export type EntityType = 'animal' | 'plot' | 'farm';

export interface FarmEvent {
  id: string;
  client_id: string;
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string | null;
  event_date: string;
  amount: number | null;
  category: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
