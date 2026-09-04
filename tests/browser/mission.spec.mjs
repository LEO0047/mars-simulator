import { test, expect } from '@playwright/test';
async function range(page, id, value) {
    await page.locator(id).evaluate((el, v) => {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
}
async function launchToEnd(page) {
    await page.locator('#startTransfer').click();
    await range(page, '#flightScrubber', 1000);
}
test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#modeSummary')).not.toBeEmpty();
});
test('orbital success, replay, archive export and landing handoff', async ({
    page,
}) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await launchToEnd(page);
    await expect(page.locator('#stateTag')).toHaveText('ARRIVED');
    await expect(page.locator('.archive-row')).toHaveCount(1);
    await page.locator('#generateBrief').click();
    await expect(page.locator('#briefTitle')).toHaveText('軌道會合成功');
    await page.keyboard.press('Escape');
    const total = await page.locator('#totalDistance').textContent();
    await range(page, '#flightScrubber', 500);
    await expect(page.locator('#stateTag')).toHaveText('PAUSED');
    await expect(page.locator('#continueLanding')).toBeHidden();
    await range(page, '#flightScrubber', 1000);
    await expect(page.locator('#totalDistance')).toHaveText(total);
    await expect(page.locator('.archive-row')).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportMissions').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('ares-missions.json');
    const stream = await download.createReadStream();
    let body = '';
    for await (const chunk of stream) body += chunk;
    const record = JSON.parse(body).missions[0];
    expect(record.success).toBe(true);
    expect(record.data.geometry.arrivalErrorAU).toBeLessThan(0.05);
    await page.locator('#continueLanding').click();
    await expect(page.locator('#landingWorkspace')).toBeVisible();
    await page.reload();
    await expect(page.locator('.archive-row')).toHaveCount(1);
    expect(errors).toEqual([]);
});
test('missed window and both alternative solvers remain operational', async ({
    page,
}) => {
    await range(page, '#launchWindow', 100);
    await launchToEnd(page);
    await expect(page.locator('#stateTag')).toHaveText('MISSED');
    await expect(page.locator('#continueLanding')).toBeHidden();
    await page.locator('#mode-fast').click();
    await expect(page.locator('#modeBadge')).toHaveText('FAST');
    await launchToEnd(page);
    await expect(page.locator('#stateTag')).toHaveText('ARRIVED');
    await page.locator('#mode-custom').click();
    await range(page, '#launchWindow', 200);
    await expect(page.locator('#modeBadge')).toHaveText('CUSTOM');
    await launchToEnd(page);
    await expect(page.locator('#stateTag')).toHaveText('ARRIVED');
    await expect(page.locator('#currentPhase')).toHaveText(
        await page.locator('#targetPhase').textContent(),
    );
    await page.locator('#windowMap button').nth(12).click();
    await expect(page.locator('#launchValue')).toHaveText('第 240 天');
    await expect(page.locator('#startTransfer')).toBeEnabled();
});
test('real animation, pause, reset and view switching', async ({ page }) => {
    await page.locator('#startTransfer').click();
    await expect
        .poll(async () =>
            Number(await page.locator('#missionDay').textContent()),
        )
        .toBeGreaterThan(0);
    await page.locator('#pauseButton').click();
    const day = await page.locator('#missionDay').textContent();
    await page.waitForTimeout(200);
    await expect(page.locator('#missionDay')).toHaveText(day);
    await page.locator('#pauseButton').click();
    await page.locator('#landingTab').click();
    await page.locator('#orbitTab').click();
    await expect(page.locator('#stateTag')).toHaveText('PAUSED');
    await page.locator('#resetSimulation').click();
    await expect(page.locator('#startTransfer')).toBeEnabled();
    await expect(page.locator('#missionDay')).toHaveText('0');
    await page.locator('#zoomIn').click();
    await page.locator('#zoomOut').click();
    await page.locator('#resetView').click();
});
test('autopilot actually completes descent and records its measured outcome', async ({
    page,
}) => {
    await page.locator('#landingTab').click();
    await range(page, '#descentSpeed', 10);
    await page.locator('#startLanding').click();
    await expect(page.locator('#landingState')).toHaveText('TOUCHDOWN', {
        timeout: 35000,
    });
    await expect(page.locator('#landingResult')).toContainText(
        'WELCOME TO MARS',
    );
    await expect(page.locator('#descentLog')).toContainText('降落傘展開');
    await expect(page.locator('#descentLog')).toContainText('切傘');
    await expect(page.locator('#throttle')).toBeDisabled();
    await expect(page.locator('.archive-row')).toHaveCount(1);
    await page.locator('#resetLanding').click();
    await expect(page.locator('#landingState')).toHaveText('READY');
    await page.locator('#landingSite').selectOption('olympus');
    await expect(page.locator('#landingFuel')).toContainText('330');
});
test('manual neglect crashes; parachute and throttle can be operated', async ({
    page,
}) => {
    await page.locator('#landingTab').click();
    await page.locator('#pilotManual').click();
    await range(page, '#descentSpeed', 10);
    await page.locator('#startLanding').click();
    await expect(page.locator('#landingState')).toHaveText('SIGNAL LOST', {
        timeout: 20000,
    });
    await expect(page.locator('#landingResult')).toContainText('接地');
    await page.locator('#resetLanding').click();
    await range(page, '#descentSpeed', 1);
    await page.locator('#startLanding').click();
    await expect(page.locator('#deployChute')).toBeEnabled();
    await page.locator('#deployChute').click();
    await expect(page.locator('#deployChute')).toHaveText('降落傘已展開');
    await range(page, '#throttle', 50);
    await expect(page.locator('#deployChute')).toHaveText('降落傘已切離');
    await page.locator('#pauseLanding').click();
    const altitude = await page.locator('#landingAltitude').textContent();
    await page.waitForTimeout(200);
    await expect(page.locator('#landingAltitude')).toHaveText(altitude);
});
test('mobile and reduced motion keep every control inside the viewport', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        for (const tab of ['#orbitTab', '#landingTab']) {
            await page.locator(tab).click();
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            const canvas = page.locator(
                tab === '#orbitTab' ? '#orbitCanvas' : '#surfaceCanvas',
            );
            await expect(canvas).toBeVisible();
        }
    }
});
test('complete app shell runs offline with no third-party requests', async ({
    page,
    context,
}) => {
    const external = [];
    page.on('request', (r) => {
        if (new URL(r.url()).origin !== new URL(page.url()).origin)
            external.push(r.url());
    });
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller)
            await new Promise((resolve) =>
                navigator.serviceWorker.addEventListener(
                    'controllerchange',
                    resolve,
                    { once: true },
                ),
            );
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#modeSummary')).not.toBeEmpty();
    await page.locator('#mode-custom').click();
    await launchToEnd(page);
    await expect(page.locator('#stateTag')).toHaveText('ARRIVED');
    await page.locator('#continueLanding').click();
    await page.locator('#startLanding').click();
    await expect(page.locator('#landingState')).toHaveText('DESCENDING');
    expect(external).toEqual([]);
    await context.setOffline(false);
});

test('mobile manual controls stay beside the live scene', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#landingTab').click();
    await page.locator('#pilotManual').click();
    await range(page, '#descentSpeed', 1);
    await page.locator('#startLanding').click();
    await expect(page.locator('#flightDock')).toBeInViewport();
    await expect(page.locator('#surfaceCanvas')).toBeInViewport();
    await expect(page.locator('#dockChute')).toBeEnabled();
    await page.locator('#dockChute').click();
    await expect(page.locator('#dockChute')).toHaveText('已開傘');
    await range(page, '#dockThrottle', 70);
    await expect(page.locator('#throttle')).toHaveValue('70');
    await expect(page.locator('#dockChute')).toHaveText('已切傘');
    await page.locator('#dockPause').click();
    await expect(page.locator('#landingState')).toHaveText('PAUSED');
});
