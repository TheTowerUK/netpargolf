import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigations/types';
import { loadActiveCourse } from '../../storage/courseStorage';
import {
  loadCurrentRound,
  markCurrentRoundComplete,
  saveCurrentRound,
  type PersistedRound,
} from '../../storage/roundStorage';
import type { Course } from '../../core/course';
import { hasMissingStrokeIndex } from '../../utils/courseValidation';
import StrokeIndexWarningBanner from '../../components/StrokeIndexWarningBanner';
import { getStablefordHoleBreakdownForPlayer, getStablefordPointsForPlayer } from '../../core/scoring/individualStableford';
import {
  getBetterballHolePoints,
  getBetterballHoleSummaryLines,
  getBetterballRunningTotals,
  getBetterballSideRosterLines,
} from '../../core/scoring/betterballStableford';
import { buildBetterballStablefordLeaderText } from '../../core/scoring/stablefordDisplay';
import { liveStablefordStyles as styles } from './liveStablefordStyles';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveBetterballStableford'>;

function parseScore(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n < 1 ? null : Math.floor(n);
}

export default function LiveBetterballStablefordScreen({ navigation }: Props) {
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
          { text: 'OK', onPress: () => navigation.navigate('CompetitionSelect') },
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

  const currentHoleData = useMemo(() => {
    if (!round) return null;
    return round.scores.find((s) => s.holeNumber === round.currentHole) ?? null;
  }, [round]);

  const sideTotals = useMemo(
    () => (round ? getBetterballRunningTotals(round, course) : { sideA: 0, sideB: 0, byPlayerId: {} }),
    [round, course]
  );

  const holeSummary = useMemo(() => {
    if (!round || round.players.length !== 4) return null;
    return getBetterballHoleSummaryLines(round, round.currentHole, course);
  }, [round, course]);

  const holePoints = useMemo(() => {
    if (!round || round.players.length !== 4) return null;
    return getBetterballHolePoints(round, round.currentHole, course);
  }, [round, course]);

  const leaderBanner = useMemo(() => {
    if (!round || round.players.length !== 4) {
      return { title: '', subtitle: '', supportingText: undefined as string | undefined };
    }
    return buildBetterballStablefordLeaderText({
      sideA: sideTotals.sideA,
      sideB: sideTotals.sideB,
      players: round.players,
      roundComplete: !!round.isComplete,
    });
  }, [round, sideTotals.sideA, sideTotals.sideB]);

  const holeHasDataMap = useMemo(() => {
    if (!round) return new Map<number, boolean>();
    return new Map(
      round.scores.map((hole) => [
        hole.holeNumber,
        Object.values(hole.grossByPlayerId || {}).some((v) => v != null),
      ])
    );
  }, [round]);

  const completedCount = useMemo(() => {
    if (!round) return 0;
    return round.scores.filter((hole) =>
      Object.values(hole.grossByPlayerId || {}).some((v) => v != null)
    ).length;
  }, [round]);

  async function persist(next: PersistedRound) {
    setRound(next);
    await saveCurrentRound(next);
  }

  async function changeHole(delta: number) {
    if (!round) return;
    const nextHole = Math.min(18, Math.max(1, round.currentHole + delta));
    if (nextHole === round.currentHole) return;
    await persist({ ...round, currentHole: nextHole });
  }

  async function jumpToHole(hole: number) {
    if (!round) return;
    await persist({ ...round, currentHole: hole });
  }

  async function updateScore(playerId: string, value: string) {
    if (!round || !currentHoleData) return;
    const parsed = parseScore(value);
    const nextScores = round.scores.map((hole) => {
      if (hole.holeNumber !== round.currentHole) return hole;
      const nextGrossByPlayerId = {
        ...hole.grossByPlayerId,
        [playerId]: parsed,
      };
      const nextPointsByPlayerId: Record<string, number | null> = {
        ...(hole.pointsByPlayerId || {}),
      };
      for (const p of round.players) {
        const g = nextGrossByPlayerId[p.id];
        const gross = typeof g === 'number' ? g : null;
        nextPointsByPlayerId[p.id] = getStablefordPointsForPlayer(
          round,
          p,
          round.currentHole,
          course,
          gross
        );
      }
      return {
        ...hole,
        grossByPlayerId: nextGrossByPlayerId,
        pointsByPlayerId: nextPointsByPlayerId,
      };
    });
    await persist({ ...round, scores: nextScores });
  }

  async function handleFinishRound() {
    if (!round) return;
    await markCurrentRoundComplete();
    Alert.alert('Round complete', 'View side totals on the scoreboard.', [
      { text: 'Home', onPress: () => navigation.navigate('Home') },
      { text: 'Scoreboard', onPress: () => navigation.navigate('Scoreboard') },
    ]);
  }

  if (!round || !currentHoleData) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading round…</Text>
      </View>
    );
  }

  if (round.competition !== 'betterball_stableford' || round.players.length !== 4) {
    return (
      <View style={[styles.flex, { padding: 16 }]}>
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Betterball Stableford only</Text>
          <Text style={styles.warnBody}>
            This format needs exactly four players. Side A uses Players 1–2 and Side B uses Players
            3–4. Best Stableford points on each hole count per side.
          </Text>
        </View>
        <Pressable
          style={[styles.primaryBtn, { marginTop: 16 }]}
          onPress={() => navigation.navigate('CompetitionSelect')}
        >
          <Text style={styles.primaryBtnText}>Choose competition</Text>
        </Pressable>
      </View>
    );
  }

  const roster = getBetterballSideRosterLines(round.players);
  const sideA = round.players.slice(0, 2);
  const sideB = round.players.slice(2, 4);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>Betterball Stableford</Text>
        <Text style={styles.headerSubtitle}>
          Best Stableford points per hole count for each side
        </Text>
        <View style={styles.sideRosterCard}>
          <Text style={styles.sideRosterLine}>{roster.sideALine}</Text>
          <Text style={styles.sideRosterLine}>{roster.sideBLine}</Text>
        </View>
        <Text style={styles.headerMeta}>
          {round.allowancePercent}% allowance · {round.roundingMode}
        </Text>

        {hasMissingStrokeIndex(course) ? (
          <StrokeIndexWarningBanner onPressFix={() => navigation.navigate('CourseSetup')} />
        ) : null}

        <View style={[styles.leaderBanner, styles.leaderBannerStrong]}>
          <Text style={styles.leaderBannerTitle}>{leaderBanner.title}</Text>
          <Text style={styles.leaderBannerSub}>{leaderBanner.subtitle}</Text>
        </View>

        <View style={styles.holeHero}>
          <Text style={styles.holeHeroLabel}>CURRENT HOLE</Text>
          <Text style={styles.holeHeroNumber}>{round.currentHole}</Text>
          <Text style={styles.holeHeroMeta}>Holes with scores: {completedCount} / 18</Text>
        </View>

        {holeSummary ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>This hole</Text>
            <Text style={styles.holeSummaryText}>
              <Text style={styles.holeSummaryStrong}>{holeSummary.sideALine}</Text>
            </Text>
            <Text style={styles.holeSummaryText}>
              <Text style={styles.holeSummaryStrong}>{holeSummary.sideBLine}</Text>
            </Text>
            <Text style={[styles.holeSummaryText, { marginTop: 8 }]}>{holeSummary.countingLine}</Text>
          </View>
        ) : null}

        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, round.currentHole === 1 && styles.navBtnDisabled]}
            onPress={() => void changeHole(-1)}
            disabled={round.currentHole === 1}
          >
            <Text style={styles.navBtnText}>Previous</Text>
          </Pressable>
          <Pressable
            style={[styles.navBtn, round.currentHole === 18 && styles.navBtnDisabled]}
            onPress={() => void changeHole(1)}
            disabled={round.currentHole === 18}
          >
            <Text style={styles.navBtnText}>Next</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sideTitle}>{roster.sideALine}</Text>
          <Text style={styles.runningPts}>
            Side A total: {sideTotals.sideA} pts
            {holePoints?.sideABest != null ? ` · this hole best: ${holePoints.sideABest}` : ''}
          </Text>
          {sideA.map((player) => {
            const value = currentHoleData.grossByPlayerId?.[player.id];
            const gross = typeof value === 'number' ? value : null;
            const breakdown = getStablefordHoleBreakdownForPlayer(
              round,
              player,
              round.currentHole,
              course,
              gross
            );
            const pts = breakdown?.points ?? null;
            const pPts = holePoints?.pointsByPlayerId[player.id];
            const isCounting =
              pPts != null && holePoints?.sideABest != null && pPts === holePoints.sideABest;
            const pointsStyle = [
              styles.pointsBox,
              pts == null
                ? styles.pointsBoxEmpty
                : isCounting
                  ? styles.pointsBoxGood
                  : pts >= 1
                    ? styles.pointsBoxActive
                    : styles.pointsBoxLow,
            ];
            const name = (player.name ?? '').trim() || 'Player';
            return (
              <View key={player.id} style={styles.playerScoreRow}>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerName}>
                    {name} {isCounting ? '(counting)' : ''}
                  </Text>
                  <Text style={styles.playerSub}>
                    Round pts: {sideTotals.byPlayerId[player.id] ?? 0} (individual sum)
                  </Text>
                </View>
                <View style={styles.scoreBoxesWrap}>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabel}>Gross</Text>
                    <TextInput
                      value={value == null ? '' : String(value)}
                      onChangeText={(v) => void updateScore(player.id, v)}
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      placeholder="—"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabelMuted}>Net</Text>
                    <View style={styles.miniBox}>
                      <Text style={styles.miniBoxText}>{breakdown ? breakdown.net : '—'}</Text>
                    </View>
                  </View>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabelMuted}>Pts</Text>
                    <View style={pointsStyle}>
                      <Text style={styles.pointsBoxText}>{pts == null ? '—' : pts}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sideTitle}>{roster.sideBLine}</Text>
          <Text style={styles.runningPts}>
            Side B total: {sideTotals.sideB} pts
            {holePoints?.sideBBest != null ? ` · this hole best: ${holePoints.sideBBest}` : ''}
          </Text>
          {sideB.map((player) => {
            const value = currentHoleData.grossByPlayerId?.[player.id];
            const gross = typeof value === 'number' ? value : null;
            const breakdown = getStablefordHoleBreakdownForPlayer(
              round,
              player,
              round.currentHole,
              course,
              gross
            );
            const pts = breakdown?.points ?? null;
            const pPts = holePoints?.pointsByPlayerId[player.id];
            const isCounting =
              pPts != null && holePoints?.sideBBest != null && pPts === holePoints.sideBBest;
            const pointsStyle = [
              styles.pointsBox,
              pts == null
                ? styles.pointsBoxEmpty
                : isCounting
                  ? styles.pointsBoxGood
                  : pts >= 1
                    ? styles.pointsBoxActive
                    : styles.pointsBoxLow,
            ];
            const name = (player.name ?? '').trim() || 'Player';
            return (
              <View key={player.id} style={styles.playerScoreRow}>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerName}>
                    {name} {isCounting ? '(counting)' : ''}
                  </Text>
                  <Text style={styles.playerSub}>
                    Round pts: {sideTotals.byPlayerId[player.id] ?? 0} (individual sum)
                  </Text>
                </View>
                <View style={styles.scoreBoxesWrap}>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabel}>Gross</Text>
                    <TextInput
                      value={value == null ? '' : String(value)}
                      onChangeText={(v) => void updateScore(player.id, v)}
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      placeholder="—"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabelMuted}>Net</Text>
                    <View style={styles.miniBox}>
                      <Text style={styles.miniBoxText}>{breakdown ? breakdown.net : '—'}</Text>
                    </View>
                  </View>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabelMuted}>Pts</Text>
                    <View style={pointsStyle}>
                      <Text style={styles.pointsBoxText}>{pts == null ? '—' : pts}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick hole jump</Text>
          <View style={styles.holeGrid}>
            {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => (
              <Pressable
                key={hole}
                style={[
                  styles.holeChip,
                  hole === round.currentHole && styles.holeChipSelected,
                  holeHasDataMap.get(hole) && styles.holeChipComplete,
                ]}
                onPress={() => void jumpToHole(hole)}
              >
                <Text
                  style={[
                    styles.holeChipText,
                    hole === round.currentHole && styles.holeChipTextSelected,
                  ]}
                >
                  {hole}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.tertiaryBtn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.tertiaryBtnText}>Home</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Scoreboard')}
          >
            <Text style={styles.secondaryBtnText}>Scoreboard</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={() => void handleFinishRound()}>
            <Text style={styles.primaryBtnText}>Finish</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
