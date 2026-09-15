// -------------------------------------------------------------
// VERIFICATION: no tooltip on "View Last Report", app-native dark
// pill tooltip on modal operator names
// -------------------------------------------------------------
// The row-rendering test runs the REAL renderDeliveryReport source against a
// fake DOM, so the elements asserted here are the ones the shipped code builds.
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

// -------------------------------------------------------------
// MINIMAL FAKE DOM
// -------------------------------------------------------------
function makeEl(tag) {
    return {
        tagName: String(tag).toUpperCase(),
        className: '',
        textContent: '',
        children: [],
        attrs: {},
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
        appendChild(c) { this.children.push(c); return c; }
    };
}

// Run the REAL renderDeliveryReport over a report and hand back the rows built.
function renderRows(report) {
    const tbody = makeEl('tbody');
    tbody.innerHTML = '';
    const els = {
        modalTotalDelivered: makeEl('span'),
        modalOperatorDelivered: makeEl('span'),
        deliveryOperatorTableBody: tbody,
        deliveryReportEmpty: makeEl('div'),
        deliveryReportMeta: makeEl('div'),
        btnDownloadDeliveryCsv: makeEl('button'),
        btnOpenLastReport: makeEl('button')
    };

    const fnSrc = slice(rendererSrc, 'function renderDeliveryReport(report)', '\n        // ---- Fetch confirmation modal', 'renderDeliveryReport');

    const ctx = vm.createContext({
        console,
        document: {
            createElement: (t) => makeEl(t),
            getElementById: (id) => els[id] || null
        }
    });

    const preamble = `
        const modalTotalDelivered = document.getElementById('modalTotalDelivered');
        const modalOperatorDelivered = document.getElementById('modalOperatorDelivered');
        const deliveryOperatorTableBody = document.getElementById('deliveryOperatorTableBody');
        const deliveryReportEmpty = document.getElementById('deliveryReportEmpty');
        const deliveryReportMeta = document.getElementById('deliveryReportMeta');
        const btnDownloadDeliveryCsv = document.getElementById('btnDownloadDeliveryCsv');
        const btnViewLastDeliveryReport = document.getElementById('btnOpenLastReport');
    `;
    vm.runInContext(`${preamble}\n${fnSrc}\n;this.__render = renderDeliveryReport;`, ctx);
    ctx.__render(report);

    return tbody.children;
}

const REPORT = {
    totalDelivered: 284,
    deliveredViaApp: 211,
    rawRecords: [{ consumerNumber: '1' }],
    operatorSummary: [
        { operatorName: 'RAMESHWAR PRASAD CHAUDHARY SHRIVASTAVA JI', count: 34 },
        { operatorName: 'SURAJ KUMAR', count: 28 }
    ]
};

console.log('\n──────────── 1: no tooltip on "View Last Report" ────────────');

test('the markup carries no title attribute', () => {
    const tag = slice(htmlSrc, 'id="btnOpenLastReport"', '</button>', 'view button');
    assert.ok(!tag.includes('title='), 'no title attribute');
    assert.ok(!tag.includes('data-tooltip'), 'and no app tooltip either - it must show nothing');
});

test('renderer never sets a title on it', () => {
    assert.ok(!rendererSrc.includes('btnViewLastDeliveryReport.title'), 'no .title assignment');
    assert.ok(!rendererSrc.includes("btnViewLastDeliveryReport.setAttribute('title'"), 'no setAttribute title');
    assert.ok(!rendererSrc.includes("btnOpenLastReport.title"), 'no .title on the new id either');
    // The hydration block used to stamp a record count into the tooltip.
    const hydrate = slice(rendererSrc, 'function hydrateSavedDeliveryReport', '\n    }\n', 'hydration');
    assert.ok(!hydrate.includes('.title'), 'hydration must not re-add a tooltip');
});

test('nothing else in the report control block sets a title', () => {
    const block = slice(htmlSrc, '<!-- Report Control -->', '</div>\n                </div>', 'report control');
    assert.ok(!block.includes('title='), 'no titles on the report controls');
});

console.log('\n──────────── 2: app-native tooltip on operator names ────────────');

test('operator cells use data-tooltip, never a native title', () => {
    const rows = renderRows(REPORT);
    assert.strictEqual(rows.length, 2, 'two operator rows');

    const td = rows[0].children[0];
    assert.strictEqual(td.className, 'col-operator');
    assert.strictEqual(
        td.getAttribute('data-tooltip'),
        'RAMESHWAR PRASAD CHAUDHARY SHRIVASTAVA JI',
        'the full name goes in the app tooltip'
    );
    assert.strictEqual(td.getAttribute('title'), null, 'no native OS tooltip');
    assert.strictEqual(td.title, undefined, 'no .title property set either');
});

test('the visible text lives in an inner ellipsising span', () => {
    const rows = renderRows(REPORT);
    const td = rows[0].children[0];
    assert.strictEqual(td.children.length, 1, 'one child span');

    const span = td.children[0];
    assert.strictEqual(span.tagName, 'SPAN');
    assert.strictEqual(span.className, 'delivery-operator-name');
    assert.strictEqual(span.textContent, 'RAMESHWAR PRASAD CHAUDHARY SHRIVASTAVA JI');
    assert.strictEqual(td.textContent, '', 'the cell itself holds no text node');
});

test('a blank operator name still gets a tooltip reading "Unassigned"', () => {
    const rows = renderRows({ ...REPORT, operatorSummary: [{ operatorName: '', count: 3 }] });
    const td = rows[0].children[0];
    assert.strictEqual(td.getAttribute('data-tooltip'), 'Unassigned');
    assert.strictEqual(td.children[0].textContent, 'Unassigned');
});

test('the count cell is untouched (no tooltip, plain text)', () => {
    const rows = renderRows(REPORT);
    const tdCount = rows[0].children[1];
    assert.strictEqual(tdCount.className, 'col-count');
    assert.strictEqual(tdCount.textContent, '34');
    assert.strictEqual(tdCount.getAttribute('data-tooltip'), null, 'counts need no tooltip');
});

console.log('\n──────────── 3: it is the SAME component Refresh/History use ────────────');

test('no parallel tooltip implementation was introduced', () => {
    assert.ok(stylesSrc.includes('[data-tooltip]::after'), 'the app component exists');
    assert.ok(stylesSrc.includes('[data-tooltip]:hover::after'), 'and reveals on hover');
    assert.ok(!stylesSrc.includes('.custom-app-tooltip'), 'no duplicate tooltip class');
    assert.ok(!htmlSrc.includes('data-tip='), 'no second tooltip attribute');
});

test('Refresh and History still use the very same attribute', () => {
    assert.ok(/id="btnStateRefresh"[^>]*data-tooltip="Refresh"/.test(htmlSrc), 'Refresh button');
    assert.ok(/id="historyBtn"[^>]*data-tooltip="History"/.test(htmlSrc), 'History button');
});

test('the shared pill styling is the dark slate design', () => {
    const rule = slice(stylesSrc, '[data-tooltip]::after {', '}', 'tooltip pill');
    assert.ok(rule.includes('background: #0f172a'), 'dark slate background');
    assert.ok(rule.includes('color: #f1f5f9'), 'near-white text');
    assert.ok(rule.includes('border: 1px solid'), 'bordered pill');
    assert.ok(rule.includes('border-radius: 6px'), 'rounded pill');
    assert.ok(rule.includes('font-size: 11px'), 'small label');
    assert.ok(rule.includes('white-space: nowrap'), 'single line');
    assert.ok(rule.includes('pointer-events: none'), 'never blocks clicks');
    assert.ok(rule.includes('z-index: 9999'), 'renders above the modal content');
});

console.log('\n──────────── 4: the tooltip is not clipped ────────────');

test('the operator cell does not clip its own tooltip', () => {
    const rule = slice(htmlSrc, '/* Operator names read as the primary column.', '}', 'operator cell');
    assert.ok(rule.includes('overflow: visible'), 'the cell must not clip the pill');
    assert.ok(rule.includes('position: relative'), 'and must anchor it');
    assert.ok(!rule.includes('overflow: hidden'), 'the old clipping rule is gone');
    assert.ok(!rule.includes('text-overflow: ellipsis'), 'ellipsis moved to the inner span');
});

test('the inner span does the ellipsising instead', () => {
    const rule = slice(htmlSrc, '.delivery-operator-name {', '}', 'name span');
    assert.ok(rule.includes('overflow: hidden'), 'clips its own text');
    assert.ok(rule.includes('text-overflow: ellipsis'), 'with an ellipsis');
    assert.ok(rule.includes('white-space: nowrap'), 'on one line');
    assert.ok(rule.includes('display: block'), 'fills the cell so truncation triggers');
});

test('the scroll container leaves room for the last row\'s tooltip', () => {
    const rule = slice(htmlSrc, '.delivery-table-wrap {', '}', 'table wrap');
    assert.ok(rule.includes('overflow-y: auto'), 'still scrolls');
    assert.ok(/padding: 0 20px 38px/.test(rule), 'bottom padding clears the tooltip height');
    assert.ok(!/padding: 0 20px 4px/.test(rule), 'the old 4px would have clipped it');
});

console.log('\n──────────── PRESERVATION ────────────');

test('the modal still renders metrics, sorting and CSV state', () => {
    const rows = renderRows(REPORT);
    assert.strictEqual(rows[0].children[1].textContent, '34', 'highest count first');
    assert.strictEqual(rows[1].children[1].textContent, '28', 'descending order preserved');
    assert.ok(rendererSrc.includes('const rows = summary.slice().sort((a, b) => (b.count - a.count));'), 'sorting intact');
    assert.ok(rendererSrc.includes('mergeAndPersistDeliveryReport'), 'merge/dedup intact');
    assert.ok(htmlSrc.includes('id="btnDownloadDeliveryCsv"'), 'CSV export intact');
});

test('other native titles in the app are left alone', () => {
    // Only the View Last Report tooltip was in scope.
    assert.ok(htmlSrc.includes('title="Launch CSV Report in Microsoft Excel"'), 'cash memo CSV button keeps its title');
    assert.ok(htmlSrc.includes('title="Direct Messaging with Service Provider"'), 'support button keeps its title');
});

console.log(`\n${'─'.repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(64)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
