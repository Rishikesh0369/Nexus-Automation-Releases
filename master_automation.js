require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ac = require('@antiadmin/anticaptchaofficial');
const { solveAntiCaptcha } = require('./bela_nexus_runner');

/**
 * Trigger native Windows Toast Notification with sound via PowerShell
 */
function sendWindowsNotification(title, message) {
    const psScript = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      $template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>${title}</text>
            <text>${message}</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
      $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe')
      $notifier.Show($toast)
      [System.Media.SystemSounds]::Asterisk.Play()
    `;

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -EncodedCommand ${encoded}`, (err) => {
        if (err) {
            console.error('⚠️ Could not send Windows notification:', err.message);
        }
    });
}


const SESSION_DIR = path.join(__dirname, 'bpcl_session');

/**
 * MODULE 1: Login with Anti-Captcha
 */
async function performLogin(page, userId, password) {
    console.log('🌐 Navigating to eConnect portal...');
    await page.goto('https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000); 

    const isLoginFormVisible = await page.locator('#principal').isVisible();

    if (!isLoginFormVisible) {
        console.log('✅ Session valid, skipping login');
        return; 
    }

    console.log('🔒 Session not active, logging in...');
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`\n🔄 Login Attempt ${attempt}/3...`);
        
        try {
            await page.fill('#principal', '');
            await page.fill('#principal', userId);
            await page.fill('#input_password', '');
            await page.fill('#input_password', password);

            console.log('🤖 Solving CAPTCHA using Anti-Captcha...');
            
            const captchaElement = await page.locator('img#captcha');
            await captchaElement.waitFor({ state: 'visible', timeout: 10000 });
            
            const imageBuffer = await captchaElement.screenshot();
            const base64Image = imageBuffer.toString('base64');

            const captchaText = await solveAntiCaptcha(base64Image, process.env.ANTI_CAPTCHA_KEY || ac?.settings?.clientKey);
            console.log(`✅ CAPTCHA solved: ${captchaText}`);

            await page.fill('input#captcha', captchaText);
            await page.click('.login-btn');

            console.log('⏳ Waiting to verify login success...');
            await page.waitForTimeout(5000); 
            
            const stillOnLogin = await page.locator('#principal').isVisible();
            
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
                   await page.waitForTimeout(3000);
               }
            }
        } catch (error) {
            console.error(`❌ Attempt ${attempt} encountered an error: ${error.message}`);
            if (attempt === 3) throw new Error('Login completely failed after 3 attempts.');
        }
    }
}

/**
 * MODULE 2: Scrape consumer numbers from E-Day End page
 */
async function scrapeConsumerNumbers(page) {
    console.log('📊 Navigating to E-Day End page to scrape numbers...');

    // 1. Hover over the menu first
    console.log('🖱️ Hovering over "My Applications" menu...');
    await page.locator('a').filter({ hasText: 'My Application' }).first().hover();
    await page.waitForTimeout(2000); 

    // 2. Click LPG One and wait for the new page context
    console.log('🖱️ Clicking on "LPG One"...');
    const [page1] = await Promise.all([
        page.context().waitForEvent('page'), 
        page.locator('a').filter({ hasText: 'LPG One' }).first().click()
    ]);
    
    await page1.waitForLoadState('domcontentloaded');
    await page1.waitForTimeout(2000);

    // 3. Navigate inside LPG One
    console.log('🖱️ Clicking on "E-Day End"...');
    await page1.getByRole('link', { name: 'E-Day End This option is for' }).click();
    await page1.getByRole('button', { name: 'Proceed' }).click();

    // 4. Open the final consumer table tab using strict 5350 and Delivery Confirmation Not Done references
    console.log('🖱️ Opening consumer list for Product 5350 (Delivery Confirmation Not Done)...');
    
    const targetLink = page1
        .locator('#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr', { hasText: '5350' })
        .locator('a[id*="hlDelvConfNotDone"]')
        .first();

    const [page2] = await Promise.all([
        page1.context().waitForEvent('page'),
        targetLink.click()
    ]);

    await page2.waitForLoadState('domcontentloaded');
    await page2.waitForTimeout(2000);
    console.log('✅ E-Day End tab opened!');

    // 5. Scrape the data
    const consumerNumbers = await page2.$$eval('#gvProductConsumer tr', rows => {
        const numbers = [];
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length >= 3) {
                const num = cells[2].textContent.trim();
                if (num) numbers.push(num);
            }
        }
        return numbers;
    });

    console.log(`📋 Scraped ${consumerNumbers.length} consumer numbers.`);
    await page2.close(); 
    await page1.close(); 
    return consumerNumbers;
}

/**
 * MODULE 3: Run the cancellation logic
 */
async function runCancellation(page, numbers) {
    console.log(`\n🚀 Starting Cancellation Process for ${numbers.length} numbers...`);

    console.log('🖱️ Hovering over "My Applications"...');
    await page.locator('a').filter({ hasText: 'My Application' }).first().hover();
    await page.waitForTimeout(1000);

    console.log('🖱️ Clicking on "LPG One"...');
    const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        page.locator('a').filter({ hasText: 'LPG One' }).first().click()
    ]);

    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(1000);

    console.log('🖱️ Clicking on "Cash Memo Cancel"...');
    await newPage.locator('a').filter({ hasText: 'Cash Memo Cancel' }).first().click();
    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(2000);

    let pendingNumbers = [...numbers];
    let maxPasses = 2; // Pass 1 for all, Pass 2 for failed numbers

    const stats = {
        total: numbers.length,
        success: 0,
        failed: 0,
        skipped: 0
    };

    for (let pass = 1; pass <= maxPasses; pass++) {
        if (pendingNumbers.length === 0) break;
        
        if (pass === 2) {
            console.log(`\n⚠️ PASS 2: Automatically retrying ${pendingNumbers.length} failed numbers...`);
        }

        let failedInThisPass = [];

        for (let i = 0; i < pendingNumbers.length; i++) {
            const consumerNo = pendingNumbers[i];
            console.log(`\n🔄 [Pass ${pass}] Processing: ${consumerNo}`);

            // Dynamically update terminal & process title
            process.stdout.write(`\x1b]0;[${i + 1}/${pendingNumbers.length}] Success: ${stats.success} | BPCL Automation\x07`);

            // Dynamically update active browser tab/window title
            try {
                await newPage.evaluate(({ current, total, success }) => {
                    document.title = `[${current}/${total}] Success: ${success} - BPCL Auto-Cancel`;
                }, { current: i + 1, total: pendingNumbers.length, success: stats.success });
            } catch (e) {}

            try {
                await newPage.fill('#ctl00_ContentPlaceHolder1_txtConsumerNumber', consumerNo);
                
                await Promise.all([
                    newPage.waitForLoadState('networkidle'),
                    newPage.click('#ctl00_ContentPlaceHolder1_btnProceed')
                ]);

                const cancelLink = newPage.locator('#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel');
                
                if (await cancelLink.isVisible()) {
                    await Promise.all([
                        newPage.waitForLoadState('networkidle'),
                        cancelLink.click()
                    ]);

                    const msg = await newPage.textContent('#ctl00_ContentPlaceHolder1_lblMessage');
                    if (msg && msg.includes('Successfully')) {
                        console.log(`✅ Success! Cash memo for ${consumerNo} cancelled.`);
                        stats.success++;
                    } else {
                        console.log(`⚠️ ${consumerNo} cancellation message unclear. Will retry.`);
                        failedInThisPass.push(consumerNo);
                    }
                } else {
                    console.log(`⏭️ No cancel link found for ${consumerNo} (might already be cancelled).`);
                    stats.skipped++;
                }

                // Clear form for next number
                await Promise.all([
                    newPage.waitForLoadState('networkidle'),
                    newPage.click('#ctl00_ContentPlaceHolder1_btnClear')
                ]);

            } catch (err) {
                console.log(`❌ Error with ${consumerNo}: ${err.message}. Will retry.`);
                failedInThisPass.push(consumerNo);
                try {
                    await newPage.click('#ctl00_ContentPlaceHolder1_btnClear');
                    await newPage.waitForLoadState('networkidle');
                } catch(e) {}
            }
        }
        
        pendingNumbers = failedInThisPass; 
        
        if (pass === maxPasses && pendingNumbers.length > 0) {
            console.log(`\n🚨 Final Report: ${pendingNumbers.length} numbers could not be cancelled after retries.`);
            console.log('Failed Numbers:', pendingNumbers);
        }
    }
    
    stats.failed = pendingNumbers.length;

    // Reset process and window title back to "BPCL Automation Completed"
    process.stdout.write('\x1b]0;BPCL Automation Completed\x07');
    try {
        await newPage.evaluate(() => {
            document.title = 'BPCL Automation Completed';
        });
    } catch (e) {}

    console.log(`\n📊 Final Summary: Total: ${stats.total} | Success: ${stats.success} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
    console.log('🎉 Cancellation module completed!');

    // Final Windows Toast Notification with sound
    sendWindowsNotification(
        "BPCL Cash Memo Automation Completed",
        `Total: ${stats.total} | Success: ${stats.success} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`
    );

    return stats;
}

/**
 * MASTER ORCHESTRATOR
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
        console.error('❌ Missing ANTI_CAPTCHA_KEY in .env file! Please add ANTI_CAPTCHA_KEY=your_key_here');
        process.exit(1);
    }

    // Initialize Anti-Captcha
    ac.setAPIKey(ANTI_CAPTCHA_KEY);

    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ]
    });
    let contextOptions = { viewport: null };
    
    // Load session if it exists
    if (fs.existsSync('state.json')) {
        contextOptions.storageState = 'state.json';
        console.log('📂 Found existing session in state.json');
    }
    
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    try {
        // Step 1: Login
        await performLogin(page, USER_ID, PASSWORD);

        // Step 2: Scrape Numbers
        // Note: You must update the scraping selectors in scrapeConsumerNumbers() for this to work
        const consumerNumbers = await scrapeConsumerNumbers(page);

        if (consumerNumbers.length === 0) {
            console.log('No consumer numbers found to cancel. Exiting.');
            process.exit(0);
        }

        // Step 3: Run Cancellations
        console.log('Extracted Numbers:', consumerNumbers);
        await runCancellation(page, consumerNumbers);

    } catch (error) {
        console.error('\n❌ Master Automation Error:', error.message);
    } finally {
        console.log('\n✅ Script Finished. (Browser will remain open for inspection)');
        // await context.close(); // Uncomment this line if you want the browser to auto-close
    }
})();
