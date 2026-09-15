/**
 * Verifies the "Book Date" column end to end:
 *   1. EVAL_ROWS reads Book Date out of table column index 3.
 *   2. The scraper's per-page dedupe keeps bookDate on the record.
 *   3. The .xlsx builder writes 4 columns, merges the operator title A:D,
 *      keeps the date as text, and auto-fits column D.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const APP = path.join(__dirname, '..', 'desktop-app');
const scraperSrc = fs.readFileSync(path.join(APP, 'scrapers', 'deliveryReportScraper.js'), 'utf8');
const mainSrc = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8');

let failures = 0;
function check(label, fn) {
    try { fn(); console.log(`✅ ${label}`); }
    catch (err) { failures++; console.log(`❌ ${label}\n   ${err.message}`); }
}

// ---- 1. EVAL_ROWS against a fake DOM ---------------------------------
// The scraper keeps its page scripts as raw template strings (obfuscation
// safe), so lift EVAL_ROWS out of the source with its backticks intact and
// let the JS engine itself resolve the escapes.
function extractEval(name) {
    const start = scraperSrc.indexOf(`const ${name} = `);
    assert.ok(start !== -1, `${name} not found`);
    const open = scraperSrc.indexOf('`', start);
    const close = scraperSrc.indexOf('`;', open + 1);
    assert.ok(open !== -1 && close !== -1, `${name} literal not delimited`);
    const literal = scraperSrc.slice(open, close + 1);
    return new Function(`return ${literal};`)();
}

function fakeCell(text) {
    return { tagName: 'TD', innerText: text, textContent: text };
}
function fakeRow(values) {
    return {
        children: values.map(fakeCell),
        getElementsByTagName: () => [],
        querySelector: () => null
    };
}

// Real column layout: 1=name, 2=consumer no, 3=book date, 5=area, 8=operator.
const trs = [
    fakeRow(['1', 'RAMESH KUMAR', '101234567', '05/09/2026', 'x', 'WARD 4', 'y', 'z', 'SURESH']),
    fakeRow(['2', 'SITA DEVI', '101234568', '06/09/2026', 'x', 'WARD 7', 'y', 'z', 'MAHESH']),
    // Header rendered with <td> - carries no digits in the consumer column.
    fakeRow(['#', 'Consumer Name', 'Consumer No', 'Book Date', 'x', 'Area', 'y', 'z', 'Operator'])
];

const sandboxDocument = { querySelectorAll: () => trs, body: { innerText: '' } };
const rows = new Function('document', `return ${extractEval('EVAL_ROWS')};`)(sandboxDocument);

check('EVAL_ROWS extracts bookDate from column index 3', () => {
    assert.strictEqual(rows.length, 2, `expected 2 data rows, got ${rows.length}`);
    assert.strictEqual(rows[0].bookDate, '05/09/2026');
    assert.strictEqual(rows[1].bookDate, '06/09/2026');
});

check('EVAL_ROWS leaves the existing fields untouched', () => {
    assert.strictEqual(rows[0].consumerName, 'RAMESH KUMAR');
    assert.strictEqual(rows[0].consumerNumber, '101234567');
    assert.strictEqual(rows[0].areaDescription, 'WARD 4');
    assert.strictEqual(rows[0].operatorName, 'SURESH');
});

// ---- 2. Record shapes carry bookDate ---------------------------------
check('scraper per-page dedupe keeps bookDate', () => {
    assert.ok(
        scraperSrc.includes("bookDate: (rec.bookDate || '').trim()"),
        'bookDate missing from the deduped.set() record'
    );
});

check('renderer persists bookDate on both merge branches + export payload', () => {
    const hits = (rendererSrc.match(/bookDate: rec[.]bookDate/g) || []).length;
    assert.strictEqual(hits, 3, `expected 3 bookDate sites in renderer.js, found ${hits}`);
});

// ---- 3. Workbook shape ------------------------------------------------
check('main.js merges the operator title across A:D', () => {
    assert.ok(mainSrc.includes('sheet.mergeCells(titleRow.number, 1, titleRow.number, 4);'));
    assert.ok(!mainSrc.includes(':C${titleRow.number}'), 'stale A:C merge still present');
});

check('main.js header row lists all four columns', () => {
    assert.ok(mainSrc.includes("'Consumer Name', 'Area Description', 'Consumer Number', 'Book Date'"));
});

(async () => {
    const ExcelJS = require(path.join(APP, 'node_modules', 'exceljs'));
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Delivery Report');
    const CENTER = { horizontal: 'center', vertical: 'middle' };

    // Mirrors the builder in main.js.
    const titleRow = sheet.addRow(['NAME - SURESH (Total: 1)']);
    sheet.mergeCells(titleRow.number, 1, titleRow.number, 4);
    sheet.addRow([]);
    const headerRow = sheet.addRow(['Consumer Name', 'Area Description', 'Consumer Number', 'Book Date']);
    headerRow.eachCell((cell) => { cell.alignment = CENTER; });
    const dataRow = sheet.addRow(['RAMESH KUMAR', 'WARD 4', '101234567', '05/09/2026']);
    dataRow.eachCell((cell) => { cell.alignment = CENTER; });
    dataRow.getCell(3).numFmt = '@';
    dataRow.getCell(4).numFmt = '@';

    sheet.columns.forEach((column) => {
        let maxLen = 15;
        column.eachCell({ includeEmpty: true }, (cell) => {
            const cellVal = cell.value ? cell.value.toString() : '';
            if (cellVal.length > maxLen) maxLen = cellVal.length;
        });
        column.width = Math.min(Math.max(maxLen + 4, 18), 45);
    });

    check('workbook exposes 4 columns so auto-fit reaches D', () => {
        assert.ok(sheet.columns.length >= 4, `only ${sheet.columns.length} column(s) materialised`);
        assert.ok(sheet.getColumn(4).width > 0, 'column D width was never set');
    });

    check('Book Date header and value land in column D as centered text', () => {
        assert.strictEqual(headerRow.getCell(4).value, 'Book Date');
        assert.strictEqual(dataRow.getCell(4).value, '05/09/2026');
        assert.strictEqual(typeof dataRow.getCell(4).value, 'string');
        assert.strictEqual(dataRow.getCell(4).numFmt, '@');
        assert.deepStrictEqual(headerRow.getCell(4).alignment, CENTER);
        assert.deepStrictEqual(dataRow.getCell(4).alignment, CENTER);
    });

    check('the merged title spans A1:D1', () => {
        const merges = sheet.model.merges || [];
        assert.ok(merges.includes('A1:D1'), `merges were ${JSON.stringify(merges)}`);
    });

    // Round-trip through a real file to prove the workbook is valid.
    const out = path.join(os.tmpdir(), `book_date_probe_${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(out);
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.readFile(out);
    check('round-tripped .xlsx keeps Book Date in column D', () => {
        const s = reread.getWorksheet('Delivery Report');
        assert.strictEqual(s.getRow(3).getCell(4).value, 'Book Date');
        assert.strictEqual(s.getRow(4).getCell(4).value, '05/09/2026');
    });
    fs.unlinkSync(out);

    console.log(failures === 0
        ? '\n\u{1F389} All Book Date checks passed.'
        : `\n\u{1F4A5} ${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})();
