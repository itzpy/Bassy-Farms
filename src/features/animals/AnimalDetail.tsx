import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import type { PigStage } from '../../lib/types';
import { updateAnimalStage } from './api';
import { EventForm } from '../events/EventForm';

// `useLiveQuery` returns `undefined` both while the query is still pending AND
// once it has genuinely resolved to "no such row." Passing this sentinel as
// the default result lets us tell those two states apart: it's only ever
// returned before the query's first real resolution.
const PENDING = Symbol('pending');

function formatFeedDetail(event: LocalEvent): string {
  if (event.event_type !== 'feeding') return '';
  const feedType = typeof event.metadata.feed_type === 'string' ? event.metadata.feed_type : null;
  const quantity = typeof event.metadata.quantity_kg === 'number' ? event.metadata.quantity_kg : null;
  return [feedType, quantity != null ? `${quantity}kg` : null].filter(Boolean).join(', ');
}

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

      {animal.type === 'pig' && (
        <p>
          <label htmlFor="pig-stage">Stage</label>{' '}
          <select
            id="pig-stage"
            value={animal.stage ?? 'starter'}
            onChange={(e) => void updateAnimalStage(animal.id, e.target.value as PigStage)}
          >
            <option value="starter">starter</option>
            <option value="grower">grower</option>
            <option value="finisher">finisher</option>
          </select>
        </p>
      )}

      <h2>Log an event</h2>
      <EventForm
        entityType="animal"
        entityId={animal.id}
        animalType={animal.type}
        pigStage={animal.type === 'pig' ? animal.stage ?? null : null}
      />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const feedDetail = formatFeedDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {feedDetail ? ` — ${feedDetail}` : ''}
              {event.notes ? ` — ${event.notes}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
