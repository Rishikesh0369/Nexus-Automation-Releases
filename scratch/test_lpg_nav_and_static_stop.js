// -------------------------------------------------------------
// VERIFICATION: LPG One navigation fix + spinner-free stop button
// -------------------------------------------------------------
// The navigation test drives the REAL openEDayEndPage against a fake
// Playwright page that reproduces the reported failure ("Element is not
// visible" on a collapsed dropdown), so the fallback is exercised, not just
// inspected.
// -------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const SCRAPER = path.join(ROOT, 'desktop-app', 'scrapers', 'deliveryReportScraper.js');
const RUNNER = path.join(ROOT, 'desktop-app', 'bela_nexus_runner.js');
const INDEX_HTML = path.join(ROOT, 'desktop-app', 'index.html');

const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const scraperSrc = fs.readFileSync(SCRAPER, 'utf8');
const runnerSrc = fs.readFileSync(RUNNER, 'utf8');
const htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');

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
// FAKE PLAYWRIGHT PAGE
// -------------------------------------------------------------
// Models the real failure mode: while the "My Application" dropdown is closed
// the LPG One anchor is attached but NOT visible, and Playwright rejects a
// click on it - force: true included, because there is no box to click.
// -------------------------------------------------------------
function makeFakePage(opts = {}) {
    const {
        startUrl = 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO',
        hoverOpensMenu = true,
        clickOpensMenu = true,
        opensAs = 'popup'          // 'popup' | 'page'
    } = opts;

    const log = [];
    const state = { url: startUrl, menuOpen: false, popupOpened: false };

    const page1 = {
        waitForLoadState: async () => {},
        getByRole: () => makeLocator(page1, 'role', true),
        locator: () => makeLocator(page1, 'css', true),
        url: () => 'https://lpgone.example/eDayEnd'
    };

    function makeLocator(owner, kind, alwaysVisible) {
        const isLpgOne = kind === 'lpgone';
        const self = {
            first: () => self,
            async hover() {
                log.push('hover:myapp');
                if (hoverOpensMenu) state.menuOpen = true;
            },
            async isVisible() {
                if (alwaysVisible) return true;
                return isLpgOne ? state.menuOpen : true;
            },
            async waitFor({ state: want }) {
                // Attached is always satisfiable - that is the point of the fix.
                if (want === 'attached') return;
                if (!alwaysVisible && isLpgOne && !state.menuOpen) {
                    throw new Error('locator.waitFor: Timeout waiting for visible');
                }
            },
            async click(options = {}) {
                if (isLpgOne) {
                    log.push(`click:lpgone${options.force ? ':force' : ''}`);
                    if (!state.menuOpen) {
                        // The exact production failure.
                        throw new Error('locator.click: Element is not visible');
                    }
                    state.popupOpened = true;
                    return;
                }
                log.push('click:myapp');
                if (clickOpensMenu) state.menuOpen = true;
            }
        };
        return self;
    }

    const page = {
        _log: log,
        _state: state,
        url: () => state.url,
        async goto(url) { log.push(`goto:${url}`); state.url = url; },
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
        mouse: { move: async () => { log.push('mouse:reset'); } },
        getByRole: (_role, { name } = {}) =>
            makeLocator(page, /LPG/i.test(name || '') ? 'lpgone' : 'role', false),
        locator: (sel) => makeLocator(page, /LPG One/i.test(sel) ? 'lpgone' : 'css', false),
        async evaluate() {
            // DOM click needs no box - always succeeds if the anchor exists.
            log.push('evaluate:domclick');
            state.popupOpened = true;
            return true;
        },
        async waitForEvent(name) {
            if (name !== 'popup') throw new Error(`unexpected event ${name}`);
            // Real Playwright honours the timeout option and rejects; the fake
            // must too, or the losing side of the race hangs forever.
            if (opensAs !== 'popup') return rejectAfter('popup');
            return waitForOpen();
        },
        context: () => ({
            async waitForEvent(name) {
                if (name !== 'page') throw new Error(`unexpected event ${name}`);
                if (opensAs !== 'page') return rejectAfter('page');
                return waitForOpen();
            }
        })
    };

    function rejectAfter(kind) {
        return new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error(`waitForEvent(${kind}): Timeout exceeded`)), 60);
        });
    }

    function waitForOpen() {
        // NOT unref'd: this poller is the only thing holding the event loop
        // open while the routine runs, and an unref'd timer would let the test
        // process exit silently mid-suite.
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                if (state.popupOpened) { clearInterval(timer); resolve(page1); }
            }, 5);
        });
    }

    return page;
}

// Run the REAL openEDayEndPage in a sandbox with its dependencies stubbed.
function loadOpenEDayEndPage() {
    const fnSrc = slice(
        scraperSrc,
        'async function openEDayEndPage(page, activeSelectors, log)',
        '\n// -------------------------------------------------------------\n// STEP 5',
        'openEDayEndPage'
    );
    const ctx = vm.createContext({
        console,
        DASHBOARD_URL: 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO',
        EVAL_CLICK_LPG_ONE: '__eval_click__',
        isDeliveryReportStopRequested: () => false,
        isAbortError: () => false
    });
    vm.runInContext(`${fnSrc}\n;this.__fn = openEDayEndPage;`, ctx);
    return ctx.__fn;
}

(async () => {
    console.log('\n──────────── FIX 1: LPG One navigation ────────────');

    const openEDayEndPage = loadOpenEDayEndPage();
    const selectors = {};

    await test('the happy path (hover opens the menu) still works', async () => {
        const page = makeFakePage({ hoverOpensMenu: true });
        const page1 = await openEDayEndPage(page, selectors, () => {});
        assert.ok(page1, 'must return the LPG One page');
        assert.ok(page._log.includes('hover:myapp'), 'must hover the menu first');
        assert.ok(page._log.some((l) => l.startsWith('click:lpgone')), 'must click LPG One');
        assert.ok(!page._log.includes('evaluate:domclick'), 'no fallback needed');
    });

    await test('hover failing falls through to clicking "My Application"', async () => {
        const page = makeFakePage({ hoverOpensMenu: false, clickOpensMenu: true });
        const page1 = await openEDayEndPage(page, selectors, () => {});
        assert.ok(page1, 'must still reach the LPG One page');
        assert.ok(page._log.includes('click:myapp'), 'must click the menu open');
        assert.ok(!page._log.includes('evaluate:domclick'), 'the click fallback was enough');
    });

    await test('THE BUG: menu never opens -> DOM-click fallback recovers instead of crashing', async () => {
        const page = makeFakePage({ hoverOpensMenu: false, clickOpensMenu: false });
        const page1 = await openEDayEndPage(page, selectors, () => {});
        assert.ok(page1, 'must recover and return the page, not throw');
        assert.ok(
            page._log.some((l) => l === 'click:lpgone:force'),
            'must have attempted the forced click first'
        );
        assert.ok(page._log.includes('evaluate:domclick'), 'must fall back to the DOM click');
    });

    await test('the menu opener retries and resets the pointer between attempts', async () => {
        const page = makeFakePage({ hoverOpensMenu: false, clickOpensMenu: false });
        await openEDayEndPage(page, selectors, () => {});
        const hovers = page._log.filter((l) => l === 'hover:myapp').length;
        assert.strictEqual(hovers, 3, 'must retry the hover 3 times like the cash-memo runner');
        assert.ok(page._log.includes('mouse:reset'), 'must reset the pointer between attempts');
    });

    await test('an off-dashboard page is navigated back to the self-service menu', async () => {
        const page = makeFakePage({ startUrl: 'https://econnect.bpcl.in/somewhere/else' });
        await openEDayEndPage(page, selectors, () => {});
        assert.ok(
            page._log.some((l) => l === 'goto:https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO'),
            'must navigate to the dashboard first'
        );
    });

    await test('already on the dashboard = no redundant navigation', async () => {
        const page = makeFakePage();
        await openEDayEndPage(page, selectors, () => {});
        assert.ok(!page._log.some((l) => l.startsWith('goto:')), 'must not re-navigate');
    });

    await test('both window shapes work: popup AND new tab', async () => {
        for (const opensAs of ['popup', 'page']) {
            const page = makeFakePage({ opensAs });
            const page1 = await openEDayEndPage(page, selectors, () => {});
            assert.ok(page1, `must handle opensAs=${opensAs}`);
        }
    });

    await test('the routine matches the cash-memo runner it was modelled on', () => {
        const fn = slice(scraperSrc, 'async function openEDayEndPage', '\n// ----', 'openEDayEndPage');
        // Same landing page, same menu selectors, same 3-attempt hover/click opener.
        assert.ok(scraperSrc.includes("'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO'"), 'same dashboard URL');
        assert.ok(runnerSrc.includes("'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO'"), 'runner uses the same URL');
        for (const sel of ['a:has-text("My Application"), a:has-text("MY APPLICATION")', 'a:has-text("LPG One"), a:has-text("LPG ONE")']) {
            assert.ok(fn.includes(sel), `must reuse the runner selector ${sel}`);
            assert.ok(runnerSrc.includes(sel), 'runner must define the same selector');
        }
        assert.ok(fn.includes("waitFor({ state: 'attached', timeout: 15000 })"), 'attached-wait per spec');
        assert.ok(fn.includes("getByRole('link', { name: linkLpgOne })"), 'role-based LPG One locator');
        assert.ok(fn.includes('click({ force: true, timeout: 20000 })'), 'forced click');
        assert.ok(fn.includes("waitForLoadState('networkidle'"), 'networkidle settle on the new page');
    });

    await test('E-Day End and Proceed retry with force: true', () => {
        const fn = slice(scraperSrc, 'log(`🖱️ Clicking on "${linkEDayEnd}"', '\n    log(\'✅ E-Day End summary page opened.\')', 'eday step');
        const forced = (fn.match(/click\(\{ force: true, timeout: 15000 \}\)/g) || []).length;
        assert.strictEqual(forced, 2, 'both E-Day End and Proceed need a forced retry');
        assert.ok(fn.includes("waitFor({ state: 'attached', timeout: 20000 })"), 'wait for attached, not visible');
    });

    await test('the DOM-click fallback is a raw string (obfuscation-safe)', () => {
        assert.ok(scraperSrc.includes('const EVAL_CLICK_LPG_ONE = `('), 'must be a raw template string');
        assert.ok(!/page\.evaluate\(\s*\(\s*\)\s*=>/.test(scraperSrc), 'never pass an arrow function to page.evaluate');
    });

    await test('a Stop during navigation still aborts (kill switch preserved)', () => {
        const fn = slice(scraperSrc, 'async function openEDayEndPage', '\n// ----', 'openEDayEndPage');
        assert.ok(fn.includes('isDeliveryReportStopRequested()'), 'menu loop must check the stop flag');
        const rethrows = (fn.match(/if \(isAbortError\((?:clickErr|err)\)\) \{ throw (?:clickErr|err); \}/g) || []).length;
        assert.ok(rethrows >= 3, `a killed browser must rethrow, not retry (found ${rethrows})`);
    });

    console.log('\n──────────── FIX 2: spinner-free stop button ────────────');

    await test('the running state hides the spinner and drops the loader class', () => {
        const fn = slice(rendererSrc, 'function setDeliveryButtonState', '\n        }\n\n        // Establish the idle label', 'button state');
        const running = slice(fn, 'if (running) {', '} else {', 'running branch');
        assert.ok(running.includes("deliveryBtnSpinner.classList.add('hidden')"), 'spinner must be hidden');
        assert.ok(!running.includes("deliveryBtnSpinner.classList.remove('hidden')"), 'spinner must never be shown');
        assert.ok(running.includes("classList.remove('is-loading')"), 'loader marker class must be dropped');
        assert.ok(!running.includes("'is-loading',"), 'is-loading must not be added');
    });

    await test('the label is clean static text', () => {
        const fn = slice(rendererSrc, 'function setDeliveryButtonState', '\n        }\n\n        // Establish the idle label', 'button state');
        assert.ok(fn.includes("textContent = '⏹ Stop Fetching Report'"), 'exact running label');
        assert.ok(fn.includes("textContent = 'Start Fetching Report'"), 'exact idle label');
    });

    await test('CSS kills the rotating loader outright on this button', () => {
        const rule = slice(htmlSrc, '.btn-delivery-fetch .delivery-btn-spinner,', '}', 'spinner kill');
        assert.ok(rule.includes('display: none !important'), 'spinner never renders');
        assert.ok(rule.includes('animation: none !important'), 'and never rotates');
    });

    await test('the red running state carries no animation at all', () => {
        const stylesSrc = fs.readFileSync(path.join(ROOT, 'desktop-app', 'styles.css'), 'utf8');
        const rule = slice(stylesSrc, '.btn.btn-delivery-fetch.is-stopping {', '}', 'red rule');
        assert.ok(rule.includes('animation: none'), 'flat, not pulsing');
        assert.ok(rule.includes('linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'), 'red retained');
        assert.ok(rule.includes('color: #ffffff'), 'white text retained');
    });

    await test('the Auto-Cancellation button keeps its own pulse (untouched)', () => {
        const stylesSrc = fs.readFileSync(path.join(ROOT, 'desktop-app', 'styles.css'), 'utf8');
        const canonical = slice(stylesSrc, '.btn-danger-pulsing {', '}', 'canonical');
        assert.ok(canonical.includes('btnStopPulse 1.8s infinite'), 'cancellation button still pulses');
    });

    console.log('\n──────────── PRESERVATION ────────────');

    await test('cancellation logic, modal sorting and dedup untouched', () => {
        assert.ok(runnerSrc.includes('async function scrapeConsumerNumbers'), 'runner navigation intact');
        assert.ok(runnerSrc.includes('openMyApplicationsMenu'), 'runner menu opener intact');
        assert.ok(rendererSrc.includes('const rows = summary.slice().sort((a, b) => (b.count - a.count));'), 'modal table sorting intact');
        assert.ok(scraperSrc.includes('if (!key || deduped.has(key)) { continue; }'), 'scraper dedup intact');
        assert.ok(rendererSrc.includes('mergeAndPersistDeliveryReport'), 'merge/upsert dedup intact');
        assert.ok(scraperSrc.includes('anticaptchaApiKey'), 'captcha flow intact');
        assert.ok(scraperSrc.includes('verifyLicenseAndFetchManifest'), 'license manifest intact');
    });

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(64)}\n`);
    process.exitCode = failed === 0 ? 0 : 1;
})();
