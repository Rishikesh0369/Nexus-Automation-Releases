const { chromium } = require('playwright');
const assert = require('assert');
const runner = require('../bela_nexus_runner');
const coreRunner = require('../desktop-app/automationRunner');

async function testChromeAndOverlay() {
    console.log('--- Testing Google Chrome Channel & Overlay Idempotency ---');

    // 1. Verify exports
    console.log('1. Checking runner exports...');
    assert(typeof runner.launchChromeBrowser === 'function', 'launchChromeBrowser should be exported');
    assert(typeof runner.injectNexusOverlay === 'function', 'injectNexusOverlay should be exported');
    assert(typeof runner.injectOverlay === 'function', 'injectOverlay alias should be exported');
    assert(typeof runner.showFloatingBanner === 'function', 'showFloatingBanner alias should be exported');
    assert(typeof coreRunner.injectNexusOverlay === 'function', 'coreRunner.injectNexusOverlay should be exported');
    console.log('✅ Exports verified.');

    // 2. Launch Google Chrome via launchChromeBrowser
    console.log('2. Launching Google Chrome (channel: chrome)...');
    const browser = await runner.launchChromeBrowser({ headless: true });
    assert(browser, 'Browser instance should be returned');
    console.log('✅ Google Chrome successfully launched with channel: chrome.');

    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    // 3. Set up mock page with mock duplicate/legacy badges and an iframe
    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Test Page</title></head>
        <body>
            <div id="nexus-live-banner" class="nexus-pill-badge" style="position:fixed;top:18px;left:50%;">Old Live Banner</div>
            <div id="nexus-guidance-overlay-banner" style="position:fixed;top:20px;left:50%;">Old Guidance Banner</div>
            <div class="nexus-auto-badge">Old Badge</div>
            <h1>BPCL eConnect Dashboard Mock</h1>
            <iframe id="testIframe" srcdoc="<html><body><div id='iframeContent'>Inner Content</div></body></html>"></iframe>
        </body>
        </html>
    `);

    // Verify mock dirty state
    const initialBadgesCount = await page.evaluate(() => {
        return document.querySelectorAll('.nexus-auto-badge, #nexus-overlay-banner, #nexus-live-banner, .nexus-pill-badge, #nexus-guidance-overlay-banner').length;
    });
    console.log(`Initial legacy badges in DOM: ${initialBadgesCount}`);
    assert(initialBadgesCount >= 3, 'Initial legacy badges should exist before cleanup');

    // 4. Test injectNexusOverlay
    console.log('3. Injecting Nexus overlay...');
    await runner.injectNexusOverlay(page);

    // Call it multiple times consecutively to test strict idempotency
    await runner.injectNexusOverlay(page);
    await runner.injectNexusOverlay(page);

    const badgeInfo = await page.evaluate(() => {
        const badges = document.querySelectorAll('#nexus-overlay-banner');
        const legacy = document.querySelectorAll('.nexus-pill-badge, #nexus-live-banner, #nexus-guidance-overlay-banner');
        const badge = document.getElementById('nexus-overlay-banner');
        if (!badge) return null;

        const computed = window.getComputedStyle(badge);
        return {
            count: badges.length,
            legacyCount: legacy.length,
            text: badge.innerText.trim(),
            position: computed.position,
            top: computed.top,
            right: computed.right,
            pointerEvents: computed.pointerEvents,
            zIndex: computed.zIndex
        };
    });

    console.log('Badge inspection result:', badgeInfo);
    assert.strictEqual(badgeInfo.count, 1, 'Exactly 1 #nexus-overlay-banner must exist');
    assert.strictEqual(badgeInfo.legacyCount, 0, 'All legacy badges must be purged');
    assert.strictEqual(badgeInfo.text, '⚡ Nexus Auto-Engine Running', 'Badge text must match');
    assert.strictEqual(badgeInfo.position, 'fixed', 'Position must be fixed');
    assert.strictEqual(badgeInfo.top, '8px', 'Top offset must be 8px');
    assert.strictEqual(badgeInfo.right, '20px', 'Right offset must be 20px');
    assert.strictEqual(badgeInfo.pointerEvents, 'none', 'Pointer-events must be none');

    // 5. Test that iframe does not contain badge
    const iframeBadgeCount = await page.evaluate(() => {
        const iframe = document.getElementById('testIframe');
        if (!iframe || !iframe.contentDocument) return 0;
        return iframe.contentDocument.querySelectorAll('#nexus-overlay-banner, .nexus-auto-badge').length;
    });
    console.log(`Iframe badge count: ${iframeBadgeCount}`);
    assert.strictEqual(iframeBadgeCount, 0, 'Iframe should NOT contain any injected badges');

    await context.close();
    await browser.close();

    console.log('🎉 ALL GOOGLE CHROME & OVERLAY TESTS PASSED PERFECTLY!');
}

testChromeAndOverlay().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
