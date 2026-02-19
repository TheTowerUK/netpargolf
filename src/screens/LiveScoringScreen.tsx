// src/screens/LiveScoringScreen.tsx
// NetParGolf — Live Scoring with 18-hole round state (in-memory)
// Par/SI are LOCKED per hole from saved Course (AsyncStorage).

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import {
  scoreHoleOptionA,
  sumBestN,
  type RoundingMode,
  type ScoringBreakdown,
} from '../core/scoring';

function computePlayingHandicap(
  courseHandicap: number,
  allowancePercent: number,
  roundingMode: RoundingMode
): number {
  const raw = courseHandicap * (allowancePercent / 100);
  if (roundingMode === 'floor') return Math.floor(raw);
  if (roundingMode === 'ceil') return Math.ceil(raw);
  return Math.round(raw);
}

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';

import { loadCourse, getActiveCourseId } from '../storage/courseStorage';
import { loadRound, saveRound, clearRound, type PersistedRoundV1 } from '../storage/roundStorage';
import { saveRoundToHistory } from '../storage/roundHistoryStorage';
import { useAutosaveRound } from '../hooks/useAutosaveRound';
import type { Course } from '../core/course';
import { colors } from '../theme/colors';
import { hapticTap, hapticSuccess, hapticError } from '../utils/feedback';
import { useToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';

type PlayerUI = {
  id: string;
  name: string;
  courseHandicap: string;
};

type HoleState = {
  grossByPlayer: Record<string, string>;
};

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

const DEFAULT_PLAYERS: PlayerUI[] = [
  { id: 'p1', name: 'Player 1', courseHandicap: '18' },
  { id: 'p2', name: 'Player 2', courseHandicap: '14' },
  { id: 'p3', name: 'Player 3', courseHandicap: '10' },
  { id: 'p4', name: 'Player 4', courseHandicap: '22' },
];

const getGrossAccessoryId = (playerId: string) => `grossAccessory_${playerId}`;

function GrossAccessoryBar({
  nativeID,
  holeComplete,
  onDone,
  onNextHole,
}: {
  nativeID: string;
  holeComplete: boolean;
  onDone: () => void;
  onNextHole: () => void;
}) {
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.accessoryBar}>
        <Pressable onPress={onDone} style={({ pressed }) => [styles.accessoryBtn, pressed && styles.btnPressed]}>
          <Text style={styles.accessoryBtnText}>Done</Text>
        </Pressable>

        <Pressable
          disabled={!holeComplete}
          onPress={onNextHole}
          style={({ pressed }) => [
            styles.accessoryBtnPrimary,
            !holeComplete && styles.accessoryBtnDisabled,
            pressed && holeComplete && styles.btnPressed,
          ]}
        >
          <Text style={styles.accessoryBtnPrimaryText}>Next hole</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export default function LiveScoringScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const toast = useToast();

  const [players, setPlayers] = useState<PlayerUI[]>(DEFAULT_PLAYERS);
  const [activePlayerId, setActivePlayerId] = useState<string>(DEFAULT_PLAYERS[0].id);
  const [pendingFocus, setPendingFocus] = useState<null | { playerId: string; field: 'name' | 'gross' | 'hcp' }>(null);
  const [holeNumber, setHoleNumber] = useState<number>(1);
  const [playersInRound, setPlayersInRound] = useState<1 | 2 | 3 | 4>(4);
  const [bestN, setBestN] = useState<2 | 3 | 4>(2);
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('nearest');
  const [allowancePercent, setAllowancePercent] = useState<string>('100');
  const [competitionName, setCompetitionName] = useState('Club Stableford');
  const [competitionDate, setCompetitionDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });
  const [tee, setTee] = useState<'White' | 'Yellow' | 'Red' | 'Blue'>('White');
  const [marker, setMarker] = useState('');

  const [course, setCourse] = useState<Course | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [roundLoading, setRoundLoading] = useState(true);

  const [holes, setHoles] = useState<Record<number, HoleState>>(() => {
    const init: Record<number, HoleState> = {};
    HOLES.forEach((h) => {
      init[h] = { grossByPlayer: {} };
    });
    return init;
  });

  const inputRefs = React.useRef<Record<string, React.RefObject<TextInput>>>({});
  const grossStartValueRef = React.useRef<Record<string, string>>({});

  const latestRef = React.useRef({ players, holes, holeNumber, playersInRound });
  useEffect(() => {
    latestRef.current = { players, holes, holeNumber, playersInRound };
  }, [players, holes, holeNumber, playersInRound]);

  useEffect(() => {
    grossStartValueRef.current = {};
  }, [holeNumber]);

  useEffect(() => {
    const required = players.slice(0, playersInRound);
    if (!required.some((p) => p.id === activePlayerId)) {
      const first = required[0];
      if (first) setActivePlayerId(first.id);
    }
  }, [players, playersInRound, activePlayerId]);

  useEffect(() => {
    if (!pendingFocus) return;
    if (pendingFocus.playerId !== activePlayerId) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        getInputRef(pendingFocus.playerId, pendingFocus.field).current?.focus?.();
        setPendingFocus(null);
      });
    });
  }, [pendingFocus, activePlayerId]);

  const activePlayers = useMemo(
    () => players.slice(0, playersInRound),
    [players, playersInRound]
  );

  const focusGross = (playerId: string) => {
    setTimeout(() => {
      getInputRef(playerId, 'gross').current?.focus?.();
    }, 80);
  };

  const isFilledGross = (v: unknown) => v != null && String(v).trim() !== '';

  const willHoleBeCompleteAfter = (playerIdJustEdited: string, newValue: string) => {
    const required = players.slice(0, playersInRound);
    return required.every((p) => {
      const v =
        p.id === playerIdJustEdited
          ? newValue
          : (holes[holeNumber]?.grossByPlayer?.[p.id] ?? '');
      return String(v).trim() !== '';
    });
  };

  const allPlayersFilledForHole = (holeNo: number) => {
    const { players: pls, holes: hs, playersInRound: pir } = latestRef.current;
    const st = hs[holeNo];
    if (!st?.grossByPlayer) return false;
    const required = pls.slice(0, pir);
    return required.every((p) => isFilledGross(st.grossByPlayer[p.id]));
  };

  const advanceToNextPlayer = (currentId: string) => {
    const { players: pls, playersInRound: pir } = latestRef.current;
    const required = pls.slice(0, pir);
    const idx = required.findIndex((p) => p.id === currentId);
    if (idx < 0) return;

    const next = required[(idx + 1) % required.length];
    setActivePlayerId(next.id);
    focusGross(next.id);
  };

  const advanceToNextHoleIfComplete = () => {
    const { holeNumber: h, players: pls } = latestRef.current;

    if (!allPlayersFilledForHole(h)) return;

    if (h >= 18) {
      toast.show('Round complete (Hole 18)', 'success', 1200);
      return;
    }

    const nextHole = h + 1;
    setHoleNumber(nextHole);

    const first = pls[0];
    if (first) {
      setActivePlayerId(first.id);
      focusGross(first.id);
    }

    toast.show(`Hole ${h} complete → Hole ${nextHole}`, 'success', 900);
  };

  const getInputRef = (playerId: string, field: 'name' | 'gross' | 'hcp') => {
    const key = `${playerId}:${field}`;
    if (!inputRefs.current[key]) {
      inputRefs.current[key] = React.createRef<TextInput>();
    }
    return inputRefs.current[key];
  };

  useEffect(() => {
    (async () => {
      try {
        const c = await loadCourse();
        setCourse(c);
      } finally {
        setCourseLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await loadRound();
        if (saved) {
          setPlayers(
            saved.players.map(({ id, name, courseHandicap }) => ({ id, name, courseHandicap }))
          );
          setAllowancePercent(saved.allowancePercent ?? '100');
          const m = saved.meta;
          if (m?.competitionName) setCompetitionName(m.competitionName);
          if (m?.competitionDate) setCompetitionDate(m.competitionDate);
          if (m?.tee) setTee(m.tee);
          if (m?.marker) setMarker(m.marker);
          const mergedHoles: Record<number, HoleState> = {};
          HOLES.forEach((h) => {
            mergedHoles[h] = saved.holes[h] ?? { grossByPlayer: {} };
          });
          setHoles(mergedHoles);
          setHoleNumber(saved.holeNumber);
          setBestN(saved.bestN);
          setRoundingMode(saved.roundingMode);
        }
      } finally {
        setRoundLoading(false);
      }
    })();
  }, []);

  const persistNow = async () => {
    const payload: PersistedRoundV1 = {
      version: 1,
      savedAt: Date.now(),
      holeNumber,
      bestN,
      roundingMode,
      allowancePercent,
      meta: { competitionName, competitionDate, tee, marker },
      players,
      holes,
    };
    await saveRound(payload);
  };

  useAutosaveRound(
    { holeNumber, bestN, roundingMode, allowancePercent, competitionName, competitionDate, tee, marker, players, holes },
    persistNow,
    450
  );

  const currentHole = holes[holeNumber];

  const lockedHole = useMemo(() => {
    if (!course?.holes || course.holes.length !== 18) return null;
    return course.holes[holeNumber - 1] ?? null;
  }, [course, holeNumber]);

  const lockedPar = lockedHole?.par ?? null;
  const lockedSI = lockedHole?.strokeIndex ?? null;

  const parsedHole = useMemo(() => {
    const par = lockedPar ?? NaN;
    const si = lockedSI ?? NaN;
    return { par, si };
  }, [lockedPar, lockedSI]);

  const breakdowns = useMemo(() => {
    return players.map((pl) => {
      const grossStr = currentHole.grossByPlayer[pl.id];
      const ch = parseInt(pl.courseHandicap, 10);
      const pct = parseFloat(allowancePercent);
      const gross = parseInt(grossStr ?? '', 10);

      if (
        !Number.isFinite(ch) ||
        !Number.isFinite(pct) ||
        !Number.isFinite(gross) ||
        !Number.isFinite(parsedHole.par) ||
        !Number.isFinite(parsedHole.si)
      ) {
        return null;
      }

      const playingHcp = computePlayingHandicap(ch, pct, roundingMode);

      try {
        return scoreHoleOptionA({
          courseHandicap: playingHcp,
          allowancePercent: 1,
          roundingMode,
          hole: { par: parsedHole.par, strokeIndex: parsedHole.si },
          gross,
        });
      } catch {
        return null;
      }
    });
  }, [players, currentHole, parsedHole, roundingMode, allowancePercent]);

  const teamHolePoints = useMemo(() => {
    const valid = breakdowns.filter((b): b is ScoringBreakdown => !!b);
    if (!valid.length) return null;
    return sumBestN(valid.map((b) => b.points), Math.min(bestN, valid.length));
  }, [breakdowns, bestN]);

  const holeComplete = useMemo(() => {
    return activePlayers.every((pl) => {
      const gross = currentHole.grossByPlayer[pl.id];
      return gross != null && String(gross).trim() !== '';
    });
  }, [activePlayers, currentHole]);

  const roundTotals = useMemo(() => {
    const totals = players.map((pl) => ({
      playerId: pl.id,
      name: pl.name,
      gross: 0,
      net: 0,
      points: 0,
      holesScored: 0,
    }));

    let teamTotal = 0;

    HOLES.forEach((h) => {
      const courseHole = course?.holes?.[h - 1];
      if (!courseHole) return;

      const par = courseHole.par;
      const si = courseHole.strokeIndex;
      if (!Number.isFinite(par) || !Number.isFinite(si)) return;

      const holeState = holes[h];
      const holeBreakdowns: ScoringBreakdown[] = [];

      players.forEach((pl, idx) => {
        const grossStr = holeState.grossByPlayer[pl.id];
        const gross = parseInt(grossStr ?? '', 10);
        const ch = parseInt(pl.courseHandicap, 10);
        const pct = parseFloat(allowancePercent);

        if (!Number.isFinite(gross) || !Number.isFinite(ch) || !Number.isFinite(pct)) return;

        const playingHcp = computePlayingHandicap(ch, pct, roundingMode);

        try {
          const b = scoreHoleOptionA({
            courseHandicap: playingHcp,
            allowancePercent: 1,
            roundingMode,
            hole: { par, strokeIndex: si },
            gross,
          });

          totals[idx].gross += gross;
          totals[idx].net += b.net;
          totals[idx].points += b.points;
          totals[idx].holesScored += 1;
          holeBreakdowns.push(b);
        } catch {
          // skip
        }
      });

      if (holeBreakdowns.length) {
        teamTotal += sumBestN(
          holeBreakdowns.map((b) => b.points),
          Math.min(bestN, holeBreakdowns.length)
        );
      }
    });

    return { players: totals, teamTotal };
  }, [holes, players, bestN, roundingMode, allowancePercent, course]);

  const updateGross = (playerId: string, value: string) => {
    setHoles((prev) => ({
      ...prev,
      [holeNumber]: {
        ...prev[holeNumber],
        grossByPlayer: { ...prev[holeNumber].grossByPlayer, [playerId]: value },
      },
    }));
  };

  const goToHole = (h: number) => setHoleNumber(h);

  const clearCurrentHoleGross = () => {
    setHoles((prev) => ({
      ...prev,
      [holeNumber]: { ...prev[holeNumber], grossByPlayer: {} },
    }));
  };

  const resetRound = async () => {
    Alert.alert(
      'Reset round?',
      'This will clear the in-progress round and all scores. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            hapticTap();
            try {
              await clearRound();

              setPlayers(DEFAULT_PLAYERS);
              setBestN(2);
              setRoundingMode('nearest');
              setAllowancePercent('100');
              setCompetitionName('Club Stableford');
              setCompetitionDate(new Date().toISOString().slice(0, 10));
              setTee('White');
              setMarker('');

              setHoles(() => {
                const reset: Record<number, HoleState> = {};
                HOLES.forEach((h) => (reset[h] = { grossByPlayer: {} }));
                return reset;
              });

              setHoleNumber(1);
              hapticSuccess();
              toast.show('Round reset', 'success');
            } catch (e) {
              hapticError();
              toast.show('Could not reset. Try again.', 'error');
            }
          },
        },
      ]
    );
  };

  const refreshCourse = async () => {
    setCourseLoading(true);
    try {
      const c = await loadCourse();
      setCourse(c);
    } finally {
      setCourseLoading(false);
    }
  };

  const onArchive = async () => {
    Alert.alert(
      'Archive round?',
      'This will save the round to Round History and clear the in-progress round.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'default',
          onPress: async () => {
            hapticTap();
            try {
              const payload: PersistedRoundV1 = {
                version: 1,
                savedAt: Date.now(),
                holeNumber,
                bestN,
                roundingMode,
                allowancePercent,
                meta: { competitionName, competitionDate, tee, marker },
                players,
                holes,
              };

              const courseId = await getActiveCourseId();
              const courseName = course?.name ?? 'No course selected';
              const teamTotal = roundTotals?.teamTotal ?? null;

              await saveRoundToHistory(payload, courseId, courseName, teamTotal);
              await clearRound();

              setHoles(() => {
                const reset: Record<number, HoleState> = {};
                HOLES.forEach((h) => (reset[h] = { grossByPlayer: {} }));
                return reset;
              });
              setHoleNumber(1);

              hapticSuccess();
              toast.show('Archived to History', 'success');
              navigation.navigate('RoundHistory');
            } catch (e) {
              hapticError();
              toast.show('Could not archive. Try again.', 'error');
            }
          },
        },
      ]
    );
  };

  const ensureCourse = () => {
    if (!course) {
      Alert.alert(
        'Course not set',
        'Please go to Course Setup and enter Par & Stroke Index for holes 1–18. Live Scoring locks to the saved course.'
      );
    }
  };

  const courseReady = !!course && Array.isArray(course.holes) && course.holes.length === 18;

  const hasAnyGross = useMemo(() => {
    return HOLES.some((h) => {
      const state = holes[h];
      if (!state?.grossByPlayer) return false;
      return Object.values(state.grossByPlayer).some(
        (v) => v != null && String(v).trim() !== ''
      );
    });
  }, [holes]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Live Scoring</Text>

        <View style={styles.courseCard}>
          {courseReady ? (
            <View style={styles.liveCourseBanner}>
              <Text style={styles.liveCourseLabel}>Live scoring course</Text>
              <Text style={styles.liveCourseName}>{course!.name}</Text>
            </View>
          ) : (
            <View style={styles.courseNameBlock}>
              <Text style={styles.courseLabel}>Course</Text>
              <Text style={styles.courseName}>
                {courseLoading ? 'Loading…' : 'No course saved'}
              </Text>
            </View>
          )}

          <View style={styles.courseBtns}>
            <Pressable
              style={({ pressed }) => [styles.smallBtn, pressed && styles.btnPressed]}
              onPress={() => { hapticTap(); navigation.navigate('Scorecard'); }}
            >
              <Text style={styles.smallBtnText}>View Scorecard</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.smallBtn, pressed && styles.btnPressed]}
              onPress={() => { hapticTap(); refreshCourse(); }}
            >
              <Text style={styles.smallBtnText}>Refresh</Text>
            </Pressable>
          </View>

          <Text style={styles.courseHint}>
            Par/SI are locked per hole from Course Setup.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Competition</Text>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={competitionName}
                onChangeText={setCompetitionName}
                style={styles.input}
                placeholder="Club Stableford"
                placeholderTextColor="#999"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                value={competitionDate}
                onChangeText={setCompetitionDate}
                style={styles.input}
                placeholder="2026-02-15"
                placeholderTextColor="#999"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Tee</Text>
              <View style={styles.pills}>
                <Pill text="White" active={tee === 'White'} onPress={() => setTee('White')} />
                <Pill text="Yellow" active={tee === 'Yellow'} onPress={() => setTee('Yellow')} />
                <Pill text="Red" active={tee === 'Red'} onPress={() => setTee('Red')} />
                <Pill text="Blue" active={tee === 'Blue'} onPress={() => setTee('Blue')} />
              </View>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Marker</Text>
              <TextInput
                value={marker}
                onChangeText={setMarker}
                style={styles.input}
                placeholder="Marker name"
                placeholderTextColor="#999"
              />
            </View>
          </View>
        </View>

        {!courseReady ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Set up your course first</Text>
            <Text style={styles.warnText}>
              Live Scoring needs Par and Stroke Index for holes 1–18. Go to Course Setup, save the course,
              then come back and tap Refresh.
            </Text>

            <PrimaryButton
              title="Go to Course Setup"
              onPress={() => navigation.navigate('CourseSetup')}
              variant="primary"
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hole</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holeChips}>
            {HOLES.map((h) => (
              <Pressable
                key={h}
                onPress={() => { hapticTap(); goToHole(h); }}
                style={({ pressed }) => [styles.holeChip, h === holeNumber && styles.holeChipActive, pressed && styles.btnPressed]}
              >
                <Text style={h === holeNumber ? styles.holeChipTextActive : styles.holeChipText}>
                  {h}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.lockedRow}>
            <LockedValue label="Par" value={lockedPar == null ? '—' : String(lockedPar)} />
            <LockedValue label="Stroke Index" value={lockedSI == null ? '—' : String(lockedSI)} />
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Team scoring</Text>
              <View style={styles.pills}>
                <Pill text="Best 2" active={bestN === 2} onPress={() => setBestN(2)} />
                <Pill text="Best 3" active={bestN === 3} onPress={() => setBestN(3)} />
                <Pill text="All 4" active={bestN === 4} onPress={() => setBestN(4)} />
              </View>
              <Text style={styles.hint}>Team points per hole = sum of best N points.</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Rounding</Text>
              <View style={styles.pills}>
                <Pill text="Nearest" active={roundingMode === 'nearest'} onPress={() => setRoundingMode('nearest')} />
                <Pill text="Floor" active={roundingMode === 'floor'} onPress={() => setRoundingMode('floor')} />
                <Pill text="Ceil" active={roundingMode === 'ceil'} onPress={() => setRoundingMode('ceil')} />
              </View>
              <Text style={styles.hint}>Applied to handicap × allowance.</Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Players scoring this round</Text>
            <View style={styles.pills}>
              <Pill text="1" active={playersInRound === 1} onPress={() => setPlayersInRound(1)} />
              <Pill text="2" active={playersInRound === 2} onPress={() => setPlayersInRound(2)} />
              <Pill text="3" active={playersInRound === 3} onPress={() => setPlayersInRound(3)} />
              <Pill text="4" active={playersInRound === 4} onPress={() => setPlayersInRound(4)} />
            </View>
            <Text style={styles.hint}>
              Only the first {playersInRound} player(s) will be required to complete each hole.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Handicap Allowance %</Text>
            <TextInput
              value={allowancePercent}
              onChangeText={setAllowancePercent}
              keyboardType="decimal-pad"
              style={styles.input}
              placeholder="100"
              placeholderTextColor="#999"
            />
            <Text style={styles.hint}>
              Applied to all players for this round.
            </Text>
          </View>

          <View style={styles.teamBox}>
            <View>
              <Text style={styles.teamLabel}>Hole {holeNumber} team points</Text>
              {holeComplete ? (
                <Text style={styles.holeCompleteText}>✓ Hole complete</Text>
              ) : null}
            </View>
            <Text style={styles.teamValue}>{teamHolePoints == null ? '—' : `${teamHolePoints}`}</Text>
          </View>
        </View>

        <View style={[styles.card, styles.playersOuterCard]}>
          <Text style={styles.cardTitle}>Players</Text>
          <Text style={styles.muted}>
            Tip: keep Course Hcp constant; just enter Gross for each hole.
          </Text>
          <Text style={styles.muted}>
            Tap a player header (or any greyed field) to set the active player.
          </Text>

          {players.map((pl, idx) => {
            const b = breakdowns[idx];
            const isActive = pl.id === activePlayerId;
            const grossVal = currentHole.grossByPlayer[pl.id] ?? '';
            const grossNum = parseInt(grossVal, 10);
            const par = lockedPar ?? 0;
            const grossVsPar = Number.isFinite(grossNum) && Number.isFinite(par) ? grossNum - par : null;
            const grossCellStyle = grossVsPar != null ? getGrossVsParStyle(grossVsPar) : undefined;
            return (
              <View
                key={pl.id}
                style={[
                  styles.playerCard,
                  isActive && styles.playerCardActive,
                  isActive && styles.playerCardActiveShadow,
                ]}
              >
                <Pressable
                  onPress={() => { hapticTap(); setActivePlayerId(pl.id); }}
                  style={({ pressed }) => [styles.playerHeader, pressed && styles.btnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Set active player: ${pl.name}`}
                  accessibilityHint="Highlights this player for easier scoring"
                >
                  <View style={styles.playerHeaderLeft}>
                    <Text style={styles.playerName}>{pl.name}</Text>
                    {isActive ? <Text style={styles.activePill}>ACTIVE</Text> : null}
                  </View>

                  <View style={styles.pointsBadge}>
                    <Text style={styles.pointsBadgeValue}>{b ? b.points : '—'}</Text>
                    <Text style={styles.pointsBadgeLabel}>pts</Text>
                  </View>
                </Pressable>

                <View style={styles.row}>
                  <FieldText
                    label="Name"
                    value={pl.name}
                    onChangeText={(v) => setPlayers((prev) => prev.map((p) => (p.id === pl.id ? { ...p, name: v } : p)))}
                    keyboardType="default"
                    hint="Player name"
                    enabled={isActive}
                    onRequestEnable={() => {
                      setActivePlayerId(pl.id);
                      setPendingFocus({ playerId: pl.id, field: 'name' });
                    }}
                    inputRef={getInputRef(pl.id, 'name')}
                  />
                  <FieldText
                    label="Gross"
                    value={grossVal}
                    onChangeText={(v) => {
                      if (!courseReady) ensureCourse();
                      updateGross(pl.id, v);
                    }}
                    keyboardType="number-pad"
                    hint="strokes"
                    inputContainerStyle={{
                      ...(grossCellStyle ?? {}),
                      ...(isActive ? styles.activeInputRing : {}),
                    }}
                    enabled={isActive}
                    onRequestEnable={() => {
                      setActivePlayerId(pl.id);
                      setPendingFocus({ playerId: pl.id, field: 'gross' });
                    }}
                    inputRef={getInputRef(pl.id, 'gross')}
                    inputAccessoryViewID={Platform.OS === 'ios' ? getGrossAccessoryId(pl.id) : undefined}
                    onFocus={() => {
                      grossStartValueRef.current[pl.id] = (grossVal ?? '').trim();
                    }}
                    onEndEditing={() => {
                      if (!isActive) return;

                      const start = (grossStartValueRef.current[pl.id] ?? '').trim();
                      const end = (grossVal ?? '').trim();

                      if (start !== '' || end === '') return;
                      if (!/^\d+$/.test(end)) return;

                      const n = Number(end);
                      if (!Number.isFinite(n) || n < 1 || n > 20) return;

                      const complete = willHoleBeCompleteAfter(pl.id, end);

                      if (complete) {
                        if (holeNumber < 18) {
                          const nextHole = holeNumber + 1;
                          setHoleNumber(nextHole);

                          const first = players.slice(0, playersInRound)[0];
                          if (first) {
                            setActivePlayerId(first.id);
                            setPendingFocus({ playerId: first.id, field: 'gross' });
                          }
                          toast.show(`Hole ${holeNumber} complete → Hole ${nextHole}`, 'success', 900);
                        } else {
                          toast.show('Hole 18 complete', 'success', 1100);
                        }
                      } else {
                        const required = players.slice(0, playersInRound);
                        const idx = required.findIndex((p) => p.id === pl.id);
                        const next = required[(idx + 1) % required.length];
                        setActivePlayerId(next.id);
                        setPendingFocus({ playerId: next.id, field: 'gross' });
                      }
                    }}
                  />
                </View>

                <View style={styles.row}>
                  <FieldText
                    label="Course Hcp"
                    value={pl.courseHandicap}
                    onChangeText={(v) => setPlayers((prev) => prev.map((p) => (p.id === pl.id ? { ...p, courseHandicap: v } : p)))}
                    keyboardType="number-pad"
                    hint="e.g. 18"
                    enabled={isActive}
                    onRequestEnable={() => {
                      setActivePlayerId(pl.id);
                      setPendingFocus({ playerId: pl.id, field: 'hcp' });
                    }}
                    inputRef={getInputRef(pl.id, 'hcp')}
                  />
                </View>

                <View style={styles.breakRow}>
                  <BreakItem
                    label="Playing Hcp"
                    value={
                      Number.isFinite(parseInt(pl.courseHandicap, 10))
                        ? computePlayingHandicap(
                            parseInt(pl.courseHandicap, 10),
                            parseFloat(allowancePercent),
                            roundingMode
                          ).toString()
                        : '—'
                    }
                  />
                  <BreakItem label="Adj Hcp" value={b ? `${b.adjustedHandicap}` : '—'} />
                  <BreakItem label="Strokes" value={b ? `${b.strokesReceivedOnHole}` : '—'} />
                  <BreakItem label="Net" value={b ? `${b.net}` : '—'} />
                  <BreakItem
                    label="Net vs Par"
                    value={b ? formatDiff(b.netVsPar) : '—'}
                    scoreVsParStyle={b ? getScoreVsParStyle(b.netVsPar) : undefined}
                  />
                </View>

                {!courseReady ? (
                  <Text style={styles.warn}>Course not saved. Par/SI must be set in Course Setup.</Text>
                ) : null}
              </View>
            );
          })}

        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Round Summary</Text>

          {!courseReady ? (
            <Text style={styles.muted}>Save a course to enable full round totals.</Text>
          ) : (
            <>
              {roundTotals.players.map((p) => (
                <View key={p.playerId} style={styles.summaryRow}>
                  <Text style={styles.summaryName}>{p.name}</Text>
                  <Text style={styles.summaryVal}>G {p.gross}</Text>
                  <Text style={styles.summaryVal}>N {p.net}</Text>
                  <Text style={styles.summaryVal}>{p.points} pts</Text>
                </View>
              ))}

              <Text style={styles.teamTotal}>
                Team total: <Text style={styles.teamTotalValue}>{roundTotals.teamTotal}</Text>
              </Text>
            </>
          )}
        </View>

        {courseReady ? (
          <View style={styles.card}>
            <PrimaryButton
              title="Archive to History"
              onPress={onArchive}
              disabled={!hasAnyGross}
              variant="primary"
              accessibilityLabel="Archive to history"
              accessibilityHint="Moves this round into your round history"
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <PrimaryButton
            title="Clear Hole Gross"
            onPress={() => { clearCurrentHoleGross(); toast.show('Updated', 'success', 900); }}
            variant="secondary"
          />
        </View>

        <View style={styles.card}>
          <PrimaryButton
            title="Reset Round"
            onPress={resetRound}
            variant="danger"
            accessibilityLabel="Reset round"
            accessibilityHint="Clears all scores and starts a new round"
          />
        </View>

        <Text style={styles.footerMuted}>
          v0.2 — Locked course Par/SI + live scoring.
        </Text>
      </ScrollView>

      {Platform.OS === 'ios'
        ? players.map((pl) => (
            <GrossAccessoryBar
              key={pl.id}
              nativeID={getGrossAccessoryId(pl.id)}
              holeComplete={holeComplete}
              onDone={() => {
                hapticTap();
                Keyboard.dismiss();
              }}
              onNextHole={() => {
                hapticTap();
                if (!holeComplete) return;
                if (holeNumber < 18) {
                  const nextHole = holeNumber + 1;
                  setHoleNumber(nextHole);

                  const first = players.slice(0, playersInRound)[0];
                  if (first) {
                    setActivePlayerId(first.id);
                    setPendingFocus({ playerId: first.id, field: 'gross' });
                  }
                  toast.show(`Hole ${holeNumber} complete → Hole ${nextHole}`, 'success', 900);
                } else {
                  toast.show('Hole 18 complete', 'success', 1100);
                }
              }}
            />
          ))
        : null}
    </KeyboardAvoidingView>
  );
}

function formatDiff(netVsPar: number) {
  if (netVsPar === 0) return 'E';
  if (netVsPar > 0) return `+${netVsPar}`;
  return `${netVsPar}`;
}

function Pill({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { hapticTap(); onPress(); }}
      style={({ pressed }) => [styles.pill, active ? styles.pillActive : styles.pillInactive, pressed && styles.btnPressed]}
    >
      <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>{text}</Text>
    </Pressable>
  );
}

function FieldText(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  hint?: string;
  inputContainerStyle?: StyleProp<TextStyle>;
  enabled?: boolean;
  onRequestEnable?: () => void;
  inputRef?: React.RefObject<TextInput>;
  inputAccessoryViewID?: string;
  onFocus?: () => void;
  onEndEditing?: () => void;
}) {
  const enabled = props.enabled ?? true;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>

      <View style={styles.inputWrap}>
        <TextInput
          ref={props.inputRef}
          inputAccessoryViewID={props.inputAccessoryViewID}
          value={props.value}
          onChangeText={props.onChangeText}
          keyboardType={props.keyboardType ?? 'default'}
          style={[
            styles.input,
            props.inputContainerStyle,
            !enabled && styles.inputDisabled,
          ]}
          placeholder={props.hint}
          placeholderTextColor="#999"
          autoCorrect={false}
          autoCapitalize="none"
          editable={enabled}
          selectTextOnFocus={enabled}
          onFocus={props.onFocus}
          onEndEditing={props.onEndEditing}
        />

        {!enabled && props.onRequestEnable ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              hapticTap();
              props.onRequestEnable?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Activate player to edit ${props.label}`}
            accessibilityHint="Sets this player as active so you can edit their fields"
          />
        ) : null}
      </View>

      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

function getScoreVsParStyle(netVsPar: number): { backgroundColor: string } | undefined {
  if (netVsPar <= -1) return { backgroundColor: colors.successSoft };
  if (netVsPar === 0) return undefined;
  if (netVsPar === 1) return { backgroundColor: colors.warningSoft };
  return { backgroundColor: colors.dangerSoft };
}

function getGrossVsParStyle(grossVsPar: number): { backgroundColor: string } {
  if (grossVsPar <= -1) return { backgroundColor: colors.successSoft };
  if (grossVsPar === 0) return { backgroundColor: colors.card };
  if (grossVsPar === 1) return { backgroundColor: colors.warningSoft };
  return { backgroundColor: colors.dangerSoft };
}

function BreakItem({ label, value, scoreVsParStyle }: { label: string; value: string; scoreVsParStyle?: { backgroundColor: string } }) {
  return (
    <View style={[styles.breakItem, scoreVsParStyle]}>
      <Text style={styles.breakLabel}>{label}</Text>
      <Text style={styles.breakValue}>{value}</Text>
    </View>
  );
}

function LockedValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.lockedBox}>
      <Text style={styles.lockedLabel}>{label}</Text>
      <Text style={styles.lockedValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 10, color: colors.primary },

  courseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.card,
    flexDirection: 'column',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  courseNameBlock: { marginBottom: 10 },
  courseLabel: { fontSize: 11, color: '#555', fontWeight: '900' },
  courseName: { fontSize: 16, fontWeight: '900', marginTop: 2 },
  courseHint: { fontSize: 11, color: '#666', marginTop: 10, lineHeight: 16 },

  liveCourseBanner: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  liveCourseLabel: { fontSize: 11, fontWeight: '900', color: colors.primary },
  liveCourseName: { fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 2 },
  courseBtns: { flexDirection: 'row', gap: 8, justifyContent: 'center' },

  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },

  accessoryBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  accessoryBtn: {
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  accessoryBtnText: {
    fontWeight: '900',
    color: colors.textPrimary,
  },
  accessoryBtnPrimary: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  accessoryBtnPrimaryText: {
    fontWeight: '900',
    color: colors.textInverse,
  },
  accessoryBtnDisabled: {
    opacity: 0.45,
  },
  accessoryBtnTextDisabled: {
    color: colors.textInverse,
    opacity: 0.85,
  },
  smallBtn: { backgroundColor: colors.primarySoft, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
  smallBtnText: { fontWeight: '900', color: colors.textPrimary },

  warnCard: {
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
    }),
  },
  warnTitle: { fontWeight: '900', color: colors.warning, marginBottom: 6 },
  warnText: { color: colors.warning, lineHeight: 18, fontSize: 13 },
  primaryBtn: { marginTop: 10, borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.primary },
  primaryBtnText: { color: colors.textInverse, fontWeight: '900' },

  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.card,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  playersOuterCard: {
    borderColor: '#EAEAEA',
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8 },

  holeChips: { gap: 8, paddingVertical: 2, paddingRight: 6 },
  holeChip: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  holeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  holeChipText: { fontWeight: '900', color: colors.textPrimary },
  holeChipTextActive: { fontWeight: '900', color: colors.textInverse },

  lockedRow: { flexDirection: 'row', gap: 12, marginTop: 10, marginBottom: 6 },
  lockedBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  lockedLabel: { fontSize: 11, color: '#666', fontWeight: '900' },
  lockedValue: { fontSize: 18, fontWeight: '900', marginTop: 4 },

  row: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, marginBottom: 10 },
  label: { fontSize: 12, color: '#333', marginBottom: 6, fontWeight: '900' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputWrap: {
    position: 'relative',
  },
  inputDisabled: {
    backgroundColor: colors.chip,
    color: colors.textSecondary,
    borderColor: '#E6E6E6',
  },
  hint: { fontSize: 11, color: '#666', marginTop: 4 },

  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  pillActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  pillInactive: { borderColor: colors.border, backgroundColor: colors.card },
  pillText: { fontSize: 12, fontWeight: '900' },
  pillTextActive: { color: colors.textInverse },
  pillTextInactive: { color: colors.textPrimary },

  teamBox: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 12,
    backgroundColor: '#fafafa',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamLabel: { fontSize: 13, color: '#333', fontWeight: '900' },
  holeCompleteText: { fontSize: 12, fontWeight: '800', color: colors.success, marginTop: 4 },
  teamValue: { fontSize: 24, fontWeight: '900' },

  muted: { color: '#666', fontSize: 12, lineHeight: 17, marginBottom: 10 },

  playerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  playerCardActive: {
    borderWidth: 2.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  playerCardActiveShadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 3 },
  }),
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  playerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.primary,
    color: colors.textInverse,
    fontWeight: '900',
    fontSize: 11,
    overflow: 'hidden',
  },
  playerName: { fontSize: 16, fontWeight: '900' },

  pointsBadge: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 66,
  },
  pointsBadgeValue: { fontSize: 18, fontWeight: '900', lineHeight: 18 },
  pointsBadgeLabel: { fontSize: 10, fontWeight: '900', color: colors.textPrimary, marginTop: 2 },

  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  breakItem: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 4 },
  breakLabel: { fontSize: 10, color: '#666', fontWeight: '900' },
  breakValue: { fontSize: 13, color: '#111', fontWeight: '900', marginTop: 4 },

  activeInputRing: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  warn: { marginTop: 8, color: '#b45309', fontSize: 12, fontWeight: '900' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  archiveBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  archiveBtnDisabled: { backgroundColor: colors.border, opacity: 0.7 },
  archiveBtnText: { color: colors.textInverse, fontWeight: '900' },
  archiveBtnTextDisabled: { color: colors.textSecondary },
  secondaryBtnWide: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.primarySoft },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: '900', fontSize: 13 },
  dangerBtnWide: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.danger },
  dangerBtnText: { color: colors.textInverse, fontWeight: '900', fontSize: 13 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryName: { flex: 1, fontWeight: '900' },
  summaryVal: { width: 72, textAlign: 'right', fontWeight: '800' },

  teamTotal: { marginTop: 10, fontSize: 16, fontWeight: '900', textAlign: 'right' },
  teamTotalValue: { fontSize: 20 },

  footerMuted: { marginTop: 6, color: '#777', fontSize: 12, textAlign: 'center' },
});
