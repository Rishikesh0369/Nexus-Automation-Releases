const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Stable Execution Flow Verification Test...\n');

// 1. Check desktop-app/bela_nexus_runner.js
const runnerPath = path.resolve(__dirname, '../desktop-app/bela_nexus_runner.js');
let runnerContent = fs.readFileSync(runnerPath, 'utf8');
if (runnerContent.includes('_0x')) {
    const bakPath = path.resolve(__dirname, '../desktop-app/bela_nexus_runner.js.bak');
    if (fs.existsSync(bakPath)) runnerContent = fs.readFileSync(bakPath, 'utf8');
}

console.log('Checking Section 1: Browser Setup & Background Speed...');
assert(runnerContent.includes("'--disable-background-timer-throttling'"), 'Missing --disable-background-timer-throttling');
assert(runnerContent.includes("'--disable-backgrounding-occluded-windows'"), 'Missing --disable-backgrounding-occluded-windows');
assert(runnerContent.includes("'--disable-renderer-backgrounding'"), 'Missing --disable-renderer-backgrounding');
assert(runnerContent.includes("'--disable-features=CalculateNativeWinOcclusion'"), 'Missing --disable-features=CalculateNativeWinOcclusion');
assert(runnerContent.includes("'--no-sandbox'"), 'Missing --no-sandbox');
assert(runnerContent.includes("'--disable-dev-shm-usage'"), 'Missing --disable-dev-shm-usage');
assert(!runnerContent.includes("context.route('**/*'"), 'Asset-blocking route must be removed');
assert(runnerContent.includes("contextOptions.storageState = stateFile"), 'Session restoration via state.json must remain');
console.log('  ✅ PASS: Browser launch flags, asset unblocking, and session restoration verified.');

console.log('\nChecking Section 2: Revert Cancellation Engine to Stable Timing...');
assert(runnerContent.includes("newPage.waitForLoadState('networkidle')"), 'Must use waitForLoadState networkidle');
assert(!runnerContent.includes("newPage.waitForResponse(resp => resp.url().includes('econnect')"), 'Fast waitForResponse must be removed from cancellation loop');
assert(runnerContent.includes("this?.abortController?.signal?.aborted"), 'Abort signal check must be present');
assert(runnerContent.includes("totalCancelledCount++"), 'totalCancelledCount must be incremented on success');
assert(runnerContent.includes("if (typeof this?.sendLog === 'function') this.sendLog"), 'this.sendLog must be supported');
assert(runnerContent.includes("await newPage.waitForLoadState('networkidle');"), 'Catch block must wait for networkidle');
console.log('  ✅ PASS: Cancellation engine timing and error recovery verified.');

console.log('\nChecking Section 3: Benchmark Timer & Completion Toast Hook...');
assert(runnerContent.includes("cancellationStartTime = Date.now()"), 'Start timer after scraping verified');
assert(runnerContent.includes("cancellationEndTime = Date.now()"), 'Stop timer after cancellation verified');
assert(runnerContent.includes("timeTakenFormatted = formatDuration(elapsedMs)"), 'Duration formatting verified');
assert(runnerContent.includes("ipcRenderer.send('show-completion-toast'"), 'Completion toast hook verified');
console.log('  ✅ PASS: Benchmark timer & toast hook verified.');

console.log('\nChecking Section 4: Electron Main Verification...');
const mainPath = path.resolve(__dirname, '../desktop-app/main.js');
const mainContent = fs.readFileSync(mainPath, 'utf8');
assert(mainContent.includes("backgroundThrottling: false"), 'backgroundThrottling: false must remain in main.js');
assert(mainContent.includes("const toastWidth = 320;"), 'toastWidth must be 320');
assert(mainContent.includes("const toastHeight = 116;"), 'toastHeight must be 116');
assert(mainContent.includes("const marginY = 10;"), 'marginY must be 10');
console.log('  ✅ PASS: Electron main backgroundThrottling and toast dimensions verified.');

console.log('\nChecking Critical Preservation Rules...');
const toastPath = path.resolve(__dirname, '../desktop-app/toast.html');
const toastContent = fs.readFileSync(toastPath, 'utf8');
assert(toastContent.includes('class="app-logo"'), 'toast.html logo must remain');
assert(toastContent.includes('Nexus Automation'), 'toast.html title case must remain');

const pkgPath = path.resolve(__dirname, '../desktop-app/package.json');
const pkgContent = fs.readFileSync(pkgPath, 'utf8');
assert(pkgContent.includes("node archive_build.js && node obfuscate.js && electron-builder --win"), 'Build pipeline must remain intact');

console.log('  ✅ PASS: Preservation rules verified.');

console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
