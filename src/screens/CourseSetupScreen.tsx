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
import { makeDefaultCourse, isValidCourse, type Course, type CourseTee } from '../core/course';
import { hasMissingStrokeIndex } from '../utils/courseValidation';
import StrokeIndexWarningBanner from '../components/StrokeIndexWarningBanner';
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
import { exportCourseToJsonFile } from '../storage/courseJsonExport';
import { buildCourseImportPreviewMessage, pickAndReadCourseJson } from '../storage/courseJsonImport';
import type { ImportedCourseResult } from '../storage/courseJsonImport';
import { loadCurrentRound, hasInProgressRound } from '../storage/roundStorage';
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

  const DEFAULT_TEES: CourseTee[] = [
    { name: 'White', par: 72, courseRating: 72, slopeRating: 113 },
    { name: 'Yellow', par: 72, courseRating: 72, slopeRating: 113 },
    { name: 'Red', par: 72, courseRating: 72, slopeRating: 113 },
  ];

  function withDefaultTees(next: Course): Course {
    if (Array.isArray(next.tees) && next.tees.length > 0) return next;
    return { ...next, tees: DEFAULT_TEES };
  }

  function validateTees(tees: CourseTee[]): string | null {
    if (!tees.length) return 'Add at least one tee.';
    for (const tee of tees) {
      if (!Number.isFinite(tee.par) || tee.par < 54 || tee.par > 90) {
        return `${tee.name}: invalid par`;
      }
      if (!Number.isFinite(tee.courseRating) || tee.courseRating <= 0) {
        return `${tee.name}: invalid course rating`;
      }
      if (!Number.isFinite(tee.slopeRating) || tee.slopeRating < 55 || tee.slopeRating > 155) {
        return `${tee.name}: invalid slope rating`;
      }
    }
    return null;
  }

  function updateTeeField(
    teeIndex: number,
    field: 'par' | 'courseRating' | 'slopeRating',
    raw: string
  ) {
    const asNumber = Number(raw.replace(',', '.'));
    const nextValue = Number.isFinite(asNumber) ? asNumber : 0;

    setCourse((prev) => ({
      ...prev,
      tees: (prev.tees ?? DEFAULT_TEES).map((tee, index) =>
        index === teeIndex
          ? {
              ...tee,
              [field]: field === 'courseRating' ? nextValue : Math.round(nextValue),
            }
          : tee
      ),
    }));
  }

  const refreshData = useCallback(async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 2500)
    );
    try {
      const work = async () => {
        const [list, activeId, round] = await Promise.all([
          listCourses(),
          getActiveCourseId(),
          loadCurrentRound(),
        ]);
        setSavedCourses(list);
        setActiveCourseIdState(activeId);
        setRoundInProgress(hasInProgressRound(round));
        const c = await loadActiveCourse();
        setCourse(c && c.holes?.length === 18 ? withDefaultTees(c) : makeDefaultCourse());
      };
      await Promise.race([work(), timeoutPromise]);
    } catch {
      setSavedCourses([]);
      setActiveCourseIdState(null);
      setRoundInProgress(false);
      setCourse(makeDefaultCourse());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      (async () => {
        try {
          await refreshData();
        } catch {
          if (mounted) setCourse(makeDefaultCourse());
        } finally {
          if (mounted) setLoading(false);
        }
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

  const teeValidationError = useMemo(() => validateTees(course.tees ?? []), [course.tees]);
  const courseValid = isValidCourse(course) && !teeValidationError;
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
    if (!isValidCourse(course) || teeValidationError) {
      hapticError();
      Alert.alert(
        'Cannot save course',
        teeValidationError ??
          'Please ensure you have 18 holes, Par is set, and Stroke Index uses 1–18 uniquely.'
      );
      return;
    }
    hapticTap();
    setSaveBusy(true);
    try {
      const id = await upsertCourse(withDefaultTees(course));
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

  const onContinueToRoundSetup = async () => {
    hapticTap();

    if (!isValidCourse(course) || teeValidationError) {
      hapticError();
      Alert.alert(
        'Cannot continue',
        teeValidationError ??
          'Please ensure you have 18 holes, Par is set, and Stroke Index uses 1–18 uniquely.'
      );
      return;
    }

    setSaveBusy(true);
    try {
      const id = await upsertCourse(withDefaultTees(course));
      await setActiveCourseId(id);
      hapticSuccess();
      toast.show('Course saved', 'success');
      navigation.navigate('CompetitionSelect');
    } catch {
      hapticError();
      toast.show('Could not save course. Try again.', 'error');
    } finally {
      setSaveBusy(false);
    }
  };

  const onExportCourseJson = async () => {
    hapticTap();
    try {
      await exportCourseToJsonFile(withDefaultTees(course));
      hapticSuccess();
      Alert.alert('Export complete', 'Course exported and ready to share.');
    } catch {
      hapticError();
      Alert.alert('Export failed', 'Could not export this course right now. Please try again.');
    }
  };

  const saveImportedCourse = async (nextCourse: Course, mode: 'replace' | 'new') => {
    const targetCourse =
      mode === 'new'
        ? { ...nextCourse, id: `course-${Date.now()}` }
        : nextCourse;
    await upsertCourse(withDefaultTees(targetCourse));
    await setActiveCourseId(targetCourse.id);
    await refreshData();
    hapticSuccess();
    Alert.alert('Import complete', 'Course imported successfully.');
  };

  const proceedAfterImportConfirmed = (imported: ImportedCourseResult) => {
    const exactMatch =
      savedCourses.find((c) => c.id === imported.course.id) ??
      savedCourses.find(
        (c) => c.course.name.trim().toLowerCase() === imported.course.name.trim().toLowerCase()
      );

    if (exactMatch) {
      Alert.alert(
        'Course already exists',
        `A matching course was found (${exactMatch.course.name}). Replace it or save as new?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save as New',
            onPress: () => {
              void saveImportedCourse(imported.course, 'new');
            },
          },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              void saveImportedCourse({ ...imported.course, id: exactMatch.id }, 'replace');
            },
          },
        ]
      );
      return;
    }

    void saveImportedCourse(imported.course, 'new');
  };

  const onImportCourseJson = async () => {
    hapticTap();
    try {
      const imported = await pickAndReadCourseJson();
      if (!imported) return;
      if (!isValidCourse(imported.course)) {
        hapticError();
        Alert.alert(
          'Invalid course file',
          'This file does not look like a valid NetParGolf course file.'
        );
        return;
      }

      const previewMessage = buildCourseImportPreviewMessage(imported);
      Alert.alert('Import this course?', previewMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => proceedAfterImportConfirmed(imported),
        },
      ]);
    } catch {
      hapticError();
      Alert.alert(
        'Import failed',
        'This file does not look like a valid NetParGolf course file.'
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Course Setup</Text>
        <Text style={styles.muted}>Loading course…</Text>
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
        <Text style={styles.subTitle}>Find, review, edit or share a course before starting a round.</Text>

        {hasMissingStrokeIndex(course) && <StrokeIndexWarningBanner />}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Find or Select Course</Text>
          <Text style={styles.muted}>
            Search online, import a shared course file, or select one of your saved courses.
          </Text>
          <Text style={styles.hint}>
            {savedCourses.length > 0
              ? `${savedCourses.length} saved course${savedCourses.length === 1 ? '' : 's'} available.`
              : 'No saved courses yet.'}
          </Text>

          <View style={styles.actionsRow}>
            <PrimaryButton
              title="Find course (free tier)"
              onPress={() => navigation.navigate('CourseSearch')}
              variant="secondary"
              style={styles.findCourseBtn}
              textStyle={{ color: colors.primary }}
            />
            <PrimaryButton
              title="Import Course"
              onPress={onImportCourseJson}
              variant="secondary"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Selected Course</Text>
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
            {siDuplicateWarning ? (
              <Text style={styles.warning}>
                Stroke Index duplicates: {siDuplicateWarning}
              </Text>
            ) : null}
            {editingLocked ? (
              <View style={styles.roundInProgressBanner}>
                <Text style={styles.roundInProgressText}>Round in progress — editing course may affect scoring.</Text>
              </View>
            ) : null}
          </View>
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
          <Text style={styles.cardTitle}>Tee Ratings / Course Details</Text>
          <Text style={styles.label}>Course name</Text>
          <TextInput
            style={[styles.input, editingLocked && styles.inputDisabled]}
            value={course.name}
            onChangeText={(v) => setCourse((p) => ({ ...p, name: v }))}
            placeholder="e.g. Woburn Marquess"
            placeholderTextColor="#999"
            editable={!editingLocked}
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Tee ratings</Text>
          <Text style={styles.hint}>
            Tee-level Par, Course Rating and Slope Rating are used for automatic handicap conversion.
          </Text>
          {(course.tees ?? DEFAULT_TEES).map((tee, teeIndex) => (
            <View key={`${tee.name}-${teeIndex}`} style={styles.teeEditorCard}>
              <Text style={styles.teeEditorTitle}>{tee.name}</Text>
              <View style={styles.teeEditorRow}>
                <View style={styles.teeEditorField}>
                  <Text style={styles.teeFieldLabel}>Par</Text>
                  <TextInput
                    value={String(tee.par)}
                    onChangeText={(v) => updateTeeField(teeIndex, 'par', v)}
                    keyboardType="number-pad"
                    style={[styles.input, editingLocked && styles.inputDisabled]}
                    editable={!editingLocked}
                    placeholder="72"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={styles.teeEditorField}>
                  <Text style={styles.teeFieldLabel}>Course Rating</Text>
                  <TextInput
                    value={String(tee.courseRating)}
                    onChangeText={(v) => updateTeeField(teeIndex, 'courseRating', v)}
                    keyboardType="decimal-pad"
                    style={[styles.input, editingLocked && styles.inputDisabled]}
                    editable={!editingLocked}
                    placeholder="72.1"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={styles.teeEditorField}>
                  <Text style={styles.teeFieldLabel}>Slope Rating</Text>
                  <TextInput
                    value={String(tee.slopeRating)}
                    onChangeText={(v) => updateTeeField(teeIndex, 'slopeRating', v)}
                    keyboardType="number-pad"
                    style={[styles.input, editingLocked && styles.inputDisabled]}
                    editable={!editingLocked}
                    placeholder="113"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>
            </View>
          ))}
          {teeValidationError ? <Text style={styles.warning}>{teeValidationError}</Text> : null}

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
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actions</Text>
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
              title="Continue to Round Setup"
              onPress={onContinueToRoundSetup}
              disabled={!courseValid}
              variant="secondary"
            />
            <PrimaryButton
              title="Export Course"
              onPress={onExportCourseJson}
              disabled={!courseValid}
              variant="secondary"
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
  teeEditorCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: colors.background,
  },
  teeEditorTitle: { fontSize: 13, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 },
  teeEditorRow: { flexDirection: 'row', gap: 8 },
  teeEditorField: { flex: 1 },
  teeFieldLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '700', marginBottom: 4 },

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
