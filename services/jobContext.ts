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

/**
 * WHICH JOB is the screen in front of the assessor about?
 *
 * The notepad needs this for one reason: standing at a machine, opening the
 * notepad and being asked which job to file against is a question the app can
 * already answer. Every PUWER screen is somewhere under a job, so the route is
 * enough — an id in the path, or a parent id in the query params of a `new` /
 * `edit` screen — plus at most two hops up the tree.
 *
 * Route-driven rather than context-driven on purpose: a provider would mean
 * every one of these screens remembering to publish its job, and the one that
 * forgot would silently file notes against yesterday's job. The router already
 * knows where we are.
 *
 * Assembly-rooted screens go through resolveJobSiteId above, so an asset being
 * worked in a repeat round answers with THIS round's job and not the job that
 * first created it — the same rule the records themselves are stamped with.
 *
 * Returns null on any screen that is not under a job (home, the project list,
 * settings, the notepad itself), which leaves whatever job was chosen last
 * alone.
 */
export async function resolveScreenSiteId(
  db: Database,
  pathname: string | null | undefined,
  params: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  if (!pathname) return null;

  // Group segments never reach usePathname, so the path is e.g.
  // '/machines/abc-123' or '/risk-evaluations/new'.
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const one = (key: string): string | null => {
    const value = params?.[key];
    const single = Array.isArray(value) ? value[0] : value;
    return single ? String(single) : null;
  };
  // 'new' and 'edit' are screens, not ids: the id they work on arrives as a
  // query param instead.
  const idOf = (segment: string): string | null =>
    segment === 'new' || segment === 'edit' ? null : segment;

  const find = async <T>(table: string, id: string | null): Promise<T | null> => {
    if (!id) return null;
    try {
      return (await db.get<any>(table).find(id)) as T;
    } catch {
      // The record is not on this device — nothing to file against, and not an
      // error worth surfacing from a background lookup.
      return null;
    }
  };

  const fromAssembly = (assemblyId: string | null) =>
    assemblyId ? resolveJobSiteId(db, { assemblyId }) : Promise.resolve(null);

  const [collection, second, third] = segments;

  switch (collection) {
    case 'sites':
      return idOf(second);

    case 'admin-review':
    case 'control-review': {
      if (second === 'round') {
        const round = await find<{ siteId: string | null }>('control_review_rounds', idOf(third));
        return round?.siteId ?? null;
      }
      if (second === 'verdict') {
        const review = await find<{ roundId: string }>('control_reviews', idOf(third));
        const round = await find<{ siteId: string | null }>('control_review_rounds', review?.roundId ?? null);
        return round?.siteId ?? null;
      }
      // '/control-review/[siteId]' and '/admin-review/[siteId]'.
      return idOf(second);
    }

    case 'floor-plans': {
      const plan = await find<{ siteId: string | null }>('floor_plans', idOf(second));
      return plan?.siteId ?? null;
    }

    case 'assemblies': {
      const assembly = await find<{ id: string }>(
        'assemblies',
        idOf(second) ?? (second === 'edit' ? one('id') : null),
      );
      if (assembly) return fromAssembly(assembly.id);
      // '/assemblies/new?site_id=…' — the job is the thing it is being created
      // under, and no asset exists yet.
      return one('site_id');
    }

    case 'machines': {
      const machine = await find<{ assemblyId: string }>(
        'machines',
        idOf(second) ?? (second === 'edit' ? one('id') : null),
      );
      return fromAssembly(machine?.assemblyId ?? one('assembly_id'));
    }

    case 'checklists': {
      const checklist = await find<{ siteId: string | null; assemblyId: string | null }>(
        'checklist_instances',
        idOf(second),
      );
      if (checklist) return checklist.siteId ?? (await fromAssembly(checklist.assemblyId));
      return one('site_id') ?? (await fromAssembly(one('assembly_id')));
    }

    case 'risk-evaluations': {
      const evaluation = await find<{
        siteId: string | null;
        assemblyId: string | null;
        machineId: string | null;
      }>('risk_evaluations', idOf(second) ?? (second === 'edit' ? one('id') : null));

      const siteId = evaluation ? evaluation.siteId : one('site_id');
      if (siteId) return siteId;

      const assemblyId = evaluation ? evaluation.assemblyId : one('assembly_id');
      if (assemblyId) return fromAssembly(assemblyId);

      const machine = await find<{ assemblyId: string }>(
        'machines',
        evaluation ? evaluation.machineId : one('machine_id'),
      );
      return fromAssembly(machine?.assemblyId ?? null);
    }

    default:
      return null;
  }
}
