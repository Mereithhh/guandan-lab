import { describe, expect, it } from 'vitest';
import { EMPTY_TRAINING_PROFILE, mergeTrainingProfiles, parseTrainingProfile, rebaseTrainingProfile, type TrainingProfile } from '../../lib/services/training-profile';

const profile = (value: Partial<TrainingProfile> = {}): TrainingProfile => ({
  ...structuredClone(EMPTY_TRAINING_PROFILE),
  ...value,
});

describe('cross-device training profile', () => {
  it('validates every bounded field and rejects filtered or malformed input', () => {
    const valid = profile({
      countAttempts: [{ round: 1, kind: 'ace', seen: 2, remaining: 6, answer: 6, correct: true }],
      gridAttempts: [{ round: 1, score: 3 }],
      locale: 'en',
      aiSpeed: 2,
    });
    expect(parseTrainingProfile(valid)).toEqual(valid);
    expect(parseTrainingProfile({ ...valid, locale: 'fr' })).toBeNull();
    expect(parseTrainingProfile({ ...valid, countAttempts: [...valid.countAttempts, { round: 0 }] })).toBeNull();
    expect(parseTrainingProfile({ ...valid, aiSpeed: 99 })).toBeNull();
  });

  it('never lets a stale device erase earned course, memory or puzzle progress', () => {
    const stored = profile({
      course: { progress: [3, 1, 0, 0], mastered: [true, false, false, false], mistakes: [2, 1, 0, 0] },
      countAttempts: [{ round: 1, kind: 'ace', seen: 2, remaining: 6, answer: 6, correct: true }],
      gridAttempts: [{ round: 1, score: 3 }],
      puzzle: { schemaVersion: 1, index: 2, score: 2, tried: [0], answer: 0 },
      locale: 'zh',
      aiSpeed: 1,
    });
    const stale = profile({
      course: { progress: [1, 0, 0, 0], mastered: [false, false, false, false], mistakes: [4, 0, 0, 0] },
      countAttempts: [{ round: 1, kind: 'two', seen: 3, remaining: 5, answer: 4, correct: false }],
      gridAttempts: [{ round: 1, score: 1 }],
      puzzle: { schemaVersion: 1, index: 1, score: 1, tried: [0], answer: 0 },
      locale: 'en',
      aiSpeed: 2,
    });
    const merged = mergeTrainingProfiles(stored, stale);
    expect(merged.course.mastered).toEqual(stored.course.mastered);
    expect(merged.course.progress).toEqual(stored.course.progress);
    expect(merged.course.mistakes).toEqual([4, 1, 0, 0]);
    expect(merged.countAttempts).toHaveLength(2);
    expect(merged.gridAttempts).toHaveLength(2);
    expect(merged.puzzle).toEqual(stored.puzzle);
    expect({ locale: merged.locale, aiSpeed: merged.aiSpeed }).toEqual({ locale: 'en', aiSpeed: 2 });
  });

  it('merges same-puzzle evidence without duplicating identical attempts', () => {
    const attempt = { round: 1, kind: 'jokers' as const, seen: 1, remaining: 3, answer: 3, correct: true };
    const merged = mergeTrainingProfiles(
      profile({ countAttempts: [attempt], puzzle: { schemaVersion: 1, index: 2, score: 1, tried: [1], answer: 1 } }),
      profile({ countAttempts: [attempt], puzzle: { schemaVersion: 1, index: 2, score: 2, tried: [0], answer: 0 } }),
    );
    expect(merged.countAttempts).toEqual([attempt]);
    expect(merged.puzzle).toEqual({ schemaVersion: 1, index: 2, score: 2, tried: [1, 0], answer: 0 });
  });

  it('honors an explicit newer puzzle reset without letting an old device undo it', () => {
    const completed = profile({ puzzle: { schemaVersion: 1, index: 4, score: 4, tried: [0], answer: 0 }, puzzleEpoch: 1 });
    const reset = profile({ puzzle: null, puzzleEpoch: 2 });
    expect(mergeTrainingProfiles(completed, reset)).toMatchObject({ puzzle: null, puzzleEpoch: 2 });
    expect(mergeTrainingProfiles(reset, completed)).toMatchObject({ puzzle: null, puzzleEpoch: 2 });
  });

  it('does not let a full disjoint stale snapshot evict the server memory history', () => {
    const attempts = (prefix: string) => Array.from({ length: 50 }, (_, index) => ({
      id: `${prefix}_${String(index).padStart(8, '0')}`,
      round: index + 1,
      kind: 'ace' as const,
      seen: 2,
      remaining: 6,
      answer: 6,
      correct: true,
    }));
    const stored = attempts('server'), stale = attempts('stale');
    const merged = mergeTrainingProfiles(profile({ countAttempts: stored }), profile({ countAttempts: stale }));
    expect(merged.countAttempts).toEqual(stored);
  });

  it('rebases only unsynced local attempts and preferences after a revision conflict', () => {
    const oldAttempt = { id: 'old_attempt_0001', round: 1, score: 1 };
    const remoteAttempt = { id: 'remote_attempt_01', round: 2, score: 2 };
    const localAttempt = { id: 'local_attempt_001', round: 3, score: 3 };
    const acknowledged = profile({ gridAttempts: [oldAttempt], locale: 'zh', aiSpeed: 1 });
    const server = profile({ gridAttempts: [oldAttempt, remoteAttempt], locale: 'en', aiSpeed: 2 });
    const local = profile({ gridAttempts: [oldAttempt, localAttempt], locale: 'zh', aiSpeed: 0 });
    const rebased = rebaseTrainingProfile(server, local, acknowledged);
    expect(rebased.gridAttempts).toEqual([oldAttempt, remoteAttempt, localAttempt]);
    expect(rebased.locale).toBe('en');
    expect(rebased.aiSpeed).toBe(0);
  });
});
