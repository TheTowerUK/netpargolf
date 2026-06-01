import type { Course, CourseHole, CourseTee } from '../core/course';

type ImportedHole = {
  holeNumber?: unknown;
  par?: unknown;
  strokeIndex?: unknown;
  yards?: unknown;
};

type ImportedTee = {
  teeName?: unknown;
  gender?: unknown;
  courseRating?: unknown;
  slopeRating?: unknown;
  par?: unknown;
  holes?: unknown;
};

type ImportedCoursePayload = {
  schema?: unknown;
  version?: unknown;
  course?: {
    id?: unknown;
    clubName?: unknown;
    courseName?: unknown;
    location?: unknown;
    tees?: unknown;
  };
};

export type ImportedCourseResult = {
  course: Course;
  warnings: string[];
  sourceName: string;
};

/** Human-readable preview shown before confirming import. */
export function buildCourseImportPreviewMessage(imported: ImportedCourseResult): string {
  const { course, warnings } = imported;
  const lines: string[] = [];

  const title =
    course.clubName && course.clubName.trim() !== course.name.trim()
      ? `${course.clubName} — ${course.name}`
      : course.name;
  lines.push(`Course: ${title}`);

  if (course.location?.trim()) {
    lines.push(`Location: ${course.location.trim()}`);
  }

  const tees = course.tees ?? [];
  lines.push(`Tees: ${tees.length}`);

  for (const tee of tees) {
    lines.push(
      `• ${tee.name}: CR ${tee.courseRating} · Slope ${tee.slopeRating} · Par ${tee.par}`
    );
  }

  if (warnings.length) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of warnings) {
      lines.push(`• ${w}`);
    }
  }

  return lines.join('\n');
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeHole(raw: ImportedHole): CourseHole | null {
  const holeNumber = asNumber(raw.holeNumber);
  const par = asNumber(raw.par);
  const strokeIndex = asNumber(raw.strokeIndex);
  if (holeNumber == null || par == null || strokeIndex == null) return null;
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) return null;
  if (![3, 4, 5].includes(par)) return null;
  if (!Number.isInteger(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return null;
  const yards = asNumber(raw.yards);
  return {
    holeNumber,
    par,
    strokeIndex,
    ...(yards != null && yards > 0 ? { yards: Math.round(yards) } : {}),
  };
}

function normalizeTee(raw: ImportedTee): { tee: CourseTee; warnings: string[] } | null {
  const teeNameRaw = asString(raw.teeName);
  const courseRating = asNumber(raw.courseRating);
  const slopeRating = asNumber(raw.slopeRating);
  const teePar = asNumber(raw.par);
  if (!teeNameRaw || courseRating == null || slopeRating == null || teePar == null) return null;
  if (courseRating <= 0 || slopeRating < 55 || slopeRating > 155) return null;
  if (!Number.isInteger(teePar) || teePar < 54 || teePar > 90) return null;

  const holesRaw = Array.isArray(raw.holes) ? raw.holes : null;
  if (!holesRaw || holesRaw.length !== 18) return null;
  const holes: CourseHole[] = [];
  for (const h of holesRaw) {
    const normalized = normalizeHole((h ?? {}) as ImportedHole);
    if (!normalized) return null;
    holes.push(normalized);
  }
  holes.sort((a, b) => a.holeNumber - b.holeNumber);
  const uniqueHoleNumbers = new Set(holes.map((h) => h.holeNumber));
  if (uniqueHoleNumbers.size !== 18) return null;
  const siSet = new Set(holes.map((h) => h.strokeIndex));
  if (siSet.size !== 18) return null;

  const warnings: string[] = [];
  const sumPar = holes.reduce((sum, h) => sum + h.par, 0);
  const resolvedPar = sumPar !== teePar ? sumPar : teePar;
  if (sumPar !== teePar) {
    warnings.push(
      `${teeNameRaw}: tee par ${teePar} does not match hole par total ${sumPar}; using ${resolvedPar} for handicap.`
    );
  }

  return {
    tee: {
      name: teeNameRaw as CourseTee['name'],
      par: resolvedPar,
      courseRating,
      slopeRating: Math.round(slopeRating),
      ...(asString(raw.gender) ? { gender: asString(raw.gender) as string } : {}),
      holes,
    },
    warnings,
  };
}

export function parseImportedCourseJson(rawText: string, sourceName: string): ImportedCourseResult {
  let parsed: ImportedCoursePayload;
  try {
    parsed = JSON.parse(rawText) as ImportedCoursePayload;
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (parsed.schema !== 'netpargolf-course') throw new Error('INVALID_SCHEMA');
  if (parsed.version !== 1) throw new Error('UNSUPPORTED_VERSION');
  if (!parsed.course || typeof parsed.course !== 'object') throw new Error('MISSING_COURSE');

  const courseName = asString(parsed.course.courseName);
  if (!courseName) throw new Error('MISSING_COURSE_NAME');
  const teesRaw = Array.isArray(parsed.course.tees) ? parsed.course.tees : null;
  if (!teesRaw || teesRaw.length === 0) throw new Error('MISSING_TEES');

  const tees: CourseTee[] = [];
  const warnings: string[] = [];
  for (const teeRaw of teesRaw) {
    const normalized = normalizeTee((teeRaw ?? {}) as ImportedTee);
    if (!normalized) throw new Error('INVALID_TEE');
    tees.push(normalized.tee);
    warnings.push(...normalized.warnings);
  }

  const baseHoles = tees[0].holes ?? [];
  const course: Course = {
    id: asString(parsed.course.id) ?? `course-${Date.now()}`,
    ...(asString(parsed.course.clubName) ? { clubName: asString(parsed.course.clubName) as string } : {}),
    name: courseName,
    ...(asString(parsed.course.location) ? { location: asString(parsed.course.location) as string } : {}),
    holes: baseHoles,
    tees,
  };

  return { course, warnings, sourceName };
}

export async function pickAndReadCourseJson(): Promise<ImportedCourseResult | null> {
  const DocumentPicker = await import('expo-document-picker');
  const FileSystem = await import('expo-file-system/legacy');

  const picked = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const file = picked.assets[0];
  const content = await FileSystem.readAsStringAsync(file.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return parseImportedCourseJson(content, file.name || 'course.json');
}
