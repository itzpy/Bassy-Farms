import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import { formatMoney, formatSignedMoney } from '../../lib/money';
import { deleteBatch } from './api';
import { BatchForm } from './BatchForm';
import { EventForm } from '../events/EventForm';
import { EventHistoryList } from '../events/EventHistoryList';

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
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  const result = useLiveQuery(() => (id ? db.batches.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const batch = loading ? undefined : result;

  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'batch' && !e.deleted_at)
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

  async function handleDelete() {
    if (!window.confirm(`Delete ${batch!.name}? This cannot be undone from the app.`)) return;
    await deleteBatch(batch!.id);
    navigate('/batches');
  }

  return (
    <div>
      <h1>{batch.name}</h1>

      {batch.deleted_at ? (
        <p role="status">Deleted</p>
      ) : isEditing ? (
        <BatchForm editing={batch} onSaved={() => setIsEditing(false)} />
      ) : (
        <>
          <p>Purchased: {batch.purchase_date} — {batch.initial_count} pigs</p>
          <p>Current headcount: {currentCount}</p>
          <p>Total cost: {formatMoney(totalCost)}</p>
          <p>Total revenue: {formatMoney(totalRevenue)}</p>
          <p>Profit: {formatSignedMoney(profit)}</p>
          <button type="button" className="btn-secondary" onClick={() => setIsEditing(true)}>Edit batch</button>{' '}
          <button type="button" className="btn-destructive" onClick={handleDelete}>Delete batch</button>

          <h2>Log an event</h2>
          <EventForm entityType="batch" entityId={batch.id} />
        </>
      )}

      <h2>History</h2>
      <EventHistoryList
        events={events ?? []}
        entityType="batch"
        entityId={batch.id}
        formatDetail={formatBatchDetail}
      />
    </div>
  );
}
