/**
 * The one ordering of a round's worklist.
 *
 * The list screen and the verdict screen both need it and must agree: "save and
 * move to the next control" is meaningless if the two disagree about what next
 * is. Ordering is asset name, then reference read numerically, so CR-2 comes
 * before CR-10.
 */

import ControlReview from '@/db/models/ControlReview.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';
import { displayReference } from '@/components/ControlReviewVerdictCard';

export interface ReviewWithContext {
  review: ControlReview;
  evaluation: RiskEvaluation | null;
  /** The assembly, or 'Project Level' when the evaluation hangs off the site. */
  assemblyName: string;
  /** The sub-machine, when there is one. */
  machineName: string | null;
  /** 'Asset › Sub-machine', for one-line contexts. */
  scopeLabel: string;
}

export function buildReviewContexts(
  reviews: ControlReview[],
  evaluations: RiskEvaluation[],
  assemblies: Assembly[],
  machines: Machine[],
): ReviewWithContext[] {
  const evalMap = new Map(evaluations.map(e => [e.id, e]));
  const assemblyMap = new Map(assemblies.map(a => [a.id, a]));
  const machineMap = new Map(machines.map(m => [m.id, m]));

  return reviews.map(review => {
    const evaluation = evalMap.get(review.evalId) ?? null;
    let assemblyName = 'Project Level';
    let machineName: string | null = null;

    if (evaluation?.machineId) {
      const machine = machineMap.get(evaluation.machineId);
      machineName = machine?.machineNameReference ?? 'Unknown Sub-machine';
      const asm = machine ? assemblyMap.get(machine.assemblyId) : null;
      assemblyName = asm?.assemblyName ?? 'Unknown Asset';
    } else if (evaluation?.assemblyId) {
      assemblyName = assemblyMap.get(evaluation.assemblyId)?.assemblyName ?? 'Unknown Asset';
    }

    return {
      review,
      evaluation,
      assemblyName,
      machineName,
      scopeLabel: machineName ? `${assemblyName} › ${machineName}` : assemblyName,
    };
  });
}

export function sortReviewContexts(items: ReviewWithContext[]): ReviewWithContext[] {
  return [...items].sort((a, b) => {
    const asmCmp = a.assemblyName.localeCompare(b.assemblyName);
    if (asmCmp !== 0) return asmCmp;
    return displayReference(a.evaluation).localeCompare(
      displayReference(b.evaluation), undefined, { numeric: true },
    );
  });
}
