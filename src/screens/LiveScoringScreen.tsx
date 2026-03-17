// src/screens/LiveScoringScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
  ensureHoleState,
  loadCurrentRound,
  saveCurrentRound,
  type PersistedRoundV2,
} from '../storage/roundStorage';
import { computePlayingHandicap, scoreHoleOptionA } from '../core/scoring';
import type { RoundingMode } from '../core/scoring';
import { hapticTap } from '../utils/feedback';
import { colors } from '../theme/colors';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

const COMPETITION_LABELS: Record<string, string> = {
  individual_stableford: 'Stableford',
  betterball: 'Betterball',
  matchplay: 'Matchplay',
  strokeplay: 'Strokeplay',
};

function LockedValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.lockedValueWrap}>
      <Text style={styles.lockedLabel}>{label}</Text>
      <Text style={styles.lockedValue}>{value}</Text>
    </View>
  );
}

function BreakItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.breakItem}>
      <Text style={styles.breakLabel}>{label}</Text>
      <Text style={styles.breakValue}>{value}</Text>
    </View>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'LiveScoring'>;

function clampHole(value: number, max: number) {
  return Math.max(1, Math.min(max, value));
}

export default function LiveScoringScreen({ route, navigation }: Props) {
  const { course, setup } = route.params;

  const [round, setRound] = useState<PersistedRoundV2 | null>(null);
  const [loading, setLoading] = useState(true);

  const totalHoles = course.holes.length || 18;

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const existing = await Promise.race([
          loadCurrentRound(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);

        if (!alive) return;

        // If setup has been passed back in, merge it into the current round
        // instead of rebuilding from scratch, so scores/currentHole are preserved.
        if (setup) {
          const baseRound =
            existing ??
            buildInitialRound({
              courseId: course.id,
              courseName: course.name,
              players: setup.players,
              settings: {
                competition: setup.competition,
                allowancePercent: setup.allowancePercent,
                roundingMode: setup.roundingMode,
              },
            });

          const updatedPlayerIds = setup.players.map((p) => p.id);
          const mergedHoles: PersistedRoundV2['holes'] = {};

          for (let h = 1; h <= totalHoles; h += 1) {
            const existingHole = baseRound.holes[h];
            const grossByPlayer: Record<string, string> = {};

            for (const playerId of updatedPlayerIds) {
              grossByPlayer[playerId] = existingHole?.grossByPlayer?.[playerId] ?? '';
            }

            mergedHoles[h] = { grossByPlayer };
          }

          const nextRound: PersistedRoundV2 = {
            ...baseRound,
            courseId: course.id,
            courseName: course.name,
            players: setup.players,
            settings: {
              competition: setup.competition,
              allowancePercent: setup.allowancePercent,
              roundingMode: setup.roundingMode,
            },
            holes: mergedHoles,
            currentHole: Math.max(1, Math.min(baseRound.currentHole || 1, totalHoles)),
            meta: {
              ...(baseRound.meta ?? {}),
            },
          };

          await saveCurrentRound(nextRound);

          if (!alive) return;
          setRound(nextRound);
          setLoading(false);
          return;
        }

        if (existing) {
          setRound(existing);
          setLoading(false);
          return;
        }

        setLoading(false);
      } catch {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [course.id, course.name, totalHoles, setup]);

  const currentHole = round?.currentHole ?? 1;

  const holeMeta = useMemo(() => {
    return (
      course.holes.find((h) => h.hole === currentHole) || {
        hole: currentHole,
        par: 4,
        strokeIndex: currentHole,
      }
    );
  }, [course.holes, currentHole]);

  const currentHoleState = useMemo(() => {
    if (!round) return null;
    return ensureHoleState(round, currentHole);
  }, [round, currentHole]);

  async function persist(next: PersistedRoundV2) {
    setRound(next);
    await saveCurrentRound(next);
  }

  async function goToHole(nextHole: number) {
    if (!round) return;
    const target = clampHole(nextHole, totalHoles);

    const nextRound: PersistedRoundV2 = {
      ...round,
      currentHole: target,
      holes: {
        ...round.holes,
        [target]: round.holes[target] || ensureHoleState(round, target),
      },
    };

    await persist(nextRound);
  }

  async function updateGross(playerId: string, value: string) {
    if (!round) return;

    const sanitized = value.replace(/[^\d]/g, '');

    const holeState = ensureHoleState(round, currentHole);

    const nextRound: PersistedRoundV2 = {
      ...round,
      holes: {
        ...round.holes,
        [currentHole]: {
          ...holeState,
          grossByPlayer: {
            ...holeState.grossByPlayer,
            [playerId]: sanitized,
          },
        },
      },
    };

    await persist(nextRound);
  }

  function allScoresEnteredForHole() {
    if (!round) return false;
    const holeState = ensureHoleState(round, currentHole);
    return round.players.every((p) => (holeState.grossByPlayer[p.id] || '').trim() !== '');
  }

  function getPlayerHoleOutput(args: {
    grossString: string;
    courseHandicap: string;
    allowancePercent: string;
    roundingMode: RoundingMode;
    par: number;
    strokeIndex: number;
  }) {
    const gross = parseInt(args.grossString, 10);
    const ch = parseInt(args.courseHandicap, 10);
    const pct = parseFloat(args.allowancePercent);

    if (!Number.isFinite(gross) || gross <= 0) return '';
    if (!Number.isFinite(ch)) return '';
    if (!Number.isFinite(pct)) return '';

    try {
      const playingHcp = computePlayingHandicap(ch, pct, args.roundingMode);

      const b = scoreHoleOptionA({
        courseHandicap: playingHcp,
        allowancePercent: 1,
        roundingMode: args.roundingMode,
        hole: { par: args.par, strokeIndex: args.strokeIndex },
        gross,
      });

      return `${b.points} pts`;
    } catch {
      return '';
    }
  }

  function finishRound() {
    Alert.alert(
      'Finish Round',
      'You can wire this to your summary screen next.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: () => {
            // navigation.navigate('RoundSummary');
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading round…</Text>
      </View>
    );
  }

  if (!round) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>No round found.</Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.primaryBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Live Scoring</Text>

      <View style={styles.topActionsRow}>
        <Pressable
          onPress={() => {
            hapticTap();
            navigation.navigate('RoundSetup', {
              course: {
                id: course?.id,
                name: course?.name ?? 'Selected Course',
                holes: (course?.holes ?? []).map((h) => ({
                  hole: h.hole,
                  par: h.par,
                  strokeIndex: h.strokeIndex,
                })),
              },
            });
          }}
          style={({ pressed }) => [styles.smallBtn, pressed && styles.btnPressed]}
        >
          <Text style={styles.smallBtnText}>Return to Setup</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Round Setup</Text>

        <View style={styles.setupSummaryGrid}>
          <LockedValue label="Competition" value={COMPETITION_LABELS[round.settings.competition] || round.settings.competition || '—'} />
          <LockedValue label="Players" value={String(round.players.length)} />
          <LockedValue label="Allowance" value={`${round.settings.allowancePercent || '—'}%`} />
          <LockedValue label="Rounding" value={round.settings.roundingMode || '—'} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hole</Text>
        <View style={styles.holeLockedRow}>
          <Text style={styles.holeLockedLabel}>Par / SI</Text>
          <Text style={styles.holeLockedValue}>
            Par {holeMeta.par} • SI {holeMeta.strokeIndex}
          </Text>
        </View>
        <View style={styles.teamBox}>
          <View>
            <Text style={styles.teamLabel}>Hole {currentHole} team points</Text>
            {allScoresEnteredForHole() ? (
              <Text style={styles.holeCompleteText}>✓ Hole complete</Text>
            ) : null}
          </View>
          <Text style={styles.teamValue}>
            {(() => {
              const holeState = ensureHoleState(round, currentHole);
              const pct = parseFloat(round.settings.allowancePercent) || 100;
              const rm = (round.settings.roundingMode || 'nearest') as RoundingMode;
              let total = 0;
              for (const pl of round.players) {
                const grossStr = holeState.grossByPlayer[pl.id];
                const gross = parseInt(grossStr ?? '', 10);
                if (!Number.isFinite(gross)) continue;
                const ch = parseInt(pl.courseHandicap, 10);
                if (!Number.isFinite(ch)) continue;
                try {
                  const playingHcp = computePlayingHandicap(ch, pct, rm);
                  const b = scoreHoleOptionA({
                    courseHandicap: playingHcp,
                    allowancePercent: 1,
                    roundingMode: rm,
                    hole: { par: holeMeta.par, strokeIndex: holeMeta.strokeIndex },
                    gross,
                  });
                  total += b.points;
                } catch {
                  // skip
                }
              }
              return total > 0 ? total : '—';
            })()}
          </Text>
        </View>
      </View>

      <View style={styles.holeBanner}>
        <Text style={styles.holeLabel}>HOLE</Text>
        <Text style={styles.holeNumber}>{currentHole}</Text>
        <Text style={styles.holeMeta}>
          Par {holeMeta.par} • SI {holeMeta.strokeIndex}
        </Text>
        <Text style={styles.holeProgress}>
          {currentHole} of {totalHoles}
        </Text>
      </View>

      <View style={styles.navRow}>
        <Pressable
          style={styles.navBtn}
          onPress={() => goToHole(currentHole - 1)}
        >
          <Text style={styles.navBtnText}>Previous</Text>
        </Pressable>

        <View
          style={[
            styles.statusPill,
            allScoresEnteredForHole() ? styles.statusPillDone : styles.statusPillPending,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              allScoresEnteredForHole() && styles.statusPillTextDone,
            ]}
          >
            {allScoresEnteredForHole() ? 'Hole Complete' : 'Entering Scores'}
          </Text>
        </View>

        <Pressable
          style={styles.navBtn}
          onPress={() => goToHole(currentHole + 1)}
        >
          <Text style={styles.navBtnText}>Next</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Players</Text>
        <Text style={styles.muted}>
          Round setup is locked during live scoring. Use Return to Setup to change players or competition details.
        </Text>

      {round.players.map((player) => {
        const gross = currentHoleState?.grossByPlayer[player.id] || '';
        const complete = gross.trim() !== '';
        const ch = parseInt(player.courseHandicap, 10);
        const pct = parseFloat(round.settings.allowancePercent) || 100;
        const rm = (round.settings.roundingMode || 'nearest') as RoundingMode;
        const ph = Number.isFinite(ch) ? computePlayingHandicap(ch, pct, rm) : null;

        return (
          <View key={player.id} style={styles.playerCard}>
            <View style={styles.playerHeader}>
              <View>
                <Text style={styles.playerName}>{player.name}</Text>
              </View>

              <View
                style={[
                  styles.playerStatus,
                  complete ? styles.playerStatusDone : styles.playerStatusPending,
                ]}
              >
                <Text
                  style={[
                    styles.playerStatusText,
                    complete && styles.playerStatusTextDone,
                  ]}
                >
                  {complete ? 'Entered' : 'Pending'}
                </Text>
              </View>
            </View>

            <View style={styles.breakRow}>
              <BreakItem label="H.I." value={player.handicapIndex?.trim() ? player.handicapIndex : '—'} />
              <BreakItem label="CH" value={player.courseHandicap || '—'} />
              <BreakItem label="PH" value={ph != null ? String(ph) : '—'} />
            </View>

            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreLabel}>Gross</Text>
                <TextInput
                  value={gross}
                  onChangeText={(v) => updateGross(player.id, v)}
                  keyboardType="number-pad"
                  style={styles.scoreInput}
                  placeholder="0"
                />
              </View>

              <View style={styles.scoreInfoBox}>
                <Text style={styles.scoreLabel}>Output</Text>
                <Text style={styles.scoreInfoText}>
                  {getPlayerHoleOutput({
                    grossString: gross,
                    courseHandicap: player.courseHandicap,
                    allowancePercent: round.settings.allowancePercent,
                    roundingMode: rm,
                    par: holeMeta.par,
                    strokeIndex: holeMeta.strokeIndex,
                  })}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hole Navigator</Text>

        <View style={styles.holeGrid}>
          {HOLES.map((h) => {
            const isActiveHole = h === currentHole;
            const holeState = round.holes[h];
            const complete = round.players.every((pl) => {
              const gross = holeState?.grossByPlayer?.[pl.id];
              return gross != null && String(gross).trim() !== '';
            });

            return (
              <Pressable
                key={h}
                onPress={() => {
                  hapticTap();
                  goToHole(h);
                }}
                style={({ pressed }) => [
                  styles.holeGridChip,
                  isActiveHole && styles.holeGridChipActive,
                  complete && styles.holeGridChipComplete,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text
                  style={
                    isActiveHole
                      ? styles.holeGridChipTextActive
                      : complete
                      ? styles.holeGridChipTextComplete
                      : styles.holeGridChipText
                  }
                >
                  {h}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable style={styles.finishBtn} onPress={finishRound}>
        <Text style={styles.finishBtnText}>Finish Round</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '900', color: '#111827', marginBottom: 8 },
  topActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  smallBtnText: { fontWeight: '800', fontSize: 13, color: colors.textPrimary },
  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10, color: '#111827' },
  muted: { color: '#6B7280', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  setupSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  lockedValueWrap: {
    minWidth: 80,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  lockedLabel: { fontSize: 10, fontWeight: '800', color: '#6B7280', marginBottom: 2 },
  lockedValue: { fontSize: 14, fontWeight: '900', color: '#111827' },
  holeLockedRow: { marginBottom: 8 },
  holeLockedLabel: { fontSize: 11, color: '#6B7280', fontWeight: '900' },
  holeLockedValue: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  teamBox: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamLabel: { fontSize: 13, color: '#333', fontWeight: '900' },
  holeCompleteText: { fontSize: 12, fontWeight: '800', color: colors.success, marginTop: 4 },
  teamValue: { fontSize: 24, fontWeight: '900' },
  breakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 6,
  },
  breakItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 4,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  breakLabel: { fontSize: 10, color: '#6B7280', fontWeight: '900' },
  breakValue: { fontSize: 13, fontWeight: '900', color: '#111827', marginTop: 2 },

  holeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  holeGridChip: {
    width: '15.5%',
    minWidth: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  holeGridChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  holeGridChipComplete: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  holeGridChipText: {
    fontWeight: '900',
    color: colors.textPrimary,
  },
  holeGridChipTextActive: {
    fontWeight: '900',
    color: colors.textInverse,
  },
  holeGridChipTextComplete: {
    fontWeight: '900',
    color: colors.success,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F6F7F9',
  },
  loadingText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#374151',
    marginBottom: 16,
  },
  container: {
    padding: 16,
    paddingBottom: 40,
    backgroundColor: '#F6F7F9',
  },
  holeBanner: {
    backgroundColor: '#111827',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  holeLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  holeNumber: {
    color: '#FFF',
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 60,
    marginTop: 4,
  },
  holeMeta: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  holeProgress: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  navBtn: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  navBtnText: {
    fontWeight: '800',
    color: '#111827',
  },
  statusPill: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  statusPillPending: {
    backgroundColor: '#FFF7ED',
  },
  statusPillDone: {
    backgroundColor: '#DCFCE7',
  },
  statusPillText: {
    color: '#9A3412',
    fontWeight: '800',
  },
  statusPillTextDone: {
    color: '#166534',
  },
  playerCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  playerMeta: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
  playerStatus: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  playerStatusPending: {
    backgroundColor: '#F3F4F6',
  },
  playerStatusDone: {
    backgroundColor: '#DCFCE7',
  },
  playerStatusText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 12,
  },
  playerStatusTextDone: {
    color: '#166534',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
  },
  scoreBox: {
    flex: 1.2,
  },
  scoreInfoBox: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '700',
  },
  scoreInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  scoreInfoText: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  jumpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
  },
  jumpPill: {
    minWidth: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  jumpPillActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  jumpPillText: {
    fontWeight: '800',
    color: '#111827',
  },
  jumpPillTextActive: {
    color: '#FFF',
  },
  finishBtn: {
    marginTop: 18,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  finishBtnText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontWeight: '800',
  },
});
