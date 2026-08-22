import { expect, test } from '@playwright/test';

const ADVANCED_COURSE = { schemaVersion: 1, progress: [3, 1, 0, 0], mastered: [true, false, false, false], mistakes: [1, 0, 0, 0] };
const STALE_COURSE = { schemaVersion: 1, progress: [1, 0, 0, 0], mastered: [false, false, false, false], mistakes: [2, 0, 0, 0] };
const COUNT_ATTEMPTS = { schemaVersion: 1, attempts: [{ id: 'deviceA_attempt_1', round: 1, kind: 'ace', seen: 2, remaining: 6, answer: 6, correct: true }] };

test('the training UI stays gated until a delayed cloud profile is restored', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one delayed-cloud lifecycle is sufficient');
  await page.route('**/api/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ persistent: true, mode: 'guest' }) }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/progress\?replays=1$/, async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ training: { profile: { schemaVersion: 1, course: ADVANCED_COURSE, countAttempts: [], gridAttempts: [], puzzle: null, puzzleEpoch: 0, locale: 'zh', aiSpeed: 1 }, revision: 4 }, matches: [] }) });
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('正在载入训练档案');
  await expect(page.getByTestId('start-game')).toHaveCount(0);
  release();
  await expect(page.getByTestId('start-game')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gd-course-v1') || 'null'))).toMatchObject(ADVANCED_COURSE);
});

test('a signed guest resumes the complete training profile without stale-device rollback', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one multi-context cloud merge is sufficient');
  const first = await browser.newContext(), firstPage = await first.newPage();
  await firstPage.addInitScript(({ course, count }) => {
    localStorage.setItem('gd-course-v1', JSON.stringify(course));
    localStorage.setItem('gd-count-memory-v1', JSON.stringify(count));
    localStorage.setItem('gd-locale-v1', 'en');
    localStorage.setItem('gd-ai-speed-v1', '2');
  }, { course: ADVANCED_COURSE, count: COUNT_ATTEMPTS });
  await firstPage.goto('/');
  await expect.poll(() => firstPage.evaluate(async () => {
    const data = await fetch('/api/progress').then(response => response.json()) as { training?: { revision?: number; profile?: { countAttempts?: unknown[]; course?: unknown } } };
    return { revision: data.training?.revision, attempts: data.training?.profile?.countAttempts?.length, course: data.training?.profile?.course };
  })).toEqual({ revision: 1, attempts: 1, course: { progress: ADVANCED_COURSE.progress, mastered: ADVANCED_COURSE.mastered, mistakes: ADVANCED_COURSE.mistakes } });

  const cookies = await first.cookies(), second = await browser.newContext();
  await second.addCookies(cookies);
  const secondPage = await second.newPage();
  await secondPage.goto('/');
  await expect.poll(() => secondPage.evaluate(() => ({
    course: JSON.parse(localStorage.getItem('gd-course-v1') || 'null'),
    count: JSON.parse(localStorage.getItem('gd-count-memory-v1') || 'null'),
    locale: localStorage.getItem('gd-locale-v1'),
    speed: localStorage.getItem('gd-ai-speed-v1'),
  }))).toMatchObject({ course: ADVANCED_COURSE, count: COUNT_ATTEMPTS, locale: 'en', speed: '2' });

  const stale = await browser.newContext();
  await stale.addCookies(cookies);
  const stalePage = await stale.newPage();
  await stalePage.addInitScript(course => localStorage.setItem('gd-course-v1', JSON.stringify(course)), STALE_COURSE);
  await stalePage.goto('/');
  await expect.poll(() => stalePage.evaluate(() => JSON.parse(localStorage.getItem('gd-course-v1') || 'null'))).toMatchObject({ mastered: ADVANCED_COURSE.mastered, progress: ADVANCED_COURSE.progress, mistakes: [2, 0, 0, 0] });
  await expect.poll(() => stalePage.evaluate(async () => {
    const data = await fetch('/api/progress').then(response => response.json()) as { training?: { profile?: { countAttempts?: unknown[]; course?: { mastered?: boolean[] } } } };
    return { attempts: data.training?.profile?.countAttempts?.length, mastered: data.training?.profile?.course?.mastered };
  })).toEqual({ attempts: 1, mastered: ADVANCED_COURSE.mastered });

  await Promise.all([first.close(), second.close(), stale.close()]);
});
