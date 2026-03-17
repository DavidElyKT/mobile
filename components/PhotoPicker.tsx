import {
  View, Text, StyleSheet, Pressable, Image, ActivityIndicator,
  Alert, Modal, SafeAreaView, Dimensions,
} from 'react-native';
import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { SyncApi } from '@/services/api';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  label: string;
  currentUrl: string | null;
  token: string;
  onUploaded: (url: string) => void;
}

interface DrawPath {
  d: string;
  color: string;
  width: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEN_COLORS = ['#E74C3C', '#F39C12', '#2ECC71', '#1F4FA3', '#FFFFFF', '#000000'];
const { width: SCREEN_W } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhotoPicker({ label, currentUrl, token, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);

  // Drawing state
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [activePath, setActivePath] = useState('');
  const activePathRef = useRef('');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const penColorRef = useRef(PEN_COLORS[0]);

  // captureRef works with any View/ViewShot ref in react-native-view-shot v4
  const canvasRef = useRef<View>(null);

  // -------------------------------------------------------------------------
  // Touch drawing handlers
  // -------------------------------------------------------------------------

  function onTouchStart(e: any) {
    const { locationX, locationY } = e.nativeEvent;
    const p = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
    activePathRef.current = p;
    setActivePath(p);
  }

  function onTouchMove(e: any) {
    const { locationX, locationY } = e.nativeEvent;
    const p = `${activePathRef.current} L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
    activePathRef.current = p;
    setActivePath(p);
  }

  function onTouchEnd() {
    if (activePathRef.current) {
      setPaths((prev) => [
        ...prev,
        { d: activePathRef.current, color: penColorRef.current, width: 3 },
      ]);
      activePathRef.current = '';
      setActivePath('');
    }
  }

  // -------------------------------------------------------------------------
  // Photo picking
  // -------------------------------------------------------------------------

  async function openCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
      setPaths([]);
    }
  }

  async function openLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
      setPaths([]);
    }
  }

  // -------------------------------------------------------------------------
  // Upload helpers
  // -------------------------------------------------------------------------

  async function uploadUri(uri: string, ext = 'jpg') {
    const filename = `photo_${Date.now()}.${ext}`;
    const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const { upload_url, blob_url } = await SyncApi.getPhotoUploadUrl(token, filename, contentType);
    const blob = await (await fetch(uri)).blob();
    await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
      body: blob,
    });
    return blob_url;
  }

  // Save with annotations — captures the canvas using captureRef (v4 API)
  async function handleDone() {
    if (!canvasRef.current) {
      Alert.alert('Not ready', 'Canvas is not ready yet — try again.');
      return;
    }
    setUploading(true);
    try {
      const capturedUri = await captureRef(canvasRef, { format: 'jpg', quality: 0.9 });
      const blobUrl = await uploadUri(capturedUri, 'jpg');
      onUploaded(blobUrl);
      setPendingUri(null);
      setPaths([]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  // Save without annotations — uploads original image directly
  async function handleSkip() {
    if (!pendingUri) return;
    setUploading(true);
    try {
      const ext = pendingUri.split('.').pop() ?? 'jpg';
      const blobUrl = await uploadUri(pendingUri, ext);
      onUploaded(blobUrl);
      setPendingUri(null);
      setPaths([]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Thumbnail / placeholder */}
      <View style={styles.container}>
        {uploading ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.placeholderSub}>Uploading…</Text>
          </View>
        ) : currentUrl ? (
          <>
            <Image source={{ uri: currentUrl }} style={styles.thumbnail} />
            <View style={styles.thumbOverlayRow}>
              <Pressable style={styles.thumbBtn} onPress={openCamera}>
                <Feather name="camera" size={14} color="#fff" />
              </Pressable>
              <Pressable style={styles.thumbBtn} onPress={openLibrary}>
                <Feather name="image" size={14} color="#fff" />
              </Pressable>
              <Pressable style={styles.thumbBtn} onPress={() => setPendingUri(currentUrl)}>
                <Feather name="edit-2" size={14} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.placeholder}>
              <Feather name="camera" size={24} color={Colors.textLight} />
              <Text style={styles.placeholderText}>{label}</Text>
            </View>
            <View style={styles.pickButtons}>
              <Pressable style={styles.pickBtn} onPress={openCamera}>
                <Feather name="camera" size={14} color={Colors.primary} />
                <Text style={styles.pickBtnText}>Camera</Text>
              </Pressable>
              <View style={styles.pickDivider} />
              <Pressable style={styles.pickBtn} onPress={openLibrary}>
                <Feather name="image" size={14} color={Colors.primary} />
                <Text style={styles.pickBtnText}>Library</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {/* Annotation modal */}
      <Modal
        visible={!!pendingUri}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPendingUri(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Header bar */}
          <View style={styles.modalHeader}>
            <Pressable style={styles.headerBtn} onPress={() => setPendingUri(null)}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Annotate</Text>
            <Pressable
              style={[styles.headerBtn, styles.headerDoneBtn]}
              onPress={handleDone}
              disabled={uploading}
            >
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.headerDoneText}>Save</Text>}
            </Pressable>
          </View>

          {/* Canvas — ref used by captureRef for screenshot */}
          <View
            ref={canvasRef}
            style={styles.canvasWrap}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            collapsable={false}
          >
            {pendingUri ? (
              <Image
                source={{ uri: pendingUri }}
                style={styles.canvas}
                resizeMode="contain"
              />
            ) : null}
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              {paths.map((p, i) => (
                <Path
                  key={i}
                  d={p.d}
                  stroke={p.color}
                  strokeWidth={p.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {activePath ? (
                <Path
                  d={activePath}
                  stroke={penColor}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </View>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            {/* Color swatches */}
            <View style={styles.colorRow}>
              {PEN_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    c === penColor && styles.colorDotActive,
                  ]}
                  onPress={() => {
                    setPenColor(c);
                    penColorRef.current = c;
                  }}
                />
              ))}
            </View>

            {/* Undo */}
            <Pressable
              style={styles.toolBtn}
              onPress={() => setPaths((prev) => prev.slice(0, -1))}
            >
              <Feather name="corner-up-left" size={20} color={Colors.text} />
              <Text style={styles.toolBtnText}>Undo</Text>
            </Pressable>

            {/* Clear */}
            <Pressable style={styles.toolBtn} onPress={() => setPaths([])}>
              <Feather name="trash-2" size={20} color={Colors.danger} />
              <Text style={[styles.toolBtnText, { color: Colors.danger }]}>Clear</Text>
            </Pressable>

            {/* Skip annotation */}
            <Pressable style={styles.toolBtn} onPress={handleSkip} disabled={uploading}>
              <Feather name="skip-forward" size={20} color={Colors.textMuted} />
              <Text style={[styles.toolBtnText, { color: Colors.textMuted }]}>No markup</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 140,
  },

  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  placeholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  placeholderSub: { fontSize: 11, color: Colors.textLight },

  pickButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  pickBtnText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  pickDivider: { width: 1, backgroundColor: Colors.border },

  thumbnail: { width: '100%', height: 110, resizeMode: 'cover' },
  thumbOverlayRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.text + 'CC',
  },
  thumbBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#000' },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  headerBtnText: { fontSize: 14, color: Colors.textLight },
  headerDoneBtn: { backgroundColor: Colors.primary },
  headerDoneText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  canvasWrap: {
    flex: 1,
    backgroundColor: '#111',
  },
  canvas: {
    flex: 1,
    width: SCREEN_W,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  colorRow: { flexDirection: 'row', gap: 8, marginRight: 8 },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },
  toolBtn: { alignItems: 'center', paddingHorizontal: 10, gap: 2 },
  toolBtnText: { fontSize: 10, color: Colors.text },
});
