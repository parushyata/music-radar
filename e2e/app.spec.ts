import { test, expect } from '@playwright/test';
import { mockApi } from './mock-api.ts';

test('signed out shows the sign-in screen', async ({ page }) => {
  await mockApi(page, { signedIn: false });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
});

test('signed in shows followed artists on the overview', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Test Band').first()).toBeVisible();
});
