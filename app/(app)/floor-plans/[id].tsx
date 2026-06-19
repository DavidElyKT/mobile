import {
  View, Text, Image, StyleSheet, Pressable, ActivityIndicator,
  Alert, ScrollView, Dimensions, TextInput, Modal,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
// Lazy require — WebView requires a native build; degrade gracefully on OTA-only updates
let _WebView: React.ComponentType<any> | null = null;
try { _WebView = require('react-native-webview').WebView; } catch { /* not in this build */ }
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useRecord, useQuery } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { Colors } from '@/constants/Colors';
import { FloorPlanMarkersApi } from '@/services/api';
import { SkeletonDetailScreen } from '@/components/SkeletonLoader';
import FloorPlan from '@/db/models/FloorPlan.model';
import FloorPlanMarker from '@/db/models/FloorPlanMarker.model';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';

function isPdf(url: string | null | undefined): boolean {
  return (url?.split('?')[0].toLowerCase().endsWith('.pdf')) ?? false;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Pin geometry — tip of the tail sits at the marker coordinate
const PIN_HEAD = 13;   // radius of circle head
const PIN_TAIL_H = 10; // height of triangular tail
const PIN_TAIL_W = 7;  // half-width of tail base
const PIN_TOTAL_H = PIN_HEAD * 2 + PIN_TAIL_H;

// ---------------------------------------------------------------------------
// Marker pin (teardrop shape: circle head + CSS-triangle tail)
// ---------------------------------------------------------------------------

function MapPin({
  label, color, ghost, onLongPress,
}: {
  label: string; color: string; ghost?: boolean; onLongPress?: () => void;
}) {
  return (
    <Pressable
      onLongPress={onLongPress}
      style={[
        styles.pinContainer,
        ghost && styles.pinGhost,
        // Shift so the tail tip aligns with the wrapper's origin
        { transform: [{ translateX: -PIN_HEAD }, { translateY: -PIN_TOTAL_H }] },
      ]}
    >
      <View style={[styles.pinHead, { backgroundColor: color }]}>
        <Text style={styles.pinLabel}>{label}</Text>
      </View>
      <View style={[styles.pinTail, { borderTopColor: color }]} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FloorPlanEditorScreen() {
  const { id, entity_id, entity_type, entity_name } = useLocalSearchParams<{
    id: string;
    entity_id?: string;
    entity_type?: 'assembly' | 'machine';
    entity_name?: string;
  }>();
  const navigation = useNavigation();
  const { getAccessToken } = useAuth();
  const db = useDatabase();

  const plan = useRecord<FloorPlan>(db.get<FloorPlan>('floor_plans'), id);

  // All markers for this floor plan
  const markers = useQuery<FloorPlanMarker>(
    db.get<FloorPlanMarker>('floor_plan_markers').query(Q.where('floor_plan_id', id ?? '')),
  );

  // All assemblies for this site (for the placement panel)
  const assemblies = useQuery<Assembly>(
    db.get<Assembly>('assemblies').query(Q.where('site_id', plan?.siteId ?? '')),
    [plan?.siteId],
  );

  // All sub-machines for this site (to look up names for machine markers)
  const machinesOnSite = useQuery<Machine>(
    db.get<Machine>('machines').query(
      Q.on('assemblies', Q.where('site_id', plan?.siteId ?? '')),
    ),
    [plan?.siteId],
  );

  // Image dimensions
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [mapWidth, setMapWidth] = useState(SCREEN_WIDTH);
  const [mapHeight, setMapHeight] = useState(SCREEN_WIDTH);

  // Placement state
  const isDirectMode = !!entity_id; // opened from "Mark Location" on a machine/assembly detail page
  const [selectedId, setSelectedId] = useState<string | null>(entity_id ?? null);
  const [selectedType, setSelectedType] = useState<'assembly' | 'machine' | null>(entity_type ?? null);
  const [panelCollapsed, setPanelCollapsed] = useState(!!entity_id);

  // Ghost marker for direct placement mode (tap moves it, Confirm places it)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [ghostMoved, setGhostMoved] = useState(false);
  const [confirmingGhost, setConfirmingGhost] = useState(false);
  const ghostInitRef = useRef(false);

  // Rename modal
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Marker deletion
  const [deletingMarkerId, setDeletingMarkerId] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) return;
    navigation.setOptions({
      title: plan.name || 'Floor Plan',
      headerRight: () => (
        <Pressable style={{ padding: 8 }} onPress={() => { setNewName(plan.name); setRenaming(true); }}>
          <Feather name="edit-2" size={20} color="#fff" />
        </Pressable>
      ),
    });
  }, [plan?.name]);

  useEffect(() => {
    if (!plan?.imageUrl) return;
    if (isPdf(plan.imageUrl)) {
      // A4 portrait ratio — PDF dimensions aren't available client-side
      setImageAspectRatio(1 / Math.SQRT2);
      return;
    }
    Image.getSize(
      plan.imageUrl,
      (w, h) => setImageAspectRatio(w / h),
      () => setImageAspectRatio(1),
    );
  }, [plan?.imageUrl]);

  useEffect(() => {
    if (imageAspectRatio) setMapHeight(mapWidth / imageAspectRatio);
  }, [imageAspectRatio, mapWidth]);

  // Compute suggested ghost position once from recent marker history.
  // Direction is extrapolated from the last two placed markers (prevailing movement vector).
  useEffect(() => {
    if (!isDirectMode || !plan || ghostInitRef.current) return;
    ghostInitRef.current = true;

    const sorted = [...markers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    let pos: { x: number; y: number };
    if (sorted.length >= 2) {
      const last = sorted[0]; const prev = sorted[1];
      const dx = last.xPercent - prev.xPercent;
      const dy = last.yPercent - prev.yPercent;
      pos = {
        x: Math.min(92, Math.max(8, last.xPercent + dx)),
        y: Math.min(92, Math.max(8, last.yPercent + dy)),
      };
    } else if (sorted.length === 1) {
      pos = { x: Math.min(90, sorted[0].xPercent + 8), y: sorted[0].yPercent };
    } else {
      pos = { x: 50, y: 50 };
    }
    setGhostPos(pos);
  }, [isDirectMode, plan?.id]);

  // -------------------------------------------------------------------------
  // Derived marker sets
  // -------------------------------------------------------------------------

  const assemblyMarkers = markers.filter(m => m.assemblyId != null);
  const machineMarkers  = markers.filter(m => m.machineId  != null);

  const markedAssemblyIds = new Set(assemblyMarkers.map(m => m.assemblyId!));
  const sortedAssemblies  = [...assemblies].sort((a, b) => a.assemblyName.localeCompare(b.assemblyName));
  const unplaced = sortedAssemblies.filter(a => !markedAssemblyIds.has(a.id));
  const placed   = sortedAssemblies.filter(a =>  markedAssemblyIds.has(a.id));

  function markerForAssembly(asmId: string) {
    return assemblyMarkers.find(m => m.assemblyId === asmId);
  }

  // Assembly markers ordered for the map (blue pins, numbered)
  const orderedAssemblyMarkers = sortedAssemblies
    .map((a, i) => {
      const m = markerForAssembly(a.id);
      return m ? { marker: m, label: String(i + 1), color: Colors.primary } : null;
    })
    .filter(Boolean) as { marker: FloorPlanMarker; label: string; color: string }[];

  // Machine markers ordered for the map (orange pins, labelled M1, M2…)
  const resolvedMachineMarkers = machineMarkers
    .map(m => ({ marker: m, machine: machinesOnSite.find(mc => mc.id === m.machineId) }))
    .filter((x): x is { marker: FloorPlanMarker; machine: Machine } => x.machine != null);
  resolvedMachineMarkers.sort((a, b) =>
    a.machine.machineNameReference.localeCompare(b.machine.machineNameReference),
  );
  const orderedMachineMarkers = resolvedMachineMarkers.map((x, i) => ({
    marker: x.marker,
    machine: x.machine,
    label: `M${i + 1}`,
    color: Colors.orange,
  }));

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function selectAssembly(asmId: string) {
    if (selectedId === asmId) {
      setSelectedId(null);
      setSelectedType(null);
    } else {
      setSelectedId(asmId);
      setSelectedType('assembly');
      setPanelCollapsed(true);
    }
  }

  function cancelPlacement() {
    setSelectedId(null);
    setSelectedType(null);
    setGhostPos(null);
    setGhostMoved(false);
    setPanelCollapsed(false);
  }

  async function handleMapTap(event: any) {
    if (!selectedId || !mapWidth || !mapHeight) return;
    const { locationX, locationY } = event.nativeEvent;
    const xPercent = Math.min(100, Math.max(0, (locationX / mapWidth) * 100));
    const yPercent = Math.min(100, Math.max(0, (locationY / mapHeight) * 100));

    if (isDirectMode) {
      // Direct mode: move the ghost; user confirms with the Confirm button
      setGhostPos({ x: xPercent, y: yPercent });
      setGhostMoved(true);
      return;
    }

    // Panel mode: place immediately (conveyor-belt advance to next unplaced)
    try {
      await db.write(async () => {
        await db.get<FloorPlanMarker>('floor_plan_markers').create(m => {
          m.floorPlanId = id;
          m.assemblyId = selectedType === 'assembly' ? selectedId : null;
          m.machineId  = selectedType === 'machine'  ? selectedId : null;
          m.xPercent = xPercent;
          m.yPercent = yPercent;
          m.isSynced = false;
        });
      });
      const next = unplaced.find(a => a.id !== selectedId);
      if (next && selectedType === 'assembly') {
        setSelectedId(next.id);
      } else {
        setSelectedId(null);
        setSelectedType(null);
        setPanelCollapsed(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleConfirmGhost() {
    if (!selectedId || !ghostPos || confirmingGhost) return;
    setConfirmingGhost(true);
    try {
      await db.write(async () => {
        await db.get<FloorPlanMarker>('floor_plan_markers').create(m => {
          m.floorPlanId = id;
          m.assemblyId = selectedType === 'assembly' ? selectedId : null;
          m.machineId  = selectedType === 'machine'  ? selectedId : null;
          m.xPercent = ghostPos.x;
          m.yPercent = ghostPos.y;
          m.isSynced = false;
        });
      });
      setSelectedId(null);
      setSelectedType(null);
      setGhostPos(null);
      setGhostMoved(false);
      setPanelCollapsed(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setConfirmingGhost(false);
    }
  }

  async function confirmDeleteMarker(marker: FloorPlanMarker) {
    const hasServerId = typeof marker.serverId === 'number' && marker.serverId > 0;
    Alert.alert('Remove marker?', 'This will remove the location pin from this floor plan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setDeletingMarkerId(marker.id);
          try {
            if (hasServerId) {
              const token = await getAccessToken();
              if (!token) {
                Alert.alert('Offline', 'Connect to the internet to remove a synced marker.');
                return;
              }
              await FloorPlanMarkersApi.delete(token, marker.serverId!);
            }
            await db.write(async () => { await marker.destroyPermanently(); });
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setDeletingMarkerId(null);
          }
        },
      },
    ]);
  }

  async function handleSaveName() {
    if (!plan || !newName.trim()) return;
    setSavingName(true);
    try {
      await db.write(async () => {
        await plan.update(p => { p.name = newName.trim(); p.isSynced = false; });
      });
      setRenaming(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingName(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!plan) return <SkeletonDetailScreen />;

  const isPlacing = !!selectedId;
  const placingLabel = assemblies.find(a => a.id === selectedId)?.assemblyName
    ?? machinesOnSite.find(m => m.id === selectedId)?.machineNameReference
    ?? entity_name ?? selectedId ?? '';

  const ghostColor = selectedType === 'machine' ? Colors.orange : Colors.primary;
  const ghostLabel = selectedType === 'machine' ? 'M' : '+';

  function renderMarkers() {
    return (
      <>
        {orderedAssemblyMarkers.map(({ marker, label, color }) => (
          <View
            key={marker.id}
            pointerEvents="box-none"
            style={[
              styles.markerWrapper,
              { left: (marker.xPercent / 100) * mapWidth, top: (marker.yPercent / 100) * mapHeight },
            ]}
          >
            {deletingMarkerId === marker.id ? (
              <ActivityIndicator size="small" color={color} style={styles.markerSpinner} />
            ) : (
              <MapPin label={label} color={color} onLongPress={() => confirmDeleteMarker(marker)} />
            )}
          </View>
        ))}
        {orderedMachineMarkers.map(({ marker, label, color }) => (
          <View
            key={marker.id}
            pointerEvents="box-none"
            style={[
              styles.markerWrapper,
              { left: (marker.xPercent / 100) * mapWidth, top: (marker.yPercent / 100) * mapHeight },
            ]}
          >
            {deletingMarkerId === marker.id ? (
              <ActivityIndicator size="small" color={color} style={styles.markerSpinner} />
            ) : (
              <MapPin label={label} color={color} onLongPress={() => confirmDeleteMarker(marker)} />
            )}
          </View>
        ))}
        {isPlacing && isDirectMode && ghostPos && (
          <View
            pointerEvents="none"
            style={[
              styles.markerWrapper,
              { left: (ghostPos.x / 100) * mapWidth, top: (ghostPos.y / 100) * mapHeight },
            ]}
          >
            <MapPin label={ghostLabel} color={ghostColor} ghost />
          </View>
        )}
      </>
    );
  }

  return (
    <View style={styles.root}>
      {/* ----------------------------------------------------------------- */}
      {/* Map area                                                           */}
      {/* ----------------------------------------------------------------- */}
      <View
        style={styles.mapContainer}
        onLayout={e => {
          const w = e.nativeEvent.layout.width;
          setMapWidth(w);
          if (imageAspectRatio) setMapHeight(w / imageAspectRatio);
        }}
      >
        {plan.imageUrl ? (
          <>
            {isPdf(plan.imageUrl) ? (
              /* ── PDF floor plan: WebView background + absolute tap overlay ── */
              <View style={{ width: mapWidth, height: mapHeight || 200 }}>
                {_WebView ? (
                  <_WebView
                    source={{ uri: plan.imageUrl }}
                    style={{ width: mapWidth, height: mapHeight || 200 }}
                    originWhitelist={['*']}
                    allowFileAccess
                    scrollEnabled={false}
                    pointerEvents="none"
                  />
                ) : (
                  <View style={[styles.noImage, { width: mapWidth, height: mapHeight || 200 }]}>
                    <Feather name="file-text" size={40} color={Colors.textLight} />
                    <Text style={styles.noImageText}>PDF preview requires a new app build</Text>
                  </View>
                )}
                <Pressable
                  onPress={handleMapTap}
                  style={{ position: 'absolute', top: 0, left: 0, width: mapWidth, height: mapHeight || 200 }}
                >
                  {renderMarkers()}
                </Pressable>
              </View>
            ) : (
              /* ── Image floor plan: pinch-to-zoom ScrollView ── */
              <ScrollView
                style={{ width: mapWidth, height: mapHeight || 200 }}
                contentContainerStyle={{ width: mapWidth, height: mapHeight || 200 }}
                maximumZoomScale={4}
                minimumZoomScale={1}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                scrollEventThrottle={16}
              >
                <Pressable onPress={handleMapTap} style={{ width: mapWidth, height: mapHeight || 200 }}>
                  <Image
                    source={{ uri: plan.imageUrl }}
                    style={{ width: mapWidth, height: mapHeight || 200 }}
                    resizeMode="stretch"
                  />
                  {renderMarkers()}
                </Pressable>
              </ScrollView>
            )}

            {isPlacing && (
              <View style={styles.placingBanner} pointerEvents="none">
                <Feather name="crosshair" size={16} color="#fff" />
                <Text style={styles.placingBannerText} numberOfLines={1}>
                  {isDirectMode
                    ? (isPdf(plan.imageUrl) ? 'Tap to move pin • Confirm below' : 'Pinch to zoom • Tap to move pin • Confirm below')
                    : `Tap map to place: ${placingLabel}`}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.noImage, { width: mapWidth, height: 200 }]}>
            <Feather name="image" size={40} color={Colors.textLight} />
            <Text style={styles.noImageText}>No floor plan image yet</Text>
          </View>
        )}
      </View>

      {/* ----------------------------------------------------------------- */}
      {/* Placement panel                                                    */}
      {/* ----------------------------------------------------------------- */}
      <View style={styles.panel}>
        <Pressable style={styles.panelHeader} onPress={() => !isPlacing && setPanelCollapsed(v => !v)}>
          <Text style={styles.panelTitle} numberOfLines={1}>
            {isPlacing ? `Placing: ${placingLabel}` : `Mark locations (${markers.length} placed)`}
          </Text>
          {isPlacing ? (
            <View style={styles.panelHeaderActions}>
              <Pressable onPress={cancelPlacement} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              {isDirectMode && ghostPos && (
                <Pressable
                  onPress={handleConfirmGhost}
                  style={styles.confirmBtn}
                  disabled={confirmingGhost}
                >
                  {confirmingGhost
                    ? <ActivityIndicator size="small" color={Colors.success} />
                    : <Text style={styles.confirmBtnText}>Confirm</Text>}
                </Pressable>
              )}
            </View>
          ) : (
            <Feather name={panelCollapsed ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
          )}
        </Pressable>

        {!panelCollapsed && (
          <ScrollView style={styles.panelScroll} keyboardShouldPersistTaps="handled">
            {assemblies.length === 0 && machineMarkers.length === 0 && (
              <Text style={styles.emptyPanel}>No assets on this site yet.</Text>
            )}

            {unplaced.length > 0 && <Text style={styles.panelGroupLabel}>Unplaced</Text>}
            {unplaced.map(a => (
              <Pressable
                key={a.id}
                style={[styles.panelItem, selectedId === a.id && styles.panelItemSelected]}
                onPress={() => selectAssembly(a.id)}
              >
                <View style={[styles.panelItemDot, { backgroundColor: Colors.primary }]} />
                <Text style={styles.panelItemText}>{a.assemblyName}</Text>
                {selectedId === a.id && <Feather name="crosshair" size={16} color={Colors.primary} />}
              </Pressable>
            ))}

            {placed.length > 0 && <Text style={styles.panelGroupLabel}>Assets Placed</Text>}
            {placed.map(a => {
              const marker = markerForAssembly(a.id)!;
              return (
                <Pressable key={a.id} style={styles.panelItemPlaced} onLongPress={() => confirmDeleteMarker(marker)}>
                  <Feather name="check-circle" size={16} color={Colors.success} />
                  <View style={styles.panelItemBody}>
                    <Text style={[styles.panelItemText, styles.panelItemTextPlaced]}>{a.assemblyName}</Text>
                    <Text style={styles.panelItemSub}>Hold to remove</Text>
                  </View>
                </Pressable>
              );
            })}

            {orderedMachineMarkers.length > 0 && (
              <Text style={styles.panelGroupLabel}>Sub-machines Placed</Text>
            )}
            {orderedMachineMarkers.map(({ marker, machine }) => (
              <Pressable key={marker.id} style={styles.panelItemPlaced} onLongPress={() => confirmDeleteMarker(marker)}>
                <Feather name="check-circle" size={16} color={Colors.orange} />
                <View style={styles.panelItemBody}>
                  <Text style={[styles.panelItemText, styles.panelItemTextPlaced]}>
                    {machine.machineNameReference}
                  </Text>
                  <Text style={styles.panelItemSub}>Hold to remove</Text>
                </View>
              </Pressable>
            ))}

            <View style={{ height: 24 }} />
          </ScrollView>
        )}
      </View>

      {/* ----------------------------------------------------------------- */}
      {/* Rename modal                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Modal
        visible={renaming}
        transparent
        animationType="fade"
        onRequestClose={() => !savingName && setRenaming(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename floor plan</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setRenaming(false)}
                disabled={savingName}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={handleSaveName}
                disabled={savingName || !newName.trim()}
              >
                {savingName
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalBtnSaveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Map
  mapContainer: { backgroundColor: '#1a1a1a', alignItems: 'center' },
  noImage: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.card },
  noImageText: { fontSize: 15, color: Colors.textLight },
  markerWrapper: { position: 'absolute' },
  markerSpinner: { width: PIN_HEAD * 2, height: PIN_HEAD * 2 },

  // Pin shape
  pinContainer: { alignItems: 'center' },
  pinGhost: { opacity: 0.5 },
  pinHead: {
    width: PIN_HEAD * 2,
    height: PIN_HEAD * 2,
    borderRadius: PIN_HEAD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 5,
  },
  pinLabel: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: PIN_TAIL_W,
    borderRightWidth: PIN_TAIL_W,
    borderTopWidth: PIN_TAIL_H,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // borderTopColor set inline per marker
  },

  // Placing banner
  placingBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: '90%',
  },
  placingBannerText: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 },

  // Panel
  panel: { flex: 1, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 19,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  panelTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1, marginRight: 8 },
  panelHeaderActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.danger + '18',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: Colors.danger },
  confirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.success + '20',
    minWidth: 72,
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  panelScroll: { flex: 1 },
  panelGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 19,
    paddingTop: 14,
    paddingBottom: 6,
  },
  panelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  panelItemSelected: { backgroundColor: Colors.primary + '10' },
  panelItemPlaced: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
    opacity: 0.65,
  },
  panelItemDot: { width: 10, height: 10, borderRadius: 5 },
  panelItemBody: { flex: 1 },
  panelItemText: { fontSize: 15, color: Colors.text, fontWeight: '500', flex: 1 },
  panelItemTextPlaced: { textDecorationLine: 'line-through', color: Colors.textMuted },
  panelItemSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  emptyPanel: { color: Colors.textLight, fontSize: 14, padding: 19 },

  // Rename modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: Colors.border },
  modalBtnSave: { backgroundColor: Colors.primary },
  modalBtnCancelText: { color: Colors.text, fontWeight: '600', fontSize: 15 },
  modalBtnSaveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
