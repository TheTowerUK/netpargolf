// src/screens/LiveScoringScreen.tsx
// NetParGolf — Live Scoring with 18-hole round state (in-memory)
// Par/SI are LOCKED per hole from saved Course (AsyncStorage).

import React, { useEffect, useMemo, useState } from 'react';
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

import {
  scoreHoleOptionA,
  sumBestN,
  type RoundingMode,
  type ScoringBreakdown,
} from '../core/scoring';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';

import { loadCourse } from '../storage/courseStorage';
import { loadRound, saveRound, clearRound, type PersistedRoundV1 } from '../storage/roundStorage';
import { useAutosaveRound } from '../hooks/useAutosaveRound';
import type { Course } from '../core/course';
import { colors } from '../theme/colors';

type PlayerUI = {
  id: string;
  name: string;
  courseHandicap: string;
  allowancePercent: string;
};

type HoleState = {
  grossByPlayer: Record<string, string>;
};

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

const DEFAULT_PLAYERS: PlayerUI[] = [
  { id: 'p1', name: 'Player 1', courseHandicap: '18', allowancePercent: '100' },
  { id: 'p2', name: 'Player 2', courseHandicap: '14', allowancePercent: '100' },
  { id: 'p3', name: 'Player 3', courseHandicap: '10', allowancePercent: '100' },
  { id: 'p4', name: 'Player 4', courseHandicap: '22', allowancePercent: '100' },
];

export default function LiveScoringScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [players, setPlayers] = useState<PlayerUI[]>(DEFAULT_PLAYERS);
  const [holeNumber, setHoleNumber] = useState<number>(1);
  const [bestN, setBestN] = useState<2 | 3 | 4>(2);
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('nearest');

  const [course, setCourse] = useState<Course | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [roundLoading, setRoundLoading] = useState(true);

  const [holes, setHoles] = useState<Record<number, HoleState>>(() => {
    const init: Record<number, HoleState> = {};
    HOLES.forEach((h) => {
      init[h] = { grossByPlayer: {} };
    });
    return init;
  });

  useEffect(() => {
    (async () => {
      try {
        const c = await loadCourse();
        setCourse(c);
      } finally {
        setCourseLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await loadRound();
        if (saved) {
          setPlayers(saved.players);
          const mergedHoles: Record<number, HoleState> = {};
          HOLES.forEach((h) => {
            mergedHoles[h] = saved.holes[h] ?? { grossByPlayer: {} };
          });
          setHoles(mergedHoles);
          setHoleNumber(saved.holeNumber);
          setBestN(saved.bestN);
          setRoundingMode(saved.roundingMode);
        }
      } finally {
        setRoundLoading(false);
      }
    })();
  }, []);

  const persistNow = async () => {
    const payload: PersistedRoundV1 = {
      version: 1,
      savedAt: Date.now(),
      holeNumber,
      bestN,
      roundingMode,
      players,
      holes,
    };
    await saveRound(payload);
  };

  useAutosaveRound(
    { holeNumber, bestN, roundingMode, players, holes },
    persistNow,
    450
  );

  const currentHole = holes[holeNumber];

  const lockedHole = useMemo(() => {
    if (!course?.holes || course.holes.length !== 18) return null;
    return course.holes[holeNumber - 1] ?? null;
  }, [course, holeNumber]);

  const lockedPar = lockedHole?.par ?? null;
  const lockedSI = lockedHole?.strokeIndex ?? null;

  const parsedHole = useMemo(() => {
    const par = lockedPar ?? NaN;
    const si = lockedSI ?? NaN;
    return { par, si };
  }, [lockedPar, lockedSI]);

  const breakdowns = useMemo(() => {
    return players.map((pl) => {
      const grossStr = currentHole.grossByPlayer[pl.id];
      const ch = parseInt(pl.courseHandicap, 10);
      const pct = parseFloat(pl.allowancePercent);
      const gross = parseInt(grossStr ?? '', 10);

      if (
        !Number.isFinite(ch) ||
        !Number.isFinite(pct) ||
        !Number.isFinite(gross) ||
        !Number.isFinite(parsedHole.par) ||
        !Number.isFinite(parsedHole.si)
      ) {
        return null;
      }

      try {
        return scoreHoleOptionA({
          courseHandicap: ch,
          allowancePercent: pct / 100,
          roundingMode,
          hole: { par: parsedHole.par, strokeIndex: parsedHole.si },
          gross,
        });
      } catch {
        return null;
      }
    });
  }, [players, currentHole, parsedHole, roundingMode]);

  const teamHolePoints = useMemo(() => {
    const valid = breakdowns.filter((b): b is ScoringBreakdown => !!b);
    if (!valid.length) return null;
    return sumBestN(valid.map((b) => b.points), Math.min(bestN, valid.length));
  }, [breakdowns, bestN]);

  const holeComplete = useMemo(() => {
    return players.every((pl) => {
      const gross = currentHole.grossByPlayer[pl.id];
      return gross != null && String(gross).trim() !== '';
    });
  }, [players, currentHole]);

  const roundTotals = useMemo(() => {
    const totals = players.map((pl) => ({
      playerId: pl.id,
      name: pl.name,
      gross: 0,
      net: 0,
      points: 0,
      holesScored: 0,
    }));

    let teamTotal = 0;

    HOLES.forEach((h) => {
      const courseHole = course?.holes?.[h - 1];
      if (!courseHole) return;

      const par = courseHole.par;
      const si = courseHole.strokeIndex;
      if (!Number.isFinite(par) || !Number.isFinite(si)) return;

      const holeState = holes[h];
      const holeBreakdowns: ScoringBreakdown[] = [];

      players.forEach((pl, idx) => {
        const grossStr = holeState.grossByPlayer[pl.id];
        const gross = parseInt(grossStr ?? '', 10);
        const ch = parseInt(pl.courseHandicap, 10);
        const pct = parseFloat(pl.allowancePercent);

        if (!Number.isFinite(gross) || !Number.isFinite(ch) || !Number.isFinite(pct)) return;

        try {
          const b = scoreHoleOptionA({
            courseHandicap: ch,
            allowancePercent: pct / 100,
            roundingMode,
            hole: { par, strokeIndex: si },
            gross,
          });

          totals[idx].gross += gross;
          totals[idx].net += b.net;
          totals[idx].points += b.points;
          totals[idx].holesScored += 1;
          holeBreakdowns.push(b);
        } catch {
          // skip
        }
      });

      if (holeBreakdowns.length) {
        teamTotal += sumBestN(
          holeBreakdowns.map((b) => b.points),
          Math.min(bestN, holeBreakdowns.length)
        );
      }
    });

    return { players: totals, teamTotal };
  }, [holes, players, bestN, roundingMode, course]);

  const updateGross = (playerId: string, value: string) => {
    setHoles((prev) => ({
      ...prev,
      [holeNumber]: {
        ...prev[holeNumber],
        grossByPlayer: { ...prev[holeNumber].grossByPlayer, [playerId]: value },
      },
    }));
  };

  const goToHole = (h: number) => setHoleNumber(h);

  const clearCurrentHoleGross = () => {
    setHoles((prev) => ({
      ...prev,
      [holeNumber]: { ...prev[holeNumber], grossByPlayer: {} },
    }));
  };

  const resetRound = async () => {
    await clearRound();
    setHoles(() => {
      const reset: Record<number, HoleState> = {};
      HOLES.forEach((h) => (reset[h] = { grossByPlayer: {} }));
      return reset;
    });
    setHoleNumber(1);
  };

  const refreshCourse = async () => {
    setCourseLoading(true);
    try {
      const c = await loadCourse();
      setCourse(c);
    } finally {
      setCourseLoading(false);
    }
  };

  const ensureCourse = () => {
    if (!course) {
      Alert.alert(
        'Course not set',
        'Please go to Course Setup and enter Par & Stroke Index for holes 1–18. Live Scoring locks to the saved course.'
      );
    }
  };

  const courseReady = !!course && Array.isArray(course.holes) && course.holes.length === 18;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Live Scoring</Text>

        <View style={styles.courseCard}>
          {courseReady ? (
            <View style={styles.liveCourseBanner}>
              <Text style={styles.liveCourseLabel}>Live scoring course</Text>
              <Text style={styles.liveCourseName}>{course!.name}</Text>
            </View>
          ) : (
            <View style={styles.courseNameBlock}>
              <Text style={styles.courseLabel}>Course</Text>
              <Text style={styles.courseName}>
                {courseLoading ? 'Loading…' : 'No course saved'}
              </Text>
            </View>
          )}

          <View style={styles.courseBtns}>
            <Pressable style={styles.smallBtn} onPress={() => navigation.navigate('Scorecard')}>
              <Text style={styles.smallBtnText}>View Scorecard</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={refreshCourse}>
              <Text style={styles.smallBtnText}>Refresh</Text>
            </Pressable>
          </View>

          <Text style={styles.courseHint}>
            Par/SI are locked per hole from Course Setup.
          </Text>
        </View>

        {!courseReady ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Set up your course first</Text>
            <Text style={styles.warnText}>
              Live Scoring needs Par and Stroke Index for holes 1–18. Go to Course Setup, save the course,
              then come back and tap Refresh.
            </Text>

            <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('CourseSetup')}>
              <Text style={styles.primaryBtnText}>Go to Course Setup</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hole</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeChips}>
            {HOLES.map((h) => (
              <Pressable
                key={h}
                onPress={() => goToHole(h)}
                style={[styles.holeChip, h === holeNumber && styles.holeChipActive]}
              >
                <Text style={h === holeNumber ? styles.holeChipTextActive : styles.holeChipText}>
                  {h}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.lockedRow}>
            <LockedValue label="Par" value={lockedPar == null ? '—' : String(lockedPar)} />
            <LockedValue label="Stroke Index" value={lockedSI == null ? '—' : String(lockedSI)} />
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Team scoring</Text>
              <View style={styles.pills}>
                <Pill text="Best 2" active={bestN === 2} onPress={() => setBestN(2)} />
                <Pill text="Best 3" active={bestN === 3} onPress={() => setBestN(3)} />
                <Pill text="All 4" active={bestN === 4} onPress={() => setBestN(4)} />
              </View>
              <Text style={styles.hint}>Team points per hole = sum of best N points.</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Rounding</Text>
              <View style={styles.pills}>
                <Pill text="Nearest" active={roundingMode === 'nearest'} onPress={() => setRoundingMode('nearest')} />
                <Pill text="Floor" active={roundingMode === 'floor'} onPress={() => setRoundingMode('floor')} />
                <Pill text="Ceil" active={roundingMode === 'ceil'} onPress={() => setRoundingMode('ceil')} />
              </View>
              <Text style={styles.hint}>Applied to handicap × allowance.</Text>
            </View>
          </View>

          <View style={styles.teamBox}>
            <View>
              <Text style={styles.teamLabel}>Hole {holeNumber} team points</Text>
              {holeComplete ? (
                <Text style={styles.holeCompleteText}>✓ Hole complete</Text>
              ) : null}
            </View>
            <Text style={styles.teamValue}>{teamHolePoints == null ? '—' : `${teamHolePoints}`}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Players</Text>
          <Text style={styles.muted}>
            Tip: keep Course Hcp + Allowance % constant; just enter Gross for each hole.
          </Text>

          {players.map((pl, idx) => {
            const b = breakdowns[idx];
            const grossVal = currentHole.grossByPlayer[pl.id] ?? '';
            const grossNum = parseInt(grossVal, 10);
            const par = lockedPar ?? 0;
            const grossVsPar = Number.isFinite(grossNum) && Number.isFinite(par) ? grossNum - par : null;
            const grossCellStyle = grossVsPar != null ? getGrossVsParStyle(grossVsPar) : undefined;
            return (
              <View key={pl.id} style={styles.playerCard}>
                <View style={styles.playerHeader}>
                  <Text style={styles.playerName}>{pl.name}</Text>
                  <View style={styles.pointsBadge}>
                    <Text style={styles.pointsBadgeValue}>{b ? b.points : '—'}</Text>
                    <Text style={styles.pointsBadgeLabel}>pts</Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <FieldText
                    label="Name"
                    value={pl.name}
                    onChangeText={(v) => setPlayers((prev) => prev.map((p) => (p.id === pl.id ? { ...p, name: v } : p)))}
                    keyboardType="default"
                    hint="Player name"
                  />
                  <FieldText
                    label="Gross"
                    value={grossVal}
                    onChangeText={(v) => {
                      if (!courseReady) ensureCourse();
                      updateGross(pl.id, v);
                    }}
                    keyboardType="number-pad"
                    hint="strokes"
                    inputContainerStyle={grossCellStyle}
                  />
                </View>

                <View style={styles.row}>
                  <FieldText
                    label="Course Hcp"
                    value={pl.courseHandicap}
                    onChangeText={(v) => setPlayers((prev) => prev.map((p) => (p.id === pl.id ? { ...p, courseHandicap: v } : p)))}
                    keyboardType="number-pad"
                    hint="e.g. 18"
                  />
                  <FieldText
                    label="Allowance %"
                    value={pl.allowancePercent}
                    onChangeText={(v) => setPlayers((prev) => prev.map((p) => (p.id === pl.id ? { ...p, allowancePercent: v } : p)))}
                    keyboardType="decimal-pad"
                    hint="90/95/100"
                  />
                </View>

                <View style={styles.breakRow}>
                  <BreakItem label="Adj Hcp" value={b ? `${b.adjustedHandicap}` : '—'} />
                  <BreakItem label="Strokes" value={b ? `${b.strokesReceivedOnHole}` : '—'} />
                  <BreakItem label="Net" value={b ? `${b.net}` : '—'} />
                  <BreakItem
                    label="Net vs Par"
                    value={b ? formatDiff(b.netVsPar) : '—'}
                    scoreVsParStyle={b ? getScoreVsParStyle(b.netVsPar) : undefined}
                  />
                </View>

                {!courseReady ? (
                  <Text style={styles.warn}>Course not saved. Par/SI must be set in Course Setup.</Text>
                ) : null}
              </View>
            );
          })}

          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryBtnWide} onPress={clearCurrentHoleGross}>
              <Text style={styles.secondaryBtnText}>Clear Hole Gross</Text>
            </Pressable>
            <Pressable style={styles.dangerBtnWide} onPress={resetRound}>
              <Text style={styles.dangerBtnText}>Reset Round</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Round Summary</Text>

          {!courseReady ? (
            <Text style={styles.muted}>Save a course to enable full round totals.</Text>
          ) : (
            <>
              {roundTotals.players.map((p) => (
                <View key={p.playerId} style={styles.summaryRow}>
                  <Text style={styles.summaryName}>{p.name}</Text>
                  <Text style={styles.summaryVal}>G {p.gross}</Text>
                  <Text style={styles.summaryVal}>N {p.net}</Text>
                  <Text style={styles.summaryVal}>{p.points} pts</Text>
                </View>
              ))}

              <Text style={styles.teamTotal}>
                Team total: <Text style={styles.teamTotalValue}>{roundTotals.teamTotal}</Text>
              </Text>
            </>
          )}
        </View>

        <Text style={styles.footerMuted}>
          v0.2 — Locked course Par/SI + live scoring.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function formatDiff(netVsPar: number) {
  if (netVsPar === 0) return 'E';
  if (netVsPar > 0) return `+${netVsPar}`;
  return `${netVsPar}`;
}

function Pill({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}>
      <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>{text}</Text>
    </Pressable>
  );
}

function FieldText(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  hint?: string;
  inputContainerStyle?: { backgroundColor: string };
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'default'}
        style={[styles.input, props.inputContainerStyle]}
        placeholder={props.hint}
        placeholderTextColor="#999"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

function getScoreVsParStyle(netVsPar: number): { backgroundColor: string } | undefined {
  if (netVsPar <= -1) return { backgroundColor: colors.successSoft };
  if (netVsPar === 0) return undefined;
  if (netVsPar === 1) return { backgroundColor: colors.warningSoft };
  return { backgroundColor: colors.dangerSoft };
}

function getGrossVsParStyle(grossVsPar: number): { backgroundColor: string } {
  if (grossVsPar <= -1) return { backgroundColor: colors.successSoft };
  if (grossVsPar === 0) return { backgroundColor: colors.card };
  if (grossVsPar === 1) return { backgroundColor: colors.warningSoft };
  return { backgroundColor: colors.dangerSoft };
}

function BreakItem({ label, value, scoreVsParStyle }: { label: string; value: string; scoreVsParStyle?: { backgroundColor: string } }) {
  return (
    <View style={[styles.breakItem, scoreVsParStyle]}>
      <Text style={styles.breakLabel}>{label}</Text>
      <Text style={styles.breakValue}>{value}</Text>
    </View>
  );
}

function LockedValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.lockedBox}>
      <Text style={styles.lockedLabel}>{label}</Text>
      <Text style={styles.lockedValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 10, color: colors.primary },

  courseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.card,
    flexDirection: 'column',
  },
  courseNameBlock: { marginBottom: 10 },
  courseLabel: { fontSize: 11, color: '#555', fontWeight: '900' },
  courseName: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  courseHint: { fontSize: 11, color: '#666', marginTop: 10, lineHeight: 16 },

  liveCourseBanner: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  liveCourseLabel: { fontSize: 11, fontWeight: '900', color: colors.primary },
  liveCourseName: { fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 2 },
  courseBtns: { flexDirection: 'row', gap: 8, justifyContent: 'center' },

  smallBtn: { backgroundColor: colors.primarySoft, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  smallBtnText: { fontWeight: '900', color: colors.textPrimary },

  warnCard: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  warnTitle: { fontWeight: '900', color: colors.warning, marginBottom: 6 },
  warnText: { color: colors.warning, lineHeight: 18, fontSize: 13 },
  primaryBtn: { marginTop: 10, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary },
  primaryBtnText: { color: colors.textInverse, fontWeight: '900' },

  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: colors.card },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8 },

  holeChips: { gap: 8, paddingVertical: 2, paddingRight: 6 },
  holeChip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  holeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  holeChipText: { fontWeight: '900', color: colors.textPrimary },
  holeChipTextActive: { fontWeight: '900', color: colors.textInverse },

  lockedRow: { flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 6 },
  lockedBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  lockedLabel: { fontSize: 11, color: '#666', fontWeight: '900' },
  lockedValue: { fontSize: 18, fontWeight: '900', marginTop: 4 },

  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, marginBottom: 10 },
  label: { fontSize: 12, color: '#333', marginBottom: 6, fontWeight: '900' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 11, color: '#666', marginTop: 4 },

  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  pillInactive: { borderColor: colors.border, backgroundColor: colors.card },
  pillText: { fontSize: 12, fontWeight: '900' },
  pillTextActive: { color: colors.textInverse },
  pillTextInactive: { color: colors.textPrimary },

  teamBox: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
    backgroundColor: '#fafafa',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamLabel: { fontSize: 13, color: '#333', fontWeight: '900' },
  holeCompleteText: { fontSize: 12, fontWeight: '800', color: colors.success, marginTop: 4 },
  teamValue: { fontSize: 24, fontWeight: '900' },

  muted: { color: '#666', fontSize: 12, lineHeight: 17, marginBottom: 10 },

  playerCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  playerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  playerName: { fontSize: 16, fontWeight: '900' },

  pointsBadge: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 66,
  },
  pointsBadgeValue: { fontSize: 18, fontWeight: '900', lineHeight: 18 },
  pointsBadgeLabel: { fontSize: 10, fontWeight: '900', color: colors.textPrimary, marginTop: 2 },

  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  breakItem: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 4 },
  breakLabel: { fontSize: 10, color: '#666', fontWeight: '900' },
  breakValue: { fontSize: 13, color: '#111', fontWeight: '900', marginTop: 4 },

  warn: { marginTop: 8, color: '#b45309', fontSize: 12, fontWeight: '900' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  secondaryBtnWide: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.primarySoft },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: '900', fontSize: 13 },
  dangerBtnWide: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.danger },
  dangerBtnText: { color: colors.textInverse, fontWeight: '900', fontSize: 13 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryName: { flex: 1, fontWeight: '900' },
  summaryVal: { width: 72, textAlign: 'right', fontWeight: '800' },

  teamTotal: { marginTop: 10, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  teamTotalValue: { fontSize: 20 },

  footerMuted: { marginTop: 6, color: '#777', fontSize: 12, textAlign: 'center' },
});
