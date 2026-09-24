import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import type { PigStage } from '../../lib/types';
import { updateAnimalStage, deleteAnimal } from './api';
import { AnimalForm } from './AnimalForm';
import { EventForm } from '../events/EventForm';
import { EventHistoryList } from '../events/EventHistoryList';

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

function formatVaccinationDetail(event: LocalEvent): string {
  if (event.event_type !== 'vaccination') return '';
  const dueDate = typeof event.metadata.next_due_date === 'string' ? event.metadata.next_due_date : null;
  return dueDate ? `next due ${dueDate}` : '';
}

export function AnimalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  const result = useLiveQuery(() => (id ? db.animals.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const animal = loading ? undefined : result;
  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'animal' && !e.deleted_at)
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (loading) return <p>Loading…</p>;
  if (!animal) return <p>Animal not found.</p>;

  async function handleDelete() {
    if (!window.confirm(`Delete ${animal!.tag}? This cannot be undone from the app.`)) return;
    await deleteAnimal(animal!.id);
    navigate('/animals');
  }

  return (
    <div>
      <h1>{animal.tag} ({animal.type})</h1>

      {animal.deleted_at ? (
        <p role="status">Deleted</p>
      ) : isEditing ? (
        <AnimalForm editing={animal} onSaved={() => setIsEditing(false)} />
      ) : (
        <>
          <p>Status: {animal.status}</p>
          <button type="button" onClick={() => setIsEditing(true)}>Edit animal</button>{' '}
          <button type="button" onClick={handleDelete}>Delete animal</button>

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
        </>
      )}

      <h2>History</h2>
      <EventHistoryList
        events={events ?? []}
        entityType="animal"
        entityId={animal.id}
        animalType={animal.type}
        pigStage={animal.type === 'pig' ? animal.stage ?? null : null}
        formatDetail={(event) => formatFeedDetail(event) || formatVaccinationDetail(event)}
      />
    </div>
  );
}
