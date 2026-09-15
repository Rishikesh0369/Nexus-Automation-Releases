const { app, BrowserWindow, nativeImage, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');

// Match exact appId from package.json
app.setAppUserModelId('com.nexus.automation');

// Permanently enforce zero-throttling background execution (prevent Windows OS throttling when minimized or out of focus)
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
const fs = require('fs');
const https = require('https');
let WORKER_BASE_URL = 'https://bharatgas-api.www-rishikesh111.workers.dev';

const {
    startCancellationProcess,
    verifyLicenseAndFetchManifest,
    requestStopAutomation,
    resetStopAutomation,
    cleanup,
    formatConsoleLog,
    maskConsumerNumber,
    sanitizeErrorMessage
} = require('./bela_nexus_runner');

let activeBrowser = null;
let isAborted = false;

// -------------------------------------------------------------
// AUTOMATION MUTEX
// -------------------------------------------------------------
// Cash-memo cancellation and the delivery report both drive a Playwright
// session against the same BPCL account, so they can never run concurrently -
// a second login would invalidate the first one's session. The renderer locks
// the idle button visually; this flag is the authoritative backstop for any
// path that reaches IPC anyway (a stale window, a replayed invoke, a race).
let isAnyAutomationRunning = false;

function safeSanitize(msg) {
    if (typeof sanitizeErrorMessage === 'function') return sanitizeErrorMessage(msg);
    if (!msg || typeof msg !== 'string') return '';
    return msg
        .replace(/[A-Za-z]:\\[Uu]sers\\[^\\]+\\[^\s:)]+/gi, '[internal_path]')
        .replace(/[A-Za-z]:\\[^\s:)]+/g, '[internal_path]')
        .replace(/\/(?:Users|home)\/[^\s:)]+/g, '[internal_path]')
        .replace(/file:\/\/\/[^\s:)]+/g, '[internal_url]');
}

function safeConsoleLog(msg) {
    const formatted = typeof formatConsoleLog === 'function' ? formatConsoleLog(msg) : msg;
    console.log(safeSanitize(formatted));
}

// -------------------------------------------------------------
// TELEMETRY & SUPPORT MESSAGING NOTIFICATION ENGINE
// -------------------------------------------------------------
const knownSeenAnnouncements = new Set();
let lastKnownAdminMessageId = null;
let notificationPollingTimer = null;

async function pollNotifications() {
    try {
        const s = await getStoreInstance();
        const licenseKey = (s.get('licenseKey', '') || '').trim();
        const url = licenseKey ? `${WORKER_BASE_URL}/api/notifications?licenseKey=${encodeURIComponent(licenseKey)}` : `${WORKER_BASE_URL}/api/notifications`;
        const res = await fetch(url).catch(() => null);
        if (!res) return;
        const data = await res.json().catch(() => null);
        if (!data || !data.success) return;

        const announcements = data.announcements || [];
        const unreadMessages = data.unreadMessages || [];

        // Check for brand-new announcements
        const newAnnouncements = announcements.filter(a => a && a.id && !knownSeenAnnouncements.has(a.id));
        if (knownSeenAnnouncements.size > 0 && newAnnouncements.length > 0) {
            const latest = newAnnouncements[0];
            triggerDesktopAlert(
                latest.priority === 'urgent' ? '🚨 Nexus Urgent Announcement' : '📢 Nexus Broadcast Notice',
                `${latest.title}: ${latest.message}`
            );
        }
        announcements.forEach(a => { if (a && a.id) knownSeenAnnouncements.add(a.id); });

        // Check for new unread admin replies
        if (unreadMessages.length > 0) {
            const latestMsg = unreadMessages[unreadMessages.length - 1];
            if (latestMsg.id && latestMsg.id !== lastKnownAdminMessageId) {
                lastKnownAdminMessageId = latestMsg.id;
                triggerDesktopAlert('💬 Message from Service Provider', latestMsg.message);
            }
        }

        // Notify renderer to update bell badge
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notification-update', {
                totalUnread: unreadMessages.length + (newAnnouncements.length > 0 ? 1 : 0),
                unreadMessagesCount: unreadMessages.length,
                announcementsCount: announcements.length,
                announcements
            });
        }
    } catch (err) {
        // Silently continue on network hiccups
    }
}

function triggerDesktopAlert(title, body) {
    try {
        if (Notification.isSupported()) {
            const notif = new Notification({
                title,
                body: typeof body === 'string' ? body.substring(0, 160) : ''
            });
            notif.on('click', () => {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.focus();
                    mainWindow.webContents.send('open-support-modal');
                }
            });
            notif.show();
        }
    } catch (e) {}
}

const Store = require('electron-store');
let store;
try {
    store = new Store();
} catch (e) {
    console.error('Failed to instantiate electron-store:', e);
}

function getStoreInstance() {
    if (!store) {
        store = new Store();
    }
    return store;
}

// Permanent electron-store IPC handlers
ipcMain.handle('store:get', (event, key) => store.get(key));
ipcMain.handle('store:set', (event, key, val) => {
    store.set(key, val);
    return true;
});
ipcMain.handle('store:clear', () => {
    store.clear();
    return true;
});

let mainWindow = null;
const DEFAULT_TITLE = 'Nexus Automation';

function getAppIconPath() {
    const icoPath = path.join(__dirname, 'assets', 'icon.ico');
    const pngPath = path.join(__dirname, 'assets', 'icon.png');
    if (fs.existsSync(icoPath)) return icoPath;
    if (fs.existsSync(pngPath)) return pngPath;
    return undefined;
}

function createWindow() {
    const iconPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'assets', 'icon.ico')
        : path.join(__dirname, 'assets', 'icon.ico');
    
    // Fallback to local if resourcesPath doesn't have it
    const finalIcon = require('fs').existsSync(iconPath) 
        ? iconPath 
        : path.join(__dirname, 'assets', 'icon.ico');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 920,
        minHeight: 680,
        title: DEFAULT_TITLE,
        icon: finalIcon,
        backgroundColor: '#0f172a',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Force runtime taskbar update
    mainWindow.setIcon(finalIcon);

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // Start background telemetry notifications polling
        pollNotifications();
        if (!notificationPollingTimer) {
            notificationPollingTimer = setInterval(pollNotifications, 60000);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// -------------------------------------------------------------
// AUTO-UPDATER CONFIGURATION (GitHub Releases OTA Updates)
// -------------------------------------------------------------
let isUpdateDownloaded = false;
let downloadedVersion = '';

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Explicitly bind release feed to official GitHub repository
autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Rishikesh0369',
    repo: 'Nexus-Automation-Releases'
});

// Clean ASCII logging via safeConsoleLog
autoUpdater.logger = {
    info: (msg) => safeConsoleLog(`[UPDATE] ${msg}`),
    warn: (msg) => safeConsoleLog(`[UPDATE WARN] ${msg}`),
    error: (msg) => safeConsoleLog(`[UPDATE ERROR] ${msg}`),
    debug: () => {}
};

// Forward download progress and completion to Renderer UI
autoUpdater.on('update-available', (info) => {
    safeConsoleLog(`[UPDATE] New update available: v${info?.version || ''}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-progress', { 
            percent: Math.round(progressObj.percent) 
        });
    }
});

autoUpdater.on('update-downloaded', (info) => {
    isUpdateDownloaded = true;
    downloadedVersion = info?.version || '';
    safeConsoleLog(`[UPDATE] Update downloaded: v${downloadedVersion}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info);
    }
});

autoUpdater.on('error', (err) => {
    safeConsoleLog(`[UPDATE] Auto-updater notice: ${err?.message || err}`);
});

// IPC Handler to query current downloaded status (for renderer DOM load)
ipcMain.removeHandler('get-update-status');
ipcMain.handle('get-update-status', () => {
    let currVer = '1.1.3';
    try {
        currVer = app.getVersion();
    } catch (_) {}
    return { isDownloaded: isUpdateDownloaded, version: downloadedVersion, currentVersion: currVer };
});

// IPC Listener to restart app and apply update silently
ipcMain.on('apply-update-and-reopen', () => {
    safeConsoleLog('[UPDATE] Operator triggered apply-update-and-reopen.');
    autoUpdater.quitAndInstall(true, true);
});

// Dev simulation handler for verifying progress bar & 'Open Again' modal UI
ipcMain.removeHandler('trigger-test-update-flow');
ipcMain.handle('trigger-test-update-flow', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { error: 'Window not ready' };
    mainWindow.webContents.send('update-available', { version: '1.2.0' });
    let p = 0;
    const interval = setInterval(() => {
        p += 20;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', { percent: Math.min(100, p) });
        }
        if (p >= 100) {
            clearInterval(interval);
            isUpdateDownloaded = true;
            downloadedVersion = '1.2.0';
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-downloaded', { version: '1.2.0' });
            }
        }
    }, 400);
    return { success: true };
});

// Ensure single app instance
app.setAppUserModelId('com.nexus.automation');
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        await getStoreInstance();
        createWindow();

        // Check automatically on launch in production
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify().catch((err) => {
                console.log('Update check error:', err.message);
                safeConsoleLog(`[UPDATE] Update check error: ${err.message}`);
            });
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', async () => {
    try {
        if (typeof cleanup === 'function') {
            await cleanup();
        }
        if (activeBrowser) {
            await activeBrowser.close().catch(() => {});
            activeBrowser = null;
        }
    } catch (_) {}
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async () => {
    try {
        if (typeof cleanup === 'function') {
            await cleanup();
        }
        if (activeBrowser) {
            await activeBrowser.close().catch(() => {});
            activeBrowser = null;
        }
    } catch (_) {}
});

// Default settings helper: returns clean, empty defaults on fresh installation
function getInitialSettings(storeInstance) {
    const bpclUserId = storeInstance.get('bpclUserId', '');
    const bpclPassword = storeInstance.get('bpclPassword', '');
    const licenseKey = storeInstance.get('licenseKey', '');
    const agencyName = storeInstance.get('agencyName', '');
    const browserChannel = storeInstance.get('browserChannel', 'chrome');
    const expiresAt = storeInstance.get('expiresAt', '');
    const licenseValid = storeInstance.get('licenseValid', false);
    return {
        bpclUserId: typeof bpclUserId === 'string' ? bpclUserId : '',
        bpclPassword: typeof bpclPassword === 'string' ? bpclPassword : '',
        licenseKey: typeof licenseKey === 'string' ? licenseKey : '',
        agencyName: typeof agencyName === 'string' ? agencyName.trim() : '',
        browserChannel: browserChannel === 'msedge' ? 'msedge' : 'chrome',
        expiresAt: typeof expiresAt === 'string' ? expiresAt : '',
        licenseValid: Boolean(licenseValid),
        // Backward-compatibility aliases
        userId: typeof bpclUserId === 'string' ? bpclUserId : '',
        password: typeof bpclPassword === 'string' ? bpclPassword : ''
    };
}

// IPC Handler: Get Settings & Get Credentials
ipcMain.handle('get-settings', async () => {
    const s = await getStoreInstance();
    return getInitialSettings(s);
});
ipcMain.handle('get-credentials', async () => {
    const s = await getStoreInstance();
    return getInitialSettings(s);
});

// IPC Handler: Save Settings
ipcMain.handle('save-settings', async (_event, settings) => {
    const s = await getStoreInstance();
    if (settings) {
        if (typeof settings.bpclUserId !== 'undefined' || typeof settings.userId !== 'undefined') {
            const bpclUserId = typeof settings.bpclUserId !== 'undefined' ? settings.bpclUserId : settings.userId;
            s.set('bpclUserId', (bpclUserId || '').trim());
        }
        if (typeof settings.bpclPassword !== 'undefined' || typeof settings.password !== 'undefined') {
            const bpclPassword = typeof settings.bpclPassword !== 'undefined' ? settings.bpclPassword : settings.password;
            s.set('bpclPassword', (bpclPassword || '').trim());
        }
        if (typeof settings.licenseKey !== 'undefined') {
            s.set('licenseKey', (settings.licenseKey || '').trim());
        }
        if (typeof settings.browserChannel !== 'undefined') {
            s.set('browserChannel', settings.browserChannel === 'msedge' ? 'msedge' : 'chrome');
        }
        if (typeof settings.agencyName !== 'undefined') {
            s.set('agencyName', (settings.agencyName || '').trim());
        }
        if (typeof settings.expiresAt !== 'undefined') {
            s.set('expiresAt', (settings.expiresAt || '').trim());
        }
        if (typeof settings.licenseValid !== 'undefined') {
            s.set('licenseValid', Boolean(settings.licenseValid));
        }
        const distributorCode = typeof settings.distributorCode !== 'undefined' ? settings.distributorCode : '';
        if (distributorCode && distributorCode.trim()) {
            s.set('distributorCode', distributorCode.trim());
        }

        // Purge deprecated or legacy keys if present
        s.delete('userId');
        s.delete('password');
        s.delete('antiCaptchaKey');
        s.delete('anticaptchaApiKey');
    }
    return { success: true, message: 'Settings saved successfully' };
});

// IPC Handler: Clear / Reset Settings (Purge all stored credentials)
ipcMain.handle('clear-settings', async () => {
    const s = await getStoreInstance();
    s.clear();
    return { success: true, message: 'All saved credentials and local data have been cleared.' };
});

// IPC Handler: Stop Automation Gracefully & Immediately (<1s)
async function handleStopAutomation() {
    safeConsoleLog('🛑 Stop request received from operator. Terminating browser session immediately...');
    isAborted = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', 'Stopped by User (Idle)');
        mainWindow.webContents.send('automation-stopped');
        mainWindow.webContents.send('log-message', '🛑 [STOP] Process terminated immediately by operator.');
    }
    if (activeBrowser) {
        try {
            await activeBrowser.close();
        } catch (_) {}
        activeBrowser = null;
    }
    await requestStopAutomation();
    return { success: true, message: 'Automation stopped successfully' };
}

ipcMain.handle('stop-automation', handleStopAutomation);
ipcMain.on('stop-automation', handleStopAutomation);
ipcMain.handle('stop-cancellation', handleStopAutomation);

// IPC Handler: Verify License Directly
ipcMain.handle('verify-license', async (_event, licenseKey, bpclUserId) => {
    const cleanKey = (licenseKey || '').trim();
    const cleanUser = (bpclUserId || '').trim();
    if (!cleanKey || !cleanUser) {
        return {
            success: false,
            status: 400,
            error: 'MISSING_FIELDS',
            message: 'कृपया BPCL User ID और License Key दोनों दर्ज करें।'
        };
    }
    try {
        const result = await verifyLicenseAndFetchManifest(cleanKey, cleanUser);
        return result;
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// IPC Handler: Get Application Version (reads directly from package.json/app.getVersion)
ipcMain.removeHandler('get-app-version');
ipcMain.handle('get-app-version', () => app.getVersion());

// IPC Handler: Open External URL (for release/update downloads)
ipcMain.handle('open-external', (_event, url) => {
    if (url && typeof url === 'string') {
        shell.openExternal(url);
    }
    return { success: true };
});

// Register IPC handler to fetch remote Cloudflare QR without CSP/Renderer restrictions
ipcMain.removeHandler('fetch-cloudflare-qr');
ipcMain.handle('fetch-cloudflare-qr', async () => {
    const qrUrl = 'https://pub-8c276fd4bfb24254b0a32501ab834708.r2.dev/1SamsungPay_QR.png';
    const fetchUrlAsBase64 = (targetUrl) => {
        return new Promise((resolve) => {
            https.get(targetUrl, (res) => {
                if (res.statusCode !== 200) {
                    resolve(null);
                    return;
                }
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const base64 = `data:image/png;base64,${buffer.toString('base64')}`;
                    resolve(base64);
                });
            }).on('error', (err) => {
                console.error('Failed to fetch Cloudflare QR in main process:', err);
                resolve(null);
            });
        });
    };

    try {
        let base64 = await fetchUrlAsBase64(qrUrl);
        if (!base64) {
            // Fallback to direct dynamic UPI QR for mars@pingpay so the QR is never broken
            const fallbackUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent('upi://pay?pa=mars@pingpay&pn=Nexus%20Automation&cu=INR');
            base64 = await fetchUrlAsBase64(fallbackUrl);
        }
        return base64;
    } catch (err) {
        console.error('Error fetching QR:', err);
        return null;
    }
});

// IPC Handler: Restart Application to Apply Downloaded Update
ipcMain.removeHandler('restart-app');
ipcMain.handle('restart-app', () => {
    safeConsoleLog('[UPDATE] Restarting application to apply update...');
    try {
        autoUpdater.quitAndInstall(true, true);
    } catch (e) {
        app.relaunch();
        app.exit(0);
    }
    return { success: true };
});

// IPC Handler: Open CSV Report in Excel via shell.openPath
ipcMain.handle('open-report', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        return { success: false, message: 'Report path not specified.' };
    }
    try {
        safeConsoleLog(`[REPORT] Launching CSV report in default program: ${path.basename(filePath)}`);
        const err = await shell.openPath(filePath);
        if (err) {
            safeConsoleLog(`[REPORT] shell.openPath error: ${safeSanitize(err)}`);
            return { success: false, message: safeSanitize(err) };
        }
        return { success: true };
    } catch (err) {
        return { success: false, message: safeSanitize(err.message) };
    }
});

// -------------------------------------------------------------
// IPC HANDLERS: SUPPORT CHAT & IN-APP NOTIFICATIONS
// -------------------------------------------------------------

// IPC Handler: Fetch Support Chat History
ipcMain.handle('get-support-chat', async () => {
    try {
        const s = await getStoreInstance();
        const licenseKey = (s.get('licenseKey', '') || '').trim();
        if (!licenseKey) {
            return { success: false, message: 'License key is required. Please set and save it in Settings.' };
        }
        const res = await fetch(`${WORKER_BASE_URL}/api/chat?licenseKey=${encodeURIComponent(licenseKey)}`);
        const data = await res.json();
        return data;
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// IPC Handler: Send Support Message
ipcMain.handle('send-support-message', async (_event, messageText) => {
    try {
        if (!messageText || !messageText.trim()) {
            return { success: false, message: 'Message cannot be empty.' };
        }
        const s = await getStoreInstance();
        const licenseKey = (s.get('licenseKey', '') || '').trim();
        if (!licenseKey) {
            return { success: false, message: 'License key is required. Please set and save it in Settings.' };
        }
        const res = await fetch(`${WORKER_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                licenseKey,
                message: messageText.trim(),
                sender: 'client'
            })
        });
        const data = await res.json();
        return data;
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// IPC Handler: Get Broadcast Announcements & Unread Status
ipcMain.handle('get-notifications', async () => {
    try {
        const s = await getStoreInstance();
        const licenseKey = (s.get('licenseKey', '') || '').trim();
        const url = licenseKey ? `${WORKER_BASE_URL}/api/notifications?licenseKey=${encodeURIComponent(licenseKey)}` : `${WORKER_BASE_URL}/api/notifications`;
        const res = await fetch(url);
        const data = await res.json();
        return data;
    } catch (err) {
        return { success: false, message: err.message };
    }
});

// IPC Handler: Get Cancellation History (Pruned to 90 days, sorted newest first)
ipcMain.handle('get-cancellation-history', async () => {
    try {
        const s = await getStoreInstance();
        let rawHistory = s.get('cancellation_history', []);
        if (typeof rawHistory === 'string') {
            try { rawHistory = JSON.parse(rawHistory); } catch (_) { rawHistory = []; }
        }
        if (!Array.isArray(rawHistory)) rawHistory = [];
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - ninetyDaysMs;
        const valid = rawHistory.filter(item => (Number(item?.timestamp) || 0) >= cutoff);
        valid.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));
        return valid;
    } catch (err) {
        safeConsoleLog(`[IPC] get-cancellation-history error: ${err.message}`);
        return [];
    }
});

// IPC Handler: Start Cancellation (Two-Step Native Confirmation Dialogs)
ipcMain.handle('start-cancellation', async (_event, options = {}) => {
    if (!mainWindow) return { error: 'Main window is not available' };

    // MUTEX: refuse outright if the delivery report (or another cancellation)
    // already holds the automation slot. Claimed here, before any await, so two
    // rapid invokes cannot both pass the check.
    if (isAnyAutomationRunning) {
        throw new Error('Another automation process is already active.');
    }
    isAnyAutomationRunning = true;

    const s = await getStoreInstance();
    const bpclUserId = s.get('bpclUserId', '');
    const bpclPassword = s.get('bpclPassword', '');
    const licenseKey = s.get('licenseKey', '');
    const distributorCode = s.get('distributorCode', '');
    const browserChannel = (options && options.browserChannel) || s.get('browserChannel', 'chrome');
    // Extract anticaptchaApiKey strictly in RAM from in-memory options or Cloudflare server manifest
    let anticaptchaApiKey = (options && (options.anticaptchaApiKey || options.apiKey)) ? String(options.anticaptchaApiKey || options.apiKey).trim() : '';
    if (!anticaptchaApiKey && licenseKey && bpclUserId) {
        try {
            const manifestData = await verifyLicenseAndFetchManifest(licenseKey, bpclUserId);
            anticaptchaApiKey = manifestData?.manifest?.anticaptchaApiKey || manifestData?.anticaptchaApiKey || manifestData?.payload?.anticaptchaApiKey || '';
            if (anticaptchaApiKey) {
                anticaptchaApiKey = String(anticaptchaApiKey).trim();
            }
        } catch (_) {}
    }
    if (!anticaptchaApiKey) {
        anticaptchaApiKey = (process.env.ANTI_CAPTCHA_KEY || '').trim();
    }

    const settings = {
        bpclUserId,
        bpclPassword,
        licenseKey,
        distributorCode,
        browserChannel,
        anticaptchaApiKey,
        userId: bpclUserId,
        password: bpclPassword
    };

    // Pre-check fields
    if (!settings.bpclUserId || !settings.bpclPassword || !settings.licenseKey) {
        await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Missing Configuration',
            message: 'Incomplete Settings Detected',
            detail: 'Please provide BPCL User ID, Password, and License Key in the Settings tab before starting.'
        });
        // Early exit before the try/finally - release the slot by hand.
        isAnyAutomationRunning = false;
        return { cancelled: true, reason: 'Incomplete settings' };
    }

    // Reset abort state and browser reference for fresh run
    isAborted = false;
    activeBrowser = null;

    // Directly launch automation with visible browser (headless: false) by default
    const isHeadless = false;

    // Confirmed! Notify renderer to toggle button state to "Stop Auto-Cancellation" immediately
    mainWindow.webContents.send('automation-started');
    const browserDisplayName = settings.browserChannel === 'msedge' ? 'Microsoft Edge' : 'Google Chrome';
    safeConsoleLog('🚀 Initializing agency session in secure workstation mode...');
    mainWindow.webContents.send('log-message', '🚀 Initializing agency session in secure workstation mode...');

    // Hold manifest.selectors strictly in volatile RAM (DO NOT save to electron-store, localStorage, or disk)
    const inMemorySelectors = (options && options.selectors && typeof options.selectors === 'object') ? options.selectors : null;

    // Run the Ported Automation Engine
    try {
        const runnerConfig = {
            bpclUserId: settings.bpclUserId,
            bpclPassword: settings.bpclPassword,
            userId: settings.bpclUserId,
            password: settings.bpclPassword,
            authorizedUserId: settings.bpclUserId,
            licenseKey: settings.licenseKey,
            anticaptchaApiKey: anticaptchaApiKey,
            browserChannel: settings.browserChannel,
            headless: isHeadless,
            userDataPath: app.getPath('userData'),
            downloadsPath: app.getPath('downloads'),
            callbacks: {
                onBrowserLaunched: (browserInstance) => {
                    activeBrowser = browserInstance;
                },
                onStatus: (status) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('status-update', status);
                    }
                },
                onProgress: (progressData) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('progress-update', progressData);
                    }
                },
                onLog: (msg) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('log-message', safeSanitize(msg));
                    }
                },
                onTitleUpdate: (newTitle) => {
                    if (mainWindow) {
                        mainWindow.setTitle(newTitle);
                    }
                },
                onAgencyUpdate: (distributor) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('agency-update', distributor);
                    }
                },
                onManifestLoaded: (manifestData) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('manifest-loaded', manifestData);
                    }
                },
                onCompleted: (data) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('automation-completed', data);
                        if (!data?.stopped && (data?.totalCancelled !== undefined || data?.cancelled !== undefined || data?.stats?.success !== undefined)) {
                            showLiquidGlassToast({
                                totalCancelled: data.totalCancelled ?? data.cancelled ?? data.stats?.success ?? 0,
                                timeTaken: data.timeTaken || data.metrics?.timeTaken || '0m 00s'
                            });
                        }
                    }
                },
                onNativeAlert: async (title, message, type = 'info') => {
                    if (mainWindow) {
                        // Suppress unauthorized payload error dialogs so no unauthorized modal is shown
                        if (message && message.includes('Cannot retrieve execution payload')) {
                            return;
                        }
                        await dialog.showMessageBox(mainWindow, {
                            type,
                            title,
                            message: safeSanitize(message),
                            buttons: ['OK']
                        });
                    }
                }
            }
        };

        const stats = await startCancellationProcess(runnerConfig, inMemorySelectors);

        mainWindow.setTitle(DEFAULT_TITLE);
        if (stats && stats.stopped) {
            safeConsoleLog(`🛑 Process stopped by operator. Memos cancelled: ${stats.success || 0} / ${stats.total || 0}`);
            mainWindow.webContents.send('status-update', 'Stopped by User (Idle)');
            mainWindow.webContents.send('automation-stopped', stats);
            mainWindow.webContents.send('automation-completed', stats);
            mainWindow.webContents.send('process-complete', stats);
            activeBrowser = null;
            return { success: true, stopped: true, stats };
        } else {
            safeConsoleLog(`🎉 Process finished: Total: ${stats?.total || 0} | Success: ${stats?.success || 0} | Failed: ${stats?.failed || 0} | Skipped: ${stats?.skipped || 0}`);
            mainWindow.webContents.send('automation-completed', stats);
            mainWindow.webContents.send('process-complete', stats);
            showLiquidGlassToast({
                totalCancelled: stats?.success ?? stats?.cancelled ?? 0,
                timeTaken: stats?.metrics?.timeTaken || '0m 00s'
            });
            activeBrowser = null;
            return { success: true, stats };
        }
    } catch (err) {
        activeBrowser = null;
        const msg = (err.message || '').toLowerCase();
        const isAbort = isAborted || (
            msg.includes('target closed') || 
            msg.includes('browser closed') ||
            msg.includes('browser has been closed') ||
            msg.includes('target page, context or browser has been closed') ||
            msg.includes('connection closed') ||
            msg.includes('navigation failed because page was closed')
        );

        if (isAbort) {
            safeConsoleLog('🛑 [STOP] Process terminated immediately by operator.');
            mainWindow.setTitle(DEFAULT_TITLE);
            mainWindow.webContents.send('status-update', 'Stopped by User (Idle)');
            mainWindow.webContents.send('automation-stopped');
            mainWindow.webContents.send('automation-completed', { stopped: true });
            mainWindow.webContents.send('process-complete', { stopped: true });
            return { success: true, stopped: true };
        }

        const cleanErr = safeSanitize(err.message || 'An unexpected error occurred.');
        safeConsoleLog(`❌ Process aborted due to error: ${cleanErr}`);
        mainWindow.setTitle(DEFAULT_TITLE);
        mainWindow.webContents.send('status-update', 'Error');
        mainWindow.webContents.send('process-error', cleanErr);
        return { error: cleanErr };
    } finally {
        activeBrowser = null;
        isAnyAutomationRunning = false;
    }
});

// -------------------------------------------------------------
// STANDALONE LIQUID-GLASS TOAST WINDOW CONTROLLER
// -------------------------------------------------------------
let toastWindow = null;
let lastToastTime = 0;

function showLiquidGlassToast({ totalCancelled, timeTaken }) {
    const now = Date.now();
    if (now - lastToastTime < 1500 && toastWindow && !toastWindow.isDestroyed()) {
        return;
    }
    lastToastTime = now;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: workX, y: workY, width: workWidth, height: workHeight } = primaryDisplay.workArea;

    const toastWidth = 336;
    const toastHeight = 138;
    const marginX = 16;
    const marginY = 10;

    const posX = Math.round(workX + workWidth - toastWidth - marginX);
    const posY = Math.round(workY + workHeight - toastHeight - marginY);

    if (toastWindow && !toastWindow.isDestroyed()) {
        toastWindow.close();
    }

    toastWindow = new BrowserWindow({
        width: toastWidth,
        height: toastHeight,
        x: posX,
        y: posY,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            backgroundThrottling: false,
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    toastWindow.loadFile(path.join(__dirname, 'toast.html'));

    toastWindow.webContents.on('did-finish-load', () => {
        toastWindow.webContents.send('toast-data', { totalCancelled, timeTaken });
    });

    setTimeout(() => {
        if (toastWindow && !toastWindow.isDestroyed()) {
            toastWindow.close();
        }
    }, 8000);
}

ipcMain.on('show-completion-toast', (event, data) => {
    showLiquidGlassToast(data);
});

ipcMain.on('dismiss-toast', () => {
    if (toastWindow && !toastWindow.isDestroyed()) {
        toastWindow.close();
    }
});

ipcMain.handle('trigger-test-toast', () => {
    showLiquidGlassToast({
        totalCancelled: 142,
        timeTaken: '3m 45s'
    });
    return { success: true };
});

// -------------------------------------------------------------
// DELIVERY REPORT MODULE (ADDITIVE)
// -------------------------------------------------------------
// Fully isolated from the cash-memo cancellation pipeline: its own
// scraper, its own browser handle and its own stop channel, so a report
// run can never interfere with an in-flight cancellation.
// -------------------------------------------------------------
const deliveryReportScraper = require('./scrapers/deliveryReportScraper');

let deliveryReportBrowser = null;

function sendDeliveryEvent(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

ipcMain.handle('start-delivery-report', async (_event, options = {}) => {
    if (!mainWindow) return { error: 'Main window is not available' };

    // MUTEX: refuse outright if a cash-memo cancellation (or another report)
    // already holds the automation slot. Claimed before any await.
    if (isAnyAutomationRunning) {
        throw new Error('Another automation process is already active.');
    }
    isAnyAutomationRunning = true;

    const s = await getStoreInstance();
    const bpclUserId = s.get('bpclUserId', '');
    const bpclPassword = s.get('bpclPassword', '');
    const licenseKey = s.get('licenseKey', '');
    const browserChannel = (options && options.browserChannel) || s.get('browserChannel', 'chrome');

    if (!bpclUserId || !bpclPassword || !licenseKey) {
        await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Missing Configuration',
            message: 'Incomplete Settings Detected',
            detail: 'Please provide BPCL User ID, Password, and License Key in the Settings tab before fetching the delivery report.'
        });
        // Early exit before the try/finally - release the slot by hand.
        isAnyAutomationRunning = false;
        return { cancelled: true, reason: 'Incomplete settings' };
    }

    // Anti-captcha key stays strictly in volatile RAM (never persisted).
    let anticaptchaApiKey = (options && (options.anticaptchaApiKey || options.apiKey))
        ? String(options.anticaptchaApiKey || options.apiKey).trim()
        : '';
    if (!anticaptchaApiKey) {
        anticaptchaApiKey = (process.env.ANTI_CAPTCHA_KEY || '').trim();
    }

    const inMemorySelectors = (options && options.selectors && typeof options.selectors === 'object')
        ? options.selectors
        : null;

    sendDeliveryEvent('delivery-report-started');
    safeConsoleLog('📊 Delivery report requested by operator.');

    try {
        const report = await deliveryReportScraper.fetchDeliveryReport({
            bpclUserId,
            bpclPassword,
            licenseKey,
            anticaptchaApiKey,
            browserChannel,
            headless: false,
            userDataPath: app.getPath('userData'),
            selectors: inMemorySelectors,
            callbacks: {
                onBrowserLaunched: (browserInstance) => {
                    deliveryReportBrowser = browserInstance;
                },
                onStatus: (status) => sendDeliveryEvent('delivery-report-status', status),
                onProgress: (data) => sendDeliveryEvent('delivery-report-progress', data),
                onLog: (msg) => sendDeliveryEvent('delivery-report-log', safeSanitize(msg))
            }
        });

        deliveryReportBrowser = null;
        safeConsoleLog(`📊 Delivery report finished: ${report?.rawRecords?.length || 0} records, ${report?.operatorSummary?.length || 0} operators.`);
        sendDeliveryEvent('delivery-report-complete', report);
        return { success: true, report };
    } catch (err) {
        deliveryReportBrowser = null;
        const cleanErr = safeSanitize(err.message || 'An unexpected error occurred while fetching the delivery report.');
        safeConsoleLog(`❌ Delivery report failed: ${cleanErr}`);
        sendDeliveryEvent('delivery-report-error', cleanErr);
        return { error: cleanErr };
    } finally {
        isAnyAutomationRunning = false;
    }
});

ipcMain.handle('stop-delivery-report', async () => {
    safeConsoleLog('🛑 Stop requested for delivery report.');

    // Flag + immediate browser kill in one call. Everything in flight (OCR /
    // captcha handshake, dashboard redirect, pagination) rejects at once
    // instead of playing out its own timeout.
    const result = deliveryReportScraper.requestStopDeliveryReport();

    sendDeliveryEvent('delivery-report-status', 'Stopping...');
    sendDeliveryEvent('delivery-report-log', '🛑 [STOP] Process terminated immediately by operator. Records already collected will be kept.');

    // Belt-and-braces: main.js holds its own reference from onBrowserLaunched,
    // so close that too in case the scraper's handle was already cleared.
    // Bounded, because closing an already-dying browser can hang.
    const doomed = deliveryReportBrowser;
    deliveryReportBrowser = null;
    if (doomed) {
        await Promise.race([
            Promise.resolve(doomed.close()).catch(() => {}),
            new Promise((resolve) => {
                const t = setTimeout(resolve, 3000);
                if (typeof t.unref === 'function') t.unref();
            })
        ]);
    }

    return { success: true, killed: Boolean(result && result.killed) || Boolean(doomed) };
});

ipcMain.handle('export-delivery-report-csv', async (_event, payload) => {
    try {
        const records = Array.isArray(payload)
            ? payload
            : (payload && Array.isArray(payload.records) ? payload.records
                : (payload && Array.isArray(payload.rawRecords) ? payload.rawRecords : []));

        if (!records.length) {
            return { success: false, error: 'There are no delivery records to export yet.' };
        }

        // Deduplicate defensively, then group by operator in the same
        // descending order the modal shows, consumers ascending within.
        const deduped = new Map();
        for (const rec of records) {
            const key = String(rec?.consumerNumber || '').trim();
            if (!key || deduped.has(key)) continue;
            deduped.set(key, rec);
        }
        const unique = Array.from(deduped.values());

        const order = new Map();
        deliveryReportScraper.buildOperatorSummary(unique).forEach((entry, idx) => {
            order.set(entry.operatorName, idx);
        });
        const rank = (name) => {
            const key = String(name || '').trim() || 'Unassigned';
            return order.has(key) ? order.get(key) : Number.MAX_SAFE_INTEGER;
        };

        unique.sort((a, b) => {
            const diff = rank(a.operatorName) - rank(b.operatorName);
            if (diff !== 0) return diff;
            // Within an operator, list consumers alphabetically - it reads as a
            // delivery round-sheet rather than an arbitrary id sequence.
            const byName = String(a.consumerName || '').localeCompare(
                String(b.consumerName || ''), undefined, { sensitivity: 'base' }
            );
            if (byName !== 0) return byName;
            return String(a.consumerNumber || '').localeCompare(String(b.consumerNumber || ''), undefined, { numeric: true });
        });

        // ---- Hierarchical, operator-grouped workbook ---------------
        // A real .xlsx, not CSV: column widths, fills and alignment only
        // survive in a workbook. Consumer numbers are written as strings so
        // Excel never reformats them into scientific notation.
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Nexus Automation';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Delivery Report', {
            views: [{ showGridLines: true }]
        });

        const CENTER = { horizontal: 'center', vertical: 'middle' };

        const groups = new Map();
        for (const rec of unique) {
            const name = (rec.operatorName || '').trim() || 'Unassigned';
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(rec);
        }

        // buildOperatorSummary is already sorted by count descending.
        for (const { operatorName, count } of deliveryReportScraper.buildOperatorSummary(unique)) {
            const rows = groups.get(operatorName) || [];

            // 1. Operator title, merged across A:D.
            const titleRow = sheet.addRow([`NAME - ${operatorName} (Total: ${count})`]);
            sheet.mergeCells(titleRow.number, 1, titleRow.number, 4);
            titleRow.height = 26;
            const titleCell = sheet.getCell(`A${titleRow.number}`);
            titleCell.font = { bold: true, size: 12, color: { argb: 'FFF8FAFC' } };
            titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            titleCell.alignment = CENTER;

            // 2. One blank row under the title.
            sheet.addRow([]);

            // 3. Column headers.
            const headerRow = sheet.addRow(['Consumer Name', 'Area Description', 'Consumer Number', 'Book Date']);
            headerRow.height = 22;
            headerRow.eachCell((cell) => {
                cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
                cell.alignment = CENTER;
            });

            // 4. Consumer rows.
            for (const rec of rows) {
                const dataRow = sheet.addRow([
                    String(rec.consumerName || ''),
                    String(rec.areaDescription || ''),
                    // Explicit text so long ids never render as 1.01E+08.
                    String(rec.consumerNumber || ''),
                    // Text too - Excel would otherwise reinterpret a dd/mm/yyyy
                    // string as a locale date and silently swap day and month.
                    String(rec.bookDate || '')
                ]);
                dataRow.height = 20;
                dataRow.eachCell((cell) => { cell.alignment = CENTER; });
                dataRow.getCell(3).numFmt = '@';
                dataRow.getCell(4).numFmt = '@';
            }

            // 5. Two blank rows before the next operator.
            sheet.addRow([]);
            sheet.addRow([]);
        }

        // ---- Auto-fit column widths -------------------------------
        // Sized to the longest value in each column so nothing is truncated,
        // clamped so one very long name cannot blow the sheet out.
        sheet.columns.forEach((column) => {
            let maxLen = 15;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const cellVal = cell.value ? cell.value.toString() : '';
                if (cellVal.length > maxLen) maxLen = cellVal.length;
            });
            column.width = Math.min(Math.max(maxLen + 4, 18), 45);
        });

        const stamp = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const defaultName = `Delivery_Report_${pad(stamp.getDate())}-${pad(stamp.getMonth() + 1)}-${stamp.getFullYear()}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}.xlsx`;
        const downloadsDir = app.getPath('downloads');

        let targetPath = path.join(downloadsDir, defaultName);
        if (mainWindow && !mainWindow.isDestroyed()) {
            const result = await dialog.showSaveDialog(mainWindow, {
                title: 'Save Delivery Report',
                defaultPath: targetPath,
                filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
            });
            if (result.canceled || !result.filePath) {
                return { success: false, cancelled: true };
            }
            targetPath = result.filePath;
        }

        await workbook.xlsx.writeFile(targetPath);
        safeConsoleLog(`[REPORT] Delivery report exported: ${path.basename(targetPath)} (${unique.length} rows)`);

        return { success: true, filePath: targetPath, rowCount: unique.length };
    } catch (err) {
        const cleanErr = safeSanitize(err.message || 'Failed to export the delivery report.');
        safeConsoleLog(`❌ Delivery CSV export failed: ${cleanErr}`);
        return { success: false, error: cleanErr };
    }
});
