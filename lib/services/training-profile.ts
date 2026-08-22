import { parsePuzzleProgress, type PuzzleProgress } from '../game/endgame-puzzles';
import { parseCourseProgress, type CourseState } from './course-progress';
import { parseCountAttempts, parseGridAttempts, type CountAttempt, type GridAttempt } from './memory-drill';

export const COURSE_STEP_COUNTS = [4, 4, 3, 3] as const;

export interface TrainingProfile {
  schemaVersion: 1;
  course: CourseState;
  countAttempts: CountAttempt[];
  gridAttempts: GridAttempt[];
  puzzle: PuzzleProgress | null;
  puzzleEpoch: number;
  locale: 'zh' | 'en';
  aiSpeed: 0 | 1 | 2;
}

export const EMPTY_TRAINING_PROFILE: TrainingProfile = {
  schemaVersion: 1,
  course: { progress: [0, 0, 0, 0], mastered: [false, false, false, false], mistakes: [0, 0, 0, 0] },
  countAttempts: [],
  gridAttempts: [],
  puzzle: null,
  puzzleEpoch: 0,
  locale: 'zh',
  aiSpeed: 1,
};

export function parseTrainingProfile(value: unknown): TrainingProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TrainingProfile>;
  if (raw.schemaVersion !== 1 || !raw.course || !Array.isArray(raw.countAttempts) || !Array.isArray(raw.gridAttempts)) return null;
  const course = parseCourseProgress(JSON.stringify({ schemaVersion: 1, ...raw.course }), [...COURSE_STEP_COUNTS]);
  const countAttempts = parseCountAttempts(JSON.stringify({ schemaVersion: 1, attempts: raw.countAttempts }));
  const gridAttempts = parseGridAttempts(JSON.stringify({ schemaVersion: 1, attempts: raw.gridAttempts }));
  const puzzle = raw.puzzle === null ? null : parsePuzzleProgress(JSON.stringify(raw.puzzle));
  if (!course || countAttempts.length !== raw.countAttempts.length || gridAttempts.length !== raw.gridAttempts.length || (raw.puzzle !== null && !puzzle)) return null;
  if (!Number.isSafeInteger(raw.puzzleEpoch) || (raw.puzzleEpoch as number) < 0 || (raw.puzzleEpoch as number) > 1_000_000) return null;
  if (raw.locale !== 'zh' && raw.locale !== 'en') return null;
  if (raw.aiSpeed !== 0 && raw.aiSpeed !== 1 && raw.aiSpeed !== 2) return null;
  return { schemaVersion: 1, course, countAttempts, gridAttempts, puzzle, puzzleEpoch: raw.puzzleEpoch as number, locale: raw.locale, aiSpeed: raw.aiSpeed };
}

function courseRank(course: CourseState): number {
  const firstIncomplete = course.mastered.findIndex(value => !value);
  return course.mastered.reduce((total, mastered, index) => total + (mastered ? COURSE_STEP_COUNTS[index] : 0), 0)
    + (firstIncomplete === -1 ? 0 : course.progress[firstIncomplete]);
}

function mergeCourse(stored: CourseState, incoming: CourseState): CourseState {
  const winner = courseRank(incoming) >= courseRank(stored) ? incoming : stored;
  const firstLocked = winner.mastered.findIndex(value => !value);
  return {
    progress: [...winner.progress],
    mastered: [...winner.mastered],
    mistakes: winner.mistakes.map((value, index) => firstLocked === -1 || index <= firstLocked ? Math.max(value, stored.mistakes[index], incoming.mistakes[index]) : 0),
  };
}

function mergeAttempts<T>(stored: T[], incoming: T[]): T[] {
  const attemptId = (attempt: T) => attempt && typeof attempt === 'object' && 'id' in attempt && typeof attempt.id === 'string' ? attempt.id : JSON.stringify(attempt);
  const unique = new Map<string, T>();
  const storedIds = new Set(stored.map(attemptId));
  const sharesHistory = incoming.some(attempt => storedIds.has(attemptId(attempt)));
  for (const attempt of [...stored, ...incoming]) {
    const id = attemptId(attempt);
    if (!unique.has(id)) unique.set(id, attempt);
  }
  const merged = [...unique.values()];
  // Two full, disjoint snapshots have no trustworthy global ordering. Preserve
  // the server-side history instead of letting an arbitrary stale UUID order
  // erase it; a client with shared ancestry can still append its new attempts.
  return merged.length > 50 && !sharesHistory ? stored.slice(-50) : merged.slice(-50);
}

function puzzleRank(value: PuzzleProgress | null): number {
  return value ? value.index * 1_000 + value.score * 10 + value.tried.length : -1;
}

function mergePuzzle(stored: PuzzleProgress | null, incoming: PuzzleProgress | null): PuzzleProgress | null {
  if (!stored) return incoming;
  if (!incoming) return stored;
  if (stored.index !== incoming.index) return puzzleRank(incoming) >= puzzleRank(stored) ? incoming : stored;
  const tried = [...new Set([...stored.tried, ...incoming.tried])];
  const preferred = puzzleRank(incoming) >= puzzleRank(stored) ? incoming : stored;
  return { schemaVersion: 1, index: preferred.index, score: Math.max(stored.score, incoming.score), tried, answer: preferred.answer };
}

/** Merge is monotonic for earned progress, while harmless display preferences follow the latest request. */
export function mergeTrainingProfiles(stored: TrainingProfile, incoming: TrainingProfile): TrainingProfile {
  const puzzleEpoch = Math.max(stored.puzzleEpoch, incoming.puzzleEpoch);
  return {
    schemaVersion: 1,
    course: mergeCourse(stored.course, incoming.course),
    countAttempts: mergeAttempts(stored.countAttempts, incoming.countAttempts),
    gridAttempts: mergeAttempts(stored.gridAttempts, incoming.gridAttempts),
    puzzle: incoming.puzzleEpoch > stored.puzzleEpoch ? incoming.puzzle : stored.puzzleEpoch > incoming.puzzleEpoch ? stored.puzzle : mergePuzzle(stored.puzzle, incoming.puzzle),
    puzzleEpoch,
    locale: incoming.locale,
    aiSpeed: incoming.aiSpeed,
  };
}

/** Replays only changes made since the last acknowledged snapshot onto a newer server revision. */
export function rebaseTrainingProfile(server: TrainingProfile, local: TrainingProfile, acknowledged: TrainingProfile): TrainingProfile {
  const attemptId = (attempt: { id?: string }) => attempt.id ?? JSON.stringify(attempt);
  const appendDelta = <T extends { id?: string }>(serverAttempts: T[], localAttempts: T[], acknowledgedAttempts: T[]) => {
    const known = new Set(acknowledgedAttempts.map(attemptId)), unique = new Map(serverAttempts.map(attempt => [attemptId(attempt), attempt]));
    for (const attempt of localAttempts) if (!known.has(attemptId(attempt))) unique.set(attemptId(attempt), attempt);
    return [...unique.values()].slice(-50);
  };
  const merged = mergeTrainingProfiles(server, local);
  merged.countAttempts = appendDelta(server.countAttempts, local.countAttempts, acknowledged.countAttempts);
  merged.gridAttempts = appendDelta(server.gridAttempts, local.gridAttempts, acknowledged.gridAttempts);
  merged.locale = local.locale !== acknowledged.locale ? local.locale : server.locale;
  merged.aiSpeed = local.aiSpeed !== acknowledged.aiSpeed ? local.aiSpeed : server.aiSpeed;
  return merged;
}
