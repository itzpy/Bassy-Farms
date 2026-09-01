import { useState, type FormEvent } from 'react';
import { createPlot } from './api';

export function PlotForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [name, setName] = useState('');
  const [cropType, setCropType] = useState('');
  const [plantedDate, setPlantedDate] = useState('');
  const [area, setArea] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const parsedArea = area.trim() ? Number(area) : null;
      const id = await createPlot({
        name: name.trim(),
        crop_type: cropType.trim() || null,
        planted_date: plantedDate || null,
        area: parsedArea != null && Number.isFinite(parsedArea) && parsedArea >= 0 ? parsedArea : null,
        notes: null,
      });
      setName('');
      setCropType('');
      setPlantedDate('');
      setArea('');
      onCreated?.(id);
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

      <button type="submit" disabled={isSubmitting}>Add plot</button>
    </form>
  );
}
