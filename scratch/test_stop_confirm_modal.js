const { chromium } = require('playwright');
const path = require('path');

async function runModalTests() {
    console.log('--- Starting Stop Confirmation Modal Test Suite ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock electronAPI and ipcRenderer for renderer.js
    await page.addInitScript(() => {
        window.stopCancellationCalled = false;
        window.ipcRenderer = {
            invoke: async (channel) => {
                if (channel === 'stop-automation') {
                    window.stopCancellationCalled = true;
                }
                return { success: true };
            },
            send: (channel) => {
                if (channel === 'stop-automation') {
                    window.stopCancellationCalled = true;
                }
            }
        };
        window.electronAPI = {
            workerBaseUrl: 'https://bharatgas-api.www-rishikesh111.workers.dev',
            getAppVersion: async () => '1.0.4',
            getSettings: async () => ({
                bpclUserId: 'cc_user_101',
                bpclPassword: 'testPassword',
                licenseKey: 'NEXUS-LIC-101'
            }),
            saveSettings: async () => ({ success: true }),
            stopAutomation: async () => {
                window.stopCancellationCalled = true;
                return { success: true };
            },
            stopCancellation: async () => {
                window.stopCancellationCalled = true;
                return { success: true };
            },
            onAutomationStarted: (cb) => { window._onAutomationStarted = cb; },
            onAutomationStopped: (cb) => { window._onAutomationStopped = cb; },
            onStatusUpdate: () => {},
            onProgressUpdate: () => {},
            onLogMessage: () => {},
            onProcessComplete: () => {}
        };
        window.nexusStore = {
            get: async (k) => null,
            set: async (k, v) => true,
            clear: async () => true
        };
    });

    const htmlPath = 'file:///' + path.resolve(__dirname, '../desktop-app/index.html').replace(/\\/g, '/');
    console.log(`Navigating to: ${htmlPath}`);
    await page.goto(htmlPath, { waitUntil: 'load' });

    // 1. Initial State Check
    const modal = page.locator('#stopConfirmModal');
    const isHiddenInit = await modal.evaluate(el => el.classList.contains('hidden'));
    console.log('1. Initial modal state is hidden:', isHiddenInit);
    if (!isHiddenInit) throw new Error('stopConfirmModal should be hidden by default!');

    // Verify Title, Description, and Icon in DOM
    const title = await page.locator('#stopConfirmTitle').innerText();
    console.log(`2. Modal Title: "${title}"`);
    if (!title || title.trim().length === 0) {
        throw new Error('Modal title is empty!');
    }

    const desc = await page.locator('.stop-confirm-desc').innerText();
    console.log(`3. Modal Description: "${desc}"`);
    if (!desc || desc.trim().length === 0) {
        throw new Error('Modal description is empty!');
    }

    const btnConfirmText = await page.locator('#btnConfirmStop').innerText();
    const btnKeepText = await page.locator('#btnKeepRunning').innerText();
    console.log(`4. Button text: Confirm Stop = "${btnConfirmText.trim()}", Keep Running = "${btnKeepText.trim()}"`);
    if (!btnConfirmText.includes('Stop Cancellation') || !btnKeepText.includes('Keep Running')) {
        throw new Error('Button texts mismatch specifications!');
    }

    // Ensure license key is set
    await page.evaluate(() => {
        const el = document.getElementById('inputLicenseKey');
        if (el) el.value = 'NEXUS-LIC-101';
    });

    // 5. Test Triggering Modal on Stop Button Click when Running
    console.log('5. Triggering automation running state...');
    await page.evaluate(() => {
        if (window._onAutomationStarted) {
            window._onAutomationStarted();
        }
    });

    // The button now says "Stop Auto-Cancellation"
    const btnStartText = await page.locator('#btnStartText').innerText();
    console.log(`Button state during run: "${btnStartText}"`);

    // Click the Stop button
    console.log('Clicking "Stop Auto-Cancellation" button...');
    await page.click('#btnStartCancellation');

    // Verify modal is now visible
    const isModalVisible = await modal.isVisible();
    console.log('Modal is visible after stop click:', isModalVisible);
    if (!isModalVisible) throw new Error('stopConfirmModal should be visible after clicking Stop!');

    // 6. Test "Keep Running" Button Click
    console.log('6. Testing "Keep Running" button click...');
    await page.click('#btnKeepRunning');
    const isHiddenAfterKeep = await modal.evaluate(el => el.classList.contains('hidden'));
    console.log('Modal is hidden after "Keep Running":', isHiddenAfterKeep);
    if (!isHiddenAfterKeep) throw new Error('stopConfirmModal should close when clicking Keep Running!');

    const stoppedOnKeep = await page.evaluate(() => window.stopCancellationCalled);
    if (stoppedOnKeep) throw new Error('Automation was stopped despite clicking Keep Running!');
    console.log('Verified: Automation was NOT stopped on Keep Running.');

    // 7. Test Keyboard Shortcut: Escape Key
    console.log('7. Testing Escape key dismissal...');
    await page.click('#btnStartCancellation');
    const isModalVisible2 = await modal.isVisible();
    if (!isModalVisible2) throw new Error('Failed to re-open modal!');

    await page.keyboard.press('Escape');
    const isHiddenAfterEsc = await modal.evaluate(el => el.classList.contains('hidden'));
    console.log('Modal is hidden after Escape key:', isHiddenAfterEsc);
    if (!isHiddenAfterEsc) throw new Error('stopConfirmModal should close when pressing Escape!');

    // 8. Test "Stop Cancellation" Confirmation Click
    console.log('8. Testing "Stop Cancellation" confirmation click...');
    await page.click('#btnStartCancellation');
    await page.click('#btnConfirmStop');

    const isHiddenAfterConfirm = await modal.evaluate(el => el.classList.contains('hidden'));
    console.log('Modal is hidden after "Stop Cancellation":', isHiddenAfterConfirm);
    if (!isHiddenAfterConfirm) throw new Error('stopConfirmModal should close after confirming stop!');

    const stoppedOnConfirm = await page.evaluate(() => window.stopCancellationCalled);
    console.log('stopCancellation / stop-automation IPC called:', stoppedOnConfirm);
    if (!stoppedOnConfirm) throw new Error('stop-automation IPC was NOT called after confirming stop!');

    // 9. Verify button reset and status text
    const btnTextAfterStop = await page.locator('#btnStartText').innerText();
    console.log('Button text after stop:', btnTextAfterStop);
    if (!btnTextAfterStop.includes('Start Auto-Cancellation')) {
        throw new Error(`Button text not reset to Start Auto-Cancellation! Got: ${btnTextAfterStop}`);
    }

    const statusBadge = await page.locator('#stateBadge').innerText();
    console.log('State badge text after stop:', statusBadge);
    if (!statusBadge.includes('Stopped by User (Idle)')) {
        throw new Error(`State badge text not updated to Stopped by User (Idle)! Got: ${statusBadge}`);
    }

    const detailText = await page.locator('#statusDetailText').innerText();
    console.log('Status detail text after stop:', detailText);

    await browser.close();
    console.log('\n=============================================');
    console.log('ALL STOP CONFIRMATION MODAL TESTS PASSED! 🎉');
    console.log('=============================================');
}

runModalTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
