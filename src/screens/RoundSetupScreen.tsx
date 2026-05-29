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
import {
  buildInitialRound,
  clearCurrentRound,
  loadCurrentRound,
  saveCurrentRound,
  type PersistedPlayer,
  type PersistedRound,
  type RoundingMode,
} from '../storage/roundStorage';
import { COMPETITION_OPTIONS, type RoundCompetition } from '../types/competition';
import { getCompetitionLabel, getCompetitionShortLabel } from '../utils/competitionLabels';
import { navigateToLiveForCompetition } from '../utils/competitionNavigation';
import type { Course, CourseTee } from '../core/course';
import { loadActiveCourse } from '../storage/courseStorage';
import { hasMissingStrokeIndex } from '../utils/courseValidation';
import StrokeIndexWarningBanner from '../components/StrokeIndexWarningBanner';
import { hapticTap } from '../utils/feedback';
import { calculateStrokesOnHole } from '../core/scoring';
import {
  applyRounding,
  calculateCompetitionHandicaps,
  calculateCourseHandicap,
  calculateRawCourseHandicap,
} from '../core/handicap';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundSetup'>;

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_ALLOWANCE_BY_COMPETITION: Record<RoundCompetition, number> = {
  individual_stableford: 100,
  betterball_stableford: 85,
  singles_matchplay: 100,
  fourball_betterball_matchplay: 90,
};

const ROUNDING_OPTIONS: { key: RoundingMode; label: string }[] = [
  { key: 'floor', label: 'Floor (round down)' },
  { key: 'round', label: 'Round (nearest)' },
  { key: 'ceil', label: 'Ceil (round up)' },
];

const ROUNDING_LABELS: Record<RoundingMode, string> = {
  floor: 'Floor (round down)',
  round: 'Round (nearest)',
  ceil: 'Ceil (round up)',
};

function sanitiseIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/** Keeps one decimal separator and at most one digit after it (WHS HI); max 5 chars. */
function sanitizeHiInput(value: string): string {
  let normalised = value.replace(',', '.').replace(/[^0-9.]/g, '');
  if (normalised.startsWith('.')) {
    normalised = `0${normalised}`;
  }
  const parts = normalised.split('.');
  const intPart = parts[0] ?? '';
  if (parts.length === 1) {
    return intPart.slice(0, 5);
  }
  const fracRaw = parts.slice(1).join('').replace(/\./g, '');
  const frac = fracRaw.slice(0, 1);
  if (frac.length > 0) {
    return `${intPart}.${frac}`.slice(0, 5);
  }
  return `${intPart}.`.slice(0, 5);
}

function handicapIndexFromDraft(safeValue: string): number | null {
  if (safeValue === '' || safeValue === '.') return null;
  const n = Number(safeValue);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function makeBlankPlayer(): PersistedPlayer {
  return {
    id: makeId('player'),
    name: '',
    handicapIndex: null,
    rawCourseHandicap: null,
    courseHandicap: null,
    rawPlayingHandicap: null,
    playingHandicap: null,
    matchStrokes: null,
  };
}

function getAllowedPlayerCounts(competition: RoundCompetition): number[] {
  switch (competition) {
    case 'individual_stableford':
      return [1, 2, 3, 4];
    case 'betterball_stableford':
      return [4];
    case 'singles_matchplay':
      return [2];
    case 'fourball_betterball_matchplay':
      return [4];
    default:
      return [1, 2, 3, 4];
  }
}

export default function RoundSetupScreen({ navigation, route }: Props) {
  const selectedCompetition = route.params?.competition ?? 'individual_stableford';
  const competition = selectedCompetition;
  const [allowancePercent, setAllowancePercent] = useState('100');
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('round');
  const [players, setPlayers] = useState<PersistedPlayer[]>([makeBlankPlayer()]);
  const [activeRound, setActiveRound] = useState<PersistedRound | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [selectedTeeIndex, setSelectedTeeIndex] = useState(0);
  const [selectedShotsPreviewPlayerId, setSelectedShotsPreviewPlayerId] = useState<string | null>(null);
  /** Text shown in HI field while typing (avoids losing a trailing "." before digits). */
  const [handicapIndexDraftById, setHandicapIndexDraftById] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [existing, activeCourse] = await Promise.all([
        loadCurrentRound(),
        loadActiveCourse(),
      ]);
      if (!mounted) return;
      setActiveRound(existing);
      setCourse(activeCourse);
      if (activeCourse?.tees?.length) {
        setSelectedTeeIndex(0);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setAllowancePercent(String(DEFAULT_ALLOWANCE_BY_COMPETITION[selectedCompetition]));
  }, [selectedCompetition]);

  const playerCountLabel = useMemo(() => {
    return `${players.length} player${players.length === 1 ? '' : 's'}`;
  }, [players.length]);
  const allowedPlayerCounts = useMemo(
    () => getAllowedPlayerCounts(competition),
    [competition]
  );
  const hasVariablePlayerCount = allowedPlayerCounts.length > 1;
  const selectedCompetitionOption = useMemo(
    () =>
      COMPETITION_OPTIONS.find((option) => option.key === selectedCompetition) ??
      COMPETITION_OPTIONS[0],
    [selectedCompetition]
  );

  const selectedTee: CourseTee | null = useMemo(() => {
    if (!course?.tees?.length) return null;
    const index = Math.min(Math.max(0, selectedTeeIndex), course.tees.length - 1);
    return course.tees[index] ?? null;
  }, [course, selectedTeeIndex]);

  function recalcPlayerHandicaps(nextPlayers: PersistedPlayer[]): PersistedPlayer[] {
    return calculateCompetitionHandicaps({
      players: nextPlayers,
      competition,
      allowancePercent: Number(allowancePercent) || 100,
      roundingMode,
      slopeRating: selectedTee?.slopeRating ?? null,
      courseRating: selectedTee?.courseRating ?? null,
      par: selectedTee?.par ?? null,
    });
  }

  const lowestRawCourseHandicapIds = useMemo(() => {
    const withRaw = players.filter(
      (p) => p.rawCourseHandicap != null && Number.isFinite(p.rawCourseHandicap)
    );
    if (!withRaw.length) return new Set<string>();
    const min = Math.min(...withRaw.map((p) => p.rawCourseHandicap!));
    return new Set(withRaw.filter((p) => p.rawCourseHandicap === min).map((p) => p.id));
  }, [players]);

  /** Strokes basis for hole allocation preview: playing HCP or match strokes. */
  const strokesPreviewList = useMemo(() => {
    const pct = parseFloat(allowancePercent);
    if (!Number.isFinite(pct) || pct <= 0) return [];
    return players
      .map((p, idx) => {
        const displayName = p.name?.trim() || `Player ${idx + 1}`;
        if (competition === 'fourball_betterball_matchplay') {
          if (p.matchStrokes == null || !Number.isFinite(p.matchStrokes)) return null;
          return {
            id: p.id,
            name: displayName,
            final: p.matchStrokes,
            kind: 'match' as const,
            courseHandicap: p.courseHandicap,
          };
        }
        if (p.playingHandicap == null || !Number.isFinite(p.playingHandicap)) return null;
        return {
          id: p.id,
          name: displayName,
          final: p.playingHandicap,
          kind: 'playing' as const,
          courseHandicap: p.courseHandicap,
          rawPlaying: p.rawPlayingHandicap,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [players, allowancePercent, competition, selectedTee, roundingMode]);

  const roundingPreview = useMemo(() => {
    if (competition === 'fourball_betterball_matchplay') return null;

    const hi = players[0]?.handicapIndex ?? null;
    const pct = parseFloat(allowancePercent);
    const teePar = selectedTee?.par ?? null;
    const teeCourseRating = selectedTee?.courseRating ?? null;
    const teeSlopeRating = selectedTee?.slopeRating ?? null;

    const isValid =
      hi != null &&
      Number.isFinite(hi) &&
      teePar != null &&
      teeCourseRating != null &&
      teeSlopeRating != null &&
      Number.isFinite(pct) &&
      pct > 0;

    if (!isValid) {
      return { isValid: false as const };
    }

    const rawCh = calculateRawCourseHandicap({
      handicapIndex: hi,
      slopeRating: teeSlopeRating,
      courseRating: teeCourseRating,
      par: teePar,
    });
    const chRounded = calculateCourseHandicap(rawCh, roundingMode);
    const rawPlaying = rawCh * (pct / 100);

    return {
      isValid: true as const,
      courseHandicap: chRounded,
      allowance: pct,
      calculated: rawPlaying,
      floor: applyRounding(rawPlaying, 'floor'),
      round: applyRounding(rawPlaying, 'round'),
      ceil: applyRounding(rawPlaying, 'ceil'),
    };
  }, [players, allowancePercent, selectedTee, competition, roundingMode]);

  /** Mirror RoundScoringScreen getHoleMeta: same hole order (1–18) and SI source. */
  const shotsPreviewData = useMemo(() => {
    if (!course?.holes || course.holes.length !== 18) return null;
    if (hasMissingStrokeIndex(course)) return null;
    const pct = parseFloat(allowancePercent);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    const validPlayers = strokesPreviewList;
    if (validPlayers.length === 0) return null;
    const selectedId = selectedShotsPreviewPlayerId ?? validPlayers[0].id;
    const selected = validPlayers.find((p) => p.id === selectedId) ?? validPlayers[0];
    const holes: { holeNumber: number; strokeIndex: number; shots: number }[] = [];
    for (let holeNumber = 1; holeNumber <= 18; holeNumber++) {
      const courseHole =
        course.holes.find((h) => h.holeNumber === holeNumber) ??
        course.holes[holeNumber - 1];
      const strokeIndex =
        courseHole?.strokeIndex ??
        (courseHole as { si?: number })?.si ??
        null;
      if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return null;
      const shots = calculateStrokesOnHole(selected.final, strokeIndex);
      holes.push({ holeNumber, strokeIndex, shots });
    }
    return { selected, holes, validPlayers };
  }, [course, allowancePercent, strokesPreviewList, selectedShotsPreviewPlayerId]);

  useEffect(() => {
    if (!strokesPreviewList.length) {
      setSelectedShotsPreviewPlayerId(null);
      return;
    }
    const ids = strokesPreviewList.map((p) => p.id);
    if (strokesPreviewList.length === 1) {
      setSelectedShotsPreviewPlayerId(ids[0]);
      return;
    }
    if (!selectedShotsPreviewPlayerId || !ids.includes(selectedShotsPreviewPlayerId)) {
      setSelectedShotsPreviewPlayerId(ids[0]);
    }
  }, [strokesPreviewList, selectedShotsPreviewPlayerId]);

  function updatePlayer(id: string, patch: Partial<PersistedPlayer>) {
    setPlayers((prev) =>
      prev.map((player) => (player.id === id ? { ...player, ...patch } : player))
    );
  }

  function updatePlayerHandicapIndex(playerId: string, value: string) {
    if (value.trim() === '') {
      setHandicapIndexDraftById((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      setPlayers((prev) =>
        recalcPlayerHandicaps(
          prev.map((p) => (p.id === playerId ? { ...p, handicapIndex: null } : p))
        )
      );
      return;
    }

    const safeValue = sanitizeHiInput(value);
    setHandicapIndexDraftById((prev) => ({ ...prev, [playerId]: safeValue }));

    const hi = handicapIndexFromDraft(safeValue);
    setPlayers((prev) =>
      recalcPlayerHandicaps(
        prev.map((p) => (p.id === playerId ? { ...p, handicapIndex: hi } : p))
      )
    );
  }

  function finalizeHandicapIndexDraft(playerId: string) {
    setHandicapIndexDraftById((prev) => {
      const value = prev[playerId];
      if (value === undefined || value === '') return prev;

      const normalised = value.replace(',', '.');

      if (normalised.endsWith('.')) {
        const fixed = `${normalised}0`.slice(0, 5);
        return {
          ...prev,
          [playerId]: fixed,
        };
      }

      const next = { ...prev };
      delete next[playerId];
      return next;
    });
  }

  function setPlayerCount(nextCount: number) {
    setPlayers((prev) => {
      if (prev.length === nextCount) return prev;
      if (prev.length < nextCount) {
        const extras = Array.from({ length: nextCount - prev.length }, () => makeBlankPlayer());
        return [...prev, ...extras];
      }
      const removedIds = prev.slice(nextCount).map((p) => p.id);
      if (removedIds.length > 0) {
        setHandicapIndexDraftById((draft) => {
          const nextDraft = { ...draft };
          for (const id of removedIds) {
            delete nextDraft[id];
          }
          return nextDraft;
        });
      }
      return prev.slice(0, nextCount);
    });
  }

  useEffect(() => {
    const firstAllowed = allowedPlayerCounts[0];
    if (!allowedPlayerCounts.includes(players.length)) {
      setPlayerCount(firstAllowed);
    }
  }, [allowedPlayerCounts, players.length]);

  useEffect(() => {
    setPlayers((prev) => recalcPlayerHandicaps(prev));
  }, [selectedTeeIndex, allowancePercent, roundingMode, course, competition]);

  async function handleResumeRound() {
    const existing = await loadCurrentRound();
    if (!existing) {
      navigation.navigate('CompetitionSelect');
      return;
    }
    navigateToLiveForCompetition(navigation, existing.competition);
  }

  async function handleClearOldRound() {
    Alert.alert(
      'Clear current round?',
      'This will remove the saved in-progress round from device storage.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearCurrentRound();
            setActiveRound(null);
            Alert.alert('Cleared', 'Saved round data has been removed.');
          },
        },
      ]
    );
  }

  async function createAndStartRound() {
    const trimmedPlayers = players.map((p) => ({ ...p, name: p.name.trim() }));

    if (trimmedPlayers.some((p) => !p.name)) {
      Alert.alert('Missing player name', 'Please enter a name for each player.');
      return;
    }

    const playerCount = trimmedPlayers.length;
    if (competition === 'individual_stableford' && (playerCount < 1 || playerCount > 4)) {
      Alert.alert('Invalid player count', 'Individual Stableford requires 1 to 4 players.');
      return;
    }
    if (competition === 'betterball_stableford' && playerCount !== 4) {
      Alert.alert('Invalid player count', 'Betterball Stableford requires exactly 4 players.');
      return;
    }
    if (competition === 'singles_matchplay' && playerCount !== 2) {
      Alert.alert('Invalid player count', 'Singles Matchplay requires exactly 2 players.');
      return;
    }
    if (competition === 'fourball_betterball_matchplay' && playerCount !== 4) {
      Alert.alert(
        'Invalid player count',
        'Fourball Betterball Matchplay requires exactly 4 players.'
      );
      return;
    }

    const parsedAllowance = Number(allowancePercent.trim());
    if (!Number.isFinite(parsedAllowance) || parsedAllowance <= 0) {
      Alert.alert('Invalid allowance', 'Enter a valid allowance percentage.');
      return;
    }

    const persistedPlayers: PersistedPlayer[] = recalcPlayerHandicaps(trimmedPlayers).map((p) => ({
      ...p,
      name: p.name.trim(),
    }));

    const round = buildInitialRound({
      competition,
      allowancePercent: parsedAllowance,
      roundingMode,
      teeName: selectedTee?.name ?? null,
      players: persistedPlayers,
    });

    await saveCurrentRound(round);
    setActiveRound(round);
    navigateToLiveForCompetition(navigation, competition);
  }

  async function handleStartRound() {
    if (activeRound) {
      const replaceMessage =
        activeRound.competition === competition
          ? 'Starting a new round will overwrite the current saved round.'
          : `You have an active ${getCompetitionLabel(activeRound.competition)} round. Starting ${getCompetitionShortLabel(competition)} will replace it.`;
      Alert.alert('Replace saved round?', replaceMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start New Round',
          style: 'destructive',
          onPress: createAndStartRound,
        },
      ]);
      return;
    }

    await createAndStartRound();
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>Round Setup</Text>
        <Text style={styles.headerSubtitle}>
          Confirm format settings, add players, then start scoring.
        </Text>

        <View style={styles.card}>
          <Text style={styles.guideCardTitle}>Before you start</Text>
          <Text style={styles.guideCardBody}>1. Choose or add your course</Text>
          <Text style={styles.guideCardBody}>2. Check par and Stroke Index values</Text>
          <Text style={styles.guideCardBody}>3. Set up your round and players</Text>
          <Text style={styles.guideCardBody}>4. Start scoring</Text>
          <Text style={styles.guideCardNote}>
            If Stroke Index values are missing, update them in Course Setup before playing for accurate handicap scoring.
          </Text>
        </View>

        {!course && (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyStateTitle}>No course selected</Text>
            <Text style={styles.emptyStateText}>
              Choose or add a course in Course Setup before starting your round.
            </Text>
            <Pressable
              onPress={() => {
                hapticTap();
                navigation.navigate('CourseSetup');
              }}
              style={({ pressed }) => [styles.emptyStateBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.emptyStateBtnText}>Go to Course Setup</Text>
            </Pressable>
          </View>
        )}

        {hasMissingStrokeIndex(course) && (
          <StrokeIndexWarningBanner onPressFix={() => navigation.navigate('CourseSetup')} />
        )}

        {activeRound && activeRound.competition === competition ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Active round for this competition</Text>
            <Text style={styles.warningText}>
              Hole {activeRound.currentHole} of 18 · You can resume scoring or clear this round to
              set up a new one.
            </Text>

            <View style={styles.warningActionRow}>
              <Pressable style={styles.resumeBtn} onPress={handleResumeRound}>
                <Text style={styles.resumeBtnText}>Resume Round</Text>
              </Pressable>

              <Pressable style={styles.clearBtn} onPress={handleClearOldRound}>
                <Text style={styles.clearBtnText}>Clear Current Round</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {activeRound && activeRound.competition !== competition ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Different active round</Text>
            <Text style={styles.warningText}>
              You currently have an active {getCompetitionLabel(activeRound.competition)} round.
              Starting {getCompetitionShortLabel(competition)} will require clearing or replacing
              the active round.
            </Text>

            <View style={styles.warningActionRow}>
              <Pressable style={styles.resumeBtn} onPress={handleResumeRound}>
                <Text style={styles.resumeBtnText}>Resume Active Round</Text>
              </Pressable>

              <Pressable style={styles.clearBtn} onPress={handleClearOldRound}>
                <Text style={styles.clearBtnText}>Clear Active Round</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Competition</Text>
          <View style={styles.selectedCompetitionBanner}>
            <Text style={styles.selectedCompetitionTitle}>{selectedCompetitionOption.title}</Text>
            <Text style={styles.selectedCompetitionSubtitle}>{selectedCompetitionOption.subtitle}</Text>
            {competition === 'singles_matchplay' ? (
              <View style={styles.matchplayFormatCallout}>
                <Text style={styles.matchplayFormatCalloutTitle}>Singles Matchplay</Text>
                <Text style={styles.matchplayFormatBody}>
                  Player 1 vs Player 2 · Lowest net score wins each hole. Enter players in order — the
                  first row is Player 1, the second is Player 2.
                </Text>
              </View>
            ) : null}
            {competition === 'fourball_betterball_matchplay' ? (
              <View style={styles.matchplayFormatCallout}>
                <Text style={styles.matchplayFormatCalloutTitle}>Fourball Betterball Matchplay</Text>
                <Text style={styles.matchplayFormatBody}>
                  Fixed sides only (not editable here).{'\n'}
                  Side A = Player 1 + Player 2 · Side B = Player 3 + Player 4.{'\n'}
                  Each side’s best net score on a hole counts toward the team match.
                </Text>
              </View>
            ) : null}
            {competition === 'individual_stableford' ? (
              <View style={styles.matchplayFormatCallout}>
                <Text style={styles.matchplayFormatCalloutTitle}>Individual Stableford</Text>
                <Text style={styles.matchplayFormatBody}>
                  1 to 4 players scoring individually. Each player earns Stableford points on every hole;
                  highest total points wins — no teams or sides.
                </Text>
              </View>
            ) : null}
            {competition === 'betterball_stableford' ? (
              <View style={styles.matchplayFormatCallout}>
                <Text style={styles.matchplayFormatCalloutTitle}>Betterball Stableford</Text>
                <Text style={styles.matchplayFormatBody}>
                  Exactly 4 players · fixed pairings (not editable here).{'\n'}
                  Side A = Player 1 + Player 2 · Side B = Player 3 + Player 4.{'\n'}
                  The best Stableford score on each hole counts for that side; this is a points contest,
                  not matchplay.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tee</Text>
          {course?.tees?.length ? (
            <>
              <View style={styles.optionGroup}>
                {course.tees.map((tee, index) => {
                  const isSelected = selectedTeeIndex === index;
                  return (
                    <Pressable
                      key={`${tee.name}-${index}`}
                      style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                      onPress={() => setSelectedTeeIndex(index)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          isSelected && styles.optionChipTextSelected,
                        ]}
                      >
                        {tee.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selectedTee ? (
                <Text style={styles.roundingHelper}>
                  Par {selectedTee.par} | CR {selectedTee.courseRating} | Slope {selectedTee.slopeRating}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.roundingPreviewEmpty}>
              No tee rating data found for this course. Add tee metadata to enable automatic course handicap.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Allowance & Rounding</Text>

          <Text style={styles.inputLabel}>Allowance %</Text>
          <TextInput
            value={allowancePercent}
            onChangeText={(v) => setAllowancePercent(sanitiseIntegerInput(v))}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="100"
            placeholderTextColor="#9ca3af"
          />

          <Text style={[styles.inputLabel, { marginTop: 12 }]}>Rounding mode</Text>
          <View style={styles.optionGroup}>
            {ROUNDING_OPTIONS.map((item) => {
              const selected = item.key === roundingMode;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => setRoundingMode(item.key)}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      selected && styles.optionChipTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.roundingHelper}>
            {competition === 'fourball_betterball_matchplay'
              ? 'Rounding applies to Course Handicap and to each player’s match strokes after allowance.'
              : 'Rounding applies to Course Handicap and to Playing Handicap (from raw Course Handicap × allowance).'}
          </Text>

          <View style={styles.roundingExamples}>
            <Text style={styles.roundingExamplesTitle}>Examples</Text>
            <Text style={styles.roundingExample}>20.6 → Floor 20, Round 21, Ceil 21</Text>
            <Text style={styles.roundingExample}>20.4 → Floor 20, Round 20, Ceil 21</Text>
          </View>

          <View style={styles.roundingPreview}>
            <Text style={styles.roundingPreviewTitle}>
              {competition === 'fourball_betterball_matchplay'
                ? 'Match strokes'
                : 'Playing handicap preview'}
            </Text>
            {competition === 'fourball_betterball_matchplay' ? (
              <Text style={styles.roundingPreviewHelper}>
                Match strokes use the lowest raw Course Handicap in the field as scratch; other players get allowance × the difference (see Player Summary).
              </Text>
            ) : roundingPreview && roundingPreview.isValid ? (
              <>
                <Text style={styles.roundingPreviewHelper}>
                  Uses raw Course Handicap × allowance, then each rounding mode. Player 1 sample.
                </Text>
                <Text style={styles.roundingPreviewRow}>
                  Course Handicap: {roundingPreview.courseHandicap}
                </Text>
                <Text style={styles.roundingPreviewRow}>
                  Allowance: {roundingPreview.allowance}%
                </Text>
                <Text style={styles.roundingPreviewRow}>
                  Raw playing (before round): {roundingPreview.calculated.toFixed(2)}
                </Text>
                <View style={styles.roundingPreviewModes}>
                  <View style={[styles.roundingPreviewModeRow, roundingMode === 'floor' && styles.roundingPreviewModeSelected]}>
                    <Text style={[styles.roundingPreviewModeLabel, roundingMode === 'floor' && styles.roundingPreviewModeLabelSelected]}>
                      Floor (round down)
                    </Text>
                    <Text style={[styles.roundingPreviewModeValue, roundingMode === 'floor' && styles.roundingPreviewModeValueSelected]}>
                      {roundingPreview.floor}
                    </Text>
                  </View>
                  <View style={[styles.roundingPreviewModeRow, roundingMode === 'round' && styles.roundingPreviewModeSelected]}>
                    <Text style={[styles.roundingPreviewModeLabel, roundingMode === 'round' && styles.roundingPreviewModeLabelSelected]}>
                      Round (nearest)
                    </Text>
                    <Text style={[styles.roundingPreviewModeValue, roundingMode === 'round' && styles.roundingPreviewModeValueSelected]}>
                      {roundingPreview.round}
                    </Text>
                  </View>
                  <View style={[styles.roundingPreviewModeRow, roundingMode === 'ceil' && styles.roundingPreviewModeSelected]}>
                    <Text style={[styles.roundingPreviewModeLabel, roundingMode === 'ceil' && styles.roundingPreviewModeLabelSelected]}>
                      Ceil (round up)
                    </Text>
                    <Text style={[styles.roundingPreviewModeValue, roundingMode === 'ceil' && styles.roundingPreviewModeValueSelected]}>
                      {roundingPreview.ceil}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.roundingPreviewEmpty}>
                Enter Handicap Index, allowance, and select a tee to see a preview.
              </Text>
            )}
          </View>

          <Text style={styles.roundingNote}>
            This may affect shots received and scoring depending on competition rules.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.playersHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Players</Text>
              <Text style={styles.playersSub}>{playerCountLabel}</Text>
              {competition === 'singles_matchplay' ? (
                <Text style={styles.matchplayPlayersHint}>
                  Head-to-head: Player 1 faces Player 2. Names appear on the scoreboard in this order.
                </Text>
              ) : null}
              {competition === 'fourball_betterball_matchplay' ? (
                <Text style={styles.matchplayPlayersHint}>
                  Side A: Players 1 & 2 · Side B: Players 3 & 4. Roster order sets who plays on which
                  side.
                </Text>
              ) : null}
              {competition === 'individual_stableford' ? (
                <Text style={styles.matchplayPlayersHint}>
                  Each golfer scores for themselves only. Add up to four players; everyone competes on
                  total Stableford points.
                </Text>
              ) : null}
              {competition === 'betterball_stableford' ? (
                <Text style={styles.matchplayPlayersHint}>
                  Side A = Players 1 & 2 · Side B = Players 3 & 4. Best Stableford points per hole count
                  toward each side’s total.
                </Text>
              ) : null}
              {hasVariablePlayerCount ? (
                <View style={styles.playerCountChoices}>
                  <Text style={styles.playerCountPrompt}>How many are playing?</Text>
                  <View style={styles.playerCountChoiceRow}>
                    {allowedPlayerCounts.map((count) => {
                      const selected = players.length === count;
                      return (
                        <Pressable
                          key={count}
                          onPress={() => setPlayerCount(count)}
                          style={styles.playerCountChoiceHit}
                        >
                          <Text
                            style={[
                              styles.playerCountChoiceText,
                              selected && styles.playerCountChoiceTextSelected,
                            ]}
                          >
                            {count}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {players.map((player, index) => (
            <View key={player.id} style={styles.playerCard}>
              <View style={styles.playerCardHeader}>
                <Text style={styles.playerCardTitle}>Player {index + 1}</Text>
              </View>

              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                value={player.name}
                onChangeText={(v) => updatePlayer(player.id, { name: v })}
                style={styles.input}
                placeholder="Player name"
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.inputLabel}>Handicap Index (H.I.)</Text>
              <TextInput
                value={
                  handicapIndexDraftById[player.id] ??
                  (player.handicapIndex == null ? '' : String(player.handicapIndex))
                }
                onChangeText={(v) => updatePlayerHandicapIndex(player.id, v)}
                onBlur={() => finalizeHandicapIndexDraft(player.id)}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="e.g. 18.4"
                maxLength={5}
                placeholderTextColor="#9ca3af"
              />

              <View style={[styles.playerSummaryRow, styles.playerSummaryRowThree]}>
                <View style={styles.summaryPill}>
                  <Text style={styles.summaryLabel}>HI</Text>
                  <Text style={styles.summaryValue}>
                    {player.handicapIndex == null ? '-' : String(player.handicapIndex)}
                  </Text>
                </View>
                <View style={styles.summaryPill}>
                  <Text style={styles.summaryLabel}>Course Hcp</Text>
                  <Text style={styles.summaryValue}>{player.courseHandicap ?? '-'}</Text>
                </View>
                {competition === 'fourball_betterball_matchplay' ? (
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryLabel}>Match Str</Text>
                    <Text style={styles.summaryValue}>
                      {player.matchStrokes == null ? '-' : String(player.matchStrokes)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.summaryPill}>
                    <Text style={styles.summaryLabel}>Playing Hcp</Text>
                    <Text style={styles.summaryValue}>{player.playingHandicap ?? '-'}</Text>
                  </View>
                )}
              </View>
              {competition === 'fourball_betterball_matchplay' &&
              lowestRawCourseHandicapIds.has(player.id) ? (
                <Text style={styles.scratchNote}>Plays off scratch (lowest Course Hcp in field)</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {competition === 'fourball_betterball_matchplay'
              ? 'Match strokes summary'
              : 'Playing handicap summary'}
          </Text>
          <Text style={styles.phSummaryIntro}>
            {competition === 'fourball_betterball_matchplay'
              ? 'Match strokes are used for shot allocation on each hole (not Playing Handicap).'
              : 'Playing Handicap is derived from raw Course Handicap × allowance, then rounded.'}
          </Text>
          {competition === 'fourball_betterball_matchplay'
            ? players.filter((p) => p.matchStrokes != null).length === 0
              ? (
                  <Text style={styles.phSummaryEmpty}>
                    Enter Handicap Index and select a tee to see match strokes.
                  </Text>
                )
              : players
                  .filter((p) => p.matchStrokes != null)
                  .map((p) => {
                  const idx = players.indexOf(p);
                  const name = p.name?.trim() || `Player ${idx + 1}`;
                  return (
                    <View key={p.id} style={styles.phSummaryRow}>
                      <Text style={styles.phSummaryPlayerName}>{name}</Text>
                      <Text style={styles.phSummaryDetail}>
                        Handicap Index: {p.handicapIndex ?? '—'}
                      </Text>
                      <Text style={styles.phSummaryDetail}>
                        Course Handicap: {p.courseHandicap ?? '—'}
                      </Text>
                      <Text style={styles.phSummaryDetail}>
                        Allowance: {parseFloat(allowancePercent) || 0}%
                      </Text>
                      <Text style={styles.phSummaryDetail}>
                        Rounding: {ROUNDING_LABELS[roundingMode]}
                      </Text>
                      <Text style={styles.phSummaryFinal}>
                        {lowestRawCourseHandicapIds.has(p.id)
                          ? 'Match strokes: 0 (scratch)'
                          : `Match strokes: ${p.matchStrokes}`}
                      </Text>
                    </View>
                  );
                  })
            : strokesPreviewList.length > 0
              ? strokesPreviewList.map((row) => (
                  <View key={row.id} style={styles.phSummaryRow}>
                    <Text style={styles.phSummaryPlayerName}>{row.name}</Text>
                    <Text style={styles.phSummaryDetail}>
                      Handicap Index:{' '}
                      {players.find((pl) => pl.id === row.id)?.handicapIndex ?? '—'}
                    </Text>
                    <Text style={styles.phSummaryDetail}>
                      Course Handicap: {row.courseHandicap ?? '—'}
                    </Text>
                    <Text style={styles.phSummaryDetail}>
                      Allowance: {parseFloat(allowancePercent) || 0}%
                    </Text>
                    <Text style={styles.phSummaryDetail}>
                      Rounding: {ROUNDING_LABELS[roundingMode]}
                    </Text>
                    {'rawPlaying' in row && row.rawPlaying != null ? (
                      <Text style={styles.phSummaryDetail}>
                        Raw playing (before round): {row.rawPlaying.toFixed(2)}
                      </Text>
                    ) : null}
                    <Text style={styles.phSummaryFinal}>Playing Handicap: {row.final}</Text>
                  </View>
                ))
              : (
                  <Text style={styles.phSummaryEmpty}>
                    Enter at least one valid Handicap Index and select a tee to see the handicap
                    summary.
                  </Text>
                )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Shots Per Hole Preview</Text>
          <Text style={styles.phSummaryIntro}>
            Preview how handicap shots will be allocated across the course for the selected player.
          </Text>

          {!course ? (
            <Text style={styles.shotsPreviewEmpty}>
              Select a course to preview shots per hole.
            </Text>
          ) : hasMissingStrokeIndex(course) ? (
            <Text style={styles.shotsPreviewEmpty}>
              Shots per hole preview unavailable until all Stroke Index values are entered for this course.
            </Text>
          ) : strokesPreviewList.length === 0 ? (
            <Text style={styles.shotsPreviewEmpty}>
              Enter a valid Handicap Index and tee selection to preview shots per hole.
            </Text>
          ) : !shotsPreviewData ? (
            <Text style={styles.shotsPreviewEmpty}>
              Enter a valid allowance to preview shots per hole.
            </Text>
          ) : (
            <>
              {shotsPreviewData.validPlayers.length > 1 && (
                <View style={styles.shotsPreviewPlayerChips}>
                  {shotsPreviewData.validPlayers.map((p) => {
                    const sel = p.id === shotsPreviewData.selected.id;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          hapticTap();
                          setSelectedShotsPreviewPlayerId(p.id);
                        }}
                        style={[styles.shotsPreviewChip, sel && styles.shotsPreviewChipSelected]}
                      >
                        <Text style={[styles.shotsPreviewChipText, sel && styles.shotsPreviewChipTextSelected]}>
                          {p.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text style={styles.shotsPreviewSummary}>
                {shotsPreviewData.selected.name} —{' '}
                {competition === 'fourball_betterball_matchplay' ? 'Match strokes' : 'Playing Handicap'}:{' '}
                {shotsPreviewData.selected.final}
              </Text>
              <View style={styles.shotsPreviewGrid}>
                {shotsPreviewData.holes.map((h) => (
                  <View
                    key={h.holeNumber}
                    style={[
                      styles.shotsPreviewHole,
                      h.shots > 0 && styles.shotsPreviewHoleWithShots,
                    ]}
                  >
                    <Text style={styles.shotsPreviewHoleNum}>{h.holeNumber}</Text>
                    <Text style={styles.shotsPreviewSi}>SI {h.strokeIndex}</Text>
                    <Text style={[styles.shotsPreviewShots, h.shots > 0 && styles.shotsPreviewShotsActive]}>
                      {h.shots}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <Pressable style={styles.primaryBtn} onPress={handleStartRound}>
          <Text style={styles.primaryBtnText}>Start Round</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#07110b',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
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
  },
  guideCardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  guideCardBody: {
    color: '#d1d5db',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 2,
  },
  guideCardNote: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  emptyStateCard: {
    backgroundColor: '#1a221d',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4b5563',
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyStateText: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  emptyStateBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  emptyStateBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#0b1510',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1f2a23',
  },
  warningCard: {
    backgroundColor: '#1a221d',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#4b5563',
    gap: 10,
  },
  warningTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  warningText: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
  },
  warningActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  resumeBtn: {
    flex: 1,
    backgroundColor: '#14532d',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resumeBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  clearBtn: {
    flex: 1,
    backgroundColor: '#3f3f46',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  selectedCompetitionBanner: {
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: '#2e3b33',
    borderRadius: 12,
    padding: 12,
  },
  selectedCompetitionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  selectedCompetitionSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
  },
  selectedCompetitionPairingNote: {
    color: '#86efac',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    fontWeight: '700',
  },
  matchplayFormatCallout: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2e3b33',
  },
  matchplayFormatCalloutTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  matchplayPlayersHint: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    marginBottom: 4,
  },
  matchplayFormatBody: {
    color: '#86efac',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  inputLabel: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  roundingHelper: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  roundingExamples: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#101915',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e3b33',
  },
  roundingExamplesTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  roundingExample: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  roundingPreview: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#101915',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e3b33',
  },
  roundingPreviewTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  roundingPreviewHelper: {
    color: '#9ca3af',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  roundingPreviewRow: {
    color: '#d1d5db',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  roundingPreviewModes: {
    marginTop: 8,
  },
  roundingPreviewModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  roundingPreviewModeSelected: {
    backgroundColor: '#16a34a',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  roundingPreviewModeLabel: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
  },
  roundingPreviewModeLabelSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  roundingPreviewModeValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  roundingPreviewModeValueSelected: {
    color: '#ffffff',
  },
  roundingPreviewEmpty: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  roundingNote: {
    color: '#9ca3af',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#101915',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e3b33',
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: '#2e3b33',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionChipSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  optionChipText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  optionChipTextSelected: {
    color: '#ffffff',
  },
  playersHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playersSub: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: -4,
  },
  playerCountChoices: {
    marginTop: 10,
  },
  playerCountPrompt: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  playerCountChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  playerCountChoiceHit: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 40,
    alignItems: 'center',
  },
  playerCountChoiceText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '700',
  },
  playerCountChoiceTextSelected: {
    color: '#ffffff',
    fontWeight: '900',
    textDecorationLine: 'underline',
    textDecorationColor: '#86efac',
  },
  playerCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2a23',
  },
  playerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  playerCardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  playerSummaryRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  playerSummaryRowThree: {
    flexWrap: 'wrap',
  },
  scratchNote: {
    marginTop: 8,
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '800',
  },
  summaryPill: {
    flex: 1,
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: '#2e3b33',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  summaryLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  phSummaryIntro: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  phSummaryRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#101915',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e3b33',
  },
  phSummaryPlayerName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  phSummaryDetail: {
    color: '#d1d5db',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  phSummaryFinal: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },
  phSummaryEmpty: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  shotsPreviewEmpty: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  shotsPreviewPlayerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  shotsPreviewChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2e3b33',
    backgroundColor: '#101915',
  },
  shotsPreviewChipSelected: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  shotsPreviewChipText: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '700',
  },
  shotsPreviewChipTextSelected: {
    color: '#ffffff',
  },
  shotsPreviewSummary: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  shotsPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  shotsPreviewHole: {
    width: 46,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#101915',
    borderWidth: 1,
    borderColor: '#2e3b33',
    alignItems: 'center',
  },
  shotsPreviewHoleWithShots: {
    backgroundColor: '#0f2d1a',
    borderColor: '#16a34a',
  },
  shotsPreviewHoleNum: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '800',
  },
  shotsPreviewSi: {
    color: '#d1d5db',
    fontSize: 10,
    marginTop: 1,
  },
  shotsPreviewShots: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  shotsPreviewShotsActive: {
    color: '#16a34a',
  },
  primaryBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
});
