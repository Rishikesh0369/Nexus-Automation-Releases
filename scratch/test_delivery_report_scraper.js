/**
 * Offline verification for the Delivery Report scraper.
 *
 * Serves a mock BPCL E-Day End page (summary panel + paginated ASP.NET
 * GridView) from a local http server and drives the real scraper
 * evaluation strings + pagination walk against it with Playwright.
 *
 * Run: node scratch/test_delivery_report_scraper.js
 */

const http = require('http');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'desktop-app', 'node_modules', 'playwright'));

// Pull the private eval strings + helpers out of the scraper source so we
// test the real thing rather than a copy.
const fs = require('fs');
const scraperPath = path.join(__dirname, '..', 'desktop-app', 'scrapers', 'deliveryReportScraper.js');
const scraperSrc = fs.readFileSync(scraperPath, 'utf8');

function extractEval(name) {
    const start = scraperSrc.indexOf(`const ${name} = \``);
    if (start === -1) throw new Error(`Could not find ${name}`);
    const from = scraperSrc.indexOf('`', start) + 1;
    const to = scraperSrc.indexOf('`;', from);
    return scraperSrc.slice(from, to).replace(/\\\\/g, '\\');
}

const EVAL_SUMMARY = extractEval('EVAL_SUMMARY');
const EVAL_ROWS = extractEval('EVAL_ROWS');
const EVAL_PAGER = extractEval('EVAL_PAGER');

const { buildOperatorSummary } = require(scraperPath);

// ---------------------------------------------------------------
// Mock data: 3 pages, 166 total delivered, 101 via operator app
// ---------------------------------------------------------------
const OPERATORS = ['Ramesh Kumar', 'Suresh Yadav', 'Amit Singh', 'Ramesh Kumar', 'Ramesh Kumar'];
const PAGE_SIZE = 10;
const TOTAL_ROWS = 25; // spans 3 pages

function makeRows(pageNum) {
    const startIdx = (pageNum - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, TOTAL_ROWS);
    let html = '';
    for (let i = startIdx; i < endIdx; i++) {
        const op = OPERATORS[i % OPERATORS.length];
        html += `<tr>
            <td>${i + 1}</td>
            <td>Consumer Name ${i + 1}</td>
            <td>30000${String(i + 1).padStart(4, '0')}</td>
            <td>col3</td>
            <td>col4</td>
            <td>Area ${(i % 3) + 1}</td>
            <td>col6</td>
            <td>col7</td>
            <td>${op}</td>
        </tr>`;
    }
    return html;
}

function makePager(currentPage) {
    const totalPages = Math.ceil(TOTAL_ROWS / PAGE_SIZE);
    let cells = '';
    for (let p = 1; p <= totalPages; p++) {
        cells += p === currentPage
            ? `<td><span>${p}</span></td>`
            : `<td><a href="javascript:__doPostBack('gv','Page$${p}')">${p}</a></td>`;
    }
    return `<tr class="pgr"><td colspan="9"><table><tr>${cells}</tr></table></td></tr>`;
}

function drilldownPage(pageNum) {
    return `<!doctype html><html><body>
        <table id="gvOperatorDelivery">
            <tr><th>#</th><th>Consumer Name</th><th>Consumer Number</th><th>c3</th><th>c4</th>
                <th>Area Description</th><th>c6</th><th>c7</th><th>Operator Name</th></tr>
            ${makeRows(pageNum)}
            ${makePager(pageNum)}
        </table>
        <script>
            document.addEventListener('click', function (e) {
                var a = e.target.closest ? e.target.closest('a') : null;
                if (!a || a.href.indexOf('Page$') === -1) return;
                e.preventDefault();
                var m = a.href.match(/Page\\$(\\d+)/);
                if (m) { window.location.href = '/drilldown?page=' + m[1]; }
            });
        <\/script>
    </body></html>`;
}

const SUMMARY_PAGE = `<!doctype html><html><body>
    <div id="ctl00_ContentPlaceHolder1_divModesViaDC">
        <div class="box"><span>Total Delivered</span><span>166</span></div>
        <div class="box"><span>Delivery Via Operator App</span>
            <a href="/drilldown?page=1" target="_blank">101</a>
        </div>
        <div class="box"><span>Delivery Via DC</span><a href="#">65</a></div>
    </div>
</body></html>`;

// ---------------------------------------------------------------
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
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (url.pathname === '/drilldown') {
            res.end(drilldownPage(parseInt(url.searchParams.get('page') || '1', 10)));
        } else {
            res.end(SUMMARY_PAGE);
        }
    });
    await new Promise(r => server.listen(0, r));
    const base = `http://127.0.0.1:${server.address().port}`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // ---- Step 3: summary extraction --------------------------
        await page.goto(`${base}/summary`);
        const summary = await page.evaluate(EVAL_SUMMARY);
        check('summary: container located', summary.containerFound, true);
        check('summary: Total Delivered', summary.totalDelivered, '166');
        check('summary: Delivered via Operator App', summary.deliveredViaApp, '101');

        // ---- Step 4: drill-down popup ----------------------------
        const popupPromise = page.waitForEvent('popup');
        await page.locator('#ctl00_ContentPlaceHolder1_divModesViaDC a').first().click();
        const page2 = await popupPromise;
        await page2.waitForLoadState('networkidle');
        check('drilldown: popup opened on page 1', page2.url().includes('page=1'), true);

        // ---- Step 5: pagination walk + dedup ---------------------
        const deduped = new Map();
        let pageNumber = 1;
        let pagesScraped = 0;

        for (let iter = 0; iter < 50; iter++) {
            const rows = await page2.evaluate(EVAL_ROWS);
            for (const rec of rows) {
                const key = (rec.consumerNumber || '').trim();
                if (!key || deduped.has(key)) continue;
                deduped.set(key, rec);
            }
            pagesScraped++;

            const pager = await page2.evaluate(EVAL_PAGER);
            if (!pager.links.length) break;

            const cur = parseInt(pager.current || String(pageNumber), 10);
            const next = pager.links
                .filter(l => /^[0-9]+$/.test(l.text))
                .map(l => ({ index: l.index, num: parseInt(l.text, 10) }))
                .filter(l => l.num > cur)
                .sort((a, b) => a.num - b.num)[0];
            if (!next) break;

            await Promise.all([
                page2.waitForLoadState('networkidle'),
                page2.locator('a[href*="Page$"]').nth(next.index).click()
            ]);
            const after = await page2.evaluate(EVAL_PAGER);
            pageNumber = parseInt(after.current || String(pageNumber + 1), 10);
        }

        check('pagination: pages walked', pagesScraped, 3);
        check('pagination: unique records', deduped.size, TOTAL_ROWS);

        const records = Array.from(deduped.values());
        check('rows: header row excluded', records.some(r => r.consumerNumber === 'Consumer Number'), false);
        check('rows: pager row excluded', records.some(r => !/[0-9]/.test(r.consumerNumber)), false);
        check('rows: first record fields', records[0], {
            consumerName: 'Consumer Name 1',
            consumerNumber: '300000001',
            areaDescription: 'Area 1',
            operatorName: 'Ramesh Kumar'
        });

        // ---- Step 6: aggregation ---------------------------------
        const opSummary = buildOperatorSummary(records);
        const totalCounted = opSummary.reduce((a, b) => a + b.count, 0);
        check('summary: counts total to record count', totalCounted, TOTAL_ROWS);
        check('summary: sorted descending', opSummary.map(o => o.count),
            opSummary.map(o => o.count).slice().sort((a, b) => b - a));
        check('summary: top operator is Ramesh Kumar', opSummary[0].operatorName, 'Ramesh Kumar');
        check('summary: Ramesh Kumar count', opSummary[0].count, 15);
    } finally {
        await browser.close();
        server.close();
    }

    console.log(failures === 0 ? '\nAll delivery-report checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})();
