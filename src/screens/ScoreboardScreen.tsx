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
import { computeFourballBetterballMatchSummary } from '../core/scoring/fourballBetterballMatchplay';
import {
  getFourballMatchSummaryLines,
  getFourballSideRosterLines,
  getSinglesMatchSummaryLines,
  getSinglesStandingsScoreMain,
} from '../core/scoring/matchplayDisplay';
import { buildBetterballStablefordLeaderText } from '../core/scoring/stablefordDisplay';
import { getPlayerStatus } from '../core/scoring/stablefordState';
import { hapticTap, hapticSuccess, hapticError } from '../utils/feedback';
import { useToast } from '../components/Toast';
import PrimaryButton from '../components/PrimaryButton';
import type { RoundCompetition } from '../types/competition';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;

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
  subtitle?: string;
  supportingText?: string;
};

function getSafeName(name?: string, fallback = 'Player'): string {
  const t = (name ?? '').trim();
  return t.length ? t : fallback;
}

function matchplayBannerSubtitle(
  ms: { holesCompleted: number; holesRemaining: number; statusText: string },
  isComplete: boolean
): string {
  if (ms.holesCompleted === 0) return '';
  if (ms.statusText === 'All Square' && (ms.holesCompleted >= 18 || isComplete)) {
    return 'Halved · 18 holes';
  }
  if (ms.statusText.includes('won')) {
    return `Match decided · ${ms.holesCompleted} holes scored`;
  }
  return `${ms.holesCompleted} holes scored · ${ms.holesRemaining} remaining`;
}

function formatCompetitionLabel(value: RoundCompetition | string | undefined): string {
  switch (value) {
    case 'individual_stableford':
      return 'Individual Stableford';
    case 'betterball_stableford':
      return 'Betterball Stableford';
    case 'singles_matchplay':
      return 'Singles Matchplay';
    case 'fourball_betterball_matchplay':
      return 'Fourball Betterball Matchplay';
    default:
      return 'Round';
  }
}

function ResultBanner({ data }: { data: ResultBannerData }) {
  return (
    <View style={styles.resultBanner}>
      <Text style={styles.resultEyebrow}>RESULT</Text>
      <Text style={styles.resultTitle}>{data.title}</Text>
      {data.subtitle ? (
        <Text style={styles.resultSubtitle}>{data.subtitle}</Text>
      ) : null}
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

function MatchplayStatusCard(props: {
  formatLabel: string;
  singles?: { lines: ReturnType<typeof getSinglesMatchSummaryLines>; vsLine: string };
  fourball?: { lines: ReturnType<typeof getFourballMatchSummaryLines> };
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Match status</Text>
      <SummaryField label="Format" value={props.formatLabel} />
      {props.singles ? (
        <>
          <SummaryField label="Matchup" value={props.singles.vsLine} />
          <Text style={styles.matchStatusPrimary}>{props.singles.lines.statusLine}</Text>
          <Text style={styles.matchStatusSecondary}>{props.singles.lines.holesWonSubline}</Text>
        </>
      ) : null}
      {props.fourball ? (
        <>
          <Text style={styles.matchRosterMuted}>{props.fourball.lines.sideALine}</Text>
          <Text style={styles.matchRosterMuted}>{props.fourball.lines.sideBLine}</Text>
          <Text style={styles.matchStatusPrimaryFourball}>{props.fourball.lines.statusLine}</Text>
          <Text style={styles.matchStatusSecondary}>{props.fourball.lines.holesWonSubline}</Text>
        </>
      ) : null}
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
  const betterballSideTotals = totalsResult?.betterballSideTotals;

  const matchSummary = useMemo(() => {
    if (
      !activeRound ||
      activeRound.competition !== 'singles_matchplay'
    )
      return null;
    return computeMatchSummary(activeRound, course);
  }, [activeRound, course]);

  const fourballMatchSummary = useMemo(() => {
    if (!activeRound || activeRound.competition !== 'fourball_betterball_matchplay') {
      return null;
    }
    return computeFourballBetterballMatchSummary(activeRound, course);
  }, [activeRound, course]);

  const singlesMatchStatusLines = useMemo(() => {
    if (!activeRound || activeRound.competition !== 'singles_matchplay' || !matchSummary) {
      return null;
    }
    const [p1, p2] = activeRound.players;
    if (!p1 || !p2) return null;
    return getSinglesMatchSummaryLines({
      p1,
      p2,
      winsByPlayerId: matchSummary.winsByPlayerId,
      holesCompleted: matchSummary.holesCompleted,
      holesRemaining: matchSummary.holesRemaining,
      statusText: matchSummary.statusText,
    });
  }, [activeRound, matchSummary]);

  const fourballMatchStatusLines = useMemo(() => {
    if (
      !activeRound ||
      activeRound.competition !== 'fourball_betterball_matchplay' ||
      !fourballMatchSummary
    ) {
      return null;
    }
    if (activeRound.players.length !== 4) return null;
    return getFourballMatchSummaryLines(activeRound.players, fourballMatchSummary);
  }, [activeRound, fourballMatchSummary]);

  const isSinglesMatchplay = mappedRound?.competition === 'singles_matchplay';
  const isBetterballStableford = mappedRound?.competition === 'betterball_stableford';
  const isFourballBetterballMatchplay =
    mappedRound?.competition === 'fourball_betterball_matchplay';
  const isStableford = mappedRound?.competition === 'individual_stableford';

  const bannerData = useMemo<ResultBannerData | null>(() => {
    if (!mappedRound) return null;

    if (isSinglesMatchplay && matchSummary && activeRound) {
      const [p1, p2] = activeRound.players;
      if (!p1 || !p2) return null;
      if (matchSummary.holesCompleted === 0) {
        return {
          title: 'No holes scored yet',
          subtitle: `${getSafeName(p1.name)} vs ${getSafeName(p2.name)}`,
          supportingText: 'Singles Matchplay · lowest net wins each hole',
        };
      }
      return {
        title: matchSummary.statusText,
        subtitle: matchplayBannerSubtitle(matchSummary, !!activeRound.isComplete),
        supportingText: undefined,
      };
    }

    if (
      isFourballBetterballMatchplay &&
      fourballMatchSummary &&
      activeRound?.players.length === 4
    ) {
      const roster = getFourballSideRosterLines(activeRound.players);
      if (fourballMatchSummary.holesCompleted === 0) {
        return {
          title: 'No holes scored yet',
          subtitle: `${roster.sideALine} · ${roster.sideBLine}`,
          supportingText: 'Fourball Betterball Matchplay · best team net per hole',
        };
      }
      return {
        title: fourballMatchSummary.statusText,
        subtitle: matchplayBannerSubtitle(fourballMatchSummary, !!activeRound.isComplete),
        supportingText: `${roster.sideALine} · ${roster.sideBLine}`,
      };
    }

    if (isBetterballStableford && activeRound?.players.length === 4) {
      const nrNames = activeRound.players
        .filter((p) => getPlayerStatus(activeRound, p.id) === 'non_return')
        .map((p) => getSafeName(p.name));
      if (!betterballSideTotals) {
        const r = getFourballSideRosterLines(activeRound.players);
        return {
          title: 'Betterball Stableford',
          subtitle: 'Course Par and Stroke Index required for side totals',
          supportingText: `${r.sideALine} · ${r.sideBLine}${nrNames.length ? ` · NR: ${nrNames.join(', ')}` : ''}`,
        };
      }
      const bb = buildBetterballStablefordLeaderText({
        sideA: betterballSideTotals.sideA,
        sideB: betterballSideTotals.sideB,
        players: activeRound.players,
        roundComplete: !!activeRound.isComplete,
      });
      return {
        title: bb.title,
        subtitle: bb.subtitle,
        supportingText: `${bb.supportingText ?? ''}${nrNames.length ? `${bb.supportingText ? ' · ' : ''}NR: ${nrNames.join(', ')}` : ''}`,
      };
    }

    if (isStableford && activeRound) {
      const currentHole = activeRound.currentHole;
      const players = activeRound.players;
      return {
        title: `Hole ${currentHole} of 18`,
        subtitle:
          players.length > 1 ? `${players.length} players` : undefined,
        supportingText: undefined,
      };
    }

    if (!summary) return null;

    return null;
  }, [
    mappedRound,
    summary,
    isSinglesMatchplay,
    isBetterballStableford,
    isFourballBetterballMatchplay,
    isStableford,
    teamTotal,
    totalsByPlayerId,
    matchSummary,
    fourballMatchSummary,
    activeRound,
    activeRound?.isComplete,
    activeRound?.currentHole,
    betterballSideTotals,
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
      teeLabel: activeRound?.teeName?.trim() || undefined,
    };
  }, [mappedRound, course, historyEntry, activeRound, viewingHistory]);

  const standings = useMemo<StandingItem[]>(() => {
    if (isSinglesMatchplay && matchSummary && activeRound) {
      const [p1, p2] = activeRound.players;
      const p1Wins = playerMatchWins[p1.id] ?? 0;
      const p2Wins = playerMatchWins[p2.id] ?? 0;
      const margin = p1Wins - p2Wins;
      const isComplete = matchSummary.holesCompleted === 18 || activeRound?.isComplete;
      const isTied = matchSummary.lead === 0;
      const holesWonSub = `Holes won · ${p1Wins}–${p2Wins}`;

      if (isTied) {
        const main = isComplete ? 'Halved' : matchSummary.statusText;
        return [
          {
            id: p1.id,
            rank: 1,
            name: getSafeName(p1.name),
            subtitle: holesWonSub,
            scoreMain: main,
            scoreSub: undefined,
            isWinner: false,
          },
          {
            id: p2.id,
            rank: 2,
            name: getSafeName(p2.name),
            subtitle: holesWonSub,
            scoreMain: main,
            scoreSub: undefined,
            isWinner: false,
          },
        ];
      }

      if (!isComplete) {
        const p1Row: StandingItem = {
          id: p1.id,
          rank: margin > 0 ? 1 : 2,
          name: getSafeName(p1.name),
          subtitle: holesWonSub,
          scoreMain: getSinglesStandingsScoreMain({
            playerSlot: 1,
            matchSummary,
            p1,
            p2,
          }),
          scoreSub: undefined,
          isWinner: false,
        };
        const p2Row: StandingItem = {
          id: p2.id,
          rank: margin > 0 ? 2 : 1,
          name: getSafeName(p2.name),
          subtitle: holesWonSub,
          scoreMain: getSinglesStandingsScoreMain({
            playerSlot: 2,
            matchSummary,
            p1,
            p2,
          }),
          scoreSub: undefined,
          isWinner: false,
        };
        return [p1Row, p2Row].sort((a, b) => a.rank - b.rank);
      }

      const leader =
        activeRound.players.find((p) => p.id === matchSummary.leaderPlayerId) ?? p1;
      const follower = leader.id === p1.id ? p2 : p1;
      return [
        {
          id: leader.id,
          rank: 1,
          name: getSafeName(leader.name),
          subtitle: holesWonSub,
          scoreMain: matchSummary.statusText,
          scoreSub: undefined,
          isWinner: true,
        },
        {
          id: follower.id,
          rank: 2,
          name: getSafeName(follower.name),
          subtitle: undefined,
          scoreMain: '—',
          scoreSub: undefined,
          isWinner: false,
        },
      ];
    }

    if (isFourballBetterballMatchplay && fourballMatchSummary && activeRound) {
      const roster =
        activeRound.players.length === 4
          ? getFourballSideRosterLines(activeRound.players)
          : null;
      const isComplete =
        fourballMatchSummary.holesCompleted === 18 || activeRound?.isComplete;
      const isTied = fourballMatchSummary.margin === 0;
      const status = fourballMatchSummary.statusText;

      const sideASub = `${fourballMatchSummary.sideAWins} holes won`;
      const sideBSub = `${fourballMatchSummary.sideBWins} holes won`;

      if (isTied) {
        const main = isComplete ? 'Halved' : status;
        return [
          {
            id: 'side-a',
            rank: 1,
            name: roster?.sideALine ?? 'Side A',
            subtitle: sideASub,
            scoreMain: main,
            scoreSub: undefined,
            isWinner: false,
          },
          {
            id: 'side-b',
            rank: 2,
            name: roster?.sideBLine ?? 'Side B',
            subtitle: sideBSub,
            scoreMain: main,
            scoreSub: undefined,
            isWinner: false,
          },
        ];
      }

      if (!isComplete) {
        const margin = fourballMatchSummary.margin;
        const aheadMain = status;
        const behindMain = `${Math.abs(margin)} Down`;
        return [
          {
            id: 'side-a',
            rank: margin > 0 ? 1 : 2,
            name: roster?.sideALine ?? 'Side A',
            subtitle: sideASub,
            scoreMain: margin > 0 ? aheadMain : behindMain,
            scoreSub: undefined,
            isWinner: false,
          },
          {
            id: 'side-b',
            rank: margin > 0 ? 2 : 1,
            name: roster?.sideBLine ?? 'Side B',
            subtitle: sideBSub,
            scoreMain: margin < 0 ? aheadMain : behindMain,
            scoreSub: undefined,
            isWinner: false,
          },
        ].sort((a, b) => a.rank - b.rank);
      }

      return [
        {
          id: 'side-a',
          rank: fourballMatchSummary.margin > 0 ? 1 : 2,
          name: roster?.sideALine ?? 'Side A',
          subtitle: sideASub,
          scoreMain: fourballMatchSummary.margin > 0 ? status : '—',
          scoreSub: undefined,
          isWinner: fourballMatchSummary.margin > 0,
        },
        {
          id: 'side-b',
          rank: fourballMatchSummary.margin < 0 ? 1 : 2,
          name: roster?.sideBLine ?? 'Side B',
          subtitle: sideBSub,
          scoreMain: fourballMatchSummary.margin < 0 ? status : '—',
          scoreSub: undefined,
          isWinner: fourballMatchSummary.margin < 0,
        },
      ].sort((a, b) => a.rank - b.rank);
    }

    if (isBetterballStableford && activeRound?.players.length === 4) {
      const roster = getFourballSideRosterLines(activeRound.players);
      if (!betterballSideTotals) {
        return [
          {
            id: 'side-a',
            rank: 1,
            name: roster.sideALine,
            subtitle: 'Stableford side total',
            scoreMain: '—',
            scoreSub: undefined,
            isWinner: false,
          },
          {
            id: 'side-b',
            rank: 2,
            name: roster.sideBLine,
            subtitle: 'Stableford side total',
            scoreMain: '—',
            scoreSub: undefined,
            isWinner: false,
          },
        ];
      }
      const { sideA, sideB } = betterballSideTotals;
      const diff = sideA - sideB;
      const complete = !!activeRound.isComplete;
      return [
        {
          id: 'side-a',
          rank: diff >= 0 ? 1 : 2,
          name: roster.sideALine,
          subtitle: 'Side total · Stableford points',
          scoreMain: String(sideA),
          scoreSub: 'pts',
          isWinner: complete && diff > 0,
        },
        {
          id: 'side-b',
          rank: diff <= 0 ? 1 : 2,
          name: roster.sideBLine,
          subtitle: 'Side total · Stableford points',
          scoreMain: String(sideB),
          scoreSub: 'pts',
          isWinner: complete && diff < 0,
        },
      ].sort((a, b) => a.rank - b.rank);
    }

    if (isStableford && activeRound) {
      const rankedPlayers = [...activeRound.players]
        .map((p) => ({
          id: p.id,
          name: p.name,
          pts: totalsByPlayerId[p.id] ?? 0,
          isNR: getPlayerStatus(activeRound, p.id) === 'non_return',
        }))
        .sort(
          (a, b) =>
            Number(a.isNR) - Number(b.isNR) ||
            b.pts - a.pts ||
            getSafeName(a.name).localeCompare(getSafeName(b.name), undefined, {
              sensitivity: 'base',
            })
        );
      const topPts = rankedPlayers[0]?.pts ?? 0;
      const leaderIds = new Set(
        rankedPlayers.filter((p) => p.pts === topPts && topPts > 0).map((p) => p.id)
      );
      const complete = !!activeRound.isComplete;
      const soleLeader = leaderIds.size === 1;
      return rankedPlayers.map((p, i) => ({
        id: p.id,
        rank: i + 1,
        name: `${getSafeName(p.name)}${p.isNR ? ' (NR)' : ''}`,
        subtitle: p.isNR ? 'Non Return' : `Total · ${p.pts} Stableford pts`,
        scoreMain: p.isNR ? 'NR' : String(p.pts),
        scoreSub: p.isNR ? undefined : 'pts',
        isWinner: complete && soleLeader && leaderIds.has(p.id),
      }));
    }

    if (!summary) return [];

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
    isSinglesMatchplay,
    isBetterballStableford,
    isFourballBetterballMatchplay,
    totalsByPlayerId,
    teamTotal,
    playerMatchWins,
    matchSummary,
    fourballMatchSummary,
    activeRound,
    activeRound?.isComplete,
    betterballSideTotals,
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
    navigation.navigate('CompetitionSelect');
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

        {isSinglesMatchplay && singlesMatchStatusLines && activeRound?.players[0] && activeRound.players[1] ? (
          <MatchplayStatusCard
            formatLabel={formatCompetitionLabel('singles_matchplay')}
            singles={{
              lines: singlesMatchStatusLines,
              vsLine: `${getSafeName(activeRound.players[0].name)} vs ${getSafeName(
                activeRound.players[1].name
              )}`,
            }}
          />
        ) : null}
        {isFourballBetterballMatchplay && fourballMatchStatusLines ? (
          <MatchplayStatusCard
            formatLabel={formatCompetitionLabel('fourball_betterball_matchplay')}
            fourball={{ lines: fourballMatchStatusLines }}
          />
        ) : null}

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
  matchStatusPrimary: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.textPrimary,
    lineHeight: 26,
    marginTop: 12,
  },
  matchStatusPrimaryFourball: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.textPrimary,
    lineHeight: 26,
    marginTop: 10,
  },
  matchStatusSecondary: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    lineHeight: 18,
    marginTop: 6,
  },
  matchRosterMuted: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    lineHeight: 18,
    marginTop: 4,
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
