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
  type StoredRoundSummary,
} from '../storage/roundHistoryStorage';

export default function RoundHistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rounds, setRounds] = useState<StoredRoundSummary[]>([]);

  const refresh = useCallback(async () => {
    const list = await listRounds();
    setRounds(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onView = (id: string) => {
    navigation.navigate('RoundDetail', { roundId: id });
  };

  const onDelete = (r: StoredRoundSummary) => {
    Alert.alert(
      'Delete round?',
      `Remove "${r.courseNameSnapshot}" from ${formatDate(r.savedAt)}?`,
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
      <Text style={styles.subTitle}>Saved rounds (saved when you finish or archive).</Text>

      {rounds.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No saved rounds yet</Text>
          <Text style={styles.emptyText}>
            Rounds are saved to history when you complete or archive them from Live Scoring.
          </Text>
        </View>
      ) : (
        rounds.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.rowTop}>
              <Text style={styles.dateText}>{formatDate(r.savedAt)}</Text>
              <View style={styles.rowActions}>
                <Pressable style={styles.viewBtn} onPress={() => onView(r.id)}>
                  <Text style={styles.viewBtnText}>View</Text>
                </Pressable>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => onDelete(r)}
                >
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.courseName}>{r.courseNameSnapshot}</Text>
            {r.playersSnapshot?.length ? (
              <Text style={styles.playersText} numberOfLines={1}>
                {r.playersSnapshot.filter(Boolean).join(', ')}
              </Text>
            ) : null}
            {r.teamTotalSnapshot != null ? (
              <Text style={styles.teamText}>Team: {r.teamTotalSnapshot} pts</Text>
            ) : null}
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
  rowActions: { flexDirection: 'row', gap: 8 },
  viewBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
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
  playersText: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  teamText: { fontSize: 12, fontWeight: '800', color: colors.primary },

  emptyTitle: { fontSize: 16, fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  emptyText: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
