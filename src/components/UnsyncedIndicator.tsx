import { useLiveQuery } from 'dexie-react-hooks';
import { unsyncedCount } from '../lib/sync';

export function UnsyncedIndicator() {
  const count = useLiveQuery(() => unsyncedCount());

  if (!count) return null;

  return (
    <p role="status" className="unsynced-indicator">
      {count} unsynced change{count === 1 ? '' : 's'}
    </p>
  );
}
