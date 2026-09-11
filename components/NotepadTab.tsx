/**
 * The digital notepad, reachable from every screen: a small tab on the right
 * edge, level with the middle of the screen.
 *
 * WHY NOT A HEADER ICON. Six of the screens that matter most — a job, an asset,
 * a sub-machine, an evaluation, a checklist, a floor plan — already own
 * `headerRight` through navigation.setOptions, and each clears it again in demo
 * mode. A global header button would be silently overridden on exactly the
 * screens somebody is standing in front of a machine looking at.
 *
 * WHY THE EDGE, AND NOT A CORNER. Both bottom corners are taken. Bottom right
 * is the primary FAB on the project list, a job, an asset, a sub-machine and the
 * admin review; the bottom edge is a full-width action bar on a checklist
 * ("Mark as Complete"). The middle of the right edge is the one place that is
 * never an action and never text — list cards stop 14–29px short of it — so a
 * 30px tab there covers card margin rather than content.
 *
 * Rendered once in app/(app)/_layout.tsx, above the whole stack, so no screen
 * has to know it exists — including screens that do not exist yet.
 *
 * WHAT IT CARRIES ACROSS. The screen being left nearly always belongs to a job,
 * so the tab works that out from the route (services/jobContext) and hands it
 * to the notepad, which selects it. Screens stay ignorant: the router knows
 * where we are, which is why this is done here and not by each screen
 * publishing its job into a context and one of them forgetting to.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Feather } from '@expo/vector-icons';
import { resolveScreenSiteId } from '@/services/jobContext';

const NOTEPAD_INDIGO = '#4338CA';

export default function NotepadTab() {
  const router = useRouter();
  const db = useDatabase();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  // The job of the screen being left, resolved at the moment of the press
  // rather than on every render: this is two SQLite reads on a screen that
  // re-renders whenever anything under it changes, and nothing on the tab
  // itself depends on the answer.
  //
  // The notepad decides what to do with it — an unresolvable screen (home, the
  // project list, settings) sends nothing and leaves the last chosen job
  // alone.
  async function openNotepad() {
    let siteId: string | null = null;
    try {
      siteId = await resolveScreenSiteId(db, pathname, params);
    } catch {
      // Guessing the job is a convenience; failing to guess it must never be
      // the reason the notepad does not open.
    }
    router.push({
      pathname: '/(app)/notepad',
      params: siteId ? { from_site_id: siteId } : {},
    } as any);
  }

  // Not on the notepad itself, and not over the photo annotation canvas, where
  // every pixel is being drawn on.
  if (pathname?.startsWith('/notepad')) return null;

  return (
    // box-none: the wrapper spans nothing but its child, and taps anywhere but
    // the tab still reach the screen underneath.
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => { void openNotepad(); }}
        style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel="Open the digital notepad"
      >
        <Feather name="edit-3" size={17} color="#fff" />
        <View style={styles.grip} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 0,
    // Level with the middle of the screen rather than a fixed offset, so it
    // lands in the same place on a phone and on a tablet.
    top: '44%',
    zIndex: 40,
  },
  tab: {
    width: 30,
    height: 74,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: NOTEPAD_INDIGO,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    // Deliberately not fully opaque: it sits over lists and photos, and a
    // little of what is underneath showing through is what keeps it from
    // reading as part of the content.
    opacity: 0.9,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: -2, height: 1 },
    elevation: 5,
  },
  tabPressed: { opacity: 1, width: 34 },
  // A grip line under the icon, so the tab reads as something to press rather
  // than as a status light.
  grip: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
