import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { AssembliesApi } from '@/services/api';
import { Colors } from '@/constants/Colors';
import PhotoPicker from '@/components/PhotoPicker';

type AssetType = 'standalone' | 'assembly';

export default function EditAssetScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getAccessToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
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

  useEffect(() => {
    (async () => {
      const t = await getAccessToken();
      if (!t) return;
      setToken(t);
      const data = await AssembliesApi.get(t, Number(id));
      setAssetName(data.assembly_name ?? '');
      setDescription(data.description ?? '');
      setIsInUse(data.is_in_use ?? true);
      setAssetType(data.asset_type ?? 'standalone');
      setManufacturer(data.manufacturer ?? '');
      setModel(data.model ?? '');
      setSerialNumber(data.serial_number ?? '');
      setPictureUrl(data.picture_url ?? null);
      setNameplateUrl(data.nameplate_photo_url ?? null);
      setLoading(false);
    })();
  }, [id]);

  async function handleSave() {
    if (!assetName.trim()) { setError('Asset name is required.'); return; }
    setSaving(true);
    try {
      const t = token ?? await getAccessToken();
      if (!t) return;
      await AssembliesApi.update(t, Number(id), {
        assembly_name: assetName.trim(),
        description: description.trim() || undefined,
        is_in_use: isInUse,
        asset_type: assetType,
        manufacturer: assetType === 'standalone' ? (manufacturer.trim() || undefined) : undefined,
        model: assetType === 'standalone' ? (model.trim() || undefined) : undefined,
        serial_number: assetType === 'standalone' ? (serialNumber.trim() || undefined) : undefined,
        picture_url: pictureUrl || undefined,
        nameplate_photo_url: assetType === 'standalone' ? (nameplateUrl || undefined) : undefined,
      });
      router.back();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;

  return (
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
            <Feather name="cpu" size={22} color={assetType === 'standalone' ? '#fff' : Colors.textMuted} />
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
            <Feather name="grid" size={22} color={assetType === 'assembly' ? '#fff' : Colors.textMuted} />
          </View>
          <Text style={[styles.typeLabel, assetType === 'assembly' && styles.typeLabelActive]}>
            Assembly of{'\n'}Machines
          </Text>
        </Pressable>
      </View>

      {assetType === 'standalone' && (
        <View style={styles.section}>
          <View style={styles.sectionHeadRow}>
            <Feather name="tag" size={13} color={Colors.primary} />
            <Text style={styles.sectionHead}>Nameplate Details</Text>
          </View>
          <Text style={styles.label}>Manufacturer</Text>
          <TextInput
            style={styles.input}
            value={manufacturer}
            onChangeText={setManufacturer}
            placeholder="e.g. Mazak"
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.label}>Model</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            placeholder="e.g. QT-200"
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.label}>Serial Number</Text>
          <TextInput
            style={styles.input}
            value={serialNumber}
            onChangeText={setSerialNumber}
            placeholder="Optional"
            placeholderTextColor={Colors.textLight}
          />
        </View>
      )}

      <Text style={styles.label}>Photos</Text>
      {token ? (
        <View style={styles.photoRow}>
          <PhotoPicker
            label="Asset Photo"
            currentUrl={pictureUrl}
            token={token}
            onUploaded={setPictureUrl}
          />
          {assetType === 'standalone' && (
            <PhotoPicker
              label="Nameplate"
              currentUrl={nameplateUrl}
              token={token}
              onUploaded={setNameplateUrl}
            />
          )}
        </View>
      ) : null}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: 20 },
  input: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 8, padding: 12, fontSize: 15, color: Colors.text,
  },
  multiline: { height: 88, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    borderRadius: 12, padding: 16, marginTop: 20, borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  switchInfo: { flex: 1 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  switchSub: { fontSize: 12, color: Colors.textMuted },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 16,
    alignItems: 'center', gap: 8, borderWidth: 2, borderColor: Colors.border,
  },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  typeIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  typeIconWrapActive: { backgroundColor: Colors.primary },
  typeLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  typeLabelActive: { color: Colors.primary },
  section: {
    marginTop: 8, backgroundColor: Colors.card, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sectionHead: { fontSize: 12, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  photoRow: { flexDirection: 'row', gap: 12 },
  button: {
    backgroundColor: Colors.primary, borderRadius: 8, height: 48,
    alignItems: 'center', justifyContent: 'center', marginTop: 32,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: Colors.danger, marginBottom: 8, fontSize: 14 },
});
