import type { Course, CourseHole } from '../core/course';

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
      courseName: course.name,
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
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');

  const payload = buildCourseExportPayload(course);
  const filename = `netpargolf-course-${makeSafeFilename(course.name)}.json`;
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('File storage is not available on this device.');
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const shareAvailable = await Sharing.isAvailableAsync();
  if (!shareAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Share course JSON',
    UTI: 'public.json',
  });
}
