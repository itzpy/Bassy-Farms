import { useState, type FormEvent } from 'react';
import type { Plot } from '../../lib/types';
import { createPlot, updatePlot } from './api';

export function PlotForm({
  editing,
  onCreated,
  onSaved,
}: {
  editing?: Plot;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [cropType, setCropType] = useState(editing?.crop_type ?? '');
  const [plantedDate, setPlantedDate] = useState(editing?.planted_date ?? '');
  const [area, setArea] = useState(editing?.area != null ? String(editing.area) : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const parsedArea = area.trim() ? Number(area) : null;
      const validArea = parsedArea != null && Number.isFinite(parsedArea) && parsedArea >= 0 ? parsedArea : null;
      if (editing) {
        await updatePlot(editing.id, {
          name: name.trim(),
          crop_type: cropType.trim() || null,
          planted_date: plantedDate || null,
          area: validArea,
        });
        onSaved?.();
      } else {
        const id = await createPlot({
          name: name.trim(),
          crop_type: cropType.trim() || null,
          planted_date: plantedDate || null,
          area: validArea,
          notes: null,
        });
        setName('');
        setCropType('');
        setPlantedDate('');
        setArea('');
        onCreated?.(id);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="plot-name">Name</label>
      <input id="plot-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="plot-crop-type">Crop type</label>
      <input id="plot-crop-type" value={cropType} onChange={(e) => setCropType(e.target.value)} />

      <label htmlFor="plot-planted-date">Planted date</label>
      <input
        id="plot-planted-date"
        type="date"
        value={plantedDate}
        onChange={(e) => setPlantedDate(e.target.value)}
      />

      <label htmlFor="plot-area">Area</label>
      <input id="plot-area" type="number" min="0" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} />

      <button type="submit" disabled={isSubmitting}>{editing ? 'Save changes' : 'Add plot'}</button>
      {editing && (
        <button type="button" onClick={() => onSaved?.()}>
          Cancel
        </button>
      )}
    </form>
  );
}
