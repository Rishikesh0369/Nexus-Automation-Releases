/**
 * Nexus Automation - Protected Production Build (Non-Destructive Obfuscation)
 * =============================================================================
 * Unlike obfuscate.js (which hardens files IN PLACE with .bak backups), this
 * step reads the pristine source and writes OBFUSCATED COPIES into an
 * intermediate staging folder. The original source tree is never touched, so
 * the working directory stays clean and there is no restore step to forget.
 *
 * electron-builder.protected.json then packages main.js / renderer.js /
 * scrapers/** from this staging folder, while every other asset (preload.js,
 * index.html, node_modules, assets, ...) is pulled straight from source.
 *
 * Targets (and ONLY these, per the production hardening spec):
 *   - main.js          (electron main process; electron + IPC names reserved)
 *   - renderer.js      (renderer / UI + client-side license checks)
 *   - scrapers (all .js under it; Playwright scraping + business logic)
 *
 * NOTE: bela_nexus_runner.js is intentionally out of scope here - it is still
 * handled by the legacy obfuscate.js flow used by dist/build/release.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Reuse the vetted, Electron-safe obfuscation profile as the single source of
// truth (target:'node', renameGlobals:false, RC4 string encryption, ...).
const { OBFUSCATION_OPTIONS } = require('./obfuscate.js');

const SRC_DIR = __dirname;
const OUT_DIR = path.join(__dirname, 'build-obfuscated');

/**
 * Identifiers that MUST survive obfuscation untouched so the Electron main
 * process and its IPC bridge keep working. renameGlobals:false already spares
 * top-level bindings, but reserving them explicitly documents the contract and
 * guards against any future profile change. Each entry is a regex string that
 * javascript-obfuscator matches against identifier names.
 */
const ELECTRON_IPC_RESERVED_NAMES = [
    '^app$', '^BrowserWindow$', '^ipcMain$', '^ipcRenderer$', '^dialog$',
    '^shell$', '^Notification$', '^nativeImage$', '^contextBridge$',
    '^screen$', '^webContents$', '^Menu$', '^Tray$',
    '^require$', '^module$', '^exports$', '^process$', '^__dirname$', '^__filename$'
];

// Keep the electron module specifier out of the encrypted string array. String
// encryption preserves runtime equality either way, but leaving these literal
// avoids any ambiguity around require('electron') and the IPC keyword contract.
const ELECTRON_IPC_RESERVED_STRINGS = ['electron'];

/**
 * Per-file obfuscation options. main.js gets the electron/IPC reservations
 * layered on top of the shared profile; the rest use the profile as-is.
 * @param {string} relPath  path relative to SRC_DIR (posix-ish)
 * @returns {Object}
 */
function optionsFor(relPath) {
    const isMain = relPath === 'main.js';
    if (!isMain) {
        return { ...OBFUSCATION_OPTIONS };
    }
    return {
        ...OBFUSCATION_OPTIONS,
        reservedNames: [
            ...(OBFUSCATION_OPTIONS.reservedNames || []),
            ...ELECTRON_IPC_RESERVED_NAMES
        ],
        reservedStrings: [
            ...(OBFUSCATION_OPTIONS.reservedStrings || []),
            ...ELECTRON_IPC_RESERVED_STRINGS
        ]
    };
}

/**
 * Collect the concrete files to protect. scrapers/ is walked recursively so any
 * future scraper module is picked up automatically.
 * @returns {string[]} paths relative to SRC_DIR
 */
function collectTargets() {
    const targets = ['main.js', 'renderer.js'];

    const scrapersDir = path.join(SRC_DIR, 'scrapers');
    if (fs.existsSync(scrapersDir)) {
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(abs);
                } else {
                    targets.push(path.relative(SRC_DIR, abs).split(path.sep).join('/'));
                }
            }
        };
        walk(scrapersDir);
    }

    // Only real, existing files.
    return targets.filter((rel) => fs.existsSync(path.join(SRC_DIR, rel)));
}

/**
 * Obfuscate one source file into OUT_DIR, preserving its relative path.
 * Non-JS files (e.g. a data file dropped into scrapers/) are copied verbatim.
 * @param {string} rel  path relative to SRC_DIR
 * @returns {boolean}
 */
function protectFile(rel) {
    const srcPath = path.join(SRC_DIR, rel);
    const outPath = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    if (!rel.endsWith('.js')) {
        fs.copyFileSync(srcPath, outPath);
        console.log(`[COPY]      ${rel} (non-JS, copied verbatim)`);
        return true;
    }

    const sourceCode = fs.readFileSync(srcPath, 'utf8');
    console.log(`[OBFUSCATE] ${rel} (${sourceCode.length} bytes)...`);

    try {
        const obfuscated = JavaScriptObfuscator
            .obfuscate(sourceCode, optionsFor(rel))
            .getObfuscatedCode();

        // Fail fast: reject syntactically broken output before it reaches the
        // packager rather than shipping a corrupt build.
        new vm.Script(obfuscated);

        fs.writeFileSync(outPath, obfuscated, 'utf8');
        console.log(`[OK]        ${rel} -> build-obfuscated/${rel}`);
        return true;
    } catch (err) {
        console.error(`[ERROR]     Failed to obfuscate ${rel}: ${err.message}`);
        return false;
    }
}

function main() {
    console.log('='.repeat(70));
    console.log('🛡️  NEXUS PROTECTED BUILD - Non-Destructive Obfuscation Stage');
    console.log('='.repeat(70));

    // Start from a clean staging folder so stale files can never leak into a build.
    if (fs.existsSync(OUT_DIR)) {
        fs.rmSync(OUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`[STAGE]     Intermediate folder: ${path.relative(process.cwd(), OUT_DIR) || OUT_DIR}`);

    const targets = collectTargets();
    console.log(`[STAGE]     Protecting ${targets.length} file(s): ${targets.join(', ')}`);
    console.log('-'.repeat(70));

    let ok = 0;
    for (const rel of targets) {
        if (protectFile(rel)) ok++;
    }

    console.log('-'.repeat(70));
    console.log(`[DONE]      Hardened ${ok}/${targets.length} file(s) into build-obfuscated/`);
    console.log('='.repeat(70));

    if (ok !== targets.length) {
        process.exitCode = 1; // Abort the && chain before electron-builder runs.
    }
}

module.exports = {
    OUT_DIR,
    collectTargets,
    optionsFor,
    protectFile,
    ELECTRON_IPC_RESERVED_NAMES,
    ELECTRON_IPC_RESERVED_STRINGS,
    main
};

if (require.main === module) {
    main();
}
