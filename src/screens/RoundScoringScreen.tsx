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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import { loadActiveCourse } from '../storage/courseStorage';
import {
  loadCurrentRound,
  markCurrentRoundComplete,
  saveCurrentRound,
  type PersistedRound,
} from '../storage/roundStorage';
import type { Course } from '../core/course';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundScoring'>;

type MatchHoleOutcome = 'win' | 'loss' | 'halved' | null;

function parseScore(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n < 1 ? null : Math.floor(n);
}

function computePlayingHandicap(
  courseHandicap: number,
  allowancePercent: number,
  roundingMode: 'floor' | 'round' | 'ceil'
): number {
  const raw = courseHandicap * (allowancePercent / 100);
  if (roundingMode === 'floor') return Math.floor(raw);
  if (roundingMode === 'ceil') return Math.ceil(raw);
  return Math.round(raw);
}

function shotsReceivedForHole(
  playingHandicap: number,
  strokeIndex: number
): number {
  if (playingHandicap <= 0) return 0;

  const fullRounds = Math.floor(playingHandicap / 18);
  const remainder = playingHandicap % 18;

  return fullRounds + (strokeIndex <= remainder ? 1 : 0);
}

function computeStablefordPoints(params: {
  gross: number | null;
  par: number | null;
  strokeIndex: number | null;
  courseHandicap: number | null;
  allowancePercent: number;
  roundingMode: 'floor' | 'round' | 'ceil';
}): number | null {
  const {
    gross,
    par,
    strokeIndex,
    courseHandicap,
    allowancePercent,
    roundingMode,
  } = params;

  if (
    gross == null ||
    par == null ||
    strokeIndex == null ||
    courseHandicap == null
  ) {
    return null;
  }

  const playingHandicap = computePlayingHandicap(
    courseHandicap,
    allowancePercent,
    roundingMode
  );

  const shots = shotsReceivedForHole(playingHandicap, strokeIndex);
  const netScore = gross - shots;
  const points = 2 + (par - netScore);

  return Math.max(0, points);
}

function getHoleMeta(round: PersistedRound, holeNumber: number, course: Course | null) {
  const holeScore = round.scores.find((s) => s.holeNumber === holeNumber) as any;

  const roundHoles = (round as any).holes;
  const roundHole = Array.isArray(roundHoles)
    ? roundHoles.find(
        (h: any) =>
          h?.holeNumber === holeNumber ||
          h?.number === holeNumber ||
          h?.hole === holeNumber
      )
    : null;

  const courseHole =
    course?.holes?.find((h) => h.holeNumber === holeNumber) ??
    course?.holes?.[holeNumber - 1];

  const par =
    holeScore?.par ??
    holeScore?.holePar ??
    roundHole?.par ??
    courseHole?.par ??
    null;

  const strokeIndex =
    holeScore?.strokeIndex ??
    holeScore?.si ??
    holeScore?.stroke ??
    roundHole?.strokeIndex ??
    roundHole?.si ??
    roundHole?.stroke ??
    courseHole?.strokeIndex ??
    null;

  return {
    par: typeof par === 'number' ? par : null,
    strokeIndex: typeof strokeIndex === 'number' ? strokeIndex : null,
  };
}

function getMatchHoleOutcome(
  hole: PersistedRound['scores'][number] | null | undefined,
  playerId: string,
  opponentId: string
): MatchHoleOutcome {
  if (!hole) return null;

  const playerGross = hole.grossByPlayerId?.[playerId] ?? null;
  const opponentGross = hole.grossByPlayerId?.[opponentId] ?? null;

  if (playerGross == null || opponentGross == null) return null;
  if (playerGross < opponentGross) return 'win';
  if (playerGross > opponentGross) return 'loss';
  return 'halved';
}

function formatMatchHoleOutcome(outcome: MatchHoleOutcome): string {
  if (outcome === 'win') return 'Win';
  if (outcome === 'loss') return 'Loss';
  if (outcome === 'halved') return 'Halved';
  return '—';
}

function computeMatchSummary(round: PersistedRound): {
  leaderPlayerId: string | null;
  leaderName: string | null;
  lead: number;
  holesCompleted: number;
  holesRemaining: number;
  statusText: string;
  isDormieLike: boolean;
} {
  const [playerA, playerB] = round.players;

  if (!playerA || !playerB) {
    return {
      leaderPlayerId: null,
      leaderName: null,
      lead: 0,
      holesCompleted: 0,
      holesRemaining: 18,
      statusText: 'Add 2 players for matchplay',
      isDormieLike: false,
    };
  }

  let aWins = 0;
  let bWins = 0;
  let holesCompleted = 0;

  for (const hole of round.scores) {
    const a = hole.grossByPlayerId?.[playerA.id] ?? null;
    const b = hole.grossByPlayerId?.[playerB.id] ?? null;

    if (a == null || b == null) continue;

    holesCompleted += 1;
    if (a < b) aWins += 1;
    else if (b < a) bWins += 1;
  }

  const diff = aWins - bWins;
  const holesRemaining = Math.max(0, 18 - holesCompleted);
  const lead = Math.abs(diff);

  if (diff === 0) {
    return {
      leaderPlayerId: null,
      leaderName: null,
      lead: 0,
      holesCompleted,
      holesRemaining,
      statusText: holesCompleted === 0 ? 'All Square' : 'All Square',
      isDormieLike: false,
    };
  }

  const leader = diff > 0 ? playerA : playerB;
  const isClosedOut = lead > holesRemaining;
  const isDormieLike = lead === holesRemaining && holesRemaining > 0;

  return {
    leaderPlayerId: leader.id,
    leaderName: leader.name || 'Leader',
    lead,
    holesCompleted,
    holesRemaining,
    statusText: isClosedOut
      ? `${leader.name || 'Leader'} ${lead} & ${holesRemaining}`
      : `${leader.name || 'Leader'} ${lead} Up`,
    isDormieLike,
  };
}

export default function RoundScoringScreen({ navigation }: Props) {
  const [round, setRound] = useState<PersistedRound | null>(null);
  const [course, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [saved, activeCourse] = await Promise.all([
        loadCurrentRound(),
        loadActiveCourse(),
      ]);
      if (!mounted) return;

      if (!saved) {
        Alert.alert('No round found', 'Please set up a round first.', [
          { text: 'OK', onPress: () => navigation.navigate('RoundSetup') },
        ]);
        return;
      }

      setRound(saved);
      setCourse(activeCourse);
    })();

    return () => {
      mounted = false;
    };
  }, [navigation]);

  const isMatchplay = round?.competition === 'matchplay';

  const currentHoleData = useMemo(() => {
    if (!round) return null;
    return round.scores.find((s) => s.holeNumber === round.currentHole) ?? null;
  }, [round]);

  const pointsByPlayerId = useMemo(() => {
    if (!currentHoleData) return {} as Record<string, number | null>;
    return currentHoleData.pointsByPlayerId ?? {};
  }, [currentHoleData]);

  const holeHasDataMap = useMemo(() => {
    if (!round) return new Map<number, boolean>();

    return new Map(
      round.scores.map((hole) => [
        hole.holeNumber,
        Object.values(hole.grossByPlayerId || {}).some((v) => v != null),
      ])
    );
  }, [round]);

  const matchSummary = useMemo(() => {
    if (!round || !isMatchplay) return null;
    return computeMatchSummary(round);
  }, [round, isMatchplay]);

  const matchOpponentId = useMemo(() => {
    if (!round || !isMatchplay || round.players.length < 2) return null;
    return round.players[1]?.id ?? null;
  }, [round, isMatchplay]);

  async function persist(next: PersistedRound) {
    setRound(next);
    await saveCurrentRound(next);
  }

  async function changeHole(delta: number) {
    if (!round) return;
    const nextHole = Math.min(18, Math.max(1, round.currentHole + delta));
    if (nextHole === round.currentHole) return;

    await persist({
      ...round,
      currentHole: nextHole,
    });
  }

  async function jumpToHole(hole: number) {
    if (!round) return;
    await persist({
      ...round,
      currentHole: hole,
    });
  }

  async function updateScore(playerId: string, value: string) {
    if (!round || !currentHoleData) return;

    const parsed = parseScore(value);
    const { par, strokeIndex } = getHoleMeta(round, round.currentHole, course);

    const nextScores = round.scores.map((hole) => {
      if (hole.holeNumber !== round.currentHole) return hole;

      const nextGrossByPlayerId = {
        ...hole.grossByPlayerId,
        [playerId]: parsed,
      };

      const nextPointsByPlayerId: Record<string, number | null> = {
        ...(hole.pointsByPlayerId || {}),
      };

      for (const player of round.players) {
        const gross = nextGrossByPlayerId[player.id] ?? null;

        nextPointsByPlayerId[player.id] = computeStablefordPoints({
          gross,
          par,
          strokeIndex,
          courseHandicap: player.courseHandicap,
          allowancePercent: round.allowancePercent,
          roundingMode: round.roundingMode,
        });
      }

      return {
        ...hole,
        grossByPlayerId: nextGrossByPlayerId,
        pointsByPlayerId: nextPointsByPlayerId,
      };
    });

    await persist({
      ...round,
      scores: nextScores,
    });
  }

  const completedCount = useMemo(() => {
    if (!round) return 0;
    return round.scores.filter((hole) =>
      Object.values(hole.grossByPlayerId || {}).some((v) => v != null)
    ).length;
  }, [round]);

  function handleViewScoreboard() {
    if (!round) return;
    navigation.navigate('Scoreboard');
  }

  async function handleFinishRound() {
    if (!round) return;

    await markCurrentRoundComplete();

    Alert.alert(
      'Round complete',
      'The round has been marked complete and is ready for scoreboard/history.',
      [
        {
          text: 'Return Home',
          onPress: () => navigation.navigate('Home'),
        },
        {
          text: 'View Scoreboard',
          onPress: () => navigation.navigate('Scoreboard'),
        },
      ]
    );
  }

  if (!round || !currentHoleData) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading round…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>Live Scoring</Text>
        <Text style={styles.headerSubtitle}>
          {round.competition.replaceAll('_', ' ')} · {round.allowancePercent}% ·{' '}
          {round.roundingMode}
        </Text>

        <View style={styles.holeHero}>
          <Text style={styles.holeHeroLabel}>CURRENT HOLE</Text>
          <Text style={styles.holeHeroNumber}>{round.currentHole}</Text>
          <Text style={styles.holeHeroMeta}>
            Completed holes: {completedCount} / 18
          </Text>
        </View>

        {isMatchplay && matchSummary && (
          <View
            style={[
              styles.matchBanner,
              matchSummary.lead > 0 && styles.matchBannerActive,
            ]}
          >
            <Text style={styles.matchBannerText}>{matchSummary.statusText}</Text>
            {matchSummary.isDormieLike && (
              <Text style={styles.matchBannerSubtext}>
                Match is dormie-like: leader leads by the number of holes remaining.
              </Text>
            )}
          </View>
        )}

        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, round.currentHole === 1 && styles.navBtnDisabled]}
            onPress={() => changeHole(-1)}
            disabled={round.currentHole === 1}
          >
            <Text style={styles.navBtnText}>Previous</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, round.currentHole === 18 && styles.navBtnDisabled]}
            onPress={() => changeHole(1)}
            disabled={round.currentHole === 18}
          >
            <Text style={styles.navBtnText}>Next</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {isMatchplay ? 'Enter scores / hole result' : 'Enter scores'}
          </Text>

          {round.players.map((player, index) => {
            const value = currentHoleData.grossByPlayerId?.[player.id];

            const points = pointsByPlayerId[player.id];
            const pointsBoxStyle = [
              styles.pointsBox,
              points == null
                ? styles.pointsBoxEmpty
                : points >= 3
                ? styles.pointsBoxGood
                : points >= 1
                ? styles.pointsBoxActive
                : styles.pointsBoxLow,
            ];

            const opponentId =
              isMatchplay && round.players.length >= 2
                ? index === 0
                  ? round.players[1]?.id ?? null
                  : index === 1
                  ? round.players[0]?.id ?? null
                  : null
                : null;

            const matchOutcome = isMatchplay
              ? getMatchHoleOutcome(currentHoleData, player.id, opponentId ?? '')
              : null;

            const resultBoxStyle = [
              styles.pointsBox,
              matchOutcome == null
                ? styles.pointsBoxEmpty
                : matchOutcome === 'win'
                ? styles.resultBoxWin
                : matchOutcome === 'loss'
                ? styles.resultBoxLoss
                : styles.resultBoxHalved,
            ];

            return (
              <View key={player.id} style={styles.playerScoreRow}>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerName}>{player.name || 'Player'}</Text>
                  <Text style={styles.playerSub}>
                    HI: {player.handicapIndex ?? '-'} · CH: {player.courseHandicap ?? '-'}
                  </Text>
                </View>

                <View style={styles.scoreBoxesWrap}>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabel}>Gross</Text>
                    <TextInput
                      value={value == null ? '' : String(value)}
                      onChangeText={(v) => updateScore(player.id, v)}
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      placeholder="-"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabelMuted}>
                      {isMatchplay ? 'Result' : 'Points'}
                    </Text>

                    {isMatchplay ? (
                      <View style={resultBoxStyle}>
                        <Text style={styles.pointsBoxText}>
                          {formatMatchHoleOutcome(matchOutcome)}
                        </Text>
                      </View>
                    ) : (
                      <View style={pointsBoxStyle}>
                        <Text style={styles.pointsBoxText}>
                          {points == null ? '—' : points}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick hole jump</Text>
          <View style={styles.holeGrid}>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
              const selected = hole === round.currentHole;
              const hasData = holeHasDataMap.get(hole) === true;

              return (
                <Pressable
                  key={hole}
                  style={[
                    styles.holeChip,
                    selected && styles.holeChipSelected,
                    hasData && styles.holeChipComplete,
                  ]}
                  onPress={() => jumpToHole(hole)}
                >
                  <Text
                    style={[
                      styles.holeChipText,
                      selected && styles.holeChipTextSelected,
                    ]}
                  >
                    {hole}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={styles.tertiaryBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.tertiaryBtnText}>Home</Text>
          </Pressable>

          <Pressable style={styles.secondaryBtn} onPress={handleViewScoreboard}>
            <Text style={styles.secondaryBtnText}>Scoreboard</Text>
          </Pressable>

          <Pressable style={styles.primaryBtn} onPress={handleFinishRound}>
            <Text style={styles.primaryBtnText}>Finish Round</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#07110b',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07110b',
    padding: 24,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 16,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#d1d5db',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  holeHero: {
    backgroundColor: '#0b1510',
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2a23',
  },
  holeHeroLabel: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  holeHeroNumber: {
    color: '#ffffff',
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 84,
    marginTop: 4,
  },
  holeHeroMeta: {
    color: '#d1d5db',
    fontSize: 14,
    marginTop: 4,
  },
  matchBanner: {
    backgroundColor: '#101915',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e3b33',
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  matchBannerActive: {
    backgroundColor: '#123222',
    borderColor: '#1f7a46',
  },
  matchBannerText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  matchBannerSubtext: {
    color: '#d1d5db',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
  },
  navBtn: {
    flex: 1,
    backgroundColor: '#14532d',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  card: {
    backgroundColor: '#0b1510',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2a23',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  playerScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  playerMeta: {
    flex: 1,
    paddingRight: 4,
  },
  playerName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  playerSub: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  scoreBoxesWrap: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  scoreBoxGroup: {
    alignItems: 'center',
  },
  scoreBoxLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  scoreBoxLabelMuted: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  scoreInput: {
    width: 78,
    minHeight: 58,
    backgroundColor: '#101915',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#16a34a',
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    paddingVertical: 10,
  },
  pointsBox: {
    width: 84,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  pointsBoxEmpty: {
    backgroundColor: '#0f1713',
    borderColor: '#2e3b33',
  },
  pointsBoxLow: {
    backgroundColor: '#17201b',
    borderColor: '#3f4d45',
  },
  pointsBoxActive: {
    backgroundColor: '#123222',
    borderColor: '#1f7a46',
  },
  pointsBoxGood: {
    backgroundColor: '#14532d',
    borderColor: '#16a34a',
  },
  resultBoxWin: {
    backgroundColor: '#14532d',
    borderColor: '#16a34a',
  },
  resultBoxLoss: {
    backgroundColor: '#1f1f1f',
    borderColor: '#3f4d45',
  },
  resultBoxHalved: {
    backgroundColor: '#17201b',
    borderColor: '#4b5563',
  },
  pointsBoxText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  holeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  holeChip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: '#334155',
  },
  holeChipSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  holeChipComplete: {
    borderColor: '#86efac',
  },
  holeChipText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  holeChipTextSelected: {
    color: '#ffffff',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  tertiaryBtn: {
    flex: 1,
    backgroundColor: '#101915',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2e3b33',
    paddingVertical: 15,
    alignItems: 'center',
  },
  tertiaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#1f2a23',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
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
