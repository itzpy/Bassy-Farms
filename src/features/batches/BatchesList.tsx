import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { BatchForm } from './BatchForm';

export function BatchesList() {
  const batches = useLiveQuery(() => db.batches.orderBy('purchase_date').reverse().toArray(), []);

  return (
    <div>
      <h1>Batches</h1>
      <BatchForm />
      <ul>
        {(batches ?? []).map((batch) => (
          <li key={batch.id}>
            <Link to={`/batches/${batch.id}`}>{batch.name}</Link> — {batch.purchase_date} ({batch.initial_count} pigs)
          </li>
        ))}
      </ul>
    </div>
  );
}
