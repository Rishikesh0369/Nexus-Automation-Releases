const { contextBridge, ipcRenderer } = require('electron');

const nexusStore = {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, val) => ipcRenderer.invoke('store:set', key, val),
    clear: () => ipcRenderer.invoke('store:clear')
};

const electronAPI = {
    // Worker Base API URL
    workerBaseUrl: 'https://bharatgas-api.www-rishikesh111.workers.dev',

    // Settings API
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    clearSettings: () => ipcRenderer.invoke('clear-settings'),

    // Automation Control
    startCancellation: (options) => ipcRenderer.invoke('start-cancellation', options),
    stopAutomation: () => ipcRenderer.invoke('stop-automation'),
    stopCancellation: () => ipcRenderer.invoke('stop-automation'),

    // Event Listeners from Main to Renderer
    onStatusUpdate: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('status-update', listener);
        return () => ipcRenderer.removeListener('status-update', listener);
    },
    onProgressUpdate: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('progress-update', listener);
        return () => ipcRenderer.removeListener('progress-update', listener);
    },
    onLogMessage: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('log-message', listener);
        return () => ipcRenderer.removeListener('log-message', listener);
    },
    onProcessComplete: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('process-complete', listener);
        return () => ipcRenderer.removeListener('process-complete', listener);
    },
    onProcessError: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('process-error', listener);
        return () => ipcRenderer.removeListener('process-error', listener);
    },
    verifyLicense: (licenseKey, bpclUserId) => ipcRenderer.invoke('verify-license', licenseKey, bpclUserId),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    appVersion: (() => {
        try {
            return require('./package.json').version;
        } catch (e) {
            return '';
        }
    })(),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onAgencyUpdate: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('agency-update', listener);
        return () => ipcRenderer.removeListener('agency-update', listener);
    },
    onManifestLoaded: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('manifest-loaded', listener);
        return () => ipcRenderer.removeListener('manifest-loaded', listener);
    },
    onAutomationStarted: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('automation-started', listener);
        return () => ipcRenderer.removeListener('automation-started', listener);
    },
    onAutomationStopped: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('automation-stopped', listener);
        return () => ipcRenderer.removeListener('automation-stopped', listener);
    },
    onAutomationCompleted: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('automation-completed', listener);
        return () => ipcRenderer.removeListener('automation-completed', listener);
    },

    // Auto-updater (GitHub Releases OTA updates)
    onUpdateAvailable: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('update-available', listener);
        return () => ipcRenderer.removeListener('update-available', listener);
    },
    onUpdateDownloaded: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('update-downloaded', listener);
        return () => ipcRenderer.removeListener('update-downloaded', listener);
    },
    restartApp: () => ipcRenderer.invoke('restart-app'),

    // Execution Report Launch
    openReport: (filePath) => ipcRenderer.invoke('open-report', filePath),

    // In-App Support Messaging & Telemetry Notifications
    getSupportChat: () => ipcRenderer.invoke('get-support-chat'),
    sendSupportMessage: (messageText) => ipcRenderer.invoke('send-support-message', messageText),
    getNotifications: () => ipcRenderer.invoke('get-notifications'),
    onNotificationUpdate: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('notification-update', listener);
        return () => ipcRenderer.removeListener('notification-update', listener);
    },
    onOpenSupportModal: (callback) => {
        const listener = (_event, value) => callback(value);
        ipcRenderer.on('open-support-modal', listener);
        return () => ipcRenderer.removeListener('open-support-modal', listener);
    }
};

try {
    if (process.contextIsolated && contextBridge && contextBridge.exposeInMainWorld) {
        contextBridge.exposeInMainWorld('nexusStore', nexusStore);
        contextBridge.exposeInMainWorld('electronAPI', electronAPI);
        contextBridge.exposeInMainWorld('ipcRenderer', {
            invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
            send: (channel, ...args) => ipcRenderer.send(channel, ...args),
            on: (channel, listener) => ipcRenderer.on(channel, listener),
            removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
        });
    } else {
        window.nexusStore = nexusStore;
        window.electronAPI = electronAPI;
        window.ipcRenderer = ipcRenderer;
    }
} catch (_err) {
    window.nexusStore = nexusStore;
    window.electronAPI = electronAPI;
    window.ipcRenderer = ipcRenderer;
}
