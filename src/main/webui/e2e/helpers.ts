import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function login(page: Page, identity: string) {
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  }).catch(() => {});
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Choose or type a name' }).fill(identity);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByText('general')).toBeVisible({ timeout: 15_000 });
}

export async function selectChannel(page: Page, channelName: string) {
  await page.getByText(channelName, { exact: true }).click();
}

export async function sendMessage(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: 'Message' });
  await input.fill(text);
  await input.press('Enter');
}
