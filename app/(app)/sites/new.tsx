import {
  View, Text, TextInput, StyleSheet, Pressable, ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { getCachedUserId } from '@/services/sync';
import { Colors } from '@/constants/Colors';
import DemoModeBlocked from '@/components/DemoModeBlocked';
import SpinePickerField, { type SpineOption } from '@/components/SpinePickerField';
import Site from '@/db/models/Site.model';
import Assembly from '@/db/models/Assembly.model';
import Assessment from '@/db/models/Assessment.model';
import Customer from '@/db/models/Customer.model';
import CustomerSite from '@/db/models/CustomerSite.model';
import SiteArea from '@/db/models/SiteArea.model';

/**
 * Job setup — the screen Phase 3 of the customer-centric restructure exists for.
 *
 * WHAT CHANGED, AND WHY IT MATTERS MORE THAN IT LOOKS. The customer used to be a
 * free-text box, and it is the reason 17 customers were recorded under 39
 * spellings — "SST Siemens", "SST (Rolls Royce)" and "Safety Systems
 * Technology" are one company. It is now a pick from the register.
 *
 * And a repeat round no longer copies the asset list. Ticking an asset records
 * an EPISODE against the asset that is already there, so "Press 3" assessed in
 * 2026 and again in 2030 is one machine with two visits instead of two
 * unrelated records. That is the whole thesis of the plan, and this list is
 * where it happens.
 *
 * IT MUST WORK WITH NO SIGNAL. Every list here is a local WatermelonDB query:
 * the register is already on the device because sync_pull is unscoped, so an
 * assessor in a basement sees the same options as one in the office. Nothing on
 * this screen calls the API.
 *
 * NOTHING IS INVENTED. A customer or a place that is not in the register is
 * left unpicked — the job keeps the typed name and a human resolves it from the
 * desktop queue. A phone that could create a customer would grow the spelling
 * problem back the day it shipped.
 */
export default function NewSiteScreen() {
  const router = useRouter();
  const db = useDatabase();
  const { user } = useAuth();
  const { isDemoMode } = useDemoMode();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSiteId, setCustomerSiteId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [customer, setCustomer] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [scopedAssetIds, setScopedAssetIds] = useState<string[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customers = useQuery<Customer>(db.get<Customer>('customers').query());
  const places = useQuery<CustomerSite>(
    db.get<CustomerSite>('customer_sites').query(
      ...(customerId ? [Q.where('customer_id', customerId)] : [Q.where('id', '')]),
    ),
    [customerId],
  );
  const areas = useQuery<SiteArea>(
    db.get<SiteArea>('site_areas').query(
      ...(customerSiteId ? [Q.where('customer_site_id', customerSiteId)] : [Q.where('id', '')]),
    ),
    [customerSiteId],
  );
  // The assets already recorded at the chosen place. This is the register a
  // repeat round ticks against, and it exists only because Phase 1 gave every
  // asset a place that outlives the job it was created in.
  const placeAssets = useQuery<Assembly>(
    db.get<Assembly>('assemblies').query(
      ...(customerSiteId ? [Q.where('customer_site_id', customerSiteId)] : [Q.where('id', '')]),
    ),
    [customerSiteId],
  );

  const customerName = useMemo(
    () => customers.find(c => c.id === customerId)?.customerName ?? null,
    [customers, customerId],
  );

  const sortedOptions = (opts: SpineOption[]) =>
    [...opts].sort((a, b) => a.label.localeCompare(b.label));

  const customerOptions = sortedOptions(
    customers.map(c => ({ id: c.id, label: c.customerName })));
  const placeOptions = sortedOptions(
    places.map(p => ({ id: p.id, label: p.siteName, sublabel: p.address ?? undefined })));
  const areaOptions = sortedOptions(
    areas.map(a => ({ id: a.id, label: a.areaName })));

  // Retired assets are hidden unless asked for (§8.2): a register that shows
  // withdrawn machinery by default makes every count wrong, and hiding it
  // outright would lose the history.
  const visibleAssets = useMemo(() => {
    const rows = placeAssets.filter(a => showRetired || (a.status ?? 'Active') === 'Active');
    return rows.sort((a, b) => a.assemblyName.localeCompare(b.assemblyName));
  }, [placeAssets, showRetired]);
  const retiredCount = placeAssets.length - placeAssets.filter(
    a => (a.status ?? 'Active') === 'Active').length;

  function pickCustomer(id: string | null) {
    setCustomerId(id);
    setCustomerSiteId(null);
    setAreaId(null);
    setScopedAssetIds([]);
    const name = customers.find(c => c.id === id)?.customerName;
    // The typed name follows the pick, because `sites.customer` is the name the
    // job is ISSUED under and reports carry it verbatim. Picking a customer and
    // leaving a different name on the job would put one name on the paperwork
    // and another in the register.
    if (name) setCustomer(name);
  }

  function pickPlace(id: string | null) {
    setCustomerSiteId(id);
    setAreaId(null);
    setScopedAssetIds([]);
  }

  function toggleAsset(id: string) {
    setScopedAssetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!customer.trim() || !projectNumber.trim()) {
      setError('Customer and project number are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const assessorId = (await getCachedUserId()) ?? 0;
      const assessorName = user?.name ?? '';
      const inScope = placeAssets.filter(a => scopedAssetIds.includes(a.id));

      // Written locally and in one transaction: the job appears in the list
      // straight away, and a job that reached the device with half its scope
      // would be a job nobody could tell was incomplete.
      await db.write(async () => {
        const site = await db.get<Site>('sites').create(s => {
          s.customer = customer.trim();
          s.customerId = customerId;
          s.customerSiteId = customerSiteId;
          s.areaId = areaId;
          s.projectNumber = projectNumber.trim();
          s.projectDescription = projectDescription.trim();
          s.assessorId = assessorId;
          s.assessorName = assessorName;
          s.date = date;
          s.status = 'Active';
          s.isSynced = false;
        });

        for (const asset of inScope) {
          // NOT a copy of the asset. One episode, against the asset that is
          // already there — this is what gives it a history across rounds.
          await db.get<Assessment>('assessments').create(a => {
            a.siteId = site.id;
            a.assemblyId = asset.id;
            a.machineId = null;
            a.assessmentDate = date;
            a.assessorId = assessorId;
            a.status = 'In Progress';
            a.isSynced = false;
          });
        }
      });

      router.back();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  if (isDemoMode) return <DemoModeBlocked />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SpinePickerField
        label="Customer *"
        modalTitle="Choose customer"
        options={customerOptions}
        selectedId={customerId}
        onSelect={pickCustomer}
        placeholder="Choose from the register"
        notListedLabel="Not listed — type the name below"
      />

      <Text style={styles.label}>Customer name on the report *</Text>
      <TextInput
        style={styles.input}
        value={customer}
        onChangeText={setCustomer}
        placeholder="Customer name"
        placeholderTextColor={Colors.textLight}
      />
      <Text style={styles.hint}>
        {customerId
          ? 'The name this job is issued under. Reports carry it exactly.'
          : 'No customer picked, so the office will place this job before it reaches the client portal.'}
      </Text>

      <SpinePickerField
        label="Site"
        modalTitle="Choose site"
        options={placeOptions}
        selectedId={customerSiteId}
        onSelect={pickPlace}
        placeholder={customerId ? 'Choose a site' : 'Pick a customer first'}
        notListedLabel="Not listed — the office will place it"
        disabled={!customerId}
        disabledHint="Pick a customer first"
      />

      <SpinePickerField
        label="Area"
        modalTitle="Choose area"
        options={areaOptions}
        selectedId={areaId}
        onSelect={setAreaId}
        placeholder={customerSiteId ? 'Optional' : 'Pick a site first'}
        notListedLabel="Unassigned"
        disabled={!customerSiteId}
        disabledHint="Pick a site first"
      />

      <Text style={styles.label}>Project Number *</Text>
      <TextInput
        style={styles.input}
        value={projectNumber}
        onChangeText={setProjectNumber}
        placeholder="e.g. KT-2024-001"
        placeholderTextColor={Colors.textLight}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={projectDescription}
        onChangeText={setProjectDescription}
        placeholder="Optional description"
        placeholderTextColor={Colors.textLight}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Date *</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={Colors.textLight}
      />

      {/* ---- the repeat round ------------------------------------------- */}
      {customerSiteId ? (
        <View style={styles.scopeBlock}>
          <Text style={styles.label}>Assets already at this site</Text>
          <Text style={styles.hint}>
            Tick what this visit covers. Ticking records another assessment
            against the existing asset — it does not create a copy, so its
            history carries across.
          </Text>

          {visibleAssets.length === 0 ? (
            <Text style={styles.emptyScope}>
              {placeAssets.length === 0
                ? 'Nothing recorded here yet. Add assets once the job is open.'
                : 'Every asset here is retired.'}
            </Text>
          ) : (
            visibleAssets.map(asset => {
              const ticked = scopedAssetIds.includes(asset.id);
              const retired = (asset.status ?? 'Active') !== 'Active';
              return (
                <Pressable
                  key={asset.id}
                  style={[styles.assetRow, ticked && styles.assetRowOn]}
                  onPress={() => toggleAsset(asset.id)}
                >
                  <Feather
                    name={ticked ? 'check-square' : 'square'}
                    size={22}
                    color={ticked ? Colors.primary : Colors.textLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.assetName}>{asset.assemblyName}</Text>
                    {asset.description ? (
                      <Text style={styles.assetSub} numberOfLines={1}>{asset.description}</Text>
                    ) : null}
                  </View>
                  {retired ? <Text style={styles.retiredTag}>Retired</Text> : null}
                </Pressable>
              );
            })
          )}

          {retiredCount > 0 && (
            <Pressable onPress={() => setShowRetired(v => !v)} style={styles.toggleRetired}>
              <Feather name={showRetired ? 'eye-off' : 'eye'} size={18} color={Colors.textLight} />
              <Text style={styles.toggleRetiredText}>
                {showRetired ? 'Hide' : 'Show'} {retiredCount} retired
              </Text>
            </Pressable>
          )}

          {scopedAssetIds.length > 0 && (
            <Text style={styles.scopeCount}>
              {scopedAssetIds.length} asset{scopedAssetIds.length === 1 ? '' : 's'} in scope
              {customerName ? ` at ${customerName}` : ''}
            </Text>
          )}
        </View>
      ) : null}

      <Pressable
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Project</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 19, paddingBottom: 48 },
  label: { fontSize: 16, fontWeight: '600', color: Colors.text, marginBottom: 7, marginTop: 24 },
  hint: { fontSize: 14, color: Colors.textLight, marginTop: 6, lineHeight: 19 },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    color: Colors.text,
  },
  multiline: { height: 106, textAlignVertical: 'top' },
  scopeBlock: { marginTop: 8 },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  assetRowOn: { borderColor: Colors.primary },
  assetName: { fontSize: 17, color: Colors.text },
  assetSub: { fontSize: 14, color: Colors.textLight, marginTop: 2 },
  retiredTag: { fontSize: 13, color: Colors.textLight },
  emptyScope: { fontSize: 15, color: Colors.textLight, marginTop: 10 },
  toggleRetired: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  toggleRetiredText: { fontSize: 15, color: Colors.textLight },
  scopeCount: { fontSize: 15, color: Colors.primary, marginTop: 14, fontWeight: '600' },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 38,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 19 },
  error: { color: Colors.danger, marginBottom: 10, fontSize: 17 },
});
