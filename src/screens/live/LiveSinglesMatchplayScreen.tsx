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
import { getHoleParAndStrokeIndex } from '../../utils/holeMetaFromRound';
import {
  computeSinglesMatchplayMatchSummary,
  getPlayerNetOnHole,
  getSinglesMatchplayHoleResult,
} from '../../core/scoring/singlesMatchplay';
import { buildSinglesMatchplayStatusText } from '../../core/scoring/matchplayDisplay';
import { liveMatchplayStyles as styles } from './liveMatchplayStyles';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveSinglesMatchplay'>;

function parseScore(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n < 1 ? null : Math.floor(n);
}

function currentHoleHoleResultLabel(
  round: PersistedRound,
  holeNumber: number,
  course: Course | null,
  p1Name: string,
  p2Name: string
): string {
  const hole = round.scores.find((s) => s.holeNumber === holeNumber);
  const [p1, p2] = round.players;
  if (!hole || !p1 || !p2) return '—';
  const { strokeIndex } = getHoleParAndStrokeIndex(round, holeNumber, course);
  const g1 = hole.grossByPlayerId?.[p1.id] ?? null;
  const g2 = hole.grossByPlayerId?.[p2.id] ?? null;
  const n1 = getPlayerNetOnHole(typeof g1 === 'number' ? g1 : null, p1, round, strokeIndex);
  const n2 = getPlayerNetOnHole(typeof g2 === 'number' ? g2 : null, p2, round, strokeIndex);
  const r = getSinglesMatchplayHoleResult(n1, n2);
  if (r == null) return 'Enter both gross scores';
  if (r === 'halved') return 'Hole halved';
  if (r === 'p1') return `${p1Name.trim() || 'Player 1'} wins hole`;
  return `${p2Name.trim() || 'Player 2'} wins hole`;
}

export default function LiveSinglesMatchplayScreen({ navigation }: Props) {
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
      if (saved.competition !== 'singles_matchplay' || saved.players.length !== 2) {
        setRound(saved);
        setCourse(activeCourse);
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

  const [p1, p2] = round?.players ?? [];

  const matchSummary = useMemo(() => {
    if (!round || !p1 || !p2) return null;
    return computeSinglesMatchplayMatchSummary(round, course);
  }, [round, course, p1, p2]);

  const runningMargin = useMemo(() => {
    if (!matchSummary || !p1 || !p2) return 0;
    const w1 = matchSummary.winsByPlayerId[p1.id] ?? 0;
    const w2 = matchSummary.winsByPlayerId[p2.id] ?? 0;
    return w1 - w2;
  }, [matchSummary, p1, p2]);

  const statusLine = useMemo(() => {
    if (!matchSummary || !p1 || !p2) return 'All Square';
    return buildSinglesMatchplayStatusText({
      margin: runningMargin,
      holesRemaining: matchSummary.holesRemaining,
      p1,
      p2,
    });
  }, [matchSummary, runningMargin, p1, p2]);

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
      return {
        ...hole,
        grossByPlayerId: {
          ...hole.grossByPlayerId,
          [playerId]: parsed,
        },
      };
    });
    await persist({ ...round, scores: nextScores });
  }

  async function handleFinishRound() {
    if (!round) return;
    await markCurrentRoundComplete();
    Alert.alert('Round complete', 'The round has been marked complete.', [
      { text: 'Return Home', onPress: () => navigation.navigate('Home') },
      { text: 'View Scoreboard', onPress: () => navigation.navigate('Scoreboard') },
    ]);
  }

  if (!round) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading round…</Text>
      </View>
    );
  }

  if (round.competition !== 'singles_matchplay' || !p1 || !p2) {
    return (
      <View style={[styles.flex, { padding: 16 }]}>
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Singles matchplay only</Text>
          <Text style={styles.warnBody}>
            This screen needs a saved round with Singles Matchplay and exactly 2 players.
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

  if (!currentHoleData) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading hole…</Text>
      </View>
    );
  }

  const p1Name = p1.name.trim() || 'Player 1';
  const p2Name = p2.name.trim() || 'Player 2';
  const holeResultText = currentHoleHoleResultLabel(
    round,
    round.currentHole,
    course,
    p1Name,
    p2Name
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>Singles Matchplay</Text>
        <Text style={styles.headerSubtitle}>
          Head-to-head · Lowest net score wins each hole
        </Text>
        <Text style={styles.formatRosterLine}>
          {p1Name} vs {p2Name}
        </Text>
        <Text style={styles.headerMetaLine}>
          {round.allowancePercent}% allowance · {round.roundingMode}
        </Text>

        {hasMissingStrokeIndex(course) ? (
          <StrokeIndexWarningBanner onPressFix={() => navigation.navigate('CourseSetup')} />
        ) : null}

        <View
          style={[
            styles.matchBanner,
            matchSummary && Math.abs(runningMargin) > 0 ? styles.matchBannerActive : null,
          ]}
        >
          <Text style={styles.matchBannerText}>{statusLine}</Text>
        </View>

        <View style={styles.holeHero}>
          <Text style={styles.holeHeroLabel}>CURRENT HOLE</Text>
          <Text style={styles.holeHeroNumber}>{round.currentHole}</Text>
          <Text style={styles.holeHeroMeta}>Holes with scores: {completedCount} / 18</Text>
        </View>

        <Text style={styles.holeSummaryText}>
          <Text style={styles.holeSummaryStrong}>This hole: </Text>
          {holeResultText}
        </Text>

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
          <Text style={styles.sectionTitle}>Gross & net</Text>
          {[p1, p2].map((player, index) => {
            const value = currentHoleData.grossByPlayerId?.[player.id];
            const { strokeIndex } = getHoleParAndStrokeIndex(
              round,
              round.currentHole,
              course
            );
            const net = getPlayerNetOnHole(
              typeof value === 'number' ? value : null,
              player,
              round,
              strokeIndex
            );
            return (
              <View key={player.id} style={styles.playerScoreRow}>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerName}>
                    {index === 0 ? p1Name : p2Name}
                  </Text>
                  <Text style={styles.playerSub}>
                    Playing HCP: {player.playingHandicap ?? '—'} · Net:{' '}
                    {net == null ? '—' : net}
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
                      placeholder="-"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={styles.scoreBoxGroup}>
                    <Text style={styles.scoreBoxLabelMuted}>Net</Text>
                    <View style={styles.netBox}>
                      <Text style={styles.netBoxText}>{net == null ? '—' : net}</Text>
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
                  onPress={() => void jumpToHole(hole)}
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
