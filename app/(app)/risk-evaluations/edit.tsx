import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator,
  FlatList, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import Iso13857Calculator from '@/components/Iso13857Calculator';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { enqueuePhoto } from '@/services/photoQueue';
import { useDemoMode } from '@/context/DemoModeContext';
import {
  RISK_LEVELS,
  HAZARD_CATEGORIES,
  HAZARDOUS_MOVEMENT_TYPES,
  RATING_COLOURS,
  evaluateRisk,
  parseHazardCategories,
  parseHazardousMovementTypes,
  serializeStringArray,
  type RiskLevel,
} from '@/constants/risk';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';
import PhotoAnnotationModal from '@/components/PhotoAnnotationModal';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import MultiSelectPickerField from '@/components/MultiSelectPickerField';
import { isDemoSite } from '@/utils/demoMode';
import { getHazardDescriptionPrompt } from '@/utils/hazardDescriptionQuality';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';

function getWhatMightGoWrongValue(ev: RiskEvaluation) {
  return ev.whatMightGoWrong?.trim() || ev.hazardDescription || '';
}

export default function EditRiskEvaluationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const { isDemoMode } = useDemoMode();

  const [evaluation, setEvaluation] = useState<RiskEvaluation | null>(null);
  const [blockedByDemoMode, setBlockedByDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ uri: string } | null>(null);

  const [hazardTitle, setHazardTitle] = useState('');
  const [whatMightGoWrong, setWhatMightGoWrong] = useState('');
  const [hazardousMovementTypes, setHazardousMovementTypes] = useState<string[]>([]);
  const [hazardCategories, setHazardCategories] = useState<string[]>([]);
  const [preControlSeverity, setPreControlSeverity] = useState<RiskLevel | null>(null);
  const [preControlProbability, setPreControlProbability] = useState<RiskLevel | null>(null);
  const [controlDescription, setControlDescription] = useState('');
  const [postControlSeverity, setPostControlSeverity] = useState<RiskLevel | null>(null);
  const [postControlProbability, setPostControlProbability] = useState<RiskLevel | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [iso13857Open, setIso13857Open] = useState(false);

  // Sub-machine picker
  const [subMachines, setSubMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);
  const [machineSearch, setMachineSearch] = useState('');

  const preRisk = preControlSeverity && preControlProbability
    ? evaluateRisk(preControlSeverity, preControlProbability) : null;
  const postRisk = postControlSeverity && postControlProbability
    ? evaluateRisk(postControlSeverity, postControlProbability) : null;
  const whatMightGoWrongPrompt = getHazardDescriptionPrompt(whatMightGoWrong);

  const ISO_KEYWORDS = ['reach distance', 'safety distance', 'guard opening', '13857', 'reach through', 'guard gap', 'opening dimension'];
  const showIso13857Hint = useMemo(() => {
    const lower = whatMightGoWrong.toLowerCase();
    return ISO_KEYWORDS.some(keyword => lower.includes(keyword));
  }, [whatMightGoWrong]);

  const filteredMachines = subMachines.filter(m =>
    m.machineNameReference.toLowerCase().includes(machineSearch.toLowerCase()),
  );
  const selectedMachine = subMachines.find(m => m.id === selectedMachineId);
  const selectedMachineSummary = [
    selectedMachine?.machineCategory,
    selectedMachine?.machineUse,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    (async () => {
      const ev = await db.get<RiskEvaluation>('risk_evaluations').find(id);
      if (isDemoMode) {
        let site: Site | null = null;
        if (ev.siteId) {
          site = await db.get<Site>('sites').find(ev.siteId).catch(() => null);
        } else {
          let targetAssemblyId = ev.assemblyId;
          if (!targetAssemblyId && ev.machineId) {
            const machine = await db.get<Machine>('machines').find(ev.machineId).catch(() => null);
            targetAssemblyId = machine?.assemblyId ?? null;
          }
          if (targetAssemblyId) {
            const assembly = await db.get<Assembly>('assemblies').find(targetAssemblyId).catch(() => null);
            site = assembly ? await db.get<Site>('sites').find(assembly.siteId).catch(() => null) : null;
          }
        }
        if (!isDemoSite(site)) {
          setBlockedByDemoMode(true);
          setLoading(false);
          return;
        }
      }
      setEvaluation(ev);

      const categoryTitle = parseHazardCategories(ev.hazardCategory).join(', ');
      navigation.setOptions({ title: ev.nonComplianceReference || categoryTitle || 'Risk Evaluation' });
      setHazardTitle(ev.nonComplianceReference ?? '');
      setWhatMightGoWrong(getWhatMightGoWrongValue(ev));
      setHazardousMovementTypes(parseHazardousMovementTypes(ev.hazardousMovementTypes));
      setHazardCategories(parseHazardCategories(ev.hazardCategory));
      setPreControlSeverity((ev.preControlSeverity as RiskLevel | null) ?? null);
      setPreControlProbability((ev.preControlProbability as RiskLevel | null) ?? null);
      setControlDescription(ev.controlDescription ?? '');
      setPostControlSeverity((ev.postControlSeverity as RiskLevel | null) ?? null);
      setPostControlProbability((ev.postControlProbability as RiskLevel | null) ?? null);
      setPhotoUrl(ev.photoUrl ?? null);
      setSelectedMachineId(ev.machineId ?? null);

      let targetAssemblyId = ev.assemblyId;
      if (!targetAssemblyId && ev.machineId) {
        const machine = await db.get<Machine>('machines').find(ev.machineId).catch(() => null);
        targetAssemblyId = machine?.assemblyId ?? null;
      }
      if (targetAssemblyId) {
        const machines = await db.get<Machine>('machines')
          .query(Q.where('assembly_id', targetAssemblyId))
          .fetch();
        setSubMachines(machines);
      }

      setLoading(false);
    })();
  }, [db, id, isDemoMode, navigation]);

  async function handleSave() {
    if (!hazardTitle.trim()) {
      setError('Hazard title is required.');
      return;
    }
    if (!whatMightGoWrong.trim() || !evaluation) {
      setError('What might go wrong? is required.');
      return;
    }
    setSaving(true);
    try {
      const rawHazardText = whatMightGoWrong.trim();
      await db.write(async () => {
        await evaluation.update(ev => {
          ev.nonComplianceReference = hazardTitle.trim();
          ev.whatMightGoWrong = rawHazardText;
          ev.hazardousMovementTypes = serializeStringArray(hazardousMovementTypes);
          ev.hazardDescription = rawHazardText;
          ev.hazardCategory = serializeStringArray(hazardCategories);
          ev.preControlSeverity = preControlSeverity;
          ev.preControlProbability = preControlProbability;
          ev.preControlScore = preRisk?.score ?? null;
          ev.preControlRating = preRisk?.rating ?? null;
          ev.controlDescription = controlDescription.trim() || null;
          ev.postControlSeverity = postControlSeverity;
          ev.postControlProbability = postControlProbability;
          ev.postControlScore = postRisk?.score ?? null;
          ev.postControlRating = postRisk?.rating ?? null;
          ev.photoUrl = photoUrl;
          ev.machineId = selectedMachineId;
          ev.isSynced = false;
        });
      });
      if (photoUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: photoUrl, collection: 'risk_evaluations', recordId: evaluation.id, field: 'photo_url' });
      }
      router.back();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (blockedByDemoMode) return <DemoModeBlocked />;

  function handleAnnotationDone(uri: string) {
    setPendingAnnotation(null);
    setPhotoUrl(uri);
  }

  function handleAnnotationCancel() {
    setPendingAnnotation(null);
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Hazard Title *</Text>
        <TextInput
          style={styles.input}
          value={hazardTitle}
          onChangeText={setHazardTitle}
          placeholder="e.g. 4.1 — Missing interlocked guard"
          placeholderTextColor={Colors.textLight}
        />

        {subMachines.length > 0 ? (
          <>
            <Text style={styles.label}>Sub-machine</Text>
            <Pressable style={styles.pickerTrigger} onPress={() => setMachinePickerOpen(true)}>
              <Feather name="cpu" size={19} color={Colors.textMuted} />
              <Text style={[styles.pickerTriggerText, !selectedMachine && styles.pickerTriggerPlaceholder]}>
                {selectedMachine ? selectedMachine.machineNameReference : 'Optional — select a sub-machine'}
              </Text>
              <Feather name="chevron-down" size={19} color={Colors.textMuted} />
            </Pressable>
            {selectedMachineSummary ? (
              <Text style={styles.machineMetaText}>{selectedMachineSummary}</Text>
            ) : null}
          </>
        ) : null}

        <Text style={styles.label}>Photo</Text>
        <PhotoPicker
          label="Hazard Photo"
          currentUrl={photoUrl}
          onUploaded={url => setPhotoUrl(url)}
          onAnnotationRequest={(uri) => setPendingAnnotation({ uri })}
        />

        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelInRow]}>What Might Go Wrong? *</Text>
          {showIso13857Hint && (
            <Pressable style={styles.toolIconBtn} onPress={() => setIso13857Open(true)} hitSlop={8}>
              <Feather name="tool" size={13} color={Colors.primary} />
            </Pressable>
          )}
        </View>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={whatMightGoWrong}
          onChangeText={setWhatMightGoWrong}
          placeholder="Describe the harmful event, component, and location"
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={3}
        />
        {whatMightGoWrongPrompt ? (
          <View style={styles.qualityHint}>
            <Feather name="alert-circle" size={15} color={Colors.warning} />
            <Text style={styles.qualityHintText}>{whatMightGoWrongPrompt}</Text>
          </View>
        ) : null}

        <MultiSelectPickerField
          label="Hazardous Movement Types"
          modalTitle="Select Hazardous Movement Types"
          options={HAZARDOUS_MOVEMENT_TYPES}
          selectedValues={hazardousMovementTypes}
          onChange={setHazardousMovementTypes}
          placeholder="Optional — select if relevant"
        />

        <Text style={styles.label}>Category (optional)</Text>
        <View style={styles.chipRow}>
          {HAZARD_CATEGORIES.map(cat => {
            const selected = hazardCategories.includes(cat);
            return (
              <Pressable
                key={cat}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setHazardCategories(prev =>
                  prev.includes(cat) ? prev.filter(item => item !== cat) : [...prev, cat]
                )}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{cat}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionHeading}>Pre-control Risk</Text>
        <RiskSelector label="Severity" value={preControlSeverity} onChange={setPreControlSeverity} />
        <RiskSelector label="Probability" value={preControlProbability} onChange={setPreControlProbability} />
        <RiskBadge label="Pre-control rating" rating={preRisk?.rating ?? null} />

        <Text style={styles.label}>Control Measures</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={controlDescription}
          onChangeText={setControlDescription}
          placeholder="Describe control measures"
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={3}
        />

        <View style={styles.divider} />
        <Text style={styles.sectionHeading}>Post-control Risk</Text>
        <RiskSelector label="Severity" value={postControlSeverity} onChange={setPostControlSeverity} />
        <RiskSelector label="Probability" value={postControlProbability} onChange={setPostControlProbability} />
        <RiskBadge label="Post-control rating" rating={postRisk?.rating ?? null} />

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>Save Changes</Text>
        </Pressable>
      </ScrollView>

      <Iso13857Calculator visible={iso13857Open} onClose={() => setIso13857Open(false)} />

      <Modal
        visible={machinePickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => { setMachinePickerOpen(false); setMachineSearch(''); }}
      >
        <KeyboardAvoidingView
          style={styles.pickerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => { setMachinePickerOpen(false); setMachineSearch(''); }}
          />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Select Sub-machine</Text>
            <TextInput
              style={styles.pickerSearch}
              placeholder="Search by name..."
              placeholderTextColor={Colors.textLight}
              value={machineSearch}
              onChangeText={setMachineSearch}
              autoFocus
            />
            <FlatList
              data={filteredMachines}
              keyExtractor={m => m.id}
              style={styles.pickerList}
              contentContainerStyle={styles.pickerListContent}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.pickerItem, selectedMachineId === item.id && styles.pickerItemSelected]}
                  onPress={() => {
                    setSelectedMachineId(item.id);
                    setMachinePickerOpen(false);
                    setMachineSearch('');
                  }}
                >
                  <Feather name="cpu" size={19} color={selectedMachineId === item.id ? Colors.primary : Colors.textMuted} />
                  <View style={styles.pickerItemTextWrap}>
                    <Text
                      style={[styles.pickerItemText, selectedMachineId === item.id && styles.pickerItemTextSelected]}
                      numberOfLines={1}
                    >
                      {item.machineNameReference}
                    </Text>
                    {(item.machineCategory || item.machineUse) ? (
                      <Text style={styles.pickerItemMeta} numberOfLines={1}>
                        {[item.machineCategory, item.machineUse].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  {selectedMachineId === item.id
                    ? <Feather name="check" size={19} color={Colors.primary} />
                    : null}
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.pickerEmpty}>No matches</Text>}
            />
            {selectedMachineId ? (
              <Pressable
                style={styles.pickerClear}
                onPress={() => { setSelectedMachineId(null); setMachinePickerOpen(false); setMachineSearch(''); }}
              >
                <Feather name="x-circle" size={17} color={Colors.danger} />
                <Text style={styles.pickerClearText}>Clear selection</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <PhotoAnnotationModal
        visible={!!pendingAnnotation}
        uri={pendingAnnotation?.uri ?? null}
        onDone={handleAnnotationDone}
        onCancel={handleAnnotationCancel}
      />
    </>
  );
}

function RiskSelector({ label, value, onChange }: { label: string; value: RiskLevel | null; onChange: (v: RiskLevel | null) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {RISK_LEVELS.map(level => (
          <Pressable
            key={level}
            style={[styles.chip, value === level && styles.chipSelected]}
            onPress={() => onChange(value === level ? null : level)}
          >
            <Text style={[styles.chipText, value === level && styles.chipTextSelected]}>{level}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RiskBadge({ label, rating }: { label: string; rating: RiskLevel | null }) {
  if (!rating) {
    return (
      <View style={[styles.riskBadge, { backgroundColor: Colors.border + '40', borderLeftColor: Colors.border }]}>
        <Text style={styles.riskBadgeLabel}>{label}</Text>
        <Text style={[styles.riskBadgeRating, { color: Colors.textLight }]}>Not set</Text>
      </View>
    );
  }
  const colour = RATING_COLOURS[rating];
  return (
    <View style={[styles.riskBadge, { backgroundColor: colour + '18', borderLeftColor: colour }]}>
      <Text style={styles.riskBadgeLabel}>{label}</Text>
      <Text style={[styles.riskBadgeRating, { color: colour }]}>{rating}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 19, paddingBottom: 48 },
  label: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 7, marginTop: 24 },
  labelRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 24, marginBottom: 7,
  },
  labelInRow: { marginTop: 0, marginBottom: 0, flex: 1 },
  toolIconBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary + '16',
    alignItems: 'center', justifyContent: 'center',
  },
  subLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted, marginBottom: 10 },
  sectionHeading: { fontSize: 19, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 24 },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 14, fontSize: 18, color: Colors.text,
  },
  multiline: { height: 106, textAlignVertical: 'top' },
  qualityHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FBD38D',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  qualityHintText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#9A3412',
    fontWeight: '500',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 24, paddingVertical: 8, paddingHorizontal: 17,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 16, color: Colors.text },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  riskBadge: { borderRadius: 10, borderLeftWidth: 4, padding: 14, marginTop: 10, marginBottom: 5 },
  riskBadgeLabel: {
    fontSize: 13, fontWeight: '600', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5,
  },
  riskBadgeRating: { fontSize: 22, fontWeight: '700' },
  button: {
    backgroundColor: Colors.primary, borderRadius: 10, height: 58,
    alignItems: 'center', justifyContent: 'center', marginTop: 38,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
  pickerTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 14,
  },
  pickerTriggerText: { flex: 1, fontSize: 18, color: Colors.text },
  pickerTriggerPlaceholder: { color: Colors.textLight },
  machineMetaText: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  pickerSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingBottom: 34, maxHeight: '75%',
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  pickerTitle: { fontSize: 19, fontWeight: '700', color: Colors.text, paddingHorizontal: 19, paddingVertical: 14 },
  pickerSearch: {
    marginHorizontal: 19, marginBottom: 10, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12,
    fontSize: 17, color: Colors.text,
  },
  pickerList: { flexGrow: 0 },
  pickerListContent: { paddingBottom: 4 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 19, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pickerItemSelected: { backgroundColor: Colors.primary + '10' },
  pickerItemTextWrap: { flex: 1 },
  pickerItemText: { fontSize: 18, color: Colors.text },
  pickerItemTextSelected: { color: Colors.primary, fontWeight: '600' },
  pickerItemMeta: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  pickerEmpty: { textAlign: 'center', color: Colors.textLight, padding: 24, fontSize: 17 },
  pickerClear: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, marginTop: 4,
  },
  pickerClearText: { fontSize: 17, color: Colors.danger, fontWeight: '600' },
});
