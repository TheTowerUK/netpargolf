import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import { loadActiveCourse } from '../storage/courseStorage';
import { loadCurrentRound, type PersistedRound } from '../storage/roundStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'RoundScoring'>;

function liveRouteForRound(
  r: PersistedRound
): keyof RootStackParamList | 'RoundScoring' {
  switch (r.competition) {
    case 'singles_matchplay':
      return 'LiveSinglesMatchplay';
    case 'fourball_betterball_matchplay':
      return 'LiveFourballBetterballMatchplay';
    case 'individual_stableford':
      return 'LiveIndividualStableford';
    case 'betterball_stableford':
      return 'LiveBetterballStableford';
    default:
      return 'RoundScoring';
  }
}

/**
 * Fallback dispatcher when navigation lands on the legacy route.
 * Primary flows should navigate directly to format-specific live screens.
 */
export default function RoundScoringScreen({ navigation }: Props) {
  const [message, setMessage] = useState('Loading round…');

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await loadCurrentRound();
      await loadActiveCourse();
      if (!mounted) return;
      if (!saved) {
        Alert.alert('No round found', 'Please set up a round first.', [
          { text: 'OK', onPress: () => navigation.navigate('CompetitionSelect') },
        ]);
        return;
      }
      const target = liveRouteForRound(saved);
      if (target !== 'RoundScoring') {
        navigation.replace(target);
        return;
      }
      setMessage('This competition is not supported on this screen.');
    })();
    return () => {
      mounted = false;
    };
  }, [navigation]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07110b',
    padding: 24,
  },
  text: { color: '#ffffff', fontSize: 16 },
});
