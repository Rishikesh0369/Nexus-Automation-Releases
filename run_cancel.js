require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = 'numbers.txt';
const SESSION_DIR = path.join(__dirname, 'bpcl_session');

(async () => {
    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ numbers.txt फाइल नहीं मिली!');
        process.exit(1);
    }

    const numbers = fs.readFileSync(DATA_FILE, 'utf-8')
                      .split('\n')
                      .map(num => num.trim())
                      .filter(num => num.length > 0);

    if (numbers.length === 0) {
        console.error('❌ numbers.txt खाली है!');
        process.exit(1);
    }

    const USER_ID = process.env.USER_ID;
    const PASSWORD = process.env.PASSWORD;

    if (!USER_ID || !PASSWORD) {
        console.error('❌ .env फाइल में USER_ID या PASSWORD नहीं मिला!');
        process.exit(1);
    }

    console.log(`📋 कुल ${numbers.length} कंज्यूमर नंबर्स मिले हैं।`);
    console.log('🚀 ऑटोमेशन शुरू हो रहा है...');

    // 1. Persistent Context से ब्राउज़र खोलें ताकि सेशन सेव रहे
    const context = await chromium.launchPersistentContext(SESSION_DIR, { 
        headless: false,
        viewport: null
    });
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log('🌐 eConnect पोर्टल खोला जा रहा है...');
        await page.goto('https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // 2. चेक करें कि क्या दोबारा लॉगिन की ज़रूरत है
        if (page.url().toLowerCase().includes('login.html')) {
            console.log('🔒 सेशन एक्टिव नहीं है, लॉगिन किया जा रहा है...');
            await page.fill('#principal', USER_ID);
            await page.fill('#input_password', PASSWORD);

            console.log('🟡 कृपया CAPTCHA भरें और LOGIN बटन दबाएँ (5 मिनट का समय है)...');

            await page.waitForFunction(() => {
                const url = window.location.href.toLowerCase();
                return url.includes('myinfo') || url.includes('mainmenu');
            }, { timeout: 300000 });

            console.log('✅ लॉगिन सफल हुआ!');
            await page.waitForTimeout(2000);
        } else {
            console.log('⚡ आप पहले से लॉगिन हैं! लॉगिन स्टेप स्किप किया जा रहा है...');
        }

        // 3. My Applications ➔ LPG One
        console.log('🖱️ "My Applications" पर होवर कर रहे हैं...');
        await page.locator('a').filter({ hasText: 'My Application' }).first().hover();
        await page.waitForTimeout(1000);

        console.log('🖱️ "LPG One" पर क्लिक कर रहे हैं (नया टैब खुलेगा)...');
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            page.locator('a').filter({ hasText: 'LPG One' }).first().click() 
        ]);

        await newPage.waitForLoadState('domcontentloaded');
        console.log('✅ नया टैब खुल गया!');
        await newPage.waitForTimeout(1000);

        // 4. सिर्फ हरे टिक वाले "Cash Memo Cancel" पर क्लिक (सबसे सुरक्षित तरीका)
        console.log('🖱️ सटीक "Cash Memo Cancel" लिंक पर क्लिक कर रहे हैं...');
        await newPage.locator('a').filter({ hasText: 'Cash Memo Cancel' }).first().click();

        await newPage.waitForLoadState('domcontentloaded');
        await newPage.waitForTimeout(2000);

        // 5. नंबर्स प्रोसेस करने का लूप
        for (let i = 0; i < numbers.length; i++) {
            const consumerNo = numbers[i];
            console.log(`\n🔄 [${i + 1}/${numbers.length}] प्रोसेस कर रहे हैं: ${consumerNo}`);

            try {
                // 5a. Consumer Number भरें
                await newPage.fill('#ctl00_ContentPlaceHolder1_txtConsumerNumber', consumerNo);
                
                // 5b. Proceed बटन दबाएं
                await Promise.all([
                    newPage.waitForLoadState('networkidle'),
                    newPage.click('#ctl00_ContentPlaceHolder1_btnProceed')
                ]);

                // 5c. Cancel लिंक चेक करें
                const cancelLink = newPage.locator('#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel');
                
                if (await cancelLink.isVisible()) {
                    // Cancel पर क्लिक करें
                    await Promise.all([
                        newPage.waitForLoadState('networkidle'),
                        cancelLink.click()
                    ]);

                    // सफलता का मैसेज पढ़ें
                    const msg = await newPage.textContent('#ctl00_ContentPlaceHolder1_lblMessage');
                    if (msg && msg.includes('Successfully')) {
                        console.log(`✅ सफलता! ${consumerNo} का कैश मेमो कैंसिल हो गया।`);
                    } else {
                        console.log(`⚠️ ${consumerNo} कैंसिल हुआ, लेकिन कन्फर्मेशन मैसेज स्पष्ट नहीं है।`);
                    }
                } else {
                    console.log(`⏭️ ${consumerNo} के लिए कोई कैंसिल लिंक नहीं मिला (शायद पहले ही कैंसिल है)।`);
                }

                // 5d. अगले नंबर के लिए Clear बटन दबाएं
                if (i < numbers.length - 1) {
                    await Promise.all([
                        newPage.waitForLoadState('networkidle'),
                        newPage.click('#ctl00_ContentPlaceHolder1_btnClear')
                    ]);
                }

            } catch (err) {
                console.log(`❌ ${consumerNo} में एरर आया: ${err.message}`);
                try {
                    // एरर आने पर भी Clear दबाने की कोशिश करें ताकि अगला नंबर न फंसे
                    await newPage.click('#ctl00_ContentPlaceHolder1_btnClear');
                    await newPage.waitForLoadState('networkidle');
                } catch(e) {}
            }
        }

    } catch (error) {
        console.error('\n❌ एरर आया:', error.message);
    } finally {
        console.log('\n🎉 प्रोसेस पूरा हुआ! (ब्राउज़र खुला रखा गया है)');
    }
})();