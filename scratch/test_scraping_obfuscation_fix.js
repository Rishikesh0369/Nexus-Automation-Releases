const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Scraping Obfuscation Fix & Native Node-side Locator Extraction...\n');

// 1. Static checks on clean source
const bakPath = path.resolve(__dirname, '../desktop-app/bela_nexus_runner.js.bak');
const cleanContent = fs.readFileSync(bakPath, 'utf8');

console.log('1. Checking static code requirements in runner source...');
assert(!cleanContent.includes("page2.$$eval('#gvProductConsumer"), 'Must completely eliminate $$eval on #gvProductConsumer');
assert(!cleanContent.includes("page2.$$eval"), 'Must eliminate page2.$$eval');
assert(cleanContent.includes("waitForSelector('#gvProductConsumer tr', { state: 'attached', timeout: 15000 })"), 'Must wait for #gvProductConsumer tr attached state');
assert(cleanContent.includes("locator('#gvProductConsumer tr td:nth-child(3)').allTextContents()"), 'Must use native locator allTextContents for column 3');
assert(cleanContent.includes("rawCells.map(n => n.trim()).filter(n => n.length > 0)") || cleanContent.includes("rawCells.map(t => t.trim()).filter(t => t.length > 0)"), 'Must trim and filter consumer numbers');
assert(cleanContent.includes("Successfully synchronized") || cleanContent.includes("Successfully scraped"), 'Must include this.sendLog hook');
console.log('  ✅ Static code requirements verified.');

// 2. Functional test with mock Playwright context on clean runner
console.log('\n2. Testing functional execution with mock Playwright page (Clean Runner)...');

function createMockPage() {
    const logs = [];
    const sentLogs = [];

    const mockPage2 = {
        waitForLoadState: async () => {},
        waitForSelector: async (sel, opts) => {
            assert.strictEqual(sel, '#gvProductConsumer tr');
            assert.strictEqual(opts?.state, 'attached');
        },
        locator: (sel) => {
            assert.strictEqual(sel, '#gvProductConsumer tr td:nth-child(3)');
            return {
                allTextContents: async () => [' 200111 ', '', ' 200222\n', '   ', '200333 ']
            };
        },
        close: async () => {}
    };

    const mockTargetLink = {
        click: async () => {},
        waitFor: async () => {},
        first: () => mockTargetLink,
        locator: () => mockTargetLink
    };

    const mockPage1 = {
        waitForLoadState: async () => {},
        locator: (sel) => mockTargetLink,
        getByRole: (role, opts) => ({
            click: async () => {},
            waitFor: async () => {}
        }),
        context: () => ({
            waitForEvent: async (ev) => {
                assert.strictEqual(ev, 'page');
                return mockPage2;
            }
        }),
        close: async () => {}
    };

    const mockPage = {
        locator: (sel) => ({
            filter: (opts) => ({
                first: () => ({
                    waitFor: async () => {},
                    hover: async () => {},
                    click: async () => {}
                })
            })
        }),
        context: () => ({
            waitForEvent: async (ev) => {
                assert.strictEqual(ev, 'page');
                return mockPage1;
            }
        })
    };

    return { mockPage, logs, sentLogs };
}

(async () => {
    // Test with root runner (clean)
    const rootRunner = require('../bela_nexus_runner');
    const ctx1 = createMockPage();
    const runnerContext1 = {
        sendLog: (msg) => ctx1.sentLogs.push(msg)
    };

    const numbers1 = await rootRunner.scrapeConsumerNumbers.call(
        runnerContext1,
        ctx1.mockPage,
        null,
        (msg) => ctx1.logs.push(msg)
    );

    assert.deepStrictEqual(numbers1, ['200111', '200222', '200333'], 'Scraped numbers must match cleaned list');
    assert(ctx1.logs.some(m => m.includes('Successfully synchronized 3 consumer records') || m.includes('Successfully scraped 3 consumer numbers')), 'Logger must record success');
    assert.strictEqual(ctx1.sentLogs.length, 1, 'sendLog must be called once');
    assert(ctx1.sentLogs[0].includes('Successfully synchronized 3 consumer records') || ctx1.sentLogs[0].includes('Successfully scraped 3 consumer numbers'), 'sendLog payload must match');
    console.log('  ✅ Clean runner scraping passed perfectly.');

    // 3. Test with obfuscated runner
    console.log('\n3. Testing functional execution on OBFUSCATED runner (Zero Runtime Crash)...');
    const obfuscatedRunner = require('../desktop-app/bela_nexus_runner');
    const ctx2 = createMockPage();
    const runnerContext2 = {
        sendLog: (msg) => ctx2.sentLogs.push(msg)
    };

    const numbers2 = await obfuscatedRunner.scrapeConsumerNumbers.call(
        runnerContext2,
        ctx2.mockPage,
        null,
        (msg) => ctx2.logs.push(msg)
    );

    assert.deepStrictEqual(numbers2, ['200111', '200222', '200333'], 'Obfuscated runner scraped numbers must match');
    assert.strictEqual(ctx2.sentLogs.length, 1, 'sendLog must be called once from obfuscated runner');
    assert(ctx2.sentLogs[0].includes('Successfully synchronized 3 consumer records') || ctx2.sentLogs[0].includes('Successfully scraped 3 consumer numbers'), 'sendLog payload must match from obfuscated runner');
    console.log('  ✅ Obfuscated runner executed without ReferenceError or runtime crash!');

    // 4. Test fallback when this is undefined or has no sendLog
    console.log('\n4. Testing standalone scrapeConsumerNumbers call without this context...');
    const ctx3 = createMockPage();
    const numbers3 = await rootRunner.scrapeConsumerNumbers(
        ctx3.mockPage,
        null,
        (msg) => ctx3.logs.push(msg)
    );
    assert.deepStrictEqual(numbers3, ['200111', '200222', '200333']);
    assert(ctx3.logs.some(m => m.includes('Successfully synchronized 3 consumer records') || m.includes('Successfully scraped 3 consumer numbers')));
    console.log('  ✅ Standalone call succeeded with zero errors.');

    console.log('\n🎉 ALL SCRAPING OBFUSCATION FIX TESTS PASSED SUCCESSFULLY!');
})();
