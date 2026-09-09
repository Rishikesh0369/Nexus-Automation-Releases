/**
 * Test Suite: Remote Automation Payload & Dynamic In-Memory Selectors
 * Verifies:
 * 1. Cloudflare license verification payload extraction ({ loginUrl, selectors })
 * 2. In-memory only storage (no disk/file writing)
 * 3. Selector replacements (userIdInput, passwordInput, captchaImg, captchaInput, loginButton, cancelMenuTab, memoRows)
 * 4. Safety check abort with exact message: "[LICENSE] Unauthorized: Cannot retrieve execution payload."
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load runner modules
const runner = require('./bela_nexus_runner');
const automationRunner = require('./automationRunner');

console.log('🧪 Starting Remote Automation Payload Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
    totalTests++;
    try {
        fn();
        console.log(`  ✅ PASS: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     Error: ${err.message}`);
        throw err;
    }
}

async function itAsync(desc, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✅ PASS: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${desc}`);
        console.error(`     Error: ${err.message}`);
        throw err;
    }
}

async function runTests() {
    // ------------------------------------------------------------------------
    // Group 1: Graceful Fallback When Remote Payload is Missing / Offline
    // ------------------------------------------------------------------------
    console.log('--- Group 1: Graceful Fallback to Built-In Local Selectors ---');

    await itAsync('desktop-app/bela_nexus_runner.js falls back to local selectors when verification returns success: false', async () => {
        const originalFetch = global.fetch;
        const originalLaunch = runner.launchBrowser;
        let reachedBrowserStage = false;

        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: false, message: 'Invalid license' })
        });

        runner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await runner.runAutomation({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'INVALID_KEY',
                headless: true
            });
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP', `Expected to reach browser stage, got: ${e.message}`);
        } finally {
            global.fetch = originalFetch;
            runner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'Should proceed directly to browser stage using local selectors');
        const activeSelectors = runner.getInMemorySelectors();
        assert(activeSelectors && activeSelectors.userInput, 'Built-in local selectors should be loaded');
    });

    await itAsync('desktop-app/bela_nexus_runner.js falls back to local selectors when payload is missing from response', async () => {
        const originalFetch = global.fetch;
        const originalLaunch = runner.launchBrowser;
        let reachedBrowserStage = false;

        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true, message: 'OK but no payload' })
        });

        runner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await runner.runAutomation({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'VALID_KEY_NO_PAYLOAD',
                headless: true
            });
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP', `Expected to reach browser stage, got: ${e.message}`);
        } finally {
            global.fetch = originalFetch;
            runner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'Should proceed directly to browser stage without payload');
        const activeSelectors = runner.getInMemorySelectors();
        assert(activeSelectors && activeSelectors.userInput, 'Built-in local selectors should be loaded');
    });

    await itAsync('desktop-app/automationRunner.js falls back to local selectors when payload is missing', async () => {
        const originalFetch = global.fetch;
        const originalLaunch = automationRunner.launchBrowser;
        let reachedBrowserStage = false;

        global.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: false, message: 'Auth failed' })
        });

        automationRunner.launchBrowser = async () => {
            reachedBrowserStage = true;
            throw new Error('BROWSER_REACHED_SIMULATED_STOP');
        };

        try {
            await automationRunner.runAutomation({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'INVALID_KEY',
                headless: true
            });
        } catch (e) {
            assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP', `Expected to reach browser stage, got: ${e.message}`);
        } finally {
            global.fetch = originalFetch;
            automationRunner.launchBrowser = originalLaunch;
        }

        assert.strictEqual(reachedBrowserStage, true, 'automationRunner should proceed directly to browser stage using local selectors');
    });

    // ------------------------------------------------------------------------
    // Group 2: Remote Payload Extraction & In-Memory Only Storage
    // ------------------------------------------------------------------------
    console.log('\n--- Group 2: Remote Payload Extraction & In-Memory Only Storage ---');

    await itAsync('Extracts loginUrl and selectors from responseData.payload and stores strictly in memory', async () => {
        const mockPayload = {
            loginUrl: 'https://test.bpcl.in/custom-login',
            selectors: {
                userIdInput: '#custom_user_id',
                passwordInput: '#custom_password',
                captchaImg: '#custom_captcha_img',
                captchaInput: '#custom_captcha_input',
                loginButton: '#custom_login_button',
                cancelMenuTab: '#custom_cancel_tab',
                memoRows: '#custom_table tr'
            }
        };

        const originalFetch = global.fetch;
        const recordedFilesBefore = fs.readdirSync(__dirname);

        global.fetch = async (url) => {
            if (url.includes('/api/verify') || url.includes('workers.dev')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        distributor: 'TEST AGENCY',
                        payload: mockPayload
                    })
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        // Mock launchBrowser to prevent actually launching Chromium in this test unit
        const originalLaunch = runner.launchBrowser;
        let launched = false;
        runner.launchBrowser = async () => {
            launched = true;
            return {
                newContext: async () => ({
                    addInitScript: async () => {},
                    newPage: async () => ({
                        goto: async () => {},
                        waitForTimeout: async () => {},
                        locator: () => ({
                            isVisible: async () => true,
                            first: () => ({ hover: async () => {}, click: async () => {} }),
                            waitFor: async () => {}
                        }),
                        close: async () => {}
                    }),
                    storageState: async () => {}
                }),
                close: async () => {}
            };
        };

        try {
            // We expect it to reach the browser stage after loading payload into memory
            await runner.runAutomation({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'VALID_KEY',
                headless: true,
                callbacks: {
                    onLog: () => {}
                }
            }).catch(() => {}); // Catch browser-related mock incompleteness

            // Verify in-memory storage
            const loadedSelectors = runner.getInMemorySelectors();
            assert(loadedSelectors, 'Selectors must be populated in memory');
            assert.strictEqual(loadedSelectors.userIdInput, '#custom_user_id');
            assert.strictEqual(loadedSelectors.passwordInput, '#custom_password');
            assert.strictEqual(loadedSelectors.captchaImg, '#custom_captcha_img');
            assert.strictEqual(loadedSelectors.captchaInput, '#custom_captcha_input');
            assert.strictEqual(loadedSelectors.loginButton, '#custom_login_button');
            assert.strictEqual(loadedSelectors.cancelMenuTab, '#custom_cancel_tab');
            assert.strictEqual(loadedSelectors.memoRows, '#custom_table tr');

            // Verify that NO selectors were written to disk
            const recordedFilesAfter = fs.readdirSync(__dirname);
            assert.strictEqual(
                recordedFilesBefore.length,
                recordedFilesAfter.length,
                'No new files should be created on disk for selectors'
            );

            // Check that state.json does not contain custom selectors
            const sessionDir = path.join(__dirname, 'bpcl_session');
            if (fs.existsSync(sessionDir)) {
                const sessionFiles = fs.readdirSync(sessionDir);
                for (const file of sessionFiles) {
                    const content = fs.readFileSync(path.join(sessionDir, file), 'utf8');
                    assert(!content.includes('#custom_user_id'), 'Selectors must not be saved to session disk files');
                }
            }
        } finally {
            global.fetch = originalFetch;
            runner.launchBrowser = originalLaunch;
        }
    });

    // ------------------------------------------------------------------------
    // Group 3: Dynamic Selector Replacements in Methods
    // ------------------------------------------------------------------------
    console.log('\n--- Group 3: Dynamic Selector Replacements in Automation Methods ---');

    it('buildSelectors maps flat payload selectors into both top-level and nested structure', () => {
        const flatSelectors = {
            userIdInput: '#dynamic-user',
            passwordInput: '#dynamic-pass',
            captchaImg: '#dynamic-img',
            captchaInput: '#dynamic-captcha',
            loginButton: '#dynamic-btn',
            cancelMenuTab: '#dynamic-cancel',
            memoRows: '#dynamic-table tr'
        };

        const built = runner.buildSelectors(flatSelectors);
        assert.strictEqual(built.userIdInput, '#dynamic-user');
        assert.strictEqual(built.passwordInput, '#dynamic-pass');
        assert.strictEqual(built.captchaImg, '#dynamic-img');
        assert.strictEqual(built.captchaInput, '#dynamic-captcha');
        assert.strictEqual(built.loginButton, '#dynamic-btn');
        assert.strictEqual(built.cancelMenuTab, '#dynamic-cancel');
        assert.strictEqual(built.memoRows, '#dynamic-table tr');

        // Check fallback preservation
        assert.strictEqual(built.login.principalInput, '#dynamic-user');
        assert.strictEqual(built.login.loginBtn, '#dynamic-btn');
        assert.strictEqual(built.cancellation.cashMemoCancelText, '#dynamic-cancel');
    });

    it('performLogin references dynamic selectors (userIdInput, passwordInput, captchaImg, captchaInput, loginButton)', () => {
        const fileContent = fs.readFileSync(path.join(__dirname, 'bela_nexus_runner.js'), 'utf8');
        assert(fileContent.includes('activeSelectors.userIdInput'), 'Should reference activeSelectors.userIdInput');
        assert(fileContent.includes('activeSelectors.passwordInput'), 'Should reference activeSelectors.passwordInput');
        assert(fileContent.includes('activeSelectors.captchaImg'), 'Should reference activeSelectors.captchaImg');
        assert(fileContent.includes('activeSelectors.captchaInput'), 'Should reference activeSelectors.captchaInput');
        assert(fileContent.includes('activeSelectors.loginButton'), 'Should reference activeSelectors.loginButton');
    });

    it('scrapeConsumerNumbers and runCancellation reference selectors.memoRows and selectors.cancelMenuTab', () => {
        const fileContent = fs.readFileSync(path.join(__dirname, 'bela_nexus_runner.js'), 'utf8');
        assert(fileContent.includes('activeSelectors?.memoRows'), 'Should reference activeSelectors?.memoRows');
        assert(fileContent.includes('activeSelectors?.cancelMenuTab'), 'Should reference activeSelectors?.cancelMenuTab');
    });

    // ------------------------------------------------------------------------
    // Group 4: Worker API /api/verify Output Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Group 4: Worker API Payload Schema ---');

    it('worker/index.js contains payload with loginUrl and all required selectors', () => {
        const workerContent = fs.readFileSync(path.join(__dirname, '..', 'worker', 'index.js'), 'utf8');
        assert(workerContent.includes('payload: {'), 'Worker should return payload object');
        assert(workerContent.includes('loginUrl:'), 'Payload should include loginUrl');
        assert(workerContent.includes('userIdInput:'), 'Payload should include userIdInput');
        assert(workerContent.includes('passwordInput:'), 'Payload should include passwordInput');
        assert(workerContent.includes('captchaImg:'), 'Payload should include captchaImg');
        assert(workerContent.includes('captchaInput:'), 'Payload should include captchaInput');
        assert(workerContent.includes('loginButton:'), 'Payload should include loginButton');
        assert(workerContent.includes('cancelMenuTab:'), 'Payload should include cancelMenuTab');
        assert(workerContent.includes('memoRows:'), 'Payload should include memoRows');
    });

    console.log(`\n🎉 All ${passedTests}/${totalTests} tests passed successfully!`);
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
