// src/screens/ScorecardScreen.tsx
// Printable scorecard - uses round + course from storage (same as Live Scoring).
// Net scores computed dynamically from gross + handicap + stroke index (not persisted).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Course } from '../core/course';
import { loadCourse } from '../storage/courseStorage';
import { loadRound, type PersistedRoundV1 } from '../storage/roundStorage';
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
  scores: (string | number)[];
  out: number;
  in_: number;
  total: number;
  netOut: number;
  netIn: number;
  netTotal: number;
  strokesPerHole: number[];
  netsPerHole: (number | null)[];
};

export default function ScorecardScreen() {
  const [course, setCourse] = useState<Course | null>(null);
  const [round, setRound] = useState<PersistedRoundV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [handicap, setHandicap] = useState<string>('18');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([loadCourse(), loadRound()]);
      setCourse(c);
      setRound(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const courseReady = !!course && Array.isArray(course.holes) && course.holes.length === 18;

  const rows: Row[] = useMemo(() => {
    const players = round?.players ?? [];
    const holes = round?.holes ?? {};
    const courseHoles = course?.holes ?? [];

    const defaultHcp = parseInt(handicap, 10) || 0;

    return players.slice(0, 4).map((p) => {
      const hcpVal = parseInt(p.courseHandicap, 10);
      const handicapNum = Number.isFinite(hcpVal) ? hcpVal : defaultHcp;

      const scores = HOLES.map((h) => {
        const v = holes?.[h]?.grossByPlayer?.[p.id];
        const n = parseInt(v ?? '', 10);
        return Number.isFinite(n) ? n : '';
      });

      let netsPerHole: (number | null)[];
      let netOut: number;
      let netIn: number;
      let netTotal: number;

      if (courseReady && courseHoles.length === 18) {
        const strokesPerHole = HOLES.map((h) => {
          const holeData = courseHoles[h - 1];
          const si = holeData?.strokeIndex;
          if (si == null || !Number.isFinite(si)) return 0;
          return strokesReceivedOnHole(handicapNum, si);
        });

        netsPerHole = scores.map((gross, i) => {
          if (typeof gross !== 'number') return null;
          const strokes = strokesPerHole[i];
          return gross - strokes;
        });

        netOut = netsPerHole.slice(0, 9).reduce((a, v) => a + (v ?? 0), 0);
        netIn = netsPerHole.slice(9, 18).reduce((a, v) => a + (v ?? 0), 0);
        netTotal = netOut + netIn;
      } else {
        netsPerHole = scores.map(() => null);
        netOut = 0;
        netIn = 0;
        netTotal = 0;
      }

      const out = scores.slice(0, 9).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);
      const in_ = scores.slice(9, 18).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0);
      const total = out + in_;

      return {
        id: p.id,
        name: p.name,
        courseHandicap: handicapNum,
        scores,
        out,
        in_,
        total,
        netOut,
        netIn,
        netTotal,
        strokesPerHole: [],
        netsPerHole,
      };
    });
  }, [round, course, handicap, courseReady]);

  const courseName = course?.name ?? 'No course selected';

  const frontNineTotal = rows.reduce((sum, r) => sum + r.out, 0);
  const backNineTotal = rows.reduce((sum, r) => sum + r.in_, 0);
  const roundTotal = frontNineTotal + backNineTotal;
  const netTotal = rows.reduce((sum, r) => sum + r.netTotal, 0);

  const onPrintOrExport = async () => {
    const html = buildScorecardHtml({
      courseName,
      courseReady,
      players: rows.map((r) => ({
        name: r.name,
        scores: r.scores,
        netsPerHole: r.netsPerHole,
        out: r.out,
        in_: r.in_,
        total: r.total,
        netOut: r.netOut,
        netIn: r.netIn,
        netTotal: r.netTotal,
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

          <View style={styles.handicapRow}>
            <Text style={styles.handicapLabel}>Handicap</Text>
            <TextInput
              style={styles.handicapInput}
              value={handicap}
              onChangeText={setHandicap}
              keyboardType="number-pad"
              placeholder="18"
              placeholderTextColor="#999"
            />
          </View>
          <Text style={styles.meta}>
            {round?.savedAt ? `Last saved: ${new Date(round.savedAt).toLocaleString()}` : 'No round saved yet'}
          </Text>
          {!courseReady && (course || round) ? (
            <Text style={styles.courseNote}>
              Course not set — scorecard will still show gross scores.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Pressable style={styles.btn} onPress={refresh}>
            <Text style={styles.btnText}>Refresh</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onPrintOrExport} disabled={!hasData}>
            <Text style={[styles.btnText, styles.btnPrimaryText]}>
              {Platform.OS === 'web' ? 'Print' : 'Export PDF'}
            </Text>
          </Pressable>
        </View>
      </View>

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

            {HOLES.map((h) => (
              <View key={h} style={[styles.cell, styles.holeCell]}>
                <Text style={styles.headerText}>{h}</Text>
              </View>
            ))}

            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.headerText}>OUT</Text>
            </View>
            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.headerText}>IN</Text>
            </View>
            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.headerText}>TOTAL</Text>
            </View>
            {courseReady ? (
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.headerText}>NET</Text>
              </View>
            ) : null}
          </View>

          {rows.map((r, idx) => (
            <View key={r.id} style={[styles.row, idx % 2 === 1 ? styles.altRow : null]}>
              <View style={[styles.cell, styles.playerCell]}>
                <Text style={styles.playerText}>{r.name}</Text>
              </View>

              {r.scores.map((v, i) => (
                <View key={i} style={[styles.cell, styles.holeCell]}>
                  <Text style={styles.scoreText}>{typeof v === 'number' ? String(v) : ''}</Text>
                  {courseReady && typeof v === 'number' && r.netsPerHole[i] != null ? (
                    <Text style={styles.netSubtext}>{r.netsPerHole[i]}</Text>
                  ) : null}
                </View>
              ))}

              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>{r.out}</Text>
              </View>
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>{r.in_}</Text>
              </View>
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>{r.total}</Text>
              </View>
              {courseReady ? (
                <View style={[styles.cell, styles.totalCell]}>
                  <Text style={styles.totalText}>{r.netTotal}</Text>
                </View>
              ) : null}
            </View>
          ))}

          <View style={[styles.row, styles.totalsRow]}>
            <View style={[styles.cell, styles.playerCell]}>
              <Text style={styles.totalsLabel}>Totals</Text>
            </View>

            {HOLES.map((h) => (
              <View key={h} style={[styles.cell, styles.holeCell]} />
            ))}

            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.totalText}>{frontNineTotal}</Text>
            </View>
            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.totalText}>{backNineTotal}</Text>
            </View>
            <View style={[styles.cell, styles.totalCell]}>
              <Text style={styles.totalText}>{roundTotal}</Text>
            </View>
            {courseReady ? (
              <View style={[styles.cell, styles.totalCell]}>
                <Text style={styles.totalText}>{netTotal}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function buildScorecardHtml(params: {
  courseName: string;
  courseReady: boolean;
  players: { name: string; scores: (string | number)[]; netsPerHole: (number | null)[]; out: number; in_: number; total: number; netOut: number; netIn: number; netTotal: number }[];
  frontNineTotal: number;
  backNineTotal: number;
  roundTotal: number;
  netTotal: number;
}) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const { courseReady } = params;

  const netHeader = courseReady ? '<th>NET</th>' : '';
  const netCell = (p: { netTotal: number }) => courseReady ? `<td class="tot">${p.netTotal}</td>` : '';
  const netTotalsCell = courseReady ? `<td class="tot">${params.netTotal}</td>` : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Scorecard</title>
<style>
  body { font-family: Arial, sans-serif; padding: 18px; color: #000; }
  h1 { margin: 0 0 4px 0; font-size: 22px; }
  .sub { margin: 0 0 14px 0; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 6px 4px; text-align: center; font-size: 12px; }
  th:first-child, td:first-child { text-align: left; font-weight: 700; width: 140px; }
  th { background: #f2f2f2; }
  .tot { font-weight: 800; }
  .net { font-size: 10px; color: #555; }
  .totals-row { background: #f2f2f2; border-top: 2px solid #111; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Scorecard</h1>
  <p class="sub">${escapeHtml(params.courseName)}</p>

  <table>
    <thead>
      <tr>
        <th>Player</th>
        ${holes.map((h) => `<th>${h}</th>`).join('')}
        <th>OUT</th><th>IN</th><th>TOTAL</th>${netHeader}
      </tr>
    </thead>
    <tbody>
      ${params.players
        .map(
          (p) => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          ${p.scores.map((v, i) => {
            const gross = escapeHtml(String(v ?? ''));
            const net = courseReady && p.netsPerHole[i] != null ? `<br><span class="net">${p.netsPerHole[i]}</span>` : '';
            return `<td>${gross}${net}</td>`;
          }).join('')}
          <td class="tot">${p.out}</td>
          <td class="tot">${p.in_}</td>
          <td class="tot">${p.total}</td>
          ${netCell(p)}
        </tr>
      `
        )
        .join('')}
      <tr class="totals-row">
        <td class="tot" style="text-align:left; font-weight:700;">Totals</td>
        ${holes.map(() => '<td></td>').join('')}
        <td class="tot">${params.frontNineTotal}</td>
        <td class="tot">${params.backNineTotal}</td>
        <td class="tot">${params.roundTotal}</td>
        ${netTotalsCell}
      </tr>
    </tbody>
  </table>
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

  btn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primarySoft },
  btnText: { fontWeight: '900', color: colors.textPrimary, fontSize: 12 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.textInverse },

  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 12, backgroundColor: colors.card },
  emptyTitle: { fontWeight: '900', marginBottom: 6, color: colors.textPrimary },
  emptyText: { color: colors.textSecondary, lineHeight: 18, fontSize: 13 },

  // Table — strictly black/white, no theme
  table: { borderWidth: 1, borderColor: '#111' },
  row: { flexDirection: 'row' },
  headerRow: { backgroundColor: '#f2f2f2' },
  altRow: { backgroundColor: '#fafafa' },

  cell: { borderRightWidth: 1, borderRightColor: '#111', borderBottomWidth: 1, borderBottomColor: '#111', paddingVertical: 8, paddingHorizontal: 6, justifyContent: 'center' },
  playerCell: { width: 140 },
  holeCell: { width: 44, alignItems: 'center' },
  totalCell: { width: 60, alignItems: 'center' },

  headerText: { fontWeight: '900', fontSize: 12 },
  playerText: { fontWeight: '900', fontSize: 12 },
  scoreText: { fontSize: 12 },
  netSubtext: { fontSize: 10, color: '#555', marginTop: 2 },
  totalText: { fontWeight: '900', fontSize: 12 },

  handicapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  handicapLabel: { fontSize: 12, fontWeight: '900', color: colors.textPrimary },
  handicapInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: 56,
    fontSize: 16,
    fontWeight: '900',
  },

  totalsRow: {
    borderTopWidth: 2,
    borderTopColor: '#111',
    backgroundColor: '#f2f2f2',
    paddingVertical: 8,
    flexDirection: 'row',
  },
  totalsLabel: { fontWeight: 'bold' },
});
