// File: /tests/browser/workflow.spec.ts | Version: 0.4.1
import { readFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { UpdateJob } from '../../src/hub-update.js';
import { test, expect } from '@playwright/test';
import type { Credentials } from '../../src/app.js';

test('administrator creates an account; password sessions survive reload and sign out; Synology settings stay write-only', async ({ page }, info) => {
  const credentials = JSON.parse(readFileSync('.local/e2e/credentials.json', 'utf8')) as Credentials;
  const password = randomBytes(24).toString('hex'); const username = `admin-${info.project.name}`;
  await page.goto('/');
  await page.getByLabel('Access token', { exact: true }).fill(credentials.find((entry) => entry.role === 'admin')!.token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Create user', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create user', exact: true });
  await dialog.getByLabel('Username', { exact: true }).fill(username);
  await dialog.getByLabel('Display name', { exact: true }).fill(`Admin ${info.project.name}`);
  await dialog.getByRole('combobox', { name: 'Role', exact: true }).selectOption('admin');
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Save user', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Password', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  const cookies = await page.context().cookies(); const session = cookies.find((entry) => entry.name === 'duh_session');
  expect(session?.httpOnly).toBe(true); expect(session?.sameSite).toBe('Strict');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByLabel('Current password', { exact: true }).fill(`${password}-incorrect`);
  await page.getByLabel('New password', { exact: true }).fill(`${password}-next`);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByText('Invalid current password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await page.route('**/api/v1/admin/backups', (route) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON(); expect(input.password).toBe(password); expect(input.recovery_password).toBe(password);
      const { password: omitted, recovery_password: omittedRecovery, ...safe } = input; void omitted; void omittedRecovery;
      return route.fulfill({ json: { ...safe, password_set: true, recovery_password_set: true } });
    }
    return route.fulfill({ json: { available: true, agent_ready: false, settings: null, job: null } });
  });
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByLabel('NAS IPv4 address', { exact: true }).fill('192.168.1.50');
  await page.getByLabel('SMB share', { exact: true }).fill('backups');
  await page.getByLabel('SMB username', { exact: true }).fill('backup');
  await page.getByLabel('SMB password', { exact: true }).fill(password);
  await page.getByLabel('Repository recovery password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /Synology share requires SMB 3/ }).check();
  await page.getByRole('checkbox', { name: /recovery password is stored safely/ }).check();
  await page.getByRole('button', { name: 'Save backup settings', exact: true }).click();
  await expect(page.getByLabel('SMB password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Repository recovery password', { exact: true })).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(password);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('accounts-synology.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('admin publishes two files; reader checks, verifies and downloads; admin withdraws', async ({ page }, info) => {
  const credentials = JSON.parse(readFileSync('.local/e2e/credentials.json', 'utf8')) as Credentials;
  const product = `demo-${info.project.name}`;
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto('/');
  await page.getByLabel('Access token', { exact: true }).fill(credentials.find((entry) => entry.role === 'admin')!.token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Releases/, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByLabel('Product ID', { exact: true }).fill(product);
  await page.getByLabel('Display name', { exact: true }).fill(`Demo ${info.project.name}`);
  await page.getByRole('button', { name: 'Create product', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Product created');
  await page.getByRole('button', { name: /^Releases/ }).click();
  await page.getByRole('button', { name: 'New release', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New release', exact: true });
  await editor.getByRole('combobox', { name: 'Product', exact: true }).selectOption(product);
  await editor.getByLabel('Version', { exact: true }).fill('1.2.0');
  await editor.getByLabel('Release notes', { exact: true }).fill('Local browser verification. Two required artifacts.');
  await editor.getByLabel('Device type', { exact: true }).fill('rpi-camera');
  await editor.getByLabel('Operating system', { exact: true }).fill('linux');
  await editor.getByLabel('Architecture', { exact: true }).fill('arm64');
  await editor.getByLabel('Hardware revision', { exact: true }).fill('rev-b');
  await editor.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const payload = Buffer.from('Browser fixture payload - never installed');
  await page.getByLabel('Upload files', { exact: true }).setInputFiles([
    { name: 'application.bin', mimeType: 'application/octet-stream', buffer: payload },
    { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from('{"fixture":true}') },
  ]);
  await expect(page.getByText('application.bin', { exact: true })).toBeVisible();
  await expect(page.getByText('settings.json', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save artifact order', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Manifest saved');
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Validation passed');
  await page.getByRole('button', { name: 'Publish release', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish release', exact: true }).getByRole('button', { name: 'Publish release', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Release published');
  await expect(page.getByRole('button', { name: 'Edit draft', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('release-console.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: info.outputPath('release-console-dark.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Inspect manifest', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manifest', exact: true })).toContainText('application.bin');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill(credentials.find((entry) => entry.role === 'reader')!.token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New release', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Product', exact: true }).selectOption(product);
  await page.getByLabel('Installed version', { exact: true }).fill('1.0.0');
  await page.getByLabel('Device type', { exact: true }).fill('rpi-camera');
  await page.getByLabel('Operating system', { exact: true }).fill('linux');
  await page.getByLabel('Architecture', { exact: true }).fill('arm64');
  await page.getByLabel('Hardware revision', { exact: true }).fill('rev-b');
  let downloads = 0;
  page.on('request', (request) => { if (request.url().includes('/download')) downloads += 1; });
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Update available', exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  await page.getByRole('button', { name: 'Retrieve manifest', exact: true }).click();
  await expect(page.getByText('application.bin', { exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download: application.bin', exact: true }).click();
  const download = await downloadEvent;
  const downloadedPath = await download.path();
  expect(createHash('sha256').update(readFileSync(downloadedPath!)).digest('hex')).toBe(createHash('sha256').update(payload).digest('hex'));
  await expect(page.getByRole('status')).toHaveText('Download verified');
  await page.getByLabel('Installed version', { exact: true }).fill('1.2.0');
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No eligible update', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('reader-check.png'), fullPage: true });
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['duh-theme']);
  expect(await page.evaluate(() => localStorage.getItem('duh-theme'))).toBe('dark');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Access token', { exact: true }).fill(credentials.find((entry) => entry.role === 'admin')!.token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`${product}.*1.2.0`) }).click();
  await page.getByRole('button', { name: 'Withdraw release', exact: true }).click();
  await page.getByRole('dialog', { name: 'Withdraw release', exact: true }).getByRole('button', { name: 'Withdraw release', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Release withdrawn');
  expect(browserErrors).toEqual([]);
});

test('theme follows the OS, supports overrides and survives reload without storing credentials', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toHaveValue('system');
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('textbox', { name: 'Access token', exact: true })).toHaveValue('');
  await page.screenshot({ path: info.outputPath('theme-dark.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('admin changes upload settings and a fresh session retains them', async ({ page }, info) => {
  const credentials = JSON.parse(readFileSync('.local/e2e/credentials.json', 'utf8')) as Credentials;
  const login = async () => {
    await page.getByLabel('Access token', { exact: true }).fill(credentials.find((entry) => entry.role === 'admin')!.token);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'System', exact: true }).click();
  };
  await page.goto('/'); await login();
  await expect(page.locator('.checkbox-label')).toHaveCSS('flex-direction', 'row');
  await page.getByRole('checkbox', { name: 'Limit artifact size', exact: true }).check();
  await page.getByLabel('Maximum artifact size (MiB)', { exact: true }).fill('4096');
  await page.getByLabel('Upload timeout (seconds)', { exact: true }).fill('7200');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved');
  await page.reload(); await login();
  await expect(page.getByLabel('Maximum artifact size (MiB)', { exact: true })).toHaveValue('4096');
  await expect(page.getByLabel('Upload timeout (seconds)', { exact: true })).toHaveValue('7200');
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('dark');
  await page.screenshot({ path: info.outputPath('system-settings.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('checkbox', { name: 'Limit artifact size', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved');
});

test('Hub update waits across disconnection, reports rollback and reloads only after verified success', async ({ page }, info) => {
  const credentials = JSON.parse(readFileSync('.local/e2e/credentials.json', 'utf8')) as Credentials;
  const release = { id: randomUUID(), version: '0.2.0', release_notes: 'Signed browser fixture; never installed' };
  let currentVersion = '0.1.0';
  let job: UpdateJob | null = { job_id: randomUUID(), release_id: randomUUID(), version: '0.1.0', at: new Date().toISOString(), state: 'succeeded', maintenance: false, message: 'Previous completed update' };
  let disconnected = false;
  let installations = 0;
  let preparing = false;
  let preparationPolls = 0;
  let finishPreparation = () => {};
  await page.route('**/api/v1/admin/hub-update', async (route) => {
    if (disconnected) { await route.abort(); return; }
    if (preparing) preparationPolls += 1;
    await route.fulfill({ json: { enabled: true, agent_ready: true, current_version: currentVersion, job } });
  });
  await page.route('**/api/v1/admin/hub-update/check', (route) => route.fulfill({ json: { release } }));
  await page.route('**/api/v1/admin/hub-update/install', async (route) => {
    installations += 1;
    expect(route.request().postDataJSON()).toEqual({ release_id: release.id, confirmation: release.version });
    if (installations === 1) {
      preparing = true;
      await new Promise<void>((resolve) => { finishPreparation = resolve; });
      preparing = false;
    }
    job = { job_id: randomUUID(), release_id: release.id, version: release.version, at: new Date().toISOString(), state: 'queued', maintenance: true, message: 'Browser fixture' };
    await route.fulfill({ status: 202, json: job });
  });
  await page.route('**/health', (route) => {
    expect(currentVersion).toBe(release.version);
    return route.fulfill({ json: { status: 'ok', version: currentVersion, database_schema: 2 } });
  });
  await page.goto('/');
  await page.getByLabel('Access token', { exact: true }).fill(credentials.find((entry) => entry.role === 'admin')!.token);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  expect(installations).toBe(0);
  const install = async () => {
    await page.getByRole('button', { name: 'Install update', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Install update', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Install update', exact: true }).click();
    await expect.poll(() => installations).toBeGreaterThan(0);
    if (installations === 1) {
      await expect.poll(() => preparationPolls).toBeGreaterThan(0);
      await expect(page.getByText('Preparing signed package', { exact: true })).toBeVisible();
      finishPreparation();
    }
    await expect(page.getByText('Hub update in progress', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Products', exact: true })).toBeDisabled();
  };
  await install();
  await page.screenshot({ path: info.outputPath('hub-update-wait.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  disconnected = true;
  await expect(page.getByText('Waiting for server restart', { exact: true })).toBeVisible({ timeout: 10000 });
  disconnected = false;
  job = { ...job!, state: 'rolled_back', maintenance: false };
  await expect(page.getByRole('status').filter({ hasText: 'Rolled back' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await install();
  job = { ...job!, state: 'succeeded', maintenance: false };
  await expect(page.getByRole('status').filter({ hasText: 'Installed: 0.2.0' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('heading', { name: 'System', exact: true })).toBeVisible();
  currentVersion = '0.2.0';
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10000 });
  expect(installations).toBe(2);
});