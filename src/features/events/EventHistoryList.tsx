import { useState } from 'react';
import type { AnimalType, EntityType, PigStage } from '../../lib/types';
import type { LocalEvent } from '../../lib/db';
import { formatMoney } from '../../lib/money';
import { deleteEvent } from './api';
import { EventForm } from './EventForm';

export function EventHistoryList({
  events,
  entityType,
  entityId,
  animalType,
  pigStage,
  formatDetail,
}: {
  events: LocalEvent[];
  entityType: EntityType;
  entityId: string | null;
  animalType?: AnimalType;
  pigStage?: PigStage | null;
  formatDetail?: (event: LocalEvent) => string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(event: LocalEvent) {
    if (!window.confirm(`Delete this ${event.event_type} event? This cannot be undone from the app.`)) return;
    await deleteEvent(event.id);
  }

  return (
    <ul>
      {events.map((event) => {
        if (editingId === event.id) {
          return (
            <li key={event.id}>
              <EventForm
                entityType={entityType}
                entityId={entityId}
                animalType={animalType}
                pigStage={pigStage}
                editingEvent={event}
                onSaved={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          );
        }

        const detail = formatDetail?.(event) ?? '';
        return (
          <li key={event.id}>
            {event.event_date} — {event.event_type}
            {detail ? ` — ${detail}` : ''}
            {event.amount != null ? ` — ${formatMoney(event.amount)}` : ''}
            {event.notes ? ` — ${event.notes}` : ''}{' '}
            <button type="button" className="btn-secondary" onClick={() => setEditingId(event.id)}>Edit</button>{' '}
            <button type="button" className="btn-destructive" onClick={() => void handleDelete(event)}>Delete</button>
          </li>
        );
      })}
    </ul>
  );
}
