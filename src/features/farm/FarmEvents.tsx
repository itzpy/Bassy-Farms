import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';

export function FarmEvents() {
  const events = useLiveQuery(
    () => db.events.where('entity_type').equals('farm').reverse().sortBy('event_date'),
    []
  );

  return (
    <div>
      <h1>Farm</h1>

      <h2>Log an event</h2>
      <EventForm entityType="farm" entityId={null} />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => (
          <li key={event.id}>
            {event.event_date} — {event.event_type}
            {event.amount != null ? ` — ${event.amount.toFixed(2)}` : ''}
            {event.notes ? ` — ${event.notes}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
