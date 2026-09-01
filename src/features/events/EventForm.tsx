import { useState, type FormEvent } from 'react';
import type { AnimalType, EntityType, EventType, PigStage } from '../../lib/types';
import { createEvent } from './api';

const ANIMAL_EVENT_TYPES: EventType[] = [
  'feeding', 'vaccination', 'weight', 'health_check', 'breeding', 'death', 'expense', 'sale',
];

const PIG_STAGES: PigStage[] = ['starter', 'grower', 'finisher'];

export function EventForm({
  entityType,
  entityId,
  animalType,
  pigStage,
  onCreated,
}: {
  entityType: EntityType;
  entityId: string;
  animalType?: AnimalType;
  pigStage?: PigStage | null;
  onCreated?: () => void;
}) {
  const [eventType, setEventType] = useState<EventType>('feeding');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [feedType, setFeedType] = useState(() => (animalType === 'pig' ? pigStage ?? 'starter' : ''));
  const [quantityKg, setQuantityKg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFeedFields = eventType === 'feeding' && (animalType === 'pig' || animalType === 'goat');

  function buildMetadata(): Record<string, unknown> {
    if (!showFeedFields) return {};
    const metadata: Record<string, unknown> = {};
    if (feedType.trim()) metadata.feed_type = feedType.trim();
    const parsedQuantity = Number(quantityKg);
    if (quantityKg.trim() && Number.isFinite(parsedQuantity) && parsedQuantity >= 0) {
      metadata.quantity_kg = parsedQuantity;
    }
    return metadata;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createEvent({
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        event_date: eventDate,
        amount: null,
        category: null,
        notes: notes.trim() || null,
        metadata: buildMetadata(),
      });
      setNotes('');
      setQuantityKg('');
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log event');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="event-type">Event</label>
      <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
        {ANIMAL_EVENT_TYPES.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>

      <label htmlFor="event-date">Date</label>
      <input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />

      {showFeedFields && animalType === 'pig' && (
        <>
          <label htmlFor="feed-type">Feed type</label>
          <select id="feed-type" value={feedType} onChange={(e) => setFeedType(e.target.value)}>
            {PIG_STAGES.map((stage) => (
              <option key={stage} value={stage}>{stage}</option>
            ))}
          </select>
        </>
      )}

      {showFeedFields && animalType === 'goat' && (
        <>
          <label htmlFor="feed-type">Feed type</label>
          <input id="feed-type" value={feedType} onChange={(e) => setFeedType(e.target.value)} />
        </>
      )}

      {showFeedFields && (
        <>
          <label htmlFor="feed-quantity">Quantity (kg)</label>
          <input
            id="feed-quantity"
            type="number"
            min="0"
            step="0.1"
            value={quantityKg}
            onChange={(e) => setQuantityKg(e.target.value)}
          />
        </>
      )}

      <label htmlFor="event-notes">Notes</label>
      <input id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={isSubmitting}>Log event</button>
    </form>
  );
}
