// Legacy route: forwards to the correct live scoring screen from the saved round.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import { loadCurrentRound } from '../storage/roundStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveScoring'>;

export default function LiveScoringScreen({ navigation }: Props) {
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const round = await loadCurrentRound();
      if (!alive) return;

      if (!round) {
        setShowEmpty(true);
        return;
      }

      if (round.competition === 'singles_matchplay') {
        navigation.replace('LiveSinglesMatchplay');
        return;
      }
      if (round.competition === 'fourball_betterball_matchplay') {
        navigation.replace('LiveFourballBetterballMatchplay');
        return;
      }
      if (round.competition === 'individual_stableford') {
        navigation.replace('LiveIndividualStableford');
        return;
      }
      if (round.competition === 'betterball_stableford') {
        navigation.replace('LiveBetterballStableford');
        return;
      }

      navigation.replace('RoundScoring');
    })();

    return () => {
      alive = false;
    };
  }, [navigation]);

  if (showEmpty) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No active round</Text>
        <Text style={styles.sub}>
          Set up a round under Choose Competition, then start scoring from there.
        </Text>
        <Pressable
          style={styles.btn}
          onPress={() => navigation.navigate('CompetitionSelect')}
        >
          <Text style={styles.btnText}>Choose competition</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" />
      <Text style={styles.muted}>Opening live scoring…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F6F7F9',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  muted: { marginTop: 8, fontSize: 14, color: '#6B7280' },
  btn: {
    marginTop: 8,
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
});
