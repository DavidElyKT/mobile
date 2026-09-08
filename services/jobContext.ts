import { Database, Q } from '@nozbe/watermelondb';
import Assembly from '@/db/models/Assembly.model';
import Assessment from '@/db/models/Assessment.model';

/**
 * WHICH JOB is this work being done under?
 *
 * A question that did not exist before Phase 3, because the answer was always
 * the same: an asset belonged to exactly one job, so `assembly.siteId` was it.
 * A repeat round breaks that. The asset is no longer copied — job 1704 ticks
 * "Press 3", which job 1601 created in 2026 — and reading the job off the asset
 * would file this year's checklist under the 2026 project, on the 2026 episode,
 * and the whole point of keeping asset identity across rounds would be lost at
 * the first hazard recorded.
 *
 * Three sources, strongest first:
 *
 *   1. WHAT THE SCREEN WAS TOLD. Job-level work carries `site_id` in its route
 *      params and there is nothing to infer.
 *   2. AN OPEN EPISODE. Ticking an asset at job setup writes an 'In Progress'
 *      episode against it, so an asset being worked in a live round says so
 *      itself. The most recent one wins where an asset is somehow in two.
 *   3. THE ASSET'S OWN JOB. Everything already in the field, and every asset
 *      created inside the job it belongs to. Unchanged behaviour.
 *
 * The answer is stamped onto the checklist or evaluation as its `site_id`, and
 * the server reads that first when it decides which episode the record belongs
 * to (see api/shared/episodes.py `_job_of_record` — the two rules are one rule,
 * written in two places, and they have to stay in step).
 */
export async function resolveJobSiteId(
  db: Database,
  opts: { assemblyId?: string | null; siteId?: string | null },
): Promise<string | null> {
  if (opts.siteId) return opts.siteId;
  if (!opts.assemblyId) return null;

  try {
    const open = await db.get<Assessment>('assessments')
      .query(
        Q.where('assembly_id', opts.assemblyId),
        Q.where('status', 'In Progress'),
      )
      .fetch();

    const withJob = open.filter(e => !!e.siteId);
    if (withJob.length) {
      // Most recent by the date the visit is recorded under, then by creation,
      // so a second round started today beats one left open from last year.
      withJob.sort((a, b) => {
        const byDate = (b.assessmentDate ?? '').localeCompare(a.assessmentDate ?? '');
        if (byDate !== 0) return byDate;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      return withJob[0].siteId;
    }

    const assembly = await db.get<Assembly>('assemblies').find(opts.assemblyId);
    return assembly.siteId ?? null;
  } catch {
    // An asset that is not on this device yet is not a reason to refuse to
    // record a hazard. The server infers the job from the asset in that case,
    // exactly as it does for every record made before this release.
    return null;
  }
}
