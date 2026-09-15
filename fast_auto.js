require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ac = require('@antiadmin/anticaptchaofficial');

const SESSION_DIR = path.join(__dirname, 'bpcl_session');

function formatDuration(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * MODULE 1: Login with Anti-Captcha (Optimized)
 */
async function performLogin(page, userId, password) {
    console.log('🌐 Navigating to eConnect portal...');
    await page.goto('https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO', { 
        waitUntil: 'domcontentloaded' 
    });

    // Check if already logged in without waiting blindly
    const loginForm = page.locator('#principal');
    const isLoginFormVisible = await loginForm.isVisible({ timeout: 4000 }).catch(() => false);

    if (!isLoginFormVisible) {
        console.log('✅ Session valid, skipping login');
        return; 
    }

    console.log('🔒 Session not active, logging in...');
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`\n🔄 Login Attempt ${attempt}/3...`);
        
        try {
            await page.fill('#principal', userId);
            await page.fill('#input_password', password);

            console.log('🤖 Solving CAPTCHA using Anti-Captcha...');
            
            const captchaElement = page.locator('img#captcha');
            await captchaElement.waitFor({ state: 'visible', timeout: 10000 });
            
            const imageBuffer = await captchaElement.screenshot();
            const base64Image = imageBuffer.toString('base64');

            const rawCaptchaText = await ac.solveImage(base64Image, true);
            const captchaText = rawCaptchaText.toUpperCase(); 
            console.log(`✅ CAPTCHA solved: ${captchaText}`);

            await page.fill('input#captcha', captchaText);

            // Wait for navigation/dashboard postback
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
                page.click('.login-btn')
            ]);
            
            const stillOnLogin = await page.locator('#principal').isVisible().catch(() => false);
            
            if (!stillOnLogin) {
               console.log('✅ Successfully navigated to dashboard!');
               await page.context().storageState({ path: 'state.json' });
               console.log('💾 Session cookies successfully saved to state.json');
               return; 
            } else {
               console.log(`⚠️ Attempt ${attempt} failed: Incorrect CAPTCHA or server error.`);
               if (attempt < 3) {
                   console.log('🔄 Reloading page for fresh CAPTCHA...');
                   await page.reload({ waitUntil: 'domcontentloaded' });
               }
            }
        } catch (error) {
            console.error(`❌ Attempt ${attempt} encountered an error: ${error.message}`);
            if (attempt === 3) throw new Error('Login completely failed after 3 attempts.');
        }
    }
}

/**
 * MODULE 2: Scrape consumer numbers from E-Day End page (High Speed)
 */
async function scrapeConsumerNumbers(page) {
    console.log('📊 Navigating to E-Day End page to scrape numbers...');

    // 1. Hover menu and trigger LPG One
    console.log('🖱️ Hovering over "My Applications" menu...');
    const myAppMenu = page.locator('a').filter({ hasText: 'My Application' }).first();
    await myAppMenu.waitFor({ state: 'visible' });
    await myAppMenu.hover();

    console.log('🖱️ Clicking on "LPG One"...');
    const [page1] = await Promise.all([
        page.context().waitForEvent('page'), 
        page.locator('a').filter({ hasText: 'LPG One' }).first().click()
    ]);
    
    await page1.waitForLoadState('domcontentloaded');

    // 2. Navigate inside LPG One
    console.log('🖱️ Clicking on "E-Day End"...');
    await page1.getByRole('link', { name: 'E-Day End This option is for' }).click();
    
    const proceedBtn = page1.getByRole('button', { name: 'Proceed' });
    await proceedBtn.waitFor({ state: 'visible' });
    await proceedBtn.click();

    // 3. Open final consumer list tab
    console.log('🖱️ Opening consumer list for Product 5350 (Delivery Confirmation Not Done)...');
    const targetLink = page1
        .locator('#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr', { hasText: '5350' })
        .locator('a[id*="hlDelvConfNotDone"]')
        .first();

    await targetLink.waitFor({ state: 'visible' });

    const [page2] = await Promise.all([
        page1.context().waitForEvent('page'),
        targetLink.click()
    ]);

    await page2.waitForLoadState('domcontentloaded');
    console.log('✅ E-Day End tab opened!');

    // Native Node-side extraction (Zero browser code injection, zero obfuscation conflict)
    await page2.waitForSelector('#gvProductConsumer tr', { state: 'attached', timeout: 15000 });

    // Direct extraction of column 3 cells across all rows
    const rawCells = await page2.locator('#gvProductConsumer tr td:nth-child(3)').allTextContents();
    const consumerNumbers = rawCells.map(t => t.trim()).filter(t => t.length > 0);

    console.log(`📋 Successfully scraped ${consumerNumbers.length} consumer numbers.`);
    await page2.close(); 
    await page1.close(); 
    return consumerNumbers;
}

/**
 * MODULE 3: Run the cancellation logic (Zero Latency Postback Model)
 */
async function runCancellation(page, numbers) {
    console.log(`\n🚀 Starting Cancellation Process for ${numbers.length} numbers...`);

    const myAppMenu = page.locator('a').filter({ hasText: 'My Application' }).first();
    await myAppMenu.waitFor({ state: 'visible' });
    await myAppMenu.hover();

    console.log('🖱️ Clicking on "LPG One"...');
    const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        page.locator('a').filter({ hasText: 'LPG One' }).first().click()
    ]);

    await newPage.waitForLoadState('domcontentloaded');

    console.log('🖱️ Clicking on "Cash Memo Cancel"...');
    await newPage.locator('a').filter({ hasText: 'Cash Memo Cancel' }).first().click();
    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForSelector('#ctl00_ContentPlaceHolder1_txtConsumerNumber', { state: 'visible' });

    let pendingNumbers = [...numbers];
    const maxPasses = 2;
    let totalCancelledCount = 0;

    for (let pass = 1; pass <= maxPasses; pass++) {
        if (pendingNumbers.length === 0) break;
        
        if (pass === 2) {
            console.log(`\n⚠️ PASS 2: Automatically retrying ${pendingNumbers.length} failed numbers...`);
        }

        let failedInThisPass = [];

        for (let i = 0; i < pendingNumbers.length; i++) {
            const consumerNo = pendingNumbers[i];

            try {
                // Direct fill
                await newPage.fill('#ctl00_ContentPlaceHolder1_txtConsumerNumber', consumerNo);
                
                // ASP.NET Postback Wait (Replaced slow networkidle)
                await Promise.all([
                    newPage.waitForResponse(resp => resp.url().includes('econnect') && resp.status() === 200, { timeout: 10000 }).catch(() => {}),
                    newPage.click('#ctl00_ContentPlaceHolder1_btnProceed')
                ]);

                const cancelLink = newPage.locator('#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel');
                const isCancelVisible = await cancelLink.isVisible().catch(() => false);
                
                if (isCancelVisible) {
                    await Promise.all([
                        newPage.waitForResponse(resp => resp.url().includes('econnect') && resp.status() === 200, { timeout: 10000 }).catch(() => {}),
                        cancelLink.click()
                    ]);

                    const msgLocator = newPage.locator('#ctl00_ContentPlaceHolder1_lblMessage');
                    const msg = await msgLocator.textContent().catch(() => '');

                    if (msg && msg.includes('Successfully')) {
                        totalCancelledCount++;
                        console.log(`✅ [${i + 1}/${pendingNumbers.length}] Cancelled: ${consumerNo}`);
                    } else {
                        console.log(`⚠️ ${consumerNo} message unclear: "${msg}". Added to retry.`);
                        failedInThisPass.push(consumerNo);
                    }
                } else {
                    console.log(`⏭️ [${i + 1}/${pendingNumbers.length}] No cancel link for ${consumerNo} (Already cancelled/inactive).`);
                }

                // Clean form reset without waiting for 500ms network silence
                await Promise.all([
                    newPage.waitForResponse(resp => resp.status() === 200, { timeout: 5000 }).catch(() => {}),
                    newPage.click('#ctl00_ContentPlaceHolder1_btnClear')
                ]);

            } catch (err) {
                console.log(`❌ Error processing ${consumerNo}: ${err.message}. Added to retry.`);
                failedInThisPass.push(consumerNo);
                try {
                    await newPage.click('#ctl00_ContentPlaceHolder1_btnClear');
                } catch(e) {}
            }
        }
        
        pendingNumbers = failedInThisPass; 
        
        if (pass === maxPasses && pendingNumbers.length > 0) {
            console.log(`\n🚨 Final Report: ${pendingNumbers.length} numbers could not be cancelled.`);
            console.log('Failed Numbers:', pendingNumbers);
        }
    }
    
    return totalCancelledCount;
}

/**
 * MASTER ORCHESTRATOR WITH BENCHMARK TIMER
 */
(async () => {
    const USER_ID = process.env.USER_ID;
    const PASSWORD = process.env.PASSWORD;
    const ANTI_CAPTCHA_KEY = process.env.ANTI_CAPTCHA_KEY;

    if (!USER_ID || !PASSWORD) {
        console.error('❌ Missing USER_ID or PASSWORD in .env file!');
        process.exit(1);
    }
    if (!ANTI_CAPTCHA_KEY) {
        console.error('❌ Missing ANTI_CAPTCHA_KEY in .env file!');
        process.exit(1);
    }

    ac.setAPIKey(ANTI_CAPTCHA_KEY);

    // Launch Chromium with background-throttling disabled for consistent max speed
    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });

    let contextOptions = { viewport: null };
    if (fs.existsSync('state.json')) {
        contextOptions.storageState = 'state.json';
        console.log('📂 Found existing session in state.json');
    }
    
    const context = await browser.newContext(contextOptions);

    // Block non-essential media & fonts (Keeps CAPTCHA intact)
    await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        const url = route.request().url();

        // Never block captcha images
        if (url.toLowerCase().includes('captcha')) {
            return route.continue();
        }

        // Abort non-essential bulky files
        if (['image', 'font', 'media'].includes(type)) {
            return route.abort();
        }
        return route.continue();
    });

    const page = await context.newPage();

    try {
        // Step 1: Login
        await performLogin(page, USER_ID, PASSWORD);

        // Step 2: Scrape Numbers
        const consumerNumbers = await scrapeConsumerNumbers(page);

        if (!consumerNumbers || consumerNumbers.length === 0) {
            console.log('ℹ️ No consumer numbers found to cancel. Exiting.');
            process.exit(0);
        }

        // ==========================================
        // TIMER START: Right after scraping finishes
        // ==========================================
        console.log('\n⏱️ Starting cancellation benchmark timer...');
        const cancellationStartTime = Date.now();

        // Step 3: Run Cancellations
        const totalCancelled = await runCancellation(page, consumerNumbers);

        // ==========================================
        // TIMER STOP: After all passes/retries finish
        // ==========================================
        const cancellationEndTime = Date.now();
        const elapsedMs = Math.max(0, cancellationEndTime - cancellationStartTime);

        console.log('\n================ BENCHMARK REPORT ================');
        console.log(`Total Scraped       : ${consumerNumbers.length}`);
        console.log(`Successfully Cancelled : ${totalCancelled}`);
        console.log(`Time Taken          : ${formatDuration(elapsedMs)} (${elapsedMs} ms)`);
        console.log(`Average Speed       : ${(elapsedMs / (consumerNumbers.length || 1) / 1000).toFixed(2)}s per consumer`);
        console.log('==================================================\n');

    } catch (error) {
        console.error('\n❌ Master Automation Error:', error.message);
    } finally {
        console.log('✅ Benchmark complete. Closing browser...');
        await browser.close();
    }
})();