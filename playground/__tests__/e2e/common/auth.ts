import type { Page } from '@playwright/test';

import { expect } from '@playwright/test';

export async function authLogin(page: Page) {
  // 确保登录表单正常
  const usernameInput = await page.locator(`input[name='username']`);
  await expect(usernameInput).toBeVisible();
  await usernameInput.fill('admin@example.com');

  const passwordInput = await page.locator(`input[name='password']`);
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill('Admin@123');

  const captchaText = await page.locator(`[name='captcha-text']`);
  await expect(captchaText).toBeVisible();

  const captchaAnswerInput = await page.locator(`input[name='captcha_answer']`);
  await expect(captchaAnswerInput).toBeVisible();

  const captchaAnswer = (await captchaText.textContent())?.trim();
  if (!captchaAnswer) throw new Error('验证码内容未加载');
  await captchaAnswerInput.fill(captchaAnswer);

  await page.getByRole('button', { name: 'login' }).click();
}
