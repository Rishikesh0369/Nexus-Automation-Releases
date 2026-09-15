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
let {
    formatConsoleLog,
    WORKER_BASE_URL
} = require('./automationRunner');
const { startCancellationProcess } = require('./bela_nexus_runner');
const {
    verifyLicenseAndFetchManifest,
    requestStopAutomation,
    resetStopAutomation
} = require('./bela_nexus_runner');

let activeBrowser = null;
let isAborted = false;

if (!WORKER_BASE_URL) {
    WORKER_BASE_URL = 'https://bharatgas-api.www-rishikesh111.workers.dev';
}

function safeConsoleLog(msg) {
    console.log(formatConsoleLog(msg));
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
        // Silent auto-update check on app launch
        try {
            autoUpdater.checkForUpdatesAndNotify().catch((err) => {
                safeConsoleLog(`[UPDATE] Auto-update check: ${err?.message || err}`);
            });
        } catch (err) {
            safeConsoleLog(`[UPDATE] Auto-update check init error: ${err.message}`);
        }

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
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Clean ASCII logging via safeConsoleLog
autoUpdater.logger = {
    info: (msg) => safeConsoleLog(`[UPDATE] ${msg}`),
    warn: (msg) => safeConsoleLog(`[UPDATE WARN] ${msg}`),
    error: (msg) => safeConsoleLog(`[UPDATE ERROR] ${msg}`),
    debug: () => {}
};

// Send IPC status events to renderer
autoUpdater.on('update-available', (info) => {
    safeConsoleLog(`[UPDATE] New update available: v${info?.version || ''}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-available', info);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    safeConsoleLog(`[UPDATE] Update downloaded: v${info?.version || ''}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-downloaded', info);
    }
});

autoUpdater.on('error', (err) => {
    safeConsoleLog(`[UPDATE] Auto-updater notice: ${err?.message || err}`);
});

// Ensure single app instance
app.setAppUserModelId('com.bela.bharatgasnexus');
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

        try {
            autoUpdater.checkForUpdatesAndNotify();
        } catch (err) {
            safeConsoleLog(`[UPDATE] Auto-update check error: ${err.message}`);
        }

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Default settings helper: returns clean, empty defaults on fresh installation
function getInitialSettings(storeInstance) {
    const bpclUserId = storeInstance.get('bpclUserId', '');
    const bpclPassword = storeInstance.get('bpclPassword', '');
    const licenseKey = storeInstance.get('licenseKey', '');
    const agencyName = storeInstance.get('agencyName', '');
    const browserChannel = storeInstance.get('browserChannel', 'chrome');
    return {
        bpclUserId: typeof bpclUserId === 'string' ? bpclUserId : '',
        bpclPassword: typeof bpclPassword === 'string' ? bpclPassword : '',
        licenseKey: typeof licenseKey === 'string' ? licenseKey : '',
        agencyName: typeof agencyName === 'string' ? agencyName.trim() : '',
        browserChannel: browserChannel === 'msedge' ? 'msedge' : 'chrome',
        // Backward-compatibility aliases
        userId: typeof bpclUserId === 'string' ? bpclUserId : '',
        password: typeof bpclPassword === 'string' ? bpclPassword : ''
    };
}

// IPC Handler: Get Settings
ipcMain.handle('get-settings', async () => {
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

// IPC Handler: Get Application Version (reads directly from package.json)
ipcMain.handle('get-app-version', () => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        return pkg.version || app.getVersion();
    } catch (e) {
        return app.getVersion();
    }
});

// IPC Handler: Open External URL (for release/update downloads)
ipcMain.handle('open-external', (_event, url) => {
    if (url && typeof url === 'string') {
        shell.openExternal(url);
    }
    return { success: true };
});

// IPC Handler: Restart Application to Apply Downloaded Update
ipcMain.handle('restart-app', () => {
    safeConsoleLog('[UPDATE] Restarting application to apply update...');
    try {
        autoUpdater.quitAndInstall(false, true);
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
        safeConsoleLog(`[REPORT] Launching CSV report in default program: ${filePath}`);
        const err = await shell.openPath(filePath);
        if (err) {
            safeConsoleLog(`[REPORT] shell.openPath error: ${err}`);
            return { success: false, message: err };
        }
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
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
        anticaptchaApiKey = (process.env.ANTI_CAPTCHA_KEY || '4de60f13638febd83275de5f12c956d1').trim();
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
    safeConsoleLog(`🚀 Starting auto-cancellation process (Browser: ${browserDisplayName}, Mode: Visible)...`);
    mainWindow.webContents.send('log-message', `🚀 Starting auto-cancellation process (Browser: ${browserDisplayName}, Mode: Visible)...`);

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
                        mainWindow.webContents.send('log-message', msg);
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
                            message,
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

        safeConsoleLog(`❌ Process aborted due to error: ${err.message}`);
        mainWindow.setTitle(DEFAULT_TITLE);
        mainWindow.webContents.send('status-update', 'Error');
        mainWindow.webContents.send('process-error', err.message);
        return { error: err.message };
    } finally {
        activeBrowser = null;
    }
});

// -------------------------------------------------------------
// STANDALONE LIQUID-GLASS TOAST WINDOW CONTROLLER
// -------------------------------------------------------------
let toastWindow = null;

function showLiquidGlassToast({ totalCancelled, timeTaken }) {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: workX, y: workY, width: workWidth, height: workHeight } = primaryDisplay.workArea;

    const toastWidth = 320;
    const toastHeight = 116;
    const marginX = 14;
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
