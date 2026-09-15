/**
 * Nexus Automation - Code Hardening & Obfuscation Engine
 * Secures sensitive Playwright automation routines, licensing, and business logic
 * 
 * Target files:
 *  - bela_nexus_runner.js (Primary automation runner)
 *  - renderer.js (Optional: UI logic & client-side license checks)
 */

let fs;
try {
    fs = require('fs-extra');
} catch (e) {
    fs = require('fs');
}
const path = require('path');
const vm = require('vm');
const JavaScriptObfuscator = require('javascript-obfuscator');

/**
 * Node.js & Electron Safe Obfuscation Profile
 * - target: 'node' preserves require, __dirname, process, etc.
 * - renameGlobals: false keeps Electron & Node globals intact
 * - RC4 string encryption scrambles sensitive endpoints, selectors, and tokens
 */
const OBFUSCATION_OPTIONS = {
    target: 'node',                      // CRITICAL: prevents breaking require, __dirname, process
    compact: true,
    controlFlowFlattening: true,         // Scrambles the execution logic flow
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,          // Converts numbers (like ports/IDs) into math expressions
    simplify: true,
    stringArray: true,                   // Encrypts all strings, URLs, selectors, and license keys
    stringArrayEncoding: ['rc4'],        // Strong RC4 encryption for strings
    stringArrayThreshold: 0.8,
    splitStrings: true,
    splitStringsChunkLength: 5,
    renameGlobals: false,                // CRITICAL: keeps Electron & Node globals intact
    identifierNamesGenerator: 'hexadecimal'
};

/**
 * Locate candidate paths for a file (checking current directory and project root)
 * @param {string} filename 
 * @returns {string[]}
 */
function findCandidatePaths(filename) {
    if (path.isAbsolute(filename)) {
        return fs.existsSync(filename) ? [filename] : [];
    }

    const localPath = path.resolve(__dirname, filename);
    const directPath = path.resolve(filename);
    const parentPath = path.resolve(__dirname, '..', filename);
    const candidates = [];

    if (fs.existsSync(localPath)) {
        candidates.push(localPath);
    } else if (fs.existsSync(directPath)) {
        candidates.push(directPath);
    } else if (fs.existsSync(parentPath)) {
        candidates.push(parentPath);
    }

    return candidates;
}

/**
 * Checks if code has already been processed by javascript-obfuscator
 * @param {string} code 
 * @returns {boolean}
 */
function isCodeObfuscated(code) {
    return (
        code.includes('var _0x') ||
        code.includes('function _0x') ||
        code.includes('const _0x')
    );
}

/**
 * Obfuscates a single target file safely with automated backup and syntax validation.
 * @param {string} targetPath 
 * @param {Object} [customOptions={}]
 * @returns {boolean}
 */
function obfuscateFile(targetPath, customOptions = {}) {
    const filename = path.basename(targetPath);
    const backupPath = `${targetPath}.bak`;

    if (!fs.existsSync(targetPath)) {
        console.error(`[ERROR] File not found: ${targetPath}`);
        return false;
    }

    let sourceCode = fs.readFileSync(targetPath, 'utf8');

    // Prevent double-obfuscation: recover from clean backup if current file is already obfuscated
    if (isCodeObfuscated(sourceCode)) {
        if (fs.existsSync(backupPath)) {
            console.log(`[INFO] ${filename} is already obfuscated. Reading original source from ${path.basename(backupPath)}...`);
            sourceCode = fs.readFileSync(backupPath, 'utf8');
        } else {
            console.warn(`[WARN] ${filename} appears already obfuscated and no backup (.bak) was found.`);
        }
    } else {
        // Create backup of pristine source code
        fs.copyFileSync(targetPath, backupPath);
        console.log(`[BACKUP] Saved pristine backup: ${path.basename(backupPath)}`);
    }

    console.log(`[OBFUSCATE] Hardening ${filename} (${sourceCode.length} bytes)...`);
    const options = { ...OBFUSCATION_OPTIONS, ...customOptions };

    try {
        const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, options);
        const obfuscatedCode = obfuscationResult.getObfuscatedCode();

        // Safety verification: validate syntax before writing to disk
        new vm.Script(obfuscatedCode);

        fs.writeFileSync(targetPath, obfuscatedCode, 'utf8');
        console.log(`[SECURITY] ${filename} successfully obfuscated and hardened.`);
        return true;
    } catch (err) {
        console.error(`[SECURITY ERROR] Failed to obfuscate ${filename}:`, err.message);
        // If an error occurred and backup exists, ensure original is not corrupted
        if (fs.existsSync(backupPath) && fs.readFileSync(targetPath, 'utf8') !== sourceCode) {
            fs.copyFileSync(backupPath, targetPath);
            console.log(`[ROLLBACK] Restored original ${filename} due to obfuscation error.`);
        }
        return false;
    }
}

/**
 * Restores original file from .bak backup
 * @param {string} targetPath 
 * @returns {boolean}
 */
function restoreBackup(targetPath) {
    const filename = path.basename(targetPath);
    const backupPath = `${targetPath}.bak`;

    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, targetPath);
        console.log(`[RESTORE] Successfully restored ${filename} from ${path.basename(backupPath)}.`);
        return true;
    } else {
        console.warn(`[RESTORE] No backup file found for ${filename} at ${backupPath}`);
        return false;
    }
}

/**
 * CLI execution entrypoint
 */
function main() {
    const args = process.argv.slice(2);
    const isRestore = args.includes('--restore');
    const includeRenderer = args.includes('--all') || args.includes('--renderer') || args.includes('--with-renderer');
    const customFiles = args.filter(arg => !arg.startsWith('--'));

    console.log('='.repeat(65));
    console.log(`🛡️  NEXUS CODE HARDENING ENGINE - ${isRestore ? 'RESTORE MODE' : 'OBFUSCATE MODE'}`);
    console.log('='.repeat(65));

    // Determine target files
    let targetsToProcess = [];

    if (customFiles.length > 0) {
        // User provided specific files via CLI
        for (const file of customFiles) {
            const resolved = findCandidatePaths(file);
            if (resolved.length > 0) {
                targetsToProcess.push(...resolved);
            } else {
                targetsToProcess.push(path.resolve(file));
            }
        }
    } else {
        // Default target: bela_nexus_runner.js
        const runnerCandidates = findCandidatePaths('bela_nexus_runner.js');
        if (runnerCandidates.length > 0) {
            targetsToProcess.push(...runnerCandidates);
        } else {
            // Fallback default path if not yet created
            targetsToProcess.push(path.resolve(__dirname, '..', 'bela_nexus_runner.js'));
        }

        // Optional target: renderer.js
        if (includeRenderer) {
            const rendererCandidates = findCandidatePaths('renderer.js');
            if (rendererCandidates.length > 0) {
                targetsToProcess.push(...rendererCandidates);
            }
        }
    }

    // Deduplicate paths
    targetsToProcess = [...new Set(targetsToProcess)];

    let successCount = 0;
    for (const target of targetsToProcess) {
        if (isRestore) {
            if (restoreBackup(target)) successCount++;
        } else {
            if (obfuscateFile(target)) successCount++;
        }
    }

    console.log('-'.repeat(65));
    if (isRestore) {
        console.log(`[COMPLETED] Restored ${successCount}/${targetsToProcess.length} file(s).`);
    } else {
        console.log(`[COMPLETED] Hardened ${successCount}/${targetsToProcess.length} file(s).`);
        if (!includeRenderer && !args.some(a => a.includes('renderer.js'))) {
            console.log(`[TIP] To also obfuscate renderer.js, run: node obfuscate.js --renderer`);
        }
    }
    console.log('='.repeat(65));
}

// Export functions for programmatic use & run CLI if called directly
module.exports = {
    obfuscateFile,
    restoreBackup,
    OBFUSCATION_OPTIONS,
    findCandidatePaths,
    main
};

if (require.main === module) {
    main();
}
