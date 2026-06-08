import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import PhotoAnnotationModal from '@/components/PhotoAnnotationModal';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { enqueuePhoto } from '@/services/photoQueue';
import { useDemoMode } from '@/context/DemoModeContext';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import { isDemoSite } from '@/utils/demoMode';
import Machine from '@/db/models/Machine.model';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';
import { useMachineSuggestions, filterSuggestions, normalizeEntry } from '@/hooks/useMachineSuggestions';

export default function EditMachineScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const { isDemoMode } = useDemoMode();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [blockedByDemoMode, setBlockedByDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

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
  const [pendingAnnotation, setPendingAnnotation] = useState<{ uri: string; field: 'pictureUrl' | 'nameplateUrl' } | null>(null);

  const { categorySuggestions, useSuggestions } = useMachineSuggestions(db, machineCategory, id);

  const visibleCategorySuggestions = useMemo(
    () => filterSuggestions(machineCategory, categorySuggestions),
    [machineCategory, categorySuggestions],
  );
  const visibleUseSuggestions = useMemo(
    () => filterSuggestions(machineUse, useSuggestions),
    [machineUse, useSuggestions],
  );

  useEffect(() => {
    (async () => {
      const rec = await db.get<Machine>('machines').find(id);
      if (isDemoMode) {
        const assembly = await db.get<Assembly>('assemblies').find(rec.assemblyId).catch(() => null);
        const site = assembly ? await db.get<Site>('sites').find(assembly.siteId).catch(() => null) : null;
        if (!isDemoSite(site)) {
          setBlockedByDemoMode(true);
          setLoading(false);
          return;
        }
      }
      setMachine(rec);
      setNameRef(rec.machineNameReference ?? '');
      setMachineCategory(rec.machineCategory ?? '');
      setMachineUse(rec.machineUse ?? '');
      setManufacturer(rec.manufacturer ?? '');
      setModel(rec.model ?? '');
      setSerialNumber(rec.serialNumber ?? '');
      setDescription(rec.description ?? '');
      setPictureUrl(rec.pictureUrl ?? null);
      setNameplateUrl(rec.nameplatePhotoUrl ?? null);
      setLoading(false);
    })();
  }, [db, id, isDemoMode]);

  async function handleSave() {
    if (!nameRef.trim() || !machine) { setError('Machine name/reference is required.'); return; }
    setSaving(true);
    try {
      await db.write(async () => {
        await machine.update(m => {
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
      // Enqueue any locally-saved photos for upload on next sync
      if (pictureUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: pictureUrl, collection: 'machines', recordId: machine.id, field: 'picture_url' });
      }
      if (nameplateUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: nameplateUrl, collection: 'machines', recordId: machine.id, field: 'nameplate_photo_url' });
      }
      router.back();
    } catch (e: any) { setError(e.message); setSaving(false); }
  }

  function handleAnnotationDone(uri: string) {
    const pending = pendingAnnotation;
    if (!pending) return;
    const field = pending.field;
    setPendingAnnotation(null);
    if (field === 'pictureUrl') setPictureUrl(uri);
    else setNameplateUrl(uri);
  }

  function handleAnnotationCancel() {
    setPendingAnnotation(null);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  if (blockedByDemoMode) return <DemoModeBlocked />;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}

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
          onAnnotationRequest={(uri) => setPendingAnnotation({ uri, field: 'pictureUrl' })} />
        <PhotoPicker label="Nameplate" currentUrl={nameplateUrl} onUploaded={setNameplateUrl}
          onAnnotationRequest={(uri) => setPendingAnnotation({ uri, field: 'nameplateUrl' })} />
      </View>

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
      </Pressable>
    </ScrollView>
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
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
});
