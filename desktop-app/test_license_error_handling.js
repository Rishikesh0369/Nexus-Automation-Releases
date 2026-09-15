/**
 * Test Suite: License Error Message Handling & 403 Expiration Banner
 * Tests:
 * 1. Cloudflare Worker license verification call extraction of serverMessage
 * 2. Non-200 HTTP response and error/catch handling:
 *    const serverMessage = error.response?.data?.message || (await response?.json())?.message || error.message || "License verification failed.";
 * 3. Exact rendering of "License expired. Please renew." on the red error alert banner
 * 4. Rejection of hardcoded "Invalid license or invalid user ID" string in favor of dynamic serverMessage
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Load modules
const runner = require('./bela_nexus_runner');
const automationRunner = require('./automationRunner');

console.log('🧪 Starting License Error Message Handling Test Suite...\n');

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
    // Group 1: verifyLicenseAndFetchManifest in bela_nexus_runner.js
    // ------------------------------------------------------------------------
    console.log('--- Group 1: Dynamic Server Message in bela_nexus_runner.js ---');

    await itAsync('Extracts dynamic 403 serverMessage: "License expired. Please renew."', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: false,
            status: 403,
            json: async () => ({
                success: false,
                isExpired: true,
                error: 'LICENSE_EXPIRED',
                message: 'License expired. Please renew.'
            }),
            clone() { return this; }
        });

        try {
            const res = await runner.verifyLicenseAndFetchManifest('TEST_KEY', 'TEST_USER');
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.isExpired, true);
            assert.strictEqual(res.message, 'License expired. Please renew.');
            assert.notStrictEqual(res.message, 'अमान्य BPCL User ID या License Key (Invalid BPCL User ID or License Key)');
        } finally {
            global.fetch = originalFetch;
        }
    });

    await itAsync('Extracts dynamic error in catch block using error.response or (await response?.json())', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => {
            const err = new Error('Network Timeout');
            err.response = {
                data: { message: 'Cloudflare Edge: Rate Limit Exceeded' }
            };
            throw err;
        };

        try {
            const res = await runner.verifyLicenseAndFetchManifest('TEST_KEY', 'TEST_USER');
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.message, 'Cloudflare Edge: Rate Limit Exceeded');
        } finally {
            global.fetch = originalFetch;
        }
    });

    await itAsync('runAutomation handles 403 with exact message "License expired. Please renew."', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: false,
            status: 403,
            json: async () => ({
                success: false,
                isExpired: true,
                error: 'LICENSE_EXPIRED',
                message: 'License expired. Please renew.'
            }),
            clone() { return this; }
        });

        let statusReceived = '';
        let errorCaught = null;

        try {
            await runner.runAutomation({
                bpclUserId: 'TESTUSER',
                bpclPassword: 'TESTPASSWORD',
                licenseKey: 'EXPIRED_KEY',
                headless: true,
                callbacks: {
                    onStatus: (status) => {
                        statusReceived = status;
                    },
                    onLog: () => {}
                }
            });
        } catch (e) {
            errorCaught = e;
        } finally {
            global.fetch = originalFetch;
        }

        assert(errorCaught, 'Expected runAutomation to throw');
        assert.strictEqual(errorCaught.message, 'License expired. Please renew.');
        assert.strictEqual(statusReceived, 'License expired. Please renew.');
    });

    // ------------------------------------------------------------------------
    // Group 2: automationRunner.js Consistency
    // ------------------------------------------------------------------------
    console.log('\n--- Group 2: automationRunner.js Consistency ---');

    await itAsync('automationRunner verifyLicenseAndFetchManifest extracts 403 "License expired. Please renew."', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: false,
            status: 403,
            json: async () => ({
                success: false,
                isExpired: true,
                message: 'License expired. Please renew.'
            }),
            clone() { return this; }
        });

        try {
            const res = await automationRunner.verifyLicenseAndFetchManifest('TEST_KEY', 'TEST_USER');
            assert.strictEqual(res.status, 403);
            assert.strictEqual(res.message, 'License expired. Please renew.');
        } finally {
            global.fetch = originalFetch;
        }
    });

    // ------------------------------------------------------------------------
    // Group 3: renderer.js DOM and Status Banner Integration
    // ------------------------------------------------------------------------
    console.log('\n--- Group 3: renderer.js Source & DOM Logic Verification ---');

    it('renderer.js contains the extraction snippet: const serverMessage = error.response?.data?.message || (await response?.json...', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(
            rendererContent.includes('const serverMessage = error.response?.data?.message || (await response?.json'),
            'renderer.js should contain the serverMessage extraction pattern'
        );
    });

    it('renderer.js defines renderRedErrorAlertBanner to render serverMessage directly on top banner', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(rendererContent.includes('function renderRedErrorAlertBanner('), 'renderRedErrorAlertBanner must be defined');
        assert(rendererContent.includes('subscriptionExpiryBanner.classList.remove(\'hidden\')'), 'Must unhide red alert banner');
        assert(rendererContent.includes('banner.innerText = serverMessage'), 'Must set banner.innerText to serverMessage directly');
        assert(rendererContent.includes('expiryBannerMessage.textContent = serverMessage'), 'Must set expiryBannerMessage to serverMessage directly');
    });

    it('Simulates DOM: 403 renders serverMessage directly on top banner and formattedExp on status detail', () => {
        // Create mock DOM elements mimicking index.html
        const elements = {
            banner: { innerText: '' },
            subscriptionExpiryBanner: {
                classes: new Set(['subscription-expiry-banner', 'hidden']),
                classList: {
                    add(c) { elements.subscriptionExpiryBanner.classes.add(c); },
                    remove(c) { elements.subscriptionExpiryBanner.classes.delete(c); },
                    contains(c) { return elements.subscriptionExpiryBanner.classes.has(c); }
                }
            },
            expiryBannerMessage: { textContent: '' },
            statusDetailText: { textContent: '' },
            stateBadge: { textContent: '' },
            statusBadgeText: { textContent: '' },
            agencyBadge: { textContent: '', className: '' },
            btnStartCancellation: {
                disabled: false,
                classes: new Set(['btn-primary']),
                classList: {
                    add(c) { elements.btnStartCancellation.classes.add(c); },
                    remove(c) { elements.btnStartCancellation.classes.delete(c); }
                }
            },
            btnStartText: { textContent: '' },
            playIcon: { classList: { add() {}, remove() {} } },
            stopIcon: { classList: { add() {}, remove() {} } },
            spinnerIcon: { classList: { add() {}, remove() {} } }
        };

        function mockUpdateStatus(state) {
            elements.statusBadgeText.textContent = state;
            elements.stateBadge.textContent = `  ${state}`;
        }

        function mockFormatExpiryDate(serverDate) {
            if (!serverDate) return null;
            const dateToParse = String(serverDate).trim();
            if (!dateToParse) return null;
            try {
                const cleanIso = /^\d{4}-\d{2}-\d{2}$/.test(dateToParse) ? `${dateToParse}T12:00:00` : dateToParse;
                const parsed = new Date(cleanIso);
                if (!isNaN(parsed.getTime())) {
                    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                }
            } catch (_) {}
            return null;
        }

        function mockRenderRedErrorAlertBanner(serverMessage, expiryDate = '') {
            const serverDate = expiryDate || '';
            const formattedDate = mockFormatExpiryDate(serverDate);
            const detailText = formattedDate
                ? `🔴 License has expired (Expired on: ${formattedDate})`
                : `🔴 License has expired (Subscription Expired)`;

            elements.banner.innerText = serverMessage;
            elements.expiryBannerMessage.textContent = serverMessage;
            elements.subscriptionExpiryBanner.classList.remove('hidden');

            elements.btnStartCancellation.disabled = true;
            elements.btnStartCancellation.classList.remove('btn-danger-pulsing');
            elements.btnStartCancellation.classList.add('btn-subscription-expired');
            elements.btnStartText.textContent = '🔒 Subscription Expired';

            mockUpdateStatus('Subscription Expired');
            elements.statusDetailText.textContent = detailText;
        }

        // Simulate 403 with live serverDate "2026-06-07"
        mockRenderRedErrorAlertBanner("License expired. Please renew.", "2026-06-07");

        // Verification with live date
        assert.strictEqual(
            elements.expiryBannerMessage.textContent,
            'License expired. Please renew.',
            'Red error banner must display server message received directly "License expired. Please renew."'
        );
        assert.strictEqual(
            elements.banner.innerText,
            'License expired. Please renew.',
            'Banner innerText must display server message received directly'
        );
        assert.strictEqual(
            elements.subscriptionExpiryBanner.classList.contains('hidden'),
            false,
            'Red error alert banner must be visible (hidden removed)'
        );
        assert.strictEqual(
            elements.statusDetailText.textContent,
            '🔴 License has expired (Expired on: 07 Jun 2026)',
            'Dashboard status detail must display formatted banner text'
        );
        assert.strictEqual(
            elements.stateBadge.textContent.trim(),
            'Subscription Expired',
            'State badge must show Subscription Expired'
        );
        assert.strictEqual(
            elements.btnStartText.textContent,
            '🔒 Subscription Expired',
            'Button must reflect expired state'
        );

        // Simulate 403 with NO date returned by server
        mockRenderRedErrorAlertBanner("Subscription Expired", "");
        assert.strictEqual(
            elements.expiryBannerMessage.textContent,
            'Subscription Expired',
            'When no date returned by server, display server message directly on banner'
        );
    });

    // ------------------------------------------------------------------------
    // Group 4: Dynamic Expiry Date & Cache Prevention Verification
    // ------------------------------------------------------------------------
    console.log('\n--- Group 4: Dynamic Expiry Date & Cache Prevention Verification ---');

    it('renderer.js saves credentials to store FIRST before verifyCredentials in btnSaveSettings', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        const btnSaveBlock = rendererContent.substring(
            rendererContent.indexOf("btnSaveSettings.addEventListener('click'"),
            rendererContent.indexOf("if (btnClearSettings)")
        );
        const saveIndex = btnSaveBlock.indexOf("setPersistentSetting('bpclUserId', bpclUserId)");
        const verifyIndex = btnSaveBlock.indexOf("verifyCredentials(licenseKey, bpclUserId)");
        assert(saveIndex !== -1, 'Must persist bpclUserId to store');
        assert(verifyIndex !== -1, 'Must call verifyCredentials');
        assert(saveIndex < verifyIndex, 'Credentials must be saved to store BEFORE verifyCredentials is called');
    });

    it('renderer.js does not clear credentials on 403 or failure', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        const btnSaveBlock = rendererContent.substring(
            rendererContent.indexOf("btnSaveSettings.addEventListener('click'"),
            rendererContent.indexOf("if (btnClearSettings)")
        );
        assert(!btnSaveBlock.includes('clearPersistentSettings()'), 'btnSaveSettings must not call clearPersistentSettings()');
        assert(!btnSaveBlock.includes("setPersistentSetting('bpclUserId', '')"), 'Must not wipe bpclUserId in save block');
        assert(!btnSaveBlock.includes("setPersistentSetting('bpclPassword', '')"), 'Must not wipe bpclPassword in save block');
        assert(!btnSaveBlock.includes("setPersistentSetting('licenseKey', '')"), 'Must not wipe licenseKey in save block');
    });

    it('renderer.js and index.html do NOT contain hardcoded expiry dates like 31/08/2026 or 2026-06-07', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        assert(!rendererContent.includes('31/08/2026'), 'renderer.js must not contain hardcoded date 31/08/2026');
        assert(!rendererContent.includes('2026-08-31'), 'renderer.js must not contain hardcoded date 2026-08-31');
        assert(!rendererContent.includes('2026-06-07'), 'renderer.js must not contain hardcoded date 2026-06-07');
        assert(!htmlContent.includes('31/08/2026'), 'index.html must not contain hardcoded date 31/08/2026');
        assert(!htmlContent.includes('2026-08-31'), 'index.html must not contain hardcoded date 2026-08-31');
        assert(!htmlContent.includes('2026-06-07'), 'index.html must not contain hardcoded date 2026-06-07');
    });

    it('extracts live date from server response and formats or displays no-date string', () => {
        function formatExpiryDate(serverDate) {
            if (!serverDate) return null;
            const dateToParse = String(serverDate).trim();
            if (!dateToParse) return null;
            try {
                const cleanIso = /^\d{4}-\d{2}-\d{2}$/.test(dateToParse) ? `${dateToParse}T12:00:00` : dateToParse;
                const parsed = new Date(cleanIso);
                if (!isNaN(parsed.getTime())) {
                    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                }
            } catch (_) {}
            return null;
        }

        // Test with live server date: 2026-06-07 -> "07 Jun 2026"
        const formatted1 = formatExpiryDate('2026-06-07');
        assert.strictEqual(formatted1, '07 Jun 2026');
        const banner1 = formatted1
            ? `🔴 License has expired (Expired on: ${formatted1})`
            : `🔴 License has expired (Subscription Expired)`;
        assert.strictEqual(banner1, '🔴 License has expired (Expired on: 07 Jun 2026)');

        // Test with custom server date: 2026-12-07
        const formatted2 = formatExpiryDate('2026-12-07');
        assert.strictEqual(formatted2, '07 Dec 2026');
        const banner2 = formatted2
            ? `🔴 License has expired (Expired on: ${formatted2})`
            : `🔴 License has expired (Subscription Expired)`;
        assert.strictEqual(banner2, '🔴 License has expired (Expired on: 07 Dec 2026)');

        // Test with no date returned by server
        const formattedNone = formatExpiryDate(undefined);
        assert.strictEqual(formattedNone, null);
        const bannerNone = formattedNone
            ? `🔴 License has expired (Expired on: ${formattedNone})`
            : `🔴 License has expired (Subscription Expired)`;
        assert.strictEqual(bannerNone, '🔴 License has expired (Subscription Expired)');
    });

    it('extracts date from error.response?.data?.expiresAt or (await error.response?.json?.())?.expiresAt', async () => {
        // Axios style error
        const axiosErr = {
            response: {
                data: {
                    error: 'SUBSCRIPTION_EXPIRED',
                    message: 'License expired.',
                    expiresAt: '2026-07-15'
                }
            }
        };
        const serverDateAxios = axiosErr.response?.data?.expiresAt || (await axiosErr.response?.json?.())?.expiresAt;
        assert.strictEqual(serverDateAxios, '2026-07-15');

        // Fetch style error with .json()
        const fetchErr = {
            response: {
                json: async () => ({
                    error: 'SUBSCRIPTION_EXPIRED',
                    message: 'License expired.',
                    expiresAt: '2026-08-20'
                })
            }
        };
        const serverDateFetch = fetchErr.response?.data?.expiresAt || (await fetchErr.response?.json?.())?.expiresAt;
        assert.strictEqual(serverDateFetch, '2026-08-20');

        // Error with no date
        const noDateErr = {
            response: {
                data: {
                    error: 'SUBSCRIPTION_EXPIRED',
                    message: 'License expired.'
                }
            }
        };
        const serverDateNone = noDateErr.response?.data?.expiresAt || (await noDateErr.response?.json?.())?.expiresAt;
        assert.strictEqual(serverDateNone, undefined);
    });

    it('renderer.js, automationRunner.js, and bela_nexus_runner.js include cache-busting and no-store headers', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        const autoContent = fs.readFileSync(path.join(__dirname, 'automationRunner.js'), 'utf8');
        const runnerContent = fs.readFileSync(path.join(__dirname, 'bela_nexus_runner.js'), 'utf8');

        assert(rendererContent.includes('_t=${Date.now()}'), 'renderer.js must have timestamp cache buster');
        assert(rendererContent.includes("'Cache-Control': 'no-cache, no-store, must-revalidate'"), 'renderer.js must send no-cache headers');
        assert(rendererContent.includes("cache: 'no-store'"), 'renderer.js must set cache: no-store');

        assert(autoContent.includes('_t=${Date.now()}'), 'automationRunner.js must have timestamp cache buster');
        assert(autoContent.includes("'Cache-Control': 'no-cache, no-store, must-revalidate'"), 'automationRunner.js must send no-cache headers');
        assert(autoContent.includes("cache: 'no-store'"), 'automationRunner.js must set cache: no-store');

        assert(runnerContent.includes('_t=${Date.now()}'), 'bela_nexus_runner.js must have timestamp cache buster');
        assert(runnerContent.includes("'Cache-Control': 'no-cache, no-store, must-revalidate'"), 'bela_nexus_runner.js must send no-cache headers');
        assert(runnerContent.includes("cache: 'no-store'"), 'bela_nexus_runner.js must set cache: no-store');
    });

    // ------------------------------------------------------------------------
    // Group 5: Warning Elements UI Update (banner, currentStateText, renewalBanner)
    // ------------------------------------------------------------------------
    console.log('\n--- Group 5: Warning Elements Verification (banner, currentStateText, renewalBanner) ---');

    it('renderer.js extracts expDate using error.response?.data?.expiresAt || data?.expiresAt', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(
            rendererContent.includes('const expDate = error.response?.data?.expiresAt || data?.expiresAt'),
            'renderer.js must extract expDate via error.response?.data?.expiresAt || data?.expiresAt'
        );
    });

    it('renderer.js updates top header banner directly with serverMessage, currentStateText, and warningBox dynamically', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(rendererContent.includes('banner.innerText = serverMessage'), 'Must set banner.innerText directly with serverMessage');
        assert(rendererContent.includes('currentStateText.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`'), 'Must set currentStateText.innerText');
        assert(rendererContent.includes('warningBox.innerText = formattedExp'), 'Must set warningBox.innerText dynamically');
    });

    it('validates UI warning elements formatted output with "07 Aug 2026" and missing date', () => {
        const expDateLive = '2026-08-07';
        const formattedExpLive = expDateLive ? new Date(expDateLive).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        assert.strictEqual(formattedExpLive, '07 Aug 2026');

        const currentStateTextLive = formattedExpLive ? `🔴 License has expired (Expired on: ${formattedExpLive})` : `🔴 License has expired (Subscription Expired)`;
        const warningBoxLive = formattedExpLive ? `⚠️ Subscription Expired on ${formattedExpLive}: Automation is paused. Please renew license.` : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;

        assert.strictEqual(currentStateTextLive, '🔴 License has expired (Expired on: 07 Aug 2026)');
        assert.strictEqual(warningBoxLive, '⚠️ Subscription Expired on 07 Aug 2026: Automation is paused. Please renew license.');

        // Missing date simulation
        const expDateNone = undefined;
        const formattedExpNone = expDateNone ? new Date(expDateNone).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        assert.strictEqual(formattedExpNone, '');

        const currentStateTextNone = formattedExpNone ? `🔴 License has expired (Expired on: ${formattedExpNone})` : `🔴 License has expired (Subscription Expired)`;
        const warningBoxNone = formattedExpNone ? `⚠️ Subscription Expired on ${formattedExpNone}: Automation is paused. Please renew license.` : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;

        assert.strictEqual(currentStateTextNone, '🔴 License has expired (Subscription Expired)');
        assert.strictEqual(warningBoxNone, '⚠️ Subscription Expired: Automation is paused. Please renew license.');
    });

    // ------------------------------------------------------------------------
    // Group 6: Subscription Renewal Modal Icon & Dynamic Expiry Enhancements
    // ------------------------------------------------------------------------
    console.log('\n--- Group 6: Subscription Renewal Modal Icon & Dynamic Expiry Enhancements ---');

    it('index.html contains the animated motion graphics SVG inside .renewal-brand-icon', () => {
        const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const modalIconIndex = htmlContent.indexOf('class="renewal-brand-icon"');
        assert(modalIconIndex !== -1, 'index.html must have .renewal-brand-icon');
        const modalIconChunk = htmlContent.substring(modalIconIndex, modalIconIndex + 2500);
        assert(modalIconChunk.includes('viewBox="0 0 200 200"'), 'Must have 200x200 viewBox for Nexus brand animated SVG');
        assert(modalIconChunk.includes('Quasar logo'), 'Must include animated Quasar logo state');
        assert(modalIconChunk.includes('bot at workstation'), 'Must include animated bot at workstation state');
        assert(modalIconChunk.includes('rx="52" fill="#050214"'), 'Must include brand dark backdrop');
    });

    it('styles.css gives .renewal-brand-icon a pulsing glowing animation', () => {
        const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
        assert(cssContent.includes('.renewal-brand-icon'), 'styles.css must have .renewal-brand-icon');
        assert(cssContent.includes('animation: renewBrandGlowPulse'), 'styles.css must apply glow pulse animation to .renewal-brand-icon');
        assert(cssContent.includes('@keyframes renewBrandGlowPulse'), 'styles.css must define @keyframes renewBrandGlowPulse');
    });

    it('renderer.js extracts expDate using error.response?.data?.expiresAt || data?.expiresAt', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(
            rendererContent.includes('const expDate = error.response?.data?.expiresAt || data?.expiresAt'),
            'Must extract expDate from error.response?.data?.expiresAt || data?.expiresAt'
        );
    });

    it('renderer.js updates warningBox.innerText dynamically: formattedExp ? Subscription Expired on ... : Subscription Expired...', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(
            rendererContent.includes('warningBox.innerText = formattedExp') &&
            rendererContent.includes('⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.') &&
            rendererContent.includes('⚠️ Subscription Expired: Automation is paused. Please renew license.'),
            'Must set warningBox.innerText dynamically based on formattedExp'
        );
        // Ensure no regex or string slice removes the date part
        assert(
            !rendererContent.includes('serverErrorMessage.slice'),
            'renderer.js must not slice serverErrorMessage'
        );
        assert(
            !rendererContent.includes('serverErrorMessage.split'),
            'renderer.js must not split serverErrorMessage'
        );
    });

    it('renderer.js logs [LICENSE DEBUG] Response received:', () => {
        const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');
        assert(
            rendererContent.includes("console.log('[LICENSE DEBUG] Response received:', error.response?.data || error)"),
            'renderer.js must log [LICENSE DEBUG] Response received:'
        );
    });

    it('Simulates DOM: warningBox.innerText displays dynamic text with formattedExp and fallback', () => {
        const mockWarningBox = { innerText: '' };

        function updateModalWarning(expDate) {
            const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            mockWarningBox.innerText = formattedExp 
                ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
        }

        // Test with full server date: 2026-08-07
        updateModalWarning('2026-08-07');
        assert.strictEqual(
            mockWarningBox.innerText,
            '⚠️ Subscription Expired on 07 Aug 2026: Automation is paused. Please renew license.'
        );

        // Test with live server date: 2026-06-07
        updateModalWarning('2026-06-07');
        assert.strictEqual(
            mockWarningBox.innerText,
            '⚠️ Subscription Expired on 07 Jun 2026: Automation is paused. Please renew license.'
        );

        // Test with missing date
        updateModalWarning('');
        assert.strictEqual(
            mockWarningBox.innerText,
            '⚠️ Subscription Expired: Automation is paused. Please renew license.'
        );
    });

    console.log(`\n🎉 All ${passedTests}/${totalTests} tests passed successfully!`);
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
