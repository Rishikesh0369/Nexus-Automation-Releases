// -------------------------------------------------------------
// BELA BHARAT GAS NEXUS - DELIVERY REPORT SCRAPER (MODULAR)
// -------------------------------------------------------------
// Standalone, read-only reporting module.
//
// This module NEVER mutates the cash-memo cancellation engine. It only
// *consumes* exported helpers from bela_nexus_runner.js (login, browser
// launch, selector building, license manifest) so a single auth mechanism
// stays shared across the app.
//
// It owns its own browser handle and its own stop flag, deliberately kept
// separate from the runner's global stop state so stopping a report can
// never abort a running cancellation (and vice-versa).
// -------------------------------------------------------------

const path = require('path');
const fs = require('fs');

const {
    launchBrowser,
    performLogin,
    injectNexusOverlay,
    buildSelectors,
    verifyLicenseAndFetchManifest,
    DEFAULT_SELECTORS
} = require('../bela_nexus_runner');

// -------------------------------------------------------------
// MODULE-LOCAL STATE (isolated from the cancellation runner)
// -------------------------------------------------------------
// The eConnect self-service landing page. The "My Application" dropdown that
// hosts the LPG One link only exists here, so navigation re-asserts it before
// opening the menu.
const DASHBOARD_URL = 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO';

// The live browser handle for the running report. Kept at module scope so a
// Stop can reach in and kill the session instantly, from any step.
let reportBrowser = null;
let stopRequested = false;
let isReportRunning = false;

// Everything scraped so far, mirrored at module scope as each page completes.
// A hard browser kill unwinds the run through a rejected Playwright call, so
// the in-flight locals are lost - this snapshot is what lets a cancelled run
// still hand back the records it had already collected.
let collectedRecords = [];
let collectedCounts = { totalDelivered: 0, deliveredViaApp: 0, pagesScraped: 0 };

function snapshotRecords(records, counts) {
    if (Array.isArray(records)) { collectedRecords = records.slice(); }
    if (counts) { collectedCounts = { ...collectedCounts, ...counts }; }
}

/**
 * Stop the report AND kill the browser immediately.
 *
 * Setting the flag alone is not enough: a Stop pressed during login would sit
 * through the OCR/captcha handshake and the dashboard redirect (10s+) before
 * anything noticed. Closing the browser here makes every in-flight Playwright
 * call reject at once, so the run unwinds instantly from whatever step it is
 * on. The close is deliberately NOT awaited by the caller's critical path.
 */
function requestStopDeliveryReport() {
    stopRequested = true;

    const doomed = reportBrowser;
    reportBrowser = null;
    if (doomed) {
        // Fire-and-forget: never block the IPC reply on the teardown.
        try {
            const closing = doomed.close();
            if (closing && typeof closing.catch === 'function') { closing.catch(() => {}); }
        } catch (_) {}
        return { success: true, killed: true };
    }
    return { success: true, killed: false };
}

function resetStopDeliveryReport() {
    stopRequested = false;
}

function isDeliveryReportStopRequested() {
    return stopRequested === true;
}

function isDeliveryReportRunning() {
    return isReportRunning === true;
}

async function closeDeliveryReportBrowser() {
    if (reportBrowser) {
        try {
            await reportBrowser.close();
        } catch (_) {}
        reportBrowser = null;
    }
}

// -------------------------------------------------------------
// RAW-STRING BROWSER EVALUATIONS
// -------------------------------------------------------------
// IMPORTANT: These are raw strings, never function references.
// The production build obfuscates this file; passing a function to
// page.evaluate() lets the obfuscator rename identifiers inside the
// serialized body and break scoping in the page context (see commit
// 37c1301). Raw strings are opaque to the obfuscator and stay intact.
// -------------------------------------------------------------

const EVAL_SUMMARY = `(function () {
    function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }
    function digits(v) { return (v || '').replace(/[^0-9]/g, ''); }

    var container = document.querySelector('#ctl00_ContentPlaceHolder1_divModesViaDC')
        || document.querySelector('[id*="divModesViaDC"]')
        || document.querySelector('[id*="ModesViaDC"]');

    var scope = container || document.body;
    var scopeText = clean(scope.innerText || scope.textContent || '');
    var pageText = clean(document.body ? (document.body.innerText || document.body.textContent || '') : '');

    var result = {
        containerFound: !!container,
        totalDelivered: '',
        deliveredViaApp: '',
        appLinkIndex: -1,
        sampleText: scopeText.slice(0, 600)
    };

    // ---- Total Delivered -------------------------------------
    var totalRe = /Total\\s*Deliver(?:ed|y|ies)?[^0-9]{0,60}([0-9][0-9,]*)/i;
    var m = scopeText.match(totalRe);
    if (!m) { m = pageText.match(totalRe); }
    if (m) { result.totalDelivered = digits(m[1]); }

    // ---- Delivered via Operator App --------------------------
    var appRe = /Deliver(?:y|ed|ies)?\\s*(?:Via|By|Through)?\\s*Operator\\s*App[^0-9]{0,60}([0-9][0-9,]*)/i;
    var am = scopeText.match(appRe);
    if (!am) { am = pageText.match(appRe); }
    if (am) { result.deliveredViaApp = digits(am[1]); }

    // The drill-down link under "Delivery Via Operator App" carries the
    // count as its own label - prefer it over the regex reading.
    if (container) {
        var anchors = container.querySelectorAll('a');
        for (var i = 0; i < anchors.length; i++) {
            var at = clean(anchors[i].innerText || anchors[i].textContent || '');
            if (/^[0-9][0-9,]*$/.test(at)) {
                result.deliveredViaApp = digits(at);
                result.appLinkIndex = i;
                break;
            }
        }
    }

    return result;
})()`;

const EVAL_ROWS = `(function () {
    function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }

    function cellsOf(tr) {
        var tds = [];
        for (var c = 0; c < tr.children.length; c++) {
            if (tr.children[c].tagName === 'TD') { tds.push(tr.children[c]); }
        }
        return tds;
    }

    function textAt(tds, idx) {
        if (!tds[idx]) { return ''; }
        return clean(tds[idx].innerText || tds[idx].textContent || '');
    }

    var out = [];
    var trs = document.querySelectorAll('tr');

    for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];

        // Skip header rows and GridView pager rows.
        if (tr.getElementsByTagName('th').length > 0) { continue; }
        if (tr.querySelector('a[href*="Page$"]')) { continue; }

        var tds = cellsOf(tr);
        if (tds.length < 9) { continue; }

        var consumerNumber = textAt(tds, 2);
        // Header rows rendered with <td> carry no digits - drop them.
        if (!consumerNumber || !/[0-9]/.test(consumerNumber)) { continue; }

        out.push({
            consumerName: textAt(tds, 1),
            consumerNumber: consumerNumber,
            bookDate: textAt(tds, 3),
            areaDescription: textAt(tds, 5),
            operatorName: textAt(tds, 8)
        });
    }

    return out;
})()`;

// Clicks the "LPG One" menu entry from inside the page.
//
// Fallback for when the My Application dropdown refuses to open: a DOM click
// needs no bounding box, so it fires even while the anchor is still hidden -
// which is exactly the case Playwright rejects as "Element is not visible",
// force: true included.
const EVAL_CLICK_LPG_ONE = `(function () {
    function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim().toUpperCase(); }

    var anchors = document.querySelectorAll('a');
    for (var i = 0; i < anchors.length; i++) {
        if (clean(anchors[i].innerText || anchors[i].textContent || '') === 'LPG ONE') {
            anchors[i].click();
            return true;
        }
    }
    // Second pass: some builds wrap the label in a child node.
    for (var j = 0; j < anchors.length; j++) {
        if (clean(anchors[j].innerText || anchors[j].textContent || '').indexOf('LPG ONE') === 0) {
            anchors[j].click();
            return true;
        }
    }
    return false;
})()`;

const EVAL_PAGER = `(function () {
    function clean(t) { return (t || '').replace(/\\s+/g, ' ').trim(); }

    var links = document.querySelectorAll('a[href*="Page$"]');
    var items = [];
    for (var i = 0; i < links.length; i++) {
        items.push({ index: i, text: clean(links[i].innerText || links[i].textContent || '') });
    }

    // ASP.NET GridView renders the ACTIVE page as a <span>, not an <a>.
    var current = '';
    if (links.length > 0) {
        var node = links[0];
        while (node && node.tagName !== 'TR') { node = node.parentElement; }
        if (node) {
            var spans = node.getElementsByTagName('span');
            for (var s = 0; s < spans.length; s++) {
                var st = clean(spans[s].innerText || spans[s].textContent || '');
                if (/^[0-9]+$/.test(st)) { current = st; break; }
            }
        }
    }

    return { links: items, current: current };
})()`;

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------

function toInt(value) {
    const n = parseInt(String(value || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
}

/**
 * True when an error is the shrapnel of an operator-triggered kill rather than
 * a genuine failure - i.e. the browser/page was pulled out from under a call.
 */
function isAbortError(err) {
    if (isDeliveryReportStopRequested()) { return true; }
    const msg = (err && err.message ? err.message : String(err || '')).toLowerCase();
    return msg.includes('target closed')
        || msg.includes('target page, context or browser has been closed')
        || msg.includes('browser has been closed')
        || msg.includes('browser has disconnected')
        || msg.includes('connection closed')
        || msg.includes('navigation failed because page was closed')
        || msg.includes('page has been closed')
        || msg.includes('execution context was destroyed');
}

function signatureOf(rows) {
    if (!Array.isArray(rows) || rows.length === 0) { return ''; }
    return `${rows.length}|${rows[0].consumerNumber}|${rows[rows.length - 1].consumerNumber}`;
}

const STOP_SENTINEL = '__delivery_report_stopped__';

/**
 * Await a Playwright promise but give up the moment the operator presses Stop.
 *
 * Playwright waits (clicks, load states, navigations) do not observe our stop
 * flag, so a cancel issued mid-navigation used to sit through the full network
 * timeout before the UI reacted. Racing the wait against a short stop poll
 * makes cancellation feel immediate; the underlying promise is left to settle
 * on its own (errors swallowed) because the page is about to be closed anyway.
 */
async function raceStop(promise, pollMs = 150) {
    if (isDeliveryReportStopRequested()) { return STOP_SENTINEL; }

    let timer = null;
    try {
        return await Promise.race([
            Promise.resolve(promise).catch(() => null),
            new Promise((resolve) => {
                timer = setInterval(() => {
                    if (isDeliveryReportStopRequested()) { resolve(STOP_SENTINEL); }
                }, pollMs);
                if (typeof timer.unref === 'function') { timer.unref(); }
            })
        ]);
    } finally {
        if (timer) { clearInterval(timer); }
    }
}

/**
 * Close a page without letting a hung beforeunload/navigation stall the stop.
 */
async function closePageFast(page, timeoutMs = 4000) {
    if (!page) { return; }
    try {
        await Promise.race([
            page.close().catch(() => {}),
            new Promise((resolve) => {
                const t = setTimeout(resolve, timeoutMs);
                if (typeof t.unref === 'function') { t.unref(); }
            })
        ]);
    } catch (_) {}
}

/**
 * Read one numeric cell from the delivery-modes summary table.
 *
 * The header numbers are read positionally from the first data row of
 * #ctl00_ContentPlaceHolder1_divModesViaDC (cell 1 = Total Delivered,
 * cell 2 = Delivered via Operator App) instead of by matching numeric text,
 * which used to latch onto the wrong figure and report 0.
 *
 * @returns {Promise<number|null>} the parsed count, or null when the cell
 *   could not be read at all (so the caller can fall back). A genuine zero
 *   is returned as 0, never as null.
 */
async function readSummaryCell(page, cellIndex) {
    const rowSelectors = [
        '#ctl00_ContentPlaceHolder1_divModesViaDC table tr',
        '[id*="divModesViaDC"] table tr'
    ];

    for (const selector of rowSelectors) {
        try {
            const row = page.locator(selector).nth(1);
            if (await row.count() === 0) { continue; }

            const cell = row.locator('td').nth(cellIndex);
            if (await cell.count() === 0) { continue; }

            const raw = await cell.innerText({ timeout: 5000 });
            const digits = String(raw || '').replace(/[^0-9]/g, '');
            if (digits === '') { continue; }

            const parsed = parseInt(digits, 10);
            if (Number.isFinite(parsed)) { return parsed; }
        } catch (_) {
            // Selector variant missing or detached - try the next one.
        }
    }
    return null;
}

/**
 * Wait for an ASP.NET postback / AJAX re-render to settle.
 * Handles both full postbacks (navigation) and UpdatePanel refreshes
 * (no navigation) by polling for a changed first/last-row signature.
 */
async function waitForTableRefresh(page, previousSignature, timeoutMs = 30000) {
    if (await raceStop(page.waitForLoadState('domcontentloaded')) === STOP_SENTINEL) { return false; }
    if (await raceStop(page.waitForLoadState('networkidle', { timeout: 15000 })) === STOP_SENTINEL) { return false; }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (isDeliveryReportStopRequested()) { return false; }
        let signature = '';
        try {
            const rows = await page.evaluate(EVAL_ROWS);
            signature = signatureOf(rows);
        } catch (_) {
            // Page is mid-navigation - retry.
        }
        if (signature && signature !== previousSignature) { return true; }
        await page.waitForTimeout(350);
    }
    return false;
}

/**
 * The payload handed back for any operator-cancelled run.
 *
 * Always carries whatever was already collected (never a blank report), so a
 * Stop preserves records instead of discarding them.
 */
function buildStoppedReport() {
    const rawRecords = collectedRecords.slice();
    return {
        success: true,
        stopped: true,
        totalDelivered: collectedCounts.totalDelivered || 0,
        deliveredViaApp: collectedCounts.deliveredViaApp || 0,
        operatorSummary: buildOperatorSummary(rawRecords),
        rawRecords,
        pagesScraped: collectedCounts.pagesScraped || 0,
        generatedAt: new Date().toISOString()
    };
}

/**
 * Aggregate raw records into a descending operator leaderboard.
 */
function buildOperatorSummary(rawRecords) {
    const tally = new Map();
    for (const rec of (rawRecords || [])) {
        const name = (rec.operatorName || '').trim() || 'Unassigned';
        tally.set(name, (tally.get(name) || 0) + 1);
    }
    return Array.from(tally.entries())
        .map(([operatorName, count]) => ({ operatorName, count }))
        .sort((a, b) => (b.count - a.count) || a.operatorName.localeCompare(b.operatorName));
}

// -------------------------------------------------------------
// STEP 2: Navigate to LPG One -> E-Day End -> Proceed
// -------------------------------------------------------------
async function openEDayEndPage(page, activeSelectors, log) {
    const linkEDayEnd = activeSelectors.linkEDayEnd || 'E-Day End This option is for';
    const btnProceedDayEnd = activeSelectors.btnProceedDayEnd || 'Proceed';
    const linkLpgOne = activeSelectors.linkLpgOne || 'LPG One';

    const myAppSelector = 'a:has-text("My Application"), a:has-text("MY APPLICATION")';
    const lpgOneSelector = 'a:has-text("LPG One"), a:has-text("LPG ONE")';

    const dashboardUrl = activeSelectors.loginUrl
        || (activeSelectors.login && activeSelectors.login.url)
        || DASHBOARD_URL;

    log('🖱️ Opening "My Application" menu and navigating to "LPG One"...');
    await page.waitForLoadState('domcontentloaded');

    // ---- Land on the dashboard first --------------------------
    // With a reused session the post-login page is not guaranteed to be the
    // self-service menu, and the "My Application" dropdown only exists there.
    // Without it the LPG One anchor stays display:none and the click fails
    // with "Element is not visible" - even with force: true, which skips the
    // actionability checks but still needs a box to click.
    let currentUrl = '';
    try { currentUrl = page.url() || ''; } catch (_) {}
    if (!/selfservice/i.test(currentUrl)) {
        log('🌐 Not on the dashboard - navigating to the self-service menu...');
        await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }

    // ---- Resilient menu opener --------------------------------
    // Same routine as the cash-memo runner: hover, fall back to a click, and
    // reset the pointer between attempts so a stuck hover cannot wedge it.
    let lpgOneVisible = false;
    for (let attempt = 0; attempt < 3 && !lpgOneVisible; attempt++) {
        if (isDeliveryReportStopRequested()) { break; }
        try {
            const myAppElement = page.locator(myAppSelector).first();
            await myAppElement.hover({ timeout: 5000 });
            await page.waitForTimeout(800);

            const lpgOneLocator = page.locator(lpgOneSelector).first();
            if (await lpgOneLocator.isVisible().catch(() => false)) {
                lpgOneVisible = true;
                break;
            }

            // Hover did not open the dropdown - force it open with a click.
            await myAppElement.click({ force: true, timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(800);
            if (await lpgOneLocator.isVisible().catch(() => false)) {
                lpgOneVisible = true;
                break;
            }

            await page.mouse.move(0, 0).catch(() => {});
            await page.waitForTimeout(500);
        } catch (_) {
            await page.waitForTimeout(1000);
        }
    }

    // ---- Click LPG One and take the new tab -------------------
    // The link must at least be ATTACHED; visibility is handled by the menu
    // opener above and, failing that, by the DOM-click fallback below.
    const lpgOneLink = page.getByRole('link', { name: linkLpgOne }).first();
    await lpgOneLink.waitFor({ state: 'attached', timeout: 15000 }).catch(async () => {
        await page.locator(lpgOneSelector).first().waitFor({ state: 'attached', timeout: 15000 });
    });

    // BPCL opens this as a window.open popup on some builds and a _blank tab
    // on others - race both so neither variant stalls the run.
    const popupPromise = page.waitForEvent('popup', { timeout: 45000 }).catch(() => null);
    const newPagePromise = page.context().waitForEvent('page', { timeout: 45000 }).catch(() => null);

    let clicked = false;
    try {
        await lpgOneLink.click({ force: true, timeout: 20000 });
        clicked = true;
    } catch (clickErr) {
        if (isAbortError(clickErr)) { throw clickErr; }
        log(`⚠️ Forced click on "${linkLpgOne}" failed (${clickErr.message}). Falling back to a DOM click...`);
    }

    if (!clicked) {
        // Last resort: dispatch the click from inside the page. This works even
        // while the dropdown is still collapsed, because it needs no box.
        const domClicked = await page.evaluate(EVAL_CLICK_LPG_ONE).catch(() => false);
        if (!domClicked) {
            throw new Error('Could not open "LPG One" from the My Application menu. Please retry.');
        }
        log('✅ "LPG One" opened via DOM click fallback.');
    }

    let page1 = await popupPromise;
    if (!page1) { page1 = await newPagePromise; }
    if (!page1) {
        throw new Error('The LPG One window did not open. Please retry.');
    }

    await page1.waitForLoadState('domcontentloaded');
    await page1.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // ---- E-Day End -> Proceed ---------------------------------
    log(`🖱️ Clicking on "${linkEDayEnd}"...`);
    const eDayEndLocator = (linkEDayEnd.startsWith('#') || linkEDayEnd.startsWith('.') || linkEDayEnd.includes('['))
        ? page1.locator(linkEDayEnd).first()
        : page1.getByRole('link', { name: linkEDayEnd });
    await eDayEndLocator.waitFor({ state: 'attached', timeout: 20000 });
    try {
        await eDayEndLocator.click({ timeout: 15000 });
    } catch (err) {
        if (isAbortError(err)) { throw err; }
        await eDayEndLocator.click({ force: true, timeout: 15000 });
    }

    const proceedBtn = (btnProceedDayEnd.startsWith('#') || btnProceedDayEnd.startsWith('.') || btnProceedDayEnd.includes('['))
        ? page1.locator(btnProceedDayEnd).first()
        : page1.getByRole('button', { name: btnProceedDayEnd });
    await proceedBtn.waitFor({ state: 'attached', timeout: 20000 });
    try {
        await proceedBtn.click({ timeout: 15000 });
    } catch (err) {
        if (isAbortError(err)) { throw err; }
        await proceedBtn.click({ force: true, timeout: 15000 });
    }
    await page1.waitForLoadState('domcontentloaded');

    log('✅ E-Day End summary page opened.');
    return page1;
}

// -------------------------------------------------------------
// STEP 5: Paginated table scrape with dedup + graceful stop
// -------------------------------------------------------------
async function scrapePaginatedTable(page2, callbacks, log) {
    const onProgress = typeof callbacks.onProgress === 'function' ? callbacks.onProgress : () => {};

    const deduped = new Map();
    let pageNumber = 1;
    let stoppedEarly = false;
    let pagesScraped = 0;
    let ellipsisClicks = 0;

    // Bounded so a malformed pager can never spin forever.
    const MAX_PAGE_ITERATIONS = 500;

    for (let iteration = 0; iteration < MAX_PAGE_ITERATIONS; iteration++) {
        if (isDeliveryReportStopRequested()) {
            stoppedEarly = true;
            log('🛑 Stop requested - saving records collected so far...');
            break;
        }

        let rows = [];
        try {
            rows = await page2.evaluate(EVAL_ROWS);
        } catch (err) {
            if (isAbortError(err)) {
                stoppedEarly = true;
                log('🛑 [STOP] Process terminated immediately by operator.');
                break;
            }
            log(`⚠️ Could not read table on page ${pageNumber}: ${err.message}`);
            rows = [];
        }

        let newOnThisPage = 0;
        for (const rec of (rows || [])) {
            const key = (rec.consumerNumber || '').trim();
            if (!key || deduped.has(key)) { continue; }
            deduped.set(key, {
                consumerNumber: key,
                consumerName: (rec.consumerName || '').trim(),
                areaDescription: (rec.areaDescription || '').trim(),
                bookDate: (rec.bookDate || '').trim(),
                operatorName: (rec.operatorName || '').trim()
            });
            newOnThisPage++;
        }

        pagesScraped++;

        // Mirror to module scope after every page so a hard kill mid-scrape
        // still leaves the collected records recoverable.
        snapshotRecords(Array.from(deduped.values()), { pagesScraped });

        log(`📄 Page ${pageNumber}: ${(rows || []).length} rows read, ${newOnThisPage} new (total ${deduped.size}).`);
        onProgress({
            phase: 'scraping',
            page: pageNumber,
            pagesScraped,
            recordsCollected: deduped.size
        });

        const currentSignature = signatureOf(rows);

        // ---- Resolve the next page ---------------------------
        let pager = { links: [], current: '' };
        try {
            pager = await page2.evaluate(EVAL_PAGER);
        } catch (_) {}

        if (!pager.links || pager.links.length === 0) {
            // Single-page result set - nothing more to walk.
            break;
        }

        const visitedNow = toInt(pager.current) || pageNumber;
        const numeric = pager.links
            .filter(l => /^[0-9]+$/.test(l.text))
            .map(l => ({ index: l.index, num: toInt(l.text) }))
            .filter(l => l.num > visitedNow)
            .sort((a, b) => a.num - b.num);

        let targetIndex = -1;
        let targetLabel = '';

        if (numeric.length > 0) {
            targetIndex = numeric[0].index;
            targetLabel = String(numeric[0].num);
        } else {
            // No higher numeric link in this block: expand via the trailing
            // '...', otherwise fall back to an explicit Next/Last control.
            const forwardEllipsis = pager.links.filter(l => l.text === '...' || l.text === '…');
            const nextCtrl = pager.links.filter(l => /^(next|last|>|>>|»)$/i.test(l.text));

            if (forwardEllipsis.length > 0 && ellipsisClicks < 60) {
                targetIndex = forwardEllipsis[forwardEllipsis.length - 1].index;
                targetLabel = '...';
                ellipsisClicks++;
            } else if (nextCtrl.length > 0) {
                targetIndex = nextCtrl[0].index;
                targetLabel = nextCtrl[0].text;
            }
        }

        if (targetIndex < 0) {
            // Every page in the set has been walked.
            break;
        }

        // ---- BEFORE navigation -------------------------------
        if (isDeliveryReportStopRequested()) {
            stoppedEarly = true;
            log('🛑 Stop requested - saving records collected so far...');
            break;
        }

        // The click itself is raced against the stop flag so a cancel issued
        // while the postback is in flight does not wait out the 20s timeout.
        const clickOutcome = await raceStop(
            page2.locator('a[href*="Page$"]').nth(targetIndex).click({ timeout: 20000 })
                .then(() => 'ok')
                .catch((err) => ({ error: err && err.message ? err.message : String(err) }))
        );

        if (clickOutcome === STOP_SENTINEL) {
            stoppedEarly = true;
            log('🛑 Stop requested - saving records collected so far...');
            break;
        }
        if (clickOutcome && clickOutcome.error) {
            log(`⚠️ Pagination click failed on "${targetLabel}": ${clickOutcome.error}`);
            break;
        }

        const refreshed = await waitForTableRefresh(page2, currentSignature);

        // ---- AFTER navigation --------------------------------
        if (isDeliveryReportStopRequested()) {
            stoppedEarly = true;
            log('🛑 Stop requested - saving records collected so far...');
            break;
        }
        if (!refreshed) {
            log('ℹ️ Table stopped changing after pagination - treating as end of results.');
            break;
        }

        let after = { current: '' };
        try {
            after = await page2.evaluate(EVAL_PAGER);
        } catch (_) {}
        pageNumber = toInt(after.current) || (pageNumber + 1);
    }

    return {
        rawRecords: Array.from(deduped.values()),
        stoppedEarly,
        pagesScraped
    };
}

// -------------------------------------------------------------
// MAIN ENTRYPOINT
// -------------------------------------------------------------
/**
 * Fetch the E-Day End delivery report.
 *
 * @param {object} config - bpclUserId, bpclPassword, licenseKey,
 *   anticaptchaApiKey, browserChannel, headless, userDataPath, selectors,
 *   callbacks { onLog, onStatus, onProgress, onBrowserLaunched }
 * @returns {Promise<object>} { success, stopped, totalDelivered,
 *   deliveredViaApp, operatorSummary, rawRecords, ... }
 */
async function fetchDeliveryReport(config = {}) {
    resetStopDeliveryReport();
    isReportRunning = true;
    collectedRecords = [];
    collectedCounts = { totalDelivered: 0, deliveredViaApp: 0, pagesScraped: 0 };

    const callbacks = config.callbacks || {};
    const onLog = typeof callbacks.onLog === 'function' ? callbacks.onLog : console.log;
    const onStatus = typeof callbacks.onStatus === 'function' ? callbacks.onStatus : () => {};
    const onProgress = typeof callbacks.onProgress === 'function' ? callbacks.onProgress : () => {};
    const log = (msg) => { try { onLog(msg); } catch (_) {} };

    const bpclUserId = (config.bpclUserId || config.userId || '').trim();
    const bpclPassword = (config.bpclPassword || config.password || '').trim();
    const licenseKey = (config.licenseKey || '').trim();
    const browserChannel = config.browserChannel === 'msedge' ? 'msedge' : 'chrome';
    const headless = Boolean(config.headless);

    if (!bpclUserId || !bpclPassword) {
        isReportRunning = false;
        throw new Error('Please enter BPCL User ID and Password in Settings before fetching the report.');
    }
    if (!licenseKey) {
        isReportRunning = false;
        throw new Error('Please enter your License Key in Settings before fetching the report.');
    }

    const startedAt = Date.now();
    let browser = null;
    let page1 = null;
    let page2 = null;

    try {
        // ---- Selectors + captcha key from the licence manifest ----
        onStatus('Verifying License...');
        let anticaptchaApiKey = (config.anticaptchaApiKey || config.apiKey || '').trim();
        let manifestSelectors = (config.selectors && typeof config.selectors === 'object' && Object.keys(config.selectors).length > 0)
            ? config.selectors
            : null;

        try {
            const manifest = await verifyLicenseAndFetchManifest(licenseKey, bpclUserId);
            const cloudKey = manifest?.manifest?.anticaptchaApiKey || manifest?.anticaptchaApiKey
                || manifest?.payload?.anticaptchaApiKey || manifest?.apiKey || '';
            if (!anticaptchaApiKey && cloudKey) { anticaptchaApiKey = String(cloudKey).trim(); }

            const cloudSelectors = manifest?.payload?.selectors || manifest?.manifest?.selectors || manifest?.selectors || null;
            if (!manifestSelectors && cloudSelectors && Object.keys(cloudSelectors).length > 0) {
                manifestSelectors = cloudSelectors;
            }
        } catch (netErr) {
            log(`⚠️ Cloud manifest unavailable (${netErr.message || netErr}). Using built-in selectors.`);
        }

        const activeSelectors = buildSelectors(manifestSelectors || DEFAULT_SELECTORS);

        // ---- STEP 1: Browser + login ------------------------------
        onStatus('Launching secure session...');
        log('🚀 Launching secure session for Delivery Report...');
        browser = await launchBrowser(browserChannel, { headless });
        reportBrowser = browser;
        if (typeof callbacks.onBrowserLaunched === 'function') {
            callbacks.onBrowserLaunched(browser);
        }

        const sessionDir = config.userDataPath || __dirname;
        const stateFile = path.join(sessionDir, 'state.json');

        const contextOptions = { viewport: null };
        if (fs.existsSync(stateFile)) {
            contextOptions.storageState = stateFile;
            log('📂 Reusing existing secure session state.');
        }

        const context = await browser.newContext(contextOptions);
        context.setDefaultTimeout(45000);
        context.setDefaultNavigationTimeout(45000);

        const page = await context.newPage();
        page.setDefaultTimeout(45000);
        page.setDefaultNavigationTimeout(45000);

        await injectNexusOverlay(page).catch(() => {});

        onStatus('Signing in...');

        // Login runs the OCR/captcha handshake and a dashboard redirect. A Stop
        // kills the browser out from under it, which rejects here immediately
        // instead of letting the handshake play out - catch that and unwind.
        let loginResult = false;
        try {
            loginResult = await performLogin(page, bpclUserId, bpclPassword, {
                selectors: activeSelectors,
                log,
                anticaptchaApiKey,
                sessionPath: stateFile,
                browser
            });
        } catch (loginErr) {
            if (isAbortError(loginErr)) {
                log('🛑 [STOP] Process terminated immediately by operator.');
                await closeDeliveryReportBrowser();
                isReportRunning = false;
                return buildStoppedReport();
            }
            throw loginErr;
        }

        if (loginResult === false || isDeliveryReportStopRequested()) {
            log('🛑 Delivery report stopped during login.');
            await closeDeliveryReportBrowser();
            isReportRunning = false;
            return buildStoppedReport();
        }

        // ---- STEP 2: LPG One -> E-Day End -> Proceed ---------------
        onStatus('Opening E-Day End...');
        try {
            page1 = await openEDayEndPage(page, activeSelectors, log);
        } catch (navErr) {
            if (isAbortError(navErr)) {
                log('🛑 [STOP] Process terminated immediately by operator.');
                await closeDeliveryReportBrowser();
                isReportRunning = false;
                return buildStoppedReport();
            }
            throw navErr;
        }

        if (isDeliveryReportStopRequested()) {
            log('🛑 [STOP] Process terminated immediately by operator.');
            await closeDeliveryReportBrowser();
            isReportRunning = false;
            return buildStoppedReport();
        }

        // ---- STEP 3: Summary header numbers ------------------------
        onStatus('Reading delivery summary...');
        await page1.waitForSelector('#ctl00_ContentPlaceHolder1_divModesViaDC, [id*="divModesViaDC"]', {
            state: 'attached',
            timeout: 20000
        }).catch(() => {
            log('⚠️ Delivery-modes container not found within timeout; reading page text instead.');
        });

        // Positional read of the first data row is authoritative: cell 1 is
        // "Total Delivered", cell 2 is "Delivered via Operator App". The
        // text-matching evaluation below is only a fallback for the case where
        // the table itself could not be read (it is what used to report 0).
        const cellTotalDelivered = await readSummaryCell(page1, 1);
        const cellDeliveredViaApp = await readSummaryCell(page1, 2);

        let summary = { totalDelivered: '', deliveredViaApp: '' };
        if (cellTotalDelivered === null || cellDeliveredViaApp === null) {
            try {
                summary = await page1.evaluate(EVAL_SUMMARY);
            } catch (_) {}
        }

        const totalDelivered = cellTotalDelivered !== null ? cellTotalDelivered : toInt(summary.totalDelivered);
        const deliveredViaApp = cellDeliveredViaApp !== null ? cellDeliveredViaApp : toInt(summary.deliveredViaApp);
        log(`📊 Total Delivered: ${totalDelivered} | Delivered via Operator App: ${deliveredViaApp}`);
        onProgress({ phase: 'summary', totalDelivered, deliveredViaApp });

        // Keep the header figures even if the run is killed during the scrape.
        snapshotRecords(null, { totalDelivered, deliveredViaApp });

        if (isDeliveryReportStopRequested()) {
            log('🛑 [STOP] Process terminated immediately by operator.');
            await closeDeliveryReportBrowser();
            isReportRunning = false;
            return buildStoppedReport();
        }

        // ---- STEP 4: Drill-down popup ------------------------------
        onStatus('Opening operator drill-down...');
        log('🖱️ Opening the Delivery Via Operator App drill-down...');

        const drilldownLink = page1.locator('#ctl00_ContentPlaceHolder1_divModesViaDC a, [id*="divModesViaDC"] a').first();
        await drilldownLink.waitFor({ state: 'visible', timeout: 20000 });

        // BPCL opens this either as a window.open popup or a _blank tab -
        // race both so neither variant stalls the run.
        const popupPromise = page1.waitForEvent('popup', { timeout: 45000 }).catch(() => null);
        const newPagePromise = page1.context().waitForEvent('page', { timeout: 45000 }).catch(() => null);
        await drilldownLink.click({ force: true });
        page2 = await popupPromise;
        if (!page2) { page2 = await newPagePromise; }

        if (!page2) {
            throw new Error('The operator drill-down window did not open. Please retry.');
        }

        await page2.waitForLoadState('domcontentloaded');
        await page2.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
        page2.setDefaultTimeout(45000);

        // ---- STEP 5: Paginated scrape ------------------------------
        onStatus('Scraping delivery records...');
        const { rawRecords, stoppedEarly, pagesScraped } = await scrapePaginatedTable(page2, { onProgress }, log);

        // ---- STEP 6: Aggregate -------------------------------------
        const operatorSummary = buildOperatorSummary(rawRecords);

        // Tear the session down immediately - a stopped run must not sit on a
        // long close/navigation timeout before the report reaches the UI.
        await closePageFast(page2);
        await closePageFast(page1);
        await closeDeliveryReportBrowser();

        const durationMs = Date.now() - startedAt;
        log(`✅ Delivery report ready: ${rawRecords.length} unique consumers across ${pagesScraped} page(s), ${operatorSummary.length} operator(s).`);
        onStatus(stoppedEarly ? 'Stopped by User (Idle)' : 'Idle');

        isReportRunning = false;
        return {
            success: true,
            stopped: stoppedEarly,
            totalDelivered,
            deliveredViaApp,
            operatorSummary,
            rawRecords,
            pagesScraped,
            generatedAt: new Date().toISOString(),
            durationMs
        };
    } catch (err) {
        await closeDeliveryReportBrowser();
        isReportRunning = false;

        // A kill-switch Stop reaches here as a rejected Playwright call from
        // whatever step was in flight. Hand back everything collected so far
        // rather than surfacing it to the operator as a failure.
        if (isAbortError(err)) {
            log('🛑 [STOP] Process terminated immediately by operator.');
            return buildStoppedReport();
        }
        throw err;
    } finally {
        isReportRunning = false;
        reportBrowser = null;
    }
}

module.exports = {
    fetchDeliveryReport,
    requestStopDeliveryReport,
    resetStopDeliveryReport,
    isDeliveryReportStopRequested,
    isDeliveryReportRunning,
    closeDeliveryReportBrowser,
    buildOperatorSummary
};
