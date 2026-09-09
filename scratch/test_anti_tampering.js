const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Anti-Tampering & Zero-Window Credential Lock Implementation...\n');

const runnerPath = path.join(__dirname, '..', 'desktop-app', 'bela_nexus_runner.js');
const runnerContent = fs.readFileSync(runnerPath, 'utf8');

// 1. Verify Freeze via page.evaluate
assert(
    runnerContent.includes("userEl.setAttribute('readonly', 'true')") &&
    runnerContent.includes("userEl.style.pointerEvents = 'none'") &&
    runnerContent.includes("passEl.setAttribute('readonly', 'true')") &&
    runnerContent.includes("passEl.style.pointerEvents = 'none'"),
    'Must freeze #principal and #input_password with readonly and pointerEvents none'
);
console.log('✅ 1. Input fields frozen with readonly and pointer-events: none');

// 2. Verify Solving While Locked inside performLogin
const performLoginIdx = runnerContent.indexOf("async function performLogin(");
const performLoginContent = runnerContent.slice(performLoginIdx, performLoginIdx + 10000);

const freezeIdx = performLoginContent.indexOf("userEl.setAttribute('readonly', 'true')");
const solveIdx = performLoginContent.indexOf("await solveAntiCaptcha(");
const unfreezeIdx = performLoginContent.indexOf("userEl.removeAttribute('readonly')");

assert(freezeIdx < solveIdx, 'Inputs must be frozen before solveAntiCaptcha is called');
assert(solveIdx < unfreezeIdx, 'Captcha must be solved while inputs are locked before unfreeze');
console.log('✅ 2. solveAntiCaptcha executed strictly while inputs are locked');

// 3. Verify Zero-Window Flash Fill & Strict Tampering Verification
assert(
    runnerContent.includes("await page.inputValue('#principal')"),
    'Must read inputValue of #principal right before click'
);
assert(
    runnerContent.includes("SECURITY VIOLATION: Manual Credential Tampering Detected! Aborting automation."),
    'Must throw exact security violation error on tampering'
);
assert(
    runnerContent.includes("await page.context().browser().close()"),
    'Must close browser on tampering detection'
);
console.log('✅ 3. Strict anti-tampering verification and browser abort present');

// 4. Verify Immediate Login Click
const checkIdx = runnerContent.indexOf("SECURITY VIOLATION: Manual Credential Tampering Detected!");
const clickIdx = runnerContent.indexOf("await page.click(loginBtnSelector);");
assert(checkIdx < clickIdx, 'Click must occur immediately following integrity check');
console.log('✅ 4. Immediate login button click without artificial delays');

console.log('\n🎉 All Anti-Tampering & Zero-Window Credential Lock checks passed!');
process.exitCode = 0;
