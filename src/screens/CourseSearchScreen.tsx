// src/screens/CourseSearchScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';

import type { RootStackParamList } from '../navigations/types';
import { colors as theme } from '../theme/colors';

import {
  searchCoursesByName,
  getCourse,
  type CourseSearchResult,
} from '../services/golfCourseApi';
import { findUkHolesFallback } from '../services/bthreeGolfApi';

import { loadCourseDetailsCache } from '../storage/courseDetailsCache';
import { saveActiveCourse } from '../storage/courseStorage';
import { loadLastSearchQuery, saveLastSearchQuery } from '../storage/searchStorage';
import { hapticTap, hapticSuccess, hapticError } from '../utils/feedback';
import { useToast } from '../components/Toast';

type Props = NativeStackScreenProps<RootStackParamList, 'CourseSearch'>;

export default function CourseSearchScreen({ navigation }: Props) {
  const toast = useToast();
  const apiKey =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.golfCourseApiKey ??
    (Constants.manifest as { extra?: Record<string, string> } | undefined)?.extra?.golfCourseApiKey ??
    '';

  if (__DEV__) {
    const k = apiKey ?? '';
    console.log('[CourseSearch] apiKey len=', k.length, 'prefix=', k.slice(0, 4));
  }

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const canSearch = useMemo(() => query.trim().length >= 3, [query]);

  useEffect(() => {
    (async () => {
      const last = await loadLastSearchQuery();
      setQuery(last);
      setHydrated(true);
    })();
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      const term = q.trim();
      if (!term || term.length < 3) {
        setResults([]);
        return;
      }
      if (!apiKey) {
        Alert.alert(
          'API key missing',
          'No GolfCourse API key was found in the app config. Add it via EAS Secrets / app.config.js.'
        );
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setSearching(true);
      try {
        const items = await searchCoursesByName(term, { apiKey, signal: ac.signal });
        setResults(items);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        Alert.alert('Search failed', e instanceof Error ? e.message : 'Unable to search courses.');
      } finally {
        setSearching(false);
      }
    },
    [apiKey]
  );

  // Debounce search; only clear results when query is empty (keeps list when backspacing)
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      const trimmed = query.trim();
      if (trimmed.length >= 3) runSearch(query);
      else if (trimmed.length === 0) setResults([]);
      void saveLastSearchQuery(query);
    }, 400);
    return () => clearTimeout(t);
  }, [query, canSearch, runSearch, hydrated]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSelect = useCallback(
    async (item: CourseSearchResult) => {
      if (!apiKey) return;
      hapticTap();
      setSelectingId(item.id);
      try {
        let course = await getCourse(item.id, { apiKey });
        const primaryHolesCount = course.holes?.length ?? 0;
        const raw = await loadCourseDetailsCache(item.id) as {
          club_name?: string;
          course_name?: string;
          location?: { country?: string };
          course?: { club_name?: string; course_name?: string };
        } | null;
        const apiCourse = raw?.course ?? raw;

        const holesMissing = !course.holes?.length || course.holes.length < 9;
        const needsFallback = holesMissing || course.scorecardSource === 'default';

        if (__DEV__) {
          console.log('[CourseSearch] fallbackCheck', {
            holesCount: course.holes?.length ?? 0,
            scorecardSource: course.scorecardSource,
            needsFallback,
            club: apiCourse?.club_name,
            course: apiCourse?.course_name,
          });
        }

        let holesFromFallback = false;
        let afterBthreeHolesCount: number | undefined;
        let afterBthreeSource: string | undefined;

        if (needsFallback) {
          const q1 = (apiCourse?.course_name ?? '').trim();
          const q2 = (apiCourse?.club_name ?? '').trim();
          const q3 = `${q2} ${q1}`.trim();
          const queryCandidates = [q1, q2, q3].filter(Boolean);

          if (!queryCandidates.length) {
            if (__DEV__) console.log('[CourseSearch] skip bthree: queryCandidates empty (no club_name/course_name from API)');
          } else {
            const queryName = queryCandidates[0]!;
            const bthreePromise = findUkHolesFallback({ queryName, queryCandidates: queryCandidates.length > 1 ? queryCandidates : undefined });
            const timeoutMs = 8000;
            const bthree = await Promise.race([
              bthreePromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
            ]);
            holesFromFallback = !!(bthree?.holes?.length);
            if (holesFromFallback) {
              afterBthreeHolesCount = bthree!.holes.length;
              afterBthreeSource = 'bthree';
            }

            if (__DEV__) {
              console.log('[CourseSearch] bthreeResult', bthree ? { marker: bthree.markerName, holes: bthree.holes.length } : null);
            }

            if (holesFromFallback) {
              const h = bthree!.holes;
              const holes18 =
                h.length >= 18
                  ? h.slice(0, 18)
                  : h.length === 9
                    ? [...h, ...h.map((x, i) => ({ ...x, holeNumber: i + 10, strokeIndex: (x.strokeIndex % 9 || 9) + 9 }))]
                    : [...h, ...Array.from({ length: 18 - h.length }, (_, i) => ({ holeNumber: h.length + i + 1, par: 4, strokeIndex: h.length + i + 1 }))];
              const hasBthreeSi = h.some((x, i) => x.strokeIndex !== i + 1);
              course = {
                ...course,
                holes: holes18,
                holesNote: 'Hole data from UK fallback (B3 Golf).',
                scorecardSource: 'bthree',
                strokeIndexSource: hasBthreeSi ? 'api' : 'default',
              };
            }
          }
        }

        if (__DEV__) {
          console.log('[CourseSearch] before save/nav:', {
            afterBthreeHolesCount,
            afterBthreeSource,
            finalHolesCount: course.holes?.length ?? 0,
            finalScorecardSource: course.scorecardSource ?? '(none)',
          });
        }

        await saveActiveCourse(course);
        hapticSuccess();
        toast.show('Course saved', 'success');
        navigation.navigate('CourseSetup');
      } catch (e: unknown) {
        hapticError();
        Alert.alert(
          'Unable to contact course provider',
          e instanceof Error ? e.message : 'Please check your connection and API key.'
        );
      } finally {
        setSelectingId(null);
      }
    },
    [apiKey, navigation]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Search by course name</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. Wentworth, St Andrews..."
        placeholderTextColor={theme.textMuted}
        autoCorrect={false}
        autoCapitalize="words"
        style={styles.input}
      />

      {!apiKey ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Missing API key. Add <Text style={styles.mono}>GOLFCOURSE_API_KEY</Text> (EAS secret) and rebuild.
          </Text>
        </View>
      ) : null}

      {searching ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Searching…</Text>
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(it) => it.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={results.length ? undefined : styles.emptyWrap}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {query.trim().length < 3
              ? 'Type at least 3 characters to search.'
              : 'No results yet. Try another spelling.'}
          </Text>
        }
        renderItem={({ item }) => {
          const selecting = selectingId === item.id;
          return (
            <Pressable
              onPress={() => handleSelect(item)}
              disabled={!!selectingId}
              style={({ pressed }) => [
                styles.row,
                pressed && !selectingId ? styles.rowPressed : null,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                {(item.city || item.state || item.country) ? (
                  <Text style={styles.rowSub}>
                    {[item.city, item.state, item.country].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
              </View>

              {selecting ? <ActivityIndicator /> : <Text style={styles.pick}>Pick</Text>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.bg },
  label: { color: theme.text, marginBottom: 8, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    color: theme.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  banner: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { color: theme.text, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: 'Courier', fontSize: 12 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  loadingText: { color: theme.textMuted },
  emptyWrap: { paddingTop: 24 },
  emptyText: { color: theme.textMuted, textAlign: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    marginBottom: 10,
  },
  rowPressed: { opacity: 0.8 },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: theme.textMuted, marginTop: 2, fontSize: 13 },
  pick: { color: theme.accent, fontWeight: '700' },
});
