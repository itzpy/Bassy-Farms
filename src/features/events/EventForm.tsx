import { useState, type FormEvent } from 'react';
import type { AnimalType, EntityType, EventType, PigStage } from '../../lib/types';
import { createEvent } from './api';

const ANIMAL_EVENT_TYPES: EventType[] = [
  'feeding', 'vaccination', 'weight', 'health_check', 'breeding', 'death', 'expense', 'sale',
];

const BATCH_EVENT_TYPES: EventType[] = ['expense', 'sale', 'death'];

const PLOT_EVENT_TYPES: EventType[] = ['planting', 'harvest', 'input_application', 'expense', 'sale'];

// No screen uses entityType="farm" yet: FARM_EVENT_TYPES and the farm entries in
// DEFAULT_EVENT_TYPE_BY_ENTITY below are an unused placeholder guess added only to
// satisfy Record<EntityType, ...> completeness, not a verified requirement. Whoever
// builds a farm-level events screen should revisit these rather than treat them as decided.
const FARM_EVENT_TYPES: EventType[] = ['expense', 'sale'];

const EVENT_TYPES_BY_ENTITY: Record<EntityType, EventType[]> = {
  animal: ANIMAL_EVENT_TYPES,
  batch: BATCH_EVENT_TYPES,
  plot: PLOT_EVENT_TYPES,
  farm: FARM_EVENT_TYPES,
};

const DEFAULT_EVENT_TYPE_BY_ENTITY: Record<EntityType, EventType> = {
  animal: 'feeding',
  batch: 'expense',
  plot: 'input_application',
  farm: 'expense',
};

const PIG_STAGES: PigStage[] = ['starter', 'grower', 'finisher'];
const INPUT_TYPES = ['insecticide', 'fungicide', 'herbicide', 'fertilizer', 'other'] as const;
const INPUT_UNITS = ['liters', 'kg'] as const;

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
  const eventTypeOptions = EVENT_TYPES_BY_ENTITY[entityType];
  const [eventType, setEventType] = useState<EventType>(DEFAULT_EVENT_TYPE_BY_ENTITY[entityType]);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [feedType, setFeedType] = useState(() => (animalType === 'pig' ? pigStage ?? 'starter' : ''));
  const [quantityKg, setQuantityKg] = useState('');
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [inputType, setInputType] = useState<(typeof INPUT_TYPES)[number]>('insecticide');
  const [productName, setProductName] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');
  const [inputUnit, setInputUnit] = useState<(typeof INPUT_UNITS)[number]>('liters');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showFeedFields = eventType === 'feeding' && (animalType === 'pig' || animalType === 'goat');
  const showAmountField = eventType === 'expense' || eventType === 'sale';
  const showBatchQuantityField = entityType === 'batch' && (eventType === 'sale' || eventType === 'death');
  const showInputFields = entityType === 'plot' && eventType === 'input_application';

  function buildMetadata(): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    if (showFeedFields) {
      if (feedType.trim()) metadata.feed_type = feedType.trim();
      const parsedQuantity = Number(quantityKg);
      if (quantityKg.trim() && Number.isFinite(parsedQuantity) && parsedQuantity >= 0) {
        metadata.quantity_kg = parsedQuantity;
      }
    }
    if (showBatchQuantityField) {
      const parsedCount = Number(batchQuantity);
      if (batchQuantity.trim() && Number.isFinite(parsedCount) && parsedCount > 0) {
        metadata.quantity = parsedCount;
      }
    }
    if (showInputFields) {
      metadata.input_type = inputType;
      if (productName.trim()) metadata.product_name = productName.trim();
      const parsedInputQuantity = Number(inputQuantity);
      if (inputQuantity.trim() && Number.isFinite(parsedInputQuantity) && parsedInputQuantity >= 0) {
        metadata.input_quantity = parsedInputQuantity;
        metadata.unit = inputUnit;
      }
    }
    return metadata;
  }

  function buildAmount(): number | null {
    if (!showAmountField) return null;
    const parsed = Number(amount);
    if (amount.trim() && Number.isFinite(parsed) && parsed >= 0) return parsed;
    return null;
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
        amount: buildAmount(),
        category: null,
        notes: notes.trim() || null,
        metadata: buildMetadata(),
      });
      setNotes('');
      setQuantityKg('');
      setAmount('');
      setBatchQuantity('1');
      setProductName('');
      setInputQuantity('');
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
        {eventTypeOptions.map((type) => (
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

      {showBatchQuantityField && (
        <>
          <label htmlFor="batch-quantity">Number of pigs</label>
          <input
            id="batch-quantity"
            type="number"
            min="1"
            step="1"
            value={batchQuantity}
            onChange={(e) => setBatchQuantity(e.target.value)}
          />
        </>
      )}

      {showInputFields && (
        <>
          <label htmlFor="input-type">Input type</label>
          <select
            id="input-type"
            value={inputType}
            onChange={(e) => setInputType(e.target.value as (typeof INPUT_TYPES)[number])}
          >
            {INPUT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <label htmlFor="product-name">Product name</label>
          <input id="product-name" value={productName} onChange={(e) => setProductName(e.target.value)} />

          <label htmlFor="input-quantity">Quantity</label>
          <input
            id="input-quantity"
            type="number"
            min="0"
            step="0.1"
            value={inputQuantity}
            onChange={(e) => setInputQuantity(e.target.value)}
          />

          <label htmlFor="input-unit">Unit</label>
          <select
            id="input-unit"
            value={inputUnit}
            onChange={(e) => setInputUnit(e.target.value as (typeof INPUT_UNITS)[number])}
          >
            {INPUT_UNITS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </>
      )}

      {showAmountField && (
        <>
          <label htmlFor="event-amount">{showBatchQuantityField ? 'Total amount' : 'Amount'}</label>
          <input
            id="event-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
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
