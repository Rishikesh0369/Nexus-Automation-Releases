const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('?? Starting Cloudflare In-Memory Selectors Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ? PASS: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ? FAIL: ${desc}`);
        console.error(`     Error: ${err.message}`);
        throw err;
    }
}

async function itAsync(desc, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ? PASS: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ? FAIL: ${desc}`);
        console.error(`     Error: ${err.message}`);
        throw err;
    }
}

const runner = require('../desktop-app/bela_nexus_runner');
const automationRunner = require('../desktop-app/automationRunner');

async function runAllTests() {
    // ========================================================================
    // Group 1: Graceful Fallback in startCancellationProcess
    // ========================================================================
    console.log('--- Group 1: Graceful Fallback to Local Selectors on Missing/Empty Cloud Selectors ---');

    await itAsync('startCancellationProcess falls back to local selectors when selectors is missing/undefined', async () => {
        const originalLaunch = runner.launchBrowser;
        let reachedBrowserStage = false;
        runner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await runner.startCancellationProcess({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'TEST_KEY'
            });
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP');
        } finally {
            runner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'Should proceed to browser stage');
        const activeSelectors = runner.getInMemorySelectors();
        assert(activeSelectors && activeSelectors.userInput, 'Built-in local selectors should be loaded');
    });

    await itAsync('startCancellationProcess falls back to local selectors when selectors is null', async () => {
        const originalLaunch = runner.launchBrowser;
        let reachedBrowserStage = false;
        runner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await runner.startCancellationProcess({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'TEST_KEY'
            }, null);
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP');
        } finally {
            runner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'Should proceed to browser stage');
        const activeSelectors = runner.getInMemorySelectors();
        assert(activeSelectors && activeSelectors.userInput, 'Built-in local selectors should be loaded');
    });

    await itAsync('startCancellationProcess falls back to local selectors when selectors is an empty object {}', async () => {
        const originalLaunch = runner.launchBrowser;
        let reachedBrowserStage = false;
        runner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await runner.startCancellationProcess({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'TEST_KEY'
            }, {});
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP');
        } finally {
            runner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'Should proceed to browser stage');
        const activeSelectors = runner.getInMemorySelectors();
        assert(activeSelectors && activeSelectors.userInput, 'Built-in local selectors should be loaded');
    });

    await itAsync('automationRunner.startCancellationProcess also falls back to local selectors when selectors is missing/empty', async () => {
        const originalLaunch = automationRunner.launchBrowser;
        let reachedBrowserStage = false;
        automationRunner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await automationRunner.startCancellationProcess({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'TEST_KEY'
            });
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP');
        } finally {
            automationRunner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'automationRunner should proceed to browser stage');
    });

    // ========================================================================
    // Group 2: Dynamic Selectors Mapping in buildSelectors
    // ========================================================================
    console.log('\n--- Group 2: Dynamic Selectors Mapping in buildSelectors ---');

    it('buildSelectors properly binds all requested dynamic keys', () => {
        const testSelectors = {
            userInput: '#my_custom_user',
            passInput: '#my_custom_password',
            captchaImg: '#my_custom_captcha_img',
            captchaInput: '#my_custom_captcha_input',
            loginBtn: '#my_custom_login_button',
            memoSearchInput: '#my_custom_memo_search',
            cancelMemoBtn: '#my_custom_cancel_memo_btn',
            confirmDialogYes: '#my_custom_confirm_yes'
        };

        const built = runner.buildSelectors(testSelectors);

        // Verify primary keys
        assert.strictEqual(built.userInput, '#my_custom_user');
        assert.strictEqual(built.passInput, '#my_custom_password');
        assert.strictEqual(built.captchaImg, '#my_custom_captcha_img');
        assert.strictEqual(built.captchaInput, '#my_custom_captcha_input');
        assert.strictEqual(built.loginBtn, '#my_custom_login_button');
        assert.strictEqual(built.memoSearchInput, '#my_custom_memo_search');
        assert.strictEqual(built.cancelMemoBtn, '#my_custom_cancel_memo_btn');
        assert.strictEqual(built.confirmDialogYes, '#my_custom_confirm_yes');

        // Verify backward-compatibility aliases
        assert.strictEqual(built.userIdInput, '#my_custom_user');
        assert.strictEqual(built.passwordInput, '#my_custom_password');
        assert.strictEqual(built.loginButton, '#my_custom_login_button');
        assert.strictEqual(built.consumerNumberInput, '#my_custom_memo_search');
        assert.strictEqual(built.cancelLink, '#my_custom_cancel_memo_btn');
        assert.strictEqual(built.proceedBtn, '#my_custom_confirm_yes');
    });

    // ========================================================================
    // Group 3: Automation Flow Selector Replacements
    // ========================================================================
    console.log('\n--- Group 3: Automation Flow Selector Replacements ---');

    it('bela_nexus_runner.js uses dynamic keys across performLogin and runCancellation', () => {
        let runnerCode = fs.readFileSync(path.join(__dirname, '..', 'desktop-app', 'bela_nexus_runner.js'), 'utf8');
        if (runnerCode.includes('_0x')) {
            const bakPath = path.join(__dirname, '..', 'desktop-app', 'bela_nexus_runner.js.bak');
            if (fs.existsSync(bakPath)) {
                runnerCode = fs.readFileSync(bakPath, 'utf8');
            }
        }

        // Login selectors
        assert(runnerCode.includes('activeSelectors.userInput'), 'performLogin must use activeSelectors.userInput');
        assert(runnerCode.includes('activeSelectors.passInput'), 'performLogin must use activeSelectors.passInput');
        assert(runnerCode.includes('activeSelectors.captchaImg'), 'performLogin must use activeSelectors.captchaImg');
        assert(runnerCode.includes('activeSelectors.captchaInput'), 'performLogin must use activeSelectors.captchaInput');
        assert(runnerCode.includes('activeSelectors.loginBtn'), 'performLogin must use activeSelectors.loginBtn');

        // Memo search / cancel selectors
        assert(runnerCode.includes('activeSelectors.memoSearchInput'), 'runCancellation must use activeSelectors.memoSearchInput');
        assert(runnerCode.includes('activeSelectors.cancelMemoBtn'), 'runCancellation must use activeSelectors.cancelMemoBtn');
        assert(runnerCode.includes('activeSelectors.confirmDialogYes'), 'runCancellation must use activeSelectors.confirmDialogYes');
    });

    // ========================================================================
    // Group 4: In-Memory Only Storage (Zero Disk / LocalStorage Writing)
    // ========================================================================
    console.log('\n--- Group 4: Volatile RAM & Zero Disk Storage Verification ---');

    it('renderer.js manages currentInMemorySelectors strictly in volatile RAM', () => {
        const rendererCode = fs.readFileSync(path.join(__dirname, '..', 'desktop-app', 'renderer.js'), 'utf8');

        // Verifies variable exists
        assert(rendererCode.includes('let currentInMemorySelectors = null;'), 'renderer.js must have volatile RAM variable');

        // Verifies it is passed to startCancellation
        assert(rendererCode.includes('selectors: currentInMemorySelectors'), 'renderer.js must pass selectors to startCancellation');

        // Verifies selectors are NEVER saved to persistent storage
        assert(!rendererCode.includes("setPersistentSetting('selectors'"), 'selectors must never be stored in persistent settings');
        assert(!rendererCode.includes('localStorage.setItem("selectors"'), 'selectors must never be stored in localStorage');
        assert(!rendererCode.includes("localStorage.setItem('selectors'"), 'selectors must never be stored in localStorage');
    });

    it('main.js extracts selectors from IPC options and passes to startCancellationProcess without saving to disk/store', () => {
        const mainCode = fs.readFileSync(path.join(__dirname, '..', 'desktop-app', 'main.js'), 'utf8');

        // Verifies startCancellationProcess is imported from runner
        assert(mainCode.includes("const { startCancellationProcess } = require('./bela_nexus_runner');"), 'main.js must import startCancellationProcess');

        // Verifies selectors are extracted from options
        assert(mainCode.includes('const inMemorySelectors = (options && options.selectors'), 'main.js must extract inMemorySelectors');

        // Verifies selectors are passed directly into startCancellationProcess
        assert(mainCode.includes('await startCancellationProcess(runnerConfig, inMemorySelectors)'), 'main.js must pass selectors to startCancellationProcess');

        // Verifies selectors are NEVER written to electron store
        assert(!mainCode.includes("s.set('selectors'"), 'selectors must never be saved to electron-store');
        assert(!mainCode.includes('store.set("selectors"'), 'selectors must never be saved to electron-store');
    });

    // ========================================================================
    // Group 5: Cloudflare Worker Manifest Selectors Schema
    // ========================================================================
    console.log('\n--- Group 5: Cloudflare Worker Manifest Selectors Schema ---');

    it('worker/index.js returns all dynamic selector keys in payload and manifest', () => {
        const workerCode = fs.readFileSync(path.join(__dirname, '..', 'worker', 'index.js'), 'utf8');

        // Verify keys exist in worker
        assert(workerCode.includes('userInput:'), 'Worker must return userInput');
        assert(workerCode.includes('passInput:'), 'Worker must return passInput');
        assert(workerCode.includes('captchaImg:'), 'Worker must return captchaImg');
        assert(workerCode.includes('captchaInput:'), 'Worker must return captchaInput');
        assert(workerCode.includes('loginBtn:'), 'Worker must return loginBtn');
        assert(workerCode.includes('memoSearchInput:'), 'Worker must return memoSearchInput');
        assert(workerCode.includes('cancelMemoBtn:'), 'Worker must return cancelMemoBtn');
        assert(workerCode.includes('confirmDialogYes:'), 'Worker must return confirmDialogYes');
    });

    console.log(`\n?? All ${passedTests}/${totalTests} tests passed successfully!`);
}

runAllTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
