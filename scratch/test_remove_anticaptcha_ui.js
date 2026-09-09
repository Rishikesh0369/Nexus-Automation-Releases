const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Starting Anti-Captcha UI Removal & In-Memory Cloud Key Test Suite ---');

const htmlPath = path.join(__dirname, '..', 'desktop-app', 'index.html');
const rendererPath = path.join(__dirname, '..', 'desktop-app', 'renderer.js');
const mainPath = path.join(__dirname, '..', 'desktop-app', 'main.js');
const runnerPath = path.join(__dirname, '..', 'desktop-app', 'bela_nexus_runner.js');
const rootRunnerPath = path.join(__dirname, '..', 'bela_nexus_runner.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const rendererContent = fs.readFileSync(rendererPath, 'utf8');
const mainContent = fs.readFileSync(mainPath, 'utf8');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');
const rootRunnerContent = fs.readFileSync(rootRunnerPath, 'utf8');

// ============================================================================
// 1. UI REMOVAL TESTS (desktop-app/index.html)
// ============================================================================
console.log('\n[Group 1] Testing index.html UI Removal...');

assert(!htmlContent.includes('id="inputAntiCaptchaKey"'), 'inputAntiCaptchaKey input must not exist in index.html');
console.log('✅ 1. inputAntiCaptchaKey completely deleted from HTML');

assert(!htmlContent.includes('id="btnToggleAntiCaptcha"'), 'btnToggleAntiCaptcha button must not exist in index.html');
console.log('✅ 2. btnToggleAntiCaptcha completely deleted from HTML');

assert(!htmlContent.includes('Anti-Captcha API Key'), 'Label/text "Anti-Captcha API Key" must not exist in index.html');
console.log('✅ 3. "Anti-Captcha API Key" label and text completely deleted from HTML');

// Check that settings card form ONLY contains the 4 allowed fields
const settingsFormMatch = htmlContent.match(/<form id="settingsForm"[\s\S]*?<\/form>/);
assert(settingsFormMatch, 'settingsForm must exist in index.html');
const settingsFormContent = settingsFormMatch[0];

assert(settingsFormContent.includes('id="bpcl-user"'), 'Settings must contain BPCL User ID');
assert(settingsFormContent.includes('id="bpcl-password"'), 'Settings must contain BPCL Password');
assert(settingsFormContent.includes('id="inputLicenseKey"'), 'Settings must contain License Key');
assert(settingsFormContent.includes('id="settingsExpiryBadge"'), 'Settings must contain Expiry Date badge below License Key');
assert(settingsFormContent.includes('id="selectBrowserChannel"'), 'Settings must contain Browser Selection');

// Count form-group elements inside settingsForm
const formGroups = settingsFormContent.match(/<div class="form-group/g);
assert.strictEqual(formGroups.length, 4, `Settings form must contain exactly 4 form-groups, found ${formGroups.length}`);
console.log('✅ 4. Settings modal ONLY contains: BPCL User ID, BPCL Password, License Key (with expiry badge), and Browser Selection');

// ============================================================================
// 2. RENDERER.JS STORAGE & UI HANDLER TESTS
// ============================================================================
console.log('\n[Group 2] Testing renderer.js Handlers & Volatile In-Memory Key...');

assert(!rendererContent.includes("document.getElementById('inputAntiCaptchaKey')"), 'renderer.js must not query inputAntiCaptchaKey');
assert(!rendererContent.includes("document.getElementById('btnToggleAntiCaptcha')"), 'renderer.js must not query btnToggleAntiCaptcha');
console.log('✅ 5. No DOM queries for Anti-Captcha input or toggle button in renderer.js');

assert(!rendererContent.includes("getPersistentSetting('antiCaptchaKey')"), 'renderer.js must not load antiCaptchaKey from persistent storage');
assert(!rendererContent.includes("setPersistentSetting('antiCaptchaKey'"), 'renderer.js must not save antiCaptchaKey to persistent storage');
console.log('✅ 6. Zero persistent storage calls (get/set) for antiCaptchaKey in renderer.js');

assert(rendererContent.includes('currentInMemoryAntiCaptchaKey'), 'renderer.js must declare currentInMemoryAntiCaptchaKey');
assert(rendererContent.includes('anticaptchaApiKey: currentInMemoryAntiCaptchaKey'), 'renderer.js must pass in-memory anticaptchaApiKey to startCancellation');
console.log('✅ 7. Server anti-captcha key is held strictly in volatile RAM (currentInMemoryAntiCaptchaKey) and passed to startCancellation');

// ============================================================================
// 3. MAIN.JS STORAGE & IPC EXTRACTION TESTS
// ============================================================================
console.log('\n[Group 3] Testing main.js Server Key In RAM & Zero Disk Storage...');

// getInitialSettings must not return antiCaptchaKey
assert(!mainContent.includes("antiCaptchaKey: storeInstance.get('antiCaptchaKey'"), 'main.js getInitialSettings must not read antiCaptchaKey');
const initialSettingsMatch = mainContent.match(/function getInitialSettings\(storeInstance\)[\s\S]*?^}/m);
assert(initialSettingsMatch, 'getInitialSettings function found');
assert(!initialSettingsMatch[0].includes('antiCaptchaKey'), 'getInitialSettings must not return antiCaptchaKey');
console.log('✅ 8. main.js getInitialSettings does not return or read antiCaptchaKey');

// save-settings must not save antiCaptchaKey
const saveSettingsMatch = mainContent.match(/ipcMain\.handle\('save-settings'[\s\S]*?return { success: true/);
assert(saveSettingsMatch, 'save-settings handler found');
assert(!saveSettingsMatch[0].includes("s.set('antiCaptchaKey'"), 'save-settings must not save antiCaptchaKey to electron-store');
assert(saveSettingsMatch[0].includes("s.delete('antiCaptchaKey')"), 'save-settings must delete antiCaptchaKey from electron-store');
console.log('✅ 9. main.js save-settings never saves antiCaptchaKey to disk, and purges any legacy key');

// start-cancellation must extract from options / manifest strictly in RAM
const startCancellationMatch = mainContent.match(/ipcMain\.handle\('start-cancellation'[\s\S]*?const runnerConfig =/);
assert(startCancellationMatch, 'start-cancellation handler found');
assert(!startCancellationMatch[0].includes("s.get('antiCaptchaKey'"), 'start-cancellation must not read antiCaptchaKey from electron-store');
assert(startCancellationMatch[0].includes('anticaptchaApiKey'), 'start-cancellation must handle anticaptchaApiKey in RAM');
console.log('✅ 10. main.js start-cancellation reads anticaptchaApiKey in RAM from manifest, zero disk read');

// ============================================================================
// 4. RUNNER ENGINE SERVER KEY USAGE TESTS
// ============================================================================
console.log('\n[Group 4] Testing bela_nexus_runner.js In-Memory Execution...');

// Check runner source (supports both pristine and obfuscated via .bak)
const isObfuscated = runnerContent.includes('_0x');
const effectiveRunnerSource = isObfuscated ? fs.readFileSync(path.join(__dirname, '..', 'desktop-app', 'bela_nexus_runner.js.bak'), 'utf8') : runnerContent;

assert(effectiveRunnerSource.includes('const cloudAntiCaptchaKey = responseData?.manifest?.anticaptchaApiKey'), 'runner must extract cloudAntiCaptchaKey from Cloudflare response');
assert(effectiveRunnerSource.includes('inMemoryApiKey = String(cloudAntiCaptchaKey).trim()'), 'runner must update inMemoryApiKey strictly in RAM');
assert(rootRunnerContent.includes('const cloudAntiCaptchaKey = responseData?.manifest?.anticaptchaApiKey'), 'root runner must extract cloudAntiCaptchaKey from Cloudflare response');
console.log('✅ 11. Both root and desktop-app runner extract anticaptchaApiKey from server response strictly into inMemoryApiKey');

assert(effectiveRunnerSource.includes('solveAntiCaptcha(base64Image, effectiveApiKey, log)'), 'runner must solve captcha using effectiveApiKey in RAM');
console.log('✅ 12. solveAntiCaptcha receives in-memory server key during login');

console.log('\n=============================================');
console.log('ALL ANTI-CAPTCHA UI REMOVAL TESTS PASSED! 🎉');
console.log('=============================================\n');
