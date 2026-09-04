import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState, forwardRef, useImperativeHandle } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import * as FileSystem from 'expo-file-system/legacy';
import PhotoAnnotationModal from '@/components/PhotoAnnotationModal';
import CachedImage from '@/components/CachedImage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhotoPickerRef {
  openCamera: () => void;
  openLibrary: () => void;
}

interface Props {
  label: string;
  currentUrl: string | null;
  /**
   * @param originalUrl  The un-annotated image, present only when the user drew
   *   on the photo. Annotation flattens the strokes into `url`, so this is the
   *   only clean copy left; callers must persist it alongside the photo.
   */
  onUploaded: (url: string, originalUrl?: string) => void;
  /**
   * When provided, the annotation modal is bypassed.
   * Instead, the photo is saved locally and this callback is called
   * with the file:// URI. Use this when PhotoPicker is rendered inside
   * another Modal to avoid nested-Modal issues on Android.
   */
  onAnnotationRequest?: (localUri: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PhotoPicker = forwardRef<PhotoPickerRef, Props>(function PhotoPicker({ label, currentUrl, onUploaded, onAnnotationRequest }, ref) {
  const [uploading, setUploading] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ openCamera, openLibrary }));

  // -------------------------------------------------------------------------
  // Save helper
  // -------------------------------------------------------------------------

  async function saveLocally(sourceUri: string): Promise<string> {
    const dir = FileSystem.documentDirectory + 'pending_photos/';
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const path = dir + `photo_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: sourceUri, to: path });
    return path;
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
      mediaTypes: 'images',
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const localUri = await saveLocally(result.assets[0].uri);
      if (onAnnotationRequest) {
        onAnnotationRequest(localUri);
      } else {
        setPendingUri(localUri);
      }
    }
  }

  async function openLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const localUri = await saveLocally(result.assets[0].uri);
      if (onAnnotationRequest) {
        onAnnotationRequest(localUri);
      } else {
        setPendingUri(localUri);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Annotation callbacks
  // -------------------------------------------------------------------------

  function handleAnnotationDone(localUri: string, originalUri?: string) {
    setUploading(true);
    try {
      onUploaded(localUri, originalUri);
    } finally {
      setPendingUri(null);
      setUploading(false);
    }
  }

  function handleAnnotationCancel() {
    setPendingUri(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <View style={styles.container}>
        {uploading ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.placeholderSub}>Saving…</Text>
          </View>
        ) : currentUrl ? (
          <>
            <CachedImage uri={currentUrl} style={styles.thumbnail} />
            <View style={styles.thumbOverlayRow}>
              <Pressable style={styles.thumbBtn} onPress={openCamera}>
                <Feather name="camera" size={17} color="#fff" />
              </Pressable>
              <Pressable style={styles.thumbBtn} onPress={openLibrary}>
                <Feather name="image" size={17} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.thumbBtn}
                onPress={() => onAnnotationRequest ? onAnnotationRequest(currentUrl!) : setPendingUri(currentUrl)}
              >
                <Feather name="edit-2" size={17} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.placeholder}>
              <Feather name="camera" size={29} color={Colors.textLight} />
              <Text style={styles.placeholderText}>{label}</Text>
            </View>
            <View style={styles.pickButtons}>
              <Pressable style={styles.pickBtn} onPress={openCamera}>
                <Feather name="camera" size={17} color={Colors.primary} />
                <Text style={styles.pickBtnText}>Camera</Text>
              </Pressable>
              <View style={styles.pickDivider} />
              <Pressable style={styles.pickBtn} onPress={openLibrary}>
                <Feather name="image" size={17} color={Colors.primary} />
                <Text style={styles.pickBtnText}>Library</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <PhotoAnnotationModal
        visible={!!pendingUri}
        uri={pendingUri}
        onDone={handleAnnotationDone}
        onCancel={handleAnnotationCancel}
      />
    </>
  );
});

export default PhotoPicker;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 168,
  },

  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 19,
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  placeholderSub: { fontSize: 13, color: Colors.textLight },

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
    gap: 6,
    paddingVertical: 12,
  },
  pickBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  pickDivider: { width: 1, backgroundColor: Colors.border },

  thumbnail: { width: '100%', height: 132, resizeMode: 'cover' },
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
    paddingVertical: 10,
  },
});
