/**
 * Integration test for the Delivery Report renderer wiring.
 *
 * Loads the REAL desktop-app/index.html + renderer.js in Chromium with a
 * stubbed ipcRenderer/electronAPI, fires a 'delivery-report-complete'
 * event and asserts the modal opens, metrics populate and the operator
 * table renders in descending order.
 *
 * Run: node scratch/test_delivery_report_ui.js
 */

const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'desktop-app', 'node_modules', 'playwright'));

const INDEX = 'file:///' + path.join(__dirname, '..', 'desktop-app', 'index.html').replace(/\\/g, '/');

const REPORT = {
    success: true,
    stopped: false,
    totalDelivered: 166,
    deliveredViaApp: 101,
    operatorSummary: [
        { operatorName: 'Ramesh Kumar', count: 34 },
        { operatorName: 'Suresh Yadav', count: 27 },
        { operatorName: 'Amit Singh', count: 19 },
        { operatorName: 'Vijay Prasad', count: 12 },
        { operatorName: 'Deepak Sharma', count: 9 }
    ],
    rawRecords: Array.from({ length: 101 }, (_, i) => ({
        consumerNumber: `30000${String(i + 1).padStart(4, '0')}`,
        consumerName: `Consumer ${i + 1}`,
        areaDescription: `Area ${(i % 3) + 1}`,
        operatorName: 'Ramesh Kumar'
    }))
};

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

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

    // Stub the Electron bridge BEFORE any page script runs.
    await page.addInitScript(() => {
        const listeners = {};
        window.__ipcSent = [];
        window.ipcRenderer = {
            invoke: (channel, ...args) => {
                window.__ipcSent.push({ channel, args });
                if (channel === 'get-settings' || channel === 'get-credentials') {
                    return Promise.resolve({ bpclUserId: 'U1', bpclPassword: 'P1', licenseKey: 'LIC-1', licenseValid: true });
                }
                if (channel === 'export-delivery-report-csv') {
                    return Promise.resolve({ success: true, rowCount: (args[0] || []).length });
                }
                return Promise.resolve({ success: true });
            },
            send: () => {},
            on: (channel, cb) => { (listeners[channel] = listeners[channel] || []).push(cb); },
            removeListener: () => {}
        };
        window.__emit = (channel, payload) => {
            (listeners[channel] || []).forEach(cb => cb({}, payload));
            return (listeners[channel] || []).length;
        };
        window.electronAPI = new Proxy({ workerBaseUrl: 'http://localhost:0' }, {
            get: (t, k) => (k in t ? t[k] : () => Promise.resolve(null))
        });
        window.nexusStore = { get: () => Promise.resolve(null), set: () => Promise.resolve(), clear: () => Promise.resolve() };
        window.fetch = () => Promise.reject(new Error('offline in test'));
    });

    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto(INDEX);
    await page.waitForTimeout(1200);

    try {
        // ---- Button present in Automation Control ---------------
        check('button: Fetch Delivery Report exists', await page.locator('#btnFetchDeliveryReport').count(), 1);
        check('button: label text', (await page.locator('#btnFetchDeliveryText').textContent()).trim(), 'Fetch Delivery Report');
        check('button: lives inside the action card',
            await page.locator('.action-card #btnFetchDeliveryReport').count(), 1);

        // ---- Modal starts hidden --------------------------------
        check('modal: hidden on load', await page.locator('#deliveryReportModal').isVisible(), false);

        // ---- Listeners actually registered ----------------------
        const listenerCount = await page.evaluate(() => window.__emit('delivery-report-complete', null));
        check('ipc: delivery-report-complete listener registered', listenerCount >= 1, true);

        // ---- Fire a completed report ----------------------------
        await page.evaluate((report) => window.__emit('delivery-report-complete', report), REPORT);
        await page.waitForTimeout(300);

        check('modal: opens on completion', await page.locator('#deliveryReportModal').isVisible(), true);
        check('metrics: Total Delivered', (await page.locator('#modalTotalDelivered').textContent()).trim(), '166');
        check('metrics: Delivered via Operator App', (await page.locator('#modalOperatorDelivered').textContent()).trim(), '101');

        const names = await page.locator('#deliveryOperatorTableBody td.col-operator').allTextContents();
        const counts = (await page.locator('#deliveryOperatorTableBody td.col-count').allTextContents()).map(Number);
        check('table: row count', names.length, 5);
        check('table: operator names', names.map(s => s.trim()),
            ['Ramesh Kumar', 'Suresh Yadav', 'Amit Singh', 'Vijay Prasad', 'Deepak Sharma']);
        check('table: sorted descending', counts, [34, 27, 19, 12, 9]);

        // Colour requirements: white total, vibrant green operator-app.
        const totalColor = await page.locator('#modalTotalDelivered').evaluate(el => getComputedStyle(el).color);
        const greenColor = await page.locator('#modalOperatorDelivered').evaluate(el => getComputedStyle(el).color);
        check('style: Total Delivered is white', totalColor, 'rgb(255, 255, 255)');
        check('style: Operator App count is green', greenColor, 'rgb(34, 197, 94)');

        // Right-aligned numeric column = "perfect alignment".
        const align = await page.locator('#deliveryOperatorTableBody td.col-count').first()
            .evaluate(el => getComputedStyle(el).textAlign);
        check('style: count column right-aligned', align, 'right');

        // ---- CSV export path ------------------------------------
        await page.locator('#btnDownloadDeliveryCsv').click();
        await page.waitForTimeout(300);
        const csvCall = await page.evaluate(() =>
            window.__ipcSent.filter(c => c.channel === 'export-delivery-report-csv').pop());
        check('csv: export invoked', !!csvCall, true);
        check('csv: deduplicated record count', csvCall ? csvCall.args[0].length : 0, 101);
        check('csv: record shape', csvCall ? Object.keys(csvCall.args[0][0]).sort() : [],
            ['areaDescription', 'consumerName', 'consumerNumber', 'operatorName']);

        // ---- Close + reopen from cache (no re-scrape) -----------
        await page.locator('#btnCloseDeliveryModal').click();
        await page.waitForTimeout(250);
        check('modal: closes on Close', await page.locator('#deliveryReportModal').isVisible(), false);

        check('button: "View last report" revealed', await page.locator('#btnViewLastDeliveryReport').isVisible(), true);
        const before = await page.evaluate(() => window.__ipcSent.filter(c => c.channel === 'start-delivery-report').length);
        await page.locator('#btnViewLastDeliveryReport').click();
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => window.__ipcSent.filter(c => c.channel === 'start-delivery-report').length);
        check('cache: modal reopens', await page.locator('#deliveryReportModal').isVisible(), true);
        check('cache: reopen did NOT trigger a re-scrape', after, before);
        check('cache: metrics still populated', (await page.locator('#modalTotalDelivered').textContent()).trim(), '166');

        // ---- Escape closes --------------------------------------
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        check('modal: Escape closes', await page.locator('#deliveryReportModal').isVisible(), false);

        // ---- Stopped/partial run keeps records ------------------
        await page.evaluate(() => window.__emit('delivery-report-complete', {
            stopped: true, totalDelivered: 48, deliveredViaApp: 28,
            operatorSummary: [{ operatorName: 'Amit Singh', count: 2 }],
            rawRecords: [{ consumerNumber: '1', consumerName: 'A', areaDescription: 'X', operatorName: 'Amit Singh' },
                         { consumerNumber: '2', consumerName: 'B', areaDescription: 'Y', operatorName: 'Amit Singh' }]
        }));
        await page.waitForTimeout(300);
        check('stopped: modal still opens with partial data', await page.locator('#deliveryReportModal').isVisible(), true);
        check('stopped: metrics from partial run', (await page.locator('#modalOperatorDelivered').textContent()).trim(), '28');
        check('stopped: meta flags partial', (await page.locator('#deliveryReportMeta').textContent()).includes('partial'), true);

        if (pageErrors.length) {
            console.log('\nPage errors observed (may be pre-existing offline-license noise):');
            pageErrors.slice(0, 5).forEach(e => console.log('   ' + e));
        }
    } finally {
        await browser.close();
    }

    console.log(failures === 0 ? '\nAll delivery-report UI checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})();
