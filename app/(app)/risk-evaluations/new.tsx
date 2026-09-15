import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView,
  FlatList, Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import FocusWizardModal, { type FocusWizardModalRef, type WizardStep, type WizardSuggestion } from '@/components/FocusWizardModal';
import PhotoAnnotationModal from '@/components/PhotoAnnotationModal';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Iso13857Calculator from '@/components/Iso13857Calculator';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
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
import { RiskDefinitionsButton } from '@/components/RiskDefinitionsModal';
import PhotoPicker from '@/components/PhotoPicker';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import ControlReviewLocked from '@/components/ControlReviewLocked';
import { useControlReview } from '@/context/ControlReviewContext';
import MultiSelectPickerField from '@/components/MultiSelectPickerField';
import { isDemoSite } from '@/utils/demoMode';
import { getHazardDescriptionPrompt } from '@/utils/hazardDescriptionQuality';
import { getCachedUserId } from '@/services/sync';
import { resolveJobSiteId } from '@/services/jobContext';
import { enqueuePhoto } from '@/services/photoQueue';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';

function getWhatMightGoWrongValue(ev: RiskEvaluation) {
  return ev.whatMightGoWrong?.trim() || ev.hazardDescription || '';
}

function getMovementSummary(ev: RiskEvaluation) {
  return parseHazardousMovementTypes(ev.hazardousMovementTypes).join(', ');
}

export default function NewRiskEvaluationScreen() {
  const router = useRouter();
  const { machine_id, assembly_id, site_id, checklist_id, question_number } =
    useLocalSearchParams<{ machine_id?: string; assembly_id?: string; site_id?: string; checklist_id?: string; question_number?: string }>();
  const isProjectRiskEval = !!site_id && !assembly_id && !machine_id;
  const db = useDatabase();
  const { isDemoMode } = useDemoMode();
  const { isActive: isControlReviewActive } = useControlReview();

  const [hazardTitle, setHazardTitle] = useState(question_number ?? '');
  const [whatMightGoWrong, setWhatMightGoWrong] = useState('');
  const [hazardousMovementTypes, setHazardousMovementTypes] = useState<string[]>([]);
  const [hazardCategories, setHazardCategories] = useState<string[]>([]);
  const [preControlSeverity, setPreControlSeverity] = useState<RiskLevel | null>(null);
  const [preControlProbability, setPreControlProbability] = useState<RiskLevel | null>(null);
  const [controlDescription, setControlDescription] = useState('');
  const [postControlSeverity, setPostControlSeverity] = useState<RiskLevel | null>(null);
  const [postControlProbability, setPostControlProbability] = useState<RiskLevel | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // The photo before annotation, kept so AI control illustrations have a clean
  // view of the machine. Null unless the assessor actually drew on it.
  const [photoOriginalUrl, setPhotoOriginalUrl] = useState<string | null>(null);
  const wizardPhotoOriginalRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [blockedByDemoMode, setBlockedByDemoMode] = useState(false);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const wizardRef = useRef<FocusWizardModalRef>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<
    | { source: 'wizard'; uri: string; key: string }
    | { source: 'form'; uri: string }
    | null
  >(null);

  const [existingEvals, setExistingEvals] = useState<RiskEvaluation[]>([]);
  const [assemblyNameMap, setAssemblyNameMap] = useState<Map<string, string>>(new Map());
  const [libraryEvals, setLibraryEvals] = useState<RiskEvaluation[]>([]);
  const [suggestions, setSuggestions] = useState<RiskEvaluation[]>([]);
  const [titleSuggestions, setTitleSuggestions] = useState<RiskEvaluation[]>([]);
  const [librarySuggestions, setLibrarySuggestions] = useState<RiskEvaluation[]>([]);
  const [libraryTitleSuggestions, setLibraryTitleSuggestions] = useState<RiskEvaluation[]>([]);
  const textSuggestionLocked = useRef(false);
  const titleSuggestionLocked = useRef(false);

  const [iso13857Open, setIso13857Open] = useState(false);

  // Sub-machine picker — declared here so riskFocusSteps useMemo can reference subMachines safely.
  const [subMachines, setSubMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);
  const [machineSearch, setMachineSearch] = useState('');

  // Focus mode steps — rebuilt when suggestion data or sub-machine list changes.
  const riskFocusSteps = useMemo<WizardStep[]>(() => {
    function evalToSuggestion(
      ev: RiskEvaluation,
      field: 'title' | 'hazard',
      isLibrary: boolean,
    ): WizardSuggestion {
      const hazardText = ev.whatMightGoWrong?.trim() || ev.hazardDescription || '';
      return {
        label: field === 'title' ? (ev.nonComplianceReference ?? '') : hazardText,
        isLibrary,
        apply: () => ({
          nonComplianceReference: ev.nonComplianceReference ?? '',
          whatMightGoWrong: hazardText,
          hazardCategories: parseHazardCategories(ev.hazardCategory),
          hazardousMovementTypes: parseHazardousMovementTypes(ev.hazardousMovementTypes),
        }),
      };
    }

    function buildSuggestions(
      value: string,
      field: 'title' | 'hazard',
    ): WizardSuggestion[] {
      const trimmed = value.trim();

      if (field === 'title') {
        if (trimmed.length < 2) return [];
        const lower = trimmed.toLowerCase();
        const lib = libraryEvals
          .filter(ev => ev.nonComplianceReference?.toLowerCase().includes(lower))
          .slice(0, 4)
          .map(ev => evalToSuggestion(ev, 'title', true));
        const libLabels = new Set(lib.map(s => s.label));
        const proj = existingEvals
          .filter(ev => ev.nonComplianceReference?.toLowerCase().includes(lower))
          .slice(0, 4)
          .map(ev => evalToSuggestion(ev, 'title', false))
          .filter(s => s.label && !libLabels.has(s.label));
        return [...lib, ...proj].slice(0, 6);
      }

      // hazard field: word-based scoring, min 3 chars, words must be >= 3 chars
      if (trimmed.length < 3) return [];
      const words = trimmed.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
      if (!words.length) return [];

      const haystackOf = (ev: RiskEvaluation) =>
        `${ev.whatMightGoWrong?.trim() ?? ''} ${ev.hazardDescription ?? ''}`.toLowerCase();
      const scoreEvals = (evals: RiskEvaluation[]) =>
        evals
          .map(ev => ({ ev, score: words.filter(w => haystackOf(ev).includes(w)).length }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score);

      const lib = scoreEvals(libraryEvals).slice(0, 4)
        .map(({ ev }) => evalToSuggestion(ev, 'hazard', true));
      const libLabels = new Set(lib.map(s => s.label));
      const proj = scoreEvals(existingEvals).slice(0, 4)
        .map(({ ev }) => evalToSuggestion(ev, 'hazard', false))
        .filter(s => s.label && !libLabels.has(s.label));
      return [...lib, ...proj].slice(0, 6);
    }

    const subMachineStep: WizardStep | null = subMachines.length > 0 ? {
      key: 'machineId',
      type: 'single-select',
      question: 'Which sub-machine is this hazard on?',
      options: subMachines.map(m => m.machineNameReference),
      optionValueMap: Object.fromEntries(subMachines.map(m => [m.machineNameReference, m.id])),
      skippable: true,
      searchable: true,
    } : null;

    return [
      {
        key: 'nonComplianceReference',
        type: 'text',
        question: 'What is the hazard reference?',
        placeholder: 'e.g. 4.1 — Missing interlocked guard',
        required: true,
        getSuggestions: (value) => buildSuggestions(value, 'title'),
      },
      {
        key: 'whatMightGoWrong',
        type: 'multiline',
        question: 'What might go wrong?',
        subtext: 'Describe the harmful event, component, and location.',
        placeholder: 'e.g. Unguarded nip point on the conveyor drive belt',
        required: true,
        getSuggestions: (value) => buildSuggestions(value, 'hazard'),
      },
      ...(subMachineStep ? [subMachineStep] : []),
      {
        key: 'hazardCategories',
        type: 'multi-select',
        question: 'What category of hazard is this?',
        options: HAZARD_CATEGORIES,
        skippable: true,
      },
      {
        key: 'hazardousMovementTypes',
        type: 'multi-select',
        question: 'What types of hazardous movement are involved?',
        options: HAZARDOUS_MOVEMENT_TYPES,
        skippable: true,
      },
      {
        key: 'photoUrl',
        type: 'photo',
        question: 'Take a photo of the hazard',
        photoLabel: 'Hazard Photo',
        skippable: true,
      },
      {
        key: 'preControlSeverity',
        type: 'single-select',
        question: 'Without additional controls — how severe could the injury be?',
        options: RISK_LEVELS,
        helpTopic: 'severity',
        skippable: true,
      },
      {
        key: 'preControlProbability',
        type: 'single-select',
        question: 'Without controls — how likely is harm?',
        options: RISK_LEVELS,
        helpTopic: 'probability',
        skippable: true,
      },
      {
        key: '_preControlBadge',
        type: 'badge',
        question: 'Pre-control Risk',
        computeBadge: (d) => {
          if (d.preControlSeverity && d.preControlProbability) {
            return evaluateRisk(d.preControlSeverity as RiskLevel, d.preControlProbability as RiskLevel);
          }
          return { rating: null, score: null };
        },
      },
    ];
  }, [existingEvals, libraryEvals, subMachines]);

  async function handleWizardPhotoRequest(type: 'camera' | 'library', key: string) {
    wizardRef.current?.skipNextReset();
    setFocusModeOpen(false);
    await new Promise(resolve => setTimeout(resolve, 400));
    try {
      let result: ImagePicker.ImagePickerResult;
      if (type === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Camera access is needed to take photos.');
          setFocusModeOpen(true);
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.85 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Photo library access is needed to select photos.');
          setFocusModeOpen(true);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.85 });
      }
      if (!result.canceled && result.assets[0]) {
        const dir = FileSystem.documentDirectory + 'pending_photos/';
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const localUri = dir + `photo_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: result.assets[0].uri, to: localUri });
        // Show annotation before reopening the wizard
        setPendingAnnotation({ source: 'wizard', uri: localUri, key });
      } else {
        setFocusModeOpen(true);
      }
    } catch (e: any) {
      Alert.alert('Photo error', e.message);
      setFocusModeOpen(true);
    }
  }

  function handleAnnotationDone(annotatedUri: string, originalUri?: string) {
    const pending = pendingAnnotation;
    if (!pending) return;
    setPendingAnnotation(null);
    if (pending.source === 'wizard') {
      // Held outside the wizard rather than injected as a second field: the
      // wizard collects one value per question, and the original is not
      // something the assessor answers — it is a by-product of annotating.
      wizardPhotoOriginalRef.current = originalUri ?? null;
      setFocusModeOpen(true);
      setTimeout(() => wizardRef.current?.injectPhoto(pending.key, annotatedUri), 150);
    } else {
      setPhotoUrl(annotatedUri);
      setPhotoOriginalUrl(originalUri ?? null);
    }
  }

  function handleAnnotationCancel() {
    const pending = pendingAnnotation;
    setPendingAnnotation(null);
    if (pending?.source === 'wizard') setFocusModeOpen(true);
  }

  async function handleFocusSave(wizardData: Record<string, any>): Promise<void> {
    if (!wizardData.nonComplianceReference?.trim()) throw new Error('Hazard title is required.');
    if (!wizardData.whatMightGoWrong?.trim()) throw new Error('What might go wrong? is required.');

    const createdBy = (await getCachedUserId()) ?? 0;
    // Focus mode captures the sub-machine via the wizard; fall back to URL param.
    const effectiveMachineId = wizardData.machineId ?? machine_id ?? null;
    // Which job this hazard was found on. For an asset being re-assessed that is
    // NOT the job that created it — see services/jobContext.
    const jobSiteId = await resolveJobSiteId(db, { assemblyId: assembly_id, siteId: site_id });
    const rawHazardText = wizardData.whatMightGoWrong.trim();
    const preControlSev = (wizardData.preControlSeverity as RiskLevel) ?? null;
    const preControlProb = (wizardData.preControlProbability as RiskLevel) ?? null;
    const preRiskResult = preControlSev && preControlProb
      ? evaluateRisk(preControlSev, preControlProb)
      : null;

    const newEval = await db.write(async () => {
      return await db.get<RiskEvaluation>('risk_evaluations').create(ev => {
        ev.siteId = jobSiteId;
        ev.assemblyId = assembly_id ?? null;
        ev.machineId = effectiveMachineId;
        ev.checklistId = checklist_id ?? null;
        ev.nonComplianceReference = wizardData.nonComplianceReference.trim();
        ev.whatMightGoWrong = rawHazardText;
        ev.hazardDescription = rawHazardText;
        ev.hazardousMovementTypes = serializeStringArray(wizardData.hazardousMovementTypes ?? []);
        ev.hazardCategory = serializeStringArray(wizardData.hazardCategories ?? []);
        ev.photoUrl = wizardData.photoUrl ?? null;
        ev.photoOriginalUrl = wizardPhotoOriginalRef.current;
        ev.preControlSeverity = preControlSev;
        ev.preControlProbability = preControlProb;
        ev.preControlScore = preRiskResult?.score ?? null;
        ev.preControlRating = preRiskResult?.rating ?? null;
        ev.controlDescription = null;
        ev.postControlSeverity = null;
        ev.postControlProbability = null;
        ev.postControlScore = null;
        ev.postControlRating = null;
        ev.createdBy = createdBy;
        ev.isSynced = false;
      });
    });

    if (wizardData.photoUrl?.startsWith('file://')) {
      await enqueuePhoto({ localUri: wizardData.photoUrl, collection: 'risk_evaluations', recordId: newEval.id, field: 'photo_url' });
    }
    // Queued separately so the clean original reaches blob storage too — it is a
    // second file on disk, not a variant the server can derive from the first.
    if (wizardPhotoOriginalRef.current?.startsWith('file://')) {
      await enqueuePhoto({ localUri: wizardPhotoOriginalRef.current, collection: 'risk_evaluations', recordId: newEval.id, field: 'photo_original_url' });
    }
    wizardPhotoOriginalRef.current = null;
    // Wizard owns success state — no setSaved/setFocusModeOpen here.
  }

  const preRisk = preControlSeverity && preControlProbability
    ? evaluateRisk(preControlSeverity, preControlProbability) : null;
  const postRisk = postControlSeverity && postControlProbability
    ? evaluateRisk(postControlSeverity, postControlProbability) : null;
  const whatMightGoWrongPrompt = getHazardDescriptionPrompt(whatMightGoWrong);

  const ISO_KEYWORDS = ['reach distance', 'safety distance', 'guard opening', '13857', 'reach through', 'guard gap', 'opening dimension'];
  const showIso13857Hint = useMemo(() => {
    const lower = whatMightGoWrong.toLowerCase();
    if (ISO_KEYWORDS.some(keyword => lower.includes(keyword))) return true;
    const allSuggestions = [...suggestions, ...librarySuggestions];
    return allSuggestions.some(ev =>
      ISO_KEYWORDS.some(keyword => getWhatMightGoWrongValue(ev).toLowerCase().includes(keyword))
    );
  }, [whatMightGoWrong, suggestions, librarySuggestions]);

  const filteredMachines = subMachines.filter(m => {
    const q = machineSearch.toLowerCase();
    return (
      (m.machineNameReference ?? '').toLowerCase().includes(q) ||
      (m.machineCategory ?? '').toLowerCase().includes(q) ||
      (m.machineUse ?? '').toLowerCase().includes(q) ||
      (m.manufacturer ?? '').toLowerCase().includes(q) ||
      (m.model ?? '').toLowerCase().includes(q) ||
      (m.description ?? '').toLowerCase().includes(q)
    );
  });
  const selectedMachine = subMachines.find(m => m.id === selectedMachineId);
  const selectedMachineSummary = [
    selectedMachine?.machineCategory,
    selectedMachine?.machineUse,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    if (!isDemoMode) setBlockedByDemoMode(false);

    // Load sub-machines from WatermelonDB
    (async () => {
      let targetAssemblyId: string | null = assembly_id ?? null;
      if (!targetAssemblyId && machine_id) {
        try {
          const machine = await db.get<Machine>('machines').find(machine_id);
          targetAssemblyId = machine?.assemblyId ?? null;
          if (machine_id) setSelectedMachineId(machine_id);
        } catch {
          // ignore missing machine
        }
      }
      if (targetAssemblyId) {
        const machines = await db.get<Machine>('machines')
          .query(Q.where('assembly_id', targetAssemblyId))
          .fetch();
        setSubMachines(machines);
      }

      let projectSiteId: string | null = site_id ?? null;
      if (!projectSiteId && targetAssemblyId) {
        try {
          const assembly = await db.get<Assembly>('assemblies').find(targetAssemblyId);
          projectSiteId = assembly?.siteId ?? null;
        } catch {
          // ignore missing assembly
        }
      }

      if (isDemoMode) {
        const site = projectSiteId ? await db.get<Site>('sites').find(projectSiteId).catch(() => null) : null;
        if (!isDemoSite(site)) {
          setBlockedByDemoMode(true);
          return;
        }
        setBlockedByDemoMode(false);
      }

      let evals: RiskEvaluation[] = [];
      if (projectSiteId) {
        const projectAssemblies = await db.get<Assembly>('assemblies')
          .query(Q.where('site_id', projectSiteId))
          .fetch();
        const assemblyIds = projectAssemblies.map(a => a.id);

        const nameMap = new Map<string, string>();
        projectAssemblies.forEach(assembly => nameMap.set(assembly.id, assembly.assemblyName));
        setAssemblyNameMap(nameMap);

        const machineIds: string[] = [];
        if (assemblyIds.length > 0) {
          const projectMachines = await db.get<Machine>('machines')
            .query(Q.where('assembly_id', Q.oneOf(assemblyIds)))
            .fetch();
          projectMachines.forEach(machine => machineIds.push(machine.id));
        }

        const conditions = [Q.where('site_id', projectSiteId)];
        if (assemblyIds.length > 0) conditions.push(Q.where('assembly_id', Q.oneOf(assemblyIds)));
        if (machineIds.length > 0) conditions.push(Q.where('machine_id', Q.oneOf(machineIds)));

        const allProjectEvals = await db.get<RiskEvaluation>('risk_evaluations')
          .query(Q.and(
            Q.or(...conditions),
            Q.where('is_library_item', Q.notEq(true)),
          ))
          .fetch();
        evals = allProjectEvals;
      }
      setExistingEvals(evals);

      if (isDemoMode) {
        setLibraryEvals([]);
      } else {
        const library = await db.get<RiskEvaluation>('risk_evaluations')
          .query(Q.where('is_library_item', true))
          .fetch();
        setLibraryEvals(library);
      }
    })();
  }, [assembly_id, db, isDemoMode, machine_id, site_id]);

  useEffect(() => {
    if (textSuggestionLocked.current) return;
    const trimmed = whatMightGoWrong.trim();
    if (trimmed.length < 3 || !existingEvals.length) {
      setSuggestions([]);
      return;
    }
    const words = trimmed.toLowerCase().split(/\s+/).filter(word => word.length >= 3);
    if (!words.length) {
      setSuggestions([]);
      return;
    }

    const scored = existingEvals
      .map(ev => {
        const haystack = `${getWhatMightGoWrongValue(ev)} ${ev.hazardDescription}`.toLowerCase();
        return {
          ev,
          score: words.filter(word => haystack.includes(word)).length,
        };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    setSuggestions(scored.slice(0, 4).map(({ ev }) => ev));
  }, [existingEvals, whatMightGoWrong]);

  useEffect(() => {
    if (titleSuggestionLocked.current) return;
    const trimmed = hazardTitle.trim();
    if (trimmed.length < 2 || !existingEvals.length) {
      setTitleSuggestions([]);
      return;
    }
    const lower = trimmed.toLowerCase();
    const matches = existingEvals
      .filter(ev => ev.nonComplianceReference?.toLowerCase().includes(lower))
      .slice(0, 4);
    setTitleSuggestions(matches);
  }, [existingEvals, hazardTitle]);

  useEffect(() => {
    if (textSuggestionLocked.current) return;
    const trimmed = whatMightGoWrong.trim();
    if (trimmed.length < 3 || !libraryEvals.length) {
      setLibrarySuggestions([]);
      return;
    }
    const words = trimmed.toLowerCase().split(/\s+/).filter(word => word.length >= 3);
    if (!words.length) {
      setLibrarySuggestions([]);
      return;
    }
    const scored = libraryEvals
      .map(ev => {
        const haystack = `${getWhatMightGoWrongValue(ev)} ${ev.hazardDescription}`.toLowerCase();
        return {
          ev,
          score: words.filter(word => haystack.includes(word)).length,
        };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);
    setLibrarySuggestions(scored.slice(0, 4).map(({ ev }) => ev));
  }, [libraryEvals, whatMightGoWrong]);

  useEffect(() => {
    if (titleSuggestionLocked.current) return;
    const trimmed = hazardTitle.trim();
    if (trimmed.length < 2 || !libraryEvals.length) {
      setLibraryTitleSuggestions([]);
      return;
    }
    const lower = trimmed.toLowerCase();
    const matches = libraryEvals
      .filter(ev => ev.nonComplianceReference?.toLowerCase().includes(lower))
      .slice(0, 4);
    setLibraryTitleSuggestions(matches);
  }, [hazardTitle, libraryEvals]);

  function applyTitleSuggestion(ev: RiskEvaluation) {
    titleSuggestionLocked.current = true;
    textSuggestionLocked.current = true;
    setHazardTitle(ev.nonComplianceReference ?? '');
    setWhatMightGoWrong(getWhatMightGoWrongValue(ev));
    setHazardousMovementTypes(parseHazardousMovementTypes(ev.hazardousMovementTypes));
    setHazardCategories(parseHazardCategories(ev.hazardCategory));
    setTitleSuggestions([]);
    setLibraryTitleSuggestions([]);
    setSuggestions([]);
    setLibrarySuggestions([]);
  }

  function applySuggestion(ev: RiskEvaluation) {
    textSuggestionLocked.current = true;
    setWhatMightGoWrong(getWhatMightGoWrongValue(ev));
    setHazardousMovementTypes(parseHazardousMovementTypes(ev.hazardousMovementTypes));
    setHazardCategories(parseHazardCategories(ev.hazardCategory));
    setPreControlSeverity(ev.preControlSeverity);
    setPreControlProbability(ev.preControlProbability);
    setControlDescription(ev.controlDescription ?? '');
    setPostControlSeverity(ev.postControlSeverity);
    setPostControlProbability(ev.postControlProbability);
    setSuggestions([]);
    setLibrarySuggestions([]);
  }

  function resetForm() {
    titleSuggestionLocked.current = false;
    textSuggestionLocked.current = false;
    setHazardTitle(question_number ?? '');
    setWhatMightGoWrong('');
    setHazardousMovementTypes([]);
    setHazardCategories([]);
    setPreControlSeverity(null);
    setPreControlProbability(null);
    setControlDescription('');
    setPostControlSeverity(null);
    setPostControlProbability(null);
    setPhotoUrl(null);
    setSelectedMachineId(machine_id ?? null);
    setPendingAnnotation(null);
    setFocusModeOpen(false);
    setIso13857Open(false);
    setMachinePickerOpen(false);
    setMachineSearch('');
    setTitleSuggestions([]);
    setLibraryTitleSuggestions([]);
    setSuggestions([]);
    setLibrarySuggestions([]);
    setError(null);
    setSaving(false);
    setSaved(false);
  }

  async function handleSave() {
    if (!hazardTitle.trim()) {
      setError('Hazard title is required.');
      return;
    }
    if (!whatMightGoWrong.trim()) {
      setError('What might go wrong? is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const createdBy = (await getCachedUserId()) ?? 0;
      const effectiveMachineId = selectedMachineId ?? machine_id ?? null;
      const rawHazardText = whatMightGoWrong.trim();
      const jobSiteId = await resolveJobSiteId(db, { assemblyId: assembly_id, siteId: site_id });

      const newEval = await db.write(async () => {
        return await db.get<RiskEvaluation>('risk_evaluations').create(ev => {
          ev.siteId = jobSiteId;
          ev.assemblyId = assembly_id ?? null;
          ev.machineId = effectiveMachineId;
          ev.checklistId = checklist_id ?? null;
          ev.nonComplianceReference = hazardTitle.trim();
          ev.whatMightGoWrong = rawHazardText;
          ev.hazardousMovementTypes = serializeStringArray(hazardousMovementTypes);
          ev.hazardDescription = rawHazardText;
          ev.hazardCategory = serializeStringArray(hazardCategories);
          ev.photoUrl = photoUrl;
          ev.photoOriginalUrl = photoOriginalUrl;
          ev.preControlSeverity = preControlSeverity;
          ev.preControlProbability = preControlProbability;
          ev.preControlScore = preRisk?.score ?? null;
          ev.preControlRating = preRisk?.rating ?? null;
          ev.controlDescription = controlDescription.trim() || null;
          ev.postControlSeverity = postControlSeverity;
          ev.postControlProbability = postControlProbability;
          ev.postControlScore = postRisk?.score ?? null;
          ev.postControlRating = postRisk?.rating ?? null;
          ev.createdBy = createdBy;
          ev.isSynced = false;
        });
      });

      if (photoUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: photoUrl, collection: 'risk_evaluations', recordId: newEval.id, field: 'photo_url' });
      }
      // Queued separately so the clean original reaches blob storage too — it is
      // a second file on disk, not a variant the server can derive from the first.
      if (photoOriginalUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: photoOriginalUrl, collection: 'risk_evaluations', recordId: newEval.id, field: 'photo_original_url' });
      }

      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (blockedByDemoMode) return <DemoModeBlocked />;
  // No new evaluations from inside a control review. The D6 new-hazard path is
  // its own explicit route and is not built in this phase.
  if (isControlReviewActive) {
    return (
      <ControlReviewLocked reason="Raising a new hazard during a control review is not available in this build. Record the verdicts you came for; a new finding needs a fresh assessment." />
    );
  }


  if (saved) {
    return (
      <View style={styles.savedContainer}>
        <View style={styles.savedIcon}>
          <Feather name="check-circle" size={58} color={Colors.success} />
        </View>
        <Text style={styles.savedTitle}>Hazard Saved</Text>
        {hazardTitle ? (
          <Text style={styles.savedRef}>{hazardTitle}</Text>
        ) : null}
        <View style={styles.savedActions}>
          <Pressable style={[styles.button, styles.buttonSecondary]} onPress={resetForm}>
            <Feather name="plus" size={19} color="#fff" />
            <Text style={styles.buttonText}>Add Another</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => router.back()}>
            <Feather name="arrow-left" size={19} color="#fff" />
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {isProjectRiskEval && (
          <View style={styles.projectBanner}>
            <Feather name="briefcase" size={16} color={Colors.primary} />
            <Text style={styles.projectBannerText}>Project Risk Evaluation</Text>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.focusBanner} onPress={() => setFocusModeOpen(true)}>
          <Feather name="zap" size={15} color={Colors.primary} />
          <Text style={styles.focusBannerText}>Use Focus Mode</Text>
          <Feather name="chevron-right" size={15} color={Colors.primary} />
        </Pressable>

        <Text style={styles.label}>Hazard Title *</Text>
        <TextInput
          style={styles.input}
          value={hazardTitle}
          onChangeText={text => { titleSuggestionLocked.current = false; setHazardTitle(text); }}
          placeholder="e.g. 4.1 — Missing interlocked guard"
          placeholderTextColor={Colors.textLight}
        />

        {libraryTitleSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <View style={styles.suggestionsHeader}>
              <Feather name="bookmark" size={12} color="#B45309" />
              <Text style={[styles.suggestionsLabel, styles.libraryLabel]}>Library — tap to fill</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
              {libraryTitleSuggestions.map(ev => (
                <Pressable key={ev.id} style={styles.suggestionCardLibrary} onPress={() => applyTitleSuggestion(ev)}>
                  <Text style={styles.libraryBadge}>Authoritative</Text>
                  <Text style={styles.suggestionRef}>{ev.nonComplianceReference}</Text>
                  <Text style={styles.suggestionDesc} numberOfLines={2}>{getWhatMightGoWrongValue(ev)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {titleSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <View style={styles.suggestionsHeader}>
              <Feather name="clock" size={12} color={Colors.textMuted} />
              <Text style={styles.suggestionsLabel}>Similar titles — tap to fill</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
              {titleSuggestions.map(ev => (
                <Pressable key={ev.id} style={styles.suggestionCard} onPress={() => applyTitleSuggestion(ev)}>
                  <Text style={styles.suggestionRef}>{ev.nonComplianceReference}</Text>
                  <Text style={styles.suggestionDesc} numberOfLines={2}>{getWhatMightGoWrongValue(ev)}</Text>
                  {ev.assemblyId && assemblyNameMap.get(ev.assemblyId) ? (
                    <Text style={styles.suggestionSource} numberOfLines={1}>{assemblyNameMap.get(ev.assemblyId)}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

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
          onAnnotationRequest={(uri) => setPendingAnnotation({ source: 'form', uri })}
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
          onChangeText={text => { textSuggestionLocked.current = false; setWhatMightGoWrong(text); }}
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

        {librarySuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <View style={styles.suggestionsHeader}>
              <Feather name="bookmark" size={12} color="#B45309" />
              <Text style={[styles.suggestionsLabel, styles.libraryLabel]}>Library — tap to apply</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
              {librarySuggestions.map(ev => (
                <Pressable key={ev.id} style={styles.suggestionCardLibrary} onPress={() => applySuggestion(ev)}>
                  <Text style={styles.libraryBadge}>Authoritative</Text>
                  <Text style={styles.suggestionDesc} numberOfLines={2}>{getWhatMightGoWrongValue(ev)}</Text>
                  <View style={styles.suggestionMeta}>
                    <View style={[styles.suggestionCat, styles.suggestionCatLibrary]}>
                      <Text style={[styles.suggestionCatText, styles.suggestionCatTextLibrary]}>
                        {parseHazardCategories(ev.hazardCategory).join(', ')}
                      </Text>
                    </View>
                    <Text style={styles.suggestionRisk}>
                      {ev.preControlRating || '–'}{' '}
                      <Feather name="arrow-right" size={11} color={Colors.textMuted} />{' '}
                      <Text style={{ color: RATING_COLOURS[ev.postControlRating as RiskLevel] ?? Colors.textMuted }}>
                        {ev.postControlRating || '–'}
                      </Text>
                    </Text>
                  </View>
                  {getMovementSummary(ev) ? (
                    <Text style={styles.suggestionSource} numberOfLines={1}>{getMovementSummary(ev)}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <View style={styles.suggestionsHeader}>
              <Feather name="clock" size={12} color={Colors.textMuted} />
              <Text style={styles.suggestionsLabel}>This project — tap to apply</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
              {suggestions.map(ev => (
                <Pressable key={ev.id} style={styles.suggestionCard} onPress={() => applySuggestion(ev)}>
                  <Text style={styles.suggestionDesc} numberOfLines={2}>{getWhatMightGoWrongValue(ev)}</Text>
                  <View style={styles.suggestionMeta}>
                    <View style={styles.suggestionCat}>
                      <Text style={styles.suggestionCatText}>{parseHazardCategories(ev.hazardCategory).join(', ')}</Text>
                    </View>
                    <Text style={styles.suggestionRisk}>
                      {ev.preControlRating || '–'}{' '}
                      <Feather name="arrow-right" size={11} color={Colors.textMuted} />{' '}
                      <Text style={{ color: RATING_COLOURS[ev.postControlRating as RiskLevel] ?? Colors.textMuted }}>
                        {ev.postControlRating || '–'}
                      </Text>
                    </Text>
                  </View>
                  {getMovementSummary(ev) ? (
                    <Text style={styles.suggestionSource} numberOfLines={1}>{getMovementSummary(ev)}</Text>
                  ) : ev.assemblyId && assemblyNameMap.get(ev.assemblyId) ? (
                    <Text style={styles.suggestionSource} numberOfLines={1}>{assemblyNameMap.get(ev.assemblyId)}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

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
          <Text style={styles.buttonText}>Save Hazard</Text>
        </Pressable>
      </ScrollView>

      <Iso13857Calculator visible={iso13857Open} onClose={() => setIso13857Open(false)} />

      <FocusWizardModal
        ref={wizardRef}
        visible={focusModeOpen}
        steps={riskFocusSteps}
        initialData={{
          nonComplianceReference: question_number ?? '',
          machineId: machine_id ?? null,
        }}
        onSave={handleFocusSave}
        onClose={() => setFocusModeOpen(false)}
        getSuccessDetail={(d) => d.nonComplianceReference || ''}
        onPhotoRequest={handleWizardPhotoRequest}
      />
      <PhotoAnnotationModal
        visible={!!pendingAnnotation}
        uri={pendingAnnotation?.uri ?? null}
        onDone={handleAnnotationDone}
        onCancel={handleAnnotationCancel}
      />

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
              placeholder="Search by name, type…"
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
    </>
  );
}

function RiskSelector({ label, value, onChange }: { label: string; value: RiskLevel | null; onChange: (v: RiskLevel | null) => void }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={styles.subLabelRow}>
        <Text style={[styles.subLabel, { marginBottom: 0 }]}>{label}</Text>
        <RiskDefinitionsButton topic={label === 'Probability' ? 'probability' : 'severity'} />
      </View>
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
  subLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
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
    flexDirection: 'row', gap: 10,
  },
  buttonSecondary: { backgroundColor: Colors.orange },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
  projectBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary + '12', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: Colors.primary, marginBottom: 10,
  },
  projectBannerText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  focusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  focusBannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  savedContainer: {
    flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 38,
  },
  savedIcon: { marginBottom: 19 },
  savedTitle: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  savedRef: { fontSize: 17, color: Colors.textMuted, marginBottom: 38, textAlign: 'center' },
  savedActions: { width: '100%', gap: 14 },
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

  suggestionsContainer: { marginTop: 10, marginBottom: 4 },
  suggestionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  suggestionsLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  libraryLabel: { color: '#92400E' },
  suggestionsScroll: { gap: 10, paddingRight: 4 },
  suggestionCard: {
    width: 220, backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, padding: 12,
  },
  suggestionCardLibrary: {
    width: 220, backgroundColor: '#FEFCE8', borderRadius: 10,
    borderWidth: 1, borderColor: '#F59E0B', padding: 12,
  },
  libraryBadge: {
    fontSize: 10, fontWeight: '700', color: '#92400E',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5,
  },
  suggestionRef: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  suggestionDesc: { fontSize: 14, color: Colors.text, lineHeight: 19, marginBottom: 8 },
  suggestionSource: {
    fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', marginTop: 4,
  },
  suggestionMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  suggestionCat: { backgroundColor: Colors.primary + '15', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  suggestionCatText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  suggestionCatLibrary: { backgroundColor: '#F59E0B20' },
  suggestionCatTextLibrary: { color: '#92400E' },
  suggestionRisk: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
});
