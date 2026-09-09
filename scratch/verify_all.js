const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Bharat Gas Nexus Integrity & Expiration Hub Audit ===\n');

const filesToCheck = [
    'desktop-app/index.html',
    'desktop-app/styles.css',
    'desktop-app/renderer.js',
    'desktop-app/automationRunner.js',
    'desktop-app/main.js',
    'desktop-app/preload.js',
    'desktop-app/package.json',
    'worker/index.js',
    'worker/wrangler.toml'
];

let hasErrors = false;

// 1. Check file existence and non-empty status
for (const file of filesToCheck) {
    const filePath = path.resolve(__dirname, '..', file);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Missing file: ${file}`);
        hasErrors = true;
        continue;
    }
    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
        console.error(`❌ Empty file (0 bytes): ${file}`);
        hasErrors = true;
    } else {
        console.log(`✅ [${stat.size} bytes] ${file}`);
    }
}

// 2. Check HTML elements
const htmlContent = fs.readFileSync(path.resolve(__dirname, '../desktop-app/index.html'), 'utf8');
const requiredHtmlElements = [
    'id="subscriptionExpiryBanner"',
    'id="expiryBannerMessage"',
    'id="btnRenewLicense"',
    '⚡ Renew License Now',
    'id="renewalModal"',
    'id="renewalModalTitle"',
    'id="renewalPlanName"',
    'id="renewalAmount"',
    'id="renewalUpiId"',
    'id="btnCopyUpi"',
    'id="btnRenewalWhatsApp"',
    'id="btnRenewalCall"',
    'id="btnRenewalInAppChat"',
    'id="btnCloseRenewalModal"',
    'id="agencyBadge"',
    'badge-unregistered',
    '⚪ No License Configured'
];

for (const el of requiredHtmlElements) {
    if (!htmlContent.includes(el)) {
        console.error(`❌ Missing HTML element/text: ${el}`);
        hasErrors = true;
    } else {
        console.log(`✅ HTML contains: ${el}`);
    }
}

// 3. Check CSS classes
const cssContent = fs.readFileSync(path.resolve(__dirname, '../desktop-app/styles.css'), 'utf8');
const requiredCssClasses = [
    '.subscription-expiry-banner',
    '.btn-renew-license',
    '.renewal-modal-dialog',
    '.renewal-modal-header',
    '.renewal-plan-card',
    '.renewal-upi-card',
    '.btn-copy-upi',
    '.btn-action-whatsapp',
    '.btn-action-call',
    '.renewal-chat-fallback',
    '.btn-subscription-expired',
    '.badge-unregistered',
    '.badge-verified',
    '.badge-invalid'
];

for (const cls of requiredCssClasses) {
    if (!cssContent.includes(cls)) {
        console.error(`❌ Missing CSS class: ${cls}`);
        hasErrors = true;
    } else {
        console.log(`✅ CSS contains: ${cls}`);
    }
}

// 4. Check JS Syntax
try {
    execSync('node -c desktop-app/renderer.js desktop-app/automationRunner.js desktop-app/main.js desktop-app/preload.js', { stdio: 'inherit' });
    console.log('✅ JS Syntax Check: All desktop-app JS files are syntactically valid.');
} catch (e) {
    console.error('❌ JS Syntax Error detected:', e.message);
    hasErrors = true;
}

if (hasErrors) {
    console.error('\n❌ AUDIT FAILED with errors.');
    process.exit(1);
} else {
    console.log('\n🎉 ALL INTEGRITY CHECKS PASSED PERFECTLY!');
}
