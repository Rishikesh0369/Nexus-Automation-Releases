const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Running Comprehensive Fix Verification Suite...');

const mainPath = path.resolve(__dirname, '../desktop-app/main.js');
const rendererPath = path.resolve(__dirname, '../desktop-app/renderer.js');

const mainCode = fs.readFileSync(mainPath, 'utf8');
const rendererCode = fs.readFileSync(rendererPath, 'utf8');

// --- 1. CRITICAL FIX 1: get-app-version IPC Handlers ---
console.log('1. Verifying get-app-version deduplication and handler in main.js...');
const getAppVersionMatches = mainCode.match(/get-app-version/g) || [];
assert.strictEqual(getAppVersionMatches.length, 2, 'get-app-version should appear exactly twice in main.js (removeHandler and handle)');
assert(mainCode.includes("ipcMain.removeHandler('get-app-version');\r\nipcMain.handle('get-app-version', () => app.getVersion());") ||
       mainCode.includes("ipcMain.removeHandler('get-app-version');\nipcMain.handle('get-app-version', () => app.getVersion());"),
       'Exact pattern ipcMain.removeHandler and handle for get-app-version must exist in main.js');
console.log('  ✅ CRITICAL FIX 1 verified successfully.');

// --- 2. Update Lifecycle & Handler Deduplication in main.js ---
console.log('2. Verifying update lifecycle & restart handlers in main.js...');
assert(mainCode.includes("ipcMain.removeHandler('get-update-status');"), 'get-update-status must be guarded with removeHandler');
assert(mainCode.includes("ipcMain.removeHandler('restart-app');"), 'restart-app must be guarded with removeHandler');
assert(mainCode.includes("autoUpdater.quitAndInstall(true, true);"), 'autoUpdater.quitAndInstall(true, true) must be used for seamless restart');
console.log('  ✅ Main process update lifecycle verified.');

// --- 3. Duplicate IPC Event Listeners Removal in renderer.js ---
console.log('3. Verifying removal of duplicate updater listeners in renderer.js...');
const onUpdateDownloadedCount = (rendererCode.match(/onUpdateDownloaded/g) || []).length;
assert.strictEqual(onUpdateDownloadedCount, 2, 'onUpdateDownloaded should only appear in lines 664-668 fallback, duplicate listener removed');
assert(!rendererCode.includes("otaUpdateBanner.classList.remove('hidden')"), 'Duplicate otaUpdateBanner listener must be removed from renderer.js');
const checkInitMatches = rendererCode.match(/await\s+checkInitialUpdateStatus\(\)/g) || [];
assert.strictEqual(checkInitMatches.length, 1, 'checkInitialUpdateStatus() must be invoked only once on startup (via await checkInitialUpdateStatus())');
console.log('  ✅ Duplicate renderer listeners eliminated.');

// --- 4. State Persistence (agencyName) in renderer.js ---
console.log('4. Verifying agencyName persistence on startup in renderer.js...');
assert(rendererCode.includes("getPersistentSetting('agencyName')"), 'loadStoredSettings must read agencyName from persistent store');
assert(rendererCode.includes("currentAgencyName = savedAgency;"), 'currentAgencyName must be initialized from savedAgency');
assert(rendererCode.includes("updateAgencyDisplay(savedAgency);"), 'updateAgencyDisplay must be called immediately with savedAgency');
console.log('  ✅ State persistence for agencyName verified.');

console.log('\n🎉 ALL COMPREHENSIVE FIX ASSERTIONS PASSED SUCCESSFULLY!\n');
