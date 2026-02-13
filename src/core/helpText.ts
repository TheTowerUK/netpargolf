// src/core/helpText.ts
// Optional: strings for the Help / Practice screen so the breakdown reads well.

export function formatAllowance(p: number): string {
  const pct = Math.round(p * 100);
  return `${pct}%`;
}

export function explainStrokesReceived(adjustedHandicap: number, strokeIndex: number, strokes: number): string {
  if (strokes <= 0) return `No stroke on SI ${strokeIndex} because adjusted handicap (${adjustedHandicap}) is below ${strokeIndex}.`;
  if (strokes === 1) return `1 stroke on SI ${strokeIndex} because adjusted handicap (${adjustedHandicap}) is ≥ ${strokeIndex}.`;
  return `${strokes} strokes on SI ${strokeIndex} because adjusted handicap (${adjustedHandicap}) is high enough to wrap past 18 (adds extra strokes every +18).`;
}

export function explainPoints(net: number, par: number, points: number): string {
  const diff = net - par;
  if (diff <= -2) return `${points} points: net ${net} is ${Math.abs(diff)} under par (${par}).`;
  if (diff === -1) return `${points} points: net ${net} is 1 under par (${par}).`;
  if (diff === 0) return `${points} points: net ${net} equals par (${par}).`;
  if (diff === 1) return `${points} points: net ${net} is 1 over par (${par}).`;
  return `${points} points: net ${net} is ${diff} over par (${par}).`;
}
