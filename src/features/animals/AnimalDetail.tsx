import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';

export function AnimalDetail() {
  const { id } = useParams<{ id: string }>();

  const animal = useLiveQuery(() => (id ? db.animals.get(id) : undefined), [id]);
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'animal')
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (!animal) return <p>Loading…</p>;

  return (
    <div>
      <h1>{animal.tag} ({animal.type})</h1>
      <p>Status: {animal.status}</p>

      <h2>Log an event</h2>
      <EventForm entityType="animal" entityId={animal.id} />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => (
          <li key={event.id}>
            {event.event_date} — {event.event_type} {event.notes ? `— ${event.notes}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
