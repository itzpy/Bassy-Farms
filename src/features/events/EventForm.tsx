import { useState, type FormEvent } from 'react';
import type { EntityType, EventType } from '../../lib/types';
import { createEvent } from './api';

const ANIMAL_EVENT_TYPES: EventType[] = [
  'feeding', 'vaccination', 'weight', 'health_check', 'breeding', 'death', 'expense', 'sale',
];

export function EventForm({
  entityType,
  entityId,
  onCreated,
}: {
  entityType: EntityType;
  entityId: string;
  onCreated?: () => void;
}) {
  const [eventType, setEventType] = useState<EventType>('feeding');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        metadata: {},
      });
      setNotes('');
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

      <label htmlFor="event-notes">Notes</label>
      <input id="event-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={isSubmitting}>Log event</button>
    </form>
  );
}
