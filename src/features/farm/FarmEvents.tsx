import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { EventForm } from '../events/EventForm';
import { EventHistoryList } from '../events/EventHistoryList';

export function FarmEvents() {
  const events = useLiveQuery(
    () =>
      db.events
        .where('entity_type')
        .equals('farm')
        .and((e) => !e.deleted_at)
        .reverse()
        .sortBy('event_date'),
    []
  );

  return (
    <div>
      <h1>Farm</h1>

      <h2>Log an event</h2>
      <EventForm entityType="farm" entityId={null} />

      <h2>History</h2>
      <EventHistoryList events={events ?? []} entityType="farm" entityId={null} />
    </div>
  );
}
