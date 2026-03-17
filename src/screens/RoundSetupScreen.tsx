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
  type RoundCompetition,
  type RoundingMode,
} from '../storage/roundStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundSetup'>;

type PlayerForm = {
  id: string;
  name: string;
  handicapIndex: string;
  courseHandicap: string;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const COMPETITIONS: { key: RoundCompetition; label: string }[] = [
  { key: 'individual_stableford', label: 'Individual Stableford' },
  { key: 'betterball', label: 'Betterball' },
  { key: 'matchplay', label: 'Matchplay' },
];

const ROUNDING_OPTIONS: { key: RoundingMode; label: string }[] = [
  { key: 'floor', label: 'Floor' },
  { key: 'round', label: 'Round' },
  { key: 'ceil', label: 'Ceil' },
];

function sanitiseDecimalInput(value: string): string {
  let cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '');

  if (cleaned.startsWith('.')) {
    cleaned = `0${cleaned}`;
  }

  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;

  const beforeDot = cleaned.slice(0, firstDot + 1);
  const afterDot = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return beforeDot + afterDot;
}

function sanitiseIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function parseNullableDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseNullableInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function makeBlankPlayer(): PlayerForm {
  return {
    id: makeId('player'),
    name: '',
    handicapIndex: '',
    courseHandicap: '',
  };
}

export default function RoundSetupScreen({ navigation }: Props) {
  const [competition, setCompetition] =
    useState<RoundCompetition>('individual_stableford');
  const [allowancePercent, setAllowancePercent] = useState('100');
  const [roundingMode, setRoundingMode] = useState<RoundingMode>('round');
  const [players, setPlayers] = useState<PlayerForm[]>([makeBlankPlayer()]);
  const [hasExistingRound, setHasExistingRound] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const existing = await loadCurrentRound();
      if (!mounted) return;
      setHasExistingRound(!!existing);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const playerCountLabel = useMemo(() => {
    return `${players.length} player${players.length === 1 ? '' : 's'}`;
  }, [players.length]);

  function updatePlayer(id: string, patch: Partial<PlayerForm>) {
    setPlayers((prev) =>
      prev.map((player) => (player.id === id ? { ...player, ...patch } : player))
    );
  }

  function addPlayer() {
    setPlayers((prev) => [...prev, makeBlankPlayer()]);
  }

  function removePlayer(id: string) {
    if (players.length <= 1) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function handleResumeRound() {
    navigation.navigate('RoundScoring');
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
            setHasExistingRound(false);
            Alert.alert('Cleared', 'Saved round data has been removed.');
          },
        },
      ]
    );
  }

  async function createAndStartRound() {
    const trimmedPlayers = players.map((p) => ({
      ...p,
      name: p.name.trim(),
    }));

    if (trimmedPlayers.some((p) => !p.name)) {
      Alert.alert('Missing player name', 'Please enter a name for each player.');
      return;
    }

    const parsedAllowance = Number(allowancePercent.trim());
    if (!Number.isFinite(parsedAllowance) || parsedAllowance <= 0) {
      Alert.alert('Invalid allowance', 'Enter a valid allowance percentage.');
      return;
    }

    const persistedPlayers: PersistedPlayer[] = trimmedPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      handicapIndex: parseNullableDecimal(p.handicapIndex),
      courseHandicap: parseNullableInteger(p.courseHandicap),
    }));

    const round = buildInitialRound({
      competition,
      allowancePercent: parsedAllowance,
      roundingMode,
      players: persistedPlayers,
    });

    await saveCurrentRound(round);
    setHasExistingRound(true);
    navigation.navigate('RoundScoring');
  }

  async function handleStartRound() {
    if (hasExistingRound) {
      Alert.alert(
        'Replace saved round?',
        'Starting a new round will overwrite the current saved round.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start New Round',
            style: 'destructive',
            onPress: createAndStartRound,
          },
        ]
      );
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
          Choose the format, add players, then start scoring.
        </Text>

        {hasExistingRound && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Saved round detected</Text>
            <Text style={styles.warningText}>
              There is already a saved round on this device. You can resume it,
              clear it, or start a new round which will replace it.
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
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Competition</Text>
          <View style={styles.optionGroup}>
            {COMPETITIONS.map((item) => {
              const selected = item.key === competition;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.optionChip, selected && styles.optionChipSelected]}
                  onPress={() => setCompetition(item.key)}
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
        </View>

        <View style={styles.card}>
          <View style={styles.playersHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Players</Text>
              <Text style={styles.playersSub}>{playerCountLabel}</Text>
            </View>

            <Pressable style={styles.addBtn} onPress={addPlayer}>
              <Text style={styles.addBtnText}>Add Player</Text>
            </Pressable>
          </View>

          {players.map((player, index) => (
            <View key={player.id} style={styles.playerCard}>
              <View style={styles.playerCardHeader}>
                <Text style={styles.playerCardTitle}>Player {index + 1}</Text>
                {players.length > 1 && (
                  <Pressable onPress={() => removePlayer(player.id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                )}
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
                value={player.handicapIndex}
                onChangeText={(v) =>
                  updatePlayer(player.id, {
                    handicapIndex: sanitiseDecimalInput(v),
                  })
                }
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="e.g. 12.4"
                placeholderTextColor="#9ca3af"
              />

              <Text style={styles.inputLabel}>Course Handicap</Text>
              <TextInput
                value={player.courseHandicap}
                onChangeText={(v) =>
                  updatePlayer(player.id, {
                    courseHandicap: sanitiseIntegerInput(v),
                  })
                }
                keyboardType="number-pad"
                style={styles.input}
                placeholder="e.g. 14"
                placeholderTextColor="#9ca3af"
              />
            </View>
          ))}
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
    gap: 14,
    paddingBottom: 28,
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
  inputLabel: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
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
  addBtn: {
    backgroundColor: '#14532d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '800',
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
  removeText: {
    color: '#d1d5db',
    fontWeight: '700',
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
