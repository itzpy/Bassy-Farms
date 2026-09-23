import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../lib/db';
import { getDueVaccinations } from './dueVaccinations';

export function VaccinationReminders() {
  const events = useLiveQuery(() =>
    db.events.where('event_type').equals('vaccination').and((e) => !e.deleted_at).toArray()
  );
  const animals = useLiveQuery(() => db.animals.filter((a) => !a.deleted_at).toArray());

  const today = new Date().toISOString().slice(0, 10);
  const due = getDueVaccinations(events ?? [], animals ?? [], today);

  if (due.length === 0) return null;

  return (
    <div role="status" className="due-reminders">
      <p>
        <svg className="banner-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
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
