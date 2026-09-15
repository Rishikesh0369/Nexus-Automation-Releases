const fs = require('fs');

console.log('--- 1. Testing logo-integrated toast.html ---');
const toastHtml = fs.readFileSync('desktop-app/toast.html', 'utf8');
if (!toastHtml.includes('class="app-logo"')) throw new Error('Missing .app-logo in toast.html');
if (!toastHtml.includes('src="assets/icon.png"')) throw new Error('Missing src="assets/icon.png" in toast.html');
if (!toastHtml.includes('id="toastCard"')) throw new Error('Missing #toastCard in toast.html');
if (!toastHtml.includes('id="cancelledVal"')) throw new Error('Missing #cancelledVal in toast.html');
if (!toastHtml.includes('id="timeVal"')) throw new Error('Missing #timeVal in toast.html');
if (!toastHtml.includes('id="closeBtn"')) throw new Error('Missing #closeBtn in toast.html');
if (!toastHtml.includes('Nexus Automation')) throw new Error('Missing Nexus Automation in toast.html');
if (!toastHtml.includes('Cancellation Completed')) throw new Error('Missing Cancellation Completed in toast.html');
console.log('✅ toast.html verified successfully');

console.log('--- 2. Testing main.js 336x138 dimensions & positioning ---');
const mainJs = fs.readFileSync('desktop-app/main.js', 'utf8');
if (!mainJs.includes('toastWidth = 336')) throw new Error('Missing toastWidth = 336 in main.js');
if (!mainJs.includes('toastHeight = 138')) throw new Error('Missing toastHeight = 138 in main.js');
if (!mainJs.includes('marginX = 16')) throw new Error('Missing marginX = 16 in main.js');
if (!mainJs.includes('marginY = 10')) throw new Error('Missing marginY = 10 in main.js');
console.log('✅ main.js verified successfully');
