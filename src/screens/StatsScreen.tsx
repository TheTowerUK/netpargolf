// src/screens/StatsScreen.tsx
// NetParGolf — Stats dashboard from round history.

import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { colors } from '../theme/colors';
import { listRounds, type StoredRoundSummary } from '../storage/roundHistoryStorage';

export default function StatsScreen() {
  const [rounds, setRounds] = useState<StoredRoundSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      listRounds().then(setRounds);
    }, [])
  );

  const stats = useMemo(() => computeStats(rounds), [rounds]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Stats</Text>
      <Text style={styles.subTitle}>From your round history.</Text>

      {rounds.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No stats yet</Text>
          <Text style={styles.emptyText}>
            Archive rounds from Scoreboard to build your stats.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <StatRow label="Total rounds" value={String(stats.totalRounds)} />
          <StatRow
            label="Most played course"
            value={stats.mostPlayedCourse ?? '—'}
          />
          <StatRow
            label="Best team total"
            value={stats.bestTeamTotal != null ? `${stats.bestTeamTotal} pts` : '—'}
          />
          <StatRow
            label="Average team total"
            value={stats.avgTeamTotal != null ? `${stats.avgTeamTotal.toFixed(1)} pts` : '—'}
          />
        </View>
      )}
    </ScrollView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function computeStats(rounds: StoredRoundSummary[]) {
  const totalRounds = rounds.length;

  const courseCounts = new Map<string, number>();
  for (const r of rounds) {
    const name = r.courseNameSnapshot || 'Unknown';
    courseCounts.set(name, (courseCounts.get(name) ?? 0) + 1);
  }
  const mostPlayedCourse =
    courseCounts.size > 0
      ? [...courseCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

  const teamTotals = rounds
    .map((r) => r.teamTotalSnapshot)
    .filter((t): t is number => t != null && Number.isFinite(t));
  const bestTeamTotal =
    teamTotals.length > 0 ? Math.max(...teamTotals) : null;
  const avgTeamTotal =
    teamTotals.length > 0
      ? teamTotals.reduce((a, b) => a + b, 0) / teamTotals.length
      : null;

  return {
    totalRounds,
    mostPlayedCourse,
    bestTeamTotal,
    avgTeamTotal,
  };
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 6, color: colors.primary },
  subTitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  statLabel: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
  statValue: { fontSize: 16, fontWeight: '900', color: colors.textPrimary },
  emptyTitle: { fontSize: 16, fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
