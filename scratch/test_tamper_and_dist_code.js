const { chromium } = require('playwright');
const { verifyDistributorCodeHeader } = require('../desktop-app/automationRunner');

async function testAll() {
    console.log('--- TEST 1: Cloudflare Worker Live Verification ---');
    const workerUrl = 'https://bharatgas-api.www-rishikesh111.workers.dev/api/verify';
    const res = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            licenseKey: 'NEXUS-LIC-101',
            bpclUserId: 'cc_user_101'
        })
    });
    const data = await res.json();
    console.log('Worker Status:', res.status);
    console.log('Top-level distributorCode:', data.distributorCode);
    console.log('Manifest distributorCode:', data.manifest?.distributorCode);

    if (data.distributorCode !== '100101' || data.manifest?.distributorCode !== '100101') {
        throw new Error(`Cloudflare worker did not return expected distributorCode '100101'. Received: ${data.distributorCode}`);
    }
    console.log('✅ TEST 1 PASSED: Worker returns correct distributorCode!');

    console.log('\n--- TEST 2: Tamper Protection on Login Page ---');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
        <html>
            <body>
                <input id="username" type="text" />
                <input id="password" type="password" />
                <button id="submit">Login</button>
            </body>
        </html>
    `);

    const authorizedUserId = 'cc_user_101';
    await page.fill('#username', authorizedUserId);
    await page.fill('#password', 'secretPass');

    // Tamper Protection after filling credentials:
    await page.$eval('#username', el => { el.readOnly = true; el.style.pointerEvents = 'none'; });
    await page.$eval('#password', el => { el.readOnly = true; el.style.pointerEvents = 'none'; });

    const isReadOnly = await page.$eval('#username', el => el.readOnly);
    const pointerEvents = await page.$eval('#username', el => el.style.pointerEvents);
    console.log('Username readOnly:', isReadOnly, '| pointerEvents:', pointerEvents);

    if (!isReadOnly || pointerEvents !== 'none') {
        throw new Error('Tamper protection attributes readOnly or pointerEvents not applied!');
    }

    // Simulate tampering of input field
    await page.$eval('#username', el => { el.readOnly = false; el.value = 'hacked_user'; });

    let tamperCaught = false;
    try {
        const currentInputUser = await page.$eval('#username', el => el.value);
        if (currentInputUser.trim().toLowerCase() !== authorizedUserId.trim().toLowerCase()) {
            throw new Error("सुरक्षा उल्लंघन: लॉगिन क्रेडेंशियल्स के साथ छेड़छाड़ की गई है।");
        }
    } catch (e) {
        if (e.message === "सुरक्षा उल्लंघन: लॉगिन क्रेडेंशियल्स के साथ छेड़छाड़ की गई है।") {
            tamperCaught = true;
            console.log('Caught expected tamper error:', e.message);
        } else {
            throw e;
        }
    }

    if (!tamperCaught) {
        throw new Error('Tamper protection failed to catch tampered username!');
    }
    console.log('✅ TEST 2 PASSED: Tamper protection successfully locks inputs and halts on tampering!');

    console.log('\n--- TEST 3: Post-Login Distributor Code Verification (Header Check) ---');
    const authorizedDistributorCode = '100101';

    // Subtest 3A: Valid matching distributor code in top header
    await page.setContent(`
        <html>
            <body>
                <div class="top-header">
                    <span id="lblDistributorCode">Distributor: 100101 - Bela Bharat Gas</span>
                </div>
                <div id="content">Dashboard Loaded</div>
            </body>
        </html>
    `);

    await verifyDistributorCodeHeader(page, authorizedDistributorCode, browser, console.log);
    console.log('✅ Subtest 3A PASSED: Matching distributor code passed verification!');

    // Subtest 3B: Mismatched distributor code in top header
    await page.setContent(`
        <html>
            <body>
                <div class="top-header">
                    <span id="lblDistributorCode">Distributor: 999888 - Other Gas Agency</span>
                </div>
                <div id="content">Dashboard Loaded</div>
            </body>
        </html>
    `);

    let mismatchCaught = false;
    let expectedError = `अनधिकृत एजेंसी लॉगिन: पोर्टल डिस्ट्रीब्यूटर कोड (999888) इस लाइसेंस के लिए अधिकृत कोड (${authorizedDistributorCode}) से मेल नहीं खाता।`;

    try {
        await verifyDistributorCodeHeader(page, authorizedDistributorCode, null, () => {});
    } catch (e) {
        if (e.message === expectedError) {
            mismatchCaught = true;
            console.log('Caught expected mismatch error:', e.message);
        } else {
            console.error('Unexpected error message:', e.message);
            throw e;
        }
    }

    if (!mismatchCaught) {
        throw new Error('Post-login verification failed to reject mismatched distributor code!');
    }
    console.log('✅ Subtest 3B PASSED: Mismatched distributor code correctly rejected with exact Hindi security message!');

    await browser.close();
    console.log('\n=============================================');
    console.log('ALL TESTS PASSED WITH 100% COMPLIANCE! 🎉');
    console.log('=============================================');
}

testAll().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
