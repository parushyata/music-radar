import { test, expect, type Page } from '@playwright/test';
import { mockApi } from './mock-api.ts';

// Checking a new artist's sources takes seconds in production, so adding one must not wait for it.
// The refresh request is held open until the test releases it.

const card = (page: Page, name: string) => page.getByRole('article').filter({ hasText: name });

test('picking a search result shows the artist at once and checks its sources in the background', async ({ page }) => {
  const api = await mockApi(page, { holdRefresh: true });
  await page.goto('/#overview');

  const search = page.getByRole('searchbox');
  await search.fill('New Band');
  const refreshSent = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/artists/id-mbid-new/refresh'));
  await page.getByRole('listitem').filter({ hasText: 'search fixture' }).click();
  await refreshSent;

  // The refresh is still pending here.
  await expect(search).toHaveAttribute('placeholder', /^Add an artist or band/);
  await expect(card(page, 'New Band')).toContainText('Checking sources…');

  api.releaseRefresh();
  await expect(card(page, 'New Band')).toContainText('Checked just now');
});

test('adding an artist manually finishes without waiting for its sources', async ({ page }) => {
  const api = await mockApi(page, { holdRefresh: true });
  await page.goto('/#manual');

  await page.getByRole('button', { name: 'Add manually' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Hand Added');
  const refreshSent = page.waitForRequest((r) => r.method() === 'POST' && /\/api\/artists\/[^/]+\/refresh$/.test(r.url()));
  await dialog.getByRole('button', { name: 'Add artist' }).click();
  await refreshSent;

  // The refresh is still pending here.
  await expect(dialog).toContainText('✓ Hand Added added');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(card(page, 'Hand Added')).toContainText('Checking sources…');

  api.releaseRefresh();
  await expect(card(page, 'Hand Added')).toContainText('Checked just now');
});
