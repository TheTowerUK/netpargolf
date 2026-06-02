import { courseWithUniqueTeeNames, type Course, type CourseHole, type CourseTee } from '../core/course';
import {
  loadExpoDocumentPicker,
  loadExpoFileSystem,
  parseDocumentPickerResult,
  readUtf8FileFromUri,
} from '../utils/expoDynamicModules';

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

export class CourseImportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'INVALID_JSON'
      | 'INVALID_SCHEMA'
      | 'UNSUPPORTED_VERSION'
      | 'MISSING_COURSE'
      | 'MISSING_COURSE_NAME'
      | 'MISSING_TEES'
      | 'INVALID_TEE'
      | 'PICKER_FAILED'
      | 'READ_FAILED'
      | 'IMPORT_FAILED'
  ) {
    super(message);
    this.name = 'CourseImportError';
  }
}

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
    throw new CourseImportError(
      'This file is not valid JSON.',
      'INVALID_JSON'
    );
  }

  if (parsed.schema !== 'netpargolf-course') {
    throw new CourseImportError(
      'This file is not a NetParGolf course file.',
      'INVALID_SCHEMA'
    );
  }
  if (parsed.version !== 1) {
    throw new CourseImportError(
      'This course file version is not supported.',
      'UNSUPPORTED_VERSION'
    );
  }
  if (!parsed.course || typeof parsed.course !== 'object') {
    throw new CourseImportError('Course data is missing from this file.', 'MISSING_COURSE');
  }

  const courseName = asString(parsed.course.courseName);
  if (!courseName) {
    throw new CourseImportError('Course name is missing from this file.', 'MISSING_COURSE_NAME');
  }
  const teesRaw = Array.isArray(parsed.course.tees) ? parsed.course.tees : null;
  if (!teesRaw || teesRaw.length === 0) {
    throw new CourseImportError('No tees found in this file.', 'MISSING_TEES');
  }

  const tees: CourseTee[] = [];
  const warnings: string[] = [];
  for (const teeRaw of teesRaw) {
    const normalized = normalizeTee((teeRaw ?? {}) as ImportedTee);
    if (!normalized) {
      throw new CourseImportError(
        'One or more tees in this file are invalid.',
        'INVALID_TEE'
      );
    }
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

  const normalizedCourse = courseWithUniqueTeeNames(course);
  const hadRenamedTee = (normalizedCourse.tees ?? []).some(
    (tee, index) => tee.name !== (course.tees ?? [])[index]?.name
  );
  if (hadRenamedTee) {
    warnings.push('Duplicate tee names were renamed to keep each tee unique.');
  }

  return { course: normalizedCourse, warnings, sourceName };
}

export async function pickAndReadCourseJson(): Promise<ImportedCourseResult | null> {
  console.error('[CourseJsonImport] start');

  try {
    const DocumentPicker = await loadExpoDocumentPicker();
    const FileSystem = await loadExpoFileSystem();
    console.error('[CourseJsonImport] module keys', Object.keys(DocumentPicker ?? {}));
    console.error('[CourseJsonImport] fileSystem keys', Object.keys(FileSystem ?? {}));
    console.error('[CourseJsonImport] modules loaded');

    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
      multiple: false,
    });

    const selection = parseDocumentPickerResult(picked);
    if (!selection) {
      console.error('[CourseJsonImport] cancelled');
      return null;
    }

    const content = await readUtf8FileFromUri(FileSystem, selection.uri);
    console.error('[CourseJsonImport] file read', selection.name ?? selection.uri);

    return parseImportedCourseJson(content, selection.name || 'course.json');
  } catch (error) {
    console.error('[CourseJsonImport] failed', error);
    if (error instanceof CourseImportError) throw error;
    throw new CourseImportError(
      error instanceof Error ? error.message : 'Import failed',
      'IMPORT_FAILED'
    );
  }
}
