// src/screens/CourseSetupScreen.tsx
// Create/edit a course. Saves Par/SI for holes 1–18 and locks Live Scoring to it.

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { StoredCourse } from '../storage/courseStorage';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { colors } from '../theme/colors';
import { makeDefaultCourse, isValidCourse, type Course } from '../core/course';
import {
  loadActiveCourse,
  listCourses,
  getActiveCourseId,
  upsertCourse,
  setActiveCourseId,
  deleteCourse,
  toggleFavoriteCourse,
  getCourseById,
  clearCourse,
} from '../storage/courseStorage';
import { loadRound, hasInProgressRound } from '../storage/roundStorage';
import { hapticTap, hapticSuccess, hapticError } from '../utils/feedback';
import { useToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';

export default function CourseSetupScreen() {
  const toast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [course, setCourse] = useState<Course>(() => makeDefaultCourse());
  const [loading, setLoading] = useState(true);
  const [savedCourses, setSavedCourses] = useState<StoredCourse[]>([]);
  const [activeCourseId, setActiveCourseIdState] = useState<string | null>(null);
  const [roundInProgress, setRoundInProgress] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const refreshData = useCallback(async () => {
    const [list, activeId, round] = await Promise.all([listCourses(), getActiveCourseId(), loadRound()]);
    setSavedCourses(list);
    setActiveCourseIdState(activeId);
    setRoundInProgress(hasInProgressRound(round));
    const c = await loadActiveCourse();
    setCourse(c ?? makeDefaultCourse());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        await refreshData();
        if (mounted) setLoading(false);
      })();
      return () => {
        mounted = false;
      };
    }, [refreshData])
  );

  const holesLoaded = course.holes?.length === 18;

  const { isSiInvalid, siDuplicateWarning } = useMemo(() => {
    const seen = new Map<number, number[]>();
    for (const h of course.holes) {
      const list = seen.get(h.strokeIndex) ?? [];
      list.push(h.holeNumber);
      seen.set(h.strokeIndex, list);
    }
    const dups = [...seen.entries()].filter(([, holes]) => holes.length > 1);
    const invalidHoles = new Set(
      course.holes.filter((h) => {
        const n = h.strokeIndex;
        if (!Number.isFinite(n) || n < 1 || n > 18) return true;
        const list = seen.get(n) ?? [];
        return list.length > 1;
      }).map((h) => h.holeNumber)
    );
    const isSiInvalid = (holeNumber: number) => invalidHoles.has(holeNumber);
    const warning =
      dups.length > 0
        ? dups
            .map(([si, holes]) => `SI ${si} used on holes ${holes.join(', ')}`)
            .join(' • ')
        : null;
    return { isSiInvalid, siDuplicateWarning: warning };
  }, [course]);

  const courseValid = isValidCourse(course);
  const editingActiveCourse = activeCourseId != null && course.id === activeCourseId;
  const editingLocked = roundInProgress && editingActiveCourse;

  const updateHole = (holeNumber: number, patch: Partial<{ par: number; strokeIndex: number }>) => {
    setCourse((prev) => ({
      ...prev,
      holes: prev.holes.map((h) =>
        h.holeNumber === holeNumber ? { ...h, ...patch } : h
      ),
    }));
  };

  const onSave = async () => {
    if (!isValidCourse(course)) {
      hapticError();
      Alert.alert(
        'Cannot save course',
        'Please ensure you have 18 holes, Par is set, and Stroke Index uses 1–18 uniquely.'
      );
      return;
    }
    hapticTap();
    setSaveBusy(true);
    try {
      const id = await upsertCourse(course);
      await setActiveCourseId(id);
      await refreshData();
      hapticSuccess();
      toast.show('Course saved', 'success');
    } catch (e) {
      hapticError();
      toast.show('Could not save. Try again.', 'error');
    } finally {
      setSaveBusy(false);
    }
  };

  const onReset = () => {
    setCourse(makeDefaultCourse());
  };

  const onClear = async () => {
    Alert.alert(
      'Clear all courses?',
      'This will remove all saved courses. You can add new ones from Find course.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            hapticTap();
            try {
              await clearCourse();
              setCourse(makeDefaultCourse());
              await refreshData();
              hapticSuccess();
              toast.show('Cleared', 'success');
            } catch (e) {
              hapticError();
              toast.show('Could not clear. Try again.', 'error');
            }
          },
        },
      ]
    );
  };

  const onSetActive = async (id: string) => {
    if (roundInProgress) {
      Alert.alert(
        'Round in progress',
        'Switching course may change net scoring/points for this round. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch anyway', onPress: () => doSetActive(id) },
        ]
      );
    } else {
      await doSetActive(id);
    }
  };

  const doSetActive = async (id: string) => {
    const c = await getCourseById(id);
    if (c) {
      await setActiveCourseId(id);
      setCourse(c);
      await refreshData();
    }
  };

  const onEdit = async (id: string) => {
    const c = await getCourseById(id);
    if (c) setCourse(c);
  };

  const onDelete = async (sc: StoredCourse) => {
    const isActive = activeCourseId === sc.id;
    const message =
      isActive && roundInProgress
        ? 'This course is active and may be used by the current round. Deleting it may affect scoring.'
        : 'This course will be removed from your saved list.';
    Alert.alert(
      `Delete "${sc.course.name}"?`,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            hapticTap();
            try {
              await deleteCourse(sc.id);
              if (isActive) {
                setCourse(makeDefaultCourse());
              }
              await refreshData();
              hapticSuccess();
              toast.show('Deleted', 'success');
            } catch (e) {
              hapticError();
              toast.show('Could not delete. Try again.', 'error');
            }
          },
        },
      ]
    );
  };

  const onToggleFavorite = async (id: string) => {
    await toggleFavoriteCourse(id);
    await refreshData();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Course Setup</Text>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Course Setup</Text>
        <Text style={styles.subTitle}>Set Par and Stroke Index for holes 1–18. This will lock Live Scoring.</Text>

        <View style={styles.card}>
          <View style={styles.activeBanner}>
            <View style={styles.activeBannerRow}>
              <Text style={styles.activeLabel}>Selected course</Text>
              {courseValid ? (
                <View style={styles.validBadge}><Text style={styles.validBadgeText}>Valid</Text></View>
              ) : (
                <View style={styles.invalidBadge}><Text style={styles.invalidBadgeText}>Fix SI</Text></View>
              )}
            </View>
            <Text style={styles.activeName}>{course.name}</Text>
            {holesLoaded ? (
              <Text style={styles.activeHoles}>18 holes loaded ✓</Text>
            ) : null}
            {course.holes?.length >= 9 &&
            (course.scorecardSource === 'golfcourseapi' || course.scorecardSource === 'bthree') ? (
              <Text style={styles.scorecardUpdated}>Scorecard updated from course data.</Text>
            ) : null}
            {course.strokeIndexSource === 'default' && course.scorecardSource != null && course.scorecardSource !== 'default' ? (
              <Text style={styles.siWarning}>
                Stroke Index missing. Update the Stroke Index values below and tap Save.
              </Text>
            ) : null}
            {course.holesNote ? (
              <Text style={styles.defaultedHint}>{course.holesNote} You can edit below.</Text>
            ) : null}
            {editingLocked ? (
              <View style={styles.roundInProgressBanner}>
                <Text style={styles.roundInProgressText}>Round in progress — editing course may affect scoring.</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Course name</Text>
          <TextInput
            style={[styles.input, editingLocked && styles.inputDisabled]}
            value={course.name}
            onChangeText={(v) => setCourse((p) => ({ ...p, name: v }))}
            placeholder="e.g. Woburn Marquess"
            placeholderTextColor="#999"
            editable={!editingLocked}
          />

          {siDuplicateWarning ? (
            <>
              <Text style={styles.warning}>
                Stroke Index duplicates: {siDuplicateWarning}
              </Text>
              <Text style={styles.hint}>Once SI is unique 1–18, Save Course will enable.</Text>
            </>
          ) : (
            <Text style={styles.hint}>Tip: SI should be 1–18 uniquely (1 = hardest).</Text>
          )}

          <PrimaryButton
            title="Find course (free tier)"
            onPress={() => navigation.navigate('CourseSearch')}
            variant="secondary"
            style={styles.findCourseBtn}
            textStyle={{ color: colors.primary }}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle}>Saved courses</Text>
          </View>
          {savedCourses.length === 0 ? (
            <Text style={styles.savedEmpty}>No saved courses yet. Use Find course or save the current one.</Text>
          ) : (
            <>
              {(() => {
                const favorites = savedCourses.filter((c) => c.isFavorite);
                const others = savedCourses.filter((c) => !c.isFavorite);
                const renderRow = (sc: StoredCourse) => (
                  <View key={sc.id} style={styles.savedRow}>
                    <Pressable
                      onPress={() => {
                        hapticTap();
                        onToggleFavorite(sc.id);
                      }}
                      style={({ pressed }) => [styles.starBtn, pressed && styles.btnPressed]}
                      hitSlop={8}
                    >
                      <Text style={styles.starText}>{sc.isFavorite ? '★' : '☆'}</Text>
                    </Pressable>
                    <View style={styles.savedNameWrap}>
                      <Text style={styles.savedName} numberOfLines={2}>
                        {sc.course.name}
                      </Text>
                      {activeCourseId === sc.id && (
                        <Text style={styles.activePill}>Active</Text>
                      )}
                    </View>
                    <View style={styles.savedActions}>
                      {activeCourseId !== sc.id && !roundInProgress && (
                        <Pressable
                          onPress={() => {
                            hapticTap();
                            onSetActive(sc.id);
                          }}
                          style={({ pressed }) => [styles.savedActionBtn, pressed && styles.btnPressed]}
                        >
                          <Text style={styles.savedActionText}>Set active</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => {
                          hapticTap();
                          onEdit(sc.id);
                        }}
                        style={({ pressed }) => [styles.savedActionBtn, pressed && styles.btnPressed]}
                      >
                        <Text style={styles.savedActionText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete(sc)}
                        style={({ pressed }) => [styles.savedActionBtn, styles.savedActionDanger, pressed && styles.btnPressed]}
                      >
                        <Text style={styles.savedActionDangerText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                );
                return (
                  <>
                    {favorites.length > 0 ? (
                      <>
                        <Text style={styles.sectionHeader}>Favourites</Text>
                        {favorites.map(renderRow)}
                        {others.length > 0 ? <View style={styles.sectionDivider} /> : null}
                      </>
                    ) : null}
                    {others.length > 0 ? (
                      <>
                        <Text style={styles.sectionHeader}>All courses</Text>
                        {others.map(renderRow)}
                      </>
                    ) : null}
                  </>
                );
              })()}
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.holesHeaderRow}>
            <Text style={styles.cardTitle}>Holes</Text>
            <Text style={styles.holesHelperText}>
              {editingLocked ? 'Locked during live round' : 'Adjust Par / SI as required'}
            </Text>
          </View>

          {editingLocked ? (
            <View style={styles.lockBanner}>
              <Text style={styles.lockBannerText}>
                🔒 Par and Stroke Index are locked while a round is in progress.
              </Text>
            </View>
          ) : null}

          <View style={styles.scorecardWrap}>
            <View style={[styles.scRow, styles.scHeaderRow]}>
              <View style={[styles.scCellHole, styles.scHeaderCell, styles.scHeaderDivider]}>
                <Text style={styles.scHeaderText}>Hole</Text>
              </View>
              <View style={[styles.scCellPar, styles.scHeaderCellPar, styles.scHeaderDivider]}>
                <Text style={styles.scHeaderText}>Par</Text>
              </View>
              <View style={[styles.scCellSi, styles.scHeaderCellSi]}>
                <Text style={styles.scHeaderText}>SI</Text>
              </View>
            </View>

            {course.holes.map((h, idx) => (
              <View key={h.holeNumber} style={[styles.scRow, idx % 2 === 0 ? styles.scRowAlt : null]}>
                <View style={styles.scCellHole}>
                  <Text style={styles.scHoleText}>{h.holeNumber}</Text>
                </View>

                <View style={styles.scCellPar}>
                  <TextInput
                    style={[styles.scInputPar, editingLocked && styles.inputDisabled]}
                    keyboardType="number-pad"
                    value={String(h.par)}
                    onChangeText={(v) => updateHole(h.holeNumber, { par: parseInt(v || '0', 10) })}
                    editable={!editingLocked}
                  />
                </View>

                <View style={styles.scCellSi}>
                  <TextInput
                    style={[
                      styles.scInputSi,
                      isSiInvalid(h.holeNumber) && styles.scInputSiInvalid,
                      editingLocked && styles.inputDisabled,
                    ]}
                    keyboardType="number-pad"
                    value={String(h.strokeIndex)}
                    onChangeText={(v) => updateHole(h.holeNumber, { strokeIndex: parseInt(v || '0', 10) })}
                    editable={!editingLocked}
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.actionsRow}>
            <PrimaryButton
              title="Save Course"
              onPress={onSave}
              disabled={!courseValid || editingLocked}
              loading={saveBusy}
              variant="primary"
              accessibilityLabel="Save course"
              accessibilityHint="Saves the course Par and Stroke Index for scoring"
            />
            <PrimaryButton
              title="Reset Defaults"
              onPress={() => { onReset(); toast.show('Updated', 'success', 900); }}
              variant="secondary"
            />
            <PrimaryButton
              title="Clear Saved"
              onPress={onClear}
              variant="danger"
              accessibilityLabel="Clear saved courses"
              accessibilityHint="Removes all saved courses from the list"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 6, color: colors.primary },
  subTitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  muted: { fontSize: 13, color: colors.textSecondary },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 0, color: colors.textPrimary },
  holesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  holesHelperText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  lockBanner: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  lockBannerText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.warning,
    lineHeight: 16,
  },
  cardTitleWrap: { marginBottom: 10 },

  scorecardWrap: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 14,
    overflow: 'hidden',
  },
  scRow: { flexDirection: 'row', alignItems: 'stretch' },
  scRowAlt: { backgroundColor: 'rgba(15,81,50,0.04)' },

  scHeaderRow: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.3)' },

  scCellHole: {
    width: 64,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#111',
    backgroundColor: '#fff',
  },
  scCellPar: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#111',
    backgroundColor: '#fff',
  },
  scCellSi: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },

  scHeaderCell: { backgroundColor: colors.heroSoft },
  scHeaderCellPar: { backgroundColor: colors.heroSoft },
  scHeaderCellSi: { backgroundColor: colors.heroSoft },
  scHeaderDivider: { borderRightColor: 'rgba(255,255,255,0.25)' },

  scHeaderText: {
    fontWeight: '900',
    fontSize: 14,
    color: colors.textInverse,
  },
  scHoleText: { fontWeight: '900', fontSize: 16, color: '#111' },

  scInputPar: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 10,
    paddingVertical: 10,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    backgroundColor: '#fff',
  },
  scInputSi: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 10,
    paddingVertical: 10,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    backgroundColor: '#fff',
  },
  scInputSiInvalid: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },

  activeBanner: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activeBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  activeLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '800' },
  validBadge: { backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  validBadgeText: { fontSize: 11, fontWeight: '600', color: colors.success },
  invalidBadge: { backgroundColor: colors.dangerSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  invalidBadgeText: { fontSize: 11, fontWeight: '600', color: colors.danger },
  activeName: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  activeHoles: { fontSize: 12, color: colors.success, fontWeight: '700', marginTop: 4 },
  scorecardUpdated: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
  },
  siWarning: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.warningSoft,
    color: colors.warning,
    fontWeight: '900',
    fontSize: 12,
    lineHeight: 16,
  },
  defaultedHint: { fontSize: 12, color: colors.warning, marginTop: 6, lineHeight: 17 },
  roundInProgressBanner: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.warningSoft,
  },
  roundInProgressText: { fontSize: 12, fontWeight: '800', color: colors.warning, lineHeight: 17 },

  label: { fontSize: 12, fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  inputDisabled: { backgroundColor: colors.chip, opacity: 0.8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, fontSize: 16, color: colors.textPrimary },

  hint: { marginTop: 8, fontSize: 12, color: colors.textSecondary },
  warning: { marginTop: 8, fontSize: 12, color: colors.warning, fontWeight: '900' },
  findCourseBtn: {
    marginTop: 12,
    borderColor: colors.accent,
  },

  savedEmpty: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  starBtn: { padding: 4 },
  starText: { fontSize: 18, color: colors.accent },
  savedNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  savedName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary, flex: 1 },
  activePill: { fontSize: 10, fontWeight: '800', color: colors.success, backgroundColor: colors.successSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  savedActions: { flexDirection: 'row', gap: 6 },
  savedActionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primarySoft },
  savedActionText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  savedActionDanger: { backgroundColor: colors.dangerSoft },
  savedActionDangerText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  sectionHeader: { fontSize: 12, fontWeight: '900', color: colors.textSecondary, marginBottom: 8, marginTop: 4 },
  sectionDivider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

  actionsRow: { marginTop: 12, gap: 10 },
  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  btnDisabled: { opacity: 0.5 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary },
  primaryBtnDisabled: { backgroundColor: colors.border, opacity: 0.8 },
  primaryBtnText: { color: colors.textInverse, fontWeight: '900' },
  primaryBtnTextDisabled: { color: colors.textSecondary },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: '900' },
  dangerBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.danger },
  dangerBtnText: { color: colors.textInverse, fontWeight: '900' },
});
