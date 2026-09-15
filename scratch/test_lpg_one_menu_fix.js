const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Running Test: Resilient LPG One Menu Navigation Fix...\n');

const runnerPath = path.resolve(__dirname, '../desktop-app/bela_nexus_runner.js');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');

// 1. Static Verification
console.log('1. Static Code Analysis in desktop-app/bela_nexus_runner.js...');
assert(runnerContent.includes("await page.waitForLoadState('domcontentloaded');"), 'Must wait for domcontentloaded before menu interaction');
assert(runnerContent.includes('const myAppSelector = \'a:has-text("My Application"), a:has-text("MY APPLICATION")\';'), 'Must define resilient myAppSelector');
assert(runnerContent.includes('const lpgOneSelector = \'a:has-text("LPG One"), a:has-text("LPG ONE")\';'), 'Must define resilient lpgOneSelector');
assert(runnerContent.includes('for (let attempt = 0; attempt < 3; attempt++)'), 'Must retry up to 3 attempts');
assert(runnerContent.includes('await myAppElement.hover({ timeout: 5000 });'), 'Must hover with 5000ms timeout');
assert(runnerContent.includes('await page.waitForTimeout(600);'), 'Must wait 600ms for dropdown animation');
assert(runnerContent.includes('await myAppElement.click({ timeout: 3000 }).catch(() => {});'), 'Must have click fallback with 3000ms timeout');
assert(runnerContent.includes('await page.waitForTimeout(1000);'), 'Must delay 1000ms on error before retry');
assert(runnerContent.includes('page.context().waitForEvent(\'page\', { timeout: 45000 })'), 'Must wait for popup with 45000ms timeout');
assert(runnerContent.includes('page.locator(lpgOneSelector).first().click({ force: true, timeout: 45000 })'), 'Must click LPG One with force: true and 45000ms timeout');
console.log('  ✅ Static code checks passed.');

// 2. Functional Unit Simulation of the Menu Opener Logic
console.log('\n2. Simulating Menu Opener Loop behaviors...');

(async () => {
    // Scenario A: Hover reveals menu on first attempt
    let hoverCount = 0;
    let clickFallbackCount = 0;
    let finalClickCalled = false;

    const mockPageA = {
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        locator: (selector) => {
            if (selector.includes('My Application')) {
                return {
                    first: () => ({
                        hover: async () => { hoverCount++; },
                        click: async () => { clickFallbackCount++; }
                    })
                };
            }
            if (selector.includes('LPG One')) {
                return {
                    first: () => ({
                        isVisible: async () => true, // Revealed immediately
                        click: async (opts) => {
                            assert(opts.force === true, 'force: true must be passed to click');
                            assert(opts.timeout === 45000, 'timeout: 45000 must be passed');
                            finalClickCalled = true;
                        }
                    })
                };
            }
        },
        context: () => ({
            waitForEvent: async (ev, opts) => {
                assert.strictEqual(ev, 'page');
                assert.strictEqual(opts.timeout, 45000);
                return { waitForLoadState: async () => {} };
            }
        })
    };

    // Execute Module 2 with mock page
    const runner = require(runnerPath);
    let errorThrown = false;
    try {
        // Run scrapeConsumerNumbers up to the menu step (will stop at page1 locator in mock)
        await runner.scrapeConsumerNumbers(mockPageA, null, () => {});
    } catch (e) {
        // Mock doesn't implement remaining scraping steps, so expect failure later in function
        errorThrown = true;
    }

    assert.strictEqual(hoverCount, 1, 'Should have hovered exactly once when menu opens');
    assert.strictEqual(clickFallbackCount, 0, 'Should NOT trigger click fallback when hover succeeds');
    assert.strictEqual(finalClickCalled, true, 'Should have called final LPG One click');
    console.log('  ✅ Scenario A Passed: Hover successfully opened menu on first attempt.');

    // Scenario B: Hover fails, click fallback succeeds
    hoverCount = 0;
    clickFallbackCount = 0;
    finalClickCalled = false;
    let visibilityChecks = 0;

    const mockPageB = {
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        locator: (selector) => {
            if (selector.includes('My Application')) {
                return {
                    first: () => ({
                        hover: async () => { hoverCount++; },
                        click: async () => { clickFallbackCount++; }
                    })
                };
            }
            if (selector.includes('LPG One')) {
                return {
                    first: () => ({
                        isVisible: async () => {
                            visibilityChecks++;
                            // False on hover check (check 1), true on click check (check 2)
                            return visibilityChecks > 1;
                        },
                        click: async (opts) => {
                            assert(opts.force === true);
                            finalClickCalled = true;
                        }
                    })
                };
            }
        },
        context: () => ({
            waitForEvent: async () => ({ waitForLoadState: async () => {} })
        })
    };

    try {
        await runner.scrapeConsumerNumbers(mockPageB, null, () => {});
    } catch (e) {}

    assert.strictEqual(hoverCount, 1, 'Should have hovered once');
    assert.strictEqual(clickFallbackCount, 1, 'Should have triggered click fallback');
    assert.strictEqual(finalClickCalled, true, 'Should have called final LPG One click');
    console.log('  ✅ Scenario B Passed: Click fallback recovered when hover failed.');

    console.log('\n🎉 ALL RESILIENT LPG ONE NAVIGATION TESTS PASSED SUCCESSFULLY!\n');
})();
