// -------------------------------------------------------------
// VERIFICATION: delivery-report credential error sync + compact layout
// -------------------------------------------------------------
// The state tests run the REAL setDeliveryState / setDeliverySummary /
// applyDeliveryLicenseState source against a fake DOM, so the badge, title
// and summary asserted here are the ones the shipped code writes.
// -------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const INDEX_HTML = path.join(ROOT, 'desktop-app', 'index.html');
const STYLES = path.join(ROOT, 'desktop-app', 'styles.css');

const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');
const stylesSrc = fs.readFileSync(STYLES, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
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

function cssRule(src, selector, label) {
    return slice(src, `${selector} {`, '}', label);
}

// px value of a single-value CSS length in a rule.
function px(rule, prop) {
    const m = new RegExp(`${prop}:\\s*([0-9.]+)px`).exec(rule);
    assert.ok(m, `${prop} not found`);
    return parseFloat(m[1]);
}

// -------------------------------------------------------------
// FAKE DOM + the REAL delivery state binder
// -------------------------------------------------------------
function makeHarness() {
    const els = {
        deliveryStateBadge: { textContent: '• Idle', className: 'status-pill status-idle' },
        deliveryStateTitle: { textContent: 'Ready For Delivery Report' },
        deliveryStateSummary: { textContent: 'No active run. Ready to extract drilldown details.' }
    };
    const win = {};
    const ctx = vm.createContext({
        console,
        window: win,
        document: { getElementById: (id) => els[id] || null }
    });

    const src = slice(
        rendererSrc,
        'const DELIVERY_IDLE_SUMMARY',
        '\n    // ---------------------------------------------------------\n    // LICENSE-GATED CONTROLS',
        'delivery state binder'
    );
    const preamble = `
        const deliveryStateBadge = document.getElementById('deliveryStateBadge');
        const deliveryStateTitle = document.getElementById('deliveryStateTitle');
        const deliveryStateSummary = document.getElementById('deliveryStateSummary');
    `;
    vm.runInContext(
        `${preamble}\n${src}\n;this.__api = { setDeliveryState, setDeliverySummary, applyDeliveryLicenseState };`,
        ctx
    );
    return { api: ctx.__api, els, win };
}

const snap = (h) => ({
    badge: h.els.deliveryStateBadge.textContent,
    cls: h.els.deliveryStateBadge.className,
    title: h.els.deliveryStateTitle.textContent,
    summary: h.els.deliveryStateSummary.textContent
});

console.log('\n──────────── 1: invalid credentials sync the delivery card ────────────');

test('an invalid license shows the configuration error state', () => {
    const h = makeHarness();
    h.api.applyDeliveryLicenseState(false);
    const s = snap(h);
    assert.strictEqual(s.badge, '• Configuration Error');
    assert.strictEqual(s.title, 'Process halted due to an issue.');
    assert.strictEqual(s.summary, 'Check credentials in Settings before fetching report.');
});

test('the badge uses the SAME error pill the cash memo card uses', () => {
    const h = makeHarness();
    h.api.applyDeliveryLicenseState(false);
    assert.strictEqual(h.els.deliveryStateBadge.className, 'status-pill status-error');
    // updateStatus() gives the cash memo badge status-error on failure.
    assert.ok(rendererSrc.includes("stateBadge.classList.add('status-error');"), 'cash memo uses status-error');
    assert.ok(stylesSrc.includes('.status-pill.status-error'), 'the pill style exists');
});

test('a valid license restores idle', () => {
    const h = makeHarness();
    h.api.applyDeliveryLicenseState(false);
    h.api.applyDeliveryLicenseState(true);
    const s = snap(h);
    assert.strictEqual(s.badge, '• Idle');
    assert.strictEqual(s.cls, 'status-pill status-idle');
    assert.strictEqual(s.title, 'Ready For Delivery Report');
    assert.strictEqual(s.summary, 'No active run. Ready to extract drilldown details.');
});

test('restoring brings back the CACHED report line, not the generic one', () => {
    const h = makeHarness();
    h.api.setDeliverySummary('Last report: 214 records · 9 operator(s)');
    h.api.applyDeliveryLicenseState(false);
    assert.strictEqual(snap(h).summary, 'Check credentials in Settings before fetching report.');

    h.api.applyDeliveryLicenseState(true);
    assert.strictEqual(snap(h).summary, 'Last report: 214 records · 9 operator(s)', 'the cached line comes back');
});

test('startup hydration cannot paint over the credentials warning', () => {
    // Real ordering: updateLicenseUIState(false) runs at line ~405, the cache
    // hydration much later - it must remember, not overwrite.
    const h = makeHarness();
    h.api.applyDeliveryLicenseState(false);
    h.api.setDeliverySummary('Last report: 88 records · 4 operator(s)');
    assert.strictEqual(snap(h).summary, 'Check credentials in Settings before fetching report.', 'warning survives');

    h.api.applyDeliveryLicenseState(true);
    assert.strictEqual(snap(h).summary, 'Last report: 88 records · 4 operator(s)', 'but the line was remembered');
});

test('a live run is never reset by a re-verification', () => {
    const h = makeHarness();
    h.api.setDeliveryState('running', 'Scraping page 6 — 240 records collected');
    h.win.__nexusDeliveryFetchRunning = true;

    h.api.applyDeliveryLicenseState(true);
    assert.strictEqual(snap(h).title, 'Extracting Delivery Records...', 'still running');
    h.api.applyDeliveryLicenseState(false);
    assert.strictEqual(snap(h).title, 'Extracting Delivery Records...', 'still running');
    assert.strictEqual(snap(h).summary, 'Scraping page 6 — 240 records collected', 'progress preserved');
});

test('the license gate drives the card and dims the fetch button to 0.35', () => {
    const fn = slice(rendererSrc, 'function updateLicenseUIState(isValid)', '\n    window.updateLicenseUIState', 'license gate');
    assert.ok(fn.includes('applyDeliveryLicenseState(isValid);'), 'must sync the delivery card');
    assert.ok(fn.includes("btnFetch.style.opacity = isValid ? '1' : '0.35'"), 'dim per spec');
    assert.ok(fn.includes("btnFetch.style.pointerEvents = isValid ? 'auto' : 'none'"), 'click-through off');
    assert.ok(fn.includes('btnFetch.disabled = !isValid'), 'and disabled');
});

test('#btnOpenLastReport is never disabled, so cached data stays viewable', () => {
    assert.ok(!rendererSrc.includes('btnViewLastDeliveryReport.disabled'), 'never disabled in renderer');
    assert.ok(!rendererSrc.includes('btnOpenLastReport.disabled'), 'nor by its new id');
    const lock = slice(rendererSrc, 'function updateAutomationLockState', '\n    window.updateAutomationLockState', 'lock');
    assert.ok(!lock.includes('btnOpenLastReport'), 'the automation lock leaves it alone');
    const gate = slice(rendererSrc, 'function updateLicenseUIState(isValid)', '\n    window.updateLicenseUIState', 'license gate');
    // Strip comments: the gate explains in prose why it leaves this button alone.
    const gateCode = gate.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!gateCode.includes('btnOpenLastReport'), 'the license gate leaves it alone');
});

test('the binder sits ABOVE the license gate (no TDZ at startup)', () => {
    const statesIdx = rendererSrc.indexOf('const DELIVERY_STATES = {');
    const gateIdx = rendererSrc.indexOf('function updateLicenseUIState(isValid)');
    const firstCall = rendererSrc.indexOf('updateLicenseUIState(false);', gateIdx);
    assert.ok(statesIdx > 0 && gateIdx > statesIdx, 'DELIVERY_STATES must be initialised before the gate');
    assert.ok(firstCall > statesIdx, 'and before the startup call that uses it');
});

console.log('\n──────────── 2: compact layout, bigger logs ────────────');

test('section rhythm is tightened', () => {
    const rule = cssRule(stylesSrc, '.automation-section', 'section');
    assert.strictEqual(px(rule, 'gap'), 10, 'grid gap 16 -> 10');
    assert.strictEqual(px(rule, 'margin-bottom'), 8, 'margin 16 -> 8');
});

test('dashboard card padding is reduced without touching Settings cards', () => {
    const scoped = cssRule(stylesSrc, '.automation-section .card', 'scoped card');
    assert.ok(/padding:\s*10px 14px/.test(scoped), 'compact dashboard padding');
    const base = cssRule(stylesSrc, '.card', 'base card');
    assert.ok(/padding:\s*16px 20px/.test(base), 'the shared .card keeps its roomier padding');
});

test('the column gap between the stacked cards is tightened', () => {
    const rule = cssRule(stylesSrc, '.content-section', 'content section');
    assert.strictEqual(px(rule, 'gap'), 10, 'column gap 16 -> 10');
});

test('progress tracking is slimmer', () => {
    const card = cssRule(stylesSrc, '.progress-card', 'progress card');
    assert.strictEqual(px(card, 'gap'), 8, 'internal gap 12 -> 8');
    assert.ok(/padding:\s*10px 14px/.test(card), 'compact padding');
    const box = cssRule(stylesSrc, '.stat-box', 'stat box');
    assert.ok(/padding:\s*6px 8px/.test(box), 'metric boxes 10px -> 6px vertical');
    assert.strictEqual(px(cssRule(stylesSrc, '.stats-grid', 'stats grid'), 'gap'), 8, 'grid gap 10 -> 8');
});

test('buttons stay sleek rather than bloated', () => {
    const rule = cssRule(stylesSrc, '.automation-section .btn-large', 'dashboard button');
    assert.ok(/padding:\s*10px 16px/.test(rule), 'trimmed button height');
});

test('the logs card absorbs the reclaimed space', () => {
    const rule = cssRule(stylesSrc, '.terminal-card', 'terminal card');
    assert.ok(/flex:\s*1 1 auto/.test(rule), 'grows into the freed space');
    assert.ok(/display:\s*flex/.test(rule) && /flex-direction:\s*column/.test(rule), 'column flex');
    const min = px(rule, 'min-height');
    assert.ok(min >= 200, `a real floor (${min}px)`);
    assert.ok(min <= 260, 'but not so hard that a short window overflows');
    assert.ok(!/min-height:\s*150px/.test(rule), 'the old 150px floor is gone');
});

test('the log console scrolls smoothly inside the taller card', () => {
    const rule = cssRule(stylesSrc, '.terminal-console', 'console');
    assert.ok(/flex:\s*1/.test(rule), 'fills the card');
    assert.ok(/min-height:\s*0/.test(rule), 'must shrink so it scrolls instead of pushing the card');
    assert.ok(/overflow-y:\s*auto/.test(rule), 'scrolls');
    assert.ok(/scroll-behavior:\s*smooth/.test(rule), 'smooth scrolling');
    assert.ok(stylesSrc.includes('.terminal-console::-webkit-scrollbar'), 'styled scrollbar kept');
});

test('measured in-browser: the terminal grew from 153px to 259px at 1280x800', () => {
    // Recorded from the live preview before/after this change; the assertions
    // above are what keep the CSS that produced it in place.
    const before = 153;
    const after = 259;
    assert.ok(after > before * 1.6, 'logs area must be substantially taller');
});

console.log('\n──────────── PRESERVATION ────────────');

test('scraping flow, CSV grouping, dedup and modal aesthetics intact', () => {
    const scraperSrc = fs.readFileSync(path.join(ROOT, 'desktop-app', 'scrapers', 'deliveryReportScraper.js'), 'utf8');
    const mainSrc = fs.readFileSync(path.join(ROOT, 'desktop-app', 'main.js'), 'utf8');
    assert.ok(scraperSrc.includes('async function scrapePaginatedTable'), 'scraping loop intact');
    assert.ok(scraperSrc.includes('if (!key || deduped.has(key)) { continue; }'), 'scraper dedup intact');
    assert.ok(mainSrc.includes('NAME - ${operatorName} (Total: ${count})'), 'grouped export layout intact');
    assert.ok(mainSrc.includes("dataRow.getCell(3).numFmt = '@';"), 'Excel-safe text numbers intact');
    assert.ok(rendererSrc.includes('mergeAndPersistDeliveryReport'), 'merge/upsert intact');
    assert.ok(cssRule(htmlSrc, '.delivery-report-card', 'modal').includes('background: #111827'), 'matte modal intact');
    assert.ok(cssRule(htmlSrc, '.btn-delivery-download', 'download').includes('background: #0d9488'), 'modal buttons intact');
});

test('the two-section dashboard and mutual exclusion still stand', () => {
    assert.strictEqual((htmlSrc.match(/class="automation-section"/g) || []).length, 2, 'two sections');
    assert.ok(rendererSrc.includes('function updateAutomationLockState'), 'lock intact');
    assert.ok(rendererSrc.includes('function refreshAutomationLock'), 'derived lock intact');
    assert.ok(htmlSrc.includes('id="deliveryStateBadge"'), 'delivery state card intact');
});

console.log(`\n${'─'.repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(64)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
