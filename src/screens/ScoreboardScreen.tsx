// src/screens/ScoreboardScreen.tsx
// NetParGolf — Scoreboard (reads persisted round + course) and shows totals.
// Also offers "Continue round" and "Clear saved round".
// Supports viewing historical rounds via roundId param.

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { loadRound, clearRound, type PersistedRoundV1 } from '../storage/roundStorage';
import { loadCourse, getActiveCourseId } from '../storage/courseStorage';
import { getRoundById, saveRoundToHistory } from '../storage/roundHistoryStorage';
import type { Course } from '../core/course';
import { computePlayingHandicap, scoreHoleOptionA, sumBestN } from '../core/scoring';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

export default function ScoreboardScreen({ navigation, route }: Props) {
  const viewingHistory = !!route.params?.roundId;

  const [round, setRound] = useState<PersistedRoundV1 | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const roundId = route.params?.roundId;
      const rPromise = roundId ? getRoundById(roundId) : loadRound();
      const [r, c] = await Promise.all([rPromise, loadCourse()]);
      setRound(r);
      setCourse(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [route.params?.roundId]);

  const summary = useMemo(() => {
    if (!round) return null;

    const players = round.players.map((p) => ({
      id: p.id,
      name: p.name,
      gross: 0,
      net: 0,
      points: 0,
      holesScored: 0,
    }));

    let teamTotal = 0;

    for (let h = 1; h <= 18; h++) {
      const holeState = round.holes[h];
      if (!holeState) continue;

      const par = course?.holes?.[h - 1]?.par;
      const si = course?.holes?.[h - 1]?.strokeIndex;

      if (!Number.isFinite(par) || !Number.isFinite(si)) continue;

      const holePoints: number[] = [];

      round.players.forEach((p, idx) => {
        const grossStr = holeState.grossByPlayer[p.id];
        const gross = parseInt(grossStr ?? '', 10);
        const ch = parseInt(p.courseHandicap ?? '', 10);
        const pct = parseFloat(round.allowancePercent ?? p.allowancePercent ?? '100');

        if (!Number.isFinite(gross) || !Number.isFinite(ch) || !Number.isFinite(pct)) return;

        const playingHcp = computePlayingHandicap(ch, pct, round.roundingMode ?? 'nearest');

        try {
          const b = scoreHoleOptionA({
            courseHandicap: playingHcp,
            allowancePercent: 1,
            roundingMode: round.roundingMode,
            hole: { par: par as number, strokeIndex: si as number },
            gross,
          });

          players[idx].gross += gross;
          players[idx].net += b.net;
          players[idx].points += b.points;
          players[idx].holesScored += 1;

          holePoints.push(b.points);
        } catch {
          // skip invalid hole/player combo
        }
      });

      if (holePoints.length) {
        teamTotal += sumBestN(holePoints, Math.min(round.bestN, holePoints.length));
      }
    }

    return { players, teamTotal };
  }, [round, course]);

  const onContinue = () => {
    navigation.navigate('LiveScoring');
  };

  const onArchive = async () => {
    if (!round) return;

    const courseId = await getActiveCourseId();
    const courseName = course?.name ?? 'No course selected';
    await saveRoundToHistory(round, courseId, courseName, summary?.teamTotal ?? null);

    await clearRound();
    Alert.alert('Archived ✅', 'Round saved to history.');
    await refresh();
  };

  const onClear = async () => {
    Alert.alert(
      'Clear round?',
      'This will remove the saved round. Archive it first to keep it in Round History.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearRound();
            Alert.alert('Cleared', 'Saved round removed.');
            await refresh();
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Scoreboard</Text>

      {loading ? <Text style={styles.muted}>Loading…</Text> : null}

      {!loading && !round ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>No saved round</Text>
          <Text style={styles.muted}>Start scoring in Live Scoring and it will autosave.</Text>
        </View>
      ) : null}

      {!loading && round ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Round status</Text>
            <Row label="Course" value={course?.name ?? '— (save a course)'} />
            <Row label="Current hole" value={`${round.holeNumber}`} />
            <Row label="Team rule" value={round.bestN === 4 ? 'All 4' : `Best ${round.bestN}`} />
            <Row label="Rounding" value={round.roundingMode} />
            <Row label="Last saved" value={new Date(round.savedAt).toLocaleString()} />
            {!viewingHistory ? (
              <View style={styles.actionsRow}>
                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                  <Text style={styles.primaryBtnText}>Continue round</Text>
                </Pressable>
                <Pressable style={styles.secondaryBtn} onPress={refresh}>
                  <Text style={styles.secondaryBtnText}>Refresh</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.secondaryBtn} onPress={() => navigation.navigate('RoundHistory')}>
                <Text style={styles.secondaryBtnText}>Back to history</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Totals</Text>

            {!course?.holes?.length ? (
              <Text style={styles.warn}>
                Course Par/SI not available. Go to Course Setup, save your course, then refresh.
              </Text>
            ) : null}

            {summary ? (
              <>
                {summary.players.map((p) => (
                  <View key={p.id} style={styles.summaryRow}>
                    <Text style={styles.summaryName}>{p.name}</Text>
                    <Text style={styles.summaryVal}>G {p.gross}</Text>
                    <Text style={styles.summaryVal}>N {p.net}</Text>
                    <Text style={styles.summaryVal}>{p.points} pts</Text>
                  </View>
                ))}
                <Text style={styles.teamTotal}>
                  Team total: <Text style={styles.teamTotalValue}>{summary.teamTotal}</Text>
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>No totals yet.</Text>
            )}

            {!viewingHistory ? (
              <>
                <View style={{ height: 10 }} />

                <Pressable style={styles.archiveBtn} onPress={onArchive}>
                  <Text style={styles.archiveBtnText}>Archive to history</Text>
                </Pressable>

                <View style={{ height: 8 }} />

                <Pressable style={styles.dangerBtn} onPress={onClear}>
                  <Text style={styles.dangerBtnText}>Clear saved round</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 12,
    color: colors.primary,
  },
  muted: { color: colors.textSecondary },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10 },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  rowLabel: { color: colors.textSecondary, fontWeight: '800', flex: 1 },
  rowValue: { color: colors.textPrimary, fontWeight: '900', textAlign: 'right' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  primaryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { color: colors.textInverse, fontWeight: '900' },
  secondaryBtn: { flex: 1, backgroundColor: colors.primarySoft, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: '900' },

  warn: { color: colors.warning, fontWeight: '900', marginBottom: 10 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryName: { flex: 1, fontWeight: '900' },
  summaryVal: { width: 72, textAlign: 'right', fontWeight: '800' },

  teamTotal: { marginTop: 10, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  teamTotalValue: { fontSize: 20 },

  archiveBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  archiveBtnText: { color: colors.textInverse, fontWeight: '900' },

  dangerBtn: { backgroundColor: colors.danger, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  dangerBtnText: { color: colors.textInverse, fontWeight: '900' },
});
