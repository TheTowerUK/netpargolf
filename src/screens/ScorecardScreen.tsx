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
import { hasMissingStrokeIndex } from '../utils/courseValidation';
import StrokeIndexWarningBanner from '../components/StrokeIndexWarningBanner';
import { getGrossForHole, strokesBasisForAllocation } from '../utils/scoreboardHelpers';
import { scoreHoleOptionA } from '../core/scoring';
import { loadCourse } from '../storage/courseStorage';
import { loadCurrentRound, type PersistedRound } from '../storage/roundStorage';
import { getRoundById } from '../storage/roundHistoryStorage';
import { colors } from '../theme/colors';

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

/** Strokes received on a hole based on handicap and stroke index. Correct golf math. */
function strokesReceivedOnHole(handicap: number, strokeIndex: number): number {
  if (!handicap || handicap <= 0) return 0;

  const fullRounds = Math.floor(handicap / 18);
  const remainder = handicap % 18;

  let strokes = fullRounds;

  if (strokeIndex <= remainder) {
    strokes += 1;
  }

  return strokes;
}

type Row = {
  id: string;
  name: string;
  courseHandicap: number; // for net calc
  playingHandicap: number;
  scores: (string | number)[];
  out: number;
  in_: number;
  total: number;
  netOut: number;
  netIn: number;
  netTotal: number;
  pointsPerHole: (number | null)[];
  pointsOut: number;
  pointsIn: number;
  pointsTotal: number;
  strokesPerHole: number[];
  netsPerHole: (number | null)[];
};

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

  const rows: Row[] = useMemo(() => {
    const players = round?.players ?? [];
    const courseHoles = course?.holes ?? [];

    return players.slice(0, 4).map((p) => {
      const handicapNum =
        p.courseHandicap != null && Number.isFinite(p.courseHandicap) ? p.courseHandicap : 0;
      const rmRaw = round?.roundingMode ?? 'round';
      const rm: 'nearest' | 'floor' | 'ceil' =
        rmRaw === 'floor' || rmRaw === 'ceil' ? rmRaw : 'nearest';
      const basis =
        round != null ? strokesBasisForAllocation(p, round) : null;
      const playingHandicap = basis != null && Number.isFinite(basis) ? basis : 0;

      const scores = HOLES.map((h) => {
        const gross = getGrossForHole(round, h, p.id);
        return typeof gross === 'number' ? gross : '';
      });

      let strokesPerHole: number[] = [];

      let netsPerHole: (number | null)[];
      let netOut: number;
      let netIn: number;
      let netTotal: number;
      let pointsPerHole: (number | null)[];
      let pointsOut = 0;
      let pointsIn = 0;
      let pointsTotal = 0;

      if (courseReady && courseHoles.length === 18) {
        strokesPerHole = HOLES.map((h) => {
          const holeData = courseHoles[h - 1];
          const si = holeData?.strokeIndex;
          if (si == null || !Number.isFinite(si)) return 0;
          return strokesReceivedOnHole(playingHandicap, si);
        });

        netsPerHole = scores.map((gross, i) => {
          if (typeof gross !== 'number') return null;
          const strokes = strokesPerHole[i];
          return gross - strokes;
        });

        netOut = netsPerHole.slice(0, 9).reduce((a, v) => a + (v ?? 0), 0);
        netIn = netsPerHole.slice(9, 18).reduce((a, v) => a + (v ?? 0), 0);
        netTotal = netOut + netIn;

        pointsPerHole = HOLES.map((h) => {
          const i = h - 1;
          const gross = scores[i];
          if (typeof gross !== 'number') return null;

          const holeData = courseHoles[i];
          const par = holeData?.par;
          const si = holeData?.strokeIndex;
          if (!Number.isFinite(par) || !Number.isFinite(si)) return null;

          try {
            const b = scoreHoleOptionA({
              courseHandicap: playingHandicap,
              allowancePercent: 1,
              roundingMode: rm,
              hole: { par: par as number, strokeIndex: si as number },
              gross,
            });
            return b.points;
          } catch {
            return null;
          }
        });

        pointsOut = pointsPerHole.slice(0, 9).reduce((a, v) => a + (v ?? 0), 0);
        pointsIn = pointsPerHole.slice(9, 18).reduce((a, v) => a + (v ?? 0), 0);
        pointsTotal = pointsOut + pointsIn;
      } else {
        netsPerHole = scores.map(() => null);
        netOut = 0;
        netIn = 0;
        netTotal = 0;
        pointsPerHole = scores.map(() => null);
      }

      const out = scores.slice(0, 9).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);
      const in_ = scores.slice(9, 18).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);
      const total = out + in_;

      return {
        id: p.id,
        name: p.name,
        courseHandicap: handicapNum,
        playingHandicap,
        scores,
        out,
        in_,
        total,
        netOut,
        netIn,
        netTotal,
        pointsPerHole,
        pointsOut,
        pointsIn,
        pointsTotal,
        strokesPerHole,
        netsPerHole,
      };
    });
  }, [round, course, courseReady]);

  const courseName = course?.name ?? 'No course selected';

  const frontNineTotal = rows.reduce((sum, r) => sum + r.out, 0);
  const backNineTotal = rows.reduce((sum, r) => sum + r.in_, 0);
  const roundTotal = frontNineTotal + backNineTotal;
  const netTotal = rows.reduce((sum, r) => sum + r.netTotal, 0);

  const onPrintOrExport = async () => {
    const html = buildScorecardHtml({
      courseName,
      courseReady,
      meta: {
        competitionName: round?.competition
          ? String(round.competition).replace(/_/g, ' ')
          : undefined,
        competitionDate: undefined,
        tee: undefined,
        marker: undefined,
      },
      players: rows.map((r) => ({
        name: r.name,
        handicap: r.playingHandicap,
        scores: r.scores,
        netsPerHole: r.netsPerHole,
        out: r.out,
        in_: r.in_,
        total: r.total,
        netOut: r.netOut,
        netIn: r.netIn,
        netTotal: r.netTotal,
        pointsOut: r.pointsOut,
        pointsIn: r.pointsIn,
        pointsTotal: r.pointsTotal,
      })),
      frontNineTotal,
      backNineTotal,
      roundTotal,
      netTotal,
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

    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    }
  };

  const hasData = rows.some((r) => r.scores.some((v) => typeof v === 'number'));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Scorecard</Text>
          <Text style={styles.subTitle}>{courseName}</Text>

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
            disabled={!hasData}
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
            {courseReady ? (
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.headerText}>{side === 'front' ? 'NET OUT' : 'NET IN'}</Text>
              </View>
            ) : null}
            {courseReady ? (
              <View style={[styles.cell, styles.ptsCell]}>
                <Text style={styles.headerText}>PTS</Text>
              </View>
            ) : null}
          </View>

          {rows.map((r, idx) => (
            <View key={r.id} style={[styles.row, idx % 2 === 1 ? styles.altRow : null]}>
              <View style={[styles.cell, styles.playerCell]}>
                <Text style={styles.playerText}>
                  {r.name} <Text style={styles.hcpInline}>({r.playingHandicap})</Text>
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
                    <Text style={styles.scoreText}>{typeof v === 'number' ? String(v) : ''}</Text>
                    {courseReady && typeof v === 'number' && r.netsPerHole[i] != null ? (
                      <Text style={styles.netSubtext}>{r.netsPerHole[i]}</Text>
                    ) : null}
                  </View>
                );
              })}

              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>{side === 'front' ? r.out : r.in_}</Text>
              </View>
              {courseReady ? (
                <View style={[styles.cell, styles.totalCell]}>
                  <Text style={styles.totalText}>{side === 'front' ? r.netOut : r.netIn}</Text>
                </View>
              ) : null}
              {courseReady ? (
                <View style={[styles.cell, styles.ptsCell]}>
                  <Text style={styles.totalText}>{side === 'front' ? r.pointsOut : r.pointsIn}</Text>
                </View>
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

            {courseReady ? (
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>
                  {side === 'front'
                    ? rows.reduce((s, p) => s + (p.netOut ?? 0), 0)
                    : rows.reduce((s, p) => s + (p.netIn ?? 0), 0)}
                </Text>
              </View>
            ) : null}
            {courseReady ? (
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
          {courseReady ? (
            <>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>NET TOTAL</Text>
                <Text style={styles.overallValue}>{netTotal}</Text>
              </View>
              <View style={styles.overallRow}>
                <Text style={styles.overallLabel}>POINTS TOTAL</Text>
                <Text style={styles.overallValue}>{rows.reduce((s, p) => s + (p.pointsTotal ?? 0), 0)}</Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function buildScorecardHtml(params: {
  courseName: string;
  courseReady: boolean;
  meta?: {
    competitionName?: string;
    competitionDate?: string;
    tee?: string;
    marker?: string;
  };
  players: {
    name: string;
    handicap: number;
    scores: (string | number)[];
    netsPerHole: (number | null)[];
    out: number;
    in_: number;
    total: number;
    netOut: number;
    netIn: number;
    netTotal: number;
    pointsOut: number;
    pointsIn: number;
    pointsTotal: number;
  }[];
  frontNineTotal: number;
  backNineTotal: number;
  roundTotal: number;
  netTotal: number;
}) {
  const front = Array.from({ length: 9 }, (_, i) => i + 1);
  const back = Array.from({ length: 9 }, (_, i) => i + 10);
  const { courseReady } = params;

  const renderCell = (gross: string, net?: string) => {
    const netLine = courseReady && net != null && net !== '' ? `<br><span class="net">${escapeHtml(net)}</span>` : '';
    return `<td>${escapeHtml(gross)}${netLine}</td>`;
  };

  const renderFrontTable = () => {
    const netHeader = courseReady ? `<th>NET OUT</th>` : '';
    const ptsHeader = courseReady ? `<th>PTS</th>` : '';

    return `
      <h2>Front 9</h2>
      <table>
        <thead>
          <tr>
            <th class="player">Player</th>
            <th>PH</th>
            ${front.map((h) => `<th>${h}</th>`).join('')}
            <th>OUT</th>
            ${netHeader}
            ${ptsHeader}
          </tr>
        </thead>
        <tbody>
          ${params.players
            .map((p) => {
              const holeCells = front
                .map((h) => {
                  const i = h - 1;
                  const g = String(p.scores[i] ?? '');
                  const n = p.netsPerHole[i] != null ? String(p.netsPerHole[i]) : '';
                  return renderCell(g, n);
                })
                .join('');

              const netOutCell = courseReady ? `<td class="tot">${p.netOut}</td>` : '';
              const ptsCell = courseReady ? `<td class="tot">${p.pointsOut}</td>` : '';
              return `
                <tr>
                  <td class="player">
                    ${escapeHtml(p.name)} <span class="hcp-inline">(${p.handicap})</span>
                  </td>
                  <td>${p.handicap}</td>
                  ${holeCells}
                  <td class="tot">${p.out}</td>
                  ${netOutCell}
                  ${ptsCell}
                </tr>
              `;
            })
            .join('')}

          <tr class="totals-row">
            <td class="player tot">Totals</td>
            <td></td>
            ${front.map(() => `<td></td>`).join('')}
            <td class="tot">${params.frontNineTotal}</td>
            ${courseReady ? `<td class="tot">${params.players.reduce((s, p) => s + (p.netOut ?? 0), 0)}</td>` : ''}
            ${courseReady ? `<td class="tot">${params.players.reduce((s, p) => s + (p.pointsOut ?? 0), 0)}</td>` : ''}
          </tr>
        </tbody>
      </table>
    `;
  };

  const renderBackTable = () => {
    const netHeader = courseReady ? `<th>NET IN</th>` : '';
    const ptsHeader = courseReady ? `<th>PTS</th>` : '';

    return `
      <h2>Back 9</h2>
      <table>
        <thead>
          <tr>
            <th class="player">Player</th>
            <th>PH</th>
            ${back.map((h) => `<th>${h}</th>`).join('')}
            <th>IN</th>
            ${netHeader}
            ${ptsHeader}
          </tr>
        </thead>
        <tbody>
          ${params.players
            .map((p) => {
              const holeCells = back
                .map((h) => {
                  const i = h - 1;
                  const g = String(p.scores[i] ?? '');
                  const n = p.netsPerHole[i] != null ? String(p.netsPerHole[i]) : '';
                  return renderCell(g, n);
                })
                .join('');

              const netInCell = courseReady ? `<td class="tot">${p.netIn}</td>` : '';
              const ptsCell = courseReady ? `<td class="tot">${p.pointsIn}</td>` : '';
              return `
                <tr>
                  <td class="player">
                    ${escapeHtml(p.name)} <span class="hcp-inline">(${p.handicap})</span>
                  </td>
                  <td>${p.handicap}</td>
                  ${holeCells}
                  <td class="tot">${p.in_}</td>
                  ${netInCell}
                  ${ptsCell}
                </tr>
              `;
            })
            .join('')}

          <tr class="totals-row">
            <td class="player tot">Totals</td>
            <td></td>
            ${back.map(() => `<td></td>`).join('')}
            <td class="tot">${params.backNineTotal}</td>
            ${courseReady ? `<td class="tot">${params.players.reduce((s, p) => s + (p.netIn ?? 0), 0)}</td>` : ''}
            ${courseReady ? `<td class="tot">${params.players.reduce((s, p) => s + (p.pointsIn ?? 0), 0)}</td>` : ''}
          </tr>
        </tbody>
      </table>
    `;
  };

  const renderOverallTotals = () => {
    const netBlock = courseReady
      ? `<div class="totalsline"><span class="label">NET TOTAL</span><span class="value">${params.netTotal}</span></div>`
      : '';
    const ptsBlock = courseReady
      ? `<div class="totalsline"><span class="label">POINTS TOTAL</span><span class="value">${params.players.reduce((s, p) => s + (p.pointsTotal ?? 0), 0)}</span></div>`
      : '';

    return `
      <div class="overall">
        <div class="totalsline"><span class="label">GROSS TOTAL</span><span class="value">${params.roundTotal}</span></div>
        ${netBlock}
        ${ptsBlock}
      </div>
    `;
  };

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Scorecard</title>
<style>
  /* Force background colours to render in PDF/print (WebKit/Expo Print) */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  html, body {
    background: #ffffff;
  }
  @page {
    size: A4 landscape;
    margin: 12mm;
  }

  :root {
    --primary: ${colors.primary};
    --primarySoft: ${colors.primarySoft};
    --card: ${colors.card};
    --muted: ${colors.textSecondary};
  }

  body { font-family: Arial, sans-serif; padding: 16px; color: #000; position: relative; }

  body::before {
    content: "NetParGolf";
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-20deg);
    font-size: 80px;
    font-weight: 900;
    color: rgba(0, 0, 0, 0.05);
    white-space: nowrap;
    pointer-events: none;
    z-index: 0;
  }
  .content {
    position: relative;
    z-index: 1;
  }
  /* Top-right watermark anchored to printable area */
  body::after {
    content: "${params.courseName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";
    position: absolute;
    top: 4mm;
    right: 12mm;
    font-size: 20px;
    font-weight: 900;
    color: rgba(0, 0, 0, 0.05);
    text-transform: uppercase;
    letter-spacing: 2px;
    white-space: nowrap;
    pointer-events: none;
  }
  h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 900; color: var(--primary); }
  .sub { margin: 0 0 10px 0; font-size: 12px; }
  h2 { margin: 16px 0 6px 0; font-size: 14px; font-weight: 900; color: var(--primary); border-bottom: 2px solid var(--primarySoft); padding-bottom: 4px; }

  table { border-collapse: collapse; width: 100%; table-layout: fixed; margin-bottom: 14px; border: 2px solid var(--primary); }
  th, td { border: 1px solid #222; padding: 5px 3px; text-align: center; font-size: 11px; }
  th { background: var(--primarySoft) !important; color: var(--primary) !important; font-weight: 900; }
  .player {
    text-align: left;
    font-weight: 700;
    width: 130px;
    background: var(--card) !important;
    white-space: nowrap;
  }
  .hcp-inline { font-size: 10px; color: var(--muted); font-weight: 800; }
  .comp {
    margin: 10px 0 14px 0;
    padding: 0;
    border: 1.5px solid var(--primary);
    border-radius: 10px;
    overflow: hidden;
  }
  .comp-row {
    display: flex;
    border-bottom: 1px solid #ddd;
  }
  .comp-row:last-child {
    border-bottom: none;
  }
  .comp-label {
    width: 120px;
    padding: 8px 10px;
    font-weight: 900;
    color: var(--primary);
    background: var(--primarySoft);
    border-right: 2px solid var(--primary);
  }
  .comp-value {
    flex: 1;
    padding: 8px 12px;
  }
  .tot { font-weight: 800; }
  td.tot { background: #f8f8f8 !important; }
  .net { font-size: 9px; color: #555; }

  /* Zebra striping (tbody only) */
  tbody tr:nth-child(even):not(.totals-row) td {
    background: #fafafa !important;
  }
  tbody tr:nth-child(odd):not(.totals-row) td {
    background: #ffffff !important;
  }
  /* Keep totals row dominant */
  tr.totals-row td {
    background: var(--primarySoft) !important;
  }
  .totals-row { border-top: 2px solid var(--primary); }
  .overall {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 2px solid var(--primary);
  }
  .totalsline {
    display: flex;
    justify-content: space-between;
    font-weight: 900;
    font-size: 14px;
  }
  .label { margin-right: 12px; }
  .value { min-width: 60px; text-align: right; }

  .footer {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 2px solid var(--primary);
    font-size: 10px;
    color: #555;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="content">
    <h1>Scorecard</h1>
    <p class="sub">${escapeHtml(params.courseName)}</p>

    <div class="comp">
      <div class="comp-row">
        <div class="comp-label">Competition</div>
        <div class="comp-value">${escapeHtml(params.meta?.competitionName ?? '—')}</div>
      </div>
      <div class="comp-row">
        <div class="comp-label">Date</div>
        <div class="comp-value">${escapeHtml(params.meta?.competitionDate ?? '—')}</div>
      </div>
      <div class="comp-row">
        <div class="comp-label">Tee</div>
        <div class="comp-value">${escapeHtml(params.meta?.tee ?? '—')}</div>
      </div>
      <div class="comp-row">
        <div class="comp-label">Marker</div>
        <div class="comp-value">${escapeHtml(params.meta?.marker ?? '—')}</div>
      </div>
    </div>

    ${renderFrontTable()}
    ${renderBackTable()}
    ${renderOverallTotals()}

    <div class="footer">
      <div>NetParGolf</div>
      <div>Generated ${new Date().toLocaleString()}</div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

const styles = StyleSheet.create({
  // Header controls only — theme colours
  screen: { flex: 1, backgroundColor: colors.background, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: colors.primary },
  subTitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '800' },
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
