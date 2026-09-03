import type { LocalEvent, LocalAnimal, LocalBatch } from '../../lib/db';

export interface Bucket {
  label: string;
  cost: number;
  revenue: number;
  profit: number;
}

export interface ProfitabilityResult {
  buckets: Bucket[];
  overall: Bucket;
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function emptyBucket(label: string): Bucket {
  return { label, cost: 0, revenue: 0, profit: 0 };
}

export function aggregateProfitability(
  events: LocalEvent[],
  animals: LocalAnimal[],
  batches: LocalBatch[],
  from: string,
  to: string
): ProfitabilityResult {
  const buckets: Record<string, Bucket> = {
    Pigs: emptyBucket('Pigs'),
    Goats: emptyBucket('Goats'),
    Batches: emptyBucket('Batches'),
    Plots: emptyBucket('Plots'),
    'Farm-wide': emptyBucket('Farm-wide'),
  };

  const animalTypeById = new Map(animals.map((a) => [a.id, a.type]));

  function bucketFor(event: LocalEvent): Bucket | null {
    switch (event.entity_type) {
      case 'farm':
        return buckets['Farm-wide'];
      case 'plot':
        return buckets.Plots;
      case 'batch':
        return buckets.Batches;
      case 'animal': {
        const type = event.entity_id ? animalTypeById.get(event.entity_id) : undefined;
        if (type === 'pig') return buckets.Pigs;
        if (type === 'goat') return buckets.Goats;
        return null;
      }
      default:
        return null;
    }
  }

  for (const event of events) {
    if (!inRange(event.event_date, from, to)) continue;
    if (event.event_type !== 'expense' && event.event_type !== 'sale') continue;
    const bucket = bucketFor(event);
    if (!bucket) continue;
    const amount = event.amount ?? 0;
    if (event.event_type === 'expense') bucket.cost += amount;
    else bucket.revenue += amount;
  }

  for (const batch of batches) {
    if (inRange(batch.purchase_date, from, to)) {
      buckets.Batches.cost += batch.purchase_cost ?? 0;
    }
  }

  const orderedBuckets = [buckets.Pigs, buckets.Goats, buckets.Batches, buckets.Plots, buckets['Farm-wide']];
  for (const bucket of orderedBuckets) {
    bucket.profit = bucket.revenue - bucket.cost;
  }

  const overall: Bucket = {
    label: 'Overall',
    cost: orderedBuckets.reduce((sum, b) => sum + b.cost, 0),
    revenue: orderedBuckets.reduce((sum, b) => sum + b.revenue, 0),
    profit: 0,
  };
  overall.profit = overall.revenue - overall.cost;

  return { buckets: orderedBuckets, overall };
}
