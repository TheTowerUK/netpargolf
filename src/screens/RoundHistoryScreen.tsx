// src/screens/RoundHistoryScreen.tsx
// NetParGolf — Round history list (saved rounds).

import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigations/types';
import { colors } from '../theme/colors';
import {
  listRounds,
  deleteRound,
  type StoredRound,
} from '../storage/roundHistoryStorage';

export default function RoundHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rounds, setRounds] = useState<StoredRound[]>([]);

  const refresh = useCallback(async () => {
    const list = await listRounds();
    setRounds(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onViewScoreboard = (id: string) => {
    navigation.navigate('Scoreboard', { roundId: id });
  };

  const onViewScorecard = (id: string) => {
    navigation.navigate('Scorecard', { roundId: id });
  };

  const onDelete = (r: StoredRound) => {
    Alert.alert(
      'Delete round?',
      `Remove "${r.courseName}" from ${formatDate(r.savedAt)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRound(r.id);
            await refresh();
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Round History</Text>
      <Text style={styles.subTitle}>Saved rounds (saved when you archive from Scoreboard).</Text>

      {rounds.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No saved rounds yet</Text>
          <Text style={styles.emptyText}>
            Rounds are saved to history when you archive them from Scoreboard.
          </Text>
        </View>
      ) : (
        rounds.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.dateText}>{formatDate(r.savedAt)}</Text>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => onDelete(r)}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </Pressable>
            </View>
            <Text style={styles.courseName}>{r.courseName}</Text>
            {r.teamTotal != null ? (
              <Text style={styles.teamText}>Team: {r.teamTotal} pts</Text>
            ) : null}
            <View style={styles.rowActions}>
              <Pressable style={styles.viewBtn} onPress={() => onViewScoreboard(r.id)}>
                <Text style={styles.viewBtnText}>Scoreboard</Text>
              </Pressable>
              <Pressable style={styles.viewBtn} onPress={() => onViewScorecard(r.id)}>
                <Text style={styles.viewBtnText}>Scorecard</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 6, color: colors.primary },
  subTitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 14 },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dateText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  viewBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  viewBtnText: { fontSize: 12, fontWeight: '800', color: colors.textInverse },
  deleteBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.dangerSoft,
  },
  deleteBtnText: { fontSize: 12, fontWeight: '800', color: colors.danger },
  courseName: { fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginBottom: 4 },
  teamText: { fontSize: 12, fontWeight: '800', color: colors.primary },

  emptyTitle: { fontSize: 16, fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
