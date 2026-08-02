const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser with saved session...');
  
  // Headless false रखेंगे ताकि हम ब्राउज़र में देख सकें
  const browser = await chromium.launch({ headless: false });
  
  // यहाँ हम Playwright को बता रहे हैं कि सेव की गई 'state.json' फाइल का इस्तेमाल करे
  const context = await browser.newContext({ storageState: 'state.json' });
  const page = await context.newPage();

  console.log('Navigating to BPCL eConnect portal...');
  await page.goto('https://econnect.bpcl.in'); 

  console.log('Browser opened!');
  console.log('Check if you are directly logged into the dashboard.');
  console.log('Press CTRL+C in this terminal to close the test when you are done.');
  
  // ब्राउज़र को खुला रखने के लिए हम इसे तुरंत क्लोज नहीं कर रहे हैं
})();