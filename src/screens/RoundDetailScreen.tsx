// src/screens/RoundDetailScreen.tsx
// NetParGolf — View a saved round from history.

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { colors } from '../theme/colors';
import { getRoundEntryById } from '../storage/roundHistoryStorage';
import { getCourseById } from '../storage/courseStorage';
import { scoreHoleOptionA, sumBestN } from '../core/scoring';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundDetail'>;

export default function RoundDetailScreen({ route }: Props) {
  const { roundId } = route.params;
  const [entry, setEntry] = useState<Awaited<ReturnType<typeof getRoundEntryById>>>(null);
  const [course, setCourse] = useState<Awaited<ReturnType<typeof getCourseById>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const e = await getRoundEntryById(roundId);
      setEntry(e);
      if (e?.courseId) {
        const c = await getCourseById(e.courseId);
        setCourse(c);
      } else {
        setCourse(null);
      }
      setLoading(false);
    })();
  }, [roundId]);

  const round = entry?.round ?? null;

  const summary = useMemo(() => {
    if (!round || !course?.holes?.length) return null;
    const players = round.players.map((p) => ({
      id: p.id,
      name: p.name,
      gross: 0,
      net: 0,
      points: 0,
    }));
    let teamTotal = 0;
    for (let h = 1; h <= 18; h++) {
      const holeState = round.holes[h];
      if (!holeState) continue;
      const holeData = course.holes[h - 1];
      const par = holeData?.par;
      const si = holeData?.strokeIndex;
      if (!Number.isFinite(par) || !Number.isFinite(si)) continue;
      const holePoints: number[] = [];
      round.players.forEach((p, idx) => {
        const gross = parseInt(holeState.grossByPlayer[p.id] ?? '', 10);
        const ch = parseInt(p.courseHandicap ?? '', 10);
        const pct = parseFloat(p.allowancePercent ?? '');
        if (!Number.isFinite(gross) || !Number.isFinite(ch) || !Number.isFinite(pct)) return;
        try {
          const b = scoreHoleOptionA({
            courseHandicap: ch,
            allowancePercent: pct / 100,
            roundingMode: round.roundingMode,
            hole: { par: par as number, strokeIndex: si as number },
            gross,
          });
          players[idx].gross += gross;
          players[idx].net += b.net;
          players[idx].points += b.points;
          holePoints.push(b.points);
        } catch {}
      });
      if (holePoints.length) {
        teamTotal += sumBestN(holePoints, Math.min(round.bestN, holePoints.length));
      }
    }
    return { players, teamTotal };
  }, [round, course]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Round</Text>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (!round) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Round</Text>
        <Text style={styles.muted}>Round not found.</Text>
      </View>
    );
  }

  const courseName = entry?.courseNameSnapshot ?? course?.name ?? 'Unknown';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Round</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{courseName}</Text>
        <Text style={styles.meta}>{new Date(round.savedAt).toLocaleString()}</Text>
        <Text style={styles.meta}>Hole {round.holeNumber} • Best {round.bestN}</Text>
      </View>

      {summary ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Totals</Text>
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
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.muted}>
            {course ? 'No scores recorded.' : 'Course no longer available — gross only.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 12, color: colors.primary },
  muted: { color: colors.textSecondary },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8, color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryName: { flex: 1, fontWeight: '900' },
  summaryVal: { width: 72, textAlign: 'right', fontWeight: '800' },
  teamTotal: { marginTop: 10, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  teamTotalValue: { fontSize: 20 },
});
