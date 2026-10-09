import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { toLocalDateString } from '../../lib/dates';
import { formatMoney, formatSignedMoney, signOf } from '../../lib/money';
import { aggregateProfitability } from './aggregate';

interface Range {
  from: string;
  to: string;
}

function thisMonth(now = new Date()): Range {
  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateString(now),
  };
}

function lastMonth(now = new Date()): Range {
  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

function lastThreeMonths(now = new Date()): Range {
  return {
    from: toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
    to: toLocalDateString(now),
  };
}

const PRESETS: { label: string; range: () => Range }[] = [
  { label: 'This month', range: thisMonth },
  { label: 'Last month', range: lastMonth },
  { label: 'Last 3 months', range: lastThreeMonths },
];

function ProfitFigure({ amount }: { amount: number }) {
  const sign = signOf(amount);
  // The word and the sign carry the meaning; colour only reinforces it.
  return (
    <span className="profit" data-sign={sign}>
      {formatSignedMoney(amount)}
      {sign === 'loss' && <span className="profit-tag"> Loss</span>}
    </span>
  );
}

export function ProfitabilityDashboard() {
  const [{ from, to }, setRange] = useState<Range>(() => thisMonth());
  const rangeIsValid = from !== '' && to !== '' && from <= to;

  const events = useLiveQuery(
    () =>
      db.events
        .where('event_date')
        .between(from, to, true, true)
        .and((e) => !e.deleted_at)
        .toArray(),
    [from, to]
  );
  const animals = useLiveQuery(() => db.animals.filter((a) => !a.deleted_at).toArray(), []);
  const batches = useLiveQuery(() => db.batches.filter((b) => !b.deleted_at).toArray(), []);

  const isLoading = events === undefined || animals === undefined || batches === undefined;

  const result = isLoading || !rangeIsValid
    ? null
    : aggregateProfitability(events, animals, batches, from, to);
  const activeBuckets = result?.buckets.filter((b) => b.cost !== 0 || b.revenue !== 0) ?? [];

  return (
    <div>
      <h1>Dashboard</h1>

      <div className="segmented" role="group" aria-label="Date range">
        {PRESETS.map(({ label, range }) => {
          const preset = range();
          const selected = preset.from === from && preset.to === to;
          return (
            <button
              key={label}
              type="button"
              className="btn-secondary"
              aria-pressed={selected}
              onClick={() => setRange(preset)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="range-fields">
        <label htmlFor="dashboard-from">
          From
          <input
            id="dashboard-from"
            type="date"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </label>
        <label htmlFor="dashboard-to">
          To
          <input
            id="dashboard-to"
            type="date"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </label>
      </div>

      {!rangeIsValid && (
        <p role="alert">Choose an end date on or after the start date.</p>
      )}

      {rangeIsValid && isLoading && (
        <p role="status" aria-busy="true" className="dashboard-loading">
          Calculating…
        </p>
      )}

      {result && (
        <>
          <dl className="stats">
            <div className="stat stat-primary">
              <dt>{signOf(result.overall.profit) === 'loss' ? 'Loss' : 'Profit'}</dt>
              <dd>
                <ProfitFigure amount={result.overall.profit} />
              </dd>
            </div>
            <div className="stat">
              <dt>Cost</dt>
              <dd>{formatMoney(result.overall.cost)}</dd>
            </div>
            <div className="stat">
              <dt>Revenue</dt>
              <dd>{formatMoney(result.overall.revenue)}</dd>
            </div>
          </dl>

          {activeBuckets.length === 0 ? (
            <p className="empty-state">
              No income or costs logged for this period. Log an expense or sale from the Farm tab to
              see it here.
            </p>
          ) : (
            <table className="data-table">
              <caption>
                Profit by category, {from} to {to}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="num">Cost</th>
                  <th scope="col" className="num">Revenue</th>
                  <th scope="col" className="num">Profit</th>
                </tr>
              </thead>
              <tbody>
                {activeBuckets.map((bucket) => (
                  <tr key={bucket.label}>
                    <th scope="row">{bucket.label}</th>
                    <td className="num">{formatMoney(bucket.cost)}</td>
                    <td className="num">{formatMoney(bucket.revenue)}</td>
                    <td className="num">
                      <ProfitFigure amount={bucket.profit} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Overall</th>
                  <td className="num">{formatMoney(result.overall.cost)}</td>
                  <td className="num">{formatMoney(result.overall.revenue)}</td>
                  <td className="num">
                    <ProfitFigure amount={result.overall.profit} />
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </div>
  );
}
