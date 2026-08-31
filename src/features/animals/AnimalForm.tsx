import { useState, type FormEvent } from 'react';
import type { AnimalType } from '../../lib/types';
import { createAnimal } from './api';

export function AnimalForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const [type, setType] = useState<AnimalType>('pig');
  const [tag, setTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!tag.trim()) return;
    setIsSubmitting(true);
    try {
      const id = await createAnimal({ type, tag: tag.trim(), birth_date: null, notes: null });
      setTag('');
      onCreated?.(id);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="animal-type">Type</label>
      <select id="animal-type" value={type} onChange={(e) => setType(e.target.value as AnimalType)}>
        <option value="pig">Pig</option>
        <option value="goat">Goat</option>
      </select>

      <label htmlFor="animal-tag">Tag</label>
      <input id="animal-tag" value={tag} onChange={(e) => setTag(e.target.value)} />

      <button type="submit" disabled={isSubmitting}>Add animal</button>
    </form>
  );
}
