import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundingMode } from './roundStorage';

const CHECKER_DRAFT_KEY = '@netpargolf/competition-handicap-checker-draft:v1';
const LEGACY_CHECKER_DRAFT_KEY = '@netpargolf/competition-handicap-checker:v1';

export type CheckerPlayerDraft = {
  id: string;
  name: string;
  handicapIndexText: string;
};

export type CompetitionCheckerDraft = {
  courseName: string;
  teeName: string;
  courseRating: string;
  slopeRating: string;
  par: string;
  allowancePercent: number;
  roundingMode: RoundingMode;
  teamAName: string;
  teamBName: string;
  teamA: CheckerPlayerDraft[];
  teamB: CheckerPlayerDraft[];
  updatedAt: string;
};

function defaultTeam(prefix: 'A' | 'B'): CheckerPlayerDraft[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: '',
    handicapIndexText: '',
  }));
}

export function makeEmptyCheckerDraft(): CompetitionCheckerDraft {
  return {
    courseName: '',
    teeName: '',
    courseRating: '',
    slopeRating: '',
    par: '',
    allowancePercent: 100,
    roundingMode: 'round',
    teamAName: '',
    teamBName: '',
    teamA: defaultTeam('A'),
    teamB: defaultTeam('B'),
    updatedAt: '',
  };
}

function normaliseRoundingMode(value: unknown): RoundingMode {
  return value === 'floor' || value === 'ceil' ? value : 'round';
}

function normaliseAllowancePercent(raw: Record<string, unknown>): number {
  if (typeof raw.allowancePercent === 'number' && Number.isFinite(raw.allowancePercent)) {
    return raw.allowancePercent;
  }
  if (raw.useCustomAllowance === true) {
    const custom = Number(String(raw.allowanceCustomText ?? '').replace(',', '.').trim());
    if (Number.isFinite(custom)) return custom;
  }
  if (typeof raw.allowancePreset === 'number' && Number.isFinite(raw.allowancePreset)) {
    return raw.allowancePreset;
  }
  return 100;
}

function normalisePlayer(raw: unknown, fallbackId: string): CheckerPlayerDraft {
  if (!raw || typeof raw !== 'object') {
    return { id: fallbackId, name: '', handicapIndexText: '' };
  }
  const p = raw as Record<string, unknown>;
  return {
    id: typeof p.id === 'string' && p.id ? p.id : fallbackId,
    name: typeof p.name === 'string' ? p.name : '',
    handicapIndexText:
      typeof p.handicapIndexText === 'string' ? p.handicapIndexText : '',
  };
}

function normaliseTeam(raw: unknown, prefix: 'A' | 'B'): CheckerPlayerDraft[] {
  if (!Array.isArray(raw) || raw.length !== 12) return defaultTeam(prefix);
  return raw.map((p, i) => normalisePlayer(p, `${prefix}-${i + 1}`));
}

function normaliseDraft(raw: unknown): CompetitionCheckerDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  return {
    courseName: typeof d.courseName === 'string' ? d.courseName : '',
    teeName: typeof d.teeName === 'string' ? d.teeName : '',
    courseRating: typeof d.courseRating === 'string' ? d.courseRating : '',
    slopeRating: typeof d.slopeRating === 'string' ? d.slopeRating : '',
    par: typeof d.par === 'string' ? d.par : '',
    allowancePercent: normaliseAllowancePercent(d),
    roundingMode: normaliseRoundingMode(d.roundingMode),
    teamAName: typeof d.teamAName === 'string' ? d.teamAName : '',
    teamBName: typeof d.teamBName === 'string' ? d.teamBName : '',
    teamA: normaliseTeam(d.teamA, 'A'),
    teamB: normaliseTeam(d.teamB, 'B'),
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : '',
  };
}

async function readDraftFromKey(key: string): Promise<CompetitionCheckerDraft | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return normaliseDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadCompetitionCheckerDraft(): Promise<CompetitionCheckerDraft | null> {
  const current = await readDraftFromKey(CHECKER_DRAFT_KEY);
  if (current) return current;

  const legacy = await readDraftFromKey(LEGACY_CHECKER_DRAFT_KEY);
  if (!legacy) return null;

  await saveCompetitionCheckerDraft(legacy);
  await AsyncStorage.removeItem(LEGACY_CHECKER_DRAFT_KEY);
  return legacy;
}

export async function saveCompetitionCheckerDraft(
  draft: Omit<CompetitionCheckerDraft, 'updatedAt'> & { updatedAt?: string }
): Promise<CompetitionCheckerDraft> {
  const payload: CompetitionCheckerDraft = {
    courseName: draft.courseName,
    teeName: draft.teeName,
    courseRating: draft.courseRating,
    slopeRating: draft.slopeRating,
    par: draft.par,
    allowancePercent:
      typeof draft.allowancePercent === 'number' && Number.isFinite(draft.allowancePercent)
        ? draft.allowancePercent
        : 100,
    roundingMode: normaliseRoundingMode(draft.roundingMode),
    teamAName: typeof draft.teamAName === 'string' ? draft.teamAName : '',
    teamBName: typeof draft.teamBName === 'string' ? draft.teamBName : '',
    teamA: draft.teamA.length === 12 ? draft.teamA : defaultTeam('A'),
    teamB: draft.teamB.length === 12 ? draft.teamB : defaultTeam('B'),
    updatedAt: draft.updatedAt ?? new Date().toISOString(),
  };
  await AsyncStorage.setItem(CHECKER_DRAFT_KEY, JSON.stringify(payload));
  return payload;
}

export async function clearCompetitionCheckerDraft(): Promise<void> {
  await AsyncStorage.multiRemove([CHECKER_DRAFT_KEY, LEGACY_CHECKER_DRAFT_KEY]);
}

export function formatCompetitionCheckerDraftSavedAt(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
