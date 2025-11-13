import { expect, test } from '@playwright/test';

test.describe('Hapoel Tel Aviv AI UI', () => {
  test('displays the answer and citations returned by the API', async ({ page }) => {
    await page.route('**/api/ask', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer: 'Hapoel Tel Aviv won the State Cup in 2012.',
          citations: [
            {
              label: 1,
              title: 'Official Archive',
              uri: 'https://example.com/archive',
              text: 'Highlights of the 2012 final.',
            },
          ],
        }),
      });
    });

    await page.goto('/');
    await page.fill('textarea', 'When was the last State Cup title?');

    await Promise.all([
      page.waitForResponse('**/api/ask'),
      page.click('button[type="submit"]'),
    ]);

    await expect(page.getByRole('heading', { name: 'Answer' })).toBeVisible();
    await expect(page.locator('main p').first()).toContainText(
      'Hapoel Tel Aviv won the State Cup in 2012.',
    );
    const firstReference = page.getByRole('listitem').first();
    await expect(firstReference).toContainText('[1] Official Archive');
    await expect(firstReference).toContainText('Highlights of the 2012 final.');
  });

  test('shows an error message when the API responds with an error', async ({ page }) => {
    await page.route('**/api/ask', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Service temporarily unavailable.',
        }),
      });
    });

    await page.goto('/');
    await page.fill('textarea', 'Tell me about club legends.');

    await Promise.all([
      page.waitForResponse('**/api/ask'),
      page.click('button[type="submit"]'),
    ]);

    await expect(page.getByText('We could not answer that.')).toBeVisible();
    await expect(page.getByText('Service temporarily unavailable.')).toBeVisible();
  });
});

