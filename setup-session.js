const { chromium } = require('playwright');

(async () => {
  // Headless false so you can interact with the browser directly
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to BPCL portal...');
  await page.goto('https://ebharatgas.com/'); // BPCL login URL

  console.log('Please log in manually in the opened browser window.');
  console.log('Once logged in and on the dashboard, press ENTER in this terminal to save the session.');

  // Wait for user to complete manual login in browser and hit Enter in terminal
  process.stdin.once('data', async () => {
    await context.storageState({ path: 'state.json' });
    console.log('Session state successfully saved to state.json!');
    await browser.close();
    process.exit(0);
  });
})();