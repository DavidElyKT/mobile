/**
 * The digital notepad.
 *
 * Pick a job once; write notes and take photos against it all day. Nothing here
 * is a structured record — an entry names no asset, no sub-machine and no
 * hazard — because the point is to capture what was seen before there is
 * anywhere structured to put it. Filing happens at the desk, where each entry is
 * dragged into a real field.
 *
 * TWO THINGS IT HAS TO SURVIVE, both of which shaped this screen:
 *
 *   1. NO SIGNAL. Every write is local. A photo is saved to the device and
 *      queued (services/photoQueue), and the entry carries its file:// path
 *      until the queue swaps in a blob URL, so a note taken in a basement is
 *      complete the moment it is typed.
 *   2. THE APP BEING KILLED. The chosen job lives in AsyncStorage, not in
 *      component state, so coming back to the notepad — or to the app — lands
 *      on the same job, which is the difference between a notepad and a form.
 *
 * WHICH JOB IS ALREADY KNOWN most of the time. Open the notepad from a job, an
 * asset, a sub-machine, a checklist, an evaluation, a floor plan or a control
 * review and the tab sends that screen's job with it (`from_site_id`, resolved
 * by services/jobContext), so the common case is no choice at all. It beats the
 * remembered job, because the screen somebody is standing in front of is a
 * better answer than the one they last chose, and it is still only a default:
 * the bar says where the job came from and one tap changes it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/context/AuthContext';
import { useDemoMode } from '@/context/DemoModeContext';
import { useSync } from '@/context/SyncContext';
import { useQuery } from '@/db/hooks';
import CachedImage from '@/components/CachedImage';
import PhotoPicker from '@/components/PhotoPicker';
import EmptyState from '@/components/EmptyState';
import { NotepadApi } from '@/services/api';
import { enqueuePhoto } from '@/services/photoQueue';
import { filterDemoSites } from '@/utils/demoMode';
import NotepadNote, { type NotepadJobKind } from '@/db/models/NotepadNote.model';
import Site from '@/db/models/Site.model';
import CEProject from '@/db/models/CEProject.model';

const LAST_JOB_KEY = 'notepad_last_job';

/** The job an entry is filed against: one of the two spines, by local UUID. */
type JobRef = {
  kind: NotepadJobKind;
  id: string;
  /** Remembered alongside the id so the bar can label the job before the
   *  records have loaded, and still say something if the job is later purged
   *  from this device. */
  label: string;
  sub: string;
};

/** A row in the picker: a job plus the two fields it is ordered by. */
type JobCandidate = JobRef & { status: string; date: string };

function jobLabel(projectNumber: string | null | undefined, kind: NotepadJobKind): string {
  const number = (projectNumber ?? '').trim();
  const prefix = kind === 'ce' ? 'CE' : '';
  if (!number) return prefix ? `${prefix} job` : 'Job';
  return prefix ? `${prefix} ${number}` : number;
}

function formatWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function NotepadScreen() {
  const db = useDatabase();
  const { getAccessToken } = useAuth();
  const { isDemoMode } = useDemoMode();
  const { triggerSync } = useSync();

  // Sent by the notepad tab when it was pressed on a screen that belongs to a
  // job. Absent everywhere else, which is the signal to fall back.
  const { from_site_id: fromSiteId } = useLocalSearchParams<{ from_site_id?: string }>();

  const [job, setJob] = useState<JobRef | null>(null);
  const [jobRestored, setJobRestored] = useState(false);
  /** True while the job on show was picked by the screen rather than the user. */
  const [jobFromScreen, setJobFromScreen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Both groups start shut. Two headers and nothing else is the whole picker
  // on opening, which is the only view that fits on a phone when a device is
  // carrying dozens of jobs — and it makes choosing the WRONG spine an action
  // rather than a mis-tap on a list that scrolled.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // Finished jobs are hidden inside each group until asked for.
  const [completedSections, setCompletedSections] = useState<Record<string, boolean>>({});

  const [body, setBody] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // The un-annotated copy, set only when the assessor actually drew on the
  // photo. Annotation flattens the strokes into `photoUri`, so this is the only
  // clean image left; null means it was never drawn on.
  const [photoOriginalUri, setPhotoOriginalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<NotepadNote | null>(null);
  const [editText, setEditText] = useState('');

  const toggleSection = useCallback((kind: NotepadJobKind) => {
    setOpenSections(prev => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  const toggleCompleted = useCallback((kind: NotepadJobKind) => {
    setCompletedSections(prev => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  // A search opens both groups: typing a project number into a picker that
  // then shows two shut headers and no result is the one way this could waste
  // somebody's time.
  const searching = search.trim().length > 0;
  const isSectionOpen = useCallback(
    (kind: NotepadJobKind) => searching || !!openSections[kind],
    [searching, openSections],
  );
  // A search reaches finished work too — somebody typing a project number
  // knows which job they want, and being told it does not exist because it
  // closed last month would be a lie.
  const areCompletedShown = useCallback(
    (kind: NotepadJobKind) => searching || !!completedSections[kind],
    [searching, completedSections],
  );

  // Shut again on the way out, so the picker opens the same way every time.
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setSearch('');
    setOpenSections({});
    setCompletedSections({});
  }, []);

  const chooseJob = useCallback((next: JobRef) => {
    setJob(next);
    // A choice made here is the user's; the auto-select path re-flags itself
    // immediately after, in the same render.
    setJobFromScreen(false);
    closePicker();
    void AsyncStorage.setItem(LAST_JOB_KEY, JSON.stringify(next)).catch(() => undefined);
  }, [closePicker]);

  // ── The job this opening lands on ─────────────────────────────────────────
  // The screen it was opened from first, the remembered job second. One effect
  // rather than two, because two would race: the AsyncStorage read resolving
  // after the lookup would put yesterday's job back on top of the one the
  // assessor is standing in front of.
  //
  // The screen's job is written to storage like any other choice, so leaving
  // the asset and opening the notepad from the home screen stays on it.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (fromSiteId) {
        const site = await db.get<Site>('sites').find(fromSiteId).catch(() => null);
        if (cancelled) return;
        if (site) {
          chooseJob({
            kind: 'puwer',
            id: site.id,
            label: jobLabel(site.projectNumber, 'puwer'),
            sub: site.customer,
          });
          setJobFromScreen(true);
          setJobRestored(true);
          return;
        }
      }

      const raw = await AsyncStorage.getItem(LAST_JOB_KEY).catch(() => null);
      if (cancelled) return;
      if (raw) {
        try { setJob(JSON.parse(raw) as JobRef); } catch { /* corrupt: choose again */ }
      }
      setJobRestored(true);
    })();

    return () => { cancelled = true; };
  }, [fromSiteId, db, chooseJob]);

  // ── The two job spines ────────────────────────────────────────────────────
  const sites = useQuery<Site>(
    db.get<Site>('sites').query(Q.sortBy('date', Q.desc)),
    [],
  );
  const ceProjects = useQuery<CEProject>(
    db.get<CEProject>('ce_projects').query(Q.sortBy('date', Q.desc)),
    [],
  );

  // The picker, in two sections — PUWER work and CE marking work.
  //
  // Grouped rather than interleaved because the two are different jobs for the
  // same customer, often at the same site and sometimes numbered alike: a flat
  // list ordered by date puts them next to each other with nothing but a chip
  // between them, and filing a day of notes against the wrong one is not
  // something the notepad would ever show you.
  const jobSections = useMemo<{
    kind: NotepadJobKind;
    title: string;
    active: JobCandidate[];
    completed: JobCandidate[];
  }[]>(() => {
    const term = search.trim().toLowerCase();
    const matches = (job: JobCandidate) =>
      !term || `${job.label} ${job.sub}`.toLowerCase().includes(term);

    // Most recent first: the job being worked today is nearly always one of
    // the first few.
    const byDate = (a: JobCandidate, b: JobCandidate) => b.date.localeCompare(a.date);

    const puwer: JobCandidate[] = filterDemoSites(sites, isDemoMode).map(site => ({
      kind: 'puwer',
      id: site.id,
      label: jobLabel(site.projectNumber, 'puwer'),
      sub: site.customer,
      status: site.status ?? 'Active',
      date: site.date ?? '',
    }));
    // Demo mode hides everything but the demo customer's work, and there is no
    // demo CE job, so the CE section simply drops out of the picker.
    const ce: JobCandidate[] = isDemoMode ? [] : ceProjects.map(project => ({
      kind: 'ce',
      id: project.id,
      label: jobLabel(project.projectNumber, 'ce'),
      sub: project.customer,
      status: project.status ?? 'Active',
      date: project.date ?? '',
    }));

    // Finished work is split off rather than sorted to the bottom. A device
    // that has been in service a year carries far more closed jobs than open
    // ones, and notes are only ever taken against work that is still running —
    // but not NEVER: a job closed this morning can still want a note, so they
    // are one tap away rather than gone.
    const section = (kind: NotepadJobKind, title: string, jobs: JobCandidate[]) => {
      const visible = jobs.filter(matches).sort(byDate);
      return {
        kind,
        title,
        active: visible.filter(job => job.status === 'Active'),
        completed: visible.filter(job => job.status !== 'Active'),
      };
    };

    return [
      section('puwer', 'PUWER jobs', puwer),
      section('ce', 'CE marking jobs', ce),
    ].filter(s => s.active.length + s.completed.length > 0);
  }, [sites, ceProjects, isDemoMode, search]);

  const jobCount = jobSections.reduce(
    (total, section) => total + section.active.length + section.completed.length,
    0,
  );

  // ── This job's entries ────────────────────────────────────────────────────
  // Deps are explicit: the query is rebuilt when the job changes, and without
  // them the hook would keep the first job's subscription forever.
  const notes = useQuery<NotepadNote>(
    db.get<NotepadNote>('notepad_notes').query(
      ...(job
        ? [Q.where(job.kind === 'puwer' ? 'site_id' : 'ce_project_id', job.id)]
        : [Q.where('id', '')]),
      Q.sortBy('captured_at', Q.desc),
    ),
    [job?.kind, job?.id],
  );

  const canSave = !!job && (body.trim().length > 0 || !!photoUri) && !saving;

  async function handleSave() {
    if (!job || !canSave) return;
    setSaving(true);
    try {
      const capturedAt = new Date().toISOString();
      const created = await db.write(async () =>
        db.get<NotepadNote>('notepad_notes').create(note => {
          note.jobKind = job.kind;
          note.siteId = job.kind === 'puwer' ? job.id : null;
          note.ceProjectId = job.kind === 'ce' ? job.id : null;
          note.body = body.trim() || null;
          note.photoUrl = photoUri;
          note.photoOriginalUrl = photoOriginalUri;
          note.capturedAt = capturedAt;
          note.isSynced = false;
        }),
      );

      // The photo goes up on the next sync and the blob URL is written back
      // onto this record. Until then the entry holds the file:// path, which is
      // what makes the note complete offline.
      if (photoUri?.startsWith('file://')) {
        await enqueuePhoto({
          localUri: photoUri,
          collection: 'notepad_notes',
          recordId: created.id,
          field: 'photo_url',
        });
      }

      // A second, independent upload. It is in DEFERRABLE_PHOTO_FIELDS, so a
      // failure here delays the clean copy without holding the note itself off
      // the desk, and the server column is write-once so a late arrival still
      // wins.
      if (photoOriginalUri?.startsWith('file://')) {
        await enqueuePhoto({
          localUri: photoOriginalUri,
          collection: 'notepad_notes',
          recordId: created.id,
          field: 'photo_original_url',
        });
      }

      setBody('');
      setPhotoUri(null);
      setPhotoOriginalUri(null);
      // Best effort: a sync that cannot run leaves the entry pending, which is
      // the normal offline state and not an error worth showing.
      void triggerSync();
    } catch (e: any) {
      Alert.alert('Could not save note', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Which photo the original belongs to matters as much as keeping it.
   *
   * The four cases are the same ones risk-evaluations/edit.tsx works through,
   * and they are not interchangeable: the wrong branch either throws away a
   * clean copy or keeps one that shows a different scene entirely.
   */
  function handlePhotoUploaded(uri: string, originalUri?: string) {
    const previousPhoto = photoUri;
    setPhotoUri(uri);

    if (uri === previousPhoto) {
      // Skip pressed on the photo already in the composer. Nothing changed.
      return;
    }
    if (!originalUri) {
      // A fresh capture, left un-annotated. Any original held from the photo it
      // replaced is of a different subject now, so it has to go.
      setPhotoOriginalUri(null);
      return;
    }
    if (originalUri === previousPhoto) {
      // Re-annotating what is already in the composer. That image may itself be
      // annotated, so the clean copy taken the FIRST time is the one to keep —
      // the same write-once rule the server applies on push.
      setPhotoOriginalUri(prev => prev ?? originalUri);
      return;
    }
    // A fresh capture, annotated. Its own clean version is the original.
    setPhotoOriginalUri(originalUri);
  }

  function handleEdit(note: NotepadNote) {
    setEditing(note);
    setEditText(note.body ?? '');
  }

  async function handleEditSave() {
    if (!editing) return;
    const next = editText.trim();
    if (!next && !editing.photoUrl) {
      Alert.alert('Nothing to keep', 'A note needs text, a photo, or both.');
      return;
    }
    try {
      await db.write(async () => {
        await editing.update(note => {
          note.body = next || null;
          note.isSynced = false;
        });
      });
      setEditing(null);
      void triggerSync();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? String(e));
    }
  }

  function handleDelete(note: NotepadNote) {
    Alert.alert('Delete note', 'This removes the note from the notepad everywhere.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // A note the server has never seen is local business. One it has must
          // be deleted there too, or the next pull hands it straight back.
          if (note.serverId) {
            const token = await getAccessToken();
            if (!token) {
              Alert.alert(
                'Delete unavailable',
                'You appear to be offline. Try again once this device is back on the network.',
              );
              return;
            }
            try {
              await NotepadApi.delete(token, note.serverId);
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message ?? 'Could not delete on the server.');
              return;
            }
          }
          await db.write(async () => { await note.destroyPermanently(); });
        },
      },
    ]);
  }

  if (!jobRestored) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={Colors.primary} />;
  }

  return (
    <View style={styles.screen}>
      {/* The job bar. Pinned above everything, because which job a note lands
          on is the one thing that must never be guessed at. */}
      <Pressable style={styles.jobBar} onPress={() => setPickerOpen(true)}>
        <View style={styles.jobBarText}>
          <Text style={styles.jobBarLabel}>
            {job ? (jobFromScreen ? 'Notes for · from this screen' : 'Notes for') : 'Choose a job'}
          </Text>
          <Text style={styles.jobBarValue} numberOfLines={1}>
            {job ? `${job.label} · ${job.sub}` : 'No job selected'}
          </Text>
        </View>
        <Feather name="chevron-down" size={20} color="#fff" />
      </Pressable>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {job ? (
          <>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={body}
                onChangeText={setBody}
                placeholder="What did you see?"
                placeholderTextColor={Colors.textLight}
                multiline
              />
              {/* onAnnotationRequest is NOT passed, so the pencil opens the
                  annotation modal for real. The composer is plain screen
                  content, not a Modal, so there is no nested-Modal problem to
                  dodge here. Annotation flattens, so handlePhotoUploaded keeps
                  the clean copy in photoOriginalUri (schema v17 /
                  migration 056). */}
              <PhotoPicker
                label="Add photo"
                currentUrl={photoUri}
                onUploaded={handlePhotoUploaded}
              />
              <View style={styles.composerActions}>
                {photoUri ? (
                  <Pressable
                    style={styles.clearPhotoBtn}
                    onPress={() => { setPhotoUri(null); setPhotoOriginalUri(null); }}
                  >
                    <Feather name="x" size={14} color={Colors.textMuted} />
                    <Text style={styles.clearPhotoText}>Remove photo</Text>
                  </Pressable>
                ) : <View />}
                <Pressable
                  style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={!canSave}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="plus" size={16} color="#fff" />}
                  <Text style={styles.saveBtnText}>Add to notepad</Text>
                </Pressable>
              </View>
            </View>

            {notes.length === 0 ? (
              <EmptyState
                icon="edit-3"
                message="Nothing on this job's notepad yet. Notes and photos appear here, newest first."
              />
            ) : (
              notes.map(note => (
                <View key={note.id} style={[styles.note, !!note.usedAt && styles.noteUsed]}>
                  {note.photoUrl ? (
                    <CachedImage uri={note.photoUrl} style={styles.notePhoto} />
                  ) : null}
                  {note.body ? <Text style={styles.noteBody}>{note.body}</Text> : null}
                  <View style={styles.noteFooter}>
                    <Text style={styles.noteWhen}>{formatWhen(note.capturedAt)}</Text>
                    {!note.isSynced ? (
                      <View style={styles.badgePending}>
                        <Feather name="upload-cloud" size={11} color={Colors.warning} />
                        <Text style={styles.badgePendingText}>Pending</Text>
                      </View>
                    ) : null}
                    {note.usedAt ? (
                      <View style={styles.badgeUsed}>
                        <Feather name="check" size={11} color={Colors.success} />
                        <Text style={styles.badgeUsedText}>Written up</Text>
                      </View>
                    ) : null}
                    <View style={styles.noteActions}>
                      <Pressable onPress={() => handleEdit(note)} hitSlop={8}>
                        <Feather name="edit-2" size={16} color={Colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => handleDelete(note)} hitSlop={8}>
                        <Feather name="trash-2" size={16} color={Colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <EmptyState
            icon="briefcase"
            message="Every note belongs to a job. Choose one at the top and it stays selected until you change it."
            actionLabel="Choose a job"
            onAction={() => setPickerOpen(true)}
          />
        )}
      </ScrollView>

      {/* Job picker */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={closePicker}>
        <View style={styles.pickerScreen}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Choose a job</Text>
            <Pressable onPress={closePicker} hitSlop={10}>
              <Feather name="x" size={22} color={Colors.text} />
            </Pressable>
          </View>
          <TextInput
            style={styles.pickerSearch}
            value={search}
            onChangeText={setSearch}
            placeholder="Search project number or customer"
            placeholderTextColor={Colors.textLight}
            autoCorrect={false}
          />
          <ScrollView contentContainerStyle={styles.pickerList} keyboardShouldPersistTaps="handled">
            {jobCount === 0 ? (
              <Text style={styles.pickerEmpty}>
                {search.trim()
                  ? 'No job matches that.'
                  : 'No jobs on this device yet. Sync while online and try again.'}
              </Text>
            ) : (
              jobSections.map(section => {
                const sectionOpen = isSectionOpen(section.kind);
                const completedShown = areCompletedShown(section.kind);
                const rows = completedShown
                  ? [...section.active, ...section.completed]
                  : section.active;
                return (
                <View key={section.kind} style={styles.pickerSection}>
                  <Pressable
                    style={styles.pickerSectionHeader}
                    onPress={() => toggleSection(section.kind)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: sectionOpen }}
                  >
                    <Feather
                      name={section.kind === 'ce' ? 'award' : 'clipboard'}
                      size={17}
                      color={section.kind === 'ce' ? NOTEPAD_INDIGO : Colors.primary}
                    />
                    <Text style={styles.pickerSectionTitle}>{section.title}</Text>
                    {/* Open jobs only: the number has to mean the same thing
                        as the list under it. */}
                    <Text style={styles.pickerSectionCount}>{section.active.length}</Text>
                    <Feather
                      name={sectionOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Colors.textMuted}
                    />
                  </Pressable>
                  {sectionOpen && rows.map(candidate => (
                    <Pressable
                      key={`${candidate.kind}:${candidate.id}`}
                      style={styles.pickerRow}
                      onPress={() => chooseJob({
                        kind: candidate.kind,
                        id: candidate.id,
                        label: candidate.label,
                        sub: candidate.sub,
                      })}
                    >
                      <View style={styles.pickerRowText}>
                        <Text style={styles.pickerRowTitle}>{candidate.label}</Text>
                        <Text style={styles.pickerRowSub} numberOfLines={1}>{candidate.sub}</Text>
                      </View>
                      {candidate.status !== 'Active' ? (
                        <Text style={styles.pickerRowStatus}>{candidate.status}</Text>
                      ) : null}
                      {job && job.kind === candidate.kind && job.id === candidate.id ? (
                        <Feather name="check" size={18} color={Colors.primary} />
                      ) : null}
                    </Pressable>
                  ))}
                  {sectionOpen && rows.length === 0 ? (
                    <Text style={styles.pickerSectionEmpty}>
                      {section.completed.length
                        ? 'Nothing open here.'
                        : 'Nothing here.'}
                    </Text>
                  ) : null}
                  {/* The way back to finished work: one tap, in the group it
                      belongs to, so a job closed this morning is never lost —
                      just out of the way. */}
                  {sectionOpen && section.completed.length > 0 ? (
                    <Pressable
                      style={styles.pickerShowCompleted}
                      onPress={() => toggleCompleted(section.kind)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: completedShown }}
                    >
                      <Feather
                        name={completedShown ? 'eye-off' : 'eye'}
                        size={15}
                        color={Colors.textMuted}
                      />
                      <Text style={styles.pickerShowCompletedText}>
                        {completedShown
                          ? 'Hide completed jobs'
                          : `Show ${section.completed.length} completed job${section.completed.length === 1 ? '' : 's'}`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Edit one note's text */}
      <Modal visible={!!editing} animationType="fade" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.editBackdrop}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit note</Text>
            <TextInput
              style={[styles.input, styles.editInput]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable style={styles.editCancel} onPress={() => setEditing(null)}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.editSave} onPress={handleEditSave}>
                <Text style={styles.editSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const NOTEPAD_INDIGO = '#4338CA';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  jobBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: NOTEPAD_INDIGO,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  jobBarText: { flex: 1 },
  jobBarLabel: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  jobBarValue: { color: '#fff', fontSize: 17, fontWeight: '700' },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 14, paddingBottom: 40 },

  composer: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: Colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
    backgroundColor: Colors.background,
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  clearPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearPhotoText: { color: Colors.textMuted, fontSize: 13 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: NOTEPAD_INDIGO,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  note: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  noteUsed: { opacity: 0.55 },
  notePhoto: { width: '100%', height: 180, borderRadius: 10, backgroundColor: Colors.background },
  noteBody: { fontSize: 16, color: Colors.text, lineHeight: 22 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteWhen: { fontSize: 12, color: Colors.textLight },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warning + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgePendingText: { fontSize: 11, color: Colors.warning, fontWeight: '700' },
  badgeUsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeUsedText: { fontSize: 11, color: Colors.success, fontWeight: '700' },
  noteActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginLeft: 'auto' },

  pickerScreen: { flex: 1, backgroundColor: Colors.background },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    paddingTop: 24,
  },
  pickerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  pickerSearch: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  pickerList: { paddingHorizontal: 18, paddingBottom: 30, gap: 8 },
  pickerEmpty: { color: Colors.textMuted, fontSize: 14, paddingVertical: 20 },
  pickerSection: { gap: 8, marginBottom: 12 },
  pickerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  // Same size and weight as a job row's title: a shut group is the thing being
  // read here, not a label over a list, so shrinking it into a caption would
  // make the only visible text on the screen the smallest text on the screen.
  pickerSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  pickerSectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    marginLeft: 'auto',
  },
  pickerSectionEmpty: {
    fontSize: 14,
    color: Colors.textMuted,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  pickerShowCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  pickerShowCompletedText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  pickerRowStatus: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textLight,
    textTransform: 'uppercase',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  pickerRowText: { flex: 1 },
  pickerRowTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pickerRowSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  editBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center',
    padding: 22,
  },
  editCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    gap: 14,
  },
  editTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  editInput: { minHeight: 120 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  editCancel: { paddingHorizontal: 16, paddingVertical: 11 },
  editCancelText: { color: Colors.textMuted, fontWeight: '700' },
  editSave: {
    backgroundColor: NOTEPAD_INDIGO,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
  },
  editSaveText: { color: '#fff', fontWeight: '700' },
});
