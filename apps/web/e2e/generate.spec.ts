// e2e happy path (plan Task 21): landing hero → /create → prompt → Swift 5s →
// «≈ 35 credits» → Generate → processing card with progress → the SPA's 4s
// polling flips it into a playable video card, and the balance chip drops by
// the charge. Everything backend is scripted in mocks.ts — the suite verifies
// the SPA's wiring (router, guards, query cache, polling), not the API.
import { expect, test } from '@playwright/test'
import { COST, START_BALANCE, installApiMocks } from './mocks'

test('landing → create → video generation lifecycle with balance decrease', async ({ page }) => {
  await installApiMocks(page, { signedIn: true })

  // Landing: the hero headline + honest claims are the product's front door
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Create images & video. Pay pennies, not plans.' }),
  ).toBeVisible()
  await expect(page.getByText('Images from $0.01')).toBeVisible()

  // Signed-in visitors' CTA goes straight to /create (route decides via session)
  await page.getByRole('link', { name: 'Start creating' }).click()
  await expect(page).toHaveURL(/\/create$/)

  // Balance chip shows the untouched signup bonus before generating
  await expect(page.getByRole('button', { name: 'Credits balance' })).toHaveText(
    new RegExp(`${START_BALANCE}`),
  )

  // Draft: video type → Swift model card → 5s duration (default) → prompt
  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await page.getByRole('button', { name: /Swift/ }).click()
  await page.getByLabel('Prompt').fill('ocean waves rolling at dusk')

  // The price is visible BEFORE submitting — Swift 5s costs 35 credits
  await expect(page.getByTestId('cost-label')).toHaveText(`≈ ${COST} credits`)

  await page.getByRole('button', { name: 'Generate' }).click()

  // The 202 card lands in the gallery column still processing; the first
  // :id poll reports 40% and the Progress UI must show it
  await expect(page.getByText('40%')).toBeVisible({ timeout: 10_000 })

  // Second poll (≈4s later) succeeds → the same card becomes a playable
  // <video> pointing at our /media asset
  const video = page.locator('video')
  await expect(video).toBeVisible({ timeout: 15_000 })
  await expect(video).toHaveAttribute('src', /\/media\/.+\.mp4$/)

  // The charge is reflected in the chip: 200 − 35 = 165
  await expect(page.getByRole('button', { name: 'Credits balance' })).toHaveText(
    new RegExp(`${START_BALANCE - COST}`),
  )
})

test('landing language switch renders the Russian hero', async ({ page }) => {
  await installApiMocks(page, { signedIn: false })

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Create images & video. Pay pennies, not plans.' }),
  ).toBeVisible()

  // The standalone landing top bar carries its own LangSwitch (design.md §5)
  await page.getByRole('button', { name: 'RU', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Создавай изображения и видео. Плати копейки, а не подписки.',
    }),
  ).toBeVisible()
  // CTA copy switches with the same language change
  await expect(page.getByRole('link', { name: 'Начать создавать' })).toBeVisible()
})
