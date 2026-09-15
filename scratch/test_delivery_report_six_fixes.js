// -------------------------------------------------------------
// VERIFICATION: 6 delivery-report fixes
// -------------------------------------------------------------
// Extracts the REAL shipped source slices out of renderer.js and
// deliveryReportScraper.js and runs them in a vm sandbox, so the assertions
// exercise the code that actually ships (not a re-implementation).
// -------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const SCRAPER = path.join(ROOT, 'desktop-app', 'scrapers', 'deliveryReportScraper.js');
const INDEX_HTML = path.join(ROOT, 'desktop-app', 'index.html');

const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const scraperSrc = fs.readFileSync(SCRAPER, 'utf8');
const htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const out = fn();
        if (out && typeof out.then === 'function') {
            return out.then(
                () => { passed++; console.log(`  ✅ ${name}`); },
                (err) => { failed++; console.log(`  ❌ ${name}\n     ${err.message}`); }
            );
        }
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name}\n     ${err.message}`);
    }
    return Promise.resolve();
}

// Values crossing the vm realm boundary carry a different Array/Object
// prototype, so deepStrictEqual would reject structurally identical data.
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function slice(src, startMarker, endMarker, label) {
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    assert.ok(start >= 0, `${label}: start marker not found -> ${startMarker}`);
    assert.ok(end > start, `${label}: end marker not found -> ${endMarker}`);
    return src.slice(start, end);
}

// -------------------------------------------------------------
// SANDBOX 1: renderer persistence + merge helpers
// -------------------------------------------------------------
const store = new Map();
const fakeLocalStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
};

const rendererSlice = slice(
    rendererSrc,
    'const DELIVERY_REPORT_STORAGE_KEY',
    'function setDeliveryButtonState',
    'renderer persistence block'
);

const rendererCtx = vm.createContext({ localStorage: fakeLocalStorage, console });
vm.runInContext(`${rendererSlice}\n;this.__api = { DELIVERY_REPORT_STORAGE_KEY, loadSavedDeliveryReport, saveDeliveryReport, buildOperatorSummaryFromRecords, mergeAndPersistDeliveryReport };`, rendererCtx);
const R = rendererCtx.__api;

// -------------------------------------------------------------
// SANDBOX 2: scraper stop/summary helpers
// -------------------------------------------------------------
let stopFlag = false;
const scraperSlice = slice(
    scraperSrc,
    'const STOP_SENTINEL',
    '/**\n * Wait for an ASP.NET postback',
    'scraper helper block'
);

const scraperCtx = vm.createContext({
    console,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    isDeliveryReportStopRequested: () => stopFlag === true
});
vm.runInContext(`${scraperSlice}\n;this.__api = { STOP_SENTINEL, raceStop, closePageFast, readSummaryCell };`, scraperCtx);
const S = scraperCtx.__api;

// A minimal Playwright-locator stand-in over a 2-D table of cell texts.
function makePage(rows, { throwOn = null } = {}) {
    return {
        locator(selector) {
            if (throwOn && selector.includes(throwOn)) {
                return { count: async () => { throw new Error('detached'); } };
            }
            const matchesTable = selector.includes('divModesViaDC');
            return {
                nth(rowIndex) {
                    const row = matchesTable ? rows[rowIndex] : undefined;
                    return {
                        count: async () => (row ? 1 : 0),
                        locator(cellSel) {
                            assert.strictEqual(cellSel, 'td', 'cells must be read as <td>');
                            return {
                                nth(cellIndex) {
                                    const cell = row ? row[cellIndex] : undefined;
                                    return {
                                        count: async () => (cell === undefined ? 0 : 1),
                                        innerText: async () => cell
                                    };
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}

(async () => {
    console.log('\n──────────── ISSUE 1: fetch button gated on license ────────────');

    await test('updateLicenseUIState toggles disabled/opacity/pointerEvents on btnFetchDeliveryReport', () => {
        const fn = slice(rendererSrc, 'function updateLicenseUIState', '\n    }\n    window.updateLicenseUIState', 'license gate');
        assert.ok(fn.includes("getElementById('btnFetchDeliveryReport')"), 'must resolve the button by id');
        assert.ok(fn.includes('btnFetch.disabled = !isValid'), 'must set disabled');
        assert.ok(fn.includes("btnFetch.style.opacity = isValid ? '1' : '0.35'"), 'must set opacity');
        assert.ok(fn.includes("btnFetch.style.pointerEvents = isValid ? 'auto' : 'none'"), 'must set pointerEvents');
    });

    await test('button starts locked before verification completes', () => {
        const init = slice(rendererSrc, 'window.updateLicenseUIState = updateLicenseUIState', 'function formatExpiryDate', 'initial lock');
        assert.ok(/updateLicenseUIState\(false\);/.test(init), 'must lock the button at startup');
    });

    await test('every isLicenseValid transition re-applies the gate', () => {
        // verified / invalid / no-license / expired / invalid-credentials / verifying
        const trueCalls = (rendererSrc.match(/updateLicenseUIState\(true\)/g) || []).length;
        const falseCalls = (rendererSrc.match(/updateLicenseUIState\(false\)/g) || []).length;
        assert.ok(trueCalls >= 1, 'valid branch must unlock');
        assert.ok(falseCalls >= 5, `invalid/expired/unverified branches must lock (found ${falseCalls})`);
        assert.ok(rendererSrc.includes('updateLicenseUIState(Boolean(isValid))'), 'applyLicenseState must gate centrally');
        assert.ok(rendererSrc.includes('updateLicenseUIState(isLicenseValid)'), 'setDeliveryButtonState must not blindly re-enable');
    });

    await test('a running fetch keeps the Stop control usable even if the license flips', () => {
        assert.ok(rendererSrc.includes('if (!isValid && window.__nexusDeliveryFetchRunning) return;'), 'must skip locking mid-run');
        assert.ok(rendererSrc.includes('window.__nexusDeliveryFetchRunning = running;'), 'must publish the running flag');
    });

    console.log('\n──────────── ISSUE 2: Total Delivered read positionally ────────────');

    await test('reads cell 1 (Total Delivered) and cell 2 (via Operator App) of the first data row', async () => {
        const page = makePage([
            ['Mode', 'Total Delivered', 'Delivery Via Operator App'],
            ['DC', '284', '211']
        ]);
        assert.strictEqual(await S.readSummaryCell(page, 1), 284);
        assert.strictEqual(await S.readSummaryCell(page, 2), 211);
    });

    await test('thousands separators parse correctly', async () => {
        const page = makePage([['h', 'h', 'h'], ['DC', ' 1,284 ', '1,011']]);
        assert.strictEqual(await S.readSummaryCell(page, 1), 1284);
        assert.strictEqual(await S.readSummaryCell(page, 2), 1011);
    });

    await test('a genuine zero returns 0, not null (so no bogus fallback)', async () => {
        const page = makePage([['h', 'h', 'h'], ['DC', '0', '0']]);
        assert.strictEqual(await S.readSummaryCell(page, 1), 0);
    });

    await test('unreadable table returns null so the caller can fall back', async () => {
        assert.strictEqual(await S.readSummaryCell(makePage([]), 1), null);
        assert.strictEqual(await S.readSummaryCell(makePage([['h'], ['DC', '']]), 1), null);
        assert.strictEqual(await S.readSummaryCell(makePage([['h'], ['DC', '7']], { throwOn: 'divModesViaDC' }), 1), null);
    });

    await test('positional read wins over the legacy text-matching evaluation', () => {
        const flow = slice(scraperSrc, 'const cellTotalDelivered', 'onProgress({ phase: \'summary\'', 'summary flow');
        assert.ok(flow.includes('cellTotalDelivered !== null ? cellTotalDelivered : toInt(summary.totalDelivered)'), 'total must prefer the cell read');
        assert.ok(flow.includes('cellDeliveredViaApp !== null ? cellDeliveredViaApp : toInt(summary.deliveredViaApp)'), 'app count must prefer the cell read');
        assert.ok(/if \(cellTotalDelivered === null \|\| cellDeliveredViaApp === null\)/.test(flow), 'EVAL_SUMMARY only runs as a fallback');
    });

    console.log('\n──────────── ISSUES 3 & 4: no data loss on stop / refresh ────────────');

    await test('storage key is nexus_saved_delivery_report', () => {
        assert.strictEqual(R.DELIVERY_REPORT_STORAGE_KEY, 'nexus_saved_delivery_report');
    });

    await test('first run persists records and a descending operator summary', () => {
        store.clear();
        const merged = R.mergeAndPersistDeliveryReport({
            totalDelivered: 5, deliveredViaApp: 4, stopped: false,
            rawRecords: [
                { consumerNumber: '1', consumerName: 'A', operatorName: 'Ravi', areaDescription: 'Z1' },
                { consumerNumber: '2', consumerName: 'B', operatorName: 'Ravi', areaDescription: 'Z1' },
                { consumerNumber: '3', consumerName: 'C', operatorName: 'Amit', areaDescription: 'Z2' }
            ]
        });
        assert.strictEqual(merged.rawRecords.length, 3);
        assert.deepStrictEqual(plain(merged.operatorSummary.map(o => o.operatorName)), ['Ravi', 'Amit']);
        assert.deepStrictEqual(plain(merged.operatorSummary.map(o => o.count)), [2, 1]);
        assert.ok(store.has('nexus_saved_delivery_report'), 'must persist to localStorage');
    });

    await test('a second run UPSERTS by consumerNumber (appends new, never wipes)', () => {
        const merged = R.mergeAndPersistDeliveryReport({
            totalDelivered: 7, deliveredViaApp: 6, stopped: false,
            rawRecords: [
                { consumerNumber: '3', consumerName: 'C', operatorName: 'Amit', areaDescription: 'Z2' },
                { consumerNumber: '4', consumerName: 'D', operatorName: 'Amit', areaDescription: 'Z3' }
            ]
        });
        assert.strictEqual(merged.rawRecords.length, 4, 'consumers 1 and 2 must survive');
        assert.strictEqual(merged.addedThisRun, 1, 'only consumer 4 is new');
        assert.deepStrictEqual(
            plain(merged.rawRecords.map(r => r.consumerNumber).sort()),
            ['1', '2', '3', '4']
        );
        assert.deepStrictEqual(plain(merged.operatorSummary.map(o => o.count)), [2, 2]);
    });

    await test('stopping with ZERO records keeps the previous dataset intact', () => {
        const before = R.loadSavedDeliveryReport();
        const merged = R.mergeAndPersistDeliveryReport({
            totalDelivered: 0, deliveredViaApp: 0, stopped: true, rawRecords: []
        });
        assert.strictEqual(merged.rawRecords.length, before.rawRecords.length, 'records must not be wiped');
        assert.strictEqual(merged.totalDelivered, before.totalDelivered, 'a 0 reading must not clobber the last good total');
        assert.strictEqual(merged.deliveredViaApp, before.deliveredViaApp, 'a 0 reading must not clobber the last good app count');
        assert.strictEqual(R.loadSavedDeliveryReport().rawRecords.length, before.rawRecords.length);
    });

    await test('an early stop WITH records still merges them in', () => {
        const merged = R.mergeAndPersistDeliveryReport({
            totalDelivered: 9, deliveredViaApp: 8, stopped: true,
            rawRecords: [{ consumerNumber: '5', consumerName: 'E', operatorName: 'Ravi', areaDescription: 'Z4' }]
        });
        assert.strictEqual(merged.rawRecords.length, 5);
        assert.strictEqual(merged.stopped, true);
        assert.strictEqual(merged.totalDelivered, 9);
        assert.deepStrictEqual(plain(merged.operatorSummary.map(o => o.operatorName)), ['Ravi', 'Amit']);
        assert.deepStrictEqual(plain(merged.operatorSummary.map(o => o.count)), [3, 2]);
    });

    await test('a refresh reads the same dataset back (survives reload)', () => {
        const reloaded = R.loadSavedDeliveryReport();
        assert.strictEqual(reloaded.rawRecords.length, 5);
        assert.strictEqual(reloaded.operatorSummary[0].operatorName, 'Ravi');
        assert.strictEqual(reloaded.totalDelivered, 9);
    });

    await test('corrupt cached JSON degrades to null instead of throwing', () => {
        store.set('nexus_saved_delivery_report', '{not json');
        assert.strictEqual(R.loadSavedDeliveryReport(), null);
    });

    await test('blank consumer numbers are dropped from the merged set', () => {
        store.clear();
        const merged = R.mergeAndPersistDeliveryReport({
            rawRecords: [
                { consumerNumber: '  ', operatorName: 'X' },
                { consumerNumber: '10', operatorName: 'X' }
            ]
        });
        assert.strictEqual(merged.rawRecords.length, 1);
    });

    await test('operators with no name roll up as "Unassigned"', () => {
        store.clear();
        const summary = R.buildOperatorSummaryFromRecords([
            { consumerNumber: '1', operatorName: '' },
            { consumerNumber: '2' }
        ]);
        assert.deepStrictEqual(plain(summary), [{ operatorName: 'Unassigned', count: 2 }]);
    });

    await test('startup hydration restores the cache and reveals "View last report"', () => {
        const hydrate = slice(rendererSrc, 'function hydrateSavedDeliveryReport', '\n    }\n', 'hydration');
        assert.ok(hydrate.includes('loadSavedDeliveryReport()'), 'must read the cache on startup');
        assert.ok(hydrate.includes('latestDeliveryReport = saved'), 'must restore into memory');
        assert.ok(hydrate.includes("btnViewLastDeliveryReport.classList.remove('hidden')"), 'must unhide the link');
        assert.ok(
            rendererSrc.includes('const report = latestDeliveryReport || loadSavedDeliveryReport();'),
            'the View-last click must fall back to the cache'
        );
    });

    await test('the completion handler renders the MERGED payload, not the raw one', () => {
        const handler = slice(rendererSrc, "ipcRenderer.on('delivery-report-complete'", 'ipcRenderer.on(\'delivery-report-error\'', 'complete handler');
        assert.ok(handler.includes('const merged = mergeAndPersistDeliveryReport(report);'), 'must merge');
        assert.ok(handler.includes('latestDeliveryReport = merged;'), 'must cache the merged payload');
        assert.ok(handler.includes('renderDeliveryReport(merged);'), 'must render the merged payload');
    });

    await test('credential wipe never clears the saved report', () => {
        assert.ok(
            !/removeItem\(['"]nexus_saved_delivery_report['"]\)/.test(rendererSrc),
            'the report cache must not be cleared with credentials'
        );
    });

    console.log('\n──────────── ISSUE 5: confirmation before fetch ────────────');

    await test('index.html carries the confirmation dialog with both buttons', () => {
        assert.ok(htmlSrc.includes('id="deliveryConfirmModal"'), 'modal must exist');
        assert.ok(htmlSrc.includes('Do you want to start fetching the Delivery Report?'), 'exact prompt text');
        assert.ok(htmlSrc.includes('id="btnConfirmFetchDelivery"'), 'Yes, Start button');
        assert.ok(htmlSrc.includes('id="btnCancelFetchDelivery"'), 'Cancel button');
        assert.ok(/id="deliveryConfirmModal"[^>]*class="[^"]*\bhidden\b/.test(htmlSrc), 'must start hidden');
    });

    await test('the click handler opens the dialog instead of scraping instantly', () => {
        const handler = slice(rendererSrc, 'btnFetchDeliveryReport.addEventListener', 'if (btnConfirmFetchDelivery)', 'fetch click');
        assert.ok(!handler.includes("invoke('start-delivery-report'"), 'must NOT start scraping on the click');
        assert.ok(handler.includes('openDeliveryConfirmModal()'), 'must open the confirmation');
        assert.ok(handler.includes("window.confirm('Do you want to start fetching the Delivery Report?')"), 'native fallback prompt');
    });

    await test('only the confirm button reaches start-delivery-report', () => {
        const exec = slice(rendererSrc, 'async function executeDeliveryReportFetch', 'btnFetchDeliveryReport.addEventListener', 'execute fn');
        assert.ok(exec.includes("ipcRenderer.invoke('start-delivery-report'"), 'the confirmed path runs the scrape');
        assert.ok(exec.includes('if (!isLicenseValid)'), 'and re-checks the license after confirmation');
        const confirmWiring = slice(rendererSrc, 'if (btnConfirmFetchDelivery)', 'if (btnCancelFetchDelivery)', 'confirm wiring');
        assert.ok(confirmWiring.includes('executeDeliveryReportFetch();'), 'Yes, Start must trigger the fetch');
    });

    // NOTE: superseded by the later 'Keep Running' work - a mid-run click now
    // opens the stop confirmation instead of stopping outright.
    await test('a mid-run click reaches the stop path (now via confirmation)', () => {
        const handler = slice(rendererSrc, 'btnFetchDeliveryReport.addEventListener', 'if (!isLicenseValid)', 'stop branch');
        assert.ok(handler.includes('openDeliveryStopConfirmModal()'), 'running click must open the stop confirmation');
        assert.ok(!handler.includes("invoke('start-delivery-report')"), 'running click must never re-start a fetch');
    });

    console.log('\n──────────── ISSUE 6: no pop-to-front, fast cancel ────────────');

    await test('no bringToFront anywhere in the scraper or runners', () => {
        const files = [
            SCRAPER,
            path.join(ROOT, 'desktop-app', 'bela_nexus_runner.js'),
            path.join(ROOT, 'desktop-app', 'automationRunner.js'),
            path.join(ROOT, 'bela_nexus_runner.js'),
            path.join(ROOT, 'master_automation.js')
        ].filter(fs.existsSync);
        for (const f of files) {
            assert.ok(!fs.readFileSync(f, 'utf8').includes('bringToFront'), `${path.basename(f)} must not call bringToFront`);
        }
    });

    await test('pagination checks the stop token BEFORE and AFTER each navigation', () => {
        const loop = slice(scraperSrc, 'if (targetIndex < 0)', 'let after = { current:', 'pagination loop');
        assert.ok(loop.includes('// ---- BEFORE navigation'), 'pre-navigation check');
        assert.ok(loop.includes('// ---- AFTER navigation'), 'post-navigation check');
        const checks = (loop.match(/isDeliveryReportStopRequested\(\)/g) || []).length;
        assert.ok(checks >= 2, `expected >= 2 stop checks around navigation, found ${checks}`);
        assert.ok(loop.includes('clickOutcome === STOP_SENTINEL'), 'the click itself must be cancellable');
    });

    await test('raceStop returns immediately when stop is already requested', async () => {
        stopFlag = true;
        const never = new Promise(() => {});
        const started = Date.now();
        assert.strictEqual(await S.raceStop(never), S.STOP_SENTINEL);
        assert.ok(Date.now() - started < 100, 'must not wait on the pending promise');
        stopFlag = false;
    });

    await test('raceStop aborts an in-flight wait as soon as Stop is pressed', async () => {
        stopFlag = false;
        const longWait = new Promise((resolve) => setTimeout(() => resolve('too-late'), 15000));
        const started = Date.now();
        setTimeout(() => { stopFlag = true; }, 120);
        const result = await S.raceStop(longWait);
        const elapsed = Date.now() - started;
        stopFlag = false;
        assert.strictEqual(result, S.STOP_SENTINEL, 'must resolve with the stop sentinel');
        assert.ok(elapsed < 1500, `must abort promptly, took ${elapsed}ms`);
    });

    await test('raceStop passes the real value through when no stop happens', async () => {
        stopFlag = false;
        assert.strictEqual(await S.raceStop(Promise.resolve('ok')), 'ok');
        assert.strictEqual(await S.raceStop(Promise.reject(new Error('boom'))), null, 'rejections degrade to null');
    });

    await test('waitForTableRefresh no longer blocks on load states during a stop', () => {
        const fn = slice(scraperSrc, 'async function waitForTableRefresh', 'buildOperatorSummary', 'waitForTableRefresh');
        assert.ok(fn.includes("raceStop(page.waitForLoadState('domcontentloaded'))"), 'domcontentloaded wait must be cancellable');
        assert.ok(fn.includes("raceStop(page.waitForLoadState('networkidle'"), 'networkidle wait must be cancellable');
    });

    await test('closePageFast cannot hang the teardown', async () => {
        const started = Date.now();
        await S.closePageFast({ close: () => new Promise(() => {}) }, 200);
        assert.ok(Date.now() - started < 1200, 'a hung close must time out');
        await S.closePageFast({ close: async () => { throw new Error('already closed'); } }, 200);
        await S.closePageFast(null);
    });

    await test('the stopped run tears both pages down via the fast path', () => {
        assert.ok(scraperSrc.includes('await closePageFast(page2);'), 'page2 fast close');
        assert.ok(scraperSrc.includes('await closePageFast(page1);'), 'page1 fast close');
    });

    console.log('\n──────────── PRESERVATION ────────────');

    await test('captcha solving, R2/QR logic and cash-memo cancellation untouched', () => {
        assert.ok(scraperSrc.includes('anticaptchaApiKey'), 'captcha key still threaded through login');
        assert.ok(scraperSrc.includes('verifyLicenseAndFetchManifest'), 'licence manifest flow intact');
        assert.ok(scraperSrc.includes('performLogin'), 'shared login intact');
        assert.ok(rendererSrc.includes('executeStartCancellation'), 'cancellation flow intact');
        assert.ok(rendererSrc.includes('openStartConfirmModal'), 'cash-memo start confirmation intact');
        assert.ok(htmlSrc.includes('id="startConfirmModal"'), 'cancellation confirm modal intact');
        assert.ok(htmlSrc.includes('id="stopConfirmModal"'), 'stop modal hook intact');
    });

    await test('EVAL_* raw strings kept (obfuscation-safe page.evaluate)', () => {
        assert.ok(scraperSrc.includes('const EVAL_ROWS = `'), 'EVAL_ROWS still a raw string');
        assert.ok(scraperSrc.includes('const EVAL_PAGER = `'), 'EVAL_PAGER still a raw string');
        assert.ok(scraperSrc.includes('const EVAL_SUMMARY = `'), 'EVAL_SUMMARY still a raw string');
        assert.ok(!/page2?\.evaluate\(\s*\(/.test(scraperSrc), 'no arrow function passed to page.evaluate');
    });

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(64)}\n`);
    // exitCode, not process.exit() - the latter can truncate buffered stdout.
    process.exitCode = failed === 0 ? 0 : 1;
})();
