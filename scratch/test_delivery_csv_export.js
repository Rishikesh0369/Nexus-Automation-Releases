/**
 * Verifies the Delivery Report CSV assembly logic that lives in main.js,
 * without booting Electron: the toCsvCell escaper is extracted from the
 * real source, and the ordering/dedup rules are exercised end to end.
 *
 * Run: node scratch/test_delivery_csv_export.js
 */

const fs = require('fs');
const path = require('path');

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'desktop-app', 'main.js'), 'utf8');

// ---- Extract the real toCsvCell implementation -----------------
const fnStart = mainSrc.indexOf('function toCsvCell(value) {');
if (fnStart === -1) throw new Error('toCsvCell not found in main.js');
let depth = 0, i = mainSrc.indexOf('{', fnStart), end = -1;
for (; i < mainSrc.length; i++) {
    if (mainSrc[i] === '{') depth++;
    else if (mainSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const toCsvCell = new Function(`${mainSrc.slice(fnStart, end)}; return toCsvCell;`)();

const { buildOperatorSummary } = require(path.join(__dirname, '..', 'desktop-app', 'scrapers', 'deliveryReportScraper.js'));

let failures = 0;
function check(label, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) {
        console.log(`      expected: ${JSON.stringify(expected)}`);
        console.log(`      actual:   ${JSON.stringify(actual)}`);
    }
}

// ---- Cell escaping ---------------------------------------------
check('cell: plain text untouched', toCsvCell('Ramesh Kumar'), 'Ramesh Kumar');
check('cell: comma is quoted', toCsvCell('Sector 5, Block B'), '"Sector 5, Block B"');
check('cell: quote is doubled', toCsvCell('He said "hi"'), '"He said ""hi"""');
check('cell: newline is quoted', toCsvCell('line1\nline2'), '"line1\nline2"');
check('cell: formula injection neutralised', toCsvCell('=cmd|calc'), "'=cmd|calc");
check('cell: plus-formula neutralised', toCsvCell('+1+1'), "'+1+1");
check('cell: at-formula neutralised', toCsvCell('@SUM(A1)'), "'@SUM(A1)");
check('cell: null becomes empty', toCsvCell(null), '');
check('cell: undefined becomes empty', toCsvCell(undefined), '');

// ---- Full CSV assembly (mirrors the handler) --------------------
const records = [
    { operatorName: 'Amit Singh', consumerNumber: '300000010', consumerName: 'Consumer J', areaDescription: 'Area 1' },
    { operatorName: 'Ramesh Kumar', consumerNumber: '300000002', consumerName: 'Consumer B, Jr', areaDescription: 'Area 2' },
    { operatorName: 'Ramesh Kumar', consumerNumber: '300000001', consumerName: 'Consumer A', areaDescription: 'Area 1' },
    { operatorName: 'Suresh Yadav', consumerNumber: '300000003', consumerName: 'Consumer C', areaDescription: 'Area 3' },
    { operatorName: 'Ramesh Kumar', consumerNumber: '300000009', consumerName: 'Consumer I', areaDescription: 'Area 2' },
    // duplicate consumer number - must be dropped
    { operatorName: 'Ramesh Kumar', consumerNumber: '300000001', consumerName: 'Consumer A dup', areaDescription: 'Area 1' },
    { operatorName: '', consumerNumber: '300000004', consumerName: 'Consumer D', areaDescription: 'Area 4' }
];

const deduped = new Map();
for (const rec of records) {
    const key = String(rec?.consumerNumber || '').trim();
    if (!key || deduped.has(key)) continue;
    deduped.set(key, rec);
}
const unique = Array.from(deduped.values());

const order = new Map();
buildOperatorSummary(unique).forEach((entry, idx) => order.set(entry.operatorName, idx));
const rank = (name) => {
    const key = String(name || '').trim() || 'Unassigned';
    return order.has(key) ? order.get(key) : Number.MAX_SAFE_INTEGER;
};
unique.sort((a, b) => {
    const diff = rank(a.operatorName) - rank(b.operatorName);
    if (diff !== 0) return diff;
    return String(a.consumerNumber || '').localeCompare(String(b.consumerNumber || ''), undefined, { numeric: true });
});

const lines = ['Operator Name,Consumer Number,Consumer Name,Area Description'];
for (const rec of unique) {
    lines.push([
        toCsvCell((rec.operatorName || '').trim() || 'Unassigned'),
        toCsvCell(rec.consumerNumber),
        toCsvCell(rec.consumerName),
        toCsvCell(rec.areaDescription)
    ].join(','));
}

check('csv: duplicate consumer dropped', unique.length, 6);
check('csv: header row exact', lines[0], 'Operator Name,Consumer Number,Consumer Name,Area Description');
check('csv: column count per row', [...new Set(lines.map(l => l.split(',').length >= 4))], [true]);

// Ramesh Kumar has 3 records -> ranked first, consumers ascending.
check('csv: top operator grouped first', lines.slice(1, 4).map(l => l.split(',')[0]),
    ['Ramesh Kumar', 'Ramesh Kumar', 'Ramesh Kumar']);
check('csv: consumers ascending within operator', lines.slice(1, 4).map(l => l.split(',')[1]),
    ['300000001', '300000002', '300000009']);
check('csv: comma-bearing name quoted in place',
    lines[2], 'Ramesh Kumar,300000002,"Consumer B, Jr",Area 2');
check('csv: blank operator becomes Unassigned',
    lines.some(l => l.startsWith('Unassigned,300000004')), true);
check('csv: kept the first duplicate, not the later one',
    lines.some(l => l.includes('Consumer A dup')), false);

console.log(failures === 0 ? '\nAll CSV export checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
