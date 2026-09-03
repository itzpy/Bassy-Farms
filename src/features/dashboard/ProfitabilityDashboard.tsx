import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { aggregateProfitability } from './aggregate';

function startOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ProfitabilityDashboard() {
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(today);

  const events = useLiveQuery(
    () => db.events.where('event_date').between(from, to, true, true).toArray(),
    [from, to]
  );
  const animals = useLiveQuery(() => db.animals.toArray(), []);
  const batches = useLiveQuery(() => db.batches.toArray(), []);

  const { buckets, overall } = aggregateProfitability(events ?? [], animals ?? [], batches ?? [], from, to);

  return (
    <div>
      <h1>Dashboard</h1>

      <label htmlFor="dashboard-from">From</label>
      <input id="dashboard-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />

      <label htmlFor="dashboard-to">To</label>
      <input id="dashboard-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />

      <p>
        Cost: {overall.cost.toFixed(2)} — Revenue: {overall.revenue.toFixed(2)} — Profit: {overall.profit.toFixed(2)}
      </p>

      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Cost</th>
            <th>Revenue</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.label}>
              <td>{bucket.label}</td>
              <td>{bucket.cost.toFixed(2)}</td>
              <td>{bucket.revenue.toFixed(2)}</td>
              <td>{bucket.profit.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
