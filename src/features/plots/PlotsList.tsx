import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { PlotForm } from './PlotForm';

export function PlotsList() {
  const plots = useLiveQuery(() => db.plots.orderBy('name').toArray(), []);

  return (
    <div>
      <h1>Plots</h1>
      <PlotForm />
      <ul>
        {(plots ?? []).map((plot) => (
          <li key={plot.id}>
            <Link to={`/plots/${plot.id}`}>{plot.name}</Link>
            {plot.crop_type ? ` — ${plot.crop_type}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
