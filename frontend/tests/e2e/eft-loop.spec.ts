import { test, expect } from '@playwright/test';

// NOTE: This is a stub E2E test illustrating the expected EFT loop flow.
// It is skipped by default because it requires the dev servers to be running.
test.describe.skip('EFT emotion-reactive loop', () => {
  test('shows SUDS banner and navigates into EFT AR', async ({ page }) => {
    await page.goto('http://localhost:5173/ai-chat');
    await page.fill('textarea[name="chat-input"]', '스트레스로 힘들어요');
    await page.click('button:has-text("보내기")');

    await expect(page.getByText('지금 느낌을 0~10으로 평가해 볼까요?')).toBeVisible();
    await page.fill('input[type="range"]', '7');
    await page.click('button:has-text("제출")');
    await expect(page).toHaveURL(/\/eftar\?.*script=standard_relief/);
  });
});
