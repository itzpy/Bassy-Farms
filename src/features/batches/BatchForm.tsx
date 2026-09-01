import { useState, type FormEvent } from 'react';
import { createBatch } from './api';

export function BatchForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [initialCount, setInitialCount] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
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

      <button type="submit" disabled={isSubmitting}>Add batch</button>
    </form>
  );
}
