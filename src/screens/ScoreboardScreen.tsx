// src/screens/ScoreboardScreen.tsx
// NetParGolf — Scoreboard result screen. Wired to real round/course data.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { colors as theme } from '../theme/colors';

import { loadCurrentRound, clearCurrentRound, type PersistedRound } from '../storage/roundStorage';
import { loadCourse, getActiveCourseId, getCourseById } from '../storage/courseStorage';
import { getRoundEntryById, saveRoundToHistory, type StoredRound } from '../storage/roundHistoryStorage';
import { mapPersistedRoundToScoreboard } from '../core/roundMapper';
import type { Course } from '../core/course';
import { computeScoreboardTotals, computeMatchSummary } from '../utils/scoreboardHelpers';
import { hapticTap, hapticSuccess, hapticError } from '../utils/feedback';
import { useToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

type Competition =
  | 'individual_stableford'
  | 'fourball_strokeplay'
  | 'fourball_matchplay'
  | 'matchplay';

type StandingItem = {
  id: string;
  name: string;
  subtitle?: string;
  scoreMain: string;
  scoreSub?: string;
  isWinner?: boolean;
  rank: number;
};

type RoundSummary = {
  courseName: string;
  formatLabel: string;
  playersLabel: string;
  dateLabel: string;
  teeLabel?: string;
  markerLabel?: string;
};

type ResultBannerData = {
  title: string;
  subtitle: string;
  supportingText?: string;
};

function getSafeName(name?: string, fallback = 'Player'): string {
  const t = (name ?? '').trim();
  return t.length ? t : fallback;
}

function formatCompetitionLabel(value: Competition | string | undefined): string {
  switch (value) {
    case 'individual_stableford':
      return 'Individual Stableford';
    case 'fourball_strokeplay':
      return 'Four-Ball Stroke Play';
    case 'fourball_matchplay':
      return 'Four-Ball Match Play';
    case 'matchplay':
      return 'Match Play';
    default:
      return 'Round';
  }
}

function ResultBanner({ data }: { data: ResultBannerData }) {
  return (
    <View style={styles.resultBanner}>
      <Text style={styles.resultEyebrow}>RESULT</Text>
      <Text style={styles.resultTitle}>{data.title}</Text>
      <Text style={styles.resultSubtitle}>{data.subtitle}</Text>
      {data.supportingText ? (
        <Text style={styles.resultSupporting}>{data.supportingText}</Text>
      ) : null}
    </View>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryField}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function RoundSummaryCard({ summary }: { summary: RoundSummary }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Round Summary</Text>
      <View style={styles.summaryGrid}>
        <SummaryField label="Course" value={summary.courseName} />
        <SummaryField label="Format" value={summary.formatLabel} />
        <SummaryField label="Players" value={summary.playersLabel} />
        <SummaryField label="Date" value={summary.dateLabel} />
        {summary.teeLabel ? <SummaryField label="Tee" value={summary.teeLabel} /> : null}
        {summary.markerLabel ? <SummaryField label="Marker" value={summary.markerLabel} /> : null}
      </View>
    </View>
  );
}

function StandingRow({ item }: { item: StandingItem }) {
  return (
    <View style={[styles.standingRow, item.isWinner ? styles.standingRowWinner : null]}>
      <View style={styles.rankWrap}>
        <Text style={styles.rankText}>{item.rank}</Text>
      </View>
      <View style={styles.standingMain}>
        <Text style={[styles.standingName, item.isWinner && styles.standingNameWinner]} numberOfLines={1}>
          {item.isWinner ? `🏆 ${item.name}` : item.name}
        </Text>
        {item.subtitle ? (
          <Text style={styles.standingSubtitle} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.scoreWrap}>
        <Text style={styles.scoreMain}>{item.scoreMain}</Text>
        {item.scoreSub ? <Text style={styles.scoreSub}>{item.scoreSub}</Text> : null}
      </View>
    </View>
  );
}

function StandingsCard({ items }: { items: StandingItem[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Standings</Text>
      <View>
        {items.map((item) => (
          <StandingRow key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}

function ScoreboardActions({
  onViewScorecard,
  onStartNewRound,
  onGoHome,
  onArchiveRound,
  viewingHistory,
  archiveBusy,
}: {
  onViewScorecard: () => void;
  onStartNewRound: () => void;
  onGoHome: () => void;
  onArchiveRound?: () => void;
  viewingHistory?: boolean;
  archiveBusy?: boolean;
}) {
  return (
    <View style={styles.actionsWrap}>
      {!viewingHistory && onArchiveRound ? (
        <PrimaryButton
          title="Archive Round"
          onPress={onArchiveRound}
          loading={archiveBusy}
          variant="primary"
          style={styles.archiveButton}
        />
      ) : null}
      <Pressable style={[styles.button, styles.secondaryButton]} onPress={onViewScorecard}>
        <Text style={styles.secondaryButtonText}>View Scorecard</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondaryButton]} onPress={onStartNewRound}>
        <Text style={styles.secondaryButtonText}>Start New Round</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondaryButton]} onPress={onGoHome}>
        <Text style={styles.secondaryButtonText}>Back to Home</Text>
      </Pressable>
    </View>
  );
}

export default function ScoreboardScreen({ navigation, route }: Props) {
  const toast = useToast();
  const roundId = route.params?.roundId;
  const viewingHistory = !!roundId;

  const [activeRound, setActiveRound] = useState<PersistedRound | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [historyEntry, setHistoryEntry] = useState<StoredRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (roundId) {
        const entry = await getRoundEntryById(roundId);
        setHistoryEntry(entry);
        setActiveRound(entry?.round ?? null);
        let loadedCourse: Course | null = null;
        if (entry?.courseId) {
          loadedCourse = await getCourseById(entry.courseId);
        }
        if (!loadedCourse?.holes?.length) {
          loadedCourse = await loadCourse();
        }
        setCourse(loadedCourse);
      } else {
        setHistoryEntry(null);
        const [loadedRound, loadedCourse] = await Promise.all([
          loadCurrentRound(),
          loadCourse(),
        ]);
        setActiveRound(loadedRound);
        setCourse(loadedCourse);
      }
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mappedRound = useMemo(() => {
    if (!activeRound) return null;
    return mapPersistedRoundToScoreboard(activeRound);
  }, [activeRound]);

  const totalsResult = useMemo(() => {
    if (!activeRound || !course?.holes?.length) {
      return null;
    }
    return computeScoreboardTotals({ round: activeRound, course });
  }, [activeRound, course]);

  const summary = totalsResult
    ? { players: totalsResult.players, teamTotal: totalsResult.teamTotal }
    : null;
  const totalsByPlayerId = totalsResult?.totalsByPlayerId ?? {};
  const teamTotal = totalsResult?.teamTotal ?? 0;
  const playerMatchWins = totalsResult?.winsByPlayerId ?? {};

  const matchSummary = useMemo(() => {
    if (
      !activeRound ||
      (activeRound.competition !== 'matchplay' &&
        activeRound.competition !== 'fourball_matchplay')
    )
      return null;
    return computeMatchSummary(activeRound);
  }, [activeRound]);

  const isMatchplay =
    mappedRound?.competition === 'matchplay' ||
    mappedRound?.competition === 'fourball_matchplay';
  const isFourballStroke = mappedRound?.competition === 'fourball_strokeplay';
  const isStableford = mappedRound?.competition === 'individual_stableford';

  const bannerData = useMemo<ResultBannerData | null>(() => {
    if (!mappedRound || !summary) return null;

    if (isMatchplay && matchSummary) {
      if (matchSummary.holesCompleted === 0) {
        return {
          title: 'No holes recorded yet',
          subtitle: '',
          supportingText: undefined,
        };
      }

      if (matchSummary.lead === 0) {
        const text =
          matchSummary.holesCompleted === 18 || activeRound?.isComplete
            ? 'All Square'
            : `All Square through ${matchSummary.holesCompleted}`;
        return {
          title: text,
          subtitle: matchSummary.holesCompleted === 18 || activeRound?.isComplete ? 'Halved' : '',
          supportingText: undefined,
        };
      }

      const leaderName = getSafeName(matchSummary.leaderName);
      const hasWon =
        matchSummary.lead > matchSummary.holesRemaining ||
        (matchSummary.holesCompleted === 18 && activeRound?.isComplete);
      const verb = hasWon ? 'wins' : 'leads';

      let subtitle: string;
      if (matchSummary.lead > matchSummary.holesRemaining) {
        subtitle = `${matchSummary.lead} & ${matchSummary.holesRemaining}`;
      } else if (matchSummary.holesCompleted === 18 || activeRound?.isComplete) {
        subtitle = `${matchSummary.lead} Up`;
      } else {
        subtitle = `${matchSummary.lead} Up through ${matchSummary.holesCompleted}`;
      }

      return {
        title: hasWon ? `🏆 ${leaderName} wins` : `${leaderName} leads`,
        subtitle,
        supportingText: undefined,
      };
    }

    if (isFourballStroke) {
      return {
        title: 'Team total',
        subtitle: `${teamTotal} points`,
        supportingText: 'Best ball totals across 18 holes',
      };
    }

    if (isStableford && summary.players.length) {
      const ranked = [...summary.players].sort(
        (a, b) => (totalsByPlayerId[b.id] ?? 0) - (totalsByPlayerId[a.id] ?? 0)
      );
      const top = ranked[0];
      const topPts = totalsByPlayerId[top.id] ?? 0;
      const secondPts = totalsByPlayerId[ranked[1]?.id] ?? 0;
      const margin = topPts - secondPts;
      const leaders = ranked.filter((p) => (totalsByPlayerId[p.id] ?? 0) === topPts);

      if (leaders.length > 1) {
        return {
          title: 'All Square',
          subtitle: `${topPts} pts`,
          supportingText: `${leaders.length} players tied`,
        };
      }

      const marginStr = margin > 0 ? ` • ${margin} ahead` : '';
      return {
        title: `🏆 ${getSafeName(top.name)} wins`,
        subtitle: `${topPts} points${marginStr}`,
        supportingText: 'Based on total Stableford points',
      };
    }

    return null;
  }, [
    mappedRound,
    summary,
    isMatchplay,
    isFourballStroke,
    isStableford,
    teamTotal,
    totalsByPlayerId,
    matchSummary,
    activeRound?.isComplete,
  ]);

  const roundSummary = useMemo<RoundSummary | null>(() => {
    if (!mappedRound) return null;

    const courseName =
      viewingHistory ? historyEntry?.courseName ?? course?.name ?? '—' : course?.name ?? '—';
    const dateValue =
      activeRound?.completedAt ??
      activeRound?.updatedAt ??
      activeRound?.createdAt ??
      historyEntry?.savedAt ??
      '';

    const dateLabel = dateValue
      ? new Date(dateValue).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

    return {
      courseName,
      formatLabel: formatCompetitionLabel(mappedRound.competition),
      playersLabel: String(mappedRound.players.length),
      dateLabel,
    };
  }, [mappedRound, course, historyEntry, activeRound, viewingHistory]);

  const standings = useMemo<StandingItem[]>(() => {
    if (!summary) return [];

    if (isMatchplay && matchSummary) {
      const [p1, p2] = summary.players;
      const p1Wins = playerMatchWins[p1.id] ?? 0;
      const p2Wins = playerMatchWins[p2.id] ?? 0;
      const isComplete = matchSummary.holesCompleted === 18 || activeRound?.isComplete;
      const isTied = matchSummary.lead === 0;

      let resultStr = '—';
      const { lead, holesRemaining, holesCompleted } = matchSummary;
      if (isTied) {
        resultStr = isComplete ? 'Halved' : 'All Square';
      } else if (lead > holesRemaining && holesCompleted > 0) {
        resultStr = `${lead} & ${holesRemaining}`;
      } else if (holesCompleted === 18 || activeRound?.isComplete) {
        resultStr = `${lead} Up`;
      } else if (holesCompleted > 0) {
        resultStr = `${lead} Up`;
      }

      if (isTied) {
        return [
          {
            id: p1.id,
            rank: 1,
            name: getSafeName(p1.name),
            subtitle: undefined,
            scoreMain: resultStr,
            scoreSub: undefined,
            isWinner: false,
          },
          {
            id: p2.id,
            rank: 2,
            name: getSafeName(p2.name),
            subtitle: undefined,
            scoreMain: resultStr,
            scoreSub: undefined,
            isWinner: false,
          },
        ];
      }

      const leader =
        summary.players.find((p) => p.id === matchSummary.leaderPlayerId) ?? p1;
      const follower = leader.id === p1.id ? p2 : p1;
      return [
        {
          id: leader.id,
          rank: 1,
          name: getSafeName(leader.name),
          subtitle: 'Match winner',
          scoreMain: resultStr,
          scoreSub: 'won',
          isWinner: true,
        },
        {
          id: follower.id,
          rank: 2,
          name: getSafeName(follower.name),
          subtitle: 'Runner-up',
          scoreMain: '—',
          scoreSub: undefined,
          isWinner: false,
        },
      ];
    }

    if (isFourballStroke) {
      return [
        {
          id: 'team',
          rank: 1,
          name: 'Team score',
          subtitle: 'Best ball (4 players)',
          scoreMain: String(teamTotal),
          scoreSub: 'pts',
          isWinner: false,
        },
      ];
    }

    const ranked = [...summary.players].sort(
      (a, b) => (totalsByPlayerId[b.id] ?? 0) - (totalsByPlayerId[a.id] ?? 0)
    );
    const topPts = totalsByPlayerId[ranked[0]?.id] ?? 0;
    const leaders = new Set(
      ranked.filter((p) => (totalsByPlayerId[p.id] ?? 0) === topPts).map((p) => p.id)
    );

    return ranked.map((p, i) => {
      const pts = totalsByPlayerId[p.id] ?? 0;
      const gross = summary.players.find((x) => x.id === p.id)?.gross ?? 0;
      return {
        id: p.id,
        rank: i + 1,
        name: getSafeName(p.name),
        subtitle: gross > 0 ? `Gross ${gross}` : undefined,
        scoreMain: String(pts),
        scoreSub: 'pts',
        isWinner: leaders.has(p.id),
      };
    });
  }, [
    summary,
    isMatchplay,
    isFourballStroke,
    totalsByPlayerId,
    teamTotal,
    playerMatchWins,
    matchSummary,
    activeRound?.isComplete,
  ]);

  const onArchive = async () => {
    if (!activeRound) return;
    hapticTap();
    setArchiveBusy(true);
    try {
      const courseId = await getActiveCourseId();
      const courseName = course?.name ?? 'No course selected';
      const savedId = await saveRoundToHistory(
        activeRound,
        courseId,
        courseName,
        teamTotal
      );
      await clearCurrentRound();
      hapticSuccess();
      toast.show('Archived to History', 'success');
      navigation.replace('Scoreboard', { roundId: savedId });
    } catch {
      hapticError();
      toast.show('Could not archive. Try again.', 'error');
    } finally {
      setArchiveBusy(false);
    }
  };

  const onViewScorecard = () => {
    navigation.navigate('Scorecard', viewingHistory && roundId ? { roundId } : undefined);
  };

  const onStartNewRound = () => {
    navigation.navigate('RoundSetup');
  };

  const onGoHome = () => {
    navigation.navigate('Home');
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.loading}>Loading…</Text>
        </ScrollView>
      </View>
    );
  }

  if (!activeRound) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No saved round</Text>
            <Text style={styles.emptyText}>
              Start scoring in Live Scoring and it will autosave.
            </Text>
          </View>
          <View style={styles.actionsWrap}>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={onGoHome}>
              <Text style={styles.secondaryButtonText}>Back to Home</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  const overline = activeRound.isComplete ? 'Round Complete' : 'Round in progress';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.overline}>{overline}</Text>

        {bannerData ? (
          <ResultBanner data={bannerData} />
        ) : (
          <View style={styles.resultBanner}>
            <Text style={styles.resultEyebrow}>RESULT</Text>
            <Text style={styles.resultTitle}>No scores yet</Text>
          </View>
        )}

        {roundSummary && <RoundSummaryCard summary={roundSummary} />}

        {standings.length > 0 ? (
          <StandingsCard items={standings} />
        ) : mappedRound && (!course?.holes?.length) ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Standings</Text>
            <Text style={styles.warnText}>
              Course Par/SI not available. Set up a course and refresh.
            </Text>
          </View>
        ) : mappedRound ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Standings</Text>
            <Text style={styles.muted}>No totals yet.</Text>
          </View>
        ) : null}

        <ScoreboardActions
          onArchiveRound={onArchive}
          onViewScorecard={onViewScorecard}
          onStartNewRound={onStartNewRound}
          onGoHome={onGoHome}
          viewingHistory={viewingHistory}
          archiveBusy={archiveBusy}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  loading: {
    color: theme.textSecondary,
    fontSize: 14,
  },
  emptyCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  resultBanner: {
    minHeight: 112,
    backgroundColor: theme.primarySoft,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.primary,
    padding: 16,
    marginBottom: 16,
  },
  resultEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: theme.primary,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.textPrimary,
    lineHeight: 30,
  },
  resultSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    lineHeight: 20,
    marginTop: 6,
  },
  resultSupporting: {
    fontSize: 12.5,
    color: theme.textSecondary,
    lineHeight: 18,
    marginTop: 8,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 12,
  },
  warnText: {
    color: theme.warning,
    fontWeight: '700',
    fontSize: 14,
  },
  muted: {
    color: theme.textSecondary,
    fontSize: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryField: {
    width: '48%',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
    lineHeight: 18,
  },
  standingRow: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.chip,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  standingRowWinner: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
    borderWidth: 2,
  },
  standingNameWinner: {
    color: theme.primary,
  },
  rankWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rankText: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  standingMain: {
    flex: 1,
    paddingRight: 8,
  },
  standingName: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.textPrimary,
    lineHeight: 20,
  },
  standingSubtitle: {
    fontSize: 12.5,
    color: theme.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  scoreWrap: {
    minWidth: 76,
    alignItems: 'flex-end',
  },
  scoreMain: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.textPrimary,
    lineHeight: 26,
  },
  scoreSub: {
    fontSize: 11.5,
    color: theme.textSecondary,
    marginTop: 2,
  },
  actionsWrap: {
    marginTop: 4,
  },
  archiveButton: {
    marginBottom: 12,
  },
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  secondaryButton: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonText: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
