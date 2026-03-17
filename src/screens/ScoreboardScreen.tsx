// src/screens/ScoreboardScreen.tsx
// NetParGolf — Scoreboard (reads persisted round + course) and shows totals.
// Also offers "Continue round" and "Clear saved round".
// Supports viewing historical rounds via roundId param.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { loadCurrentRound, clearCurrentRound, type PersistedRound } from '../storage/roundStorage';
import { mapPersistedRoundToScoreboard } from '../core/roundMapper';
import { loadCourse, getActiveCourseId } from '../storage/courseStorage';
import { getRoundById, saveRoundToHistory } from '../storage/roundHistoryStorage';
import type { Course } from '../core/course';
import { computePlayingHandicap, scoreHoleOptionA, sumBestN } from '../core/scoring';
import { colors } from '../theme/colors';
import { hapticTap, hapticSuccess, hapticError } from '../utils/feedback';
import { useToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

export default function ScoreboardScreen({ navigation, route }: Props) {
  const toast = useToast();
  const viewingHistory = !!route.params?.roundId;

  const [activeRound, setActiveRound] = useState<PersistedRound | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const roundId = route.params?.roundId;
      const roundPromise = roundId ? getRoundById(roundId) : loadCurrentRound();
      const [loadedRound, loadedCourse] = await Promise.all([roundPromise, loadCourse()]);
      setActiveRound(loadedRound);
      setCourse(loadedCourse);
    } finally {
      setLoading(false);
    }
  }, [route.params?.roundId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mappedRound = useMemo(() => {
    if (!activeRound) return null;
    return mapPersistedRoundToScoreboard(activeRound);
  }, [activeRound]);

  const round = mappedRound;

  const competitionLabel = useMemo(() => {
    if (!round?.competition) return '—';
    return round.competition.replaceAll('_', ' ');
  }, [round]);

  const summary = useMemo(() => {
    if (!round || !course?.holes?.length) return null;

    const scoringRoundingMode = round.roundingMode === 'round' ? 'nearest' : round.roundingMode;
    const holeMap = Object.fromEntries(round.holes.map((h) => [h.holeNumber, h]));

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
      const holeData = holeMap[h];
      if (!holeData) continue;

      const par = course.holes[h - 1]?.par;
      const si = course.holes[h - 1]?.strokeIndex;

      if (!Number.isFinite(par) || !Number.isFinite(si)) continue;

      const holePoints: number[] = [];

      round.players.forEach((p, idx) => {
        const gross = holeData.grossByPlayerId[p.id];
        const ch = p.courseHandicap;
        const pct = round.allowancePercent;

        if (
          gross == null ||
          !Number.isFinite(gross) ||
          ch == null ||
          !Number.isFinite(ch) ||
          !Number.isFinite(pct)
        ) {
          return;
        }

        const playingHcp = computePlayingHandicap(ch, pct, scoringRoundingMode);

        try {
          const scored = scoreHoleOptionA({
            courseHandicap: playingHcp,
            allowancePercent: 1,
            roundingMode: scoringRoundingMode,
            hole: { par: par as number, strokeIndex: si as number },
            gross,
          });

          players[idx].gross += gross;
          players[idx].net += scored.net;
          players[idx].points += scored.points;
          players[idx].holesScored += 1;

          holePoints.push(scored.points);
        } catch {
          // Ignore invalid player/hole combinations
        }
      });

      if (holePoints.length) {
        teamTotal += sumBestN(holePoints, Math.min(4, holePoints.length));
      }
    }

    return { players, teamTotal };
  }, [round, course]);

  const onContinue = () => {
    if (!course) {
      Alert.alert('No course', 'Course data is missing. Set up a course first.', [{ text: 'OK' }]);
      return;
    }

    navigation.navigate('RoundScoring');
  };

  const onArchive = async () => {
    if (!activeRound) return;

    hapticTap();
    setArchiveBusy(true);

    try {
      const courseId = await getActiveCourseId();
      const courseName = course?.name ?? 'No course selected';

      await saveRoundToHistory(activeRound, courseId, courseName, summary?.teamTotal ?? null);
      await clearCurrentRound();

      hapticSuccess();
      toast.show('Archived to History', 'success');
      await refresh();
    } catch {
      hapticError();
      toast.show('Could not archive. Try again.', 'error');
    } finally {
      setArchiveBusy(false);
    }
  };

  const handleReturnHome = () => {
    navigation.navigate('Home');
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
            hapticTap();
            try {
              await clearCurrentRound();
              hapticSuccess();
              toast.show('Cleared', 'success');
              await refresh();
            } catch {
              hapticError();
              toast.show('Could not clear. Try again.', 'error');
            }
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
            <Text style={styles.cardTitle}>{viewingHistory ? 'Historical round' : 'Round status'}</Text>

            <Row label="Course" value={course?.name ?? '— (save a course)'} />
            <Row label="Competition" value={competitionLabel} />
            <Row label="Allowance" value={`${round.allowancePercent}%`} />
            <Row label="Rounding" value={round.roundingMode} />

            {!viewingHistory ? <Row label="Current hole" value={`${round.currentHole}`} /> : null}

            <Row
              label={viewingHistory ? 'Saved' : 'Last saved'}
              value={activeRound ? new Date(activeRound.updatedAt).toLocaleString() : '—'}
            />

            {!viewingHistory ? (
              !activeRound?.isComplete ? (
                <View style={styles.actionsRow}>
                  <PrimaryButton
                    title="Continue round"
                    onPress={onContinue}
                    variant="primary"
                    style={styles.btnFlex}
                  />
                  <PrimaryButton
                    title="Refresh"
                    onPress={() => {
                      void refresh();
                      toast.show('Updated', 'success', 900);
                    }}
                    variant="secondary"
                    style={styles.btnFlex}
                  />
                </View>
              ) : (
                <View style={styles.actionsRow}>
                  <PrimaryButton
                    title="Start New Round"
                    onPress={() => navigation.navigate('RoundSetup')}
                    variant="primary"
                    style={styles.btnFlex}
                  />
                  <PrimaryButton
                    title="Return Home"
                    onPress={handleReturnHome}
                    variant="secondary"
                    style={styles.btnFlex}
                  />
                </View>
              )
            ) : (
              <PrimaryButton
                title="Back to history"
                onPress={() => navigation.navigate('RoundHistory')}
                variant="secondary"
              />
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
                <View style={styles.spacerMd} />

                <PrimaryButton
                  title="Archive to History"
                  onPress={onArchive}
                  loading={archiveBusy}
                  variant="primary"
                  accessibilityLabel="Archive to history"
                  accessibilityHint="Moves this round into your round history"
                />

                <View style={styles.spacerSm} />

                <PrimaryButton
                  title="Clear saved round"
                  onPress={onClear}
                  variant="danger"
                  accessibilityLabel="Clear saved round"
                  accessibilityHint="Removes the saved round without archiving"
                />
              </>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            {activeRound?.isComplete ? (
              <>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => navigation.navigate('RoundSetup')}
                >
                  <Text style={styles.secondaryBtnText}>Start New Round</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={handleReturnHome}>
                  <Text style={styles.primaryBtnText}>Return Home</Text>
                </Pressable>
              </>
            ) : !viewingHistory ? (
              <>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => navigation.navigate('RoundScoring')}
                >
                  <Text style={styles.secondaryBtnText}>Back to Live Scoring</Text>
                </Pressable>
                <Pressable style={styles.primaryBtn} onPress={handleReturnHome}>
                  <Text style={styles.primaryBtnText}>Return Home</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={handleReturnHome}>
                <Text style={styles.primaryBtnText}>Return Home</Text>
              </Pressable>
            )}
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
  container: {
    padding: 16,
    paddingBottom: 28,
    backgroundColor: colors.background,
  },

  title: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 12,
    color: colors.primary,
  },

  muted: {
    color: colors.textSecondary,
  },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
    color: colors.textPrimary,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },

  rowLabel: {
    color: colors.textSecondary,
    fontWeight: '800',
    flex: 1,
  },

  rowValue: {
    color: colors.textPrimary,
    fontWeight: '900',
    textAlign: 'right',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },

  btnFlex: {
    flex: 1,
  },

  warn: {
    color: colors.warning,
    fontWeight: '900',
    marginBottom: 10,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  summaryName: {
    flex: 1,
    fontWeight: '900',
    color: colors.textPrimary,
  },

  summaryVal: {
    width: 72,
    textAlign: 'right',
    fontWeight: '800',
    color: colors.textPrimary,
  },

  teamTotal: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    color: colors.textPrimary,
  },

  teamTotalValue: {
    fontSize: 20,
  },

  spacerMd: {
    height: 10,
  },

  spacerSm: {
    height: 8,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
});
