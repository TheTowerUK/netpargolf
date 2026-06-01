// src/screens/ScorecardScreen.tsx
// Printable scorecard - uses round + course from storage (same as Live Scoring).
// Net scores computed dynamically from gross + handicap + stroke index (not persisted).
// Supports viewing historical rounds via roundId param.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hapticTap } from '../utils/feedback';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import type { Course } from '../core/course';
import { buildCompetitionScorecardHtml } from '../core/scoring/scorecardExport';
import {
  buildBetterballStablefordScorecardSummary,
  buildFourballMatchplayScorecardSummary,
  buildIndividualStablefordScorecardSummary,
  buildScorecardDateLabel,
  buildScorecardPlayerRows,
  buildScorecardTeeLine,
  buildSinglesMatchplayScorecardSummary,
  formatScorecardCompetitionLabel,
  getBetterballStablefordCountingPointsByHole,
  getFourballMatchplayHoleColumns,
  getSinglesMatchplayHoleColumn,
} from '../core/scoring/scorecardDisplay';
import { getFourballSideRosterLines } from '../core/scoring/matchplayDisplay';
import { hasMissingStrokeIndex } from '../utils/courseValidation';
import StrokeIndexWarningBanner from '../components/StrokeIndexWarningBanner';
import { loadCourse } from '../storage/courseStorage';
import { loadCurrentRound, type PersistedRound } from '../storage/roundStorage';
import { getRoundById } from '../storage/roundHistoryStorage';
import { colors } from '../theme/colors';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

const TIP_KEY_PAR_SI = '@netpargolf/tip_par_si_edit:v1';

type Props = NativeStackScreenProps<RootStackParamList, 'Scorecard'>;

export default function ScorecardScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const roundIdParam = route.params ? (route.params as { roundId?: string }).roundId : undefined;
  const viewingHistory = !!roundIdParam;

  const [course, setCourse] = useState<Course | null>(null);
  const [round, setRound] = useState<PersistedRound | null>(null);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [showParSiTip, setShowParSiTip] = useState(false);
  const holesShown = side === 'front' ? HOLES.slice(0, 9) : HOLES.slice(9, 18);

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(TIP_KEY_PAR_SI);
        if (!seen) setShowParSiTip(true);
      } catch {
        // If storage fails, don't block UI; just show nothing.
      }
    })();
  }, []);

  const dismissParSiTip = async () => {
    setShowParSiTip(false);
    try {
      await AsyncStorage.setItem(TIP_KEY_PAR_SI, '1');
    } catch {
      // ignore
    }
  };

  const openEditParSi = () => {
    hapticTap();
    navigation.navigate('CourseSetup');
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const roundId = roundIdParam;
      const rPromise = roundId ? getRoundById(roundId) : loadCurrentRound();
      const [c, r] = await Promise.all([loadCourse(), rPromise]);
      setCourse(c);
      setRound(r);
    } finally {
      setLoading(false);
    }
  }, [roundIdParam]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const courseReady = !!course && Array.isArray(course.holes) && course.holes.length === 18;

  const rows = useMemo(
    () => buildScorecardPlayerRows(round, course, courseReady),
    [round, course, courseReady]
  );

  const competitionUi = useMemo(() => {
    type Summary = { heading: string; subtitle: string; lines: string[] };
    const base = {
      showPoints: true,
      showNet: true,
      formatSubtitle: '',
      summary: null as Summary | null,
      roster: null as { sideALine: string; sideBLine: string } | null,
      extraRows: [] as { label: string; valuesByHole: string[] }[],
    };

    if (!round) return base;

    switch (round.competition) {
      case 'individual_stableford': {
        const s = buildIndividualStablefordScorecardSummary(round, course, rows);
        return {
          ...base,
          formatSubtitle: 'Individual competition · Stableford points',
          summary: { heading: s.title, subtitle: s.subtitle, lines: s.lines },
        };
      }
      case 'betterball_stableford': {
        const counting = getBetterballStablefordCountingPointsByHole(round, course);
        const s = buildBetterballStablefordScorecardSummary(round, course);
        const roster =
          round.players.length === 4 ? getFourballSideRosterLines(round.players) : null;
        return {
          ...base,
          formatSubtitle: 'Side-based competition · best Stableford points per hole per side',
          summary: { heading: s.title, subtitle: s.subtitle, lines: s.lines },
          roster,
          extraRows: [
            {
              label: 'Side A best (pts)',
              valuesByHole: counting.sideA.map((v) => (v == null ? '—' : String(v))),
            },
            {
              label: 'Side B best (pts)',
              valuesByHole: counting.sideB.map((v) => (v == null ? '—' : String(v))),
            },
          ],
        };
      }
      case 'singles_matchplay': {
        const cols = getSinglesMatchplayHoleColumn(round, course);
        const sm = buildSinglesMatchplayScorecardSummary(round, course);
        return {
          ...base,
          showPoints: false,
          formatSubtitle: 'Head-to-head matchplay · lowest net wins each hole',
          summary: { heading: sm.statusLine, subtitle: '', lines: sm.lines },
          extraRows: [
            {
              label: 'Hole result',
              valuesByHole: cols.map((c) => c.resultLabel),
            },
          ],
        };
      }
      case 'fourball_betterball_matchplay': {
        const fb = getFourballMatchplayHoleColumns(round, course);
        const fm = buildFourballMatchplayScorecardSummary(round, course);
        const roster =
          round.players.length === 4 ? getFourballSideRosterLines(round.players) : null;
        return {
          ...base,
          showPoints: false,
          formatSubtitle: 'Side vs side matchplay · best net ball per hole',
          summary: { heading: fm.statusLine, subtitle: '', lines: fm.lines },
          roster,
          extraRows: [
            {
              label: 'Side A best net',
              valuesByHole: fb.bestNetA.map((v) => (v == null ? '—' : String(v))),
            },
            {
              label: 'Side B best net',
              valuesByHole: fb.bestNetB.map((v) => (v == null ? '—' : String(v))),
            },
            {
              label: 'Hole result',
              valuesByHole: fb.resultLabel,
            },
          ],
        };
      }
      default:
        return base;
    }
  }, [round, course, rows]);

  const courseName = course?.name ?? 'No course selected';

  const frontNineTotal = rows.reduce((sum, r) => sum + r.out, 0);
  const backNineTotal = rows.reduce((sum, r) => sum + r.in_, 0);
  const roundTotal = frontNineTotal + backNineTotal;
  const netTotal = rows.reduce((sum, r) => sum + r.netTotal, 0);

  const onPrintOrExport = async () => {
    if (!round) return;
    const html = buildCompetitionScorecardHtml({
      courseName,
      courseReady,
      course,
      round,
      rows,
      theme: {
        primary: colors.primary,
        primarySoft: colors.primarySoft,
        card: colors.card,
        textSecondary: colors.textSecondary,
      },
    });

    if (Platform.OS === 'web') {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
      return;
    }

    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');

    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    }
  };

  const hasData = rows.some((r) => r.scores.some((v) => v !== ''));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Scorecard</Text>
          <Text style={styles.subTitle}>{courseName}</Text>
          {round ? (
            <Text style={styles.compMetaLine}>
              {formatScorecardCompetitionLabel(round.competition)}
              {' · '}
              {buildScorecardDateLabel(round)}
              {' · Tee: '}
              {buildScorecardTeeLine(round)}
            </Text>
          ) : null}
          {hasData && competitionUi.formatSubtitle ? (
            <Text style={styles.formatSub}>{competitionUi.formatSubtitle}</Text>
          ) : null}

          <View style={styles.sideToggle}>
            <Pressable
              onPress={() => { hapticTap(); setSide('front'); }}
              style={({ pressed }) => [styles.sideBtn, side === 'front' && styles.sideBtnActive, pressed && styles.btnPressed]}
            >
              <Text style={[styles.sideBtnText, side === 'front' && styles.sideBtnTextActive]}>Front 9</Text>
            </Pressable>
            <Pressable
              onPress={() => { hapticTap(); setSide('back'); }}
              style={({ pressed }) => [styles.sideBtn, side === 'back' && styles.sideBtnActive, pressed && styles.btnPressed]}
            >
              <Text style={[styles.sideBtnText, side === 'back' && styles.sideBtnTextActive]}>Back 9</Text>
            </Pressable>
          </View>
          <View style={styles.handicapRow}>
            <Text style={styles.handicapLabel}>Handicap</Text>
            <Text style={styles.handicapReadOnly}>Per player (edit in Live Scoring)</Text>
          </View>
          <Text style={styles.meta}>
            {round?.updatedAt ? `Last saved: ${new Date(round.updatedAt).toLocaleString()}` : 'No round saved yet'}
          </Text>
          {!courseReady && (course || round) ? (
            <Text style={styles.courseNote}>
              Course not set — scorecard will still show gross scores.
            </Text>
          ) : null}
          {courseReady && hasMissingStrokeIndex(course) ? (
            <StrokeIndexWarningBanner onPressFix={() => navigation.navigate('CourseSetup')} />
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          {!viewingHistory ? (
            <Pressable
              style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
              onPress={() => { hapticTap(); refresh(); }}
            >
              <Text style={styles.btnText}>Refresh</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && hasData && styles.btnPressed]}
            onPress={() => { hapticTap(); onPrintOrExport(); }}
            disabled={!hasData || !round}
          >
            <Text style={[styles.btnText, styles.btnPrimaryText]}>
              {Platform.OS === 'web' ? 'Print' : 'Export PDF'}
            </Text>
          </Pressable>
        </View>
      </View>

      {showParSiTip ? (
        <View style={styles.tipBanner}>
          <Text style={styles.tipText}>
            Tip: Par and Stroke Index (SI) on the scorecard are <Text style={styles.tipBold}>editable</Text>. Tap{' '}
            <Text style={styles.tipBold}>Edit</Text> to update them.
          </Text>

          <Pressable
            onPress={dismissParSiTip}
            style={({ pressed }) => [styles.tipDismiss, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss tip"
          >
            <Text style={styles.tipDismissText}>Got it</Text>
          </Pressable>
        </View>
      ) : null}

      {courseReady ? (
        <View style={styles.parSiSection}>
          <View style={styles.parSiHeaderRow}>
            <Text style={styles.parSiTitle}>Scorecard Par / SI</Text>

            <View style={styles.parSiRight}>
              <View style={styles.editableChip}>
                <Text style={styles.editableChipText}>Editable</Text>
              </View>

              <Pressable
                onPress={openEditParSi}
                style={({ pressed }) => [styles.editBtn, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Edit par and stroke index"
                accessibilityHint="Opens editor to change Par and SI for the scorecard"
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parSiValuesScroll}>
            <View style={styles.parSiValuesRow}>
              <Text style={styles.parSiRowLabel}>Par</Text>
              {holesShown.map((h) => {
                const holeData = course?.holes?.[h - 1];
                const par = holeData?.par;
                return (
                  <View key={h} style={styles.parSiCell}>
                    <Text style={styles.parSiCellText}>{Number.isFinite(par) ? par : '—'}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.parSiValuesRow}>
              <Text style={styles.parSiRowLabel}>SI</Text>
              {holesShown.map((h) => {
                const holeData = course?.holes?.[h - 1];
                const si = holeData?.strokeIndex;
                return (
                  <View key={h} style={styles.parSiCell}>
                    <Text style={styles.parSiCellText}>{Number.isFinite(si) ? si : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {hasData && competitionUi.roster ? (
        <View style={styles.rosterBlock}>
          <Text style={styles.rosterLine}>{competitionUi.roster.sideALine}</Text>
          <Text style={styles.rosterLine}>{competitionUi.roster.sideBLine}</Text>
        </View>
      ) : null}

      {hasData && competitionUi.summary ? (
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryHeading}>Result</Text>
          <Text style={styles.summaryTitle}>{competitionUi.summary.heading}</Text>
          {competitionUi.summary.subtitle ? (
            <Text style={styles.summarySubtitle}>{competitionUi.summary.subtitle}</Text>
          ) : null}
          {competitionUi.summary.lines.map((line, i) => (
            <Text key={i} style={styles.summaryLine}>
              • {line}
            </Text>
          ))}
        </View>
      ) : null}

      {!hasData ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No scores yet</Text>
          <Text style={styles.emptyText}>
            Enter some gross scores in Live Scoring, then come back here and tap Refresh.
          </Text>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <View style={[styles.cell, styles.playerCell]}>
              <Text style={styles.headerText}>Player</Text>
            </View>

            <View style={[styles.cell, styles.phCell]}>
              <Text style={styles.headerText}>PH</Text>
            </View>

            {holesShown.map((h) => (
              <View key={h} style={[styles.cell, styles.holeCell]}>
                <Text style={styles.headerText}>{h}</Text>
              </View>
            ))}

            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.headerText}>{side === 'front' ? 'OUT' : 'IN'}</Text>
            </View>
            {courseReady && competitionUi.showNet ? (
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.headerText}>{side === 'front' ? 'NET OUT' : 'NET IN'}</Text>
              </View>
            ) : null}
            {courseReady && competitionUi.showPoints ? (
              <View style={[styles.cell, styles.ptsCell]}>
                <Text style={styles.headerText}>PTS</Text>
              </View>
            ) : null}
          </View>

          {rows.map((r, idx) => (
            <View key={r.id} style={[styles.row, idx % 2 === 1 ? styles.altRow : null]}>
              <View style={[styles.cell, styles.playerCell]}>
                <Text style={styles.playerText}>
                  {r.name}
                  {r.isNonReturn ? <Text style={[styles.hcpInline, { color: '#dc2626' }]}> (NR)</Text> : null}
                  <Text style={styles.hcpInline}> ({r.playingHandicap})</Text>
                </Text>
              </View>

              <View style={[styles.cell, styles.phCell]}>
                <Text style={styles.totalText}>{r.playingHandicap}</Text>
              </View>

              {holesShown.map((h) => {
                const i = h - 1;
                const v = r.scores[i];
                return (
                  <View key={h} style={[styles.cell, styles.holeCell]}>
                    <Text style={styles.scoreText}>{typeof v === 'number' ? String(v) : v}</Text>
                    {courseReady &&
                    competitionUi.showNet &&
                    typeof v === 'number' &&
                    r.netsPerHole[i] != null ? (
                      <Text style={styles.netSubtext}>{r.netsPerHole[i]}</Text>
                    ) : null}
                  </View>
                );
              })}

              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>{side === 'front' ? r.out : r.in_}</Text>
              </View>
              {courseReady && competitionUi.showNet ? (
                <View style={[styles.cell, styles.totalCell]}>
                  <Text style={styles.totalText}>{side === 'front' ? r.netOut : r.netIn}</Text>
                </View>
              ) : null}
              {courseReady && competitionUi.showPoints ? (
                <View style={[styles.cell, styles.ptsCell]}>
                  <Text style={styles.totalText}>{side === 'front' ? r.pointsOut : r.pointsIn}</Text>
                </View>
              ) : null}
            </View>
          ))}

          {competitionUi.extraRows.map((er, eri) => (
            <View
              key={`${er.label}-${eri}`}
              style={[styles.row, styles.extraRow, eri % 2 === 1 ? styles.extraRowAlt : null]}
            >
              <View style={[styles.cell, styles.playerCell]}>
                <Text style={styles.extraRowLabel}>{er.label}</Text>
              </View>
              <View style={[styles.cell, styles.phCell]} />
              {holesShown.map((h) => {
                const v = er.valuesByHole[h - 1] ?? '—';
                return (
                  <View key={h} style={[styles.cell, styles.holeCell]}>
                    <Text style={styles.extraRowCellText}>{v}</Text>
                  </View>
                );
              })}
              <View style={[styles.cell, styles.totalCell]} />
              {courseReady && competitionUi.showNet ? (
                <View style={[styles.cell, styles.totalCell]} />
              ) : null}
              {courseReady && competitionUi.showPoints ? (
                <View style={[styles.cell, styles.ptsCell]} />
              ) : null}
            </View>
          ))}

          <View style={[styles.row, styles.totalsRow]}>
            <View style={[styles.cell, styles.playerCell]}>
              <Text style={styles.totalsLabel}>Totals</Text>
            </View>

            <View style={[styles.cell, styles.phCell]} />

            {holesShown.map((h) => (
              <View key={h} style={[styles.cell, styles.holeCell]} />
            ))}

            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.totalText}>{side === 'front' ? frontNineTotal : backNineTotal}</Text>
            </View>

            {courseReady && competitionUi.showNet ? (
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>
                  {side === 'front'
                    ? rows.reduce((s, p) => s + (p.netOut ?? 0), 0)
                    : rows.reduce((s, p) => s + (p.netIn ?? 0), 0)}
                </Text>
              </View>
            ) : null}
            {courseReady && competitionUi.showPoints ? (
              <View style={[styles.cell, styles.ptsCell]}>
                <Text style={styles.totalText}>
                  {side === 'front'
                    ? rows.reduce((s, p) => s + (p.pointsOut ?? 0), 0)
                    : rows.reduce((s, p) => s + (p.pointsIn ?? 0), 0)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {hasData ? (
        <View style={styles.overallTotals}>
          <View style={styles.overallRow}>
            <Text style={styles.overallLabel}>GROSS TOTAL</Text>
            <Text style={styles.overallValue}>{roundTotal}</Text>
          </View>
          {courseReady && competitionUi.showNet ? (
            <View style={styles.overallRow}>
              <Text style={styles.overallLabel}>NET TOTAL (ALL PLAYERS)</Text>
              <Text style={styles.overallValue}>{netTotal}</Text>
            </View>
          ) : null}
          {courseReady && competitionUi.showPoints ? (
            <View style={styles.overallRow}>
              <Text style={styles.overallLabel}>POINTS TOTAL (ALL PLAYERS)</Text>
              <Text style={styles.overallValue}>
                {rows.reduce((s, p) => s + (p.pointsTotal ?? 0), 0)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Header controls only — theme colours
  screen: { flex: 1, backgroundColor: colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: colors.primary },
  subTitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '800' },
  compMetaLine: { fontSize: 11, color: colors.textSecondary, marginTop: 4, fontWeight: '800' },
  formatSub: { fontSize: 11, color: colors.textSecondary, marginTop: 6, fontWeight: '700', fontStyle: 'italic' },
  rosterBlock: {
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rosterLine: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  summaryBlock: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  summaryHeading: { fontSize: 12, fontWeight: '900', color: colors.primary, marginBottom: 6 },
  summaryTitle: { fontSize: 15, fontWeight: '900', color: colors.primary, marginBottom: 4 },
  summarySubtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  summaryLine: { fontSize: 12, color: colors.textPrimary, marginBottom: 4, lineHeight: 18 },
  extraRow: { backgroundColor: colors.primarySoft },
  extraRowAlt: { backgroundColor: colors.background },
  extraRowLabel: { fontSize: 11, fontWeight: '900', color: colors.primary },
  extraRowCellText: { fontSize: 10, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },

  meta: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
  courseNote: { fontSize: 11, color: colors.warning, marginTop: 4, fontStyle: 'italic' },

  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  btn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primarySoft },
  btnText: { fontWeight: '900', color: colors.textPrimary, fontSize: 12 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textInverse },

  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: colors.card },
  emptyTitle: { fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  emptyText: { color: colors.textSecondary, lineHeight: 18, fontSize: 13 },

  // Table — theme-aligned
  table: { borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row' },
  headerRow: { backgroundColor: colors.primarySoft },
  altRow: { backgroundColor: colors.background },

  cell: { borderRightWidth: 1, borderRightColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8, paddingHorizontal: 6, justifyContent: 'center' },
  playerCell: { width: 140 },
  holeCell: { width: 44, alignItems: 'center' },
  phCell: { width: 54, alignItems: 'center' },
  ptsCell: { width: 54, alignItems: 'center' },
  totalCell: { width: 60, alignItems: 'center' },

  headerText: { fontWeight: '900', fontSize: 12, color: colors.textPrimary },
  playerText: { fontWeight: '900', fontSize: 12 },
  hcpInline: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  scoreText: { fontSize: 12 },
  netSubtext: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  totalText: { fontWeight: '900', fontSize: 12 },

  sideToggle: { flexDirection: 'row', gap: 8, marginTop: 8 },
  sideBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  sideBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sideBtnText: { fontWeight: '900', color: colors.textPrimary, fontSize: 12 },
  sideBtnTextActive: { color: colors.textInverse },

  handicapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  handicapLabel: { fontSize: 12, fontWeight: '900', color: colors.textPrimary },
  handicapReadOnly: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 12,
  },

  totalsRow: {
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingVertical: 8,
    flexDirection: 'row',
  },
  totalsLabel: { fontWeight: 'bold' },

  overallTotals: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card },
  overallRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  overallLabel: { fontWeight: '800', color: colors.textPrimary, fontSize: 13 },
  overallValue: { fontWeight: '900', color: colors.primary, fontSize: 14 },

  parSiSection: { marginBottom: 12 },
  parSiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  parSiTitle: { fontWeight: '900', fontSize: 14, color: colors.textPrimary },
  parSiRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editableChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editableChipText: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  editBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary },

  parSiValuesScroll: { marginTop: 4 },
  parSiValuesRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  parSiRowLabel: { width: 32, fontWeight: '900', fontSize: 11, color: colors.textSecondary },
  parSiCell: { width: 36, alignItems: 'center' },
  parSiCellText: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },

  tipBanner: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tipText: { flex: 1, color: colors.textPrimary, fontSize: 12, lineHeight: 16 },
  tipBold: { fontWeight: '900' },
  tipDismiss: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  tipDismissText: { color: colors.textInverse, fontWeight: '900', fontSize: 12 },
});
