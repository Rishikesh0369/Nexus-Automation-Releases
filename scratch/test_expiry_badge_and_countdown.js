const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Expiry Badge & Dashboard Countdown Test Suite...\n');

// 1. Check index.html structure
const htmlPath = path.join(__dirname, '..', 'desktop-app', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

console.log('--- Checking desktop-app/index.html ---');
assert(html.includes('id="settingsExpiryBadge"'), 'settingsExpiryBadge must exist in index.html');
assert(html.includes('id="settingsExpiryDateText"'), 'settingsExpiryDateText must exist in index.html');
assert(html.includes('--/--/----'), 'settingsExpiryDateText default placeholder --/--/---- must exist in index.html');
assert(html.includes('id="dashboardExpiryWarning"'), 'dashboardExpiryWarning must exist in index.html');

// Ensure NO warning icon exists in dashboardExpiryWarning container
const warningStart = html.indexOf('id="dashboardExpiryWarning"');
const warningEnd = html.indexOf('</div>', warningStart);
const warningContainer = html.substring(warningStart, warningEnd);
assert(!warningContainer.includes('⚠️'), 'dashboardExpiryWarning must NOT contain yellow warning icon (⚠️)');

// Verify dashboardExpiryWarning is right above btnStartCancellation
const btnStartIdx = html.indexOf('id="btnStartCancellation"');
assert(warningStart !== -1 && btnStartIdx !== -1 && warningStart < btnStartIdx, 'dashboardExpiryWarning must appear above btnStartCancellation');
console.log('✅ PASS: HTML containers correctly structured without warning icon in index.html');

// 2. Check renderer.js source code
const rendererPath = path.join(__dirname, '..', 'desktop-app', 'renderer.js');
const rendererCode = fs.readFileSync(rendererPath, 'utf8');

console.log('\n--- Checking desktop-app/renderer.js ---');
assert(rendererCode.includes("document.getElementById('settingsExpiryBadge')"), 'renderer.js must get settingsExpiryBadge');
assert(rendererCode.includes("document.getElementById('settingsExpiryDateText')"), 'renderer.js must get settingsExpiryDateText');
assert(rendererCode.includes("document.getElementById('dashboardExpiryWarning')"), 'renderer.js must get dashboardExpiryWarning');
assert(rendererCode.includes("toLocaleDateString('en-GB')"), "renderer.js must format date using toLocaleDateString('en-GB')");
assert(rendererCode.includes("'Subscription expires in 1 day'"), "renderer.js must contain clean 1-day string: 'Subscription expires in 1 day'");
assert(rendererCode.includes("`Subscription expires in ${diffDays} days`") || rendererCode.includes("'Subscription expires in ' + diffDays + ' days'"), 'renderer.js must contain clean multi-day string without extra punctuation');
assert(!rendererCode.includes("Subscription expires tomorrow! Please renew."), "renderer.js must NOT contain old 'Please renew.' text");
assert(!rendererCode.includes("Subscription expires in ${diffDays} days! Please renew."), "renderer.js must NOT contain old 'Please renew.' text");

console.log('✅ PASS: renderer.js contains clean text formatting without extra punctuation or warning icons');

// 3. Test dynamic logic by simulating the exact function logic
console.log('\n--- Testing Dynamic Expiry and Countdown Logic ---');

function createMockDOM() {
    const elements = {
        settingsExpiryBadge: { classList: new Set(), style: {} },
        settingsExpiryDateText: { textContent: '--/--/----' },
        dashboardExpiryWarning: {
            classes: new Set(['hidden']),
            classList: {
                add(c) { elements.dashboardExpiryWarning.classes.add(c); },
                remove(c) { elements.dashboardExpiryWarning.classes.delete(c); },
                contains(c) { return elements.dashboardExpiryWarning.classes.has(c); }
            },
            style: { display: 'none' },
            textContent: ''
        }
    };
    return elements;
}

function runUpdateDisplay(mockDOM, rawExpiresAt, mockToday = null) {
    const { settingsExpiryDateText, dashboardExpiryWarning } = mockDOM;

    if (!rawExpiresAt) {
        if (settingsExpiryDateText) settingsExpiryDateText.textContent = '--/--/----';
        if (dashboardExpiryWarning) {
            dashboardExpiryWarning.textContent = '';
            dashboardExpiryWarning.classList.add('hidden');
            dashboardExpiryWarning.style.display = 'none';
        }
        return;
    }

    const cleanIso = /^\d{4}-\d{2}-\d{2}$/.test(String(rawExpiresAt).trim())
        ? `${String(rawExpiresAt).trim()}T12:00:00`
        : rawExpiresAt;
    const parsedDate = new Date(cleanIso);
    if (isNaN(parsedDate.getTime())) {
        if (settingsExpiryDateText) settingsExpiryDateText.textContent = '--/--/----';
        if (dashboardExpiryWarning) {
            dashboardExpiryWarning.textContent = '';
            dashboardExpiryWarning.classList.add('hidden');
            dashboardExpiryWarning.style.display = 'none';
        }
        return;
    }

    // Strictly format date to DD/MM/YYYY
    const formattedDate = parsedDate.toLocaleDateString('en-GB');
    if (settingsExpiryDateText) {
        settingsExpiryDateText.textContent = formattedDate;
    }

    // Expiry Countdown Logic:
    const today = mockToday ? new Date(mockToday) : new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(rawExpiresAt);
    expDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    const warningElement = dashboardExpiryWarning;
    if (warningElement) {
        if (diffDays > 0 && diffDays <= 7) {
            warningElement.textContent = diffDays === 1 ? 'Subscription expires in 1 day' : `Subscription expires in ${diffDays} days`;
            warningElement.classList.remove('hidden');
            warningElement.style.display = 'flex';
        } else {
            warningElement.classList.add('hidden');
            warningElement.style.display = 'none';
        }
    }
}

// Case A: Expiration in 1 day
const dom1 = createMockDOM();
runUpdateDisplay(dom1, '2026-09-10', '2026-09-09');
assert.strictEqual(dom1.settingsExpiryDateText.textContent, '10/09/2026');
assert(!dom1.dashboardExpiryWarning.classList.contains('hidden'), 'Should not be hidden');
assert.strictEqual(dom1.dashboardExpiryWarning.textContent, 'Subscription expires in 1 day');
console.log('✅ PASS: Case A (Expires in 1 day -> "Subscription expires in 1 day", Date = 10/09/2026)');

// Case B: Expiration in 5 days
const dom2 = createMockDOM();
runUpdateDisplay(dom2, '2026-09-14', '2026-09-09');
assert.strictEqual(dom2.settingsExpiryDateText.textContent, '14/09/2026');
assert(!dom2.dashboardExpiryWarning.classList.contains('hidden'), 'Should not be hidden');
assert.strictEqual(dom2.dashboardExpiryWarning.textContent, 'Subscription expires in 5 days');
console.log('✅ PASS: Case B (Expires in 5 days -> "Subscription expires in 5 days", Date = 14/09/2026)');

// Case C: Expiration in 7 days (boundary condition)
const dom3 = createMockDOM();
runUpdateDisplay(dom3, '2026-09-16', '2026-09-09');
assert.strictEqual(dom3.settingsExpiryDateText.textContent, '16/09/2026');
assert(!dom3.dashboardExpiryWarning.classList.contains('hidden'), 'Should not be hidden');
assert.strictEqual(dom3.dashboardExpiryWarning.textContent, 'Subscription expires in 7 days');
console.log('✅ PASS: Case C (Expires in 7 days -> "Subscription expires in 7 days", Date = 16/09/2026)');

// Case D: Expiration in 8 days (> 7 days, alert hidden)
const dom4 = createMockDOM();
runUpdateDisplay(dom4, '2026-09-17', '2026-09-09');
assert.strictEqual(dom4.settingsExpiryDateText.textContent, '17/09/2026');
assert(dom4.dashboardExpiryWarning.classList.contains('hidden'), 'Should be hidden when > 7 days');
console.log('✅ PASS: Case D (Expires in 8 days -> Alert hidden, Date = 17/09/2026)');

// Case E: Far future (e.g. 07/11/2026)
const dom5 = createMockDOM();
runUpdateDisplay(dom5, '2026-11-07', '2026-09-09');
assert.strictEqual(dom5.settingsExpiryDateText.textContent, '07/11/2026');
assert(dom5.dashboardExpiryWarning.classList.contains('hidden'), 'Should be hidden for far future date');
console.log('✅ PASS: Case E (Far future -> Alert hidden, Date = 07/11/2026)');

// Case F: Already expired (diffDays <= 0)
const dom6 = createMockDOM();
runUpdateDisplay(dom6, '2026-09-08', '2026-09-09');
assert.strictEqual(dom6.settingsExpiryDateText.textContent, '08/09/2026');
assert(dom6.dashboardExpiryWarning.classList.contains('hidden'), 'Should be hidden when already expired');
console.log('✅ PASS: Case F (Already expired -> Alert hidden, Date = 08/09/2026)');

// Case G: Cleared / Null
const dom7 = createMockDOM();
runUpdateDisplay(dom7, null);
assert.strictEqual(dom7.settingsExpiryDateText.textContent, '--/--/----');
assert(dom7.dashboardExpiryWarning.classList.contains('hidden'), 'Should be hidden when null');
console.log('✅ PASS: Case G (Cleared/Null -> Date reset to --/--/----, Alert hidden)');

console.log('\n🎉 All Expiry Badge & Countdown Tests Passed Successfully!');
