import { test, expect } from '@playwright/test';
import { login, selectChannel, sendMessage } from './helpers';

test.describe('Chat App — core flows', () => {

  test('login auto-selects first channel and shows seed messages', async ({ page }) => {
    await login(page, 'alice');
    await selectChannel(page, 'general');

    await expect(page.getByText('Good morning team')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('No messages yet')).not.toBeVisible();
  });

  test('send message appears in feed without refresh', async ({ page }) => {
    await login(page, 'alice');
    await selectChannel(page, 'general');

    const uniqueText = `e2e-msg-${Date.now()}`;
    await sendMessage(page, uniqueText);

    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 5_000 });
  });

  test('expand thread shows reply messages', async ({ page }) => {
    await login(page, 'alice');
    await selectChannel(page, 'general');

    const toggle = page.getByRole('button', { name: /▶ \d+ repl/ }).first();
    await toggle.click();

    await expect(page.getByText('Checking the auth service logs')).toBeVisible({ timeout: 5_000 });
  });

  test('reply in thread appears without refresh and thread stays expanded', async ({ page }) => {
    await login(page, 'alice');
    await selectChannel(page, 'general');

    const toggle = page.getByRole('button', { name: /▶ \d+ repl/ }).first();
    await toggle.click();
    await expect(page.getByText('Checking the auth service logs')).toBeVisible({ timeout: 5_000 });

    const expandedToggle = page.getByRole('button', { name: /▼ \d+ repl/ }).first();
    await expect(expandedToggle).toBeVisible();

    const contextBtns = page.getByRole('button', { name: '▶', exact: true });
    const count = await contextBtns.count();
    await contextBtns.nth(count > 2 ? 2 : count - 1).click();
    await page.getByRole('button', { name: '↩ Reply' }).first().click();
    await expect(page.getByText('Replying to')).toBeVisible();

    const uniqueReply = `e2e-reply-${Date.now()}`;
    await sendMessage(page, uniqueReply);

    await expect(page.getByText(uniqueReply)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /▼ \d+ repl/ })).toBeVisible();
  });

  test('add reaction shows pill on message', async ({ page }) => {
    await login(page, 'alice');
    await selectChannel(page, 'general');

    const addBtn = page.getByRole('button', { name: '+' }).first();
    await addBtn.click();

    await page.getByRole('menuitem', { name: /thumbs up/ }).click();

    await expect(page.getByRole('button', { name: /👍/ })).toBeVisible({ timeout: 5_000 });
  });

  test('create channel appears in nav', async ({ page }) => {
    await login(page, 'alice');

    const channelName = `e2e-ch-${Date.now()}`;
    page.once('dialog', dialog => dialog.accept(channelName));

    await page.getByText('Create Channel').click();
    await expect(page.getByText(channelName)).toBeVisible({ timeout: 5_000 });
  });

  test('switch channels updates messages', async ({ page }) => {
    await login(page, 'alice');
    await selectChannel(page, 'general');
    await expect(page.getByText('Good morning team')).toBeVisible({ timeout: 5_000 });

    await selectChannel(page, 'incidents');
    await expect(page.getByText('Good morning team')).not.toBeVisible({ timeout: 5_000 });
  });
});
