import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { useQuery, useRecord } from '@/db/hooks';
import { useAuth } from '@/context/AuthContext';
import { useControlReview } from '@/context/ControlReviewContext';
import ControlReviewVerdictCard from '@/components/ControlReviewVerdictCard';
import { buildReviewContexts, sortReviewContexts } from '@/services/controlReviewOrder';
import { Colors } from '@/constants/Colors';
import ControlReview from '@/db/models/ControlReview.model';
import ControlReviewRound from '@/db/models/ControlReviewRound.model';
import RiskEvaluation from '@/db/models/RiskEvaluation.model';
import Assembly from '@/db/models/Assembly.model';
import Machine from '@/db/models/Machine.model';
import CachedImage from '@/components/CachedImage';

const ACCENT = '#0F766E';
const CONTROL_REVIEW_ROLES = ['Administrator', 'Assessor'];

/**
 * One verdict, on its own screen.
 *
 * It used to be a card inside a bottom-sheet Modal on the worklist, paged
 * horizontally. That is what made typing unusable: the sheet is a fixed 93% of
 * the screen inside a Modal window that Android resizes when the keyboard
 * opens, so the moment a field took focus the card was pushed out from under
 * the assessor — and a Modal torn down while a TextInput inside it holds focus
 * leaves a dead touch layer behind, which is why nothing responded afterwards.
 *
 * A real route has none of those problems: the navigator resizes properly, the
 * keyboard behaves, and there is exactly one Modal on screen at a time (the
 * lightbox), so the photo picker's own annotation Modal works normally too.
 *
 * Prev/next walk the round's worklist in the ONE ordering defined by
 * services/controlReviewOrder, which is the same ordering the list screen uses.
 */
export default function ControlReviewVerdictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDatabase();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { enterControlReview } = useControlReview();

  const review = useRecord<ControlReview>(db.get<ControlReview>('control_reviews'), id);
  const round = useRecord<ControlReviewRound>(
    db.get<ControlReviewRound>('control_review_rounds'),
    review?.roundId,
  );

  // The whole round, so prev/next and "3 of 40" are answerable without the
  // list screen being alive behind this one.
  const roundReviews = useQuery<ControlReview>(
    db.get<ControlReview>('control_reviews').query(Q.where('round_id', review?.roundId ?? '')),
    [review?.roundId],
  );
  const evaluations = useQuery<RiskEvaluation>(
    db.get<RiskEvaluation>('risk_evaluations').query(
      roundReviews.length > 0
        ? Q.where('id', Q.oneOf(roundReviews.map(r => r.evalId).filter(Boolean)))
        : Q.where('id', ''),
    ),
    [roundReviews.map(r => r.evalId).join(',')],
  );
  const assemblies = useQuery<Assembly>(
    db.get<Assembly>('assemblies').query(Q.where('site_id', round?.siteId ?? '')),
    [round?.siteId],
  );
  const machines = useQuery<Machine>(
    db.get<Machine>('machines').query(
      assemblies.length > 0
        ? Q.where('assembly_id', Q.oneOf(assemblies.map(a => a.id)))
        : Q.where('assembly_id', ''),
    ),
    [assemblies.map(a => a.id).join(',')],
  );

  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const canReview = !!user && CONTROL_REVIEW_ROLES.includes(user.role);

  useEffect(() => {
    if (user && !canReview) router.replace('/(app)/home');
  }, [user?.role]);

  useEffect(() => {
    if (round?.siteId) enterControlReview(round.siteId, round.id);
  }, [round?.siteId, round?.id]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const ordered = useMemo(
    () => sortReviewContexts(buildReviewContexts(roundReviews, evaluations, assemblies, machines)),
    [roundReviews, evaluations, assemblies, machines],
  );

  const index = ordered.findIndex(i => i.review.id === id);
  const current = index >= 0 ? ordered[index] : null;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < ordered.length - 1;
  const reviewedCount = ordered.filter(i => i.review.outcome != null).length;

  useEffect(() => {
    navigation.setOptions({
      title: index >= 0 ? `${index + 1} of ${ordered.length}` : 'Verdict',
    });
  }, [index, ordered.length]);

  function goTo(delta: number) {
    const next = ordered[index + delta];
    if (!next) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    router.replace(`/(app)/control-review/verdict/${next.review.id}`);
  }

  /**
   * Save is not a quiet acknowledgement any more: it moves the assessor to the
   * next control, which is the feedback. Only the last item in the round has
   * nowhere to go, so it says so and returns to the worklist.
   */
  function handleSaved() {
    if (hasNext) {
      goTo(1);
      return;
    }
    setSavedToast('Saved — that was the last item in this round.');
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => router.back(), 1400);
  }

  if (!canReview) return null;

  if (!review || !current) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.centeredText}>Loading verdict…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Position strip — where in the round this is, and the way out */}
      <View style={styles.navStrip}>
        <Pressable
          style={[styles.navBtn, !hasPrev && styles.navBtnDisabled]}
          onPress={() => goTo(-1)}
          disabled={!hasPrev}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={22} color={hasPrev ? '#fff' : 'rgba(255,255,255,0.35)'} />
          <Text style={[styles.navBtnText, !hasPrev && styles.navBtnTextDisabled]}>Prev</Text>
        </Pressable>

        <View style={styles.navCentre}>
          <Text style={styles.navCounter}>{index + 1} of {ordered.length}</Text>
          <Text style={styles.navProgress}>{reviewedCount} reviewed</Text>
        </View>

        <Pressable
          style={[styles.navBtn, !hasNext && styles.navBtnDisabled]}
          onPress={() => goTo(1)}
          disabled={!hasNext}
          hitSlop={8}
        >
          <Text style={[styles.navBtnText, !hasNext && styles.navBtnTextDisabled]}>Next</Text>
          <Feather name="chevron-right" size={22} color={hasNext ? '#fff' : 'rgba(255,255,255,0.35)'} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ControlReviewVerdictCard
          key={review.id}
          review={review}
          evaluation={current.evaluation}
          assetName={current.assemblyName}
          subMachineName={current.machineName}
          onOpenPhoto={uri => setLightboxUri(uri)}
          saveLabel={hasNext ? 'Save & next control' : 'Save & finish'}
          onSaved={handleSaved}
        />
      </ScrollView>

      {savedToast ? (
        <View style={styles.toast}>
          <Feather name="check-circle" size={17} color="#fff" />
          <Text style={styles.toastText}>{savedToast}</Text>
        </View>
      ) : null}

      <Modal
        visible={!!lightboxUri}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
        statusBarTranslucent
      >
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxUri(null)}>
          <CachedImage uri={lightboxUri} style={styles.lightboxImage} resizeMode="contain" />
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <Feather name="x" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centeredText: { fontSize: 16, color: Colors.textMuted },

  navStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: ACCENT, paddingHorizontal: 8, paddingVertical: 9,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4 },
  navBtnDisabled: { opacity: 0.9 },
  navBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  navBtnTextDisabled: { color: 'rgba(255,255,255,0.35)' },
  navCentre: { alignItems: 'center' },
  navCounter: { color: '#fff', fontSize: 16, fontWeight: '800' },
  navProgress: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 1 },

  toast: {
    position: 'absolute', left: 20, right: 20, bottom: 30,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 15, paddingVertical: 13,
  },
  toastText: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },

  lightboxBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center',
  },
  lightboxImage: { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 50, right: 22, padding: 8 },
});
