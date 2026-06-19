import { useEffect, useState } from 'react';
import { Model, Query, Collection } from '@nozbe/watermelondb';

/**
 * Reactively observe a WatermelonDB query. Re-renders whenever data changes.
 * Pass `deps` when the query depends on values that may be undefined on first render
 * (e.g. a siteId loaded via useRecord). The hook re-subscribes whenever deps change.
 */
export function useQuery<T extends Model>(query: Query<T>, deps: readonly unknown[] = []): T[] {
  const [records, setRecords] = useState<T[]>([]);
  useEffect(() => {
    const sub = query.observe().subscribe(setRecords);
    return () => sub.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return records;
}

/** Reactively observe a single WatermelonDB record by local UUID id. */
export function useRecord<T extends Model>(
  collection: Collection<T>,
  id: string | null | undefined,
): T | null {
  const [record, setRecord] = useState<T | null>(null);
  useEffect(() => {
    if (!id) { setRecord(null); return; }
    const sub = collection.findAndObserve(id).subscribe({
      next: setRecord,
      error: () => setRecord(null),
    });
    return () => sub.unsubscribe();
  }, [id]);
  return record;
}
