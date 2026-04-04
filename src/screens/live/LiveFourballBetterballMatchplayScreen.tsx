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
  computeFourballBetterballMatchSummary,
  getFourballBetterballHoleResult,
  getFourballCurrentHoleLineSummary,
} from '../../core/scoring/fourballBetterballMatchplay';
import { getPlayerNetOnHole } from '../../core/scoring/singlesMatchplay';
import { getFourballSideRosterLines } from '../../core/scoring/matchplayDisplay';
import { liveMatchplayStyles as styles } from './liveMatchplayStyles';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveFourballBetterballMatchplay'>;

function parseScore(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n < 1 ? null : Math.floor(n);
}

function holeResultDescription(
  result: ReturnType<typeof getFourballBetterballHoleResult>
): string {
  if (result == null) return 'Enter all four gross scores';
  if (result === 'halved') return 'Hole halved';
  if (result === 'sideA') return 'Side A wins hole';
  if (result === 'sideB') return 'Side B wins hole';
  return '—';
}

export default function LiveFourballBetterballMatchplayScreen({ navigation }: Props) {
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

  const matchSummary = useMemo(() => {
    if (!round || round.players.length !== 4) return null;
    return computeFourballBetterballMatchSummary(round, course);
  }, [round, course]);

  const holeLine = useMemo(() => {
    if (!round) return null;
    return getFourballCurrentHoleLineSummary(round, round.currentHole, course);
  }, [round, course]);

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

  if (round.competition !== 'fourball_betterball_matchplay' || round.players.length !== 4) {
    return (
      <View style={[styles.flex, { padding: 16 }]}>
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Fourball betterball matchplay only</Text>
          <Text style={styles.warnBody}>
            This screen needs a saved round with Fourball Betterball Matchplay and exactly 4
            players (Side A: Players 1–2, Side B: Players 3–4).
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

  const players = round.players;
  const sideA = players.slice(0, 2);
  const sideB = players.slice(2, 4);
  const { strokeIndex } = getHoleParAndStrokeIndex(round, round.currentHole, course);
  const sideRoster = getFourballSideRosterLines(players);

  const statusBanner = matchSummary?.statusText ?? 'All Square';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>Fourball Betterball Matchplay</Text>
        <Text style={styles.headerSubtitle}>Team best net wins each hole · fixed sides</Text>
        <View style={styles.sideRosterCard}>
          <Text style={styles.sideRosterLine}>{sideRoster.sideALine}</Text>
          <Text style={styles.sideRosterLine}>{sideRoster.sideBLine}</Text>
        </View>
        <Text style={styles.headerMetaLine}>
          {round.allowancePercent}% allowance · {round.roundingMode}
        </Text>

        {hasMissingStrokeIndex(course) ? (
          <StrokeIndexWarningBanner onPressFix={() => navigation.navigate('CourseSetup')} />
        ) : null}

        <View
          style={[
            styles.matchBanner,
            matchSummary && Math.abs(matchSummary.margin) > 0 ? styles.matchBannerActive : null,
          ]}
        >
          <Text style={styles.matchBannerText}>{statusBanner}</Text>
        </View>

        <View style={styles.holeHero}>
          <Text style={styles.holeHeroLabel}>CURRENT HOLE</Text>
          <Text style={styles.holeHeroNumber}>{round.currentHole}</Text>
          <Text style={styles.holeHeroMeta}>Holes with scores: {completedCount} / 18</Text>
        </View>

        {holeLine ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>This hole (best net)</Text>
            <Text style={styles.holeSummaryText}>
              <Text style={styles.holeSummaryStrong}>Side A best net: </Text>
              {holeLine.bestNetSideA == null ? '—' : holeLine.bestNetSideA}
            </Text>
            <Text style={styles.holeSummaryText}>
              <Text style={styles.holeSummaryStrong}>Side B best net: </Text>
              {holeLine.bestNetSideB == null ? '—' : holeLine.bestNetSideB}
            </Text>
            <Text style={styles.holeSummaryText}>
              <Text style={styles.holeSummaryStrong}>Hole result: </Text>
              {holeResultDescription(holeLine.holeResult)}
            </Text>
            <Text style={styles.holeTeamContext}>
              {sideRoster.sideALine} · {sideRoster.sideBLine}
            </Text>
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
          <Text style={styles.sideTitle}>{sideRoster.sideALine}</Text>
          {sideA.map((player, idx) => {
            const value = currentHoleData.grossByPlayerId?.[player.id];
            const net = getPlayerNetOnHole(
              typeof value === 'number' ? value : null,
              player,
              round,
              strokeIndex
            );
            const label = player.name.trim() || `Player ${idx + 1}`;
            return (
              <View key={player.id} style={styles.playerScoreRow}>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerName}>{label}</Text>
                  <Text style={styles.playerSub}>
                    Match strokes: {player.matchStrokes ?? '—'} · Net:{' '}
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
          <Text style={styles.sideTitle}>{sideRoster.sideBLine}</Text>
          {sideB.map((player, idx) => {
            const value = currentHoleData.grossByPlayerId?.[player.id];
            const net = getPlayerNetOnHole(
              typeof value === 'number' ? value : null,
              player,
              round,
              strokeIndex
            );
            const label = player.name.trim() || `Player ${idx + 3}`;
            return (
              <View key={player.id} style={styles.playerScoreRow}>
                <View style={styles.playerMeta}>
                  <Text style={styles.playerName}>{label}</Text>
                  <Text style={styles.playerSub}>
                    Match strokes: {player.matchStrokes ?? '—'} · Net:{' '}
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
