import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const MASTERY = { schemaVersion: 1, progress: [3, 3, 2, 2], mastered: [true, true, true, true], mistakes: [0, 0, 0, 0] };

async function expectNoSeriousViolations(page: Page, state: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations = result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  expect(violations, `${state}:\n${violations.map(item => `${item.id}: ${item.help} (${item.nodes.length})`).join('\n')}`).toEqual([]);
}

test.describe('core learning path accessibility', () => {
  test('home, rules and course have no serious WCAG violations', async ({ page }) => {
    await page.goto('/');
    await expectNoSeriousViolations(page, 'home');

    await page.getByTestId('rules-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoSeriousViolations(page, 'rules dialog');
    await page.getByTestId('close-rules').click();

    await page.getByTestId('start-game').click();
    await expect(page.getByRole('heading', { name: '救急上桌路线' })).toBeVisible();
    await expectNoSeriousViolations(page, 'course');
  });

  test('memory and AI table have no serious WCAG violations', async ({ page }) => {
    await page.addInitScript(progress => localStorage.setItem('gd-course-v1', JSON.stringify(progress)), MASTERY);
    await page.goto('/');

    await page.getByRole('button', { name: /2 MIN 记牌热身/u }).click();
    await expect(page.getByRole('heading', { name: '记牌训练场' })).toBeVisible();
    await expectNoSeriousViolations(page, 'memory');

    await page.getByRole('button', { name: /G 掼蛋实验室/u }).click();
    await page.getByRole('button', { name: /整副牌 AI 完整陪练 进入 108 张四人牌桌/u }).click();
    await expect(page.getByText('你与小顾一队')).toBeVisible();
    await expectNoSeriousViolations(page, 'AI table');
  });
});
