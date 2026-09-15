// -------------------------------------------------------------
// VERIFICATION: mutual exclusion between cancellation and delivery report
// -------------------------------------------------------------
// The UI tests run the REAL updateAutomationLockState / refreshAutomationLock
// source (extracted from renderer.js) in a vm against a minimal fake DOM, so
// the button states asserted here are the ones the shipped code produces.
// -------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'desktop-app', 'renderer.js');
const MAIN = path.join(ROOT, 'desktop-app', 'main.js');

const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const mainSrc = fs.readFileSync(MAIN, 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name}\n     ${err.message}`);
    }
}

function slice(src, startMarker, endMarker, label) {
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    assert.ok(start >= 0, `${label}: start marker not found -> ${startMarker}`);
    assert.ok(end > start, `${label}: end marker not found -> ${endMarker}`);
    return src.slice(start, end);
}

// -------------------------------------------------------------
// MINIMAL FAKE DOM
// -------------------------------------------------------------
function makeButton(id) {
    return { id, disabled: false, title: '', style: { opacity: '', pointerEvents: '' } };
}

function makeHarness({ withCancelButton = true, withFetchButton = true } = {}) {
    const buttons = {};
    if (withCancelButton) buttons.btnStartCancellation = makeButton('btnStartCancellation');
    if (withFetchButton) buttons.btnFetchDeliveryReport = makeButton('btnFetchDeliveryReport');

    const win = {};
    const ctx = vm.createContext({
        console,
        window: win,
        document: {
            getElementById: (id) => buttons[id] || null,
            querySelector: () => null
        }
    });

    // Ends at the startup lock call, so the slice is exactly the lock block:
    // activeAutomation + updateAutomationLockState + refreshAutomationLock.
    const lockSlice = slice(
        rendererSrc,
        "let activeAutomation = null; // 'cancellation' | 'delivery_report' | null",
        '\n\n    // Start locked.',
        'lock block'
    );

    vm.runInContext(
        `${lockSlice}\n;this.__api = { updateAutomationLockState, refreshAutomationLock, get activeAutomation() { return activeAutomation; } };`,
        ctx
    );

    return { api: ctx.__api, buttons, win };
}

function assertLocked(btn, expectedTitle) {
    assert.strictEqual(btn.disabled, true, 'must be disabled');
    assert.strictEqual(btn.style.opacity, '0.3', 'must be dimmed to 0.3');
    assert.strictEqual(btn.style.pointerEvents, 'none', 'must be non-clickable');
    assert.strictEqual(btn.title, expectedTitle, 'must explain why it is locked');
}

function assertUnlocked(btn) {
    assert.strictEqual(btn.disabled, false, 'must be enabled');
    assert.strictEqual(btn.style.opacity, '1', 'must be at full opacity');
    assert.strictEqual(btn.style.pointerEvents, 'auto', 'must be clickable');
    assert.strictEqual(btn.title, '', 'must carry no lock reason');
}

console.log('\n──────────── UI LOCK: cancellation holds the slot ────────────');

test('a running cancellation locks the Fetch Delivery Report button', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('cancellation');
    assertLocked(h.buttons.btnFetchDeliveryReport, 'Cannot fetch report while Cash Memo Cancellation is running');
});

test('...and leaves the cancellation button alone so Stop still works', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('cancellation');
    assert.strictEqual(h.buttons.btnStartCancellation.disabled, false, 'Stop must stay clickable');
    assert.notStrictEqual(h.buttons.btnStartCancellation.style.pointerEvents, 'none');
});

console.log('\n──────────── UI LOCK: delivery report holds the slot ────────────');

test('a running delivery report locks the Auto-Cancellation button', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('delivery_report');
    assertLocked(h.buttons.btnStartCancellation, 'Cannot start cancellation while Delivery Report is running');
});

test('...and leaves the fetch button alone so Stop Fetching still works', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('delivery_report');
    assert.strictEqual(h.buttons.btnFetchDeliveryReport.disabled, false, 'Stop Fetching must stay clickable');
    assert.notStrictEqual(h.buttons.btnFetchDeliveryReport.style.pointerEvents, 'none');
});

console.log('\n──────────── UI LOCK: release ────────────');

test('both idle + valid license restores both buttons', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('cancellation');
    h.api.updateAutomationLockState(null);
    assertUnlocked(h.buttons.btnStartCancellation);
    assertUnlocked(h.buttons.btnFetchDeliveryReport);
});

test('both idle + INVALID license leaves both locked at 0.35 (license gate, not automation)', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = false;
    h.api.updateAutomationLockState(null);
    for (const btn of [h.buttons.btnStartCancellation, h.buttons.btnFetchDeliveryReport]) {
        assert.strictEqual(btn.disabled, true, 'invalid license must keep it disabled');
        assert.strictEqual(btn.style.opacity, '0.35', 'license-dim is 0.35, distinct from the 0.3 automation lock');
        assert.strictEqual(btn.style.pointerEvents, 'none');
    }
});

test('a missing button is tolerated, the other still locks', () => {
    const h = makeHarness({ withCancelButton: false });
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('delivery_report');   // would target the missing button
    h.api.updateAutomationLockState('cancellation');
    assertLocked(h.buttons.btnFetchDeliveryReport, 'Cannot fetch report while Cash Memo Cancellation is running');
});

console.log('\n──────────── DERIVED LOCK: one finishing cannot free the other ────────────');

test('refreshAutomationLock derives "cancellation" from the running flag', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.win.__nexusCancellationRunning = true;
    h.api.refreshAutomationLock();
    assert.strictEqual(h.api.activeAutomation, 'cancellation');
    assertLocked(h.buttons.btnFetchDeliveryReport, 'Cannot fetch report while Cash Memo Cancellation is running');
});

test('refreshAutomationLock derives "delivery_report" from the running flag', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.win.__nexusDeliveryFetchRunning = true;
    h.api.refreshAutomationLock();
    assert.strictEqual(h.api.activeAutomation, 'delivery_report');
    assertLocked(h.buttons.btnStartCancellation, 'Cannot start cancellation while Delivery Report is running');
});

test('a delivery-report run survives a stray cancellation "idle" transition', () => {
    // The real hazard: onStatusUpdate('stopped') fires setButtonState('idle')
    // while a report is scraping. A hard updateAutomationLockState(null) would
    // unlock the cancellation button mid-report; deriving the lock must not.
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.win.__nexusDeliveryFetchRunning = true;
    h.api.refreshAutomationLock();

    h.win.__nexusCancellationRunning = false;   // cancellation reports idle
    h.api.refreshAutomationLock();

    assert.strictEqual(h.api.activeAutomation, 'delivery_report', 'the report must keep the slot');
    assertLocked(h.buttons.btnStartCancellation, 'Cannot start cancellation while Delivery Report is running');
});

test('the slot frees only once BOTH flags are clear', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.win.__nexusDeliveryFetchRunning = true;
    h.api.refreshAutomationLock();

    h.win.__nexusDeliveryFetchRunning = false;
    h.api.refreshAutomationLock();

    assert.strictEqual(h.api.activeAutomation, null);
    assertUnlocked(h.buttons.btnStartCancellation);
    assertUnlocked(h.buttons.btnFetchDeliveryReport);
});

test('switching owner directly clears the previous lock styling', () => {
    // cancellation -> delivery_report with no idle step in between: the fetch
    // button must not stay dimmed from the cancellation lock, since it is now
    // the running report's own Stop control.
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.api.updateAutomationLockState('cancellation');
    assert.strictEqual(h.buttons.btnFetchDeliveryReport.style.opacity, '0.3');

    h.api.updateAutomationLockState('delivery_report');
    assert.strictEqual(h.buttons.btnFetchDeliveryReport.style.opacity, '1', 'owner button must be un-dimmed');
    assert.strictEqual(h.buttons.btnFetchDeliveryReport.style.pointerEvents, 'auto', 'owner button must be clickable');
    assert.strictEqual(h.buttons.btnFetchDeliveryReport.title, '', 'stale lock reason must be cleared');
    assertLocked(h.buttons.btnStartCancellation, 'Cannot start cancellation while Delivery Report is running');
});

test('cancellation wins if both flags are somehow set', () => {
    const h = makeHarness();
    h.win.__currentLicenseValid = true;
    h.win.__nexusCancellationRunning = true;
    h.win.__nexusDeliveryFetchRunning = true;
    h.api.refreshAutomationLock();
    assert.strictEqual(h.api.activeAutomation, 'cancellation', 'deterministic precedence, never both');
});

console.log('\n──────────── LIFECYCLE HOOKS ────────────');

test('setButtonState publishes the flag and refreshes the lock on every transition', () => {
    const fn = slice(rendererSrc, 'function setButtonState(state)', '\n    // ---------------------------------------------------------\n    // TERMINAL LOG CONSOLE', 'setButtonState');
    assert.ok(fn.includes('window.__nexusCancellationRunning = isProcessRunning;'), 'must publish the running flag');
    assert.ok(fn.includes('refreshAutomationLock();'), 'must refresh the lock');
    // One funnel covers running / stopping / idle and all 9 call sites.
    for (const state of ["'running'", "'stopping'"]) {
        assert.ok(fn.includes(state), `setButtonState must still handle ${state}`);
    }
});

test('setDeliveryButtonState refreshes the lock for both states', () => {
    const fn = slice(rendererSrc, 'function setDeliveryButtonState(running)', '\n        }\n\n        // Establish the idle label', 'setDeliveryButtonState');
    assert.ok(fn.includes('window.__nexusDeliveryFetchRunning = running;'), 'must publish the running flag');
    assert.ok(fn.includes('refreshAutomationLock();'), 'must refresh the lock');
    // Outside the if/else, so it runs on start AND on finish.
    const idx = fn.indexOf('refreshAutomationLock();');
    const elseIdx = fn.lastIndexOf('updateLicenseUIState(isLicenseValid);');
    assert.ok(idx > elseIdx, 'must sit after the if/else so both states hit it');
});

test('a valid-license re-verify cannot unlock a button mid-run', () => {
    const verified = slice(rendererSrc, "if (status === 'verified')", "} else if (status === 'invalid')", 'verified branch');
    assert.ok(verified.includes('refreshAutomationLock();'), 'the verified branch must re-assert the lock');

    const licenseFn = slice(rendererSrc, 'function updateLicenseUIState(isValid)', '\n    window.updateLicenseUIState', 'license gate');
    assert.ok(licenseFn.includes("if (activeAutomation === 'cancellation')"), 'must not re-enable fetch mid-cancellation');
    assert.ok(licenseFn.includes('window.__currentLicenseValid = Boolean(isValid);'), 'must publish the verdict for the lock');
});

console.log('\n──────────── CLICK-HANDLER BACKSTOPS ────────────');

test('the cancellation click refuses while a report runs', () => {
    const handler = slice(rendererSrc, "btnStartCancellation.addEventListener('click'", 'if (isSubscriptionExpired)', 'cancel click');
    assert.ok(
        handler.includes("activeAutomation === 'delivery_report' || window.__nexusDeliveryFetchRunning"),
        'must check both the lock and the running flag'
    );
    assert.ok(handler.includes('Cannot start cancellation while the Delivery Report is running'), 'must explain why');
});

test('the fetch click and the confirmed fetch both refuse while cancellation runs', () => {
    const occurrences = (rendererSrc.match(/isProcessRunning \|\| activeAutomation === 'cancellation'/g) || []).length;
    assert.strictEqual(occurrences, 2, 'guarded at the click AND after the confirmation dialog');
    assert.ok(
        rendererSrc.includes('Cannot fetch the report while Cash Memo Cancellation is running'),
        'must explain why'
    );
});

console.log('\n──────────── BACKEND MUTEX (main.js) ────────────');

test('the flag is declared once at module scope', () => {
    const decls = (mainSrc.match(/let isAnyAutomationRunning = false;/g) || []).length;
    assert.strictEqual(decls, 1, 'exactly one declaration');
});

for (const [label, marker] of [
    ['start-cancellation', "ipcMain.handle('start-cancellation'"],
    ['start-delivery-report', "ipcMain.handle('start-delivery-report'"]
]) {
    test(`${label} claims the slot before any await and refuses a second run`, () => {
        const handler = slice(mainSrc, marker, '\n});', `${label} handler`);

        const guardIdx = handler.indexOf('if (isAnyAutomationRunning) {');
        const throwIdx = handler.indexOf("throw new Error('Another automation process is already active.');");
        const acquireIdx = handler.indexOf('isAnyAutomationRunning = true;');
        const tryIdx = handler.indexOf('    try {');
        const firstAwaitIdx = handler.indexOf('await ');

        assert.ok(guardIdx >= 0, 'must guard');
        assert.ok(throwIdx > guardIdx, 'must throw the specified message');
        assert.ok(acquireIdx > throwIdx, 'must claim the slot after the guard');
        assert.ok(
            acquireIdx < firstAwaitIdx,
            'must claim BEFORE the first await, or two rapid invokes both pass the guard'
        );
        assert.ok(guardIdx < tryIdx, 'the guard must sit outside the try, so a refusal never hits the finally');
    });

    test(`${label} releases the slot in finally and on the early return`, () => {
        const handler = slice(mainSrc, marker, '\n});', `${label} handler`);
        assert.ok(/\} finally \{[\s\S]*isAnyAutomationRunning = false;[\s\S]*?\}/.test(handler), 'must release in finally');

        // The incomplete-settings return happens before the try/finally.
        const earlyIdx = handler.indexOf("return { cancelled: true, reason: 'Incomplete settings' };");
        assert.ok(earlyIdx > 0, 'the early return must still exist');
        const before = handler.slice(Math.max(0, earlyIdx - 200), earlyIdx);
        assert.ok(before.includes('isAnyAutomationRunning = false;'), 'must release before the early return');
    });
}

test('a refused start never clears a slot it did not own', () => {
    // Simulates the shipped shape: guard -> throw (outside try), so the
    // finally of the REJECTED call cannot free the running process's slot.
    let flag = false;
    async function handler() {
        if (flag) throw new Error('Another automation process is already active.');
        flag = true;
        try {
            await new Promise((r) => setTimeout(r, 30));
            return 'done';
        } finally {
            flag = false;
        }
    }
    const first = handler();
    let refused = null;
    return handler().catch((e) => { refused = e.message; }).then(async () => {
        assert.strictEqual(refused, 'Another automation process is already active.', 'second call refused');
        assert.strictEqual(flag, true, 'the refusal must NOT have released the first run\'s slot');
        assert.strictEqual(await first, 'done');
        assert.strictEqual(flag, false, 'the owner releases it on completion');
    });
});

console.log('\n──────────── PRESERVATION ────────────');

test('license checks, dedup, CSV export and stop handlers intact', () => {
    assert.ok(mainSrc.includes("ipcMain.handle('export-delivery-report-csv'"), 'CSV export intact');
    assert.ok(mainSrc.includes("ipcMain.handle('stop-delivery-report'"), 'delivery stop intact');
    assert.ok(mainSrc.includes("ipcMain.handle('stop-automation'"), 'cancellation stop intact');
    assert.ok(mainSrc.includes('verifyLicenseAndFetchManifest'), 'license manifest intact');
    assert.ok(rendererSrc.includes('mergeAndPersistDeliveryReport'), 'report merge/dedup intact');
    assert.ok(rendererSrc.includes('if (!key || seen.has(key)) continue;'), 'CSV dedup intact');
    assert.ok(rendererSrc.includes('executeDeliveryReportStop'), 'Keep Running dialog intact');
});

test('stop handlers are NOT gated by the mutex', () => {
    for (const marker of ["ipcMain.handle('stop-delivery-report'", "ipcMain.handle('stop-automation'"]) {
        const handler = slice(mainSrc, marker, '\n});', marker);
        assert.ok(
            !handler.includes('if (isAnyAutomationRunning) {'),
            'stopping must never be blocked by the run it is stopping'
        );
    }
});

// The async mutex test returns a promise; settle it before reporting.
Promise.resolve().then(() => new Promise((r) => setTimeout(r, 120))).then(() => {
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(64)}\n`);
    // exitCode, not process.exit() - the latter can truncate buffered stdout.
    process.exitCode = failed === 0 ? 0 : 1;
});
