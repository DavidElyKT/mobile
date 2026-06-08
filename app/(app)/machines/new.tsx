import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useDemoMode } from '@/context/DemoModeContext';
import { enqueuePhoto } from '@/services/photoQueue';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import { isDemoSite } from '@/utils/demoMode';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';
import { useMachineSuggestions, filterSuggestions, normalizeEntry } from '@/hooks/useMachineSuggestions';
import FocusWizardModal, { type FocusWizardModalRef, type WizardStep, type WizardSuggestion } from '@/components/FocusWizardModal';
import PhotoAnnotationModal from '@/components/PhotoAnnotationModal';

export default function NewMachineScreen() {
  const router = useRouter();
  const { assembly_id } = useLocalSearchParams<{ assembly_id: string }>();
  const db = useDatabase();
  const { isDemoMode } = useDemoMode();
  const [blockedByDemoMode, setBlockedByDemoMode] = useState(false);
  const [nameRef, setNameRef] = useState('');
  const [machineCategory, setMachineCategory] = useState('');
  const [machineUse, setMachineUse] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [description, setDescription] = useState('');
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [nameplateUrl, setNameplateUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  const wizardRef = useRef<FocusWizardModalRef>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<
    | { source: 'wizard'; uri: string; key: string }
    | { source: 'form'; uri: string; field: 'pictureUrl' | 'nameplateUrl' }
    | null
  >(null);
  const { categorySuggestions, useSuggestions } = useMachineSuggestions(db, machineCategory);

  const visibleCategorySuggestions = useMemo(
    () => filterSuggestions(machineCategory, categorySuggestions),
    [machineCategory, categorySuggestions],
  );
  const visibleUseSuggestions = useMemo(
    () => filterSuggestions(machineUse, useSuggestions),
    [machineUse, useSuggestions],
  );

  const machineFocusSteps = useMemo<WizardStep[]>(() => [
    {
      key: 'machineNameReference',
      type: 'text',
      question: 'What is this machine called?',
      placeholder: 'e.g. CNC Lathe 1',
      required: true,
    },
    {
      key: 'machineCategory',
      type: 'text',
      question: 'What category of machine is this?',
      placeholder: 'e.g. Conveyor, Press, Lathe',
      getSuggestions: (value): WizardSuggestion[] =>
        filterSuggestions(value, categorySuggestions).map(s => ({ label: s })),
    },
    {
      key: 'machineUse',
      type: 'text',
      question: 'What does this machine do?',
      placeholder: 'e.g. Cutting sheet, pallet handling',
      getSuggestions: (value): WizardSuggestion[] =>
        filterSuggestions(value, useSuggestions).map(s => ({ label: s })),
    },
    {
      key: 'manufacturer',
      type: 'text',
      question: 'Who is the manufacturer?',
      placeholder: 'e.g. Mazak',
      skippable: true,
    },
    {
      key: 'model',
      type: 'text',
      question: 'What is the model?',
      placeholder: 'e.g. QT-200',
      skippable: true,
    },
    {
      key: 'serialNumber',
      type: 'text',
      question: 'Serial number?',
      placeholder: 'Optional',
      skippable: true,
    },
    {
      key: 'pictureUrl',
      type: 'photo',
      question: 'Take a photo of the machine',
      photoLabel: 'Machine Photo',
      skippable: true,
    },
    {
      key: 'nameplateUrl',
      type: 'photo',
      question: 'Take a photo of the nameplate',
      subtext: 'Captures manufacturer, model, and serial number for the record.',
      photoLabel: 'Nameplate Photo',
      skippable: true,
    },
  ], [categorySuggestions, useSuggestions]);

  async function handleWizardPhotoRequest(type: 'camera' | 'library', key: string) {
    wizardRef.current?.skipNextReset();
    setFocusModeOpen(false);
    await new Promise(resolve => setTimeout(resolve, 400));
    try {
      let result: ImagePicker.ImagePickerResult;
      if (type === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Camera access is needed to take a photo.');
          setFocusModeOpen(true);
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.85 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission required', 'Photo library access is needed.');
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

  function handleAnnotationDone(annotatedUri: string) {
    const pending = pendingAnnotation;
    if (!pending) return;
    setPendingAnnotation(null);
    if (pending.source === 'wizard') {
      setFocusModeOpen(true);
      setTimeout(() => wizardRef.current?.injectPhoto(pending.key, annotatedUri), 150);
    } else {
      if (pending.field === 'pictureUrl') setPictureUrl(annotatedUri);
      else setNameplateUrl(annotatedUri);
    }
  }

  function handleAnnotationCancel() {
    const pending = pendingAnnotation;
    setPendingAnnotation(null);
    if (pending?.source === 'wizard') setFocusModeOpen(true);
  }

  async function handleFocusSave(wizardData: Record<string, any>): Promise<void> {
    const newMachine = await db.write(async () => {
      return await db.get<Machine>('machines').create(m => {
        m.assemblyId = assembly_id;
        m.machineNameReference = (wizardData.machineNameReference || '').trim();
        m.machineCategory = normalizeEntry(wizardData.machineCategory || '') || null;
        m.machineUse = normalizeEntry(wizardData.machineUse || '') || null;
        m.manufacturer = (wizardData.manufacturer || '').trim();
        m.model = (wizardData.model || '').trim();
        m.serialNumber = (wizardData.serialNumber || '').trim();
        m.pictureUrl = wizardData.pictureUrl || null;
        m.nameplatePhotoUrl = wizardData.nameplateUrl || null;
        m.isSynced = false;
      });
    });
    if (wizardData.pictureUrl?.startsWith('file://')) {
      await enqueuePhoto({ localUri: wizardData.pictureUrl, collection: 'machines', recordId: newMachine.id, field: 'picture_url' });
    }
    if (wizardData.nameplateUrl?.startsWith('file://')) {
      await enqueuePhoto({ localUri: wizardData.nameplateUrl, collection: 'machines', recordId: newMachine.id, field: 'nameplate_photo_url' });
    }
    // Wizard owns success state — no setSaved/setFocusModeOpen here.
  }

  useEffect(() => {
    if (isDemoMode && assembly_id) {
      db.get<Assembly>('assemblies').find(assembly_id)
        .then(assembly => db.get<Site>('sites').find(assembly.siteId))
        .then(site => setBlockedByDemoMode(!isDemoSite(site)))
        .catch(() => setBlockedByDemoMode(true));
    } else {
      setBlockedByDemoMode(false);
    }
  }, [assembly_id, db, isDemoMode]);

  async function handleSave() {
    if (!nameRef.trim()) { setError('Machine name/reference is required.'); return; }
    setSaving(true);
    try {
      // Write locally immediately
      const newMachine = await db.write(async () => {
        return await db.get<Machine>('machines').create(m => {
          m.assemblyId = assembly_id;
          m.machineNameReference = nameRef.trim();
          m.machineCategory = normalizeEntry(machineCategory) || null;
          m.machineUse = normalizeEntry(machineUse) || null;
          m.manufacturer = manufacturer.trim();
          m.model = model.trim();
          m.serialNumber = serialNumber.trim();
          m.description = description.trim();
          m.pictureUrl = pictureUrl;
          m.nameplatePhotoUrl = nameplateUrl;
          m.isSynced = false;
        });
      });

      // Enqueue any locally-stored photos for upload on next sync
      if (pictureUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: pictureUrl, collection: 'machines', recordId: newMachine.id, field: 'picture_url' });
      }
      if (nameplateUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: nameplateUrl, collection: 'machines', recordId: newMachine.id, field: 'nameplate_photo_url' });
      }

      setSavedName(nameRef.trim());
      setSaved(true);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  function resetForm() {
    setNameRef('');
    setMachineCategory('');
    setMachineUse('');
    setManufacturer('');
    setModel('');
    setSerialNumber('');
    setDescription('');
    setPictureUrl(null);
    setNameplateUrl(null);
    setError(null);
    setSaving(false);
    setSaved(false);
    setSavedName('');
  }

  if (blockedByDemoMode) return <DemoModeBlocked />;

  if (saved) {
    return (
      <View style={styles.savedContainer}>
        <View style={styles.savedIcon}>
          <Feather name="check-circle" size={58} color={Colors.success} />
        </View>
        <Text style={styles.savedTitle}>Sub-machine Saved</Text>
        <Text style={styles.savedName}>{savedName}</Text>
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.focusBanner} onPress={() => setFocusModeOpen(true)}>
        <Feather name="zap" size={15} color={Colors.primary} />
        <Text style={styles.focusBannerText}>Use Focus Mode</Text>
        <Feather name="chevron-right" size={15} color={Colors.primary} />
      </Pressable>

      <Text style={styles.label}>Name / Reference *</Text>
      <TextInput style={styles.input} value={nameRef} onChangeText={setNameRef}
        placeholder="e.g. CNC Lathe 1" placeholderTextColor={Colors.textLight} />

      <Text style={styles.label}>Machine Category</Text>
      <TextInput
        style={styles.input}
        value={machineCategory}
        onChangeText={setMachineCategory}
        placeholder="e.g. Conveyor, Press, Lathe"
        placeholderTextColor={Colors.textLight}
      />
      {visibleCategorySuggestions.length > 0 ? (
        <View style={styles.suggestionWrap}>
          <Text style={styles.suggestionLabel}>Suggested</Text>
          <View style={styles.suggestionRow}>
            {visibleCategorySuggestions.map(value => (
              <Pressable key={value} style={styles.suggestionChip} onPress={() => setMachineCategory(value)}>
                <Text style={styles.suggestionChipText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>Machine Use</Text>
      <TextInput
        style={styles.input}
        value={machineUse}
        onChangeText={setMachineUse}
        placeholder="e.g. Cutting sheet, material feed, pallet handling"
        placeholderTextColor={Colors.textLight}
      />
      {visibleUseSuggestions.length > 0 ? (
        <View style={styles.suggestionWrap}>
          <Text style={styles.suggestionLabel}>Suggested</Text>
          <View style={styles.suggestionRow}>
            {visibleUseSuggestions.map(value => (
              <Pressable key={value} style={styles.suggestionChip} onPress={() => setMachineUse(value)}>
                <Text style={styles.suggestionChipText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>Manufacturer</Text>
      <TextInput style={styles.input} value={manufacturer} onChangeText={setManufacturer}
        placeholder="e.g. Mazak" placeholderTextColor={Colors.textLight} />

      <Text style={styles.label}>Model</Text>
      <TextInput style={styles.input} value={model} onChangeText={setModel}
        placeholder="e.g. QT-200" placeholderTextColor={Colors.textLight} />

      <Text style={styles.label}>Serial Number</Text>
      <TextInput style={styles.input} value={serialNumber} onChangeText={setSerialNumber}
        placeholder="Optional" placeholderTextColor={Colors.textLight} />

      <Text style={styles.label}>Description</Text>
      <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription}
        placeholder="Optional description" placeholderTextColor={Colors.textLight} multiline numberOfLines={3} />

      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoRow}>
        <PhotoPicker label="Machine Photo" currentUrl={pictureUrl} onUploaded={setPictureUrl}
          onAnnotationRequest={(uri) => setPendingAnnotation({ source: 'form', uri, field: 'pictureUrl' })} />
        <PhotoPicker label="Nameplate" currentUrl={nameplateUrl} onUploaded={setNameplateUrl}
          onAnnotationRequest={(uri) => setPendingAnnotation({ source: 'form', uri, field: 'nameplateUrl' })} />
      </View>

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Sub-machine</Text>}
      </Pressable>
    </ScrollView>

    <FocusWizardModal
      ref={wizardRef}
      visible={focusModeOpen}
      steps={machineFocusSteps}
      onSave={handleFocusSave}
      onClose={() => setFocusModeOpen(false)}
      getSuccessDetail={(d) => d.machineNameReference || ''}
      onPhotoRequest={handleWizardPhotoRequest}
    />
    <PhotoAnnotationModal
      visible={!!pendingAnnotation}
      uri={pendingAnnotation?.uri ?? null}
      onDone={handleAnnotationDone}
      onCancel={handleAnnotationCancel}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 19, paddingBottom: 48 },
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
  label: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 7, marginTop: 24 },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 14, fontSize: 18, color: Colors.text,
  },
  multiline: { height: 106, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', gap: 14 },
  suggestionWrap: { marginTop: 10 },
  suggestionLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginBottom: 8 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  suggestionChip: {
    backgroundColor: Colors.primary + '15',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  suggestionChipText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  button: {
    backgroundColor: Colors.primary, borderRadius: 10, height: 58,
    alignItems: 'center', justifyContent: 'center', marginTop: 38,
    flexDirection: 'row', gap: 10,
  },
  buttonSecondary: { backgroundColor: Colors.orange },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
  savedContainer: {
    flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 38,
  },
  savedIcon: { marginBottom: 19 },
  savedTitle: { fontSize: 26, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  savedName: { fontSize: 17, color: Colors.textMuted, marginBottom: 38, textAlign: 'center' },
  savedActions: { width: '100%', gap: 14 },
});
