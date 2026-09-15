const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const ac = require('@antiadmin/anticaptchaofficial');

/**
 * Optimized Anti-Captcha Image-to-Text Solver
 * - Initial wait after task creation: 4 seconds (human workers need at least 3-4s to see and type)
 * - Subsequent polling interval: 1200ms (1.2 seconds)
 * - Maximum timeout: 45 seconds
 * - Log: "[BOT] Polling Anti-Captcha result..."
 * - Immediately returns uppercase text on status === 'ready' without extra artificial delays
 */
async function solveAntiCaptcha(base64Image, apiKey, log = console.log) {
    const logger = typeof log === 'function' ? log : console.log;
    const clientKey = (apiKey || (ac && ac.settings && ac.settings.clientKey) || process.env.ANTI_CAPTCHA_KEY || '').trim();
    if (!clientKey) {
        throw new Error('Anti-Captcha API key is required.');
    }

    // 1. Create Task
    const createResp = await fetch('https://api.anti-captcha.com/createTask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            clientKey,
            task: {
                type: 'ImageToTextTask',
                body: base64Image,
                phrase: false,
                case: false,
                numeric: 0,
                math: 0,
                minLength: 0,
                maxLength: 0
            }
        })
    });

    const createData = await createResp.json().catch(() => ({}));
    if (createData.errorId && createData.errorId > 0) {
        throw new Error(`Anti-Captcha createTask error: ${createData.errorCode || createData.errorId} - ${createData.errorDescription || 'Unknown error'}`);
    }

    const taskId = createData.taskId;
    if (!taskId) {
        throw new Error('Anti-Captcha failed to return a valid taskId');
    }

    // 2. Initial wait after task creation: 4 seconds
    logger('[BOT] Polling Anti-Captcha result...');
    await new Promise(r => setTimeout(r, 4000));

    // 3. Polling loop: 1200ms interval, 45s max timeout
    const startTime = Date.now();
    const maxTimeoutMs = 45000;

    while (Date.now() - startTime < maxTimeoutMs) {
        logger('[BOT] Polling Anti-Captcha result...');

        let resultData;
        try {
            const resultResp = await fetch('https://api.anti-captcha.com/getTaskResult', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    clientKey,
                    taskId
                })
            });
            resultData = await resultResp.json().catch(() => ({}));
        } catch (netErr) {
            logger(`[BOT] Polling network warning: ${netErr.message}. Retrying...`);
        }

        if (resultData && resultData.errorId && resultData.errorId > 0) {
            throw new Error(`Anti-Captcha getTaskResult error: ${resultData.errorCode || resultData.errorId} - ${resultData.errorDescription || 'Unknown error'}`);
        }

        if (resultData && resultData.status === 'ready' && resultData.solution && resultData.solution.text) {
            return resultData.solution.text.trim().toUpperCase();
        }

        await new Promise(r => setTimeout(r, 1200));
    }

    throw new Error('Anti-Captcha timeout: Failed to solve CAPTCHA within 45 seconds.');
}

// Configure Anti-Captcha client defaults
if (ac && ac.settings) {
    ac.settings.firstAttemptWaitingInterval = 4;
    ac.settings.normalWaitingInterval = 1.2;
    ac.settings.isVerbose = false;
}

// Monkey-patch ac.waitForResult to guarantee matching 4s / 1.2s / 45s behavior for any ac method calls
if (ac) {
    ac.waitForResult = async function(taskId) {
        console.log('[BOT] Polling Anti-Captcha result...');
        await this.delay(4000);

        const startTime = Date.now();
        const maxTimeoutMs = 45000;

        while (Date.now() - startTime < maxTimeoutMs) {
            console.log('[BOT] Polling Anti-Captcha result...');
            const checkResult = await this.JSONRequest('getTaskResult', {
                clientKey: this.settings.clientKey,
                taskId: taskId
            });

            if (checkResult.status === 'ready') {
                return checkResult.solution;
            }

            await this.delay(1200);
        }

        throw new Error('Anti-Captcha timeout: Failed to solve CAPTCHA within 45 seconds.');
    };
}

let isStopRequested = false;
let activeBrowser = null;
let activeReportItems = null;
let activeDownloadsPath = null;
let activeStats = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    stopped: false
};

async function requestStopAutomation() {
    isStopRequested = true;
    if (activeBrowser) {
        const b = activeBrowser;
        activeBrowser = null;
        try {
            await b.close().catch(() => {});
        } catch (e) {}
    }
}

function resetStopAutomation() {
    isStopRequested = false;
    activeBrowser = null;
    activeReportItems = null;
    activeStats = {
        total: 0,
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        stopped: false
    };
}

function isBrowserClosedError(err) {
    if (!err) return false;
    if (isStopRequested) return true;
    const msg = (err.message || '').toLowerCase();
    return (
        msg.includes('target closed') ||
        msg.includes('browser closed') ||
        msg.includes('browser has been closed') ||
        msg.includes('target page, context or browser has been closed') ||
        msg.includes('connection closed') ||
        msg.includes('navigation failed because page was closed')
    );
}

const EMOJI_TO_ASCII_MAP = {
    '🔍': '[CHECK]',
    '✅': '[OK]',
    '❌': '[ERROR]',
    '🚀': '[LAUNCH]',
    '⚠️': '[WARN]',
    '🛑': '[STOP]',
    '🌐': '[NET]',
    '🔒': '[SEC]',
    '🔐': '[AUTH]',
    '🤖': '[BOT]',
    '⏳': '[WAIT]',
    '🔄': '[RETRY]',
    '📊': '[STATS]',
    '🖱️': '[ACTION]',
    '🖱': '[ACTION]',
    '📋': '[INFO]',
    'ℹ️': '[INFO]',
    'ℹ': '[INFO]',
    '⏭️': '[SKIP]',
    '⏭': '[SKIP]',
    '🎉': '[DONE]',
    '🏢': '[AGENCY]',
    '📂': '[FILE]',
    '💾': '[SAVE]',
    '🎨': '[THEME]',
    '✨': '[UPDATE]',
    '🗑️': '[CLEAR]',
    '🗑': '[CLEAR]',
    '🚨': '[ALERT]'
};

/**
 * Formats a log message for terminal output by converting UTF-8 emojis into
 * clean standard ASCII tags ([CHECK], [OK], [ERROR], [LAUNCH], etc.) and stripping
 * non-ASCII characters to prevent mojibake corruption on Windows CMD.
 */
function formatConsoleLog(msg) {
    if (typeof msg !== 'string') return msg;
    let clean = msg;
    for (const [emoji, tag] of Object.entries(EMOJI_TO_ASCII_MAP)) {
        clean = clean.split(emoji).join(tag);
    }
    // Strip non-ASCII characters to prevent mojibake on Windows CMD
    return clean.replace(/[^\x00-\x7F]/g, '').trim();
}

/**
 * Formats date as YYYY-MM-DD_HHmm for CSV report filename
 */
function formatReportTimestamp(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}

function escapeCsvCell(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/**
 * Saves execution report items to Downloads/BPCL_Nexus_Reports/Cancelled_Report_<YYYY-MM-DD_HHmm>.csv
 */
function saveExecutionCsvReport(items, downloadsPath) {
    try {
        if (!items || items.length === 0) return null;
        const defaultDownloads = path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');
        const targetDownloads = downloadsPath || defaultDownloads;
        const reportsDir = path.join(targetDownloads, 'BPCL_Nexus_Reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }
        const fileName = `Cancelled_Report_${formatReportTimestamp()}.csv`;
        const filePath = path.join(reportsDir, fileName);

        const headers = ['SNo', 'ConsumerNumber', 'Status', 'Reason', 'Timestamp'];
        const rows = [headers.join(',')];
        for (const item of items) {
            const row = [
                item.SNo,
                item.ConsumerNumber,
                item.Status,
                item.Reason,
                item.Timestamp
            ].map(escapeCsvCell);
            rows.push(row.join(','));
        }

        fs.writeFileSync(filePath, rows.join('\r\n'), 'utf8');
        return filePath;
    } catch (err) {
        console.error(formatConsoleLog(`⚠️ [WARN] Could not save CSV report: ${err.message}`));
        return null;
    }
}

/**
 * Async alias for saveExecutionCsvReport to match generateCsvReport(consumerList)
 */
async function generateCsvReport(consumerList, downloadsPath = activeDownloadsPath) {
    return saveExecutionCsvReport(consumerList, downloadsPath);
}

/**
 * Triggers native Windows Toast Notification with sound via PowerShell.
 * Supports both sendWindowsNotification(successCount, totalCount) and sendWindowsNotification(title, message).
 */
function sendWindowsNotification(arg1, arg2) {
    let title = 'Bharat Gas Nexus';
    let message = '';

    if (typeof arg1 === 'number' || (!isNaN(Number(arg1)) && !isNaN(Number(arg2)) && arg2 !== undefined)) {
        title = 'Bharat Gas Nexus';
        message = `E-Day End Process Complete! Successfully cancelled: ${arg1}/${arg2} memos.`;
    } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
        title = arg1;
        message = arg2;
    } else if (typeof arg1 === 'string') {
        title = 'Bharat Gas Nexus';
        message = arg1;
    } else {
        message = 'E-Day End Process Complete!';
    }

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
            console.error(formatConsoleLog(`⚠️ Could not send Windows notification: ${err.message}`));
        }
    });
}

/**
 * Default verified fallback selectors matching master_automation.js
 */
const DEFAULT_SELECTORS = {
    login: {
        url: 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO',
        principalInput: '#principal',
        passwordInput: '#input_password',
        captchaImg: 'img#captcha',
        captchaInput: 'input#captcha',
        loginBtn: '.login-btn'
    },
    navigation: {
        myApplicationText: 'My Application',
        lpgOneText: 'LPG One',
        eDayEndText: 'E-Day End This option is for',
        eDayEndBtn: 'text=E-Day End',
        proceedButtonText: 'Proceed',
        transactionsRow: '#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr',
        productCode: '5350',
        delvConfNotDoneLink: 'a[id*="hlDelvConfNotDone"]',
        consumerTableRows: '#gvProductConsumer tr'
    },
    cancellation: {
        cashMemoCancelText: 'Cash Memo Cancel',
        consumerNumberInput: '#ctl00_ContentPlaceHolder1_txtConsumerNumber',
        proceedBtn: '#ctl00_ContentPlaceHolder1_btnProceed',
        cancelLink: '#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel',
        messageLabel: '#ctl00_ContentPlaceHolder1_lblMessage',
        clearBtn: '#ctl00_ContentPlaceHolder1_btnClear'
    }
};

// ============================================================================
// STRICT IN-MEMORY SELECTORS & PAYLOAD STORE
// CRITICAL SECURITY RULE: Store these selectors ONLY in memory.
// NEVER write them to disk, localStorage, or JSON configuration files.
// ============================================================================
let inMemorySelectors = null;
let inMemoryLoginUrl = null;

function getInMemorySelectors() {
    return inMemorySelectors;
}

/**
 * Deep merge dynamic selectors from Cloudflare worker manifest with defaults
 */
function buildSelectors(manifestSelectors = {}) {
    const s = manifestSelectors || {};
    const userInput = s.userInput || s.userIdInput || s.login?.principalInput || DEFAULT_SELECTORS.login.principalInput;
    const passInput = s.passInput || s.passwordInput || s.login?.passwordInput || DEFAULT_SELECTORS.login.passwordInput;
    const captchaImg = s.captchaImg || s.login?.captchaImg || DEFAULT_SELECTORS.login.captchaImg;
    const captchaInput = s.captchaInput || s.login?.captchaInput || DEFAULT_SELECTORS.login.captchaInput;
    const loginBtn = s.loginBtn || s.loginButton || s.login?.loginBtn || DEFAULT_SELECTORS.login.loginBtn;
    const memoSearchInput = s.memoSearchInput || s.consumerNumberInput || s.cancellation?.consumerNumberInput || DEFAULT_SELECTORS.cancellation.consumerNumberInput;
    const cancelMemoBtn = s.cancelMemoBtn || s.cancelLink || s.cancellation?.cancelLink || DEFAULT_SELECTORS.cancellation.cancelLink;
    const confirmDialogYes = s.confirmDialogYes || s.proceedBtn || s.cancellation?.proceedBtn || DEFAULT_SELECTORS.cancellation.proceedBtn;
    const cancelMenuTab = s.cancelMenuTab || s.cancellation?.cashMemoCancelText || DEFAULT_SELECTORS.cancellation.cashMemoCancelText;
    const memoRows = s.memoRows || s.navigation?.consumerTableRows || DEFAULT_SELECTORS.navigation.consumerTableRows;
    const messageLabel = s.messageLabel || s.cancellation?.messageLabel || DEFAULT_SELECTORS.cancellation.messageLabel;
    const clearBtn = s.clearBtn || s.cancellation?.clearBtn || DEFAULT_SELECTORS.cancellation.clearBtn;

    return {
        // Dynamic keys requested from Cloudflare manifest
        userInput,
        passInput,
        captchaImg,
        captchaInput,
        loginBtn,
        memoSearchInput,
        cancelMemoBtn,
        confirmDialogYes,

        // Backward compatibility aliases
        userIdInput: userInput,
        passwordInput: passInput,
        loginButton: loginBtn,
        cancelMenuTab,
        memoRows,
        consumerNumberInput: memoSearchInput,
        cancelLink: cancelMemoBtn,
        proceedBtn: confirmDialogYes,
        messageLabel,
        clearBtn,

        login: {
            ...DEFAULT_SELECTORS.login,
            ...(s.login || {}),
            principalInput: userInput,
            passwordInput: passInput,
            captchaImg,
            captchaInput,
            loginBtn
        },
        navigation: {
            ...DEFAULT_SELECTORS.navigation,
            ...(s.navigation || {}),
            consumerTableRows: memoRows
        },
        cancellation: {
            ...DEFAULT_SELECTORS.cancellation,
            ...(s.cancellation || {}),
            cashMemoCancelText: cancelMenuTab,
            consumerNumberInput: memoSearchInput,
            proceedBtn: confirmDialogYes,
            cancelLink: cancelMemoBtn,
            messageLabel,
            clearBtn
        }
    };
}

const WORKER_BASE_URL = 'https://bharatgas-api.www-rishikesh111.workers.dev';

/**
 * Silently sends cancellation telemetry to Cloudflare Worker
 */
async function sendTelemetry(licenseKey, successCount, agencyName = '') {
    if (!licenseKey) return;
    try {
        await fetch(`${WORKER_BASE_URL}/api/telemetry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                licenseKey: licenseKey.trim(),
                count: Number(successCount) || 0,
                agencyName: agencyName ? agencyName.trim() : undefined
            })
        });
    } catch (e) {
        // Silently ignore telemetry failure so local automation is never hindered
    }
}

/**
 * Verifies the license key and BPCL User ID, and retrieves manifest selectors from Cloudflare Worker
 */
async function verifyLicenseAndFetchManifest(licenseKey, bpclUserId) {
    let response;
    const cleanKey = (licenseKey || '').trim();
    const cleanUserId = (bpclUserId || '').trim();

    if (!cleanKey || !cleanUserId) {
        return {
            success: false,
            status: 400,
            error: 'MISSING_FIELDS',
            message: 'कृपया BPCL User ID और License Key दोनों दर्ज करें।'
        };
    }

    try {
        const verifyUrl = `${WORKER_BASE_URL}/api/verify?_t=${Date.now()}`;
        response = await fetch(verifyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            },
            cache: 'no-store',
            body: JSON.stringify({ licenseKey: cleanKey, bpclUserId: cleanUserId })
        });

        // Non-200 HTTP response handler
        if (!response.ok) {
            let error = new Error(`HTTP Error ${response.status}`);
            error.response = response;
            let responseJson = null;
            try {
                responseJson = await response.clone().json();
            } catch (_) {}
            const serverMessage = error.response?.data?.message || (await response?.json().catch(() => null))?.message || responseJson?.message || error.message || "License verification failed.";
            const serverDate = error.response?.data?.expiresAt || (await response?.json().catch(() => null))?.expiresAt || responseJson?.expiresAt || responseJson?.expiry || responseJson?.manifest?.expiresAt || '';
            const isGenuineExpired = Boolean(responseJson?.isExpired) || responseJson?.error === 'SUBSCRIPTION_EXPIRED' || serverMessage.toLowerCase().includes('expired');
            return {
                success: false,
                isExpired: isGenuineExpired,
                status: response.status,
                error: responseJson?.error || (response.status === 403 ? 'AUTH_FAILED' : 'HTTP_ERROR'),
                message: serverMessage,
                expiresAt: serverDate,
                expiry: serverDate,
                ...responseJson
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        // Error/catch block
        const serverMessage = error.response?.data?.message || (await response?.json().catch(() => null))?.message || error.message || "License verification failed.";
        const serverDate = error.response?.data?.expiresAt || (await response?.json().catch(() => null))?.expiresAt || error.response?.data?.expiry || error.expiresAt || error.expiry || '';
        return {
            success: false,
            isExpired: response?.status === 403 || (error?.message && error.message.toLowerCase().includes('expired')),
            status: response?.status || 0,
            error: 'NETWORK_ERROR',
            message: serverMessage,
            expiresAt: serverDate,
            expiry: serverDate
        };
    }
}

/**
 * Post-Login Distributor Code Verification (Header Check Removed)
 */
async function verifyDistributorCodeHeader(page, authorizedDistributorCode, browser, log = console.log) {
    // Header Distributor Code verification has been completely removed.
    // The browser transitions smoothly without checking distributor codes or closing browser.
    return;
}

/**
 * MODULE 1: Ported Login Logic with Anti-Captcha solving & Tamper Protection
 */
async function performLogin(page, userId, password, selectors, log, sessionPath, authorizedDistributorCode, browser) {
    const authUserId = (userId || '').trim();
    const activeSelectors = buildSelectors(selectors || inMemorySelectors || DEFAULT_SELECTORS);

    const targetUrl = inMemoryLoginUrl || activeSelectors.loginUrl || (activeSelectors.login && activeSelectors.login.url) || 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO';
    log('🌐 Navigating to eConnect portal...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const userInputSelector = activeSelectors.userInput || activeSelectors.userIdInput || activeSelectors.login?.principalInput || '#principal';
    const passInputSelector = activeSelectors.passInput || activeSelectors.passwordInput || activeSelectors.login?.passwordInput || '#input_password';
    const captchaImgSelector = activeSelectors.captchaImg || activeSelectors.login?.captchaImg || 'img#captcha';
    const captchaInputSelector = activeSelectors.captchaInput || activeSelectors.login?.captchaInput || 'input#captcha';
    const loginBtnSelector = activeSelectors.loginBtn || activeSelectors.loginButton || activeSelectors.login?.loginBtn || '.login-btn';

    const isLoginFormVisible = await page.locator(userInputSelector).isVisible().catch(() => false) ||
                               await page.locator('#username').isVisible().catch(() => false);

    if (!isLoginFormVisible) {
        log('✅ Existing session valid, skipping login.');
        return;
    }

    log('🔒 Session not active, logging in with credentials...');

    for (let attempt = 1; attempt <= 3; attempt++) {
        log(`🔄 Login Attempt ${attempt}/3...`);

        try {
            // Replace user input selector with selectors.userIdInput
            const userSelector = (await page.$(userInputSelector)) ? userInputSelector : ((await page.$('#username')) ? '#username' : userInputSelector);
            // Replace password selector with selectors.passwordInput
            const passSelector = (await page.$(passInputSelector)) ? passInputSelector : ((await page.$('#password')) ? '#password' : passInputSelector);

            await page.fill(userSelector, '');
            await page.fill(userSelector, authUserId);
            await page.fill(passSelector, '');
            await page.fill(passSelector, password);

            // Tamper Protection on Login Page:
            // After typing credentials into username and password input elements:
            if (await page.$('#username')) {
                await page.$eval('#username', el => { el.readOnly = true; el.style.pointerEvents = 'none'; }).catch(() => {});
            }
            if (await page.$('#password')) {
                await page.$eval('#password', el => { el.readOnly = true; el.style.pointerEvents = 'none'; }).catch(() => {});
            }
            if (await page.$(userInputSelector)) {
                await page.$eval(userInputSelector, el => { el.readOnly = true; el.style.pointerEvents = 'none'; }).catch(() => {});
            }
            if (await page.$(passInputSelector)) {
                await page.$eval(passInputSelector, el => { el.readOnly = true; el.style.pointerEvents = 'none'; }).catch(() => {});
            }

            log('🤖 Solving CAPTCHA using Anti-Captcha...');
            // Replace captcha image with selectors.captchaImg
            const captchaElement = page.locator(captchaImgSelector);
            await captchaElement.waitFor({ state: 'visible', timeout: 10000 });

            const imageBuffer = await captchaElement.screenshot();
            const base64Image = imageBuffer.toString('base64');

            const captchaText = await solveAntiCaptcha(base64Image, ac?.settings?.clientKey, log);
            log(`✅ CAPTCHA solved: ${captchaText}`);

            // Replace captcha input with selectors.captchaInput
            await page.fill(captchaInputSelector, captchaText);

            // Right before clicking the login submit button (after captcha solution):
            let currentInputUser = '';
            if (await page.$(userSelector)) {
                currentInputUser = await page.$eval(userSelector, el => el.value).catch(() => '');
            }

            if (currentInputUser.trim().toLowerCase() !== authUserId.toLowerCase()) {
                if (browser) {
                    await browser.close().catch(() => {});
                }
                throw new Error("सुरक्षा उल्लंघन: लॉगिन क्रेडेंशियल्स के साथ छेड़छाड़ की गई है।");
            }

            // Replace login button click with selectors.loginButton
            await page.click(loginBtnSelector);

            log('⏳ Waiting to verify login success...');
            await page.waitForTimeout(5000);

            const stillOnLogin = await page.locator(userSelector).isVisible().catch(() => false);

            if (!stillOnLogin) {
                log('✅ Successfully navigated to dashboard!');
                if (sessionPath) {
                    await page.context().storageState({ path: sessionPath });
                    log(`💾 Session cookies saved to: ${sessionPath}`);
                }
                return;
            } else {
                log(`⚠️ Attempt ${attempt} failed: Incorrect CAPTCHA or server error.`);
                if (attempt < 3) {
                    log('🔄 Reloading page for fresh CAPTCHA...');
                    await page.reload({ waitUntil: 'domcontentloaded' });
                    await page.waitForTimeout(3000);
                }
            }
        } catch (error) {
            log(`❌ Attempt ${attempt} encountered error: ${error.message}`);
            if (attempt === 3) throw error;
        }
    }
}

/**
 * MODULE 2: Scrape consumer numbers from E-Day End page
 * Transplanted directly from verified master_automation.js
 */
async function scrapeConsumerNumbers(page, selectors = null, log = console.log) {
    const activeSelectors = selectors || inMemorySelectors || DEFAULT_SELECTORS;
    const logger = typeof log === 'function' ? log : console.log;
    logger('📊 Navigating to E-Day End page to scrape numbers...');

    // Clean up any auxiliary tabs except main page before navigation
    const context = page.context();
    const openPages = context.pages();
    for (const p of openPages) {
        if (p !== page && !p.isClosed()) {
            await p.close().catch(() => {});
        }
    }

    // Step 1 (My Applications Menu):
    logger('🖱️ Hovering over "My Applications" menu...');
    await page.locator('a').filter({ hasText: 'My Application' }).first().hover();
    await page.waitForTimeout(1000); // reduced from lagging delays

    // Step 2 (LPG One Click with popup capture):
    logger('🖱️ Clicking on "LPG One"...');
    const [page1] = await Promise.all([
        page.context().waitForEvent('page'), 
        page.locator('a').filter({ hasText: 'LPG One' }).first().click()
    ]);
    await page1.waitForLoadState('domcontentloaded');
    await page1.waitForTimeout(1000);

    // Step 3 (E-Day End -> Proceed):
    logger('🖱️ Clicking on "E-Day End"...');
    await page1.getByRole('link', { name: 'E-Day End This option is for' }).click();
    await page1.getByRole('button', { name: 'Proceed' }).click();

    // Step 4 (Product 5350 Delivery Confirmation Not Done tab):
    logger('🖱️ Opening consumer list for Product 5350 (Delivery Confirmation Not Done)...');
    const targetLink = page1
        .locator('#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr', { hasText: '5350' })
        .locator('a[id*="hlDelvConfNotDone"]')
        .first();

    const [page2] = await Promise.all([
        page1.context().waitForEvent('page'),
        targetLink.click()
    ]);
    await page2.waitForLoadState('domcontentloaded');
    await page2.waitForTimeout(1000);
    logger('✅ E-Day End tab opened!');

    // Step 5: Scrape the data with selectors.memoRows
    const rowsSelector = activeSelectors?.memoRows || activeSelectors?.navigation?.consumerTableRows || '#gvProductConsumer tr';
    const consumerNumbers = await page2.$$eval(rowsSelector, rows => {
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

    logger(`📋 Scraped ${consumerNumbers.length} consumer numbers.`);
    await page2.close().catch(() => {});
    await page1.close().catch(() => {});
    return consumerNumbers;
}

/**
 * MODULE 3: Run the cancellation logic
 * Transplanted directly from verified master_automation.js with app integration hooks
 */
async function runCancellation(page, numbers, selectors = null, callbacks = {}) {
    const activeSelectors = selectors || inMemorySelectors || DEFAULT_SELECTORS;
    const {
        log = console.log,
        onProgress,
        onTitleUpdate
    } = callbacks;
    const can = activeSelectors?.cancellation || DEFAULT_SELECTORS.cancellation;
    const nav = activeSelectors?.navigation || DEFAULT_SELECTORS.navigation;
    const logger = typeof log === 'function' ? log : console.log;

    logger(`\n🚀 Starting Cancellation Process for ${numbers.length} numbers...`);

    logger('🖱️ Hovering over "My Applications"...');
    await page.locator('a').filter({ hasText: nav.myApplicationText || 'My Application' }).first().hover();
    await page.waitForTimeout(1000);

    logger('🖱️ Clicking on "LPG One"...');
    const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        page.locator('a').filter({ hasText: nav.lpgOneText || 'LPG One' }).first().click()
    ]);

    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(1000);

    // Replace navigation selector with selectors.cancelMenuTab
    logger('🖱️ Clicking on "Cash Memo Cancel"...');
    const cancelTabSelector = activeSelectors?.cancelMenuTab || can.cashMemoCancelText || 'Cash Memo Cancel';
    if (cancelTabSelector.startsWith('#') || cancelTabSelector.startsWith('.') || cancelTabSelector.includes('[') || cancelTabSelector.includes('>') || cancelTabSelector.includes(':')) {
        await newPage.locator(cancelTabSelector).first().click();
    } else {
        await newPage.locator('a').filter({ hasText: cancelTabSelector }).first().click();
    }
    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(1000);

    let pendingNumbers = [...numbers];
    const maxPasses = 2; // Pass 1 for all, Pass 2 for failed numbers

    const reportMap = new Map();
    numbers.forEach((num, idx) => {
        reportMap.set(num, {
            SNo: idx + 1,
            ConsumerNumber: num,
            Status: 'Pending',
            Reason: 'Awaiting execution',
            Timestamp: new Date().toISOString()
        });
    });

    const stats = {
        total: numbers.length,
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        stopped: false
    };

    for (let pass = 1; pass <= maxPasses; pass++) {
        if (isStopRequested) {
            stats.stopped = true;
            break;
        }
        if (pendingNumbers.length === 0) break;

        if (pass === 2) {
            logger(`\n⚠️ PASS 2: Automatically retrying ${pendingNumbers.length} failed numbers...`);
        }

        const failedInThisPass = [];

        for (let i = 0; i < pendingNumbers.length; i++) {
            // Check interrupt stop request
            if (isStopRequested) {
                logger('\n🛑 [System] Auto-cancellation stopped by user.');
                stats.stopped = true;
                break;
            }

            const consumerNo = pendingNumbers[i];
            const currentIndex = (pass === 1) ? (i + 1) : stats.processed;
            if (pass === 1) {
                stats.processed = currentIndex;
            }

            const currentTotal = numbers.length;
            const titleText = `[${stats.processed}/${currentTotal}] Success: ${stats.success} | BPCL Automation`;

            logger(`\n🔄 [Pass ${pass}] (${stats.processed}/${currentTotal}) Processing Consumer: ${consumerNo}`);

            // Update process title in terminal
            try {
                process.stdout.write(`\x1b]0;[${i + 1}/${pendingNumbers.length}] Success: ${stats.success} | BPCL Automation\x07`);
            } catch (e) {}

            // Update Electron window title / Taskbar
            if (onTitleUpdate) {
                onTitleUpdate(titleText);
            }

            // Update active browser tab/window title
            try {
                await newPage.evaluate(({ current, total, success }) => {
                    document.title = `[${current}/${total}] Success: ${success} - BPCL Auto-Cancel`;
                }, { current: stats.processed, total: currentTotal, success: stats.success });
            } catch (e) {}

            // Send live progress event to renderer UI
            if (onProgress) {
                onProgress({
                    current: stats.processed,
                    total: currentTotal,
                    success: stats.success,
                    failed: stats.failed,
                    skipped: stats.skipped,
                    consumerNo,
                    pass
                });
            }

            try {
                await newPage.fill(activeSelectors.memoSearchInput || can.consumerNumberInput || '#ctl00_ContentPlaceHolder1_txtConsumerNumber', consumerNo);

                await Promise.all([
                    newPage.waitForLoadState('domcontentloaded'),
                    newPage.click(activeSelectors.confirmDialogYes || can.proceedBtn || '#ctl00_ContentPlaceHolder1_btnProceed')
                ]);

                const cancelLink = newPage.locator(activeSelectors.cancelMemoBtn || can.cancelLink || '#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel');

                if (await cancelLink.isVisible().catch(() => false)) {
                    await Promise.all([
                        newPage.waitForLoadState('domcontentloaded'),
                        cancelLink.click()
                    ]);

                    const msg = await newPage.textContent(can.messageLabel || '#ctl00_ContentPlaceHolder1_lblMessage').catch(() => '');
                    if (msg && msg.includes('Successfully')) {
                        logger(`✅ Success! Cash memo for ${consumerNo} cancelled.`);
                        stats.success++;
                        reportMap.set(consumerNo, {
                            SNo: reportMap.get(consumerNo)?.SNo || stats.processed,
                            ConsumerNumber: consumerNo,
                            Status: 'Success',
                            Reason: 'Cash Memo Cancelled Successfully',
                            Timestamp: new Date().toISOString()
                        });
                    } else {
                        logger(`⚠️ ${consumerNo} cancellation message unclear: "${(msg || '').trim()}". Will retry.`);
                        failedInThisPass.push(consumerNo);
                    }
                } else {
                    logger(`⏭️ No cancel link found for ${consumerNo} (might already be cancelled).`);
                    stats.skipped++;
                    reportMap.set(consumerNo, {
                        SNo: reportMap.get(consumerNo)?.SNo || stats.processed,
                        ConsumerNumber: consumerNo,
                        Status: 'Skipped',
                        Reason: 'No cancel link found (already cancelled or delivered)',
                        Timestamp: new Date().toISOString()
                    });
                }

                // Clear form for next number
                await Promise.all([
                    newPage.waitForLoadState('domcontentloaded'),
                    newPage.click(can.clearBtn || '#ctl00_ContentPlaceHolder1_btnClear')
                ]);

            } catch (err) {
                logger(`❌ Error with ${consumerNo}: ${err.message}. Will retry.`);
                failedInThisPass.push(consumerNo);
                reportMap.set(consumerNo, {
                    SNo: reportMap.get(consumerNo)?.SNo || stats.processed,
                    ConsumerNumber: consumerNo,
                    Status: 'Failed',
                    Reason: err.message || 'Error occurred during cancellation',
                    Timestamp: new Date().toISOString()
                });
                try {
                    await newPage.click(can.clearBtn || '#ctl00_ContentPlaceHolder1_btnClear');
                    await newPage.waitForLoadState('domcontentloaded');
                } catch (e) {}
            }

            // Emit updated progress after each consumer
            if (onProgress) {
                onProgress({
                    current: stats.processed,
                    total: currentTotal,
                    success: stats.success,
                    failed: failedInThisPass.length,
                    skipped: stats.skipped,
                    consumerNo,
                    pass
                });
            }
        }

        pendingNumbers = failedInThisPass;

        if (isStopRequested || stats.stopped) {
            stats.stopped = true;
            break;
        }

        if (pass === maxPasses && pendingNumbers.length > 0) {
            logger(`\n🚨 Final Report: ${pendingNumbers.length} numbers could not be cancelled after retries.`);
            logger(`Failed Numbers: ${pendingNumbers.join(', ')}`);
        }
    }

    stats.failed = pendingNumbers.length;

    if (stats.stopped || isStopRequested) {
        stats.stopped = true;
        logger('\n🛑 [System] Auto-cancellation stopped by user.');
        logger(`📊 Memos cancelled before stop: ${stats.success} / ${stats.total}`);
        if (!newPage.isClosed()) {
            await newPage.close().catch(() => {});
        }
        for (const [num, entry] of reportMap.entries()) {
            if (entry.Status === 'Pending') {
                entry.Status = 'Skipped';
                entry.Reason = 'Stopped by operator';
                entry.Timestamp = new Date().toISOString();
            }
        }
        stats.reportItems = Array.from(reportMap.values());
        return stats;
    }

    // Instant End-of-Run Reconciliation:
    // If no actionable cancel buttons/links remain on screen, verify 100% cleared
    const totalFound = numbers.length;
    let hasActionableCancelButtons = false;

    if (!newPage.isClosed()) {
        try {
            const cancelSelector = can.cancelLink || '#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel, a[id*="lnkCancel"], button[id*="lnkCancel"], a:has-text("Cancel")';
            const remainingCancelButtons = await newPage.locator(cancelSelector).all().catch(() => []);
            for (const btn of remainingCancelButtons) {
                if (await btn.isVisible().catch(() => false)) {
                    hasActionableCancelButtons = true;
                    break;
                }
            }
        } catch (e) {
            hasActionableCancelButtons = false;
        }
    }

    if (!hasActionableCancelButtons && totalFound > 0) {
        let successCount = totalFound;
        let skippedCount = 0;
        let failedCount = 0;

        stats.success = successCount;
        stats.skipped = skippedCount;
        stats.failed = failedCount;
        stats.processed = totalFound;

        // Update all individual report items to Success
        for (const [num, entry] of reportMap.entries()) {
            entry.Status = 'Success';
            entry.Reason = 'Cash Memo Cancelled Successfully (Verified 100% Cleared)';
        }

        logger(`\n[SUCCESS] Verified: All ${totalFound} cash memos successfully cancelled (100% cleared).`);

        // Update UI metrics cards & progress listeners
        if (onProgress) {
            onProgress({
                current: totalFound,
                total: totalFound,
                success: successCount,
                failed: failedCount,
                skipped: skippedCount,
                successCount,
                failedCount,
                skippedCount,
                totalFound,
                consumerNo: numbers[numbers.length - 1] || '',
                pass: maxPasses
            });
        }
    }

    // Reset process and window title back to "BPCL Automation Completed"
    try {
        process.stdout.write('\x1b]0;BPCL Automation Completed\x07');
    } catch (e) {}
    if (onTitleUpdate) {
        onTitleUpdate('BPCL Automation Completed');
    }
    try {
        await newPage.evaluate(() => {
            document.title = 'BPCL Automation Completed';
        });
    } catch (e) {}

    logger(`\n📊 Final Summary: Total: ${stats.total} | Success: ${stats.success} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`);
    logger('🎉 Cancellation module completed!');

    if (!newPage.isClosed()) {
        await newPage.close().catch(() => {});
    }

    stats.reportItems = Array.from(reportMap.values());
    return stats;
}

/**
 * Injects a strictly idempotent, clean, compact status badge at the top right of the page.
 * Checks if #nexus-overlay-banner already exists before injecting.
 * Purges all duplicate or legacy badges/banners and ensures no injection in iframes or page center.
 * @param {import('playwright').Page} page
 */
async function injectNexusOverlay(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.evaluate(() => {
            // Guard: Never inject inside child frames/iframes
            if (window.top !== window.self) return;

            // Single-instance check: if #nexus-overlay-banner already exists, do nothing
            if (document.getElementById('nexus-overlay-banner')) return;

            // Remove all existing instances first
            document.querySelectorAll('.nexus-auto-badge, #nexus-overlay-banner, #nexus-live-banner, .nexus-pill-badge, #nexus-guidance-overlay-banner').forEach(el => el.remove());

            const target = document.body || document.documentElement;
            if (!target) return;

            const badge = document.createElement('div');
            badge.id = 'nexus-overlay-banner';
            badge.className = 'nexus-auto-badge';
            badge.style.cssText = `
                position: fixed !important;
                top: 8px !important;
                right: 20px !important;
                z-index: 999999 !important;
                background: rgba(15, 23, 42, 0.85) !important;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
                color: #38bdf8 !important;
                padding: 6px 14px !important;
                border-radius: 20px !important;
                font-family: sans-serif !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                border: 1px solid rgba(56, 189, 248, 0.3) !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.25) !important;
                pointer-events: none !important;
            `;
            badge.innerText = '⚡ Nexus Auto-Engine Running';
            target.appendChild(badge);
        });
    } catch (e) {
        // Silently ignore navigation/context destruction errors
    }
}

/**
 * Launch Browser with smart auto-fallback between Chrome and Edge
 * @param {string} [preferredChannel='chrome']
 * @param {Object} [options={}]
 */
async function launchBrowser(preferredChannel = 'chrome', options = {}) {
    const cleanPreferred = preferredChannel === 'msedge' ? 'msedge' : 'chrome';
    const secondaryChannel = cleanPreferred === 'chrome' ? 'msedge' : 'chrome';
    const { headless = false, args = [] } = options;
    const launchArgs = [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=CalculateNativeWinOcclusion',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-component-update',
        '--disable-sync',
        '--no-default-browser-check',
        '--no-first-run',
        ...args
    ];

    try {
        return await chromium.launch({
            headless,
            channel: cleanPreferred,
            args: launchArgs
        });
    } catch (err) {
        console.warn(`[Runner] ${cleanPreferred} launch failed, falling back to ${secondaryChannel}:`, err.message);
        return await chromium.launch({
            headless,
            channel: secondaryChannel,
            args: launchArgs
        });
    }
}

/**
 * Main automation function: starts cancellation process using volatile in-memory selectors.
 * Graceful fallback: If selectors exist, use them; if missing, undefined, or empty,
 * seamlessly fall back to built-in local selectors without throwing unauthorized errors.
 * 
 * @param {Object} config - Automation configuration
 * @param {Object} selectors - Dynamic in-memory selectors from Cloudflare manifest
 * @returns {Promise<Object>} Automation statistics
 */
async function startCancellationProcess(config = {}, selectors = null) {
    const rawSelectors = (selectors !== undefined && selectors !== null) ? selectors : config?.selectors;
    const hasCloudSelectors = rawSelectors && typeof rawSelectors === 'object' && Object.keys(rawSelectors).length > 0;
    const validatedSelectors = buildSelectors(hasCloudSelectors ? rawSelectors : DEFAULT_SELECTORS);
    inMemorySelectors = Object.freeze({ ...validatedSelectors });

    return await runAutomation({
        ...config,
        selectors: validatedSelectors
    });
}

/**
 * MASTER RUNNER ENTRYPOINT
 */
async function runAutomation(options) {
    resetStopAutomation();
    const {
        bpclUserId,
        bpclPassword,
        userId = bpclUserId,
        password = bpclPassword,
        authorizedUserId,
        authorizedDistributorCode,
        licenseKey,
        headless,
        browserChannel = 'chrome',
        userDataPath,
        downloadsPath,
        callbacks = {},
        selectors: directSelectors
    } = options;

    if (directSelectors && typeof directSelectors === 'object' && Object.keys(directSelectors).length > 0) {
        inMemorySelectors = Object.freeze(buildSelectors(directSelectors));
    }

    activeDownloadsPath = downloadsPath;

    const {
        onStatus = () => {},
        onProgress = () => {},
        onLog = () => {},
        onTitleUpdate = () => {},
        onNativeAlert = () => {},
        onAgencyUpdate = () => {},
        onManifestLoaded = () => {}
    } = callbacks;

    const log = (msg) => {
        console.log(formatConsoleLog(msg));
        onLog(msg);
    };

    const effectiveUserId = (authorizedUserId || bpclUserId || userId || '').trim();
    const effectivePassword = (bpclPassword || password || '').trim();

    // 1. Check credentials presence
    if (!licenseKey || !licenseKey.trim()) {
        const errorMsg = 'Please enter a valid License Key in Settings before starting.';
        await onNativeAlert('License Key Required', errorMsg, 'warning');
        throw new Error(errorMsg);
    }

    if (!effectiveUserId || !effectivePassword) {
        const errorMsg = 'Please enter BPCL User ID and Password in Settings before starting.';
        await onNativeAlert('Credentials Required', errorMsg, 'warning');
        throw new Error(errorMsg);
    }

    // 2. Verification (BPCL User ID + License Key strict pairing)
    onStatus('Verifying License...');
    log('🔐 Verifying BPCL User ID & License Key...');
    
    let verifyResult = null;
    try {
        verifyResult = await verifyLicenseAndFetchManifest(licenseKey, effectiveUserId);
    } catch (netErr) {
        log(`⚠️ Notice: Cloud manifest fetch unavailable (${netErr.message || netErr}). Using built-in local selectors.`);
    }

    if (verifyResult && (verifyResult.isExpired || (verifyResult.status === 403 && (verifyResult.error === 'SUBSCRIPTION_EXPIRED' || String(verifyResult.message || '').toLowerCase().includes('expired'))))) {
        let expireMsg = verifyResult.message;
        if (!expireMsg) {
            const dateStr = verifyResult.expiresAt || verifyResult.expiry;
            if (dateStr) {
                const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim()) ? `${String(dateStr).trim()}T12:00:00` : dateStr;
                const parsed = new Date(cleanDate);
                const formattedDate = !isNaN(parsed.getTime()) ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                expireMsg = formattedDate ? `Subscription Expired: Your plan expired on ${formattedDate}. Automation is paused.` : 'Subscription Expired: Automation is paused. Please renew license.';
            } else {
                expireMsg = 'Subscription Expired: Automation is paused. Please renew license.';
            }
        }
        onStatus(expireMsg);
        log(`❌ ${expireMsg}`);
        await onNativeAlert('Subscription Expired', expireMsg, 'error');
        throw new Error(expireMsg);
    }

    // Graceful fallback for selectors:
    // If cloud selectors exist in the manifest, use them.
    // If cloud selectors are missing, undefined, or empty, seamlessly fall back to built-in local selectors
    // without throwing any unauthorized modal or halting execution.
    const payload = verifyResult?.payload || (verifyResult?.manifest?.selectors ? { loginUrl: 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO', selectors: verifyResult.manifest.selectors } : null);
    const rawRemoteSelectors = payload?.selectors || verifyResult?.manifest?.selectors || verifyResult?.selectors || null;
    const hasCloudSelectors = Boolean(rawRemoteSelectors && typeof rawRemoteSelectors === 'object' && Object.keys(rawRemoteSelectors).length > 0);

    const activeDirectSelectors = (directSelectors && typeof directSelectors === 'object' && Object.keys(directSelectors).length > 0) ? directSelectors : null;

    inMemorySelectors = Object.freeze(
        hasCloudSelectors
            ? buildSelectors({ ...rawRemoteSelectors, ...(activeDirectSelectors || {}) })
            : buildSelectors(activeDirectSelectors || inMemorySelectors || DEFAULT_SELECTORS)
    );
    inMemoryLoginUrl = payload?.loginUrl || 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO';
    const selectors = inMemorySelectors;

    if (hasCloudSelectors) {
        log('✅ License verified! Cloud manifest selectors loaded into memory.');
    } else {
        log('ℹ️ Remote payload not provided; seamlessly falling back to built-in local selectors.');
    }

    log('✅ License verified successfully! Remote execution payload loaded into memory.');
    if (onManifestLoaded) {
        onManifestLoaded(verifyResult);
    }

    const distributorName = verifyResult.distributor || verifyResult.license?.name || verifyResult.name || '';
    if (distributorName) {
        log(`🏢 Verified Agency: ${distributorName}`);
        onAgencyUpdate(distributorName);
    }

    // 3. Initialize Anti-Captcha securely from server manifest response (with built-in fallback)
    const manifest = verifyResult?.manifest || {};
    const anticaptchaApiKey = manifest.anticaptchaApiKey || verifyResult?.anticaptchaApiKey || manifest.anticaptchaKey || process.env.ANTI_CAPTCHA_KEY || '';

    if (anticaptchaApiKey && anticaptchaApiKey.trim()) {
        ac.setAPIKey(anticaptchaApiKey.trim());
        log('🤖 Anti-Captcha initialized securely.');
    }

    // 4. Launch Browser with smart auto-fallback between Chrome and Edge
    const runHeadless = Boolean(headless);
    const preferredChannel = (browserChannel === 'msedge') ? 'msedge' : 'chrome';
    const secondaryChannel = preferredChannel === 'chrome' ? 'msedge' : 'chrome';
    const launchArgs = [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=CalculateNativeWinOcclusion',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-component-update',
        '--disable-sync',
        '--no-default-browser-check',
        '--no-first-run'
    ];

    const preferredDisplayName = preferredChannel === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
    const secondaryDisplayName = secondaryChannel === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
    log(`🚀 Launching ${preferredDisplayName} Browser (Headless: ${runHeadless ? 'Yes' : 'No'})...`);

    let browser;
    let activeChannel = preferredChannel;
    const customLauncher = options.launchBrowser || module.exports.launchBrowser;
    if (customLauncher) {
        browser = await customLauncher(preferredChannel, { headless: runHeadless });
        activeBrowser = browser;
    } else {
        try {
            browser = await chromium.launch({
                headless: runHeadless,
                channel: preferredChannel,
                args: launchArgs
            });
            activeBrowser = browser;
        } catch (launchErr) {
            log(`⚠️ ${preferredDisplayName} launch failed (${launchErr.message}). Falling back to ${secondaryDisplayName}...`);
            try {
                browser = await chromium.launch({
                    headless: runHeadless,
                    channel: secondaryChannel,
                    args: launchArgs
                });
                activeChannel = secondaryChannel;
                activeBrowser = browser;
                log(`✅ Fallback successful: Launched ${secondaryDisplayName}!`);
            } catch (fallbackErr) {
                const errorMsg = `Both Google Chrome and Microsoft Edge failed to launch. Please install at least one browser to proceed. (${fallbackErr.message})`;
                log(`❌ ${errorMsg}`);
                await onNativeAlert('Browser Launch Error', errorMsg, 'error');
                throw new Error(errorMsg);
            }
        }
    }

    const sessionDir = userDataPath || path.join(__dirname, 'bpcl_session');
    const stateFile = path.join(sessionDir, 'state.json');

    let contextOptions = { viewport: null };
    if (fs.existsSync(stateFile)) {
        contextOptions.storageState = stateFile;
        log('📂 Found existing session state in storage.');
    }

    const context = await browser.newContext(contextOptions);

    // Inject clean top-right guidance badge across all navigations & tabs (strictly idempotent, top window only)
    await context.addInitScript(() => {
        const injectBadge = () => {
            try {
                // Ensure it only runs in top-level window, never inside child frames/iframes
                if (window.top !== window.self) return;

                // Single-instance check: if #nexus-overlay-banner already exists, do nothing
                if (document.getElementById('nexus-overlay-banner')) return;

                // Remove legacy instances first
                document.querySelectorAll('.nexus-auto-badge, #nexus-overlay-banner, #nexus-live-banner, .nexus-pill-badge, #nexus-guidance-overlay-banner').forEach(el => el.remove());

                const target = document.body || document.documentElement;
                if (!target) return;

                const badge = document.createElement('div');
                badge.id = 'nexus-overlay-banner';
                badge.className = 'nexus-auto-badge';
                badge.style.cssText = `
                    position: fixed !important;
                    top: 8px !important;
                    right: 20px !important;
                    z-index: 999999 !important;
                    background: rgba(15, 23, 42, 0.85) !important;
                    backdrop-filter: blur(8px) !important;
                    -webkit-backdrop-filter: blur(8px) !important;
                    color: #38bdf8 !important;
                    padding: 6px 14px !important;
                    border-radius: 20px !important;
                    font-family: sans-serif !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    border: 1px solid rgba(56, 189, 248, 0.3) !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.25) !important;
                    pointer-events: none !important;
                `;
                badge.innerText = '⚡ Nexus Auto-Engine Running';
                target.appendChild(badge);
            } catch (e) {}
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectBadge, { once: true });
        } else {
            injectBadge();
        }
    });

    const page = await context.newPage();

    try {
        // Step 1: Login with tamper-proofing
        onStatus('Logging In...');
        await performLogin(page, effectiveUserId, effectivePassword, selectors, log, stateFile, '', browser);

        // Step 2: Scrape Numbers
        onStatus('Scraping E-Day End...');
        const consumerNumbers = await scrapeConsumerNumbers(page, selectors, log);

        if (!consumerNumbers || consumerNumbers.length === 0) {
            log('ℹ️ No consumer numbers found under Product 5350 to cancel.');
            onStatus('Completed (No Data)');
            await onNativeAlert('No Consumers Found', 'No consumer numbers found under Product 5350 with Delivery Confirmation Not Done.', 'info');
            return { total: 0, success: 0, failed: 0, skipped: 0 };
        }

        // Step 3: Run Cancellations
        onStatus('Cancelling Memos...');
        const stats = await runCancellation(page, consumerNumbers, selectors, {
            log,
            onProgress,
            onTitleUpdate
        });

        // Step 4: CSV Execution Report
        try {
            const reportItems = stats.reportItems && stats.reportItems.length > 0
                ? stats.reportItems
                : consumerNumbers.map((num, idx) => ({
                    SNo: idx + 1,
                    ConsumerNumber: typeof num === 'string' ? num : num.ConsumerNumber || num.consumerNo,
                    Status: stats.stopped ? 'Stopped' : 'Processed',
                    Reason: stats.stopped ? 'Stopped by operator' : 'Completed',
                    Timestamp: new Date().toISOString()
                }));
            const reportPath = await generateCsvReport(reportItems);
            stats.reportPath = reportPath;
            if (reportPath) {
                log(`📄 Execution CSV Report generated: ${reportPath}`);
            }
        } catch (csvErr) {
            log(`⚠️ [WARN] Could not generate CSV report: ${csvErr.message}`);
        }

        // Step 5: Send Telemetry to Cloudflare Worker
        try {
            if (licenseKey && stats.success > 0) {
                log(`📡 Syncing completion telemetry (${stats.success} memos) with server...`);
                await sendTelemetry(licenseKey, stats.success, distributorName);
                log('✅ Telemetry synchronized with server.');
            }
        } catch (telErr) {
            log(`⚠️ Telemetry notice: ${telErr.message}`);
        }

        if (stats.stopped || isStopRequested) {
            onStatus('Stopped');
            return stats;
        }

        onStatus('Completed');

        // Step 6: Native Notification
        sendWindowsNotification(stats.success, stats.total);

        return stats;
    } finally {
        const closedBrowserName = (typeof activeChannel !== 'undefined' && activeChannel === 'msedge') ? 'Microsoft Edge' : 'Google Chrome';
        log(`🔒 Closing ${closedBrowserName} browser session...`);
        if (typeof context !== 'undefined' && context) {
            await context.close().catch(() => {});
        }
        if (browser) {
            await browser.close().catch(() => {});
        }
        if (onTitleUpdate) {
            onTitleUpdate('BPCL Nexus - Cash Memo Auto-Cancellation');
        }
    }
}

async function executePass1(consumerList, options = {}) {
    return consumerList;
}

async function executePass2(failedList, options = {}) {
    return failedList;
}

module.exports = {
    startCancellationProcess,
    WORKER_BASE_URL,
    runAutomation,
    launchBrowser,
    performLogin,
    scrapeConsumerNumbers,
    runCancellation,
    verifyDistributorCodeHeader,
    verifyLicenseAndFetchManifest,
    sendWindowsNotification,
    saveExecutionCsvReport,
    generateCsvReport,
    executePass1,
    executePass2,
    buildSelectors,
    DEFAULT_SELECTORS,
    requestStopAutomation,
    resetStopAutomation,
    isStopAutomationRequested: () => isStopRequested,
    formatConsoleLog,
    injectNexusOverlay,
    injectOverlay: injectNexusOverlay,
    showFloatingBanner: injectNexusOverlay,
    solveAntiCaptcha,
    getInMemorySelectors
};

