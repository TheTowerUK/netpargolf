import type { Course } from '../course';
import type { PersistedRound } from '../../storage/roundStorage';
import type { RoundCompetition } from '../../types/competition';
import { getFourballSideRosterLines } from './matchplayDisplay';
import {
  buildBetterballStablefordScorecardSummary,
  buildFourballMatchplayScorecardSummary,
  buildIndividualStablefordScorecardSummary,
  buildScorecardDateLabel,
  buildScorecardTeeLine,
  buildSinglesMatchplayScorecardSummary,
  formatScorecardCompetitionLabel,
  getBetterballStablefordCountingPointsByHole,
  getFourballMatchplayHoleColumns,
  getSinglesMatchplayHoleColumn,
  type ScorecardPlayerRowData,
} from './scorecardDisplay';

export type ScorecardThemeColors = {
  primary: string;
  primarySoft: string;
  card: string;
  textSecondary: string;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderCell(courseReady: boolean, gross: string, net?: string | null): string {
  const netLine =
    courseReady && net != null && net !== ''
      ? `<br><span class="net">${escapeHtml(net)}</span>`
      : '';
  return `<td>${escapeHtml(gross)}${netLine}</td>`;
}

type NineTableOpts = {
  courseReady: boolean;
  showNet: boolean;
  showPoints: boolean;
  extraRows?: { label: string; cells: string[] }[];
};

function renderNineTable(
  title: string,
  holeNumbers: number[],
  rows: ScorecardPlayerRowData[],
  opts: NineTableOpts
): string {
  const { courseReady, showNet, showPoints, extraRows } = opts;
  const netHeader = courseReady && showNet ? `<th>NET ${title.includes('Front') ? 'OUT' : 'IN'}</th>` : '';
  const ptsHeader = courseReady && showPoints ? `<th>PTS</th>` : '';

  const bodyPlayers = rows
    .map((p) => {
      const holeCells = holeNumbers
        .map((h) => {
          const i = h - 1;
          const g = p.scores[i];
          const gross = typeof g === 'number' ? String(g) : g;
          const n = showNet && courseReady && p.netsPerHole[i] != null ? String(p.netsPerHole[i]) : '';
          return renderCell(courseReady && showNet, gross, n || undefined);
        })
        .join('');

      const halfGross = title.includes('Front') ? p.out : p.in_;
      const netHalf = title.includes('Front') ? p.netOut : p.netIn;
      const ptsHalf = title.includes('Front') ? p.pointsOut : p.pointsIn;

      const netCell =
        courseReady && showNet ? `<td class="tot">${netHalf}</td>` : '';
      const ptsCell =
        courseReady && showPoints ? `<td class="tot">${ptsHalf}</td>` : '';

      return `
        <tr>
          <td class="player">
            ${escapeHtml(p.name)}${p.isNonReturn ? ' <span class="hcp-inline">(NR)</span>' : ''} <span class="hcp-inline">(${p.playingHandicap})</span>
          </td>
          <td>${p.playingHandicap}</td>
          ${holeCells}
          <td class="tot">${halfGross}</td>
          ${netCell}
          ${ptsCell}
        </tr>`;
    })
    .join('');

  const extraBody =
    extraRows?.map((er) => {
      const cells = er.cells.map((c) => `<td class="extra">${escapeHtml(c)}</td>`).join('');
      const spanNet = courseReady && showNet ? `<td class="extra"></td>` : '';
      const spanPts = courseReady && showPoints ? `<td class="extra"></td>` : '';
      return `<tr class="extra-row"><td class="player extra" colspan="2">${escapeHtml(er.label)}</td>${cells}<td class="extra"></td>${spanNet}${spanPts}</tr>`;
    }).join('') ?? '';

  const sumGross = rows.reduce(
    (s, p) => s + (title.includes('Front') ? p.out : p.in_),
    0
  );
  const sumNet = rows.reduce(
    (s, p) => s + (title.includes('Front') ? p.netOut : p.netIn),
    0
  );
  const sumPts = rows.reduce(
    (s, p) => s + (title.includes('Front') ? p.pointsOut : p.pointsIn),
    0
  );

  const totalsNet =
    courseReady && showNet ? `<td class="tot">${sumNet}</td>` : '';
  const totalsPts =
    courseReady && showPoints ? `<td class="tot">${sumPts}</td>` : '';

  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th class="player">Player</th>
          <th>PH</th>
          ${holeNumbers.map((h) => `<th>${h}</th>`).join('')}
          <th>${title.includes('Front') ? 'OUT' : 'IN'}</th>
          ${netHeader}
          ${ptsHeader}
        </tr>
      </thead>
      <tbody>
        ${bodyPlayers}
        ${extraBody}
        <tr class="totals-row">
          <td class="player tot">Totals</td>
          <td></td>
          ${holeNumbers.map(() => `<td></td>`).join('')}
          <td class="tot">${sumGross}</td>
          ${totalsNet}
          ${totalsPts}
        </tr>
      </tbody>
    </table>`;
}

function buildSummaryHtml(title: string, subtitle: string, lines: string[]): string {
  const ul = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
  return `
    <div class="summary-block">
      <h3>Result</h3>
      <p class="summary-title">${escapeHtml(title)}</p>
      ${subtitle ? `<p class="summary-sub">${escapeHtml(subtitle)}</p>` : ''}
      <ul class="summary-list">${ul}</ul>
    </div>`;
}

function rosterHtml(round: PersistedRound): string {
  if (round.players.length !== 4) return '';
  const r = getFourballSideRosterLines(round.players);
  return `
    <div class="roster-block">
      <p><strong>${escapeHtml(r.sideALine)}</strong></p>
      <p><strong>${escapeHtml(r.sideBLine)}</strong></p>
    </div>`;
}

export function buildCompetitionScorecardHtml(params: {
  courseName: string;
  courseReady: boolean;
  course: Course | null;
  round: PersistedRound;
  rows: ScorecardPlayerRowData[];
  theme: ScorecardThemeColors;
}): string {
  const { courseName, courseReady, course, round, rows, theme } = params;
  const comp = round.competition as RoundCompetition;

  const meta = {
    competitionLabel: formatScorecardCompetitionLabel(comp),
    date: buildScorecardDateLabel(round),
    tee: buildScorecardTeeLine(round),
    marker: '—',
  };

  const front = Array.from({ length: 9 }, (_, i) => i + 1);
  const back = Array.from({ length: 9 }, (_, i) => i + 10);

  let showNet = true;
  let showPoints = true;
  let extraFront: { label: string; cells: string[] }[] = [];
  let extraBack: { label: string; cells: string[] }[] = [];
  let summaryHtml = '';
  let formatSubtitle = '';
  let rosterBlock = '';

  switch (comp) {
    case 'individual_stableford': {
      formatSubtitle = 'Individual competition · Stableford points';
      const s = buildIndividualStablefordScorecardSummary(round, course, rows);
      summaryHtml = buildSummaryHtml(s.title, s.subtitle, s.lines);
      break;
    }
    case 'betterball_stableford': {
      formatSubtitle = 'Side-based competition · best Stableford points per hole per side';
      rosterBlock = rosterHtml(round);
      const counting = getBetterballStablefordCountingPointsByHole(round, course);
      extraFront = [
        {
          label: 'Side A best (pts)',
          cells: counting.sideA.slice(0, 9).map((v) => (v == null ? '—' : String(v))),
        },
        {
          label: 'Side B best (pts)',
          cells: counting.sideB.slice(0, 9).map((v) => (v == null ? '—' : String(v))),
        },
      ];
      extraBack = [
        {
          label: 'Side A best (pts)',
          cells: counting.sideA.slice(9, 18).map((v) => (v == null ? '—' : String(v))),
        },
        {
          label: 'Side B best (pts)',
          cells: counting.sideB.slice(9, 18).map((v) => (v == null ? '—' : String(v))),
        },
      ];
      const s = buildBetterballStablefordScorecardSummary(round, course);
      summaryHtml = buildSummaryHtml(s.title, s.subtitle, s.lines);
      break;
    }
    case 'singles_matchplay': {
      formatSubtitle = 'Head-to-head matchplay · lowest net wins each hole';
      showPoints = false;
      const cols = getSinglesMatchplayHoleColumn(round, course);
      extraFront = [
        {
          label: 'Hole result',
          cells: cols.slice(0, 9).map((c) => c.resultLabel),
        },
      ];
      extraBack = [
        {
          label: 'Hole result',
          cells: cols.slice(9, 18).map((c) => c.resultLabel),
        },
      ];
      const sm = buildSinglesMatchplayScorecardSummary(round, course);
      summaryHtml = buildSummaryHtml(sm.statusLine, '', sm.lines);
      break;
    }
    case 'fourball_betterball_matchplay': {
      formatSubtitle = 'Side vs side matchplay · best net ball per hole';
      showPoints = false;
      rosterBlock = rosterHtml(round);
      const fb = getFourballMatchplayHoleColumns(round, course);
      extraFront = [
        {
          label: 'Side A best net',
          cells: fb.bestNetA.slice(0, 9).map((v) => (v == null ? '—' : String(v))),
        },
        {
          label: 'Side B best net',
          cells: fb.bestNetB.slice(0, 9).map((v) => (v == null ? '—' : String(v))),
        },
        {
          label: 'Hole result',
          cells: fb.resultLabel.slice(0, 9),
        },
      ];
      extraBack = [
        {
          label: 'Side A best net',
          cells: fb.bestNetA.slice(9, 18).map((v) => (v == null ? '—' : String(v))),
        },
        {
          label: 'Side B best net',
          cells: fb.bestNetB.slice(9, 18).map((v) => (v == null ? '—' : String(v))),
        },
        {
          label: 'Hole result',
          cells: fb.resultLabel.slice(9, 18),
        },
      ];
      const fm = buildFourballMatchplayScorecardSummary(round, course);
      summaryHtml = buildSummaryHtml(fm.statusLine, '', fm.lines);
      break;
    }
    default: {
      formatSubtitle = 'Scorecard';
      summaryHtml = '';
    }
  }

  const frontTable = renderNineTable('Front 9', front, rows, {
    courseReady,
    showNet,
    showPoints,
    extraRows: extraFront.length ? extraFront : undefined,
  });
  const backTable = renderNineTable('Back 9', back, rows, {
    courseReady,
    showNet,
    showPoints,
    extraRows: extraBack.length ? extraBack : undefined,
  });

  const overallGross = rows.reduce((s, p) => s + p.total, 0);
  const overallNet = rows.reduce((s, p) => s + p.netTotal, 0);
  const overallPts = rows.reduce((s, p) => s + p.pointsTotal, 0);

  let overallHtml = `
    <div class="overall">
      <div class="totalsline"><span class="label">GROSS TOTAL</span><span class="value">${overallGross}</span></div>`;
  if (courseReady && showNet) {
    overallHtml += `<div class="totalsline"><span class="label">NET TOTAL (all players)</span><span class="value">${overallNet}</span></div>`;
  }
  if (courseReady && showPoints) {
    overallHtml += `<div class="totalsline"><span class="label">POINTS TOTAL (all players)</span><span class="value">${overallPts}</span></div>`;
  }
  overallHtml += `</div>`;

  const courseWatermark = courseName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Scorecard — ${escapeHtml(meta.competitionLabel)}</title>
<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #ffffff; }
  @page { size: A4 landscape; margin: 12mm; }
  :root {
    --primary: ${theme.primary};
    --primarySoft: ${theme.primarySoft};
    --card: ${theme.card};
    --muted: ${theme.textSecondary};
  }
  body { font-family: Arial, sans-serif; padding: 16px; color: #000; position: relative; }
  body::before {
    content: "NetParGolf";
    position: absolute; top: 40%; left: 50%;
    transform: translate(-50%, -50%) rotate(-20deg);
    font-size: 80px; font-weight: 900; color: rgba(0,0,0,0.05);
    pointer-events: none; z-index: 0;
  }
  .content { position: relative; z-index: 1; }
  body::after {
    content: "${courseWatermark}";
    position: absolute; top: 4mm; right: 12mm;
    font-size: 20px; font-weight: 900; color: rgba(0,0,0,0.05);
    text-transform: uppercase; letter-spacing: 2px; pointer-events: none;
  }
  h1 { margin: 0 0 4px 0; font-size: 22px; font-weight: 900; color: var(--primary); }
  .format-sub { margin: 0 0 10px 0; font-size: 12px; color: var(--muted); font-weight: 700; }
  .sub { margin: 0 0 10px 0; font-size: 12px; }
  h2 { margin: 16px 0 6px 0; font-size: 14px; font-weight: 900; color: var(--primary); border-bottom: 2px solid var(--primarySoft); padding-bottom: 4px; }
  h3 { margin: 0 0 6px 0; font-size: 13px; font-weight: 900; color: var(--primary); }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; margin-bottom: 14px; border: 2px solid var(--primary); }
  th, td { border: 1px solid #222; padding: 5px 3px; text-align: center; font-size: 10px; }
  th { background: var(--primarySoft) !important; color: var(--primary) !important; font-weight: 900; }
  .player { text-align: left; font-weight: 700; width: 120px; background: var(--card) !important; }
  .hcp-inline { font-size: 9px; color: var(--muted); font-weight: 800; }
  .comp { margin: 10px 0 14px 0; border: 1.5px solid var(--primary); border-radius: 10px; overflow: hidden; }
  .comp-row { display: flex; border-bottom: 1px solid #ddd; }
  .comp-row:last-child { border-bottom: none; }
  .comp-label { width: 110px; padding: 8px 10px; font-weight: 900; color: var(--primary); background: var(--primarySoft); border-right: 2px solid var(--primary); }
  .comp-value { flex: 1; padding: 8px 12px; }
  .tot { font-weight: 800; }
  td.tot { background: #f8f8f8 !important; }
  .net { font-size: 9px; color: #555; }
  tr.extra-row td.extra { background: #f0f7f4 !important; font-size: 9px; font-weight: 700; }
  tbody tr:nth-child(even):not(.totals-row):not(.extra-row) td { background: #fafafa !important; }
  tbody tr:nth-child(odd):not(.totals-row):not(.extra-row) td { background: #ffffff !important; }
  tr.totals-row td { background: var(--primarySoft) !important; }
  .totals-row { border-top: 2px solid var(--primary); }
  .summary-block { margin: 12px 0; padding: 12px; border: 1px solid var(--primary); border-radius: 10px; background: #fafafa; }
  .summary-title { font-size: 15px; font-weight: 900; margin: 0 0 4px 0; color: var(--primary); }
  .summary-sub { margin: 0 0 8px 0; font-size: 12px; }
  .summary-list { margin: 0; padding-left: 18px; font-size: 11px; }
  .roster-block { margin: 8px 0 12px 0; padding: 10px; background: var(--primarySoft); border-radius: 8px; font-size: 12px; }
  .overall { margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--primary); }
  .totalsline { display: flex; justify-content: space-between; font-weight: 900; font-size: 13px; margin-bottom: 4px; }
  .footer { margin-top: 18px; padding-top: 8px; border-top: 2px solid var(--primary); font-size: 10px; color: #555; display: flex; justify-content: space-between; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="content">
    <h1>Scorecard · ${escapeHtml(meta.competitionLabel)}</h1>
    <p class="format-sub">${escapeHtml(formatSubtitle)}</p>
    <p class="sub">${escapeHtml(courseName)}</p>

    <div class="comp">
      <div class="comp-row"><div class="comp-label">Competition</div><div class="comp-value">${escapeHtml(meta.competitionLabel)}</div></div>
      <div class="comp-row"><div class="comp-label">Date</div><div class="comp-value">${escapeHtml(meta.date)}</div></div>
      <div class="comp-row"><div class="comp-label">Tee</div><div class="comp-value">${escapeHtml(meta.tee)}</div></div>
      <div class="comp-row"><div class="comp-label">Marker</div><div class="comp-value">${escapeHtml(meta.marker)}</div></div>
    </div>

    ${rosterBlock}
    ${summaryHtml}

    ${frontTable}
    ${backTable}
    ${overallHtml}

    <div class="footer">
      <div>NetParGolf</div>
      <div>Generated ${escapeHtml(new Date().toLocaleString())}</div>
    </div>
  </div>
</body>
</html>`;
}
