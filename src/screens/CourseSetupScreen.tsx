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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { colors } from '../theme/colors';
import { makeDefaultCourse, isValidCourse, type Course } from '../core/course';
import { loadActiveCourse, saveCourse, clearCourse } from '../storage/courseStorage';

export default function CourseSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [course, setCourse] = useState<Course>(() => makeDefaultCourse());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        const c = await loadActiveCourse();
        if (mounted) setCourse(c ?? makeDefaultCourse());
        if (mounted) setLoading(false);
      })();
      return () => {
        mounted = false;
      };
    }, [])
  );

  const holesLoaded = course.holes?.length === 18;

  const siDuplicateWarning = useMemo(() => {
    const seen = new Map<number, number[]>();
    for (const h of course.holes) {
      const list = seen.get(h.strokeIndex) ?? [];
      list.push(h.holeNumber);
      seen.set(h.strokeIndex, list);
    }
    const dups = [...seen.entries()].filter(([, holes]) => holes.length > 1);
    if (!dups.length) return null;

    return dups
      .map(([si, holes]) => `SI ${si} used on holes ${holes.join(', ')}`)
      .join(' • ');
  }, [course]);

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
      Alert.alert(
        'Cannot save course',
        'Please ensure you have 18 holes, Par is set, and Stroke Index uses 1–18 uniquely.'
      );
      return;
    }
    await saveCourse(course);
    Alert.alert('Saved ✅', 'Course Par/SI saved. Live Scoring will now lock to this course.');
  };

  const onReset = () => {
    setCourse(makeDefaultCourse());
  };

  const onClear = async () => {
    await clearCourse();
    setCourse(makeDefaultCourse());
    Alert.alert('Cleared', 'Saved course removed.');
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
            <Text style={styles.activeLabel}>Selected course</Text>
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
          </View>

          <Text style={styles.label}>Course name</Text>
          <TextInput
            style={styles.input}
            value={course.name}
            onChangeText={(v) => setCourse((p) => ({ ...p, name: v }))}
            placeholder="e.g. Woburn Marquess"
            placeholderTextColor="#999"
          />

          {siDuplicateWarning ? (
            <Text style={styles.warning}>
              Stroke Index duplicates: {siDuplicateWarning}
            </Text>
          ) : (
            <Text style={styles.hint}>Tip: SI should be 1–18 uniquely (1 = hardest).</Text>
          )}

          <Pressable
            onPress={() => navigation.navigate('CourseSearch')}
            style={styles.findCourseBtn}
          >
            <Text style={styles.findCourseBtnText}>Find course (free tier)</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Holes</Text>

          <View style={styles.scorecardWrap}>
            <View style={[styles.scRow, styles.scHeaderRow]}>
              <View style={[styles.scCellHole, styles.scHeaderCell]}>
                <Text style={styles.scHeaderText}>Hole</Text>
              </View>
              <View style={[styles.scCellPar, styles.scHeaderCellPar]}>
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
                    style={styles.scInputPar}
                    keyboardType="number-pad"
                    value={String(h.par)}
                    onChangeText={(v) => updateHole(h.holeNumber, { par: parseInt(v || '0', 10) })}
                  />
                </View>

                <View style={styles.scCellSi}>
                  <TextInput
                    style={styles.scInputSi}
                    keyboardType="number-pad"
                    value={String(h.strokeIndex)}
                    onChangeText={(v) => updateHole(h.holeNumber, { strokeIndex: parseInt(v || '0', 10) })}
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.primaryBtn} onPress={onSave}>
              <Text style={styles.primaryBtnText}>Save Course</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={onReset}>
              <Text style={styles.secondaryBtnText}>Reset Defaults</Text>
            </Pressable>
            <Pressable style={styles.dangerBtn} onPress={onClear}>
              <Text style={styles.dangerBtnText}>Clear Saved</Text>
            </Pressable>
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
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10, color: colors.textPrimary },

  scorecardWrap: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 14,
    overflow: 'hidden',
  },
  scRow: { flexDirection: 'row', alignItems: 'stretch' },
  scRowAlt: { backgroundColor: 'rgba(15,81,50,0.04)' },

  scHeaderRow: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.35)' },

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

  activeBanner: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activeLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '800', marginBottom: 2 },
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

  label: { fontSize: 12, fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, fontSize: 16, color: colors.textPrimary },

  hint: { marginTop: 8, fontSize: 12, color: colors.textSecondary },
  warning: { marginTop: 8, fontSize: 12, color: colors.warning, fontWeight: '900' },
  findCourseBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  findCourseBtnText: { color: colors.primary, fontWeight: '900' },

  actionsRow: { marginTop: 12, gap: 10 },
  primaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary },
  primaryBtnText: { color: colors.textInverse, fontWeight: '900' },
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
