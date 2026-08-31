import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';

// `useLiveQuery` returns `undefined` both while the query is still pending AND
// once it has genuinely resolved to "no such row." Passing this sentinel as
// the default result lets us tell those two states apart: it's only ever
// returned before the query's first real resolution.
const PENDING = Symbol('pending');

export function AnimalDetail() {
  const { id } = useParams<{ id: string }>();

  const result = useLiveQuery(() => (id ? db.animals.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const animal = loading ? undefined : result;
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

  if (loading) return <p>Loading…</p>;
  if (!animal) return <p>Animal not found.</p>;

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
