import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Modal, View, Text, TextInput, StyleSheet, Pressable,
  Animated, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import PhotoPicker from '@/components/PhotoPicker';
import { RATING_COLOURS, type RiskLevel } from '@/constants/risk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WizardStepType =
  | 'text'
  | 'multiline'
  | 'single-select'
  | 'multi-select'
  | 'photo'
  | 'badge';

/** A suggestion chip shown below a text/multiline field. */
export interface WizardSuggestion {
  label: string;
  /** Amber star badge — marks authoritative library items. */
  isLibrary?: boolean;
  /**
   * Returns the data patch to merge when tapped.
   * Omit to fill only the current step's key with `label`.
   */
  apply?: (currentData: Record<string, any>) => Record<string, any>;
}

export interface WizardStep {
  key: string;
  type: WizardStepType;
  question: string;
  subtext?: string;
  placeholder?: string;
  required?: boolean;
  options?: readonly string[];
  /**
   * Maps option display text → stored value.
   * When set, tapping an option stores `optionValueMap[option]` rather than the option string.
   * Useful for e.g. mapping a machine name to its UUID.
   */
  optionValueMap?: Record<string, string>;
  skippable?: boolean;
  searchable?: boolean;
  getSuggestions?: (value: string, data: Record<string, any>) => WizardSuggestion[];
  computeBadge?: (data: Record<string, any>) => { rating: RiskLevel | null; score: number | null };
  photoLabel?: string;
}

export interface FocusWizardModalRef {
  /**
   * Call before temporarily hiding the wizard for photo capture.
   * Prevents the wizard from resetting step/data when it becomes visible again.
   */
  skipNextReset: () => void;
  /**
   * Inject a captured photo URI into the wizard and auto-advance.
   * Call after the wizard is visible again.
   */
  injectPhoto: (key: string, uri: string) => void;
}

interface Props {
  visible: boolean;
  steps: WizardStep[];
  initialData?: Record<string, any>;
  /** Called to persist the completed wizard data. Should throw on failure. */
  onSave: (data: Record<string, any>) => Promise<void>;
  /** Called when the modal should be closed (cancel, or Done after save). */
  onClose: () => void;
  /** Returns the subtitle shown on the success screen, e.g. the saved item's name. */
  getSuccessDetail?: (data: Record<string, any>) => string;
  /**
   * When provided, photo steps call this instead of launching the picker directly.
   * The parent is responsible for closing the wizard, capturing the photo, and
   * re-opening the wizard before calling wizardRef.injectPhoto(key, uri).
   * This avoids expo-image-picker issues within a React Native Modal on Android.
   */
  onPhotoRequest?: (type: 'camera' | 'library', key: string) => void;
}

// ---------------------------------------------------------------------------
// Deep Field dark theme
// ---------------------------------------------------------------------------

const DK = {
  bg: '#0B1426',
  card: '#162035',
  cardBorder: '#2A3F5F',
  cardFocus: '#1F4FA3',
  text: '#FFFFFF',
  textMuted: '#8BA3C7',
  textDim: '#4A6A9C',
  dotFilled: '#FF6A00',
  dotEmpty: '#2A3F5F',
  nextBtn: '#1F4FA3',
  orange: '#FF6A00',
  success: '#2ECC71',
  danger: '#EF4444',
  rowBorder: '#1E2F4A',
  rowSelected: '#1A2E4F',
  chipBorder: '#2A3F5F',
  chipText: '#8BA3C7',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FocusWizardModal = forwardRef<FocusWizardModalRef, Props>(function FocusWizardModal({
  visible,
  steps,
  initialData = {},
  onSave,
  onClose,
  getSuccessDetail,
  onPhotoRequest,
}: Props, ref) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, any>>(initialData);
  const [isDone, setIsDone] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const autoTimer = useRef<ReturnType<typeof setTimeout>>();
  const visibleRef = useRef(visible);
  const skipResetRef = useRef(false);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  useImperativeHandle(ref, () => ({
    skipNextReset: () => { skipResetRef.current = true; },
    injectPhoto: (key: string, uri: string) => {
      setData(d => ({ ...d, [key]: uri }));
      clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => {
        if (visibleRef.current) goNextRef.current();
      }, 500);
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Always-current "go next" — avoids stale closures in timers.
  const goNextRef = useRef<() => void>(() => {});
  goNextRef.current = () => {
    const nextStep = step + 1;
    if (nextStep >= steps.length) {
      triggerSave();
      return;
    }
    animateTo('forward', () => setStep(nextStep));
  };

  // Reset all state when modal opens (skipped after temporary close for photo capture).
  useEffect(() => {
    if (visible) {
      if (skipResetRef.current) {
        skipResetRef.current = false;
        return;
      }
      setStep(0);
      setData(initialData);
      setIsDone(false);
      setIsSaving(false);
      setSaveError(null);
      slideAnim.setValue(0);
      opacityAnim.setValue(1);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset search query when moving between steps.
  useEffect(() => { setSearchQuery(''); }, [step]);

  // Badge steps auto-advance after 1600ms.
  useEffect(() => {
    const def = steps[step];
    if (!def || !visible || def.type !== 'badge') return;
    const t = setTimeout(() => { if (visibleRef.current) goNextRef.current(); }, 1600);
    return () => clearTimeout(t);
  }, [step, visible, steps]);

  // Cleanup timers on unmount.
  useEffect(() => () => clearTimeout(autoTimer.current), []);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function triggerSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(data);
      setIsDone(true);
    } catch (e: any) {
      setSaveError(e.message ?? 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function animateTo(direction: 'forward' | 'backward', callback: () => void) {
    const outX = direction === 'forward' ? -50 : 50;
    Animated.parallel([
      Animated.timing(opacityAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: outX, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(direction === 'forward' ? 50 : -50);
      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
    });
  }

  function handleNext() { goNextRef.current(); }

  function handleBack() {
    if (step === 0) { onClose(); return; }
    animateTo('backward', () => setStep(s => s - 1));
  }

  function handleSkip() { goNextRef.current(); }

  // Single-select: highlight then auto-advance after 380ms.
  function handleSingleSelect(key: string, displayValue: string) {
    const storedValue = def?.optionValueMap?.[displayValue] ?? displayValue;
    setData(d => ({ ...d, [key]: storedValue }));
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      if (visibleRef.current) goNextRef.current();
    }, 380);
  }

  // Photo: auto-advance 500ms after capture.
  function handlePhotoUploaded(key: string, url: string) {
    setData(d => ({ ...d, [key]: url }));
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      if (visibleRef.current) goNextRef.current();
    }, 500);
  }

  function toggleMultiSelect(key: string, option: string) {
    setData(d => {
      const current: string[] = d[key] ?? [];
      return {
        ...d,
        [key]: current.includes(option)
          ? current.filter(v => v !== option)
          : [...current, option],
      };
    });
  }

  function handleAddAnother() {
    opacityAnim.setValue(0);
    slideAnim.setValue(0);
    setIsDone(false);
    setSaveError(null);
    setStep(0);
    setData({});
    Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const def = steps[step];
  if (!def && !isDone) return null;

  const currentValue = def ? (data[def.key] ?? (def.type === 'multi-select' ? [] : '')) : '';
  const isLast = step === steps.length - 1;
  const canNext = !def?.required || (
    Array.isArray(currentValue)
      ? (currentValue as string[]).length > 0
      : !!(currentValue as string)?.trim()
  );

  const suggestions = def?.getSuggestions
    ? def.getSuggestions(typeof currentValue === 'string' ? currentValue : '', data)
    : [];

  // Dots exclude badge steps (interstitials, not real data steps).
  const dotsTotal = steps.filter(s => s.type !== 'badge').length;
  const dotsFilled = def ? steps.slice(0, step + 1).filter(s => s.type !== 'badge').length : dotsTotal;

  const safeAreaStyle = {
    paddingTop: insets.top + 8,
    paddingBottom: Math.max(insets.bottom, 12),
  };

  // ---------------------------------------------------------------------------
  // Success screen
  // ---------------------------------------------------------------------------

  if (isDone) {
    const detail = getSuccessDetail ? getSuccessDetail(data) : null;
    return (
      <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
        <View style={[styles.root, safeAreaStyle, styles.doneRoot]}>
          <Feather name="check-circle" size={68} color={DK.success} />
          <Text style={styles.doneTitle}>Saved</Text>
          {detail ? <Text style={styles.doneDetail}>{detail}</Text> : null}
          {saveError ? <Text style={styles.doneError}>{saveError}</Text> : null}
          <View style={styles.doneActions}>
            <Pressable style={styles.addAnotherBtn} onPress={handleAddAnother}>
              <Feather name="plus" size={19} color="#fff" />
              <Text style={styles.addAnotherText}>Add Another</Text>
            </Pressable>
            <Pressable style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // ---------------------------------------------------------------------------
  // Field renderers
  // ---------------------------------------------------------------------------

  function renderField() {
    if (!def) return null;
    switch (def.type) {
      case 'text':
        return (
          <View style={[styles.card, styles.cardFocused]}>
            <TextInput
              style={styles.textInput}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChangeText={v => setData(d => ({ ...d, [def.key]: v }))}
              placeholder={def.placeholder}
              placeholderTextColor={DK.textDim}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={canNext ? handleNext : undefined}
            />
          </View>
        );

      case 'multiline':
        return (
          <View style={[styles.card, styles.cardFocused, styles.cardTall]}>
            <TextInput
              style={[styles.textInput, styles.textInputMulti]}
              value={typeof currentValue === 'string' ? currentValue : ''}
              onChangeText={v => setData(d => ({ ...d, [def.key]: v }))}
              placeholder={def.placeholder}
              placeholderTextColor={DK.textDim}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
          </View>
        );

      case 'single-select': {
        const allOptions = def.options ?? [];
        const filteredOptions = def.searchable && searchQuery
          ? allOptions.filter(o => o.toLowerCase().includes(searchQuery.toLowerCase()))
          : allOptions;
        return (
          <View style={styles.card}>
            {def.searchable && (
              <View style={styles.searchInputWrap}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search..."
                  placeholderTextColor={DK.textDim}
                  autoFocus
                />
              </View>
            )}
            {filteredOptions.map((option, i) => {
              // With optionValueMap, compare stored ID; without it, compare display string.
              const storedValue = def.optionValueMap?.[option] ?? option;
              const selected = data[def.key] === storedValue;
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.selectRow,
                    i < filteredOptions.length - 1 && styles.selectRowBorder,
                    selected && styles.selectRowSelected,
                  ]}
                  onPress={() => handleSingleSelect(def.key, option)}
                >
                  <Text style={[styles.selectRowText, selected && styles.selectRowTextSelected]}>
                    {option}
                  </Text>
                  {selected
                    ? <Feather name="check" size={19} color={DK.cardFocus} />
                    : null}
                </Pressable>
              );
            })}
            {def.searchable && searchQuery.length > 0 && filteredOptions.length === 0 && (
              <Text style={styles.searchNoResults}>No matches</Text>
            )}
          </View>
        );
      }

      case 'multi-select':
        return (
          <View style={styles.card}>
            {(def.options ?? []).map((option, i) => {
              const selected = (currentValue as string[]).includes(option);
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.selectRow,
                    i < (def.options?.length ?? 0) - 1 && styles.selectRowBorder,
                    selected && styles.selectRowSelected,
                  ]}
                  onPress={() => toggleMultiSelect(def.key, option)}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected ? <Feather name="check" size={13} color="#fff" /> : null}
                  </View>
                  <Text style={[styles.selectRowText, selected && styles.selectRowTextSelected]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );

      case 'photo': {
        const photoUrl = typeof currentValue === 'string' ? currentValue || null : null;
        if (onPhotoRequest) {
          return (
            <View style={styles.card}>
              {photoUrl ? (
                <>
                  <Image source={{ uri: photoUrl }} style={styles.photoPreview} resizeMode="cover" />
                  <View style={styles.photoRetakeRow}>
                    <Pressable style={styles.photoRetakeBtn} onPress={() => onPhotoRequest('camera', def.key)}>
                      <Feather name="camera" size={15} color={DK.textMuted} />
                      <Text style={styles.photoRetakeBtnText}>Retake</Text>
                    </Pressable>
                    <Pressable style={styles.photoRetakeBtn} onPress={() => onPhotoRequest('library', def.key)}>
                      <Feather name="image" size={15} color={DK.textMuted} />
                      <Text style={styles.photoRetakeBtnText}>Library</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.photoPickRow}>
                  <Pressable style={styles.photoPickBtn} onPress={() => onPhotoRequest('camera', def.key)}>
                    <Feather name="camera" size={22} color={DK.cardFocus} />
                    <Text style={styles.photoPickBtnText}>Camera</Text>
                  </Pressable>
                  <View style={styles.photoPickDivider} />
                  <Pressable style={styles.photoPickBtn} onPress={() => onPhotoRequest('library', def.key)}>
                    <Feather name="image" size={22} color={DK.cardFocus} />
                    <Text style={styles.photoPickBtnText}>Library</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }
        return (
          <View style={styles.photoCard}>
            <PhotoPicker
              label={def.photoLabel ?? 'Photo'}
              currentUrl={photoUrl}
              onUploaded={url => handlePhotoUploaded(def.key, url)}
              onAnnotationRequest={url => handlePhotoUploaded(def.key, url)}
            />
          </View>
        );
      }

      case 'badge': {
        const badge = def.computeBadge ? def.computeBadge(data) : null;
        const colour = badge?.rating ? RATING_COLOURS[badge.rating] : DK.textMuted;
        return (
          <View style={[styles.card, styles.badgeCard]}>
            <Text style={[styles.badgeRating, { color: colour }]}>
              {badge?.rating ?? '—'}
            </Text>
            {badge?.score != null ? (
              <Text style={styles.badgeScore}>Score: {badge.score}</Text>
            ) : null}
            {isSaving
              ? <ActivityIndicator color={DK.textMuted} size="small" style={styles.badgeSavingIndicator} />
              : <Text style={styles.badgeAutoHint}>Saving…</Text>}
          </View>
        );
      }

      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.root, safeAreaStyle]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Close button */}
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color={DK.textDim} />
        </Pressable>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: dotsTotal }).map((_, i) => (
            <View key={i} style={[styles.dot, i < dotsFilled && styles.dotFilled]} />
          ))}
        </View>

        {/* Step label */}
        <Text style={styles.stepLabel}>
          {def.type !== 'badge'
            ? `STEP ${dotsFilled} OF ${dotsTotal}`
            : 'RESULT'}
        </Text>

        {/* Save error (shown when save fails on a non-badge step) */}
        {saveError && !isDone ? (
          <View style={styles.saveErrorBanner}>
            <Feather name="alert-circle" size={15} color={DK.danger} />
            <Text style={styles.saveErrorText}>{saveError}</Text>
          </View>
        ) : null}

        {/* Animated step content */}
        <Animated.View
          style={[
            styles.content,
            { opacity: opacityAnim, transform: [{ translateX: slideAnim }] },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.question}>{def.question}</Text>
            {def.subtext ? <Text style={styles.subtext}>{def.subtext}</Text> : null}

            {renderField()}

            {/* Inline suggestions */}
            {suggestions.length > 0 && (
              <View style={styles.suggestionsWrap}>
                <Text style={styles.suggestionsLabel}>SUGGESTIONS</Text>
                <View style={styles.suggestionsRow}>
                  {suggestions.map((s, i) => (
                    <Pressable
                      key={`${s.label}-${i}`}
                      style={[styles.chip, s.isLibrary && styles.chipLibrary]}
                      onPress={() => setData(d =>
                        s.apply ? { ...d, ...s.apply(d) } : { ...d, [def.key]: s.label }
                      )}
                    >
                      {s.isLibrary
                        ? <Text style={styles.chipLibraryStar}>★</Text>
                        : null}
                      <Text
                        style={[styles.chipText, s.isLibrary && styles.chipTextLibrary]}
                        numberOfLines={1}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>

        {/* Bottom navigation — hidden on badge steps (they auto-advance to save) */}
        {def.type !== 'badge' && (
          <View style={styles.nav}>
            {def.type === 'single-select' ? (
              <View style={styles.autoHintRow}>
                <Text style={styles.autoHintText}>Tap a choice to continue</Text>
              </View>
            ) : (
              <Pressable
                style={[styles.nextBtn, (!canNext || isSaving) && styles.nextBtnDisabled]}
                onPress={handleNext}
                disabled={!canNext || isSaving}
              >
                {isSaving && isLast
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={styles.nextBtnText}>{isLast ? 'Save' : 'Next'}</Text>
                      <Feather name={isLast ? 'check' : 'arrow-right'} size={20} color="#fff" />
                    </>
                }
              </Pressable>
            )}
            <View style={styles.navRow}>
              <Pressable onPress={handleBack} hitSlop={14} disabled={isSaving}>
                <Text style={[styles.backText, isSaving && styles.navDisabled]}>← Back</Text>
              </Pressable>
              {def.skippable || !def.required ? (
                <Pressable onPress={handleSkip} hitSlop={14} disabled={isSaving}>
                  <Text style={[styles.skipText, isSaving && styles.navDisabled]}>skip →</Text>
                </Pressable>
              ) : <View />}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
});

export default FocusWizardModal;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DK.bg,
    paddingHorizontal: 22,
  },
  closeBtn: {
    position: 'absolute',
    top: 54,
    right: 22,
    zIndex: 10,
    padding: 6,
  },

  // Progress
  dotsRow: {
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 52,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DK.dotEmpty,
  },
  dotFilled: {
    backgroundColor: DK.dotFilled,
  },
  stepLabel: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: DK.textDim,
    marginBottom: 28,
  },

  // Save error banner
  saveErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: DK.danger + '20',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  saveErrorText: {
    flex: 1,
    fontSize: 14,
    color: DK.danger,
    fontWeight: '500',
  },

  // Content area
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  question: {
    fontSize: 28,
    fontWeight: '700',
    color: DK.text,
    lineHeight: 36,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 15,
    color: DK.textMuted,
    lineHeight: 22,
    marginBottom: 16,
  },

  // Card container
  card: {
    backgroundColor: DK.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DK.cardBorder,
    overflow: 'hidden',
    marginTop: 4,
  },
  cardFocused: {
    borderColor: DK.cardFocus,
  },
  cardTall: {
    minHeight: 130,
  },

  // Text inputs
  textInput: {
    color: DK.text,
    fontSize: 22,
    padding: 18,
    minHeight: 60,
  },
  textInputMulti: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 16,
  },

  // Searchable select
  searchInputWrap: {
    borderBottomWidth: 1,
    borderBottomColor: DK.rowBorder,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  searchInput: {
    color: DK.text,
    fontSize: 18,
    padding: 0,
  },
  searchNoResults: {
    textAlign: 'center',
    color: DK.textDim,
    padding: 20,
    fontSize: 15,
    fontStyle: 'italic',
  },

  // Select rows
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 17,
    gap: 12,
  },
  selectRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: DK.rowBorder,
  },
  selectRowSelected: {
    backgroundColor: DK.rowSelected,
  },
  selectRowText: {
    flex: 1,
    fontSize: 18,
    color: DK.textMuted,
  },
  selectRowTextSelected: {
    color: DK.text,
    fontWeight: '600',
  },

  // Multi-select checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: DK.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: DK.cardFocus,
    borderColor: DK.cardFocus,
  },

  // Photo (PhotoPicker fallback)
  photoCard: {
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Photo (inline — used when onPhotoRequest is provided)
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
  },
  photoRetakeRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: DK.rowBorder,
  },
  photoRetakeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
  },
  photoRetakeBtnText: {
    fontSize: 15,
    color: DK.textMuted,
    fontWeight: '600',
  },
  photoPickRow: {
    flexDirection: 'row',
    paddingVertical: 28,
  },
  photoPickBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  photoPickBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: DK.cardFocus,
  },
  photoPickDivider: {
    width: 1,
    backgroundColor: DK.rowBorder,
    marginVertical: 4,
  },

  // Badge
  badgeCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 24,
  },
  badgeRating: {
    fontSize: 46,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -1,
  },
  badgeScore: {
    fontSize: 16,
    color: DK.textMuted,
    marginBottom: 18,
  },
  badgeAutoHint: {
    fontSize: 13,
    color: DK.textDim,
    fontStyle: 'italic',
  },
  badgeSavingIndicator: {
    marginTop: 4,
  },

  // Suggestions
  suggestionsWrap: {
    marginTop: 22,
  },
  suggestionsLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: DK.textDim,
    marginBottom: 10,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DK.chipBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipLibrary: {
    borderColor: '#B45309',
    backgroundColor: '#78350F18',
  },
  chipLibraryStar: {
    fontSize: 11,
    color: '#F59E0B',
  },
  chipText: {
    fontSize: 14,
    color: DK.chipText,
    maxWidth: 220,
  },
  chipTextLibrary: {
    color: '#FCD34D',
  },

  // Bottom navigation
  nav: {
    gap: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  nextBtn: {
    backgroundColor: DK.nextBtn,
    borderRadius: 14,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  nextBtnDisabled: {
    opacity: 0.35,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
  },
  autoHintRow: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoHintText: {
    fontSize: 14,
    color: DK.textDim,
    fontStyle: 'italic',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 15,
    color: DK.textDim,
  },
  skipText: {
    fontSize: 15,
    color: DK.textDim,
  },
  navDisabled: {
    opacity: 0.35,
  },

  // Success / done screen
  doneRoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: DK.text,
    marginTop: 18,
    marginBottom: 8,
  },
  doneDetail: {
    fontSize: 17,
    color: DK.textMuted,
    textAlign: 'center',
    marginBottom: 48,
    paddingHorizontal: 16,
    lineHeight: 24,
  },
  doneError: {
    fontSize: 14,
    color: DK.danger,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  doneActions: {
    width: '100%',
    gap: 12,
  },
  addAnotherBtn: {
    backgroundColor: DK.orange,
    borderRadius: 14,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  addAnotherText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: DK.nextBtn,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
  },
});
