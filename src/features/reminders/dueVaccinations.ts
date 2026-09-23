import type { LocalEvent, LocalAnimal } from '../../lib/db';

export interface DueVaccination {
  animalId: string;
  tag: string;
  dueDate: string;
}

export function getDueVaccinations(
  events: LocalEvent[],
  animals: LocalAnimal[],
  today: string
): DueVaccination[] {
  const animalById = new Map(animals.map((a) => [a.id, a]));

  const latestByAnimal = new Map<string, LocalEvent>();
  for (const event of events) {
    if (event.event_type !== 'vaccination' || !event.entity_id) continue;
    const current = latestByAnimal.get(event.entity_id);
    if (!current || event.event_date > current.event_date) {
      latestByAnimal.set(event.entity_id, event);
    }
  }

  const due: DueVaccination[] = [];
  for (const [animalId, event] of latestByAnimal) {
    const dueDate = event.metadata.next_due_date;
    if (typeof dueDate !== 'string') continue;
    if (dueDate > today) continue;
    const animal = animalById.get(animalId);
    if (!animal || animal.status !== 'active') continue;
    due.push({ animalId, tag: animal.tag, dueDate });
  }

  return due.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}
