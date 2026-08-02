const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser with saved session...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: 'state.json' });
  const page = await context.newPage();

  const dashboardUrl = 'https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO';
  console.log('Navigating directly to Dashboard...');
  await page.goto(dashboardUrl);

  // --- Auto-Refresh Error Handling Logic ---
  try {
    const errorText = page.getByText('Something went wrong', { exact: false });
    await errorText.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log('⚠️ Error page detected! Trying to force navigate to the dashboard again...');
    await page.goto(dashboardUrl);
    await page.waitForLoadState('domcontentloaded');
  } catch (error) {
    console.log('No error detected on initial load. Proceeding directly...');
  }

  // --- Login Page Fallback Checker ---
  const isLoginPage = await page.locator('text=Captcha Code').isVisible();
  if (isLoginPage) {
     console.error('❌ ALERT: Session has expired or the server logged you out!');
     console.error('👉 Please run "node setup-session.js" in the terminal to log in again and save a new state.json.');
     await browser.close();
     return;
  }

  // --- Navigation Logic ---
  console.log('Hovering on "My Applications"...');
  try {
    const myApplicationsMenu = page.locator('text=My Applications').first();
    await myApplicationsMenu.waitFor({ state: 'visible', timeout: 15000 });
    await myApplicationsMenu.hover();

    console.log('Clicking on "LPG One"...');
    const lpgOneOption = page.locator('text=LPG One').first();
    await lpgOneOption.click({ force: true });

    console.log('Successfully navigated to the LPG One page!');
  } catch (navError) {
    console.error('❌ Navigation failed. The page might still be stuck.');
    console.error(navError.message);
  }
})();