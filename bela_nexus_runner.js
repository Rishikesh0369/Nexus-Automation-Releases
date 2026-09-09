/**
 * Bharat Gas Nexus - Playwright Automation Script
 * Strict Tamper-Proof Login & Cash Memo Cancellation Runner
 * Remote Automation Payload & Dynamic In-Memory Selectors
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WORKER_BASE_URL = 'https://bharatgas-api.www-rishikesh111.workers.dev';

// ============================================================================
// STRICT IN-MEMORY SELECTORS & PAYLOAD STORE
// CRITICAL SECURITY RULE: Store these selectors ONLY in memory.
// NEVER write them to disk, localStorage, or JSON configuration files.
// ============================================================================
let inMemorySelectors = null;
let inMemoryLoginUrl = null;
let inMemoryApiKey = null;
let ac = null;
try {
    ac = require('@antiadmin/anticaptchaofficial');
} catch (_) {}

// Stop automation cancellation token & active browser reference
let isStopRequested = false;
let isAborted = false;
let activeBrowser = null;

async function requestStopAutomation() {
    isStopRequested = true;
    isAborted = true;
    if (activeBrowser) {
        try {
            await activeBrowser.close();
        } catch (_) {}
        activeBrowser = null;
    }
}

function resetStopAutomation() {
    isStopRequested = false;
    isAborted = false;
    activeBrowser = null;
}

function isStopAutomationRequested() {
    return isStopRequested || isAborted;
}

function getActiveBrowser() {
    return activeBrowser;
}

function setActiveBrowser(b) {
    activeBrowser = b;
}

function getIsAborted() {
    return isAborted;
}

function setIsAborted(v) {
    isAborted = Boolean(v);
}

/**
 * Default fallback selectors (used only if dynamic mapping requires fallbacks)
 */
const DEFAULT_SELECTORS = {
    loginUser: '#principal',
    loginPass: '#input_password',
    captchaImg: 'img#captcha',
    captchaInput: 'input#captcha',
    loginBtn: '.login-btn',
    menuMyApps: 'My Application',
    linkLpgOne: 'LPG One',
    linkEDayEnd: 'E-Day End This option is for',
    btnProceedDayEnd: 'Proceed',
    product5350Text: '5350',
    linkDelvConfNotDone: 'a[id*="hlDelvConfNotDone"]',
    tableConsumers: '#gvProductConsumer tr',
    linkCashMemoCancel: 'Cash Memo Cancel',
    txtConsumerNumber: '#ctl00_ContentPlaceHolder1_txtConsumerNumber',
    btnProceedCancel: '#ctl00_ContentPlaceHolder1_btnProceed',
    linkCancelMemo: '#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel',
    lblMessage: '#ctl00_ContentPlaceHolder1_lblMessage',
    btnClear: '#ctl00_ContentPlaceHolder1_btnClear',

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

/**
 * Build combined selectors adhering to dynamic memory schema
 */
function buildSelectors(manifestSelectors = {}) {
    const s = manifestSelectors || {};

    const loginUser = s.loginUser || s.userInput || s.userIdInput || s.login?.principalInput || DEFAULT_SELECTORS.loginUser;
    const loginPass = s.loginPass || s.passInput || s.passwordInput || s.login?.passwordInput || DEFAULT_SELECTORS.loginPass;
    const captchaImg = s.captchaImg || s.login?.captchaImg || DEFAULT_SELECTORS.captchaImg;
    const captchaInput = s.captchaInput || s.login?.captchaInput || DEFAULT_SELECTORS.captchaInput;
    const loginBtn = s.loginBtn || s.loginButton || s.login?.loginBtn || DEFAULT_SELECTORS.loginBtn;
    const menuMyApps = s.menuMyApps || s.navigation?.myApplicationText || DEFAULT_SELECTORS.menuMyApps;
    const linkLpgOne = s.linkLpgOne || s.navigation?.lpgOneText || DEFAULT_SELECTORS.linkLpgOne;
    const linkEDayEnd = s.linkEDayEnd || s.navigation?.eDayEndText || DEFAULT_SELECTORS.linkEDayEnd;
    const btnProceedDayEnd = s.btnProceedDayEnd || s.navigation?.proceedButtonText || DEFAULT_SELECTORS.btnProceedDayEnd;
    const product5350Text = s.product5350Text || s.navigation?.productCode || DEFAULT_SELECTORS.product5350Text;
    const linkDelvConfNotDone = s.linkDelvConfNotDone || s.navigation?.delvConfNotDoneLink || DEFAULT_SELECTORS.linkDelvConfNotDone;
    const tableConsumers = s.tableConsumers || s.memoRows || s.navigation?.consumerTableRows || DEFAULT_SELECTORS.tableConsumers;
    const linkCashMemoCancel = s.linkCashMemoCancel || s.cancelMenuTab || s.cancellation?.cashMemoCancelText || DEFAULT_SELECTORS.linkCashMemoCancel;
    const txtConsumerNumber = s.txtConsumerNumber || s.memoSearchInput || s.consumerNumberInput || s.cancellation?.consumerNumberInput || DEFAULT_SELECTORS.txtConsumerNumber;
    const btnProceedCancel = s.btnProceedCancel || s.confirmDialogYes || s.proceedBtn || s.cancellation?.proceedBtn || DEFAULT_SELECTORS.btnProceedCancel;
    const linkCancelMemo = s.linkCancelMemo || s.cancelMemoBtn || s.cancelLink || s.cancellation?.cancelLink || DEFAULT_SELECTORS.linkCancelMemo;
    const lblMessage = s.lblMessage || s.messageLabel || s.cancellation?.messageLabel || DEFAULT_SELECTORS.lblMessage;
    const btnClear = s.btnClear || s.cancellation?.clearBtn || DEFAULT_SELECTORS.btnClear;

    return {
        // Direct Server Selectors (Exact 18 Keys)
        loginUser,
        loginPass,
        captchaImg,
        captchaInput,
        loginBtn,
        menuMyApps,
        linkLpgOne,
        linkEDayEnd,
        btnProceedDayEnd,
        product5350Text,
        linkDelvConfNotDone,
        tableConsumers,
        linkCashMemoCancel,
        txtConsumerNumber,
        btnProceedCancel,
        linkCancelMemo,
        lblMessage,
        btnClear,

        // Test Compatibility and Backward Aliases
        userInput: loginUser,
        passInput: loginPass,
        userIdInput: loginUser,
        passwordInput: loginPass,
        loginButton: loginBtn,
        cancelMenuTab: linkCashMemoCancel,
        memoRows: tableConsumers,
        consumerNumberInput: txtConsumerNumber,
        memoSearchInput: txtConsumerNumber,
        cancelLink: linkCancelMemo,
        cancelMemoBtn: linkCancelMemo,
        proceedBtn: btnProceedCancel,
        confirmDialogYes: btnProceedCancel,
        messageLabel: lblMessage,
        clearBtn: btnClear,

        login: {
            ...DEFAULT_SELECTORS.login,
            ...(s.login || {}),
            principalInput: loginUser,
            passwordInput: loginPass,
            captchaImg,
            captchaInput,
            loginBtn
        },
        navigation: {
            ...DEFAULT_SELECTORS.navigation,
            ...(s.navigation || {}),
            myApplicationText: menuMyApps,
            lpgOneText: linkLpgOne,
            eDayEndText: linkEDayEnd,
            proceedButtonText: btnProceedDayEnd,
            productCode: product5350Text,
            delvConfNotDoneLink: linkDelvConfNotDone,
            consumerTableRows: tableConsumers
        },
        cancellation: {
            ...DEFAULT_SELECTORS.cancellation,
            ...(s.cancellation || {}),
            cashMemoCancelText: linkCashMemoCancel,
            consumerNumberInput: txtConsumerNumber,
            proceedBtn: btnProceedCancel,
            cancelLink: linkCancelMemo,
            messageLabel: lblMessage,
            clearBtn: btnClear
        }
    };
}

/**
 * 1. Cloudflare license verification call that validates bpclUserId and licenseKey
 * @param {string} licenseKey
 * @param {string} bpclUserId
 * @returns {Promise<Object>}
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
 * Get in-memory dynamic selectors (never reads from disk)
 */
function getInMemorySelectors() {
    return inMemorySelectors;
}

/**
 * Launch Browser with smart auto-fallback between Chrome and Edge
 */
async function launchBrowser(preferredChannel = 'chrome', options = {}) {
    const cleanPreferred = preferredChannel === 'msedge' ? 'msedge' : 'chrome';
    const secondaryChannel = cleanPreferred === 'chrome' ? 'msedge' : 'chrome';
    const launchArgs = [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=CalculateNativeWinOcclusion',
        '--disable-component-update',
        '--disable-sync',
        '--no-default-browser-check',
        '--no-first-run',
        ...(options.args || [])
    ];

    try {
        return await chromium.launch({
            headless: Boolean(options.headless),
            channel: cleanPreferred,
            args: launchArgs
        });
    } catch (err) {
        console.warn(`[Runner] ${cleanPreferred} launch failed, falling back to ${secondaryChannel}:`, err.message);
        return await chromium.launch({
            headless: Boolean(options.headless),
            channel: secondaryChannel,
            args: launchArgs
        });
    }
}

async function launchChromeBrowser(options = {}) {
    return await launchBrowser('chrome', options);
}

/**
 * Trigger native Windows Toast Notification with sound via PowerShell
 */
function sendWindowsNotification(title, message) {
    if (process.platform !== 'win32') return;
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

    try {
        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
        const { exec } = require('child_process');
        exec(`powershell -NoProfile -EncodedCommand ${encoded}`, () => {});
    } catch (e) {}
}

/**
 * Optimized Anti-Captcha Task Polling Logic (ImageToTextTask)
 */
async function solveAntiCaptcha(base64Image, apiKey, log = console.log) {
    const logger = typeof log === 'function' ? log : console.log;
    const clientKey = (apiKey || inMemoryApiKey || (ac && ac.settings && ac.settings.clientKey) || process.env.ANTI_CAPTCHA_KEY || '4de60f13638febd83275de5f12c956d1' || '').trim();
    if (!clientKey) {
        throw new Error('Anti-Captcha API key is required.');
    }
    if (ac && typeof ac.setAPIKey === 'function') {
        try { ac.setAPIKey(clientKey); } catch (_) {}
    }

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

    logger('[BOT] Polling Anti-Captcha result...');
    await new Promise(r => setTimeout(r, 4000));

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

/**
 * Top-right badge injection
 */
async function injectNexusOverlay(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.evaluate(() => {
            if (window.top !== window.self) return;
            if (document.getElementById('nexus-overlay-banner')) return;

            document.querySelectorAll('.nexus-auto-badge, #nexus-live-banner, .nexus-pill-badge, #nexus-guidance-overlay-banner').forEach(el => el.remove());
            
            const target = document.body || document.documentElement;
            if (!target) return;

            const badge = document.createElement('div');
            badge.id = 'nexus-overlay-banner';
            badge.className = 'nexus-auto-badge';
            badge.style.cssText = `
                position: fixed;
                top: 8px;
                right: 20px;
                z-index: 999999;
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(8px);
                color: #38bdf8;
                padding: 6px 14px;
                border-radius: 20px;
                font-family: sans-serif;
                font-size: 11px;
                font-weight: 600;
                border: 1px solid rgba(56, 189, 248, 0.3);
                box-shadow: 0 4px 12px rgba(0,0,0,0.25);
                pointer-events: none;
            `;
            badge.innerText = '⚡ Nexus Auto-Engine Running';
            target.appendChild(badge);
        });
    } catch (e) {
        // Silently ignore
    }
}

const injectOverlay = injectNexusOverlay;
const showFloatingBanner = injectNexusOverlay;

/**
 * Menu opening function
 */
async function openMyApplicationsMenu(page) {
    const myAppMenu = page.locator('a').filter({ hasText: 'My Application' }).first();
    const lpgOneLink = page.locator('a').filter({ hasText: 'LPG One' }).first();

    for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`[Menu] Attempt ${attempt}: Opening "My Applications"...`);
        await myAppMenu.hover();
        await page.waitForTimeout(1000);

        if (await lpgOneLink.isVisible()) {
            console.log('✅ "LPG One" dropdown is visible.');
            return lpgOneLink;
        }

        console.warn(`⚠️ Attempt ${attempt}: Hover failed to reveal "LPG One". Clicking menu directly...`);
        await myAppMenu.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);

        if (await lpgOneLink.isVisible()) {
            console.log('✅ "LPG One" visible after click fallback.');
            return lpgOneLink;
        }

        await page.mouse.move(0, 0);
        await page.waitForTimeout(500);
    }

    throw new Error('3 प्रयासों के बाद भी "LPG One" मेनू स्क्रीन पर दिखाई नहीं दिया।');
}

/**
 * MODULE 1: performLogin(page, userId, password, options)
 * Exact 3-module workflow from master_automation.js with dynamic selector compatibility.
 * - Navigate to https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO
 * - Check loginUser (#principal). Never blindly skip login.
 * - Fill loginUser (#principal) with userId
 * - Fill loginPass (#input_password) with password
 * - Screenshot captchaImg (img#captcha), solve via solveAntiCaptcha(), fill captchaInput (input#captcha)
 * - Click loginBtn (.login-btn) and verify navigation.
 */
async function performLogin(page, userId, password, selectorsOrOptions = null, maybeLog = console.log, sessionPath = null, authorizedDistributorCode = null, browser = null) {
    let activeSelectors = null;
    let log = typeof maybeLog === 'function' ? maybeLog : console.log;
    let statePath = sessionPath;
    let apiKey = null;

    if (selectorsOrOptions && typeof selectorsOrOptions === 'object' && (selectorsOrOptions.log || selectorsOrOptions.anticaptchaApiKey || selectorsOrOptions.apiKey || selectorsOrOptions.selectors)) {
        activeSelectors = buildSelectors(selectorsOrOptions.selectors || selectorsOrOptions);
        log = typeof selectorsOrOptions.log === 'function' ? selectorsOrOptions.log : log;
        statePath = selectorsOrOptions.sessionPath || statePath;
        apiKey = selectorsOrOptions.anticaptchaApiKey || selectorsOrOptions.apiKey;
        browser = selectorsOrOptions.browser || browser;
    } else {
        activeSelectors = buildSelectors(selectorsOrOptions || inMemorySelectors || DEFAULT_SELECTORS);
        log = typeof maybeLog === 'function' ? maybeLog : console.log;
    }

    const authUserId = (userId || '').trim();
    const targetUrl = inMemoryLoginUrl || activeSelectors.loginUrl || (activeSelectors.login && activeSelectors.login.url) || 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO';

    log('🌐 Navigating to eConnect portal...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Dynamic Selectors with Fallbacks for tests and runtime
    const userInputSelector = activeSelectors.loginUser || activeSelectors.userInput || activeSelectors.userIdInput || activeSelectors.login?.principalInput || '#principal';
    const passInputSelector = activeSelectors.loginPass || activeSelectors.passInput || activeSelectors.passwordInput || activeSelectors.login?.passwordInput || '#input_password';
    const captchaImgSelector = activeSelectors.captchaImg || activeSelectors.login?.captchaImg || 'img#captcha';
    const captchaInputSelector = activeSelectors.captchaInput || activeSelectors.login?.captchaInput || 'input#captcha';
    const loginBtnSelector = activeSelectors.loginBtn || activeSelectors.loginButton || activeSelectors.login?.loginBtn || '.login-btn';
    const menuMyAppsSelector = activeSelectors.menuMyApps || 'My Application';

    // Check login form vs dashboard indicator - never blindly skip login
    let onDashboard = false;
    let isLoginFormVisible = false;

    try {
        await Promise.race([
            page.locator(userInputSelector).waitFor({ state: 'visible', timeout: 5000 }),
            page.locator('a').filter({ hasText: menuMyAppsSelector }).first().waitFor({ state: 'visible', timeout: 5000 })
        ]);
    } catch (_) {}

    isLoginFormVisible = await page.locator(userInputSelector).isVisible().catch(() => false);
    onDashboard = await page.locator('a').filter({ hasText: menuMyAppsSelector }).first().isVisible().catch(() => false);

    if (onDashboard && !isLoginFormVisible) {
        log('✅ Active session confirmed on dashboard, skipping login');
        return;
    }

    log('🔒 Session not active, performing login...');

    for (let attempt = 1; attempt <= 3; attempt++) {
        log(`\n🔄 Login Attempt ${attempt}/3...`);

        try {
            // 1. Freeze input fields immediately via page.evaluate (DO NOT fill user/pass yet)
            await page.evaluate(() => {
                const userEl = document.querySelector('#principal');
                const passEl = document.querySelector('#input_password');
                if (userEl) { userEl.setAttribute('readonly', 'true'); userEl.style.pointerEvents = 'none'; }
                if (passEl) { passEl.setAttribute('readonly', 'true'); passEl.style.pointerEvents = 'none'; }
                if (!document.getElementById('nexus-freeze-guard')) {
                    const style = document.createElement('style');
                    style.id = 'nexus-freeze-guard';
                    style.innerHTML = `
                        #principal, #input_password {
                            pointer-events: none !important;
                            user-select: none !important;
                            -webkit-user-select: none !important;
                        }
                    `;
                    document.head.appendChild(style);
                }
            });

            // 2. While inputs are locked, take screenshot of img#captcha and call solveAntiCaptcha()
            log('🤖 Solving CAPTCHA using Anti-Captcha (Inputs Locked)...');

            const captchaElement = await page.locator(captchaImgSelector);
            await captchaElement.waitFor({ state: 'visible', timeout: 10000 });

            const imageBuffer = await captchaElement.screenshot();
            const base64Image = imageBuffer.toString('base64');

            const effectiveApiKey = apiKey || inMemoryApiKey || (ac && ac.settings && ac.settings.clientKey) || process.env.ANTI_CAPTCHA_KEY || '4de60f13638febd83275de5f12c956d1';
            const captchaText = await solveAntiCaptcha(base64Image, effectiveApiKey, log);
            log(`✅ CAPTCHA solved: ${captchaText}`);

            // 3. Zero-Window Flash Fill: Temporarily remove readonly and fill authorized credentials & captcha
            await page.evaluate(() => {
                const guard = document.getElementById('nexus-freeze-guard');
                if (guard) guard.remove();
                const userEl = document.querySelector('#principal');
                const passEl = document.querySelector('#input_password');
                if (userEl) { userEl.removeAttribute('readonly'); userEl.style.pointerEvents = 'auto'; }
                if (passEl) { passEl.removeAttribute('readonly'); passEl.style.pointerEvents = 'auto'; }
            });

            await page.fill(userInputSelector, authUserId);
            await page.fill(passInputSelector, password);
            await page.fill(captchaInputSelector, captchaText);

            // 4. Strict Tampering Check (Right before click)
            const finalVal = await page.inputValue('#principal');
            if (finalVal.trim().toLowerCase() !== userId.trim().toLowerCase()) {
                await page.context().browser().close();
                throw new Error("SECURITY VIOLATION: Manual Credential Tampering Detected! Aborting automation.");
            }

            // 5. Click .login-btn immediately without any artificial timeout
            await page.click(loginBtnSelector);

            log('⏳ Waiting to verify login success...');
            await page.waitForTimeout(5000);

            const stillOnLogin = await page.locator(userInputSelector).isVisible().catch(() => false);

            if (!stillOnLogin) {
                log('✅ Successfully navigated to dashboard!');
                const savePath = statePath || 'state.json';
                try {
                    await page.context().storageState({ path: savePath });
                    log(`💾 Session cookies successfully saved to ${savePath}`);
                } catch (e) {}
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
            log(`❌ Attempt ${attempt} encountered an error: ${error.message}`);
            if (error.message && error.message.includes('SECURITY VIOLATION')) {
                throw error;
            }
            if (attempt === 3) throw new Error('Login completely failed after 3 attempts.');
        }
    }
}

/**
 * MODULE 2: scrapeConsumerNumbers(page)
 * Exact 5-step workflow from master_automation.js with Cloudflare RAM dynamic selectors:
 * - Hover over menuMyApps ('My Application')
 * - Click linkLpgOne ('LPG One') and wait for new tab context:
 *   const [page1] = await Promise.all([page.context().waitForEvent('page'), page.locator('a').filter({ hasText: linkLpgOne }).first().click()]);
 * - In page1: Click linkEDayEnd ("E-Day End This option is for") -> Click btnProceedDayEnd ("Proceed")
 * - Click target link for product5350Text ("5350") with linkDelvConfNotDone ('a[id*="hlDelvConfNotDone"]'):
 *   const targetLink = page1.locator('#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr', { hasText: product5350Text }).locator(linkDelvConfNotDone).first();
 *   const [page2] = await Promise.all([page1.context().waitForEvent('page'), targetLink.click()]);
 * - In page2: Scrape numbers from tableConsumers ('#gvProductConsumer tr')
 * - Close page2 and page1. Return extracted numbers.
 */
async function scrapeConsumerNumbers(page, selectors = null, log = console.log) {
    const activeSelectors = (selectors && typeof selectors === 'object' && Object.keys(selectors).length > 0)
        ? buildSelectors(selectors)
        : (inMemorySelectors || buildSelectors(DEFAULT_SELECTORS));
    const logger = typeof log === 'function' ? log : console.log;

    const menuMyApps = activeSelectors.menuMyApps || 'My Application';
    const linkLpgOne = activeSelectors.linkLpgOne || 'LPG One';
    const linkEDayEnd = activeSelectors.linkEDayEnd || 'E-Day End This option is for';
    const btnProceedDayEnd = activeSelectors.btnProceedDayEnd || 'Proceed';
    const product5350Text = activeSelectors.product5350Text || '5350';
    const linkDelvConfNotDone = activeSelectors.linkDelvConfNotDone || 'a[id*="hlDelvConfNotDone"]';
    const tableConsumers = activeSelectors.tableConsumers || activeSelectors?.memoRows || '#gvProductConsumer tr';

    logger('📊 Navigating to E-Day End page to scrape numbers...');

    // 1. Hover over "My Application"
    logger(`🖱️ Hovering over "${menuMyApps}" menu...`);
    await page.locator('a').filter({ hasText: menuMyApps }).first().hover();
    await page.waitForTimeout(2000);

    // 2. Click "LPG One" and wait for new tab context
    logger(`🖱️ Clicking on "${linkLpgOne}"...`);
    const [page1] = await Promise.all([
        page.context().waitForEvent('page'),
        page.locator('a').filter({ hasText: linkLpgOne }).first().click()
    ]);

    await page1.waitForLoadState('domcontentloaded');
    await page1.waitForTimeout(2000);

    // 3. In page1: Click "E-Day End This option is for" -> Click "Proceed"
    logger(`🖱️ Clicking on "${linkEDayEnd}"...`);
    if (linkEDayEnd.startsWith('#') || linkEDayEnd.startsWith('.') || linkEDayEnd.includes('[')) {
        await page1.locator(linkEDayEnd).first().click();
    } else {
        await page1.getByRole('link', { name: linkEDayEnd }).click();
    }

    if (btnProceedDayEnd.startsWith('#') || btnProceedDayEnd.startsWith('.') || btnProceedDayEnd.includes('[')) {
        await page1.locator(btnProceedDayEnd).first().click();
    } else {
        await page1.getByRole('button', { name: btnProceedDayEnd }).click();
    }

    // 4. Click target link for Product 5350:
    logger(`🖱️ Opening consumer list for Product ${product5350Text} (Delivery Confirmation Not Done)...`);
    const targetLink = page1
        .locator('#ctl00_ContentPlaceHolder1_grViewTransactionsMatch tr', { hasText: product5350Text })
        .locator(linkDelvConfNotDone)
        .first();

    const [page2] = await Promise.all([
        page1.context().waitForEvent('page'),
        targetLink.click()
    ]);

    await page2.waitForLoadState('domcontentloaded');
    await page2.waitForTimeout(2000);
    logger('✅ E-Day End tab opened!');

    // 5. In page2: Scrape numbers from tableConsumers
    const consumerNumbers = await page2.$$eval(tableConsumers, rows => {
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
    await page2.close();
    await page1.close();
    return consumerNumbers;
}

/**
 * MODULE 3: runCancellation(page, numbers, onProgress)
 * Exact workflow from master_automation.js with Cloudflare RAM dynamic selectors:
 * - Hover menuMyApps ("My Application") -> Click linkLpgOne ("LPG One") (open new tab) -> Click linkCashMemoCancel ("Cash Memo Cancel")
 * - Loop over numbers with 2-pass retry:
 *   * Fill txtConsumerNumber (#ctl00_ContentPlaceHolder1_txtConsumerNumber)
 *   * Click btnProceedCancel (#ctl00_ContentPlaceHolder1_btnProceed)
 *   * Click linkCancelMemo (#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel)
 *   * Verify lblMessage (#ctl00_ContentPlaceHolder1_lblMessage)
 *   * Click btnClear (#ctl00_ContentPlaceHolder1_btnClear)
 *   * Send live UI telemetry update via IPC to update progress counters on the desktop app.
 */
async function runCancellation(page, numbers, selectorsOrCallbacks = null, maybeCallbacks = {}) {
    let activeSelectors = inMemorySelectors || buildSelectors(DEFAULT_SELECTORS);
    let callbacks = {};

    if (typeof selectorsOrCallbacks === 'function') {
        callbacks = { onProgress: selectorsOrCallbacks };
    } else if (selectorsOrCallbacks && typeof selectorsOrCallbacks === 'object') {
        if (selectorsOrCallbacks.onProgress || selectorsOrCallbacks.onLog || selectorsOrCallbacks.log) {
            callbacks = selectorsOrCallbacks;
        } else {
            activeSelectors = buildSelectors(selectorsOrCallbacks);
            callbacks = maybeCallbacks || {};
        }
    } else if (typeof maybeCallbacks === 'function') {
        callbacks = { onProgress: maybeCallbacks };
    } else {
        callbacks = maybeCallbacks || {};
    }

    const {
        log = console.log,
        onProgress = callbacks.onProgress,
        onTitleUpdate = callbacks.onTitleUpdate
    } = callbacks;
    const logger = typeof log === 'function' ? log : console.log;

    const menuMyApps = activeSelectors.menuMyApps || 'My Application';
    const linkLpgOne = activeSelectors.linkLpgOne || 'LPG One';
    const linkCashMemoCancel = activeSelectors.linkCashMemoCancel || activeSelectors?.cancelMenuTab || 'Cash Memo Cancel';
    const txtConsumerNumber = activeSelectors.txtConsumerNumber || activeSelectors.memoSearchInput || '#ctl00_ContentPlaceHolder1_txtConsumerNumber';
    const btnProceedCancel = activeSelectors.btnProceedCancel || activeSelectors.confirmDialogYes || '#ctl00_ContentPlaceHolder1_btnProceed';
    const linkCancelMemo = activeSelectors.linkCancelMemo || activeSelectors.cancelMemoBtn || '#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel';
    const lblMessage = activeSelectors.lblMessage || '#ctl00_ContentPlaceHolder1_lblMessage';
    const btnClear = activeSelectors.btnClear || '#ctl00_ContentPlaceHolder1_btnClear';

    logger(`\n🚀 Starting Cancellation Process for ${numbers.length} numbers...`);

    logger(`🖱️ Hovering over "${menuMyApps}"...`);
    await page.locator('a').filter({ hasText: menuMyApps }).first().hover();
    await page.waitForTimeout(1000);

    logger(`🖱️ Clicking on "${linkLpgOne}"...`);
    const [newPage] = await Promise.all([
        page.context().waitForEvent('page'),
        page.locator('a').filter({ hasText: linkLpgOne }).first().click()
    ]);

    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(1000);

    logger(`🖱️ Clicking on "${linkCashMemoCancel}"...`);
    if (linkCashMemoCancel.startsWith('#') || linkCashMemoCancel.startsWith('.') || linkCashMemoCancel.includes('[') || linkCashMemoCancel.includes('>') || linkCashMemoCancel.includes(':')) {
        await newPage.locator(linkCashMemoCancel).first().click();
    } else {
        await newPage.locator('a').filter({ hasText: linkCashMemoCancel }).first().click();
    }
    await newPage.waitForLoadState('domcontentloaded');
    await newPage.waitForTimeout(2000);

    let pendingNumbers = [...numbers];
    const maxPasses = 2; // Pass 1 for all, Pass 2 for failed numbers

    const stats = {
        total: numbers.length,
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        stopped: false
    };

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

    for (let pass = 1; pass <= maxPasses; pass++) {
        if (isStopAutomationRequested()) {
            stats.stopped = true;
            break;
        }
        if (pendingNumbers.length === 0) break;

        if (pass === 2) {
            logger(`\n⚠️ PASS 2: Automatically retrying ${pendingNumbers.length} failed numbers...`);
        }

        let failedInThisPass = [];

        for (let i = 0; i < pendingNumbers.length; i++) {
            if (isStopAutomationRequested()) {
                logger('\n🛑 [System] Auto-cancellation stopped by user.');
                stats.stopped = true;
                break;
            }

            const consumerNo = pendingNumbers[i];
            logger(`\n🔄 [Pass ${pass}] Processing: ${consumerNo}`);
            if (pass === 1) {
                stats.processed = i + 1;
            }

            // Dynamically update terminal & process title
            try {
                process.stdout.write(`\x1b]0;[${i + 1}/${pendingNumbers.length}] Success: ${stats.success} | BPCL Automation\x07`);
            } catch (e) {}

            if (onTitleUpdate) {
                onTitleUpdate(`[${stats.processed}/${numbers.length}] Success: ${stats.success} | BPCL Automation`);
            }

            // Dynamically update active browser tab/window title
            try {
                await newPage.evaluate(({ current, total, success }) => {
                    document.title = `[${current}/${total}] Success: ${success} - BPCL Auto-Cancel`;
                }, { current: stats.processed, total: numbers.length, success: stats.success });
            } catch (e) {}

            // Send live UI telemetry update via IPC to update progress counters on desktop app
            if (onProgress) {
                onProgress({
                    current: stats.processed,
                    total: numbers.length,
                    success: stats.success,
                    failed: stats.failed,
                    skipped: stats.skipped,
                    consumerNo,
                    pass
                });
            }

            try {
                await newPage.fill(txtConsumerNumber, consumerNo);

                await Promise.all([
                    newPage.waitForLoadState('networkidle').catch(() => newPage.waitForLoadState('domcontentloaded')),
                    newPage.click(btnProceedCancel)
                ]);

                const cancelLink = newPage.locator(linkCancelMemo);

                if (await cancelLink.isVisible().catch(() => false)) {
                    if (isAborted || isStopAutomationRequested()) {
                        logger('\n🛑 [System] Auto-cancellation stopped by user before memo cancellation click.');
                        stats.stopped = true;
                        break;
                    }

                    await Promise.all([
                        newPage.waitForLoadState('networkidle').catch(() => newPage.waitForLoadState('domcontentloaded')),
                        cancelLink.click()
                    ]);

                    const msg = await newPage.textContent(lblMessage).catch(() => '');
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
                        logger(`⚠️ ${consumerNo} cancellation message unclear. Will retry.`);
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
                    newPage.waitForLoadState('networkidle').catch(() => newPage.waitForLoadState('domcontentloaded')),
                    newPage.click(btnClear)
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
                    await newPage.click(btnClear);
                    await newPage.waitForLoadState('networkidle').catch(() => newPage.waitForLoadState('domcontentloaded'));
                } catch (e) {}
            }

            // Post-item progress telemetry
            if (onProgress) {
                onProgress({
                    current: stats.processed,
                    total: numbers.length,
                    success: stats.success,
                    failed: failedInThisPass.length,
                    skipped: stats.skipped,
                    consumerNo,
                    pass
                });
            }
        }

        pendingNumbers = failedInThisPass;

        if (isStopAutomationRequested() || stats.stopped) {
            stats.stopped = true;
            break;
        }

        if (pass === maxPasses && pendingNumbers.length > 0) {
            logger(`\n🚨 Final Report: ${pendingNumbers.length} numbers could not be cancelled after retries.`);
            logger(`Failed Numbers: ${pendingNumbers.join(', ')}`);
        }
    }

    stats.failed = pendingNumbers.length;

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

    // Final Windows Toast Notification with sound
    sendWindowsNotification(
        "BPCL Cash Memo Automation Completed",
        `Total: ${stats.total} | Success: ${stats.success} | Failed: ${stats.failed} | Skipped: ${stats.skipped}`
    );

    if (!newPage.isClosed()) {
        await newPage.close().catch(() => {});
    }

    stats.reportItems = Array.from(reportMap.values());
    return stats;
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
 * Main orchestration entrypoint with remote payload consumption and safety check
 */
async function runAutomation(config = {}) {
    resetStopAutomation();
    const {
        bpclUserId,
        authorizedUserId,
        bpclPassword,
        licenseKey,
        headless = false,
        browserChannel = 'chrome',
        userDataPath,
        callbacks = {},
        selectors: directSelectors
    } = config;

    if (directSelectors && typeof directSelectors === 'object' && Object.keys(directSelectors).length > 0) {
        inMemorySelectors = Object.freeze(buildSelectors(directSelectors));
    }

    const {
        onLog = console.log,
        onStatus = () => {},
        onProgress = () => {},
        onTitleUpdate = () => {},
        onAgencyUpdate = () => {},
        onNativeAlert = async () => {}
    } = callbacks;

    const log = typeof onLog === 'function' ? onLog : console.log;
    const effectiveUserId = (authorizedUserId || bpclUserId || config.userId || '').trim();
    const effectivePassword = (bpclPassword || config.password || '').trim();
    const effectiveAntiCaptchaKey = (config.anticaptchaApiKey || config.antiCaptchaKey || config.apiKey || '').trim();
    if (effectiveAntiCaptchaKey) {
        inMemoryApiKey = effectiveAntiCaptchaKey;
    }

    if (!licenseKey || !licenseKey.trim()) {
        const errorMsg = 'Please enter your License Key in Settings before starting.';
        await onNativeAlert('License Key Required', errorMsg, 'warning');
        throw new Error(errorMsg);
    }

    if (!effectiveUserId || !effectivePassword) {
        const errorMsg = 'Please enter BPCL User ID and Password in Settings before starting.';
        await onNativeAlert('Credentials Required', errorMsg, 'warning');
        throw new Error(errorMsg);
    }

    // 1. Locate and execute the Cloudflare license verification call
    onStatus('Verifying License...');
    log('🔐 Verifying BPCL User ID & License Key with Cloudflare Worker...');

    let responseData = null;
    try {
        responseData = await verifyLicenseAndFetchManifest(licenseKey, effectiveUserId);
    } catch (netErr) {
        log(`⚠️ Notice: Cloud manifest fetch unavailable (${netErr.message || netErr}). Using built-in local selectors.`);
    }

    // Extract anticaptchaApiKey strictly from Cloudflare server response into volatile RAM
    const cloudAntiCaptchaKey = responseData?.manifest?.anticaptchaApiKey || responseData?.anticaptchaApiKey || responseData?.payload?.anticaptchaApiKey || responseData?.apiKey || '';
    if (cloudAntiCaptchaKey) {
        inMemoryApiKey = String(cloudAntiCaptchaKey).trim();
    }

    if (responseData && (responseData.isExpired || (responseData.status === 403 && (responseData.error === 'SUBSCRIPTION_EXPIRED' || String(responseData.message || '').toLowerCase().includes('expired'))))) {
        let expireMsg = responseData.message;
        if (!expireMsg) {
            const dateStr = responseData.expiresAt || responseData.expiry;
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
    // If cloud selectors are missing, undefined, or empty, seamlessly fall back to the runner's
    // built-in local selectors without throwing any unauthorized modal or halting execution.
    const cloudPayload = (responseData && responseData.payload) ? responseData.payload : null;
    const cloudSelectors = cloudPayload?.selectors || responseData?.manifest?.selectors || responseData?.selectors || null;
    const hasCloudSelectors = Boolean(cloudSelectors && typeof cloudSelectors === 'object' && Object.keys(cloudSelectors).length > 0);
    const activeDirectSelectors = (directSelectors && typeof directSelectors === 'object' && Object.keys(directSelectors).length > 0) ? directSelectors : null;

    const mergedSelectors = hasCloudSelectors
        ? buildSelectors({ ...cloudSelectors, ...(activeDirectSelectors || {}) })
        : buildSelectors(activeDirectSelectors || inMemorySelectors || DEFAULT_SELECTORS);

    inMemorySelectors = Object.freeze(mergedSelectors);
    inMemoryLoginUrl = cloudPayload?.loginUrl || 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO';

    if (hasCloudSelectors) {
        log('✅ License verified! Cloud manifest selectors loaded into memory.');
    } else {
        log('ℹ️ Remote payload not provided; seamlessly falling back to built-in local selectors.');
    }

    const distributorName = responseData?.distributor || responseData?.agencyName || '';
    if (distributorName) {
        log(`🏢 Verified Agency: ${distributorName}`);
        onAgencyUpdate(distributorName);
    }

    // Initialize browser
    const browserLauncher = config.launchBrowser || module.exports.launchBrowser || launchBrowser;
    const browser = await browserLauncher(browserChannel, { headless });
    activeBrowser = browser;
    if (typeof callbacks?.onBrowserLaunched === 'function') {
        callbacks.onBrowserLaunched(browser);
    }
    const sessionDir = userDataPath || path.join(__dirname, 'bpcl_session');
    const stateFile = path.join(sessionDir, 'state.json');

    let contextOptions = { viewport: null };
    if (fs.existsSync(stateFile)) {
        contextOptions.storageState = stateFile;
        log('📂 Found existing session state in storage.');
    }

    const context = await browser.newContext(contextOptions);

    await context.addInitScript(() => {
        const injectBadge = () => {
            try {
                if (window.top !== window.self) return;
                if (document.getElementById('nexus-overlay-banner')) return;
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
            document.addEventListener('DOMContentLoaded', injectBadge);
        } else {
            injectBadge();
        }
    });

    const page = await context.newPage();

    try {
        await injectNexusOverlay(page);

        // Perform login using dynamic memory selectors
        await performLogin(page, effectiveUserId, effectivePassword, inMemorySelectors, log, stateFile, null, browser);

        // Scrape consumer numbers using dynamic memory selectors
        const consumerNumbers = await scrapeConsumerNumbers(page, inMemorySelectors, log);

        if (consumerNumbers.length === 0) {
            log('ℹ️ No pending delivery confirmation records found. Everything up to date!');
            await browser.close().catch(() => {});
            activeBrowser = null;
            return {
                success: true,
                message: 'No pending records found.',
                total: 0,
                cancelled: 0,
                stats: { total: 0, success: 0, failed: 0, skipped: 0 }
            };
        }

        // Run cancellation using dynamic memory selectors
        const cancellationStats = await runCancellation(page, consumerNumbers, inMemorySelectors, {
            log,
            onProgress,
            onTitleUpdate
        });

        await browser.close().catch(() => {});
        activeBrowser = null;
        return {
            success: true,
            total: consumerNumbers.length,
            cancelled: cancellationStats.success,
            stats: cancellationStats
        };

    } catch (err) {
        await browser.close().catch(() => {});
        activeBrowser = null;
        throw err;
    } finally {
        activeBrowser = null;
    }
}

/**
 * Top-level runner method for Bela Nexus
 */
async function runBelaNexusAutomation(params = {}, callbacks = {}) {
    return await runAutomation({
        ...params,
        callbacks
    });
}

// CLI execution support
if (require.main === module) {
    const args = process.argv.slice(2);
    const userId = args[0] || process.env.BPCL_USER_ID;
    const password = args[1] || process.env.BPCL_PASSWORD;
    const licenseKey = args[2] || process.env.BPCL_LICENSE_KEY;
    const browserChannel = args[3] || process.env.BPCL_BROWSER || 'chrome';

    if (!userId) {
        console.log('Usage: node bela_nexus_runner.js <authorizedUserId> [password] [licenseKey] [browserChannel]');
        process.exit(1);
    }

    runBelaNexusAutomation({
        authorizedUserId: userId,
        bpclPassword: password,
        licenseKey,
        browserChannel
    }, {
        onLog: console.log,
        onStatus: s => console.log(`[Status] ${s}`)
    }).then(res => {
        console.log('✅ Automation finished successfully:', res);
        process.exit(0);
    }).catch(err => {
        console.error('❌ Automation failed:', err.message);
        process.exit(1);
    });
}

function formatConsoleLog(msg) {
    if (typeof msg !== 'string') return msg;
    return msg.replace(/[^\x00-\x7F]/g, '').trim();
}

module.exports = {
    startCancellationProcess,
    runBelaNexusAutomation,
    runAutomation,
    performLogin,
    scrapeConsumerNumbers,
    runCancellation,
    verifyLicenseAndFetchManifest,
    getInMemorySelectors,
    DEFAULT_SELECTORS,
    buildSelectors,
    requestStopAutomation,
    resetStopAutomation,
    isStopAutomationRequested,
    getActiveBrowser,
    setActiveBrowser,
    getIsAborted,
    setIsAborted,
    launchBrowser,
    launchChromeBrowser,
    injectNexusOverlay,
    injectOverlay,
    showFloatingBanner,
    solveAntiCaptcha,
    sendWindowsNotification,
    openMyApplicationsMenu,
    formatConsoleLog
};

Object.defineProperty(module.exports, 'activeBrowser', {
    get() { return activeBrowser; },
    set(b) { activeBrowser = b; },
    enumerable: true,
    configurable: true
});

Object.defineProperty(module.exports, 'isAborted', {
    get() { return isAborted; },
    set(v) { isAborted = Boolean(v); },
    enumerable: true,
    configurable: true
});
