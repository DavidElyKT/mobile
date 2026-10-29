import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useQuery, useRecord } from '@/db/hooks';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import { HseGuidanceSummary } from '@/components/HseGuidanceCard';

/**
 * HSE guidance for whatever a risk evaluation is on, for the top of the
 * evaluation screens: a sub-machine by its own category; an asset as the asset
 * page shows it — a standalone asset by its own category, an assembly by every
 * sub-machine on it. Offline, from the synced pack, like the rest of the card.
 */
export default function EvalHseGuidance({ machineId, assemblyId, style }: {
  machineId?: string | null;
  assemblyId?: string | null;
  style?: object;
}) {
  const db = useDatabase();
  const machine = useRecord<Machine>(db.get<Machine>('machines'), machineId ?? undefined);
  const assembly = useRecord<Assembly>(db.get<Assembly>('assemblies'), assemblyId ?? machine?.assemblyId ?? undefined);
  const isLine = !machineId && assembly?.assetType === 'assembly';
  const subMachines = useQuery<Machine>(
    db.get<Machine>('machines').query(Q.where('assembly_id', isLine ? assembly!.id : '')),
    [isLine, assembly?.id],
  );

  if (machineId) {
    return machine ? <HseGuidanceSummary style={style} subjects={[{ label: null, category: machine.machineCategory }]} /> : null;
  }
  if (!assembly) return null;
  return (
    <HseGuidanceSummary
      style={style}
      subjects={isLine
        ? subMachines.map(m => ({ label: m.machineNameReference ?? null, category: m.machineCategory }))
        : [{ label: null, category: assembly.machineCategory }]}
    />
  );
}
