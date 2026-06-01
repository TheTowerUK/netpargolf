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
  type HoleScoreState,
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
import { getNonReturnFromHole, getPlayerStatus, isPlayerExcludedByNonReturn } from '../../core/scoring/stablefordState';
import { getHoleParAndStrokeIndex } from '../../utils/holeMetaFromRound';
import { liveStablefordStyles as styles } from './liveStablefordStyles';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveBetterballStableford'>;

function parseScore(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n < 1 ? null : Math.floor(n);
}

function formatGrossEntry(value: number | null): string {
  return value == null ? '' : String(value);
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
  const currentHolePar = useMemo(() => {
    if (!round) return null;
    return getHoleParAndStrokeIndex(round, round.currentHole, course).par;
  }, [round, course]);

  const holeHasDataMap = useMemo(() => {
    if (!round) return new Map<number, boolean>();
    return new Map(
      round.scores.map((hole) => [
        hole.holeNumber,
        round.players.some((p) => {
          if (isPlayerExcludedByNonReturn(round, p.id, hole.holeNumber)) return true;
          const state = hole.scoreStateByPlayerId?.[p.id] ?? 'pending';
          return state === 'entered' || state === 'pickup';
        }),
      ])
    );
  }, [round]);

  const completedCount = useMemo(() => {
    if (!round) return 0;
    return round.scores.filter((hole) =>
      round.players.every((p) => {
        if (isPlayerExcludedByNonReturn(round, p.id, hole.holeNumber)) return true;
        const state = hole.scoreStateByPlayerId?.[p.id] ?? 'pending';
        return state === 'entered' || state === 'pickup';
      })
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
    if (isPlayerExcludedByNonReturn(round, playerId, round.currentHole)) return;
    const parsed = parseScore(value);
    const nextScores = round.scores.map((hole) => {
      if (hole.holeNumber !== round.currentHole) return hole;
      const nextGrossByPlayerId = {
        ...hole.grossByPlayerId,
        [playerId]: parsed,
      };
      const nextStateByPlayerId: Record<string, HoleScoreState> = {
        ...(hole.scoreStateByPlayerId || {}),
        [playerId]: parsed == null ? 'pending' : 'entered',
      };
      const nextPointsByPlayerId: Record<string, number | null> = {
        ...(hole.pointsByPlayerId || {}),
      };
      for (const p of round.players) {
        const g = nextGrossByPlayerId[p.id];
        const gross = typeof g === 'number' ? g : null;
        const state = nextStateByPlayerId[p.id] ?? 'pending';
        nextPointsByPlayerId[p.id] = getStablefordPointsForPlayer(
          round,
          p,
          round.currentHole,
          course,
          gross,
          state
        );
      }
      return {
        ...hole,
        grossByPlayerId: nextGrossByPlayerId,
        scoreStateByPlayerId: nextStateByPlayerId,
        pointsByPlayerId: nextPointsByPlayerId,
      };
    });
    await persist({ ...round, scores: nextScores });
  }

  async function markPickup(playerId: string) {
    if (!round || !currentHoleData) return;
    if (isPlayerExcludedByNonReturn(round, playerId, round.currentHole)) return;
    const nextScores = round.scores.map((hole) => {
      if (hole.holeNumber !== round.currentHole) return hole;
      const nextGrossByPlayerId = { ...hole.grossByPlayerId, [playerId]: null };
      const nextStateByPlayerId: Record<string, HoleScoreState> = {
        ...(hole.scoreStateByPlayerId || {}),
        [playerId]: 'pickup',
      };
      const nextPointsByPlayerId: Record<string, number | null> = { ...(hole.pointsByPlayerId || {}) };
      for (const p of round.players) {
        const g = nextGrossByPlayerId[p.id];
        const gross = typeof g === 'number' ? g : null;
        const state = nextStateByPlayerId[p.id] ?? 'pending';
        nextPointsByPlayerId[p.id] = getStablefordPointsForPlayer(round, p, round.currentHole, course, gross, state);
      }
      return { ...hole, grossByPlayerId: nextGrossByPlayerId, scoreStateByPlayerId: nextStateByPlayerId, pointsByPlayerId: nextPointsByPlayerId };
    });
    await persist({ ...round, scores: nextScores });
  }

  async function markNonReturn(playerId: string) {
    if (!round) return;
    Alert.alert('Mark player as NR?', 'This marks the player as Non Return for the rest of the round. Existing holes stay visible.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark NR',
        style: 'destructive',
        onPress: () => {
          const next = {
            ...round,
            playerStatusById: { ...(round.playerStatusById || {}), [playerId]: 'non_return' as const },
            nonReturnFromHoleByPlayerId: {
              ...(round.nonReturnFromHoleByPlayerId || {}),
              [playerId]: getNonReturnFromHole(round, playerId) ?? round.currentHole,
            },
          };
          void persist(next);
        },
      },
    ]);
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

  function renderBetterballPlayerRow(
    player: (typeof round.players)[number],
    sideBest: number | null | undefined
  ) {
    const value = currentHoleData.grossByPlayerId?.[player.id];
    const gross = typeof value === 'number' ? value : null;
    const state =
      currentHoleData.scoreStateByPlayerId?.[player.id] ?? (gross != null ? 'entered' : 'pending');
    const isNR = isPlayerExcludedByNonReturn(round, player.id, round.currentHole);
    const breakdown = getStablefordHoleBreakdownForPlayer(
      round,
      player,
      round.currentHole,
      course,
      gross,
      state
    );
    const pts = getStablefordPointsForPlayer(round, player, round.currentHole, course, gross, state);
    const pPts = holePoints?.pointsByPlayerId[player.id];
    const isCounting = pPts != null && sideBest != null && pPts === sideBest;
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
    const roundPts = sideTotals.byPlayerId[player.id] ?? 0;
    const playerNr = getPlayerStatus(round, player.id) === 'non_return';

    return (
      <View key={player.id} style={styles.stackedPlayerBlock}>
        <View style={styles.stackedPlayerHeader}>
          <Text style={styles.stackedPlayerName} numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Text>
          {isCounting ? (
            <>
              <Text style={styles.stackedHeaderSep}>•</Text>
              <Text style={styles.stackedCounting}>Counting</Text>
            </>
          ) : null}
          <Text style={styles.stackedHeaderSep}>•</Text>
          <Text style={styles.stackedPtsMuted}>Pts: {roundPts}</Text>
        </View>
        {playerNr ? (
          <Text style={styles.stackedNrLine}>
            NR from hole {getNonReturnFromHole(round, player.id) ?? round.currentHole}
          </Text>
        ) : null}
        <View style={styles.scoreBoxesRowStacked}>
          <View style={styles.scoreBoxGroupStacked}>
            <Text style={styles.scoreBoxLabel}>Gross</Text>
            <TextInput
              value={state === 'pickup' ? 'PU' : isNR ? 'NR' : formatGrossEntry(gross)}
              onChangeText={(v) => void updateScore(player.id, v)}
              style={styles.scoreInput}
              keyboardType="number-pad"
              inputMode="numeric"
              editable={!isNR && state !== 'pickup'}
              placeholder={isNR ? 'NR' : '—'}
              placeholderTextColor="#9ca3af"
            />
          </View>
          <View style={styles.scoreBoxGroupStacked}>
            <Text style={styles.scoreBoxLabelMuted}>Net</Text>
            <View style={styles.miniBox}>
              <Text style={styles.miniBoxText}>{breakdown ? breakdown.net : '—'}</Text>
            </View>
          </View>
          <View style={styles.scoreBoxGroupStacked}>
            <Text style={styles.scoreBoxLabelMuted}>Pts</Text>
            <View style={pointsStyle}>
              <Text style={styles.pointsBoxText}>{isNR ? 'NR' : pts == null ? '—' : pts}</Text>
            </View>
          </View>
          <View style={styles.scoreBoxGroupStacked}>
            <Text style={styles.scoreBoxLabelMuted}>State</Text>
            <Pressable
              style={[styles.miniBox, isNR && { opacity: 0.45 }]}
              onPress={() => void markPickup(player.id)}
              disabled={isNR}
            >
              <Text style={styles.miniBoxText}>PU</Text>
            </Pressable>
          </View>
          <View style={styles.scoreBoxGroupStacked}>
            <Text style={styles.scoreBoxLabelMuted}>Round</Text>
            <Pressable
              style={[styles.miniBox, playerNr && { borderColor: '#f87171' }]}
              onPress={() => void markNonReturn(player.id)}
            >
              <Text style={styles.miniBoxText}>NR</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

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
          <Text style={styles.holeHeroMeta}>
            {`Hole ${round.currentHole} of 18${currentHolePar != null ? ` • Par ${currentHolePar}` : ''}`}
          </Text>
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
          {sideA.map((player) => renderBetterballPlayerRow(player, holePoints?.sideABest))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sideTitle}>{roster.sideBLine}</Text>
          <Text style={styles.runningPts}>
            Side B total: {sideTotals.sideB} pts
            {holePoints?.sideBBest != null ? ` · this hole best: ${holePoints.sideBBest}` : ''}
          </Text>
          {sideB.map((player) => renderBetterballPlayerRow(player, holePoints?.sideBBest))}
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
