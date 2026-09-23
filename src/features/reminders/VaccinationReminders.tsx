import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../lib/db';
import { getDueVaccinations } from './dueVaccinations';

export function VaccinationReminders() {
  const events = useLiveQuery(() => db.events.where('event_type').equals('vaccination').toArray());
  const animals = useLiveQuery(() => db.animals.toArray());

  const today = new Date().toISOString().slice(0, 10);
  const due = getDueVaccinations(events ?? [], animals ?? [], today);

  if (due.length === 0) return null;

  return (
    <div role="status">
      <p>
        {due.length} vaccination{due.length === 1 ? '' : 's'} due
      </p>
      <ul>
        {due.map((item) => (
          <li key={item.animalId}>
            <Link to={`/animals/${item.animalId}`}>
              {item.tag} — due {item.dueDate}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
