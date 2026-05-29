import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import { applyRounding, calculateRawCourseHandicap, type RoundingMode } from '../core/handicap';
import {
  exportCompetitionPdf,
  shareCompetitionSummary,
  summarizeHandicapExportPlayers,
  type HandicapExportPayload,
} from '../core/competitionHandicapExport';
import {
  clearCompetitionCheckerDraft,
  formatCompetitionCheckerDraftSavedAt,
  loadCompetitionCheckerDraft,
  makeEmptyCheckerDraft,
  saveCompetitionCheckerDraft,
} from '../storage/competitionHandicapCheckerStorage';
import { colors } from '../theme/colors';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'CompetitionHandicapChecker'>;

type CheckerPlayer = {
  id: string;
  name: string;
  handicapIndexText: string;
};

type PlayerComputed = {
  id: string;
  name: string;
  handicapIndex: number | null;
  courseHandicap: number | null;
  playingHandicap: number | null;
};

const MAX_PLAYERS_PER_TEAM = 12;
const ALLOWANCE_OPTIONS = [100, 95, 90, 85, 75];
const AUTOSAVE_DEBOUNCE_MS = 500;
const CHECKER_PLACEHOLDER_COLOR = colors.textPlaceholder;
const DEFAULT_TEAM_A_LABEL = 'Team A';
const DEFAULT_TEAM_B_LABEL = 'Team B';

function displayTeamName(raw: string, fallback: string): string {
  return raw.trim() || fallback;
}

function checkerInputStyle(value: string, extra?: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const hasValue = value.trim().length > 0;
  return [styles.input, hasValue ? styles.inputFilled : styles.inputEmpty, extra];
}

function makeTeamPlayers(prefix: 'A' | 'B'): CheckerPlayer[] {
  return Array.from({ length: MAX_PLAYERS_PER_TEAM }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: '',
    handicapIndexText: '',
  }));
}

function toNumberOrNull(text: string): number | null {
  const parsed = Number(text.replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function autoCapitalizeWords(text: string): string {
  return text.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function formatMaybeNumber(value: number | null): string {
  if (value == null) return '—';
  return String(value);
}

function computePlayers(
  players: CheckerPlayer[],
  courseRating: number | null,
  slopeRating: number | null,
  par: number | null,
  allowancePercent: number,
  roundingMode: RoundingMode
): PlayerComputed[] {
  const hasCourseInputs =
    courseRating != null &&
    slopeRating != null &&
    par != null &&
    Number.isFinite(courseRating) &&
    Number.isFinite(slopeRating) &&
    Number.isFinite(par);

  return players.map((p) => {
    const hi = toNumberOrNull(p.handicapIndexText);
    if (!hasCourseInputs || hi == null) {
      return {
        id: p.id,
        name: p.name.trim(),
        handicapIndex: hi,
        courseHandicap: null,
        playingHandicap: null,
      };
    }

    const rawCourse = calculateRawCourseHandicap({
      handicapIndex: hi,
      slopeRating: slopeRating as number,
      courseRating: courseRating as number,
      par: par as number,
    });
    const courseHandicap = applyRounding(rawCourse, roundingMode);
    const rawPlaying = rawCourse * (allowancePercent / 100);
    const playingHandicap = applyRounding(rawPlaying, roundingMode);

    return {
      id: p.id,
      name: p.name.trim(),
      handicapIndex: hi,
      courseHandicap,
      playingHandicap,
    };
  });
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return Number((total / values.length).toFixed(1));
}

function allowanceUiFromPercent(percent: number): {
  preset: number;
  customText: string;
  useCustom: boolean;
} {
  if (ALLOWANCE_OPTIONS.includes(percent)) {
    return { preset: percent, customText: '', useCustom: false };
  }
  return { preset: 100, customText: String(percent), useCustom: true };
}

export default function CompetitionHandicapCheckerScreen({ navigation }: Props) {
  const [courseName, setCourseName] = useState('');
  const [teeName, setTeeName] = useState('');
  const [courseRatingText, setCourseRatingText] = useState('');
  const [slopeRatingText, setSlopeRatingText] = useState('');
  const [parText, setParText] = useState('');
  const [allowancePreset, setAllowancePreset] = useState<number>(100);
  const [allowanceCustomText, setAllowanceCustomText] = useState('');
  const [useCustomAllowance, setUseCustomAllowance] = useState(false);
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('round');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamA, setTeamA] = useState<CheckerPlayer[]>(() => makeTeamPlayers('A'));
  const [teamB, setTeamB] = useState<CheckerPlayer[]>(() => makeTeamPlayers('B'));
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState('');
  const [draftSavedFlash, setDraftSavedFlash] = useState(false);
  const skipNextAutosaveRef = useRef(false);
  const draftSavedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const courseRating = useMemo(() => toNumberOrNull(courseRatingText), [courseRatingText]);
  const slopeRating = useMemo(() => toNumberOrNull(slopeRatingText), [slopeRatingText]);
  const par = useMemo(() => toNumberOrNull(parText), [parText]);
  const allowancePercent = useMemo(() => {
    if (!useCustomAllowance) return allowancePreset;
    const custom = toNumberOrNull(allowanceCustomText);
    return custom == null ? allowancePreset : custom;
  }, [allowancePreset, allowanceCustomText, useCustomAllowance]);

  const teamADisplayName = useMemo(
    () => displayTeamName(teamAName, DEFAULT_TEAM_A_LABEL),
    [teamAName]
  );
  const teamBDisplayName = useMemo(
    () => displayTeamName(teamBName, DEFAULT_TEAM_B_LABEL),
    [teamBName]
  );

  const draftPayload = useMemo(
    () => ({
      courseName,
      teeName,
      courseRating: courseRatingText,
      slopeRating: slopeRatingText,
      par: parText,
      allowancePercent,
      roundingMode,
      teamAName,
      teamBName,
      teamA,
      teamB,
    }),
    [
      allowancePercent,
      courseName,
      courseRatingText,
      parText,
      roundingMode,
      slopeRatingText,
      teamA,
      teamAName,
      teamB,
      teamBName,
      teeName,
    ]
  );

  const draftPayloadRef = useRef(draftPayload);
  draftPayloadRef.current = draftPayload;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadCompetitionCheckerDraft();
      if (cancelled) return;
      if (draft) {
        const allowanceUi = allowanceUiFromPercent(draft.allowancePercent);
        setCourseName(draft.courseName);
        setTeeName(draft.teeName);
        setCourseRatingText(draft.courseRating);
        setSlopeRatingText(draft.slopeRating);
        setParText(draft.par);
        setAllowancePreset(allowanceUi.preset);
        setAllowanceCustomText(allowanceUi.customText);
        setUseCustomAllowance(allowanceUi.useCustom);
        setRoundingMode(draft.roundingMode);
        setTeamAName(draft.teamAName);
        setTeamBName(draft.teamBName);
        setTeamA(draft.teamA);
        setTeamB(draft.teamB);
        setDraftUpdatedAt(draft.updatedAt);
        skipNextAutosaveRef.current = true;
      }
      setDraftHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flashDraftSaved = useCallback(() => {
    setDraftSavedFlash(true);
    if (draftSavedFlashTimerRef.current) clearTimeout(draftSavedFlashTimerRef.current);
    draftSavedFlashTimerRef.current = setTimeout(() => {
      setDraftSavedFlash(false);
      draftSavedFlashTimerRef.current = null;
    }, 2000);
  }, []);

  const persistDraft = useCallback(
    async (options?: { flash?: boolean }) => {
      const saved = await saveCompetitionCheckerDraft(draftPayloadRef.current);
      setDraftUpdatedAt(saved.updatedAt);
      if (options?.flash !== false) flashDraftSaved();
    },
    [flashDraftSaved]
  );

  useEffect(() => {
    if (!draftHydrated) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistDraft();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [draftHydrated, draftPayload, persistDraft]);

  useEffect(() => {
    if (!draftHydrated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background' && nextState !== 'inactive') return;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      void persistDraft({ flash: false });
    });
    return () => subscription.remove();
  }, [draftHydrated, persistDraft]);

  useEffect(() => {
    return () => {
      if (draftSavedFlashTimerRef.current) clearTimeout(draftSavedFlashTimerRef.current);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);
  const livePreview = useMemo(() => {
    const hi = 12.4;
    if (courseRating == null || slopeRating == null || par == null) return null;
    if (!Number.isFinite(courseRating) || !Number.isFinite(slopeRating) || !Number.isFinite(par)) return null;
    const rawCourse = calculateRawCourseHandicap({
      handicapIndex: hi,
      slopeRating,
      courseRating,
      par,
    });
    const courseHandicap = applyRounding(rawCourse, roundingMode);
    const rawPlaying = rawCourse * (allowancePercent / 100);
    const playingHandicap = applyRounding(rawPlaying, roundingMode);
    return `HI 12.4 → CH ${courseHandicap} → PH ${playingHandicap}`;
  }, [allowancePercent, courseRating, par, roundingMode, slopeRating]);

  const teamAComputed = useMemo(
    () => computePlayers(teamA, courseRating, slopeRating, par, allowancePercent, roundingMode),
    [teamA, courseRating, slopeRating, par, allowancePercent, roundingMode]
  );
  const teamBComputed = useMemo(
    () => computePlayers(teamB, courseRating, slopeRating, par, allowancePercent, roundingMode),
    [teamB, courseRating, slopeRating, par, allowancePercent, roundingMode]
  );

  const teamASummary = useMemo(() => {
    const exportPlayers = teamAComputed.map((p) => ({
      name: p.name,
      handicapIndex: p.handicapIndex,
      courseHandicap: p.courseHandicap,
      playingHandicap: p.playingHandicap,
    }));
    const summary = summarizeHandicapExportPlayers(exportPlayers);
    return {
      count: summary.enteredCount,
      avgHI: summary.averageHandicapIndex,
      avgPH: summary.averagePlayingHandicap,
    };
  }, [teamAComputed]);

  const teamBSummary = useMemo(() => {
    const exportPlayers = teamBComputed.map((p) => ({
      name: p.name,
      handicapIndex: p.handicapIndex,
      courseHandicap: p.courseHandicap,
      playingHandicap: p.playingHandicap,
    }));
    const summary = summarizeHandicapExportPlayers(exportPlayers);
    return {
      count: summary.enteredCount,
      avgHI: summary.averageHandicapIndex,
      avgPH: summary.averagePlayingHandicap,
    };
  }, [teamBComputed]);

  function updateTeamPlayer(
    team: 'A' | 'B',
    index: number,
    patch: Partial<CheckerPlayer>
  ) {
    const setter = team === 'A' ? setTeamA : setTeamB;
    setter((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function applyEmptyDraft() {
    const empty = makeEmptyCheckerDraft();
    const allowanceUi = allowanceUiFromPercent(empty.allowancePercent);
    setCourseName(empty.courseName);
    setTeeName(empty.teeName);
    setCourseRatingText(empty.courseRating);
    setSlopeRatingText(empty.slopeRating);
    setParText(empty.par);
    setAllowancePreset(allowanceUi.preset);
    setAllowanceCustomText(allowanceUi.customText);
    setUseCustomAllowance(allowanceUi.useCustom);
    setRoundingMode(empty.roundingMode);
    setTeamAName(empty.teamAName);
    setTeamBName(empty.teamBName);
    setTeamA(empty.teamA);
    setTeamB(empty.teamB);
    setDraftUpdatedAt('');
    setDraftSavedFlash(false);
    skipNextAutosaveRef.current = true;
  }

  function clearChecker() {
    Alert.alert(
      'Clear Handicap Checker?',
      'This clears all course, team, and player details from this screen and removes the saved draft.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearCompetitionCheckerDraft();
              applyEmptyDraft();
            })();
          },
        },
      ]
    );
  }

  function onShareHandicapSheet() {
    if (!courseName.trim()) {
      Alert.alert('Course Name required', 'Enter a Course Name before sharing or exporting.');
      return;
    }
    Alert.alert('Share Handicap Sheet', 'Choose how to share', [
      { text: 'Text summary', onPress: () => void onShareTextSummary() },
      { text: 'PDF export', onPress: () => void onExportPdf() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const draftStatusText = useMemo(() => {
    if (draftSavedFlash) return 'Draft saved';
    if (draftUpdatedAt) {
      const formatted = formatCompetitionCheckerDraftSavedAt(draftUpdatedAt);
      return formatted ? `Last saved: ${formatted}` : 'Draft saved';
    }
    return '';
  }, [draftSavedFlash, draftUpdatedAt]);

  const exportPayload: HandicapExportPayload = useMemo(
    () => ({
      title: courseName.trim()
        ? `Competition Handicap Checker — ${courseName.trim()}`
        : 'Competition Handicap Checker Summary',
      generatedAt: new Date().toISOString(),
      courseName: courseName.trim(),
      teeName: teeName.trim() || null,
      courseRating,
      slopeRating,
      par,
      allowancePercent,
      roundingMode,
      teamA: {
        title: teamADisplayName,
        players: teamAComputed.map((p) => ({
          name: p.name,
          handicapIndex: p.handicapIndex,
          courseHandicap: p.courseHandicap,
          playingHandicap: p.playingHandicap,
        })),
        enteredCount: teamASummary.count,
        averageHandicapIndex: teamASummary.avgHI,
        averagePlayingHandicap: teamASummary.avgPH,
      },
      teamB: {
        title: teamBDisplayName,
        players: teamBComputed.map((p) => ({
          name: p.name,
          handicapIndex: p.handicapIndex,
          courseHandicap: p.courseHandicap,
          playingHandicap: p.playingHandicap,
        })),
        enteredCount: teamBSummary.count,
        averageHandicapIndex: teamBSummary.avgHI,
        averagePlayingHandicap: teamBSummary.avgPH,
      },
    }),
    [
      allowancePercent,
      courseName,
      courseRating,
      par,
      roundingMode,
      slopeRating,
      teeName,
      teamADisplayName,
      teamAComputed,
      teamASummary.avgHI,
      teamASummary.avgPH,
      teamASummary.count,
      teamBDisplayName,
      teamBComputed,
      teamBSummary.avgHI,
      teamBSummary.avgPH,
      teamBSummary.count,
    ]
  );

  async function onShareTextSummary() {
    if (!courseName.trim()) {
      Alert.alert('Course Name required', 'Enter a Course Name before sharing or exporting.');
      return;
    }
    try {
      await shareCompetitionSummary(exportPayload);
    } catch {
      Alert.alert('Share failed', 'Could not open share sheet for text summary.');
    }
  }

  async function onExportPdf() {
    if (!courseName.trim()) {
      Alert.alert('Course Name required', 'Enter a Course Name before sharing or exporting.');
      return;
    }
    try {
      await exportCompetitionPdf(exportPayload);
    } catch {
      Alert.alert('Export failed', 'Could not export PDF summary right now.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Competition Handicap Checker</Text>
        <Text style={styles.subtitle}>
          Check player handicaps only. This does not create rounds or save scores.
        </Text>
        <Text style={styles.metaText}>
          {`Summary: ${courseName.trim() || '—'}${teeName.trim() ? ` · ${teeName.trim()}` : ''} · Allowance ${allowancePercent}% · ${
            roundingMode === 'round' ? 'Round' : roundingMode === 'floor' ? 'Floor' : 'Ceil'
          }`}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Course / Tee Details</Text>
          <View style={[styles.row, { marginBottom: 8 }]}>
            <View style={[styles.field, { flex: 2 }]}>
              <Text style={styles.label}>Course Name *</Text>
              <TextInput
                value={courseName}
                onChangeText={(v) => setCourseName(autoCapitalizeWords(v))}
                style={checkerInputStyle(courseName)}
                autoCapitalize="words"
                placeholder="e.g. Woburn Golf Club"
                placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Tee Name</Text>
              <TextInput
                value={teeName}
                onChangeText={(v) => setTeeName(autoCapitalizeWords(v))}
                style={checkerInputStyle(teeName)}
                autoCapitalize="words"
                placeholder="e.g. Yellow"
                placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Course Rating</Text>
              <TextInput
                value={courseRatingText}
                onChangeText={setCourseRatingText}
                style={checkerInputStyle(courseRatingText)}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="e.g. 72.1"
                placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Slope Rating</Text>
              <TextInput
                value={slopeRatingText}
                onChangeText={setSlopeRatingText}
                style={checkerInputStyle(slopeRatingText)}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="e.g. 128"
                placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Par</Text>
              <TextInput
                value={parText}
                onChangeText={setParText}
                style={checkerInputStyle(parText)}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder="e.g. 72"
                placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
              />
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Competition Allowance</Text>
          <View style={styles.pillRow}>
            {ALLOWANCE_OPTIONS.map((option) => {
              const active = !useCustomAllowance && allowancePreset === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    setUseCustomAllowance(false);
                    setAllowancePreset(option);
                  }}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{option}%</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.row, { marginTop: 10 }]}>
            <Pressable
              onPress={() => setUseCustomAllowance((v) => !v)}
              style={[styles.customToggle, useCustomAllowance && styles.customToggleActive]}
            >
              <Text style={[styles.customToggleText, useCustomAllowance && styles.customToggleTextActive]}>
                Custom
              </Text>
            </Pressable>
            <TextInput
              value={allowanceCustomText}
              onChangeText={setAllowanceCustomText}
              style={[
                checkerInputStyle(allowanceCustomText, { flex: 1 }),
                !useCustomAllowance && styles.disabledInput,
              ]}
              keyboardType="decimal-pad"
              inputMode="decimal"
              editable={useCustomAllowance}
              placeholder="e.g. 87.5"
              placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
            />
          </View>
          <Text style={styles.metaText}>Applied allowance: {allowancePercent}%</Text>

          <Text style={[styles.label, { marginTop: 12 }]}>Rounding Mode</Text>
          <View style={styles.pillRow}>
            {(['round', 'floor', 'ceil'] as RoundingMode[]).map((mode) => {
              const active = roundingMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setRoundingMode(mode)}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {mode === 'round' ? 'Round' : mode === 'floor' ? 'Floor' : 'Ceil'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.previewText}>
            {livePreview ?? 'Enter Course Rating, Slope Rating, and Par to preview: HI 12.4 → CH → PH'}
          </Text>
        </View>

        <TeamSection
          teamName={teamAName}
          teamNamePlaceholder="e.g. Home Club"
          players={teamA}
          computed={teamAComputed}
          summary={teamASummary}
          onTeamNameChange={(value) => setTeamAName(autoCapitalizeWords(value))}
          onUpdate={(index, patch) => updateTeamPlayer('A', index, patch)}
        />

        <TeamSection
          teamName={teamBName}
          teamNamePlaceholder="e.g. Away Club"
          players={teamB}
          computed={teamBComputed}
          summary={teamBSummary}
          onTeamNameChange={(value) => setTeamBName(autoCapitalizeWords(value))}
          onUpdate={(index, patch) => updateTeamPlayer('B', index, patch)}
        />

        <View style={styles.actions}>
          {draftStatusText ? <Text style={styles.draftStatus}>{draftStatusText}</Text> : null}
          <PrimaryButton title="Share Handicap Sheet" onPress={onShareHandicapSheet} variant="secondary" />
          <PrimaryButton title="Clear Handicap Checker" onPress={clearChecker} variant="danger" />
          <PrimaryButton title="Back Home" onPress={() => navigation.navigate('Home')} variant="secondary" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TeamSection(props: {
  teamName: string;
  teamNamePlaceholder: string;
  players: CheckerPlayer[];
  computed: PlayerComputed[];
  summary: { count: number; avgHI: number | null; avgPH: number | null };
  onTeamNameChange: (value: string) => void;
  onUpdate: (index: number, patch: Partial<CheckerPlayer>) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Team Name</Text>
      <TextInput
        value={props.teamName}
        onChangeText={props.onTeamNameChange}
        style={[checkerInputStyle(props.teamName), styles.teamNameInput]}
        autoCapitalize="words"
        placeholder={props.teamNamePlaceholder}
        placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
      />
      <Text style={styles.metaText}>
        Players entered: {props.summary.count} · Avg HI: {formatMaybeNumber(props.summary.avgHI)} · Avg PH:{' '}
        {formatMaybeNumber(props.summary.avgPH)}
      </Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, styles.colName]}>Name</Text>
        <Text style={[styles.tableHeaderText, styles.colHi]}>HI</Text>
        <Text style={[styles.tableHeaderText, styles.colCalc]}>CH</Text>
        <Text style={[styles.tableHeaderText, styles.colCalc]}>PH</Text>
      </View>
      {props.players.map((player, index) => {
        const computed = props.computed[index];
        return (
          <View key={player.id} style={styles.playerRow}>
            <TextInput
              value={player.name}
              onChangeText={(value) => props.onUpdate(index, { name: value })}
              style={checkerInputStyle(player.name, styles.colName)}
              placeholder="e.g. J. Smith"
              placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
            />
            <TextInput
              value={player.handicapIndexText}
              onChangeText={(value) => props.onUpdate(index, { handicapIndexText: value })}
              style={checkerInputStyle(player.handicapIndexText, styles.colHi)}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="e.g. 12.4"
              placeholderTextColor={CHECKER_PLACEHOLDER_COLOR}
            />
            <View style={[styles.calcCell, styles.colCalc]}>
              <Text style={styles.calcText}>{formatMaybeNumber(computed.courseHandicap)}</Text>
            </View>
            <View style={[styles.calcCell, styles.colCalc]}>
              <Text style={styles.calcText}>{formatMaybeNumber(computed.playingHandicap)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  title: { fontSize: 24, fontWeight: '900', color: colors.primary },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
    padding: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 8 },
  teamNameInput: { marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  field: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  inputEmpty: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  inputFilled: {
    backgroundColor: colors.card,
    borderColor: '#C4C4C4',
    borderStyle: 'solid',
  },
  disabledInput: { opacity: 0.5 },
  metaText: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pillText: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
  pillTextActive: { color: colors.primary },
  customToggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
  },
  customToggleActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  customToggleText: { color: colors.textPrimary, fontWeight: '700' },
  customToggleTextActive: { color: colors.primary },
  tableHeader: { flexDirection: 'row', gap: 8, marginBottom: 6, marginTop: 4 },
  tableHeaderText: { fontSize: 11, color: colors.textSecondary, fontWeight: '800' },
  playerRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  colName: { flex: 2 },
  colHi: { flex: 1 },
  colCalc: { flex: 0.8 },
  calcCell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  calcText: { color: colors.textPrimary, fontWeight: '800' },
  actions: { gap: 10, marginTop: 6 },
  draftStatus: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
  },
  previewText: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
});
