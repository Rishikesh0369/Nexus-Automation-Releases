const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Verifying Fast Navigation & Flow Optimization ===\n');

const belaRunnerPath = path.resolve(__dirname, '../bela_nexus_runner.js');
const autoRunnerPath = path.resolve(__dirname, '../desktop-app/automationRunner.js');

const belaRunnerContent = fs.readFileSync(belaRunnerPath, 'utf8');
const autoRunnerContent = fs.readFileSync(autoRunnerPath, 'utf8');

// 1. Ensure NO 'networkidle' exists in either file
console.log('1. Checking for networkidle...');
assert(!belaRunnerContent.includes("waitForLoadState('networkidle')"), "bela_nexus_runner.js must NOT contain waitForLoadState('networkidle')");
assert(!autoRunnerContent.includes("waitForLoadState('networkidle')"), "automationRunner.js must NOT contain waitForLoadState('networkidle')");
console.log('✅ Zero networkidle occurrences found in runner files.');

// 2. Ensure waitForLoadState('domcontentloaded') is present
console.log('2. Checking for domcontentloaded...');
assert(belaRunnerContent.includes("waitForLoadState('domcontentloaded')"), "bela_nexus_runner.js must use waitForLoadState('domcontentloaded')");
assert(autoRunnerContent.includes("waitForLoadState('domcontentloaded')"), "automationRunner.js must use waitForLoadState('domcontentloaded')");
console.log('✅ domcontentloaded properly used across navigation points.');

// 3. Step 1 check (My Application hover and 1000ms delay)
console.log('3. Checking Step 1 (My Applications hover flow)...');
assert(belaRunnerContent.includes("page.locator('a').filter({ hasText: 'My Application' }).first().hover()"), "Step 1 hover not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("await page.waitForTimeout(1000);"), "Step 1 1000ms delay not found in bela_nexus_runner.js");
console.log('✅ Step 1 verified.');

// 4. Step 2 check (LPG One Click with popup capture)
console.log('4. Checking Step 2 (LPG One click and popup capture)...');
assert(belaRunnerContent.includes("page.locator('a').filter({ hasText: 'LPG One' }).first().click()"), "Step 2 click not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("page.context().waitForEvent('page')"), "Step 2 popup capture not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("await page1.waitForLoadState('domcontentloaded')"), "Step 2 domcontentloaded not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("await page1.waitForTimeout(1000)"), "Step 2 1000ms timeout not found in bela_nexus_runner.js");
console.log('✅ Step 2 verified.');

// 5. Step 3 check (E-Day End -> Proceed)
console.log('5. Checking Step 3 (E-Day End -> Proceed)...');
assert(belaRunnerContent.includes("page1.getByRole('link', { name: 'E-Day End This option is for' }).click()"), "Step 3 link click not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("page1.getByRole('button', { name: 'Proceed' }).click()"), "Step 3 Proceed button click not found in bela_nexus_runner.js");
console.log('✅ Step 3 verified.');

// 6. Step 4 check (Product 5350 Delivery Confirmation Not Done tab)
console.log('6. Checking Step 4 (Product 5350 Delivery Confirmation Not Done tab)...');
assert(belaRunnerContent.includes("locator('#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr', { hasText: '5350' })"), "Step 4 row selector not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("locator('a[id*=\"hlDelvConfNotDone\"]')"), "Step 4 targetLink not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes(".first()"), "Step 4 .first() call not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("page1.context().waitForEvent('page')"), "Step 4 popup capture not found in bela_nexus_runner.js");
assert(belaRunnerContent.includes("await page2.waitForLoadState('domcontentloaded')"), "Step 4 domcontentloaded not found in bela_nexus_runner.js");
console.log('✅ Step 4 verified.');

// 7. Check exported functions
console.log('7. Checking exports in bela_nexus_runner.js...');
const runner = require('../bela_nexus_runner');
assert(typeof runner.scrapeConsumerNumbers === 'function', 'scrapeConsumerNumbers must be exported');
assert(typeof runner.runCancellation === 'function', 'runCancellation must be exported');
assert(typeof runner.runBelaNexusAutomation === 'function', 'runBelaNexusAutomation must be exported');
assert(typeof runner.launchBrowser === 'function', 'launchBrowser must be exported');
assert(typeof runner.launchChromeBrowser === 'function', 'launchChromeBrowser must be exported');
assert(typeof runner.injectNexusOverlay === 'function', 'injectNexusOverlay must be exported');
console.log('✅ All exports verified.');

console.log('\n🎉 ALL FAST NAVIGATION & OPTIMIZATION AUDITS PASSED!');
