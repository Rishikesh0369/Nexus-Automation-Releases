const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Verifying Fast Auto Merge into Desktop App...');

const runnerPath = path.join(__dirname, '..', 'desktop-app', 'bela_nexus_runner.js');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');

const mainPath = path.join(__dirname, '..', 'desktop-app', 'main.js');
const mainContent = fs.readFileSync(mainPath, 'utf8');

// 1. Check Browser Launch Flags
console.log('\n--- 1. Chromium Performance Flags ---');
const requiredFlags = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--no-sandbox',
    '--disable-dev-shm-usage'
];
for (const flag of requiredFlags) {
    assert(runnerContent.includes(flag), `Runner launchArgs must include ${flag}`);
    console.log(`  ✅ Verified flag: ${flag}`);
}

// 2. Check Context Route Blocking & CAPTCHA Exemption
console.log('\n--- 2. Route Blocking & Captcha Exemption ---');
assert(runnerContent.includes("context.route('**/*'"), 'Must set up context.route');
assert(runnerContent.includes("url.toLowerCase().includes('captcha')"), 'Must exempt captcha URLs from blocking');
assert(runnerContent.includes("['image', 'font', 'media'].includes(type)"), 'Must block image, font, media');
assert(runnerContent.includes('route.abort()'), 'Must abort bulky assets');
console.log('  ✅ Asset router blocks image, font, media with strict CAPTCHA exception');

// 3. Check Optimized Login & Scraping
console.log('\n--- 3. Optimized Login & Scraping ---');
assert(runnerContent.includes('const loginForm = page.locator(userInputSelector)'), 'Must locate login form target');
assert(runnerContent.includes('await loginForm.isVisible({ timeout: 4000 })'), 'Must use targeted DOM visibility check for #principal');
assert(!runnerContent.includes("await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });\n    await page.waitForTimeout(3000)"), 'Must not have 3000ms blind timeout after goto');
assert(runnerContent.includes("waitForSelector('#gvProductConsumer tr', { state: 'attached', timeout: 15000 })"), 'Must wait for #gvProductConsumer tr attached state');
assert(runnerContent.includes("locator('#gvProductConsumer tr td:nth-child(3)').allTextContents()"), 'Must extract column 3 cells via native Playwright locator');
assert(!runnerContent.includes("page2.$$eval"), 'Must eliminate $$eval to prevent obfuscation crashes');
console.log('  ✅ Targeted DOM element visibility and attached state checks verified');

// 4. Check Cancellation Loop Postback Listeners
console.log('\n--- 4. Direct ASP.NET Postback Response Listeners ---');
assert(!runnerContent.includes("newPage.waitForLoadState('networkidle')"), 'Must not have networkidle calls inside loop');
assert(runnerContent.includes("resp.url().includes('econnect') && resp.status() === 200, { timeout: 10000 }"), 'Must wait for 200 OK postback on proceed / cancel');
assert(runnerContent.includes("resp.status() === 200, { timeout: 5000 }"), 'Must wait for 200 OK postback on clear with 5000ms timeout');
assert(runnerContent.includes("msg && msg.includes('Successfully')"), 'Must check Successfully message verification');
console.log('  ✅ Zero-latency ASP.NET postback response listeners verified');

// 5. Check Benchmark Timer & Toast Trigger
console.log('\n--- 5. Benchmark Timer & Toast Trigger ---');
assert(runnerContent.includes('Starting cancellation benchmark timer...'), 'Must log starting benchmark timer after scraping');
assert(runnerContent.includes('================ BENCHMARK REPORT ================'), 'Must output benchmark report');
assert(runnerContent.includes('timeTakenFormatted'), 'Must format time taken');
assert(runnerContent.includes('${mins}m ${String(secs).padStart(2, \'0\')}s'), 'Must format in Xm Ys format');
assert(runnerContent.includes('totalCancelled: cancellationStats.success'), 'Must pass totalCancelled to onCompleted');

// 6. Check Electron Main Unthrottling & Toast Window
console.log('\n--- 6. Electron Main Background Unthrottling & Toast Window ---');
assert(mainContent.includes("app.commandLine.appendSwitch('disable-background-timer-throttling')"), 'main.js must append disable-background-timer-throttling');
assert(mainContent.includes('backgroundThrottling: false'), 'main.js must set backgroundThrottling: false in BrowserWindow');
assert(mainContent.includes("showLiquidGlassToast"), 'main.js must have showLiquidGlassToast');
assert(mainContent.includes("ipcMain.on('show-completion-toast'"), 'main.js must handle show-completion-toast');
console.log('  ✅ Electron main unthrottling and toast controller verified');

console.log('\n🎉 ALL FAST AUTO MERGE VERIFICATIONS PASSED SUCCESSFULLY!');
