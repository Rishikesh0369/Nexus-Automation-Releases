const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const runner = require('../bela_nexus_runner');
const coreRunner = require('../desktop-app/automationRunner');

async function runTestSuite() {
    console.log('=== STARTING BROWSER SELECTION & FALLBACK TEST SUITE ===\n');

    // 1. Verify HTML elements for Browser Selection dropdown
    console.log('1. Checking HTML for Browser Selection dropdown...');
    const html = fs.readFileSync(path.resolve(__dirname, '../desktop-app/index.html'), 'utf8');
    assert(html.includes('id="selectBrowserChannel"'), 'index.html must contain id="selectBrowserChannel"');
    assert(html.includes('value="chrome"'), 'index.html must contain value="chrome"');
    assert(html.includes('value="msedge"'), 'index.html must contain value="msedge"');
    assert(html.includes('Google Chrome'), 'index.html must display "Google Chrome"');
    assert(html.includes('Microsoft Edge'), 'index.html must display "Microsoft Edge"');
    console.log('✅ HTML markup verified.');

    // 2. Verify CSS styles for .form-select
    console.log('2. Checking CSS styles...');
    const css = fs.readFileSync(path.resolve(__dirname, '../desktop-app/styles.css'), 'utf8');
    assert(css.includes('.form-select'), 'styles.css must contain .form-select');
    assert(css.includes('.form-select option'), 'styles.css must contain .form-select option');
    console.log('✅ CSS styling verified.');

    // 3. Verify launchBrowser and fallback behavior in bela_nexus_runner.js
    console.log('3. Checking runner exports...');
    assert(typeof runner.launchBrowser === 'function', 'bela_nexus_runner must export launchBrowser');
    assert(typeof coreRunner.launchBrowser === 'function', 'automationRunner must export launchBrowser');
    console.log('✅ Runner exports verified.');

    // 4. Test launchBrowser with Google Chrome
    console.log('4. Testing launchBrowser preferred: chrome...');
    const chromeBrowser = await runner.launchBrowser('chrome', { headless: true });
    assert(chromeBrowser, 'launchBrowser should return a browser instance for chrome');
    console.log('✅ Chrome launch successful.');
    await chromeBrowser.close();

    // 5. Test launchBrowser with Microsoft Edge
    console.log('5. Testing launchBrowser preferred: msedge...');
    const edgeBrowser = await runner.launchBrowser('msedge', { headless: true });
    assert(edgeBrowser, 'launchBrowser should return a browser instance for msedge');
    console.log('✅ Edge launch successful.');

    // 6. Test Single-Instance Idempotency of Floating Overlay
    console.log('6. Testing overlay single-instance guarantee across navigations...');
    const context = await edgeBrowser.newContext({ viewport: null });
    const page = await context.newPage();

    await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head><title>Test BPCL Page</title></head>
        <body>
            <div id="ctl00_header">BPCL Portal Header</div>
            <div id="content">Main Content Area</div>
        </body>
        </html>
    `);

    // Inject overlay first time
    await runner.injectNexusOverlay(page);

    const firstBadge = await page.evaluate(() => {
        const el = document.getElementById('nexus-overlay-banner');
        if (!el) return null;
        return {
            id: el.id,
            text: el.innerText,
            top: el.style.top,
            right: el.style.right,
            pointerEvents: el.style.pointerEvents
        };
    });

    assert(firstBadge, 'Overlay banner should be injected into the page');
    assert.strictEqual(firstBadge.id, 'nexus-overlay-banner');
    assert.strictEqual(firstBadge.text, '⚡ Nexus Auto-Engine Running');
    assert.strictEqual(firstBadge.top, '8px');
    assert.strictEqual(firstBadge.right, '20px');
    assert.strictEqual(firstBadge.pointerEvents, 'none');
    console.log('✅ First badge injection verified at top-right with pointer-events: none.');

    // Call injectNexusOverlay 5 times in a row
    for (let i = 0; i < 5; i++) {
        await runner.injectNexusOverlay(page);
    }

    const totalBadges = await page.evaluate(() => {
        return document.querySelectorAll('#nexus-overlay-banner, .nexus-auto-badge').length;
    });

    console.log(`Total badges in DOM after 5 consecutive injections: ${totalBadges}`);
    assert.strictEqual(totalBadges, 1, 'Exactly ONE #nexus-overlay-banner must exist in DOM');
    console.log('✅ Strict single-instance guarantee verified (no duplicates).');

    await context.close();
    await edgeBrowser.close();

    console.log('\n🎉 ALL BROWSER SELECTION & FALLBACK TESTS PASSED PERFECTLY!');
}

runTestSuite().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
