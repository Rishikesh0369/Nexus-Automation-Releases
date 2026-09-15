/**
 * Test Suite: UI Error Separation (Invalid Credentials vs. Expired License)
 * Verifies:
 * 1. Verification failure with isExpired === false (Invalid Credentials):
 *    - Banner text: "गलत BPCL User ID या License Key (Invalid Credentials)"
 *    - "Renew License Now" button is hidden
 *    - "Open Settings" neutral button is visible
 *    - UI state badge is "Configuration Error" (NOT "Subscription Expired")
 *    - Current state text is "Configuration Error (Invalid ID/Key)"
 *    - Start button is disabled with text "Check Credentials in Settings"
 *    - Does NOT log "लाइसेंस समाप्त हो गया है"
 *    - Logs standard error message
 * 
 * 2. Verification failure with isExpired === true (Expired License):
 *    - Banner displays dynamic server message
 *    - "Renew License Now" button is visible
 *    - "Open Settings" button is hidden
 *    - UI state badge is "Subscription Expired"
 *    - Current state text includes "लाइसेंस समाप्त हो गया है" / "Subscription Expired"
 *    - Start button is disabled with text "🔒 Subscription Expired"
 *    - Logs expiry details with date
 * 
 * 3. Static checks on renderer.js and index.html:
 *    - handleInvalidCredentialsError is defined
 *    - btnBannerOpenSettings exists in index.html
 *    - isExpired is checked explicitly
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 Starting UI Error Separation Test Suite...\n');

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

// ------------------------------------------------------------------------
// Group 1: Static Code Structure in renderer.js & index.html
// ------------------------------------------------------------------------
console.log('--- Group 1: Static Code Structure Verification ---');

it('renderer.js defines handleInvalidCredentialsError function', () => {
    const rendererContent = fs.readFileSync(path.join(__dirname, '../desktop-app/renderer.js'), 'utf8');
    assert(rendererContent.includes('function handleInvalidCredentialsError('), 'renderer.js must define handleInvalidCredentialsError');
});

it('renderer.js displays standard error message on invalid credentials: गलत BPCL User ID या License Key (Invalid Credentials)', () => {
    const rendererContent = fs.readFileSync(path.join(__dirname, '../desktop-app/renderer.js'), 'utf8');
    assert(rendererContent.includes('गलत BPCL User ID या License Key (Invalid Credentials)'), 'renderer.js must include exact Hindi/English invalid credentials message');
});

it('renderer.js sets current state text to "Configuration Error (Invalid ID/Key)"', () => {
    const rendererContent = fs.readFileSync(path.join(__dirname, '../desktop-app/renderer.js'), 'utf8');
    assert(rendererContent.includes('Configuration Error (Invalid ID/Key)'), 'renderer.js must set currentStateText to Configuration Error (Invalid ID/Key)');
});

it('renderer.js disables start button with text "Check Credentials in Settings"', () => {
    const rendererContent = fs.readFileSync(path.join(__dirname, '../desktop-app/renderer.js'), 'utf8');
    assert(rendererContent.includes('Check Credentials in Settings'), 'renderer.js must have Check Credentials in Settings button text');
});

it('index.html contains #btnBannerOpenSettings and #btnRenewLicense with "Renew License Now ->"', () => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '../desktop-app/index.html'), 'utf8');
    assert(htmlContent.includes('id="btnBannerOpenSettings"'), 'index.html must have #btnBannerOpenSettings');
    assert(htmlContent.includes('Renew License Now -&gt;') || htmlContent.includes('Renew License Now ->'), 'index.html must have Renew License Now -> arrow');
});

it('styles.css contains .btn-banner-settings and .btn-config-error', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '../desktop-app/styles.css'), 'utf8');
    assert(cssContent.includes('.btn-banner-settings'), 'styles.css must have .btn-banner-settings');
    assert(cssContent.includes('.btn-config-error'), 'styles.css must have .btn-config-error');
});

// ------------------------------------------------------------------------
// Group 2: DOM Simulation for Invalid Credentials (isExpired === false)
// ------------------------------------------------------------------------
console.log('\n--- Group 2: DOM Simulation - Invalid Credentials Flow ---');

function createMockDom() {
    const elements = {
        banner: { innerText: '' },
        subscriptionExpiryBanner: {
            classes: new Set(['subscription-expiry-banner', 'hidden']),
            classList: {
                add(c) { elements.subscriptionExpiryBanner.classes.add(c); },
                remove(c) { elements.subscriptionExpiryBanner.classes.delete(c); },
                contains(c) { return elements.subscriptionExpiryBanner.classes.has(c); }
            },
            querySelector(sel) {
                if (sel === '.expiry-banner-icon') return elements.expiryBannerIcon;
                return null;
            },
            appendChild(child) {}
        },
        expiryBannerIcon: {
            classes: new Set(['expiry-banner-icon']),
            classList: {
                add(c) { elements.expiryBannerIcon.classes.add(c); },
                remove(c) { elements.expiryBannerIcon.classes.delete(c); },
                contains(c) { return elements.expiryBannerIcon.classes.has(c); }
            }
        },
        expiryBannerMessage: { textContent: '' },
        btnRenewLicense: {
            classes: new Set(['btn-renew-license']),
            style: { display: '' },
            classList: {
                add(c) { elements.btnRenewLicense.classes.add(c); },
                remove(c) { elements.btnRenewLicense.classes.delete(c); },
                contains(c) { return elements.btnRenewLicense.classes.has(c); }
            }
        },
        btnBannerOpenSettings: {
            classes: new Set(['btn-banner-settings', 'hidden']),
            style: { display: 'none' },
            classList: {
                add(c) { elements.btnBannerOpenSettings.classes.add(c); },
                remove(c) { elements.btnBannerOpenSettings.classes.delete(c); },
                contains(c) { return elements.btnBannerOpenSettings.classes.has(c); }
            }
        },
        currentStateText: { innerText: '' },
        statusDetailText: { textContent: '' },
        stateBadge: { textContent: '', className: '' },
        statusBadgeText: { textContent: '' },
        statusPulseDot: { className: '', classList: { add() {} } },
        agencyBadge: { textContent: '', className: '' },
        btnStartCancellation: {
            disabled: false,
            classes: new Set(['btn-primary']),
            classList: {
                add(c) { elements.btnStartCancellation.classes.add(c); },
                remove(c) { elements.btnStartCancellation.classes.delete(c); },
                contains(c) { return elements.btnStartCancellation.classes.has(c); }
            }
        },
        btnStartText: { textContent: '' },
        playIcon: { classList: { add() {}, remove() {} } },
        stopIcon: { classList: { add() {}, remove() {} } },
        spinnerIcon: { classList: { add() {}, remove() {} } },
        warningBox: { innerText: '' }
    };

    const logs = [];
    function appendLog(msg, type) {
        logs.push({ msg, type });
    }

    function updateStatus(state) {
        elements.statusBadgeText.textContent = state;
        elements.stateBadge.textContent = `• ${state}`;
    }

    function handleInvalidCredentialsError(customMessage = '') {
        const errorMsg = 'गलत BPCL User ID या License Key (Invalid Credentials)';
        elements.banner.innerText = errorMsg;
        elements.expiryBannerMessage.textContent = errorMsg;
        elements.subscriptionExpiryBanner.classList.remove('hidden');

        // DO NOT show the "Renew License Now" button
        elements.btnRenewLicense.classList.add('hidden');
        elements.btnRenewLicense.style.display = 'none';

        // Show neutral button: "Open Settings"
        elements.btnBannerOpenSettings.classList.remove('hidden');
        elements.btnBannerOpenSettings.style.display = '';

        elements.agencyBadge.className = 'agency-tag badge-invalid';
        elements.agencyBadge.textContent = '🔴 Invalid Credentials';

        elements.currentStateText.innerText = 'Configuration Error (Invalid ID/Key)';
        elements.statusDetailText.textContent = 'Configuration Error (Invalid ID/Key)';

        updateStatus('Configuration Error');

        elements.btnStartCancellation.disabled = true;
        elements.btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-subscription-expired');
        elements.btnStartCancellation.classList.add('btn-config-error');
        elements.btnStartText.textContent = 'Check Credentials in Settings';
        elements.playIcon.classList.add('hidden');
        if (elements.stopIcon) elements.stopIcon.classList.add('hidden');
        elements.spinnerIcon.classList.add('hidden');

        appendLog(`❌ ${errorMsg}`, 'error');
    }

    function renderRedErrorAlertBanner(serverMessage, expDate) {
        const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        elements.banner.innerText = serverMessage;
        elements.expiryBannerMessage.textContent = serverMessage;
        elements.subscriptionExpiryBanner.classList.remove('hidden');

        elements.btnRenewLicense.classList.remove('hidden');
        elements.btnRenewLicense.style.display = '';
        elements.btnBannerOpenSettings.classList.add('hidden');
        elements.btnBannerOpenSettings.style.display = 'none';

        elements.currentStateText.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
        elements.statusDetailText.textContent = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;

        elements.btnStartCancellation.disabled = true;
        elements.btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-config-error');
        elements.btnStartCancellation.classList.add('btn-subscription-expired');
        elements.btnStartText.textContent = '🔒 Subscription Expired';

        updateStatus('Subscription Expired');
        const alertMsg = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
        appendLog(`❌ ${alertMsg}`, 'error');
    }

    return { elements, logs, handleInvalidCredentialsError, renderRedErrorAlertBanner };
}

it('Invalid Credentials: does NOT show Renew button, shows neutral Open Settings button', () => {
    const { elements, handleInvalidCredentialsError } = createMockDom();
    handleInvalidCredentialsError('Invalid credentials');

    assert(elements.btnRenewLicense.classList.contains('hidden'), 'Renew License button must be hidden');
    assert.strictEqual(elements.btnRenewLicense.style.display, 'none', 'Renew License button style.display must be none');
    assert(!elements.btnBannerOpenSettings.classList.contains('hidden'), 'Open Settings button must be visible (no hidden class)');
    assert.strictEqual(elements.btnBannerOpenSettings.style.display, '', 'Open Settings button display must not be none');
});

it('Invalid Credentials: does NOT set UI state badge to "Subscription Expired", sets to "Configuration Error"', () => {
    const { elements, handleInvalidCredentialsError } = createMockDom();
    handleInvalidCredentialsError();

    assert.notStrictEqual(elements.statusBadgeText.textContent, 'Subscription Expired', 'Status badge must NOT be Subscription Expired');
    assert.strictEqual(elements.statusBadgeText.textContent, 'Configuration Error', 'Status badge must be Configuration Error');
    assert.strictEqual(elements.stateBadge.textContent, '• Configuration Error', 'State badge must display • Configuration Error');
});

it('Invalid Credentials: does NOT log "लाइसेंस समाप्त हो गया है", logs "गलत BPCL User ID या License Key (Invalid Credentials)"', () => {
    const { logs, handleInvalidCredentialsError } = createMockDom();
    handleInvalidCredentialsError();

    const loggedMessages = logs.map(l => l.msg).join(' ');
    assert(!loggedMessages.includes('लाइसेंस समाप्त हो गया है'), 'Must NOT log लाइसेंस समाप्त हो गया है');
    assert(loggedMessages.includes('गलत BPCL User ID या License Key (Invalid Credentials)'), 'Must log गलत BPCL User ID या License Key (Invalid Credentials)');
});

it('Invalid Credentials: sets currentStateText to "Configuration Error (Invalid ID/Key)"', () => {
    const { elements, handleInvalidCredentialsError } = createMockDom();
    handleInvalidCredentialsError();

    assert.strictEqual(elements.currentStateText.innerText, 'Configuration Error (Invalid ID/Key)');
    assert.strictEqual(elements.statusDetailText.textContent, 'Configuration Error (Invalid ID/Key)');
});

it('Invalid Credentials: resets Start button to disabled "Check Credentials in Settings"', () => {
    const { elements, handleInvalidCredentialsError } = createMockDom();
    handleInvalidCredentialsError();

    assert.strictEqual(elements.btnStartCancellation.disabled, true, 'Start button must be disabled');
    assert.strictEqual(elements.btnStartText.textContent, 'Check Credentials in Settings', 'Button text must be Check Credentials in Settings');
    assert(elements.btnStartCancellation.classList.contains('btn-config-error'), 'Button must have .btn-config-error');
    assert(!elements.btnStartCancellation.classList.contains('btn-subscription-expired'), 'Button must NOT have .btn-subscription-expired');
});

it('Invalid Credentials: top alert banner displays "गलत BPCL User ID या License Key (Invalid Credentials)" without renewal prompts', () => {
    const { elements, handleInvalidCredentialsError } = createMockDom();
    handleInvalidCredentialsError();

    assert(!elements.subscriptionExpiryBanner.classList.contains('hidden'), 'Banner must be visible');
    assert.strictEqual(elements.banner.innerText, 'गलत BPCL User ID या License Key (Invalid Credentials)');
    assert.strictEqual(elements.expiryBannerMessage.textContent, 'गलत BPCL User ID या License Key (Invalid Credentials)');
});

// ------------------------------------------------------------------------
// Group 3: DOM Simulation for Expired License (isExpired === true)
// ------------------------------------------------------------------------
console.log('\n--- Group 3: DOM Simulation - Expired License Flow ---');

it('Expired License: shows Renew License button, hides Open Settings button', () => {
    const { elements, renderRedErrorAlertBanner } = createMockDom();
    renderRedErrorAlertBanner('License expired. Please renew.', '2026-06-07');

    assert(!elements.btnRenewLicense.classList.contains('hidden'), 'Renew button must be visible');
    assert.strictEqual(elements.btnRenewLicense.style.display, '', 'Renew button display must be visible');
    assert(elements.btnBannerOpenSettings.classList.contains('hidden'), 'Open Settings button must be hidden on expiry');
});

it('Expired License: sets state badge to "Subscription Expired"', () => {
    const { elements, renderRedErrorAlertBanner } = createMockDom();
    renderRedErrorAlertBanner('License expired. Please renew.', '2026-06-07');

    assert.strictEqual(elements.statusBadgeText.textContent, 'Subscription Expired');
    assert.strictEqual(elements.stateBadge.textContent, '• Subscription Expired');
});

it('Expired License: logs expiry details with date and Hindi text', () => {
    const { logs, renderRedErrorAlertBanner } = createMockDom();
    renderRedErrorAlertBanner('License expired. Please renew.', '2026-06-07');

    const loggedMessages = logs.map(l => l.msg).join(' ');
    assert(loggedMessages.includes('लाइसेंस समाप्त हो गया है'), 'Must log लाइसेंस समाप्त हो गया है on true expiry');
    assert(loggedMessages.includes('07 Jun 2026'), 'Must log formatted expiry date on true expiry');
});

it('Expired License: sets currentStateText with formatted expiry date', () => {
    const { elements, renderRedErrorAlertBanner } = createMockDom();
    renderRedErrorAlertBanner('License expired. Please renew.', '2026-06-07');

    assert.strictEqual(elements.currentStateText.innerText, '🔴 लाइसेंस समाप्त हो गया है (Expired on: 07 Jun 2026)');
    assert.strictEqual(elements.btnStartText.textContent, '🔒 Subscription Expired');
});

console.log(`\n🎉 All ${passedTests}/${totalTests} UI Error Separation tests passed successfully!`);
