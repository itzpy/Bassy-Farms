import { useState, type FormEvent } from 'react';
import type { Animal, AnimalType } from '../../lib/types';
import { createAnimal, updateAnimal } from './api';

export function AnimalForm({
  editing,
  onCreated,
  onSaved,
}: {
  editing?: Animal;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const [type, setType] = useState<AnimalType>(editing?.type ?? 'pig');
  const [tag, setTag] = useState(editing?.tag ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!tag.trim()) return;
    setIsSubmitting(true);
    try {
      if (editing) {
        await updateAnimal(editing.id, { type, tag: tag.trim() });
        onSaved?.();
      } else {
        const id = await createAnimal({ type, tag: tag.trim(), birth_date: null, notes: null });
        setTag('');
        onCreated?.(id);
      }
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

      <button type="submit" disabled={isSubmitting}>{editing ? 'Save changes' : 'Add animal'}</button>
      {editing && (
        <button type="button" onClick={() => onSaved?.()}>
          Cancel
        </button>
      )}
    </form>
  );
}
