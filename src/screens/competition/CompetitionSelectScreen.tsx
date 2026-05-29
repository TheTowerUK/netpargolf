import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigations/types';
import { COMPETITION_OPTIONS, type RoundCompetition } from '../../types/competition';
import {
  clearCurrentRound,
  loadCurrentRound,
  type PersistedRound,
} from '../../storage/roundStorage';
import { getCompetitionLabel, getCompetitionShortLabel } from '../../utils/competitionLabels';
import { navigateToLiveForCompetition } from '../../utils/competitionNavigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CompetitionSelect'>;

function formatActiveRoundPlayers(round: PersistedRound): string {
  const names = round.players
    .map((p) => p.name.trim())
    .filter((name) => name.length > 0);
  return names.length ? names.join(', ') : '—';
}

function formatActiveRoundDateLine(round: PersistedRound): string | null {
  const updated = round.updatedAt?.trim();
  const created = round.createdAt?.trim();
  const iso = updated || created;
  if (!iso) return null;
  try {
    const formatted = new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const label =
      updated && created && updated !== created ? 'Updated' : 'Started';
    return `${label}: ${formatted}`;
  } catch {
    return null;
  }
}

export default function CompetitionSelectScreen({ navigation }: Props) {
  const [activeRound, setActiveRound] = useState<PersistedRound | null>(null);

  const refreshActiveRound = useCallback(() => {
    void loadCurrentRound().then(setActiveRound);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshActiveRound();
    }, [refreshActiveRound])
  );

  async function handleResumeActiveRound() {
    if (!activeRound) return;
    navigateToLiveForCompetition(navigation, activeRound.competition);
  }

  function handleClearActiveRound() {
    Alert.alert(
      'Clear active round?',
      'This removes the saved in-progress round from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearCurrentRound();
              setActiveRound(null);
            })();
          },
        },
      ]
    );
  }

  function navigateToRoundSetup(competition: RoundCompetition) {
    navigation.navigate('RoundSetup', { competition });
  }

  function confirmReplaceActiveRound(target: RoundCompetition) {
    if (!activeRound) {
      navigateToRoundSetup(target);
      return;
    }

    const activeLabel = getCompetitionLabel(activeRound.competition);
    const targetLabel = getCompetitionShortLabel(target);

    Alert.alert(
      'Active round in progress',
      `You currently have an active ${activeLabel} round.\nStarting ${targetLabel} will require clearing or replacing the active round.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume Active Round',
          onPress: () => void handleResumeActiveRound(),
        },
        {
          text: `Clear and Start ${targetLabel}`,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await clearCurrentRound();
              setActiveRound(null);
              navigateToRoundSetup(target);
            })();
          },
        },
      ]
    );
  }

  function onCompetitionPress(competition: RoundCompetition) {
    if (!activeRound) {
      navigateToRoundSetup(competition);
      return;
    }
    if (activeRound.competition === competition) {
      navigateToRoundSetup(competition);
      return;
    }
    confirmReplaceActiveRound(competition);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose Competition</Text>
      <Text style={styles.subtitle}>Select your format to continue to round setup.</Text>

      <View style={styles.cards}>
        {COMPETITION_OPTIONS.map((option) => {
          const isActiveCompetition = activeRound?.competition === option.key;
          const dateLine = isActiveCompetition && activeRound
            ? formatActiveRoundDateLine(activeRound)
            : null;

          return (
            <View
              key={option.key}
              style={[styles.card, isActiveCompetition && styles.cardActive]}
            >
              <Pressable
                onPress={() => onCompetitionPress(option.key)}
                style={({ pressed }) => [pressed && styles.cardPressed]}
              >
                {isActiveCompetition ? (
                  <Text style={[styles.cardBadge, styles.cardBadgeActive, styles.cardBadgeTop]}>
                    ACTIVE ROUND
                  </Text>
                ) : activeRound ? (
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>{option.title}</Text>
                    <Text style={[styles.cardBadge, styles.cardBadgeInactive]}>
                      No active round
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.cardTitle}>{option.title}</Text>
                )}

                {isActiveCompetition && activeRound ? (
                  <View style={styles.activeCardBody}>
                    <Text style={styles.activeCardTitle}>{option.title}</Text>
                    <Text style={styles.activeCardMeta}>
                      Hole {activeRound.currentHole} of 18
                    </Text>
                    <Text style={styles.activeCardMeta}>
                      Players: {formatActiveRoundPlayers(activeRound)}
                    </Text>
                    {dateLine ? (
                      <Text style={styles.activeCardMetaMuted}>{dateLine}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.cardSubtitle}>{option.subtitle}</Text>
                )}
              </Pressable>

              {isActiveCompetition ? (
                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.cardResumeBtn}
                    onPress={() => void handleResumeActiveRound()}
                  >
                    <Text style={styles.cardResumeBtnText}>Resume Round</Text>
                  </Pressable>
                  <Pressable style={styles.cardClearBtn} onPress={handleClearActiveRound}>
                    <Text style={styles.cardClearBtnText}>Clear Round</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 10,
    backgroundColor: '#07110b',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#d1d5db',
    fontSize: 14,
    marginBottom: 6,
  },
  cards: {
    gap: 12,
  },
  card: {
    minHeight: 108,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2a23',
    backgroundColor: '#0b1510',
    padding: 14,
    justifyContent: 'center',
  },
  cardActive: {
    borderColor: '#1f7a46',
    backgroundColor: '#0f1a14',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    flex: 1,
    marginBottom: 6,
  },
  cardBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  cardBadgeTop: {
    marginBottom: 8,
  },
  cardBadgeActive: {
    color: '#86efac',
    backgroundColor: '#14532d',
  },
  cardBadgeInactive: {
    color: '#9ca3af',
    backgroundColor: '#101915',
  },
  cardSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
  },
  activeCardBody: {
    gap: 4,
    marginTop: 2,
  },
  activeCardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  activeCardMeta: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 20,
  },
  activeCardMetaMuted: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  cardResumeBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cardResumeBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  cardClearBtn: {
    flex: 1,
    backgroundColor: '#101915',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2e3b33',
    paddingVertical: 11,
    alignItems: 'center',
  },
  cardClearBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
});
