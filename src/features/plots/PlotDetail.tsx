import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type LocalEvent } from '../../lib/db';
import { deletePlot } from './api';
import { PlotForm } from './PlotForm';
import { EventForm } from '../events/EventForm';
import { EventHistoryList } from '../events/EventHistoryList';

// See AnimalDetail.tsx for why this sentinel is needed: `useLiveQuery` returns
// `undefined` both while pending and once genuinely resolved to "no such row."
const PENDING = Symbol('pending');

function formatInputDetail(event: LocalEvent): string {
  if (event.event_type !== 'input_application') return '';
  const inputType = typeof event.metadata.input_type === 'string' ? event.metadata.input_type : null;
  const productName = typeof event.metadata.product_name === 'string' ? event.metadata.product_name : null;
  const quantity = typeof event.metadata.input_quantity === 'number' ? event.metadata.input_quantity : null;
  const unit = typeof event.metadata.unit === 'string' ? event.metadata.unit : null;
  const quantityPart = quantity != null ? `${quantity}${unit ? ` ${unit}` : ''}` : null;
  return [inputType, productName, quantityPart].filter(Boolean).join(', ');
}

export function PlotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);

  const result = useLiveQuery(() => (id ? db.plots.get(id) : undefined), [id], PENDING);
  const loading = result === PENDING;
  const plot = loading ? undefined : result;

  const events = useLiveQuery(
    () =>
      id
        ? db.events
            .where('entity_id')
            .equals(id)
            .and((e) => e.entity_type === 'plot' && !e.deleted_at)
            .reverse()
            .sortBy('event_date')
        : [],
    [id]
  );

  if (loading) return <p>Loading…</p>;
  if (!plot) return <p>Plot not found.</p>;

  async function handleDelete() {
    if (!window.confirm(`Delete ${plot!.name}? This cannot be undone from the app.`)) return;
    await deletePlot(plot!.id);
    navigate('/plots');
  }

  return (
    <div>
      <h1>{plot.name}</h1>

      {plot.deleted_at ? (
        <p role="status">Deleted</p>
      ) : isEditing ? (
        <PlotForm editing={plot} onSaved={() => setIsEditing(false)} />
      ) : (
        <>
          <p>
            {[
              plot.crop_type,
              plot.planted_date ? `planted ${plot.planted_date}` : 'not yet planted',
              plot.area != null ? `${plot.area} area` : null,
            ]
              .filter(Boolean)
              .join(' — ')}
          </p>
          <button type="button" onClick={() => setIsEditing(true)}>Edit plot</button>{' '}
          <button type="button" onClick={handleDelete}>Delete plot</button>

          <h2>Log an event</h2>
          <EventForm entityType="plot" entityId={plot.id} />
        </>
      )}

      <h2>History</h2>
      <EventHistoryList
        events={events ?? []}
        entityType="plot"
        entityId={plot.id}
        formatDetail={formatInputDetail}
      />
    </div>
  );
}
