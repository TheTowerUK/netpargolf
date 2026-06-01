import type { Course, CourseHole } from '../core/course';
import { isValidCourse } from '../core/course';
import {
  loadExpoFileSystem,
  loadExpoSharing,
  writeUtf8FileToDocuments,
} from '../utils/expoDynamicModules';

type ExportTee = {
  teeName: string;
  gender?: string;
  courseRating: number;
  slopeRating: number;
  par: number;
  holes: Array<{
    holeNumber: number;
    par: number;
    strokeIndex: number;
    yards?: number;
  }>;
};

export type NetParGolfCourseExport = {
  schema: 'netpargolf-course';
  version: 1;
  exportedAt: string;
  course: {
    id?: string;
    clubName?: string;
    courseName: string;
    location?: string;
    tees: ExportTee[];
  };
};

export class CourseExportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'COURSE_MISSING'
      | 'COURSE_NAME_MISSING'
      | 'COURSE_HOLES_INVALID'
      | 'COURSE_TEES_MISSING'
      | 'STORAGE_UNAVAILABLE'
      | 'SHARING_UNAVAILABLE'
      | 'EXPORT_FAILED'
  ) {
    super(message);
    this.name = 'CourseExportError';
  }
}

/** Validate course is ready to export before touching native modules. */
export function validateCourseForExport(course: Course | null | undefined): void {
  if (!course) {
    throw new CourseExportError('No course to export.', 'COURSE_MISSING');
  }
  if (!course.name?.trim()) {
    throw new CourseExportError('Course name is required before export.', 'COURSE_NAME_MISSING');
  }
  if (!Array.isArray(course.holes) || course.holes.length !== 18) {
    throw new CourseExportError(
      'Course must have 18 holes before export.',
      'COURSE_HOLES_INVALID'
    );
  }
  if (!Array.isArray(course.tees) || course.tees.length === 0) {
    throw new CourseExportError(
      'Course must have at least one tee before export.',
      'COURSE_TEES_MISSING'
    );
  }
  if (!isValidCourse(course)) {
    throw new CourseExportError(
      'Course data is incomplete (check par, stroke index, and tee ratings).',
      'COURSE_HOLES_INVALID'
    );
  }
}

function sanitizeHoles(holes: CourseHole[]): ExportTee['holes'] {
  return [...holes]
    .sort((a, b) => a.holeNumber - b.holeNumber)
    .map((h) => ({
      holeNumber: h.holeNumber,
      par: h.par,
      strokeIndex: h.strokeIndex,
      ...(typeof h.yards === 'number' ? { yards: h.yards } : {}),
    }));
}

export function buildCourseExportPayload(course: Course): NetParGolfCourseExport {
  validateCourseForExport(course);

  const baseHoles = sanitizeHoles(course.holes);
  const tees = (course.tees ?? []).map((tee) => ({
    teeName: tee.name,
    ...(tee.gender ? { gender: tee.gender } : {}),
    courseRating: tee.courseRating,
    slopeRating: tee.slopeRating,
    par: tee.par,
    holes: sanitizeHoles(tee.holes && tee.holes.length ? tee.holes : baseHoles),
  }));

  return {
    schema: 'netpargolf-course',
    version: 1,
    exportedAt: new Date().toISOString(),
    course: {
      ...(course.id ? { id: course.id } : {}),
      ...(course.clubName ? { clubName: course.clubName } : {}),
      courseName: course.name.trim(),
      ...(course.location ? { location: course.location } : {}),
      tees,
    },
  };
}

function makeSafeFilename(name: string): string {
  const trimmed = name.trim().toLowerCase() || 'course';
  return trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export async function exportCourseToJsonFile(course: Course): Promise<void> {
  console.error('[CourseJsonExport] start');

  try {
    validateCourseForExport(course);

    const FileSystem = await loadExpoFileSystem();
    const Sharing = await loadExpoSharing();
    console.error('[CourseJsonExport] module keys', Object.keys(FileSystem ?? {}));
    console.error('[CourseJsonExport] modules loaded');

    const payload = buildCourseExportPayload(course);
    const filename = `netpargolf-course-${makeSafeFilename(course.name)}.json`;
    const json = JSON.stringify(payload, null, 2);

    const uri = await writeUtf8FileToDocuments(FileSystem, filename, json);
    console.error('[CourseJsonExport] file written', uri);

    const shareAvailable = await Sharing.isAvailableAsync();
    console.error('[CourseJsonExport] sharing available', shareAvailable);

    if (!shareAvailable) {
      throw new CourseExportError(
        'Sharing is not available on this device.',
        'SHARING_UNAVAILABLE'
      );
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Share course JSON',
      UTI: 'public.json',
    });
  } catch (error) {
    console.error('[CourseJsonExport] failed', error);
    if (error instanceof CourseExportError) throw error;
    throw new CourseExportError(
      error instanceof Error ? error.message : 'Export failed',
      'EXPORT_FAILED'
    );
  }
}
