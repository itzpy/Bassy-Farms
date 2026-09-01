import Dexie, { type Table } from 'dexie';
import type { Animal, Plot, FarmEvent, Batch } from './types';

export interface LocalAnimal extends Animal {
  synced: 0 | 1;
}
export interface LocalPlot extends Plot {
  synced: 0 | 1;
}
export interface LocalEvent extends FarmEvent {
  synced: 0 | 1;
}
export interface LocalBatch extends Batch {
  synced: 0 | 1;
}

export class FarmDB extends Dexie {
  animals!: Table<LocalAnimal, string>;
  plots!: Table<LocalPlot, string>;
  events!: Table<LocalEvent, string>;
  batches!: Table<LocalBatch, string>;

  constructor() {
    super('farm-db');
    this.version(1).stores({
      animals: 'id, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
    });
    this.version(2).stores({
      animals: 'id, tag, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
    });
    this.version(3).stores({
      animals: 'id, tag, type, status, synced, updated_at',
      plots: 'id, synced, updated_at',
      events: 'id, client_id, entity_type, entity_id, event_type, event_date, synced, updated_at',
      batches: 'id, purchase_date, synced, updated_at',
    });
  }
}

export const db = new FarmDB();
