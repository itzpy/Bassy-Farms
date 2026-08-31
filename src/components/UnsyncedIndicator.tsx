import { useEffect, useState } from 'react';
import { unsyncedCount } from '../lib/sync';

export function UnsyncedIndicator({ pollIntervalMs = 3000 }: { pollIntervalMs?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const n = await unsyncedCount();
      if (!cancelled) setCount(n);
    };
    void poll();
    const interval = window.setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs]);

  if (count === 0) return null;

  return (
    <p role="status">
      {count} unsynced change{count === 1 ? '' : 's'}
    </p>
  );
}
