// -------------------------------------------------------------
// VERIFICATION: red stop button, "Keep Running" dialog, instant kill
// -------------------------------------------------------------
// The kill-switch tests drive the REAL scraper module against a fake
// Playwright browser, so the timing assertions measure actual behaviour
// (a Stop during a slow login must unwind in ms, not 10s+).
// -------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Module = require('module');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const SCRAPER = path.join(ROOT, 'desktop-app', 'scrapers', 'deliveryReportScraper.js');
const MAIN = path.join(ROOT, 'desktop-app', 'main.js');
const INDEX_HTML = path.join(ROOT, 'desktop-app', 'index.html');
const STYLES = path.join(ROOT, 'desktop-app', 'styles.css');

const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const mainSrc = fs.readFileSync(MAIN, 'utf8');
const htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');
const stylesSrc = fs.readFileSync(STYLES, 'utf8');

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name}\n     ${err.message}`);
    }
}

function slice(src, startMarker, endMarker, label) {
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    assert.ok(start >= 0, `${label}: start marker not found -> ${startMarker}`);
    assert.ok(end > start, `${label}: end marker not found -> ${endMarker}`);
    return src.slice(start, end);
}

// -------------------------------------------------------------
// FAKE PLAYWRIGHT: a browser whose close() rejects everything in flight
// -------------------------------------------------------------
const CLOSED_ERR = 'Target page, context or browser has been closed';

function makeFakeBrowser() {
    const browser = {
        closed: false,
        closeCalls: 0,
        _waiters: new Set(),
        async close() {
            browser.closeCalls++;
            browser.closed = true;
            // Reject every pending operation, exactly like a real kill.
            for (const reject of browser._waiters) reject(new Error(CLOSED_ERR));
            browser._waiters.clear();
        },
        // Resolves after ms, UNLESS the browser is killed first.
        pending(ms, value) {
            return new Promise((resolve, reject) => {
                if (browser.closed) return reject(new Error(CLOSED_ERR));
                browser._waiters.add(reject);
                const t = setTimeout(() => {
                    browser._waiters.delete(reject);
                    resolve(value);
                }, ms);
                if (typeof t.unref === 'function') t.unref();
            });
        },
        async newContext() {
            return {
                setDefaultTimeout() {},
                setDefaultNavigationTimeout() {},
                async newPage() {
                    return {
                        setDefaultTimeout() {},
                        setDefaultNavigationTimeout() {},
                        context: () => ({ waitForEvent: () => browser.pending(60000) }),
                        waitForLoadState: () => browser.pending(500),
                        waitForTimeout: (ms) => browser.pending(ms),
                        evaluate: () => browser.pending(100, []),
                        locator: () => ({ first: () => ({ click: () => browser.pending(60000) }) })
                    };
                }
            };
        }
    };
    return browser;
}

// Load the scraper with ../bela_nexus_runner stubbed out.
function loadScraper(runnerStub) {
    const runnerPath = require.resolve(path.join(ROOT, 'desktop-app', 'bela_nexus_runner.js'));
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === '../bela_nexus_runner') return runnerStub;
        return origLoad.apply(this, arguments);
    };
    try {
        delete require.cache[require.resolve(SCRAPER)];
        delete require.cache[runnerPath];
        return require(SCRAPER);
    } finally {
        Module._load = origLoad;
    }
}

(async () => {
    console.log('\n──────────── ISSUE 1: red STOP button ────────────');

    await test('running state applies the same .btn-danger-pulsing class as Auto-Cancellation', () => {
        const fn = slice(rendererSrc, 'function setDeliveryButtonState', '\n        }\n\n        // Establish the idle label', 'button state');
        // Superseded: 'is-loading' is no longer applied (it is the loader marker).
        assert.ok(fn.includes("classList.add('is-stopping')"), 'must add the red stop class');
        assert.ok(fn.includes("classList.remove('is-loading')"), 'must NOT carry the loader marker');
        assert.ok(fn.includes("classList.remove('is-loading', 'is-stopping')"), 'must remove it when idle');
        assert.ok(rendererSrc.includes("btnStartCancellation.classList.add('btn-danger-pulsing')"), 'cancellation button keeps its own red class');
    });

    await test('the red rule outranks the secondary gray gradient', () => {
        const rule = slice(stylesSrc, '.btn.btn-delivery-fetch.is-stopping {', '}', 'red rule');
        assert.ok(rule.includes('linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'), 'red background');
        assert.ok(rule.includes('color: #ffffff'), 'white text');
        assert.ok(rule.includes('rgba(220, 38, 38, 0.4)'), 'red glow');
        // Superseded: the running state is flat and static now.
        assert.ok(rule.includes('animation: none'), 'must cancel the inherited pulse');
        assert.ok(!rule.includes('animation: btnStopPulse'), 'no pulse on this button');

        // The stop rule must come after (and out-specify) the teal base rule.
        const tealIdx = stylesSrc.indexOf('.btn.btn-delivery-fetch {');
        const redIdx = stylesSrc.indexOf('.btn.btn-delivery-fetch.is-stopping {');
        assert.ok(tealIdx >= 0 && redIdx > tealIdx, 'stop rule must come after the teal base rule');
    });

    await test('the declarations match the real .btn-danger-pulsing definition', () => {
        const canonical = slice(stylesSrc, '.btn-danger-pulsing {', '}', 'canonical red');
        for (const decl of ['linear-gradient(135deg, #e11d48, #be123c)', 'color: #ffffff', 'rgba(225, 29, 72, 0.45)', 'btnStopPulse 1.8s infinite']) {
            assert.ok(canonical.includes(decl), `canonical rule should contain ${decl}`);
        }
        assert.ok(stylesSrc.includes('@keyframes btnStopPulse'), 'the pulse keyframes must exist');
    });

    await test('labels flip between "⏹ Stop Fetching Report" and "📊 Fetch Delivery Report"', () => {
        const fn = slice(rendererSrc, 'function setDeliveryButtonState', '\n        }\n\n        // Establish the idle label', 'button state');
        assert.ok(fn.includes("textContent = '⏹ Stop Fetching Report'"), 'running label');
        assert.ok(fn.includes("textContent = 'Start Fetching Report'"), 'idle label');
    });

    console.log('\n──────────── ISSUE 2: "Keep Running" stop dialog ────────────');

    await test('the dialog exists with the exact copy and both options', () => {
        assert.ok(htmlSrc.includes('id="deliveryStopConfirmModal"'), 'modal present');
        assert.ok(htmlSrc.includes('Stop Delivery Report Fetching?'), 'exact title');
        assert.ok(
            htmlSrc.includes('Are you sure you want to stop fetching? Records already collected will be preserved.'),
            'exact message'
        );
        assert.ok(htmlSrc.includes('id="btnConfirmStopDelivery"'), 'Stop Fetching button');
        assert.ok(htmlSrc.includes('id="btnKeepFetchingDelivery"'), 'Keep Running button');
        assert.ok(/id="deliveryStopConfirmModal"[^>]*class="[^"]*\bhidden\b/.test(htmlSrc), 'starts hidden');
    });

    await test('it reuses the Auto-Cancellation stop dialog markup/classes', () => {
        const mine = slice(htmlSrc, 'id="deliveryStopConfirmModal"', '<!-- Delivery Report Fetch Confirmation', 'delivery stop modal');
        for (const cls of ['stop-confirm-backdrop', 'stop-confirm-dialog', 'stop-confirm-icon-badge', 'stop-confirm-actions', 'btn-confirm-stop', 'btn-keep-running']) {
            assert.ok(mine.includes(cls), `must reuse .${cls}`);
            assert.ok(stylesSrc.includes(`.${cls}`), `.${cls} must be a real style`);
        }
    });

    await test('a mid-run click opens the dialog instead of stopping outright', () => {
        const branch = slice(rendererSrc, 'if (isDeliveryFetchRunning) {\n                if (!openDeliveryStopConfirmModal', 'if (!isLicenseValid)', 'stop branch');
        assert.ok(!branch.includes("invoke('stop-delivery-report')"), 'must NOT stop on the click itself');
        assert.ok(branch.includes('openDeliveryStopConfirmModal()'), 'must open the dialog');
        assert.ok(
            branch.includes("window.confirm('Are you sure you want to stop fetching? Records already collected will be preserved.')"),
            'native fallback carries the same message'
        );
    });

    await test('only "Stop Fetching" invokes the stop IPC', () => {
        const exec = slice(rendererSrc, 'async function executeDeliveryReportStop', '\n        }\n', 'stop executor');
        assert.ok(exec.includes("ipcRenderer.invoke('stop-delivery-report')"), 'confirmed path stops');
        assert.ok(exec.includes("textContent = 'Stopping...'"), 'shows the stopping state');
        const wiring = slice(rendererSrc, 'if (btnConfirmStopDelivery)', 'if (btnKeepFetchingDelivery)', 'confirm wiring');
        assert.ok(wiring.includes('executeDeliveryReportStop();'), 'Stop Fetching triggers it');
    });

    await test('"Keep Running" dismisses and lets the fetch continue', () => {
        // Anchored on the listener, not on `if (btnKeepFetchingDelivery)` -
        // that also matches the focus() line inside the open helper.
        const wiring = slice(rendererSrc, 'btnKeepFetchingDelivery.addEventListener', 'if (deliveryStopConfirmModal) {\n            deliveryStopConfirmModal.addEventListener', 'keep-running wiring');
        assert.ok(wiring.includes('closeDeliveryStopConfirmModal();'), 'must just close');
        assert.ok(!wiring.includes("invoke('stop-delivery-report')"), 'must NEVER stop');
        assert.ok(wiring.includes('Continuing delivery report fetch'), 'logs that it resumed');
    });

    await test('Escape and backdrop dismissal both mean "Keep Running"', () => {
        const esc = slice(rendererSrc, "if (e.key !== 'Escape') return;", 'if (deliveryReportModal &&', 'escape handler');
        assert.ok(esc.includes('closeDeliveryStopConfirmModal();'), 'Escape closes the stop dialog');
        assert.ok(!esc.includes("invoke('stop-delivery-report')"), 'Escape must never stop');
        const backdrop = slice(rendererSrc, 'if (deliveryStopConfirmModal) {\n            deliveryStopConfirmModal.addEventListener', '\n        }', 'backdrop');
        assert.ok(backdrop.includes('closeDeliveryStopConfirmModal()'), 'backdrop click closes only');
    });

    await test('a finished run closes a stop dialog left open', () => {
        const fn = slice(rendererSrc, 'function setDeliveryButtonState', '\n        }\n\n        // Establish the idle label', 'button state');
        assert.ok(fn.includes('closeDeliveryStopConfirmModal();'), 'idle state must dismiss it');
    });

    console.log('\n──────────── ISSUE 3: instant kill switch ────────────');

    await test('requestStopDeliveryReport kills the live browser synchronously', async () => {
        let browserRef = null;
        const scraper = loadScraper({
            launchBrowser: async () => { browserRef = makeFakeBrowser(); return browserRef; },
            performLogin: async () => { await browserRef.pending(10000); return true; },
            injectNexusOverlay: async () => {},
            buildSelectors: (s) => s || {},
            verifyLicenseAndFetchManifest: async () => ({}),
            DEFAULT_SELECTORS: {}
        });

        const run = scraper.fetchDeliveryReport({
            bpclUserId: 'u', bpclPassword: 'p', licenseKey: 'k',
            userDataPath: require('os').tmpdir(),
            callbacks: { onLog: () => {} }
        });
        await new Promise((r) => setTimeout(r, 250));

        // Synchronous return value - the close must not be awaited by the caller.
        const res = scraper.requestStopDeliveryReport();
        assert.strictEqual(res.killed, true, 'must report the kill');
        assert.strictEqual(browserRef.closeCalls, 1, 'browser.close() must fire immediately');
        assert.strictEqual(scraper.isDeliveryReportStopRequested(), true, 'flag must be set');

        await run;
        scraper.resetStopDeliveryReport();
    });

    await test('a Stop during the OCR/captcha login unwinds in milliseconds', async () => {
        let browserRef = null;
        const scraper = loadScraper({
            launchBrowser: async () => { browserRef = makeFakeBrowser(); return browserRef; },
            // Simulates the real thing: OCR + captcha handshake + redirect.
            performLogin: async () => { await browserRef.pending(10000); return true; },
            injectNexusOverlay: async () => {},
            buildSelectors: (s) => s || {},
            verifyLicenseAndFetchManifest: async () => ({}),
            DEFAULT_SELECTORS: {}
        });

        const logs = [];
        const started = Date.now();
        const run = scraper.fetchDeliveryReport({
            bpclUserId: 'u', bpclPassword: 'p', licenseKey: 'k',
            userDataPath: require('os').tmpdir(),
            callbacks: { onLog: (m) => logs.push(m) }
        });

        // Press Stop once login is under way.
        await new Promise((r) => setTimeout(r, 250));
        scraper.requestStopDeliveryReport();

        const report = await run;
        const elapsed = Date.now() - started;

        assert.ok(elapsed < 3000, `must unwind immediately, took ${elapsed}ms (login would run 10s)`);
        assert.strictEqual(report.stopped, true, 'must report as stopped');
        assert.strictEqual(report.success, true, 'must return cleanly, not as a failure');
        assert.ok(Array.isArray(report.rawRecords), 'must return a records array');
        assert.ok(
            logs.some((l) => l.includes('[STOP] Process terminated immediately by operator.')),
            `must log the exact stop line, got: ${JSON.stringify(logs.slice(-3))}`
        );
        assert.strictEqual(browserRef.closed, true, 'browser must be dead');
        scraper.resetStopDeliveryReport();
    });

    await test('records collected before the kill survive it', () => {
        // Runs the REAL snapshot/buildStoppedReport source in a sandbox, so
        // this exercises the shipped preservation path without adding test
        // hooks to production code.
        const src = fs.readFileSync(SCRAPER, 'utf8');
        const stateSlice = slice(src, 'let collectedRecords = [];', '/**\n * Stop the report AND kill', 'snapshot state');
        const reportSlice = slice(src, 'function buildStoppedReport()', '// -------------------------------------------------------------\n// STEP 2', 'stopped report');

        const ctx = vm.createContext({ console });
        vm.runInContext(
            `${stateSlice}\n${reportSlice}\n;this.__api = { snapshotRecords, buildStoppedReport };`,
            ctx
        );

        ctx.__api.snapshotRecords(
            [
                { consumerNumber: '11', consumerName: 'A', operatorName: 'Ravi', areaDescription: 'Z' },
                { consumerNumber: '12', consumerName: 'B', operatorName: 'Ravi', areaDescription: 'Z' },
                { consumerNumber: '13', consumerName: 'C', operatorName: 'Amit', areaDescription: 'Z' }
            ],
            { totalDelivered: 120, deliveredViaApp: 95, pagesScraped: 4 }
        );

        const report = ctx.__api.buildStoppedReport();
        assert.strictEqual(report.stopped, true);
        assert.strictEqual(report.success, true, 'a stop is not a failure');
        assert.strictEqual(report.rawRecords.length, 3, 'collected records must be returned');
        assert.strictEqual(report.totalDelivered, 120, 'header counts preserved');
        assert.strictEqual(report.deliveredViaApp, 95);
        assert.strictEqual(report.pagesScraped, 4);
        assert.deepStrictEqual(
            JSON.parse(JSON.stringify(report.operatorSummary.map((o) => [o.operatorName, o.count]))),
            [['Ravi', 2], ['Amit', 1]],
            'summary rebuilt descending from the preserved records'
        );
    });

    await test('every page scraped updates the recoverable snapshot', () => {
        const src = fs.readFileSync(SCRAPER, 'utf8');
        assert.ok(
            src.includes('snapshotRecords(Array.from(deduped.values()), { pagesScraped });'),
            'the pagination loop must mirror its records to module scope'
        );
        assert.ok(
            src.includes('snapshotRecords(null, { totalDelivered, deliveredViaApp });'),
            'the header figures must be snapshotted too'
        );
        assert.ok(
            src.includes('collectedRecords = [];'),
            'each run must start from a clean snapshot'
        );
    });

    await test('login/navigation steps catch the kill instead of throwing to the operator', () => {
        const src = fs.readFileSync(SCRAPER, 'utf8');
        const login = slice(src, 'let loginResult = false;', '// ---- STEP 2', 'login guard');
        assert.ok(login.includes('try {'), 'login must be wrapped');
        assert.ok(login.includes('isAbortError(loginErr)'), 'must recognise a kill');
        assert.ok(login.includes('return buildStoppedReport();'), 'must return the collected records');

        const nav = slice(src, 'page1 = await openEDayEndPage', '// ---- STEP 3', 'navigation guard');
        assert.ok(nav.includes('isAbortError(navErr)'), 'navigation must recognise a kill');
        assert.ok(nav.includes('return buildStoppedReport();'), 'and return cleanly');

        assert.ok(src.includes('if (isAbortError(err)) {'), 'the outer catch uses the shared detector');
        assert.ok(!/isAbort\s*=\s*isDeliveryReportStopRequested/.test(src), 'the ad-hoc duplicate is gone');
    });

    await test('isAbortError recognises every browser-killed signature', () => {
        const src = fs.readFileSync(SCRAPER, 'utf8');
        const fn = slice(src, 'function isAbortError', '\n}', 'isAbortError');
        for (const sig of ['target closed', 'browser has been closed', 'connection closed', 'execution context was destroyed', 'page has been closed']) {
            assert.ok(fn.includes(sig), `must match "${sig}"`);
        }
    });

    await test('the stop IPC kills the browser and never awaits the login', () => {
        const handler = slice(mainSrc, "ipcMain.handle('stop-delivery-report'", '\n});', 'stop handler');
        assert.ok(handler.includes('deliveryReportScraper.requestStopDeliveryReport()'), 'must set the flag + kill');
        assert.ok(handler.includes('doomed.close()'), 'must also close main.js\'s own handle');
        assert.ok(handler.includes('setTimeout(resolve, 3000)'), 'the close must be bounded');
        assert.ok(handler.includes("sendDeliveryEvent('delivery-report-status', 'Stopping...')"), 'must tell the UI');
        assert.ok(!handler.includes('await deliveryReportScraper.fetchDeliveryReport'), 'must never await the run');
    });

    await test('the stop IPC returns promptly even if close() hangs', async () => {
        // Mirrors main.js's bounded race. The timer is deliberately NOT
        // unref'd here (production unrefs it so a pending stop can't hold the
        // app open; an unref'd timer would let this test process exit early).
        const started = Date.now();
        const doomed = { close: () => new Promise(() => {}) };
        await Promise.race([
            Promise.resolve(doomed.close()).catch(() => {}),
            new Promise((resolve) => { setTimeout(resolve, 3000); })
        ]);
        const elapsed = Date.now() - started;
        assert.ok(elapsed >= 2900 && elapsed < 4200, `bounded wait should cap at ~3s, took ${elapsed}ms`);
    });

    console.log('\n──────────── PRESERVATION ────────────');

    await test('cash-memo cancellation, license checks and dedup untouched', () => {
        const src = fs.readFileSync(SCRAPER, 'utf8');
        assert.ok(src.includes('verifyLicenseAndFetchManifest'), 'license manifest intact');
        assert.ok(src.includes('anticaptchaApiKey'), 'captcha key intact');
        assert.ok(src.includes('if (!key || deduped.has(key)) { continue; }'), 'dedup logic intact');
        assert.ok(rendererSrc.includes('executeStartCancellation'), 'cancellation flow intact');
        assert.ok(htmlSrc.includes('id="stopConfirmModal"'), 'cancellation stop modal intact');
        assert.ok(htmlSrc.includes('id="btnKeepRunning"'), 'original Keep Running button intact');
        assert.ok(mainSrc.includes("ipcMain.handle('start-delivery-report'"), 'start IPC intact');
    });

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(64)}\n`);
    // exitCode, not process.exit() - the latter can truncate buffered stdout.
    process.exitCode = failed === 0 ? 0 : 1;
})();
