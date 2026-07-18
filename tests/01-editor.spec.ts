import { test, expect } from '@playwright/test';
import { screenshotPage } from './helpers/auth';

// The editor is a WYSIWYG live-preview shell (EditableProfileView) with a
// slide-in ProfileDashboard opened via the gold "Edit Profile" pill. The former
// two-panel / Content+Design tabs / "Clear All" / iframe-preview UI these specs
// were originally written against was fully replaced (HARNESS.AUTH.1 re-author).
// These tests verify the CURRENT editor: it loads authenticated (storageState),
// and the real content + profile editing surfaces open from the pill.
//
// The whole file runs under both the desktop and mobile projects, so assertions
// are scoped to the chrome visible at each width — the "Edit Profile" pill lives
// in the desktop top bar AND the mobile header (both in the DOM), so we filter to
// the single one that is visible at the current viewport.

test.describe('Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
  });

  test('authenticated editor shell loads with Edit Profile pill', async ({ page }) => {
    await screenshotPage(page, 'editor-shell');
    // A valid session keeps us on the editor rather than bouncing to /login.
    await expect(page).toHaveURL(/\/dashboard\/editor$/);
    await expect(
      page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true })
    ).toBeVisible();
  });

  test('Edit Profile opens the Add Content dashboard', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Edit Profile' })
      .filter({ visible: true })
      .first()
      .click();
    // The slide-in ProfileDashboard's content surface (replaces the old
    // "content tab" — the removed "Clear All" button no longer exists).
    await expect(
      page.getByRole('heading', { name: /add content/i }).filter({ visible: true }).first()
    ).toBeVisible();
    await screenshotPage(page, 'editor-add-content');
  });

  test('Edit Profile exposes the Name & Handle profile section', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Edit Profile' })
      .filter({ visible: true })
      .first()
      .click();
    // Profile/photo/design controls (the old "design tab → Profile Photo") now
    // live inside the dashboard; "Name & Handle" is a stable section entry there.
    await expect(
      page.getByText('Name & Handle', { exact: false }).filter({ visible: true }).first()
    ).toBeVisible();
    await screenshotPage(page, 'editor-profile-section');
  });
});
