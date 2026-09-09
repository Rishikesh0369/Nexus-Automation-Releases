const fs = require('fs');
const path = require('path');
const { chromium } = require('../desktop-app/node_modules/playwright');

async function buildIcons() {
    const assetsDir = path.join(__dirname, '..', 'desktop-app', 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const svgPath = path.join(assetsDir, 'icon.svg');
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#f43f5e"/>
    </linearGradient>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <path class="star-shape" fill="none" stroke="url(#starGrad)" stroke-width="36" stroke-linejoin="round"
    d="M 256 90 C 272 170 342 240 422 256 C 342 272 272 342 256 422 C 240 342 170 272 90 256 C 170 240 240 170 256 90 Z" />
  <circle cx="256" cy="256" r="42" fill="url(#coreGrad)" class="star-core"/>
</svg>`;

    fs.writeFileSync(svgPath, svgContent, 'utf-8');
    console.log('Saved icon.svg');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;">${svgContent}</body></html>`;
    await page.setContent(html);

    // 512x512 PNG
    await page.setViewportSize({ width: 512, height: 512 });
    const png512 = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), png512);
    console.log('Saved icon.png (512x512)');

    // Sizes for ICO: 256, 128, 64, 48, 32, 16
    const sizes = [256, 128, 64, 48, 32, 16];
    const images = [];

    for (const size of sizes) {
        await page.setViewportSize({ width: size, height: size });
        const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
        images.push({ size, buffer: buf });
    }
    await browser.close();

    // Create ICO Buffer
    const count = images.length;
    const headerSize = 6 + 16 * count;
    let currentOffset = headerSize;

    const headerBuf = Buffer.alloc(headerSize);
    headerBuf.writeUInt16LE(0, 0); // reserved
    headerBuf.writeUInt16LE(1, 2); // ICO type
    headerBuf.writeUInt16LE(count, 4); // image count

    const dataBuffers = [];

    for (let i = 0; i < count; i++) {
        const { size, buffer } = images[i];
        const entryOffset = 6 + i * 16;
        headerBuf.writeUInt8(size === 256 ? 0 : size, entryOffset); // width (0 = 256)
        headerBuf.writeUInt8(size === 256 ? 0 : size, entryOffset + 1); // height (0 = 256)
        headerBuf.writeUInt8(0, entryOffset + 2); // color count
        headerBuf.writeUInt8(0, entryOffset + 3); // reserved
        headerBuf.writeUInt16LE(1, entryOffset + 4); // color planes
        headerBuf.writeUInt16LE(32, entryOffset + 6); // bpp
        headerBuf.writeUInt32LE(buffer.length, entryOffset + 8); // size
        headerBuf.writeUInt32LE(currentOffset, entryOffset + 12); // offset

        dataBuffers.push(buffer);
        currentOffset += buffer.length;
    }

    const icoBuffer = Buffer.concat([headerBuf, ...dataBuffers]);
    fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
    console.log(`Saved icon.ico (multi-size: ${sizes.join(', ')}) total size: ${icoBuffer.length} bytes`);
}

buildIcons().catch(err => {
    console.error(err);
    process.exit(1);
});
