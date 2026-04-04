import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigations/types';
import { COMPETITION_OPTIONS } from '../../types/competition';

type Props = NativeStackScreenProps<RootStackParamList, 'CompetitionSelect'>;

export default function CompetitionSelectScreen({ navigation }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Choose Competition</Text>
      <Text style={styles.subtitle}>Select your format to continue to round setup.</Text>

      <View style={styles.cards}>
        {COMPETITION_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => navigation.navigate('RoundSetup', { competition: option.key })}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Text style={styles.cardTitle}>{option.title}</Text>
            <Text style={styles.cardSubtitle}>{option.subtitle}</Text>
          </Pressable>
        ))}
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
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
  },
});
