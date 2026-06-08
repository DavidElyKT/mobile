import { useState, useRef } from 'react';
import {
  Modal, View, StyleSheet, Pressable, Text, Image, ActivityIndicator,
  ScrollView, Dimensions, Alert,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrawPath {
  d: string;
  color: string;
  width: number;
}

type DrawMode = 'pen' | 'square' | 'circle';

interface Point {
  x: number;
  y: number;
}

interface Props {
  visible: boolean;
  /** The local file URI of the photo to annotate. */
  uri: string | null;
  /** Called with the (possibly annotated) local URI when the user saves. */
  onDone: (localUri: string) => void;
  /** Called when the user cancels, discarding the photo entirely. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEN_COLORS = ['#E74C3C', '#F39C12', '#2ECC71', '#1F4FA3', '#FFFFFF', '#000000'];
const { width: SCREEN_W } = Dimensions.get('window');

function toPointPath(x: number, y: number): string {
  return `M${x.toFixed(1)},${y.toFixed(1)}`;
}

function getSquareBounds(start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  if (side < 1) return null;

  const endX = start.x + (dx < 0 ? -side : side);
  const endY = start.y + (dy < 0 ? -side : side);

  const x1 = Math.min(start.x, endX);
  const y1 = Math.min(start.y, endY);
  const x2 = Math.max(start.x, endX);
  const y2 = Math.max(start.y, endY);

  return { x1, y1, x2, y2 };
}

function buildSquarePath(start: Point, end: Point): string {
  const bounds = getSquareBounds(start, end);
  if (!bounds) return '';
  const { x1, y1, x2, y2 } = bounds;
  return [
    `M${x1.toFixed(1)},${y1.toFixed(1)}`,
    `L${x2.toFixed(1)},${y1.toFixed(1)}`,
    `L${x2.toFixed(1)},${y2.toFixed(1)}`,
    `L${x1.toFixed(1)},${y2.toFixed(1)}`,
    'Z',
  ].join(' ');
}

function buildCirclePath(start: Point, end: Point): string {
  const bounds = getSquareBounds(start, end);
  if (!bounds) return '';
  const { x1, y1, x2, y2 } = bounds;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const r = (x2 - x1) / 2;
  if (r < 0.5) return '';
  return [
    `M${(cx - r).toFixed(1)},${cy.toFixed(1)}`,
    `A${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(cx + r).toFixed(1)},${cy.toFixed(1)}`,
    `A${r.toFixed(1)},${r.toFixed(1)} 0 1 0 ${(cx - r).toFixed(1)},${cy.toFixed(1)}`,
  ].join(' ');
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhotoAnnotationModal({ visible, uri, onDone, onCancel }: Props) {
  const [saving, setSaving] = useState(false);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [activePath, setActivePath] = useState('');
  const activePathRef = useRef('');
  const [drawMode, setDrawMode] = useState<DrawMode>('pen');
  const drawStartRef = useRef<Point | null>(null);
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const penColorRef = useRef(PEN_COLORS[0]);
  const [canvasSize, setCanvasSize] = useState({ width: SCREEN_W, height: 400 });
  const canvasRef = useRef<ViewShot>(null);

  const drawGesture = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .runOnJS(true)
    .onBegin((e) => {
      const start = { x: e.x, y: e.y };
      drawStartRef.current = start;

      if (drawMode === 'pen') {
        const p = toPointPath(start.x, start.y);
        activePathRef.current = p;
        setActivePath(p);
      } else {
        activePathRef.current = '';
        setActivePath('');
      }
    })
    .onUpdate((e) => {
      const next = { x: e.x, y: e.y };
      const start = drawStartRef.current ?? next;

      if (drawMode === 'pen') {
        const p = `${activePathRef.current} L${next.x.toFixed(1)},${next.y.toFixed(1)}`;
        activePathRef.current = p;
        setActivePath(p);
        return;
      }

      const p = drawMode === 'square'
        ? buildSquarePath(start, next)
        : buildCirclePath(start, next);
      activePathRef.current = p;
      setActivePath(p);
    })
    .onEnd(() => {
      const completedPath = activePathRef.current;
      const completedColor = penColorRef.current;
      if (completedPath) {
        activePathRef.current = '';
        setActivePath('');
        setPaths((prev) => [...prev, { d: completedPath, color: completedColor, width: 4 }]);
      }
      drawStartRef.current = null;
    });

  function resetDrawing() {
    setPaths([]);
    setActivePath('');
    activePathRef.current = '';
    drawStartRef.current = null;
    setDrawMode('pen');
    setPenColor(PEN_COLORS[0]);
    penColorRef.current = PEN_COLORS[0];
  }

  async function handleSave() {
    if (!canvasRef.current) { Alert.alert('Not ready', 'Canvas is not ready yet — try again.'); return; }
    const capture = canvasRef.current.capture?.bind(canvasRef.current);
    if (!capture) { Alert.alert('Not ready', 'Capture is not ready yet — try again.'); return; }
    setSaving(true);
    try {
      const tempUri = await capture();
      const localUri = await saveLocally(tempUri);
      resetDrawing();
      onDone(localUri);
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    if (!uri) return;
    resetDrawing();
    onDone(uri);
  }

  function handleCancel() {
    resetDrawing();
    onCancel();
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Pressable style={styles.headerBtn} onPress={handleCancel}>
                <Text style={styles.headerBtnText}>Cancel</Text>
              </Pressable>
              <Text style={styles.title}>Annotate</Text>
              <Pressable style={styles.headerBtn} onPress={handleSkip}>
                <Text style={styles.headerBtnText}>Skip</Text>
              </Pressable>
            </View>

            {/* Canvas */}
            <GestureDetector gesture={drawGesture}>
              <View
                style={styles.canvasWrap}
                collapsable={false}
                onLayout={(e) => {
                  const { width, height } = e.nativeEvent.layout;
                  setCanvasSize({ width, height });
                }}
              >
                <ViewShot
                  ref={canvasRef}
                  options={{ format: 'jpg', quality: 0.9 }}
                  style={StyleSheet.absoluteFill}
                >
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={{ width: canvasSize.width, height: canvasSize.height }}
                      resizeMode="contain"
                    />
                  ) : null}
                  <Svg
                    width={canvasSize.width}
                    height={canvasSize.height}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  >
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
                        strokeWidth={4}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                  </Svg>
                </ViewShot>
              </View>
            </GestureDetector>

            {/* Toolbar */}
            <View style={styles.toolbar}>
              <View style={styles.modeActionRow}>
                <Pressable
                  style={[styles.modeBtn, drawMode === 'pen' && styles.modeBtnActive]}
                  onPress={() => setDrawMode('pen')}
                >
                  <Feather name="edit-3" size={16} color={drawMode === 'pen' ? '#fff' : '#E5E7EB'} />
                  <Text style={[styles.modeBtnText, drawMode === 'pen' && styles.modeBtnTextActive]}>Pen</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, drawMode === 'square' && styles.modeBtnActive]}
                  onPress={() => setDrawMode('square')}
                >
                  <Feather name="square" size={16} color={drawMode === 'square' ? '#fff' : '#E5E7EB'} />
                  <Text style={[styles.modeBtnText, drawMode === 'square' && styles.modeBtnTextActive]}>Square</Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, drawMode === 'circle' && styles.modeBtnActive]}
                  onPress={() => setDrawMode('circle')}
                >
                  <Feather name="circle" size={16} color={drawMode === 'circle' ? '#fff' : '#E5E7EB'} />
                  <Text style={[styles.modeBtnText, drawMode === 'circle' && styles.modeBtnTextActive]}>Circle</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, paths.length === 0 && styles.actionBtnDisabled]}
                  onPress={() => setPaths((prev) => prev.slice(0, -1))}
                  disabled={paths.length === 0}
                >
                  <Feather name="corner-up-left" size={18} color="#E5E7EB" />
                  <Text style={styles.actionBtnText}>Undo</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, paths.length === 0 && !activePath && styles.actionBtnDisabled]}
                  onPress={() => { setPaths([]); setActivePath(''); }}
                  disabled={paths.length === 0 && !activePath}
                >
                  <Feather name="trash-2" size={18} color={Colors.danger} />
                  <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Clear</Text>
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.toolSaveBtn]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Feather name="check" size={18} color="#fff" />}
                  <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save</Text>
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.colorRow}
                style={styles.colorScroll}
              >
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
              </ScrollView>
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 19,
    paddingVertical: 14,
  },
  title: { fontSize: 19, fontWeight: '700', color: '#fff' },
  headerBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
  headerBtnText: { fontSize: 17, color: '#8BA3C7' },

  canvasWrap: { flex: 1, backgroundColor: '#111' },

  toolbar: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  modeActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#111827',
  },
  modeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: '#E5E7EB' },
  modeBtnTextActive: { color: '#fff' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#111827',
  },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: '#E5E7EB' },
  toolSaveBtn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  colorScroll: { maxHeight: 40 },
  colorRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  colorDot: {
    width: 29,
    height: 29,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: { borderColor: '#fff', transform: [{ scale: 1.15 }] },
});
