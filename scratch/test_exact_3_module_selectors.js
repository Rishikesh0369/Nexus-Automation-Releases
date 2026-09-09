const assert = require('assert');
const runner = require('../desktop-app/bela_nexus_runner');

console.log('🧪 Testing Exact 18 Selectors & 3-Module Workflow...\n');

// 1. Test buildSelectors with custom 18 server keys
const customServerSelectors = {
    loginUser: '#custom_login_user',
    loginPass: '#custom_login_pass',
    captchaImg: '#custom_captcha_img',
    captchaInput: '#custom_captcha_input',
    loginBtn: '#custom_login_btn',
    menuMyApps: 'Custom My Apps',
    linkLpgOne: 'Custom LPG One',
    linkEDayEnd: 'Custom E-Day End',
    btnProceedDayEnd: 'Custom Proceed Day End',
    product5350Text: '9999',
    linkDelvConfNotDone: 'a#custom_delv_conf',
    tableConsumers: '#custom_consumer_table tr',
    linkCashMemoCancel: 'Custom Cash Memo Cancel',
    txtConsumerNumber: '#custom_consumer_number',
    btnProceedCancel: '#custom_proceed_cancel',
    linkCancelMemo: '#custom_cancel_memo',
    lblMessage: '#custom_lbl_message',
    btnClear: '#custom_btn_clear'
};

const built = runner.buildSelectors(customServerSelectors);

assert.strictEqual(built.loginUser, '#custom_login_user');
assert.strictEqual(built.loginPass, '#custom_login_pass');
assert.strictEqual(built.captchaImg, '#custom_captcha_img');
assert.strictEqual(built.captchaInput, '#custom_captcha_input');
assert.strictEqual(built.loginBtn, '#custom_login_btn');
assert.strictEqual(built.menuMyApps, 'Custom My Apps');
assert.strictEqual(built.linkLpgOne, 'Custom LPG One');
assert.strictEqual(built.linkEDayEnd, 'Custom E-Day End');
assert.strictEqual(built.btnProceedDayEnd, 'Custom Proceed Day End');
assert.strictEqual(built.product5350Text, '9999');
assert.strictEqual(built.linkDelvConfNotDone, 'a#custom_delv_conf');
assert.strictEqual(built.tableConsumers, '#custom_consumer_table tr');
assert.strictEqual(built.linkCashMemoCancel, 'Custom Cash Memo Cancel');
assert.strictEqual(built.txtConsumerNumber, '#custom_consumer_number');
assert.strictEqual(built.btnProceedCancel, '#custom_proceed_cancel');
assert.strictEqual(built.linkCancelMemo, '#custom_cancel_memo');
assert.strictEqual(built.lblMessage, '#custom_lbl_message');
assert.strictEqual(built.btnClear, '#custom_btn_clear');

console.log('✅ 1. buildSelectors properly extracts and maps all 18 custom server selectors');

// 2. Test fallback to default when empty object passed
const defaultBuilt = runner.buildSelectors({});
assert.strictEqual(defaultBuilt.loginUser, '#principal');
assert.strictEqual(defaultBuilt.loginPass, '#input_password');
assert.strictEqual(defaultBuilt.captchaImg, 'img#captcha');
assert.strictEqual(defaultBuilt.captchaInput, 'input#captcha');
assert.strictEqual(defaultBuilt.loginBtn, '.login-btn');
assert.strictEqual(defaultBuilt.menuMyApps, 'My Application');
assert.strictEqual(defaultBuilt.linkLpgOne, 'LPG One');
assert.strictEqual(defaultBuilt.linkEDayEnd, 'E-Day End This option is for');
assert.strictEqual(defaultBuilt.btnProceedDayEnd, 'Proceed');
assert.strictEqual(defaultBuilt.product5350Text, '5350');
assert.strictEqual(defaultBuilt.linkDelvConfNotDone, 'a[id*="hlDelvConfNotDone"]');
assert.strictEqual(defaultBuilt.tableConsumers, '#gvProductConsumer tr');
assert.strictEqual(defaultBuilt.linkCashMemoCancel, 'Cash Memo Cancel');
assert.strictEqual(defaultBuilt.txtConsumerNumber, '#ctl00_ContentPlaceHolder1_txtConsumerNumber');
assert.strictEqual(defaultBuilt.btnProceedCancel, '#ctl00_ContentPlaceHolder1_btnProceed');
assert.strictEqual(defaultBuilt.linkCancelMemo, '#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel');
assert.strictEqual(defaultBuilt.lblMessage, '#ctl00_ContentPlaceHolder1_lblMessage');
assert.strictEqual(defaultBuilt.btnClear, '#ctl00_ContentPlaceHolder1_btnClear');

console.log('✅ 2. Default fallbacks are correct for all 18 keys when selectors object is empty');

(async () => {
    // 3. Test volatile RAM storage in startCancellationProcess
    const originalLaunch = runner.launchBrowser;
    runner.launchBrowser = async () => {
        throw new Error('BROWSER_REACHED_SIMULATED_STOP');
    };

    try {
        await runner.startCancellationProcess({
            bpclUserId: 'TESTUSER',
            bpclPassword: 'TESTPASSWORD',
            licenseKey: 'TEST_KEY'
        }, customServerSelectors);
    } catch (e) {
        assert.strictEqual(e.message, 'BROWSER_REACHED_SIMULATED_STOP');
    } finally {
        runner.launchBrowser = originalLaunch;
    }

    const inMem = runner.getInMemorySelectors();
    assert.strictEqual(inMem.loginUser, '#custom_login_user');
    assert.strictEqual(inMem.txtConsumerNumber, '#custom_consumer_number');
    assert.strictEqual(inMem.btnProceedCancel, '#custom_proceed_cancel');
    assert.strictEqual(inMem.linkCancelMemo, '#custom_cancel_memo');

    console.log('✅ 3. startCancellationProcess securely holds custom server selectors in RAM');
    console.log('\n🎉 All 18 dynamic selector checks passed successfully!');
    process.exitCode = 0;
})().catch(err => {
    console.error('Test error:', err);
    process.exitCode = 1;
});
