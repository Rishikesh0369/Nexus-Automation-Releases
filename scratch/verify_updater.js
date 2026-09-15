const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Verifying Redesigned Update Ready Modal, Dynamic Version Badge, and Restart-and-Install...');

// 1. Verify desktop-app/index.html
const htmlPath = path.join(__dirname, '..', 'desktop-app', 'index.html');
const htmlCode = fs.readFileSync(htmlPath, 'utf-8');

assert(htmlCode.includes('id="updateModalOverlay"'), 'index.html must have updateModalOverlay');
assert(htmlCode.includes('class="update-modal-card"'), 'index.html must have update-modal-card');
assert(htmlCode.includes('id="modalTargetVersion"'), 'index.html must have modalTargetVersion badge');
assert(htmlCode.includes('id="modalCurrentVersion"'), 'index.html must have modalCurrentVersion');
assert(htmlCode.includes('id="modalTargetVersionHighlight"'), 'index.html must have modalTargetVersionHighlight');
assert(htmlCode.includes('id="btnUpdateLater"'), 'index.html must have btnUpdateLater');
assert(htmlCode.includes('id="btnUpdateApply"'), 'index.html must have btnUpdateApply');

console.log('✅ index.html structure verified!');

// 2. Verify desktop-app/styles.css
const cssPath = path.join(__dirname, '..', 'desktop-app', 'styles.css');
const cssCode = fs.readFileSync(cssPath, 'utf-8');

assert(cssCode.includes('.update-modal-overlay'), 'styles.css must style .update-modal-overlay');
assert(cssCode.includes('.update-modal-card'), 'styles.css must style .update-modal-card');
assert(cssCode.includes('.modal-glow-bg'), 'styles.css must style .modal-glow-bg');
assert(cssCode.includes('.version-target-badge'), 'styles.css must style .version-target-badge');
assert(cssCode.includes('.version-flow-pill'), 'styles.css must style .version-flow-pill');
assert(cssCode.includes('.btn-modal-apply'), 'styles.css must style .btn-modal-apply');

console.log('✅ styles.css dark-glassmorphism styling verified!');

// 3. Verify desktop-app/main.js
const mainPath = path.join(__dirname, '..', 'desktop-app', 'main.js');
const mainCode = fs.readFileSync(mainPath, 'utf-8');

assert(mainCode.includes('autoUpdater.autoInstallOnAppQuit = true'), 'autoUpdater.autoInstallOnAppQuit must be set to true');
assert(mainCode.includes("ipcMain.handle('get-update-status'"), 'get-update-status handler must exist');
assert(mainCode.includes("currentVersion: currVer"), 'get-update-status must return currentVersion');
assert(mainCode.includes("autoUpdater.quitAndInstall(true, true)"), 'quitAndInstall(true, true) must be called');

console.log('✅ main.js verification passed!');

// 4. Verify desktop-app/renderer.js
const rendererPath = path.join(__dirname, '..', 'desktop-app', 'renderer.js');
const rendererCode = fs.readFileSync(rendererPath, 'utf-8');

assert(rendererCode.includes('updateModalOverlay'), 'renderer.js must recognize updateModalOverlay');
assert(rendererCode.includes('modalTargetVersion'), 'renderer.js must bind modalTargetVersion');
assert(rendererCode.includes('modalCurrentVersion'), 'renderer.js must bind modalCurrentVersion');
assert(rendererCode.includes('updateModalVersionDisplay'), 'renderer.js must define updateModalVersionDisplay');
assert(rendererCode.includes('btnUpdateApply'), 'renderer.js must bind btnUpdateApply');

console.log('✅ renderer.js verification passed!');
console.log('🚀 ALL COMPONENT ASSERTIONS PASSED SUCCESSFULLY!');
