/**
 * Nexus Automation - Local Build Pipeline
 * 
 * Builds a local Windows standalone installer without publishing to GitHub:
 *  1. Optionally updates version in package.json and desktop-app/package.json if version argument provided
 *  2. Archives prior build binaries to keep output directory clean
 *  3. Applies code hardening & obfuscation (RC4 string encryption & control-flow scrambling)
 *  4. Builds NSIS installer with --publish never
 *  5. Always restores clean source files from backup in finally block
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DESKTOP_APP_DIR = path.join(ROOT_DIR, 'desktop-app');

// -------------------------------------------------------------
// 1. RUN COMMAND HELPER
// -------------------------------------------------------------
function runCommand(command, args, cwd) {
    console.log(`\n▶ Executing: ${command} ${args.join(' ')}`);
    const isWindows = process.platform === 'win32';
    const cmd = isWindows && !command.endsWith('.cmd') && !command.endsWith('.exe') && command !== 'node' ? `${command}.cmd` : command;
    
    const result = spawnSync(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: isWindows,
        env: { ...process.env }
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Command failed with exit code ${result.status}: ${command} ${args.join(' ')}`);
    }
}

// -------------------------------------------------------------
// 2. MAIN LOCAL BUILD PIPELINE
// -------------------------------------------------------------
async function main() {
    console.log('===============================================================');
    console.log('  🔨 NEXUS AUTOMATION - LOCAL BUILD ENGINE');
    console.log('  Mode: Standalone Windows Installer (Publish Never)');
    console.log('===============================================================\n');

    const targetVersion = process.argv[2];
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');

    // 1. Version Update Logic (if version argument provided)
    if (targetVersion && !targetVersion.startsWith('-')) {
        const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
        if (!SEMVER_REGEX.test(targetVersion)) {
            console.error(`❌ Error: Invalid semver version provided: "${targetVersion}".`);
            console.error(`   Expected format: X.Y.Z (e.g. 1.1.1, 1.2.0-beta.1)`);
            process.exit(1);
        }

        // Update root package.json
        const rootPkgPath = path.join(ROOT_DIR, 'package.json');
        if (fs.existsSync(rootPkgPath)) {
            const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
            rootPkg.version = targetVersion;
            fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf8');
            console.log(`📝 Updated root package.json version to ${targetVersion}`);
        }

        // Update desktop-app/package.json (if exists)
        const desktopPkgPath = path.join(DESKTOP_APP_DIR, 'package.json');
        if (fs.existsSync(desktopPkgPath)) {
            const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
            desktopPkg.version = targetVersion;
            fs.writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + '\n', 'utf8');
            console.log(`📝 Updated desktop-app/package.json version to ${targetVersion}`);
        }
    }

    // 2. Check Package Configuration
    const desktopPkgPath = path.join(DESKTOP_APP_DIR, 'package.json');
    if (!fs.existsSync(desktopPkgPath)) {
        console.error(`❌ Error: Could not find ${desktopPkgPath}`);
        process.exit(1);
    }

    const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
    const version = desktopPkg.version || '1.1.0';

    console.log(`📦 Application Name:   ${desktopPkg.name || 'nexus-automation'}`);
    if (targetVersion && !targetVersion.startsWith('-')) {
        console.log(`🏷️ Build Version:      v${targetVersion}`);
    } else {
        console.log(`🏷️ Build Version:      v${version}`);
    }
    console.log(`📁 Output Directory:  ${desktopPkg.build?.directories?.output || 'release'}`);

    if (isDryRun) {
        console.log('\n[DRY-RUN] Pre-checks passed successfully. No build performed.');
        process.exit(0);
    }

    let obfuscated = false;

    try {
        // Step 1: Run archive engine
        console.log('\n[1/3] 📦 Archiving previous build artifacts...');
        runCommand('node', ['archive_build.js'], DESKTOP_APP_DIR);

        // Step 2: Run code hardening
        console.log('\n[2/3] 🔒 Applying code hardening & obfuscation...');
        runCommand('node', ['obfuscate.js'], DESKTOP_APP_DIR);
        obfuscated = true;

        // Step 3: Run electron-builder locally
        console.log('\n[3/3] 🚢 Building local Windows installer via electron-builder (--publish never)...');
        runCommand('npx', ['electron-builder', '--win', '--publish', 'never'], DESKTOP_APP_DIR);

        console.log('\n===============================================================');
        console.log(`  🎉 LOCAL BUILD v${version} COMPLETED SUCCESSFULLY!`);
        console.log(`  Artifacts: ${path.join(DESKTOP_APP_DIR, desktopPkg.build?.directories?.output || 'release')}`);
        console.log('===============================================================\n');
    } catch (err) {
        console.error('\n❌ Local build process encountered an error:', err.message);
        process.exitCode = 1;
    } finally {
        // Step 4 (finally block): Always restore code
        if (obfuscated) {
            console.log('\n🔄 Restoring development source files from backup...');
            try {
                runCommand('node', ['obfuscate.js', '--restore'], DESKTOP_APP_DIR);
            } catch (restoreErr) {
                console.warn('⚠️ Warning during backup restoration:', restoreErr.message);
            }
        }
    }
}

main();
