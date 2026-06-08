import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Switch,
} from 'react-native';
import PhotoAnnotationModal from '@/components/PhotoAnnotationModal';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { enqueuePhoto } from '@/services/photoQueue';
import { useDemoMode } from '@/context/DemoModeContext';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import { isDemoSite } from '@/utils/demoMode';
import Assembly from '@/db/models/Assembly.model';
import Site from '@/db/models/Site.model';

type AssetType = 'standalone' | 'assembly';

export default function EditAssetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const { isDemoMode } = useDemoMode();

  const [assembly, setAssembly] = useState<Assembly | null>(null);
  const [blockedByDemoMode, setBlockedByDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const [assetName, setAssetName] = useState('');
  const [description, setDescription] = useState('');
  const [isInUse, setIsInUse] = useState(true);
  const [assetType, setAssetType] = useState<AssetType>('standalone');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [nameplateUrl, setNameplateUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<{ uri: string; field: 'pictureUrl' | 'nameplateUrl' } | null>(null);

  useEffect(() => {
    (async () => {
      const rec = await db.get<Assembly>('assemblies').find(id);
      if (isDemoMode) {
        const site = await db.get<Site>('sites').find(rec.siteId).catch(() => null);
        if (!isDemoSite(site)) {
          setBlockedByDemoMode(true);
          setLoading(false);
          return;
        }
      }
      setAssembly(rec);
      setAssetName(rec.assemblyName ?? '');
      setDescription(rec.description ?? '');
      setIsInUse(rec.isInUse ?? true);
      setAssetType((rec.assetType as AssetType) ?? 'standalone');
      setManufacturer(rec.manufacturer ?? '');
      setModel(rec.model ?? '');
      setSerialNumber(rec.serialNumber ?? '');
      setPictureUrl(rec.pictureUrl ?? null);
      setNameplateUrl(rec.nameplatePhotoUrl ?? null);
      setLoading(false);
    })();
  }, [id, isDemoMode]);

  async function handleSave() {
    if (!assetName.trim() || !assembly) { setError('Asset name is required.'); return; }
    setSaving(true);
    try {
      await db.write(async () => {
        await assembly.update(a => {
          a.assemblyName = assetName.trim();
          a.description = description.trim();
          a.isInUse = isInUse;
          a.assetType = assetType;
          a.manufacturer = assetType === 'standalone' ? manufacturer.trim() : '';
          a.model = assetType === 'standalone' ? model.trim() : '';
          a.serialNumber = assetType === 'standalone' ? serialNumber.trim() : '';
          a.pictureUrl = pictureUrl;
          a.nameplatePhotoUrl = assetType === 'standalone' ? nameplateUrl : null;
          a.isSynced = false;
        });
      });
      // Enqueue any locally-saved photos for upload on next sync
      if (pictureUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: pictureUrl, collection: 'assemblies', recordId: assembly.id, field: 'picture_url' });
      }
      if (nameplateUrl?.startsWith('file://')) {
        await enqueuePhoto({ localUri: nameplateUrl, collection: 'assemblies', recordId: assembly.id, field: 'nameplate_photo_url' });
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

      <Text style={styles.label}>Asset Name *</Text>
      <TextInput
        style={styles.input}
        value={assetName}
        onChangeText={setAssetName}
        placeholder="e.g. Production Line 1"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional description"
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={3}
      />

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Asset currently in use</Text>
          <Text style={styles.switchSub}>Is this asset actively being operated?</Text>
        </View>
        <Switch
          value={isInUse}
          onValueChange={setIsInUse}
          trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
          thumbColor={isInUse ? Colors.primary : Colors.textLight}
        />
      </View>

      <Text style={styles.label}>Asset Type *</Text>
      <View style={styles.typeRow}>
        <Pressable
          style={[styles.typeCard, assetType === 'standalone' && styles.typeCardActive]}
          onPress={() => setAssetType('standalone')}
        >
          <View style={[styles.typeIconWrap, assetType === 'standalone' && styles.typeIconWrapActive]}>
            <Feather name="cpu" size={26} color={assetType === 'standalone' ? '#fff' : Colors.textMuted} />
          </View>
          <Text style={[styles.typeLabel, assetType === 'standalone' && styles.typeLabelActive]}>
            Standalone{'\n'}Machine
          </Text>
        </Pressable>
        <Pressable
          style={[styles.typeCard, assetType === 'assembly' && styles.typeCardActive]}
          onPress={() => setAssetType('assembly')}
        >
          <View style={[styles.typeIconWrap, assetType === 'assembly' && styles.typeIconWrapActive]}>
            <Feather name="grid" size={26} color={assetType === 'assembly' ? '#fff' : Colors.textMuted} />
          </View>
          <Text style={[styles.typeLabel, assetType === 'assembly' && styles.typeLabelActive]}>
            Assembly of{'\n'}Machines
          </Text>
        </Pressable>
      </View>

      {assetType === 'standalone' && (
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Feather name="tag" size={16} color={Colors.primary} />
            <Text style={styles.sectionHead}>Nameplate Details</Text>
          </View>
          <Text style={styles.label}>Manufacturer</Text>
          <TextInput style={styles.input} value={manufacturer} onChangeText={setManufacturer}
            placeholder="e.g. Mazak" placeholderTextColor={Colors.textLight} />
          <Text style={styles.label}>Model</Text>
          <TextInput style={styles.input} value={model} onChangeText={setModel}
            placeholder="e.g. QT-200" placeholderTextColor={Colors.textLight} />
          <Text style={styles.label}>Serial Number</Text>
          <TextInput style={styles.input} value={serialNumber} onChangeText={setSerialNumber}
            placeholder="Optional" placeholderTextColor={Colors.textLight} />
        </View>
      )}

      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoRow}>
        <PhotoPicker
          label="Asset Photo"
          currentUrl={pictureUrl}
          onUploaded={setPictureUrl}
          onAnnotationRequest={(uri) => setPendingAnnotation({ uri, field: 'pictureUrl' })}
        />
        {assetType === 'standalone' && (
          <PhotoPicker
            label="Nameplate"
            currentUrl={nameplateUrl}
            onUploaded={setNameplateUrl}
            onAnnotationRequest={(uri) => setPendingAnnotation({ uri, field: 'nameplateUrl' })}
          />
        )}
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
  switchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: 14, padding: 19, marginTop: 24, borderWidth: 1, borderColor: Colors.border, gap: 14,
  },
  switchInfo: { flex: 1 },
  switchLabel: { fontSize: 17, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  switchSub: { fontSize: 14, color: Colors.textMuted },
  typeRow: { flexDirection: 'row', gap: 14 },
  typeCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 19,
    alignItems: 'center', gap: 10, borderWidth: 2, borderColor: Colors.border,
  },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  typeIconWrap: {
    width: 53, height: 53, borderRadius: 26, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIconWrapActive: { backgroundColor: Colors.primary },
  typeLabel: { fontSize: 16, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  typeLabelActive: { color: Colors.primary },
  section: {
    marginTop: 10, backgroundColor: Colors.card, borderRadius: 14,
    padding: 19, borderWidth: 1, borderColor: Colors.border,
  },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  sectionHead: { fontSize: 14, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  photoRow: { flexDirection: 'row', gap: 14 },
  button: {
    backgroundColor: Colors.primary, borderRadius: 10, height: 58,
    alignItems: 'center', justifyContent: 'center', marginTop: 38,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
});
