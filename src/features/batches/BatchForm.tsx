import { useState, type FormEvent } from 'react';
import type { Batch } from '../../lib/types';
import { createBatch, updateBatch } from './api';

export function BatchForm({
  editing,
  onCreated,
  onSaved,
}: {
  editing?: Batch;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [purchaseDate, setPurchaseDate] = useState(
    () => editing?.purchase_date ?? new Date().toISOString().slice(0, 10)
  );
  const [initialCount, setInitialCount] = useState(editing ? String(editing.initial_count) : '');
  const [purchaseCost, setPurchaseCost] = useState(
    editing?.purchase_cost != null ? String(editing.purchase_cost) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    const count = Number(initialCount);
    if (!name.trim() || !Number.isFinite(count) || count <= 0) return;
    setIsSubmitting(true);
    try {
      const parsedCost = purchaseCost.trim() ? Number(purchaseCost) : null;
      const cost = parsedCost != null && Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : null;
      if (editing) {
        await updateBatch(editing.id, {
          name: name.trim(),
          purchase_date: purchaseDate,
          initial_count: count,
          purchase_cost: cost,
        });
        onSaved?.();
      } else {
        const id = await createBatch({
          name: name.trim(),
          purchase_date: purchaseDate,
          initial_count: count,
          purchase_cost: cost,
          notes: null,
        });
        setName('');
        setInitialCount('');
        setPurchaseCost('');
        onCreated?.(id);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="batch-name">Name</label>
      <input id="batch-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="batch-purchase-date">Purchase date</label>
      <input
        id="batch-purchase-date"
        type="date"
        value={purchaseDate}
        onChange={(e) => setPurchaseDate(e.target.value)}
      />

      <label htmlFor="batch-initial-count">Initial headcount</label>
      <input
        id="batch-initial-count"
        type="number"
        min="1"
        step="1"
        value={initialCount}
        onChange={(e) => setInitialCount(e.target.value)}
      />

      <label htmlFor="batch-purchase-cost">Purchase cost</label>
      <input
        id="batch-purchase-cost"
        type="number"
        min="0"
        step="0.01"
        value={purchaseCost}
        onChange={(e) => setPurchaseCost(e.target.value)}
      />

      <button type="submit" disabled={isSubmitting}>{editing ? 'Save changes' : 'Add batch'}</button>
      {editing && (
        <button type="button" className="btn-secondary" onClick={() => onSaved?.()}>
          Cancel
        </button>
      )}
    </form>
  );
}
