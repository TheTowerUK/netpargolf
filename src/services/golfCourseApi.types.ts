// src/services/golfCourseApi.types.ts
// Aligned with GolfCourseAPI OpenAPI spec: Course, TeeBox, ArrayOfHoles

export type GolfCourseApiLocation = {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

/** API hole: par, yardage, handicap (handicap = Stroke Index) */
export type GolfCourseApiHole = {
  par: number;
  yardage?: number;
  handicap?: number;
};

/** TeeBox: tee_name, ratings, holes array. Holes live at tees.male[].holes / tees.female[].holes */
export type GolfCourseApiTee = {
  tee_name: string;
  course_rating?: number;
  slope_rating?: number;
  bogey_rating?: number;
  total_yards?: number;
  total_meters?: number;
  number_of_holes?: number;
  par_total?: number;
  front_course_rating?: number;
  front_slope_rating?: number;
  front_bogey_rating?: number;
  back_course_rating?: number;
  back_slope_rating?: number;
  back_bogey_rating?: number;
  holes?: GolfCourseApiHole[];
};

export type GolfCourseApiTees = {
  female?: GolfCourseApiTee[];
  male?: GolfCourseApiTee[];
};

export type GolfCourseApiCourse = {
  id: number;
  club_name?: string;
  course_name?: string;
  location?: GolfCourseApiLocation;
  tees?: GolfCourseApiTees;
};

/** GET /v1/search response */
export type GolfCourseApiSearchResponse = {
  courses: GolfCourseApiCourse[];
};
