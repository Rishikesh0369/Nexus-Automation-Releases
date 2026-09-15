// -------------------------------------------------------------
// VERIFICATION: two-section dashboard (Cash Memo vs Delivery Report)
// -------------------------------------------------------------
// The state-binding tests run the REAL setDeliveryState / setDeliverySummary
// source against a fake DOM, so the titles and badges asserted here are the
// ones the shipped code writes.
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

// A CSS rule body, by exact selector.
function cssRule(src, selector, label) {
    return slice(src, `${selector} {`, '}', label);
}

// -------------------------------------------------------------
// FAKE DOM for the delivery state binder
// -------------------------------------------------------------
function makeStateHarness() {
    const els = {
        deliveryStateBadge: { textContent: '• Idle', className: 'status-pill status-idle' },
        deliveryStateTitle: { textContent: 'Ready For Delivery Report' },
        deliveryStateSummary: { textContent: 'No active run. Ready to extract drilldown details.' },
        statusDetailText: { textContent: 'Ready For Cash Memo Cancel' },
        liveProgressSummary: { textContent: '[0/0] Processed | Success: 0 | Failed: 0' },
        stateBadge: { textContent: '• Idle', className: 'status-pill status-idle' }
    };

    const ctx = vm.createContext({
        console,
        window: {},
        document: { getElementById: (id) => els[id] || null }
    });

    const src = slice(
        rendererSrc,
        // The binder now sits above the license gate, so the credential-error
        // path can drive it without a TDZ.
        'const DELIVERY_IDLE_SUMMARY',
        '\n    // ---------------------------------------------------------\n    // LICENSE-GATED CONTROLS',
        'delivery state binder'
    );
    // The binder reads three consts resolved earlier in the real file.
    const preamble = `
        const deliveryStateBadge = document.getElementById('deliveryStateBadge');
        const deliveryStateTitle = document.getElementById('deliveryStateTitle');
        const deliveryStateSummary = document.getElementById('deliveryStateSummary');
    `;
    vm.runInContext(`${preamble}\n${src}\n;this.__api = { setDeliveryState, setDeliverySummary, DELIVERY_STATES };`, ctx);

    return { api: ctx.__api, els };
}

console.log('\n──────────── GOAL 1: two independent sections ────────────');

test('the dashboard has exactly two automation sections', () => {
    const count = (htmlSrc.match(/class="automation-section"/g) || []).length;
    assert.strictEqual(count, 2, 'one row per automation');
    assert.ok(!htmlSrc.includes('dashboard-hero-grid'), 'the old crammed single card is gone');
});

test('section 1 is Cash Memo: state left, control right', () => {
    const s1 = slice(htmlSrc, 'SECTION 1: CASH MEMO CANCELLATION', 'SECTION 2: DELIVERY REPORT', 'section 1');
    assert.ok(s1.includes('>Cash Memo State<'), 'state card label');
    assert.ok(s1.includes('>Cancellation Control<'), 'control card label');
    assert.ok(s1.includes('id="statusDetailText"'), 'cash memo state title');
    assert.ok(s1.includes('id="liveProgressSummary"'), 'cash memo counter');
    assert.ok(s1.includes('id="stateBadge"'), 'cash memo badge');
    assert.ok(s1.includes('id="btnStartCancellation"'), 'cancellation button');
    // The state card must come before the control card (left, then right).
    assert.ok(s1.indexOf('id="statusDetailText"') < s1.indexOf('id="btnStartCancellation"'), 'state on the left');
});

test('section 2 is Delivery Report: state left, controls right', () => {
    const s2 = slice(htmlSrc, 'SECTION 2: DELIVERY REPORT SCRAPER', '<!-- Progress Bar Card -->', 'section 2');
    assert.ok(s2.includes('>Delivery Report State<'), 'state card label');
    assert.ok(s2.includes('>Report Control<'), 'control card label');
    assert.ok(s2.includes('id="deliveryStateBadge"'), 'delivery badge');
    assert.ok(s2.includes('id="deliveryStateTitle"'), 'delivery state title');
    assert.ok(s2.includes('id="deliveryStateSummary"'), 'delivery summary');
    assert.ok(s2.includes('id="btnFetchDeliveryReport"'), 'fetch button');
    assert.ok(s2.includes('id="btnOpenLastReport"'), 'view-last button');
    assert.ok(s2.indexOf('id="deliveryStateTitle"') < s2.indexOf('id="btnFetchDeliveryReport"'), 'state on the left');
});

test('the delivery controls no longer live in the cancellation card', () => {
    const s1 = slice(htmlSrc, 'SECTION 1: CASH MEMO CANCELLATION', 'SECTION 2: DELIVERY REPORT', 'section 1');
    assert.ok(!s1.includes('btnFetchDeliveryReport'), 'fetch button moved out');
    assert.ok(!s1.includes('btnOpenLastReport'), 'view-last moved out');
});

test('the sections are a 2-column grid that stacks when narrow', () => {
    const rule = cssRule(stylesSrc, '.automation-section', 'section grid');
    assert.ok(rule.includes('display: grid'), 'grid layout');
    assert.ok(rule.includes('grid-template-columns: 1.4fr 1fr'), 'state wider than controls');
    assert.ok(rule.includes('gap: 10px'), 'well spaced but compact');
    assert.ok(rule.includes('margin-bottom: 8px'), 'rows separated');
    assert.ok(/@media \(max-width: 900px\)[\s\S]{0,140}grid-template-columns: 1fr;/.test(stylesSrc), 'stacks on narrow windows');
});

console.log('\n──────────── GOAL 2 & 3: renamed, vibrant fetch button ────────────');

test('the button reads "Start Fetching Report"', () => {
    const s2 = slice(htmlSrc, 'SECTION 2: DELIVERY REPORT SCRAPER', '<!-- Progress Bar Card -->', 'section 2');
    assert.ok(s2.includes('>Start Fetching Report<'), 'markup ships the new label');
    assert.ok(!htmlSrc.includes('>Fetch Delivery Report<'), 'old label gone from markup');
    assert.ok(rendererSrc.includes("textContent = 'Start Fetching Report'"), 'renderer restores the new label');
    assert.ok(!rendererSrc.includes("'📊 Fetch Delivery Report'"), 'old label gone from renderer');
});

test('it carries a cyan/teal gradient distinct from the blue cancellation button', () => {
    const rule = cssRule(stylesSrc, '.btn.btn-delivery-fetch', 'teal button');
    assert.ok(rule.includes('linear-gradient(135deg, #0d9488 0%, #0284c7 100%)'), 'teal -> cyan gradient');
    assert.ok(rule.includes('box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35)'), 'teal glow');
    assert.ok(rule.includes('border: 1px solid rgba(45, 212, 191, 0.3)'), 'teal border');

    // Must not be the same treatment as .btn-primary.
    const primary = cssRule(stylesSrc, '.btn-primary', 'primary button');
    assert.ok(!primary.includes('#0d9488'), 'the cancellation button is not teal');
});

test('hover deepens the gradient and lifts the button', () => {
    const hover = cssRule(stylesSrc, '.btn.btn-delivery-fetch:hover:not(:disabled)', 'teal hover');
    assert.ok(hover.includes('linear-gradient(135deg, #0f766e 0%, #0369a1 100%)'), 'darker hover gradient');
    assert.ok(hover.includes('transform: translateY(-1px)'), 'lift');
});

test('the running state is flat red with no animation', () => {
    const rule = cssRule(stylesSrc, '.btn.btn-delivery-fetch.is-stopping', 'stop state');
    assert.ok(rule.includes('linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'), 'red gradient');
    assert.ok(rule.includes('border: 1px solid #ef4444'), 'red border');
    assert.ok(rule.includes('animation: none'), 'no animation');
    assert.ok(rendererSrc.includes("classList.add('is-stopping')"), 'renderer toggles the class');
    assert.ok(rendererSrc.includes("textContent = '⏹ Stop Fetching Report'"), 'stop label');
});

console.log('\n──────────── GOAL 4: visible View Last Report pill ────────────');

test('it is a real teal ghost pill, not faded gray text', () => {
    const rule = cssRule(stylesSrc, '.btn-view-report', 'view pill');
    assert.ok(rule.includes('background: rgba(15, 23, 42, 0.6)'), 'matte dark pill');
    assert.ok(rule.includes('border: 1px solid rgba(45, 212, 191, 0.4)'), 'visible teal border');
    assert.ok(rule.includes('color: #5eead4'), 'bright teal text');
    assert.ok(rule.includes('backdrop-filter: blur(4px)'), 'glass effect');
    assert.ok(rule.includes('border-radius'), 'pill shape');
    assert.ok(!rule.includes('text-decoration: underline'), 'not underlined link text');
    assert.ok(!/color: #64748b/.test(rule), 'not dull gray');

    const hover = cssRule(stylesSrc, '.btn-view-report:hover:not(:disabled)', 'view pill hover');
    assert.ok(hover.includes('border-color: #2dd4bf'), 'brighter border on hover');
});

test('it is visible from the start (no hidden class)', () => {
    const s2 = slice(htmlSrc, 'SECTION 2: DELIVERY REPORT SCRAPER', '<!-- Progress Bar Card -->', 'section 2');
    const tag = slice(s2, 'id="btnOpenLastReport"', '</button>', 'view button tag');
    assert.ok(!/class="[^"]*\bhidden\b/.test(tag), 'must not start hidden');
    assert.ok(tag.includes('📊 View Last Report'), 'labelled clearly');
});

test('clicking it opens the modal with the cached report', () => {
    assert.ok(
        rendererSrc.includes("document.getElementById('btnOpenLastReport')"),
        'renderer resolves the renamed button'
    );
    const handler = slice(rendererSrc, 'btnViewLastDeliveryReport.addEventListener', '\n        }', 'view handler');
    assert.ok(handler.includes('latestDeliveryReport || loadSavedDeliveryReport()'), 'falls back to localStorage');
    assert.ok(handler.includes('renderDeliveryReport(report)'), 'renders it');
    assert.ok(handler.includes('openDeliveryReportModal()'), 'opens #deliveryReportModal');
});

console.log('\n──────────── GOAL 5: dedicated delivery state ────────────');

test('idle shows "Ready For Delivery Report"', () => {
    const h = makeStateHarness();
    h.api.setDeliveryState('idle');
    assert.strictEqual(h.els.deliveryStateTitle.textContent, 'Ready For Delivery Report');
    assert.strictEqual(h.els.deliveryStateBadge.textContent, '• Idle');
    assert.ok(h.els.deliveryStateBadge.className.includes('status-idle'));
    // Markup ships the same idle copy, so it is correct before any JS runs.
    assert.ok(htmlSrc.includes('>Ready For Delivery Report<'), 'markup default matches');
});

test('running / stopped / success / error each set title + badge', () => {
    const cases = [
        ['running', 'Extracting Delivery Records...', '• Running', 'status-running'],
        ['stopped', 'Fetching Stopped by User', '• Stopped', 'status-stopped'],
        ['success', 'Report Generated Successfully', '• Success', 'status-completed'],
        ['error', 'Delivery Report Failed', '• Error', 'status-error']
    ];
    for (const [key, title, badge, pill] of cases) {
        const h = makeStateHarness();
        h.api.setDeliveryState(key);
        assert.strictEqual(h.els.deliveryStateTitle.textContent, title, `${key} title`);
        assert.strictEqual(h.els.deliveryStateBadge.textContent, badge, `${key} badge`);
        assert.ok(h.els.deliveryStateBadge.className.includes(pill), `${key} pill class`);
    }
});

test('the badge classes are real styles that already exist', () => {
    for (const pill of ['status-idle', 'status-running', 'status-completed', 'status-stopped', 'status-error']) {
        assert.ok(stylesSrc.includes(`.status-pill.${pill}`), `.status-pill.${pill} must be defined`);
    }
});

test('an optional summary updates only when given', () => {
    const h = makeStateHarness();
    const original = h.els.deliveryStateSummary.textContent;
    h.api.setDeliveryState('running');
    assert.strictEqual(h.els.deliveryStateSummary.textContent, original, 'omitted summary leaves it alone');
    h.api.setDeliveryState('running', 'Scraping page 4 — 120 records collected');
    assert.strictEqual(h.els.deliveryStateSummary.textContent, 'Scraping page 4 — 120 records collected');
});

test('setDeliverySummary touches ONLY the summary line', () => {
    const h = makeStateHarness();
    h.api.setDeliveryState('running');
    h.api.setDeliverySummary('Scraping page 9 — 400 records collected');
    assert.strictEqual(h.els.deliveryStateTitle.textContent, 'Extracting Delivery Records...', 'title preserved');
    assert.strictEqual(h.els.deliveryStateBadge.textContent, '• Running', 'badge preserved');
    assert.strictEqual(h.els.deliveryStateSummary.textContent, 'Scraping page 9 — 400 records collected');
});

console.log('\n──────────── THE KEY FIX: no cross-contamination ────────────');

test('delivery progress never writes to the cash-memo card', () => {
    const h = makeStateHarness();
    const cashTitle = h.els.statusDetailText.textContent;
    const cashBadge = h.els.stateBadge.textContent;
    const cashCounter = h.els.liveProgressSummary.textContent;

    h.api.setDeliveryState('running', 'Scraping page 3');
    h.api.setDeliverySummary('Scraping page 8');
    h.api.setDeliveryState('success', 'done');

    assert.strictEqual(h.els.statusDetailText.textContent, cashTitle, 'cash memo title untouched');
    assert.strictEqual(h.els.stateBadge.textContent, cashBadge, 'cash memo badge untouched');
    assert.strictEqual(h.els.liveProgressSummary.textContent, cashCounter, 'cash memo counter untouched');
});

test('the delivery IPC handlers no longer call updateStatus()', () => {
    const block = slice(rendererSrc, "ipcRenderer.on('delivery-report-started'", '// ---- Startup hydration', 'delivery ipc');
    // Strip comment lines: the block explains in prose why updateStatus is gone.
    const code = block.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!code.includes('updateStatus('), 'updateStatus drives the CASH MEMO card - must not be called here');
    assert.ok(block.includes('setDeliveryState('), 'uses the dedicated binder');
    assert.ok(block.includes('setDeliverySummary('), 'progress goes to the delivery summary line');
});

test('each lifecycle event routes to the right delivery state', () => {
    const block = slice(rendererSrc, "ipcRenderer.on('delivery-report-started'", '// ---- Startup hydration', 'delivery ipc');
    assert.ok(block.includes("setDeliveryState('running'"), 'started -> running');
    assert.ok(block.includes("setDeliveryState('stopped'"), 'stopped -> stopped');
    assert.ok(block.includes("setDeliveryState('success'"), 'complete -> success');
    assert.ok(block.includes("setDeliveryState('error'"), 'error -> error');
});

test('cash-memo lifecycle still drives its own card', () => {
    assert.ok(rendererSrc.includes('function updateStatus(state)'), 'updateStatus intact');
    assert.ok(rendererSrc.includes("statusDetailText.textContent = 'Ready For Cash Memo Cancel'"), 'cash memo idle copy intact');
    assert.ok(rendererSrc.includes("const stateBadge = document.getElementById('stateBadge');"), 'cash memo badge intact');
});

console.log('\n──────────── MUTUAL EXCLUSION STILL HOLDS ────────────');

test('the lock still targets both buttons by their ids', () => {
    const fn = slice(rendererSrc, 'function updateAutomationLockState', '\n    window.updateAutomationLockState', 'lock');
    assert.ok(fn.includes("getElementById('btnStartCancellation')"), 'cancellation button');
    assert.ok(fn.includes("getElementById('btnFetchDeliveryReport')"), 'fetch button (id unchanged)');
    assert.ok(fn.includes("btnFetch.style.opacity = '0.3'"), 'locked fetch is dimmed');
    assert.ok(fn.includes("btnCancel.style.opacity = '0.3'"), 'locked cancellation is dimmed');
    assert.ok(htmlSrc.includes('id="btnStartCancellation"') && htmlSrc.includes('id="btnFetchDeliveryReport"'),
        'both ids survive the restructure');
});

test('the lock is still refreshed from both lifecycles', () => {
    assert.ok(rendererSrc.includes('window.__nexusCancellationRunning = isProcessRunning;'), 'cancellation publishes');
    assert.ok(rendererSrc.includes('window.__nexusDeliveryFetchRunning = running;'), 'delivery publishes');
    const refreshes = (rendererSrc.match(/refreshAutomationLock\(\);/g) || []).length;
    assert.ok(refreshes >= 3, `lock refreshed from every lifecycle (found ${refreshes})`);
});

console.log('\n──────────── PRESERVATION ────────────');

test('modal, CSV export, dedup and confirmations all intact', () => {
    assert.ok(htmlSrc.includes('id="deliveryReportModal"'), 'report modal intact');
    assert.ok(htmlSrc.includes('id="deliveryConfirmModal"'), 'fetch confirmation intact');
    assert.ok(htmlSrc.includes('id="deliveryStopConfirmModal"'), 'stop confirmation intact');
    assert.ok(htmlSrc.includes('id="btnDownloadDeliveryCsv"'), 'CSV export button intact');
    assert.ok(rendererSrc.includes('const rows = summary.slice().sort((a, b) => (b.count - a.count));'), 'modal sorting intact');
    assert.ok(rendererSrc.includes('mergeAndPersistDeliveryReport'), 'merge/dedup intact');
    assert.ok(rendererSrc.includes("localStorage.getItem(DELIVERY_REPORT_STORAGE_KEY)"), 'cache intact');
    assert.ok(htmlSrc.includes('id="reportActionContainer"'), 'cash memo CSV action intact');
    assert.ok(htmlSrc.includes('id="btnStateRefresh"'), 'state refresh button intact');
    assert.ok(htmlSrc.includes('id="dashboardExpiryWarning"'), 'expiry warning intact');
});

test('no stale references to the removed classes/ids remain', () => {
    for (const dead of ['btn-delivery-report', 'delivery-view-last', 'dashboard-hero-grid']) {
        assert.ok(!htmlSrc.includes(dead), `${dead} must be gone from markup`);
    }
    assert.ok(!stylesSrc.includes('.delivery-view-last'), 'old link style gone');
});

console.log(`\n${'─'.repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(64)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
