// -------------------------------------------------------------
// VERIFICATION: formatted .xlsx export + premium Report Control card
// -------------------------------------------------------------
// The workbook tests run the REAL export body out of main.js, write an actual
// .xlsx to disk and read it back with ExcelJS - so fills, heights, merges,
// widths and cell types are checked as Excel would see them.
//
// The body runs via new Function (same realm), NOT vm: ExcelJS checks
// `values instanceof Array`, which fails for a cross-realm array and would
// silently produce an empty sheet.
// -------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'desktop-app', 'main.js');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const INDEX_HTML = path.join(ROOT, 'desktop-app', 'index.html');
const STYLES = path.join(ROOT, 'desktop-app', 'styles.css');
const APP_PKG = path.join(ROOT, 'desktop-app', 'package.json');

const mainSrc = fs.readFileSync(MAIN, 'utf8');
const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');
const stylesSrc = fs.readFileSync(STYLES, 'utf8');

const appRequire = (m) => require(path.join(ROOT, 'desktop-app', 'node_modules', m));
const ExcelJS = appRequire('exceljs');

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

function cssRule(src, selector, label) {
    return slice(src, `${selector} {`, '}', label);
}

// -------------------------------------------------------------
// Build a workbook with the REAL export body, then read it back.
// -------------------------------------------------------------
const buildBody = slice(
    mainSrc,
    '        // ---- Hierarchical, operator-grouped workbook',
    '        const stamp = new Date();',
    'workbook builder'
);
const runBuilder = new Function('unique', 'deliveryReportScraper', 'require',
    `${buildBody}\nreturn { sheet, workbook };`);

const scraperStub = {
    buildOperatorSummary(raw) {
        const tally = new Map();
        for (const rec of (raw || [])) {
            const name = (rec.operatorName || '').trim() || 'Unassigned';
            tally.set(name, (tally.get(name) || 0) + 1);
        }
        return Array.from(tally.entries())
            .map(([operatorName, count]) => ({ operatorName, count }))
            .sort((a, b) => (b.count - a.count) || a.operatorName.localeCompare(b.operatorName));
    }
};

const SAMPLE = [
    { operatorName: 'PINTU KUMAR', consumerName: 'MRS SAHINA BANO', areaDescription: 'CHANDAUTI ROAD', consumerNumber: '73595271' },
    { operatorName: 'PINTU KUMAR', consumerName: 'KHAIRUDDIN MOHAMMAD ANSARI SAHEB', areaDescription: 'NEAR JAMA MASJID CHANDAUTI ROAD WARD 12', consumerNumber: '101000000' },
    { operatorName: 'SURAJ KUMAR', consumerName: 'MRS SAVITA DEVI', areaDescription: 'STATION ROAD', consumerNumber: '107704871' }
];

// Round-trips through a real file so we assert what Excel would actually open.
async function buildAndRead(records = SAMPLE) {
    const { workbook } = runBuilder(records, scraperStub, appRequire);
    const file = path.join(os.tmpdir(), `nexus_test_${Date.now()}_${Math.random().toString(36).slice(2)}.xlsx`);
    await workbook.xlsx.writeFile(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const bytes = fs.statSync(file).size;
    fs.unlinkSync(file);
    return { wb, sheet: wb.getWorksheet('Delivery Report'), bytes };
}

const argb = (cell) => (cell.fill && cell.fill.fgColor ? cell.fill.fgColor.argb : null);

(async () => {
    console.log('\n──────────── DEPENDENCY ────────────');

    await test('exceljs is a dependency of the packaged Electron app', () => {
        const pkg = JSON.parse(fs.readFileSync(APP_PKG, 'utf8'));
        assert.ok(pkg.dependencies && pkg.dependencies.exceljs, 'must be in desktop-app dependencies');
        assert.ok(!(pkg.devDependencies || {}).exceljs, 'must NOT be a devDependency - it ships at runtime');
        assert.ok(fs.existsSync(path.join(ROOT, 'desktop-app', 'node_modules', 'exceljs')), 'installed');
    });

    await test('main.js requires exceljs, and the CSV writer is gone', () => {
        assert.ok(mainSrc.includes("require('exceljs')"), 'workbook builder loads exceljs');
        assert.ok(!mainSrc.includes('function toCsvCell'), 'dead CSV cell helper removed');
        assert.ok(!mainSrc.includes('function toCsvConsumerNumber'), 'dead CSV number helper removed');
        assert.ok(!/fs\.writeFileSync\(targetPath/.test(mainSrc), 'no raw CSV file write left');
    });

    console.log('\n──────────── WORKBOOK STRUCTURE ────────────');

    await test('sheet is named "Delivery Report" with gridlines shown', async () => {
        const { sheet } = await buildAndRead();
        assert.strictEqual(sheet.name, 'Delivery Report');
        assert.strictEqual(sheet.views[0].showGridLines, true);
    });

    await test('operator title row: merged A:C, bold 12, dark fill, white, h26, centered', async () => {
        const { sheet } = await buildAndRead();
        const row = sheet.getRow(1);
        const cell = row.getCell(1);
        assert.strictEqual(cell.value, 'NAME - PINTU KUMAR (Total: 2)', 'title text');
        assert.strictEqual(row.height, 26, 'height 26');
        assert.strictEqual(argb(cell), 'FF1E293B', 'dark slate fill');
        assert.strictEqual(cell.font.color.argb, 'FFF8FAFC', 'white text');
        assert.strictEqual(cell.font.bold, true, 'bold');
        assert.strictEqual(cell.font.size, 12, 'size 12');
        assert.strictEqual(cell.alignment.horizontal, 'center');
        assert.strictEqual(cell.alignment.vertical, 'middle');
        // Merged across all three columns.
        assert.strictEqual(sheet.getRow(1).getCell(3).value, cell.value, 'merged to column C');
    });

    await test('one blank row sits under each operator title', async () => {
        const { sheet } = await buildAndRead();
        for (const n of [2, 9]) {
            const vals = [1, 2, 3].map((c) => sheet.getRow(n).getCell(c).value);
            assert.deepStrictEqual(vals, [null, null, null], `row ${n} must be blank`);
        }
    });

    await test('header row: bold 11, slate fill, white, h22, all three centered', async () => {
        const { sheet } = await buildAndRead();
        const row = sheet.getRow(3);
        assert.deepStrictEqual(
            [1, 2, 3].map((c) => row.getCell(c).value),
            ['Consumer Name', 'Area Description', 'Consumer Number']
        );
        assert.strictEqual(row.height, 22, 'height 22');
        for (const c of [1, 2, 3]) {
            const cell = row.getCell(c);
            assert.strictEqual(argb(cell), 'FF334155', `col ${c} slate fill`);
            assert.strictEqual(cell.font.color.argb, 'FFFFFFFF', `col ${c} white text`);
            assert.strictEqual(cell.font.bold, true, `col ${c} bold`);
            assert.strictEqual(cell.font.size, 11, `col ${c} size 11`);
            assert.strictEqual(cell.alignment.horizontal, 'center', `col ${c} centered`);
            assert.strictEqual(cell.alignment.vertical, 'middle', `col ${c} middle`);
        }
    });

    await test('data rows: Name | Area | Number, height 20, all centered', async () => {
        const { sheet } = await buildAndRead();
        const row = sheet.getRow(4);
        assert.deepStrictEqual(
            [1, 2, 3].map((c) => row.getCell(c).value),
            ['MRS SAHINA BANO', 'CHANDAUTI ROAD', '73595271']
        );
        assert.strictEqual(row.height, 20, 'height 20');
        for (const c of [1, 2, 3]) {
            assert.strictEqual(row.getCell(c).alignment.horizontal, 'center', `col ${c} centered`);
        }
    });

    await test('consumer numbers are TEXT - never scientific notation', async () => {
        const { sheet } = await buildAndRead();
        // 101000000 is the exact value that renders as 1.01E+08 when numeric.
        const cell = sheet.getRow(5).getCell(3);
        assert.strictEqual(typeof cell.value, 'string', 'stored as a string, not a number');
        assert.strictEqual(cell.value, '101000000', 'exact digits preserved');
        assert.strictEqual(cell.numFmt, '@', 'text number format');
    });

    await test('two blank rows separate operator groups', async () => {
        const { sheet } = await buildAndRead();
        for (const n of [6, 7]) {
            assert.deepStrictEqual(
                [1, 2, 3].map((c) => sheet.getRow(n).getCell(c).value),
                [null, null, null],
                `row ${n} must be blank`
            );
        }
        assert.strictEqual(sheet.getRow(8).getCell(1).value, 'NAME - SURAJ KUMAR (Total: 1)', 'next group starts after');
    });

    await test('operator groups are ordered by count DESCENDING', async () => {
        const { sheet } = await buildAndRead();
        const titles = [];
        sheet.eachRow((row) => {
            const v = row.getCell(1).value;
            if (typeof v === 'string' && v.startsWith('NAME - ')) titles.push(v);
        });
        assert.deepStrictEqual(titles, ['NAME - PINTU KUMAR (Total: 2)', 'NAME - SURAJ KUMAR (Total: 1)']);
    });

    console.log('\n──────────── AUTO-FIT COLUMN WIDTHS ────────────');

    await test('long names and areas get wide enough columns to stay readable', async () => {
        const { sheet } = await buildAndRead();
        const [a, b, c] = sheet.columns.slice(0, 3).map((col) => col.width);
        // 'KHAIRUDDIN MOHAMMAD ANSARI SAHEB' = 32 chars -> 36
        assert.strictEqual(a, 36, 'column A fits the longest name');
        // 'NEAR JAMA MASJID CHANDAUTI ROAD WARD 12' = 39 chars -> 43
        assert.strictEqual(b, 43, 'column B fits the longest area');
        assert.ok(c >= 18, `column C at least the floor (${c})`);
    });

    await test('widths are clamped between 18 and 45', async () => {
        const { sheet } = await buildAndRead([
            { operatorName: 'X', consumerName: 'A'.repeat(120), areaDescription: 'B', consumerNumber: '1' }
        ]);
        const [a, b] = sheet.columns.slice(0, 2).map((col) => col.width);
        assert.strictEqual(a, 45, 'a very long value is capped at 45');
        // B only holds 'B', but the merged operator title spans it, so the
        // measured length is the title's - still comfortably inside the clamp.
        assert.ok(b >= 18 && b <= 45, `column B stays within the clamp (${b})`);
    });

    console.log('\n──────────── FILE + SAVE DIALOG ────────────');

    await test('a real, openable .xlsx is produced', async () => {
        const { bytes, wb } = await buildAndRead();
        assert.ok(bytes > 4000, `non-trivial workbook written (${bytes} bytes)`);
        assert.ok(wb.getWorksheet('Delivery Report'), 're-readable by ExcelJS');
    });

    await test('save dialog offers .xlsx and the filename is DD-MM-YYYY_HHMM', () => {
        const handler = slice(mainSrc, "ipcMain.handle('export-delivery-report-csv'", '\n});', 'export handler');
        assert.ok(handler.includes("filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]"), 'xlsx filter');
        assert.ok(!handler.includes("extensions: ['csv']"), 'csv filter gone');
        assert.ok(handler.includes('await workbook.xlsx.writeFile(targetPath);'), 'writes the workbook');
        assert.ok(
            /Delivery_Report_\$\{pad\(stamp\.getDate\(\)\)\}-\$\{pad\(stamp\.getMonth\(\) \+ 1\)\}-\$\{stamp\.getFullYear\(\)\}_/.test(handler),
            'DD-MM-YYYY name'
        );
        assert.ok(handler.includes('.xlsx`;'), 'xlsx extension');
    });

    await test('the modal button no longer claims to produce a CSV', () => {
        assert.ok(htmlSrc.includes('<span>Download Excel Report</span>'), 'relabelled');
        assert.ok(!htmlSrc.includes('Download CSV Report'), 'old label gone');
    });

    console.log('\n──────────── REPORT CONTROL CARD ────────────');

    await test('card is matte #0f172a with a teal hairline border', () => {
        const rule = cssRule(stylesSrc, '.report-control-card', 'card');
        assert.ok(rule.includes('background: #0f172a'), 'matte dark');
        assert.ok(rule.includes('border: 1px solid rgba(20, 184, 166, 0.25)'), 'teal border');
        assert.ok(htmlSrc.includes('class="card action-card report-control-card"'), 'markup uses it');
    });

    await test('header is an uppercase teal badge with a pulse dot', () => {
        const label = cssRule(stylesSrc, '.report-control-label', 'label');
        assert.ok(label.includes('color: #2dd4bf'), 'teal');
        assert.ok(label.includes('font-size: 11px'), '11px');
        assert.ok(label.includes('letter-spacing: 1px'), '1px tracking');
        assert.ok(label.includes('text-transform: uppercase'), 'uppercase');

        const dot = cssRule(stylesSrc, '.report-control-dot', 'dot');
        assert.ok(dot.includes('background: #2dd4bf'), 'teal dot');
        assert.ok(dot.includes('animation: reportDotPulse'), 'pulses');
        assert.ok(stylesSrc.includes('@keyframes reportDotPulse'), 'keyframes defined');
        assert.ok(htmlSrc.includes('class="report-control-dot"'), 'dot in markup');
    });

    await test('Start Fetching Report uses the teal->cyan gradient', () => {
        const rule = cssRule(stylesSrc, '.btn.btn-delivery-fetch', 'fetch button');
        assert.ok(rule.includes('linear-gradient(135deg, #0d9488 0%, #0284c7 100%)'), 'teal -> cyan');
        assert.ok(rule.includes('color: #ffffff'), 'crisp white');
        assert.ok(rule.includes('font-weight: 600'), 'weight 600');

        const hover = cssRule(stylesSrc, '.btn.btn-delivery-fetch:hover:not(:disabled)', 'hover');
        assert.ok(hover.includes('linear-gradient(135deg, #0f766e 0%, #0369a1 100%)'), 'deeper hover gradient');
        assert.ok(hover.includes('box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35)'), 'soft glow');
    });

    await test('View Last Report is a matte teal-outlined pill with no tooltip', () => {
        const rule = cssRule(stylesSrc, '.btn-view-report', 'view button');
        assert.ok(rule.includes('background: rgba(15, 23, 42, 0.6)'), 'matte dark');
        assert.ok(rule.includes('border: 1px solid rgba(45, 212, 191, 0.4)'), 'teal outline');
        assert.ok(rule.includes('color: #5eead4'), 'teal text');
        assert.ok(rule.includes('font-weight: 500'), 'weight 500');
        assert.ok(rule.includes('border-radius: 999px'), 'pill');

        const hover = cssRule(stylesSrc, '.btn-view-report:hover:not(:disabled)', 'hover');
        assert.ok(hover.includes('background: rgba(13, 148, 136, 0.15)'), 'hover wash');
        assert.ok(hover.includes('border-color: #2dd4bf'), 'hover border');

        // Still no tooltip of any kind on this button.
        const tag = slice(htmlSrc, 'id="btnOpenLastReport"', '</button>', 'view tag');
        assert.ok(!tag.includes('title='), 'no native tooltip');
        assert.ok(!tag.includes('data-tooltip'), 'no app tooltip');
        assert.ok(!rendererSrc.includes('btnViewLastDeliveryReport.title'), 'renderer never sets one');
    });

    await test('the subtitle note is small, muted and centered', () => {
        const rule = cssRule(stylesSrc, '.report-control-card .action-help-text', 'subtitle');
        assert.ok(rule.includes('color: #64748b'), 'muted');
        assert.ok(rule.includes('font-size: 10.5px'), '10.5px');
        assert.ok(rule.includes('text-align: center'), 'centered');
        assert.ok(
            htmlSrc.includes('Confirms before launching. Collected records are kept on stop.'),
            'exact copy'
        );
    });

    console.log('\n──────────── PRESERVATION ────────────');

    await test('scraping engine, mutex and credential state untouched', () => {
        const scraperSrc = fs.readFileSync(path.join(ROOT, 'desktop-app', 'scrapers', 'deliveryReportScraper.js'), 'utf8');
        assert.ok(scraperSrc.includes('async function scrapePaginatedTable'), 'scraping loop intact');
        assert.ok(scraperSrc.includes('async function openEDayEndPage'), 'navigation intact');
        assert.ok(scraperSrc.includes('if (!key || deduped.has(key)) { continue; }'), 'dedup intact');
        assert.ok(mainSrc.includes('if (isAnyAutomationRunning) {'), 'backend mutex intact');
        assert.ok(rendererSrc.includes('function updateAutomationLockState'), 'UI lock intact');
        assert.ok(rendererSrc.includes('function applyDeliveryLicenseState'), 'credential sync intact');
        assert.ok(rendererSrc.includes("setDeliveryState('config'"), 'config error state intact');
    });

    await test('the handler still dedups by consumer number before building', () => {
        // Dedup runs upstream of the workbook builder, so assert it at source.
        const handler = slice(mainSrc, "ipcMain.handle('export-delivery-report-csv'", '        // ---- Hierarchical', 'pre-build');
        assert.ok(handler.includes('const deduped = new Map();'), 'dedup map');
        assert.ok(handler.includes('if (!key || deduped.has(key)) continue;'), 'skips duplicates');
        assert.ok(handler.includes('const unique = Array.from(deduped.values());'), 'builder receives unique records');
    });

    await test('consumers are listed alphabetically within an operator', async () => {
        // The alphabetical sort also runs upstream of the builder, so assert
        // the comparator at source and that the builder preserves that order.
        assert.ok(
            mainSrc.includes("const byName = String(a.consumerName || '').localeCompare("),
            'alphabetical comparator intact'
        );
        const { sheet } = await buildAndRead([SAMPLE[1], SAMPLE[0]]);
        assert.strictEqual(sheet.getRow(1).getCell(1).value, 'NAME - PINTU KUMAR (Total: 2)');
        assert.strictEqual(sheet.getRow(4).getCell(1).value, 'KHAIRUDDIN MOHAMMAD ANSARI SAHEB', 'order preserved');
        assert.strictEqual(sheet.getRow(5).getCell(1).value, 'MRS SAHINA BANO');
    });

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(64)}\n`);
    process.exitCode = failed === 0 ? 0 : 1;
})();
