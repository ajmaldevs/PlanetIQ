import { expect, test } from '@playwright/test';

const widths = [320, 360, 375, 390, 430, 600, 768, 820, 1024, 1280, 1366, 1440, 1600, 1920, 2560];

test('landing page stays inside the viewport at required widths and orientations', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Explore Earth's changing systems." })).toBeVisible();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-artifacts/terralens-home-desktop.png', fullPage: false });

  for (const width of widths) {
    await page.setViewportSize({ width, height: Math.round(width * 0.68) });
    await expect(page.getByRole('heading', { name: "Explore Earth's changing systems." })).toBeVisible();
    const measurements = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      escapedButtons: [...document.querySelectorAll('button')]
        .filter((button) => button.getClientRects().length > 0)
        .map((button) => button.getBoundingClientRect())
        .filter((rect) => rect.left < -1 || rect.right > window.innerWidth + 1),
    }));
    expect(measurements.document, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(measurements.viewport);
    expect(measurements.escapedButtons, `visible buttons leave viewport at ${width}px`).toHaveLength(0);
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 800, height: 1280 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { name: "Explore Earth's changing systems." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-artifacts/terralens-home-mobile.png', fullPage: false });
  expect(pageErrors).toEqual([]);
});

test('2D map zoom crosses all geographic detail bands and supports panning', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to 2D Planar Map View' }).first().click();
  const map = page.locator('[data-map-detail-level]').first();
  await expect(map).toHaveAttribute('data-map-detail-level', 'global');
  const zoomButton = page.getByRole('button', { name: 'Zoom in', exact: true });
  for (const detail of ['continental', 'country', 'regional', 'local']) {
    let reached = false;
    for (let i = 0; i < 5; i++) {
      await zoomButton.click();
      await page.waitForTimeout(180);
      if (await map.getAttribute('data-map-detail-level') === detail) { reached = true; break; }
    }
    expect(reached, `map should reach ${detail} detail`).toBeTruthy();
  }
  await page.screenshot({ path: 'test-artifacts/terralens-map-2d-local.png', fullPage: false });
  await page.evaluate(() => {
    const frameTimes: number[] = [];
    (window as any).__mapFrameTimes = frameTimes;
    (window as any).__stopMapFrameSampling = false;
    const sample = (time: number) => {
      frameTimes.push(time);
      if (!(window as any).__stopMapFrameSampling) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const before = await map.getAttribute('data-map-center');
  const canvas = page.locator('.maplibregl-canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Map canvas has no visible bounds');
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58, { steps: 8 });
  expect(await map.getAttribute('data-map-center'), 'center synchronization is deferred until the gesture settles').toBe(before);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await map.getAttribute('data-map-center')).not.toBe(before);

  const startingCenter = await map.getAttribute('data-map-center');
  for (const [dx, dy] of [[-70, 30], [40, 55], [65, -45], [-35, -65]]) {
    const currentBox = await canvas.boundingBox();
    if (!currentBox) throw new Error('Map canvas has no visible bounds');
    const startX = currentBox.x + currentBox.width / 2;
    const startY = currentBox.y + currentBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  }
  expect(await map.getAttribute('data-map-center')).not.toBe(startingCenter);
  const motionMetrics = await page.evaluate(() => {
    (window as any).__stopMapFrameSampling = true;
    const times = (window as any).__mapFrameTimes as number[];
    const intervals = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
    return {
      frames: times.length,
      elapsedMs: times.length > 1 ? times[times.length - 1] - times[0] : 0,
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)] ?? 0,
      droppedFrameShare: intervals.length ? intervals.filter((delta) => delta > 34).length / intervals.length : 1,
    };
  });
  console.log('2D map pan profile:', JSON.stringify(motionMetrics));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -900);
  await expect(map).toHaveAttribute('data-map-zoom', /[3-9]/);
});

test('3D globe zoom updates the imagery scale progressively', async ({ page }) => {
  await page.goto('/');
  await page.locator('button[aria-label="Switch to 3D Globe View"]:visible').last().click();
  const zoomIn = page.getByTitle('Zoom In (or double-click surface)');
  for (const scale of ['continental', 'country', 'regional']) {
    let reached = false;
    for (let i = 0; i < 5; i++) {
      await zoomIn.click();
      await page.waitForTimeout(650);
      if (await page.getByText(`Scale: ${scale}`).isVisible().catch(() => false)) { reached = true; break; }
    }
    expect(reached, `3D globe should reach ${scale} scale`).toBeTruthy();
  }
  await page.waitForTimeout(4000);
  const imageryRequests = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((url) => url.includes('/World_Imagery/MapServer/tile/'))
    .map((url) => url.split('/MapServer/tile/')[1].split('/').slice(0, 3).join('/')));
  console.log('3D imagery tile requests:', JSON.stringify(imageryRequests));
  await page.screenshot({ path: 'test-artifacts/terralens-globe-regional.png', fullPage: false });
});

test('primary pages and geographic search are reachable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Dataset Catalog/ }).click();
  await expect(page.getByText('Scientific Dataset Catalog & Provenance')).toBeVisible();
  await page.getByRole('button', { name: /AI Assistant/ }).click();
  await expect(page.getByText('TerraLens AI Assistant')).toBeVisible();
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByText(/TerraLens/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search geographic locations and features' }).first();
  await search.fill('New York');
  await expect(page.getByText('New York', { exact: false }).first()).toBeVisible();
});

test('introduction is remembered after entering exploration', async ({ page }) => {
  await page.goto('/');
  const intro = page.getByRole('heading', { name: "Explore Earth's changing systems." });
  const introRegion = intro.locator('xpath=..');
  await expect(introRegion).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Switch to 2D Planar Map View' }).first().click();
  await expect(introRegion).toHaveCSS('opacity', '0');
  await page.locator('button[aria-label="Switch to 3D Globe View"]:visible').last().click();
  await expect(introRegion).toHaveCSS('opacity', '0');
  await page.reload();
  await expect(introRegion).toHaveCSS('opacity', '0');
});

test('Tools menu exposes all systems and rendering preferences', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /OCEAN/ }).click();
  const tools = page.getByRole('button', { name: 'Tools and additional options' });
  await tools.click();
  const menu = page.getByLabel('Additional exploration tools');
  await expect(menu.getByRole('button', { name: 'Show all Earth systems' })).toBeVisible();
  await menu.getByRole('button', { name: 'Show all Earth systems' }).click();
  await tools.click();
  await expect(menu.getByRole('button', { name: 'Show Ocean only' })).toBeVisible();
  await menu.getByRole('button', { name: 'Rendering quality' }).click();
  await tools.click();
  await menu.getByRole('button', { name: 'Rendering quality' }).press('Escape');
  await expect(menu).toHaveCount(0);
});

test('timeline stays above the expanded trend workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /OCEAN/ }).click();
  await page.getByTitle('Toggle Historical Trends & Teleconnections').click();
  const timeline = page.getByLabel('Shared earth observation timeline');
  const drawer = page.getByLabel('Unified Earth System Time & Trends Workspace');
  await expect(timeline).toBeVisible();
  await page.getByTitle('Maximize drawer height').click();
  const timelineBounds = await timeline.boundingBox();
  const drawerBounds = await drawer.boundingBox();
  if (!timelineBounds || !drawerBounds) throw new Error('Timeline or trends drawer is not laid out');
  expect(timelineBounds.y + timelineBounds.height).toBeLessThanOrEqual(drawerBounds.y + 1);
});
