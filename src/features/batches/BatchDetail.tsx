import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import { EventForm } from '../events/EventForm';

// See AnimalDetail.tsx for why this sentinel is needed: `useLiveQuery` returns
// `undefined` both while pending and once genuinely resolved to "no such row."
const PENDING = Symbol('pending');

function eventQuantity(event: LocalEvent): number {
  const q = event.metadata.quantity;
  return typeof q === 'number' && Number.isFinite(q) ? q : 0;
}

function eventAmount(event: LocalEvent): number {
  return typeof event.amount === 'number' ? event.amount : 0;
}

function formatBatchDetail(event: LocalEvent): string {
  if (event.event_type !== 'sale' && event.event_type !== 'death') return '';
  const q = eventQuantity(event);
  return q > 0 ? `${q} pig${q === 1 ? '' : 's'}` : '';
}

export function BatchDetail() {
  const { id } = useParams<{ id: string }>();

  const result = useLiveQuery(() => (id ? db.batches.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const batch = loading ? undefined : result;

  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'batch')
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (loading) return <p>Loading…</p>;
  if (!batch) return <p>Batch not found.</p>;

  const soldCount = (events ?? [])
    .filter((e) => e.event_type === 'sale')
    .reduce((sum, e) => sum + eventQuantity(e), 0);
  const deadCount = (events ?? [])
    .filter((e) => e.event_type === 'death')
    .reduce((sum, e) => sum + eventQuantity(e), 0);
  const currentCount = batch.initial_count - soldCount - deadCount;

  const totalExpense = (events ?? [])
    .filter((e) => e.event_type === 'expense')
    .reduce((sum, e) => sum + eventAmount(e), 0);
  const totalRevenue = (events ?? [])
    .filter((e) => e.event_type === 'sale')
    .reduce((sum, e) => sum + eventAmount(e), 0);
  const totalCost = (batch.purchase_cost ?? 0) + totalExpense;
  const profit = totalRevenue - totalCost;

  return (
    <div>
      <h1>{batch.name}</h1>
      <p>Purchased: {batch.purchase_date} — {batch.initial_count} pigs</p>
      <p>Current headcount: {currentCount}</p>
      <p>Total cost: {totalCost.toFixed(2)}</p>
      <p>Total revenue: {totalRevenue.toFixed(2)}</p>
      <p>Profit: {profit.toFixed(2)}</p>

      <h2>Log an event</h2>
      <EventForm entityType="batch" entityId={batch.id} />

      <h2>History</h2>
      <ul>
        {(events ?? []).map((event) => {
          const detail = formatBatchDetail(event);
          return (
            <li key={event.id}>
              {event.event_date} — {event.event_type}
              {detail ? ` — ${detail}` : ''}
              {event.amount != null ? ` — ${event.amount.toFixed(2)}` : ''}
              {event.notes ? ` — ${event.notes}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
