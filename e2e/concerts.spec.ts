import { test, expect } from '@playwright/test';
import { mockApi } from './mock-api.ts';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/#concerts');
});

const count = (page: import('@playwright/test').Page) => page.locator('.filters .muted');

test('lists every show by default', async ({ page }) => {
  await expect(count(page)).toHaveText('4 shows');
});

test('filters by city', async ({ page }) => {
  await page.getByPlaceholder('Filter by city, country, venue or artist').fill('paris');
  await expect(count(page)).toHaveText('1 show');
  await expect(page.getByText('Olympia')).toBeVisible();
});

test('the dropdown limits how far ahead shows are', async ({ page }) => {
  await page.locator('.filters select').selectOption({ label: '6 weeks' });
  await expect(count(page)).toHaveText('3 shows');
});

test('a typed window replaces the dropdown', async ({ page }) => {
  const typed = page.getByLabel('Custom time window');
  await typed.fill('2 days');
  await expect(count(page)).toHaveText('1 show');
  await expect(page.locator('.filters select')).toBeDisabled();
  await typed.fill('next week');
  await expect(count(page)).toHaveText('2 shows');
  await typed.fill('');
  await expect(page.locator('.filters select')).toBeEnabled();
  await expect(count(page)).toHaveText('4 shows');
});

// Runs on the phone project too: the hint must be on the page, not only in a hover tooltip.
test('an unreadable window shows a hint under the filters', async ({ page }) => {
  const typed = page.getByLabel('Custom time window');
  await typed.fill('next yar');
  await expect(typed).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('status')).toContainText('Couldn\'t read "next yar"');
  await expect(count(page)).toHaveText('4 shows');
  await typed.fill('2 years');
  await expect(page.getByRole('status')).toHaveText("Years aren't supported. Try 24 months.");
  await typed.fill('2 days');
  await expect(page.getByRole('status')).toHaveCount(0);
});
