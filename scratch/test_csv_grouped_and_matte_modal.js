// -------------------------------------------------------------
// VERIFICATION: hierarchical grouped CSV + matte executive modal
// -------------------------------------------------------------
// The CSV tests run the REAL export body (extracted from main.js) in a vm,
// so the emitted file is the one the shipped code produces.
// -------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'desktop-app', 'main.js');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const INDEX_HTML = path.join(ROOT, 'desktop-app', 'index.html');

const mainSrc = fs.readFileSync(MAIN, 'utf8');
const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');

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

// Values crossing the vm realm boundary carry a different Array prototype, so
// deepStrictEqual would reject structurally identical data.
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

// NOTE: the grouped-export tests moved to test_xlsx_export_and_report_control.js
// when the CSV writer was replaced by a formatted ExcelJS workbook. What
// remains here is the matte modal redesign.

console.log('\n──────────── SPEC 2: matte executive modal ────────────');

test('container is matte slate with a crisp border and soft shadow', () => {
    const rule = cssRule(htmlSrc, '.delivery-report-card', 'modal card');
    assert.ok(rule.includes('background: #111827'), 'matte dark slate');
    assert.ok(rule.includes('border: 1px solid #334155'), 'crisp 1px slate border');
    assert.ok(rule.includes('border-radius: 14px'), 'rounded-xl');
    assert.ok(rule.includes('box-shadow: 0 18px 48px rgba(2, 6, 23, 0.45)'), 'soft ambient shadow');
    assert.ok(!rule.includes('rgba(0, 0, 0, 0.55)'), 'harsh shadow removed');
});

test('no neon glow survives anywhere in the modal styling', () => {
    const modalCss = slice(htmlSrc, '/* ---------- Modal shell ---------- */', '</style>', 'modal css');
    assert.ok(!modalCss.includes('text-shadow'), 'no glowing text');
    assert.ok(!/box-shadow: 0 4px 14px rgba\(34, 197, 94/.test(modalCss), 'no green button glow');
    assert.ok(!modalCss.includes('#22c55e'), 'the piercing green is gone');
    assert.ok(!modalCss.includes('filter: brightness'), 'no shiny brightness hover');
});

test('"Total Delivered" is crisp off-white with a slate label', () => {
    assert.ok(cssRule(htmlSrc, '.delivery-metric-label', 'metric label').includes('color: #94a3b8'), 'slate gray label');
    const white = cssRule(htmlSrc, '.delivery-metric-value.metric-white', 'total value');
    assert.ok(white.includes('color: #f1f5f9'), 'crisp off-white, not pure #fff neon');
});

test('"Delivered via Operator App" is a refined emerald badge', () => {
    const green = cssRule(htmlSrc, '.delivery-metric-value.metric-green', 'app value');
    assert.ok(green.includes('color: #34d399'), 'soft emerald text');
    assert.ok(green.includes('background: rgba(5, 150, 105, 0.18)'), 'emerald badge background');
    assert.ok(green.includes('border: 1px solid rgba(16, 185, 129, 0.35)'), 'emerald border');
    assert.ok(green.includes('border-radius'), 'reads as a badge, not bare text');
    assert.ok(!green.includes('text-shadow'), 'no glow');
});

test('table header is subtle uppercase zinc over a slate rule', () => {
    const th = cssRule(htmlSrc, '.delivery-table thead th', 'table header');
    assert.ok(th.includes('color: #94a3b8'), 'zinc text');
    assert.ok(th.includes('text-transform: uppercase'), 'uppercase');
    assert.ok(th.includes('border-bottom: 1px solid #334155'), '1px slate rule');
    assert.ok(th.includes('background: #111827'), 'sticky header matches the matte card');
});

test('rows: left operator names, right-aligned counts, subtle separators', () => {
    const op = cssRule(htmlSrc, '.delivery-table th.col-operator,\n        .delivery-table td.col-operator', 'operator col');
    assert.ok(op.includes('text-align: left'), 'operators left-aligned');
    const cnt = cssRule(htmlSrc, '.delivery-table th.col-count,\n        .delivery-table td.col-count', 'count col');
    assert.ok(cnt.includes('text-align: right'), 'counts right-aligned');

    // Anchored on the comment: the bare selector also matches the shared
    // th/td alignment rule that precedes it.
    assert.ok(
        slice(htmlSrc, '/* Operator names read as the primary column.', '}', 'operator cell').includes('color: #f1f5f9'),
        'operator name colour'
    );
    const cell = slice(htmlSrc, '/* Counts read as secondary to the operator names. */', '}', 'count cell');
    assert.ok(cell.includes('color: #cbd5e1'), 'count colour');
    assert.ok(cell.includes('font-weight: 600'), 'semibold counts');

    assert.ok(cssRule(htmlSrc, '.delivery-table tbody td', 'body cell').includes('border-bottom: 1px solid #1e293b'), 'slate-800 separators');
    assert.ok(cssRule(htmlSrc, '.delivery-table tbody tr:hover td', 'hover').includes('background: #1e293b'), 'gentle hover');
});

test('Download CSV is a solid flat teal button', () => {
    const rule = cssRule(htmlSrc, '.btn-delivery-download', 'download button');
    assert.ok(rule.includes('background: #0d9488'), 'solid teal');
    assert.ok(rule.includes('box-shadow: none'), 'zero glow');
    assert.ok(!rule.includes('linear-gradient'), 'flat, not a shiny gradient');
    assert.ok(cssRule(htmlSrc, '.btn-delivery-download:hover:not(:disabled)', 'download hover').includes('background: #0f766e'), 'darker teal hover');
});

test('Close is a matte secondary with a slate border', () => {
    const rule = slice(htmlSrc, '/* Matte dark secondary. */', '}', 'close button');
    assert.ok(rule.includes('background: #1e293b'), 'matte dark');
    assert.ok(rule.includes('border: 1px solid #475569'), 'slate-600 border');
});

console.log('\n──────────── PRESERVATION ────────────');

test('scraping loop, license locks and dedup all intact', () => {
    const scraperSrc = fs.readFileSync(path.join(ROOT, 'desktop-app', 'scrapers', 'deliveryReportScraper.js'), 'utf8');
    assert.ok(scraperSrc.includes('async function scrapePaginatedTable'), 'scraping loop intact');
    assert.ok(scraperSrc.includes('if (!key || deduped.has(key)) { continue; }'), 'scraper dedup intact');
    assert.ok(mainSrc.includes('const deduped = new Map();'), 'export dedup intact');
    assert.ok(rendererSrc.includes('function updateLicenseUIState'), 'license gate intact');
    assert.ok(rendererSrc.includes('function updateAutomationLockState'), 'automation lock intact');
    assert.ok(mainSrc.includes('if (isAnyAutomationRunning) {'), 'backend mutex intact');
    assert.ok(rendererSrc.includes('mergeAndPersistDeliveryReport'), 'report merge/upsert intact');
});

test('the modal markup still binds to the same ids', () => {
    for (const id of ['deliveryReportModal', 'modalTotalDelivered', 'modalOperatorDelivered',
        'deliveryOperatorTableBody', 'btnDownloadDeliveryCsv', 'btnCloseDeliveryModal']) {
        assert.ok(htmlSrc.includes(`id="${id}"`), `${id} must survive the restyle`);
        assert.ok(rendererSrc.includes(id), `${id} must still be wired`);
    }
});

console.log(`\n${'─'.repeat(64)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${'─'.repeat(64)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
