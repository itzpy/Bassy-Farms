import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { AnimalForm } from './AnimalForm';

export function AnimalsList() {
  const animals = useLiveQuery(() => db.animals.orderBy('tag').toArray(), []);

  return (
    <div>
      <h1>Animals</h1>
      <AnimalForm />
      <ul>
        {(animals ?? []).map((animal) => (
          <li key={animal.id}>
            <Link to={`/animals/${animal.id}`}>{animal.tag}</Link> — {animal.type} ({animal.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
