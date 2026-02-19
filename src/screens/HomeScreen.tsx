// src/screens/HomeScreen.tsx
// Add a Scoreboard button (resume view) to your existing HomeScreen.
// If you already have your own HomeScreen, just merge the new button.

import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hapticTap } from '../utils/feedback';
import PrimaryButton from '../components/PrimaryButton';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import { loadRound } from '../storage/roundStorage';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [hasSavedRound, setHasSavedRound] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await loadRound();
      setHasSavedRound(!!r);
    })();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>NetParGolf</Text>
        <Text style={styles.heroSub}>
          Live scoring + training points (net vs par). Par/SI locked per hole from your saved course.
        </Text>

        <View style={styles.heroChips}>
          <View style={styles.chip}><Text style={styles.chipText}>4 players</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Gross + Net</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Print scorecard</Text></View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Start</Text>

        <PrimaryButton
          title="Course Setup (Par & SI)"
          onPress={() => navigation.navigate('CourseSetup')}
          variant="secondary"
          style={styles.courseSetupBtn}
        />

        <View style={styles.divider} />

        <PrimaryButton
          title="Live Scoring (4 players)"
          onPress={() => navigation.navigate('LiveScoring')}
          variant="primary"
        />

        <View style={{ height: 10 }} />

        <PrimaryButton
          title={hasSavedRound ? 'Scoreboard (resume)' : 'Scoreboard'}
          onPress={() => navigation.navigate('Scoreboard')}
          variant="secondary"
          style={styles.secondaryBtnRow}
        />

        <View style={{ height: 10 }} />

        <PrimaryButton
          title="Scorecard (printable)"
          onPress={() => navigation.navigate('Scorecard')}
          variant="secondary"
          style={styles.secondaryBtnRow}
        />

        <View style={{ height: 10 }} />

        <PrimaryButton
          title="Round History"
          onPress={() => navigation.navigate('RoundHistory')}
          variant="secondary"
          style={styles.secondaryBtnRow}
        />

        <View style={{ height: 10 }} />

        <PrimaryButton
          title="Stats"
          onPress={() => navigation.navigate('Stats')}
          variant="secondary"
          style={styles.secondaryBtnRow}
        />

        <View style={{ height: 10 }} />

        <PrimaryButton
          title="Help / Practice"
          onPress={() => navigation.navigate('HelpPractice')}
          variant="secondary"
          style={styles.secondaryBtnRow}
        />

        <Text style={styles.hint}>
          Tip: Live Scoring autosaves your round. Scoreboard shows totals and lets you continue.
        </Text>
      </View>

      <Text style={styles.footerMuted}>v0.3 — Autosave round + scoreboard</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 28, backgroundColor: colors.background },

  hero: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  heroTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6, color: colors.textInverse },
  heroSub: { fontSize: 13, color: colors.textInverse, opacity: 0.9, lineHeight: 18 },

  heroChips: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chip: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { color: colors.textInverse, fontWeight: '800', fontSize: 12 },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '900', marginBottom: 10, color: colors.textPrimary },

  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },

  courseSetupBtn: {
    borderColor: colors.accent,
  },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },

  secondaryBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },

  hint: { marginTop: 10, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  footerMuted: { marginTop: 8, color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
});
