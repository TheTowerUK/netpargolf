import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import { filterExportableHandicapPlayers } from '../core/competitionHandicapUtils';
import { loadCurrentRound, type PersistedRound } from '../storage/roundStorage';
import { listCourses } from '../storage/courseStorage';
import { listRounds } from '../storage/roundHistoryStorage';
import {
  loadCompetitionCheckerDraft,
  type CompetitionCheckerDraft,
} from '../storage/competitionHandicapCheckerStorage';
import { getCompetitionLabel } from '../utils/competitionLabels';
import { hapticTap } from '../utils/feedback';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type HomeTileConfig = {
  title: string;
  subtitle?: string;
  onPress: () => void;
  primary?: boolean;
};

function draftPlayersEntered(draft: CompetitionCheckerDraft): number {
  const teamA = Array.isArray(draft.teamA) ? draft.teamA : [];
  const teamB = Array.isArray(draft.teamB) ? draft.teamB : [];
  const players = [...teamA, ...teamB].map((p) => {
    const hiText = String(p?.handicapIndexText ?? '').replace(',', '.').trim();
    const hi = hiText ? Number(hiText) : null;
    return {
      name: typeof p?.name === 'string' ? p.name : '',
      handicapIndex: hi != null && Number.isFinite(hi) ? hi : null,
      courseHandicap: null,
      playingHandicap: null,
    };
  });
  return filterExportableHandicapPlayers(players).length;
}

function hasCheckerDraftContent(draft: CompetitionCheckerDraft): boolean {
  if (draft.courseName.trim() || draft.teeName.trim() || draft.updatedAt) return true;
  return draftPlayersEntered(draft) > 0;
}

function buildCheckerDraftSubtitle(draft: CompetitionCheckerDraft | null): string | undefined {
  if (!draft || !hasCheckerDraftContent(draft)) return undefined;
  if (draft.updatedAt) {
    try {
      const time = new Date(draft.updatedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Draft saved • Last updated ${time}`;
    } catch {
      // fall through
    }
  }
  const count = draftPlayersEntered(draft);
  if (count > 0) return `Draft saved • ${count} players entered`;
  return 'Draft saved';
}

function buildLiveScoringSubtitle(round: PersistedRound | null): string | undefined {
  if (!round || typeof round.currentHole !== 'number') return undefined;
  return `Active round • ${getCompetitionLabel(round.competition)} • Hole ${round.currentHole} of 18`;
}

function HomeTile({ tile }: { tile: HomeTileConfig }) {
  return (
    <Pressable
      onPress={() => {
        hapticTap();
        tile.onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        tile.primary && styles.tilePrimary,
        pressed && styles.tilePressed,
      ]}
    >
      <Text style={[styles.tileTitle, tile.primary && styles.tileTitlePrimary]}>{tile.title}</Text>
      {tile.subtitle ? (
        <Text style={[styles.tileSubtitle, tile.primary && styles.tileSubtitlePrimary]}>
          {tile.subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen({ navigation }: Props) {
  const [activeRound, setActiveRound] = useState<PersistedRound | null>(null);
  const [savedCourseCount, setSavedCourseCount] = useState(0);
  const [roundHistoryCount, setRoundHistoryCount] = useState(0);
  const [checkerDraft, setCheckerDraft] = useState<CompetitionCheckerDraft | null>(null);

  const refreshHomeMeta = useCallback(() => {
    void Promise.all([
      loadCurrentRound(),
      listCourses(),
      listRounds(),
      loadCompetitionCheckerDraft(),
    ])
      .then(([round, courses, rounds, draft]) => {
        setActiveRound(round);
        setSavedCourseCount(Array.isArray(courses) ? courses.length : 0);
        setRoundHistoryCount(Array.isArray(rounds) ? rounds.length : 0);
        setCheckerDraft(draft);
      })
      .catch(() => {
        setActiveRound(null);
        setSavedCourseCount(0);
        setRoundHistoryCount(0);
        setCheckerDraft(null);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshHomeMeta();
    }, [refreshHomeMeta])
  );

  const tiles = useMemo<HomeTileConfig[]>(
    () => [
      {
        title: 'Live Scoring',
        subtitle: buildLiveScoringSubtitle(activeRound),
        onPress: () => navigation.navigate('CompetitionSelect'),
        primary: true,
      },
      {
        title: 'Competition Handicap Checker',
        subtitle: buildCheckerDraftSubtitle(checkerDraft),
        onPress: () => navigation.navigate('CompetitionHandicapChecker'),
      },
      {
        title: 'Course Setup',
        subtitle:
          savedCourseCount > 0
            ? `${savedCourseCount} saved course${savedCourseCount === 1 ? '' : 's'}`
            : undefined,
        onPress: () => navigation.navigate('CourseSetup'),
      },
      {
        title: 'Round History',
        subtitle:
          roundHistoryCount > 0
            ? `${roundHistoryCount} round${roundHistoryCount === 1 ? '' : 's'} recorded`
            : undefined,
        onPress: () => navigation.navigate('RoundHistory'),
      },
      {
        title: 'Help & Practice',
        onPress: () => navigation.navigate('HelpPractice'),
      },
      {
        title: 'About',
        onPress: () => navigation.navigate('About'),
      },
    ],
    [activeRound, checkerDraft, navigation, roundHistoryCount, savedCourseCount]
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>NetParGolf</Text>
        <Text style={styles.heroTagline}>Score • Setup • Compete</Text>
        <Text style={styles.heroSub}>
          Track your rounds, manage course data, and create competition handicap sheets — all from
          one app.
        </Text>
      </View>

      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <HomeTile key={tile.title} tile={tile} />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 28,
    backgroundColor: colors.background,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: colors.textInverse,
  },
  heroTagline: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textInverse,
    letterSpacing: 0.2,
  },
  heroSub: {
    marginTop: 10,
    fontSize: 13,
    color: colors.textInverse,
    opacity: 0.92,
    lineHeight: 19,
  },
  tiles: {
    gap: 10,
  },
  tile: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tilePrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tilePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  tileTitlePrimary: {
    color: colors.textInverse,
  },
  tileSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tileSubtitlePrimary: {
    color: colors.textInverse,
    opacity: 0.9,
  },
});
