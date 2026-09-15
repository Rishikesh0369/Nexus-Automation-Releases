/**
 * Nexus Automation - Automated GitHub Release & Publishing Engine
 * 
 * Orchestrates the full production release pipeline:
 *  1. Resolves and validates GH_TOKEN / GITHUB_TOKEN
 *  2. Archives prior build binaries to keep release artifacts clean
 *  3. Applies code hardening and obfuscation (RC4 string encryption & control-flow scrambling)
 *  4. Builds NSIS installer and publishes directly to GitHub Releases (Rishikesh0369/Nexus-Automation-Releases)
 *  5. Automatically restores clean source files after publishing
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DESKTOP_APP_DIR = path.join(ROOT_DIR, 'desktop-app');

// -------------------------------------------------------------
// 1. ENVIRONMENT & TOKEN RESOLUTION
// -------------------------------------------------------------
function loadEnvTokens() {
    const candidates = [
        path.join(DESKTOP_APP_DIR, 'electron-builder.env'),
        path.join(DESKTOP_APP_DIR, '.env'),
        path.join(ROOT_DIR, '.env')
    ];

    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split(/\r?\n/).forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...rest] = trimmed.split('=');
                    const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
                    if ((key.trim() === 'GH_TOKEN' || key.trim() === 'GITHUB_TOKEN') && val) {
                        if (!process.env[key.trim()]) {
                            process.env[key.trim()] = val;
                        }
                    }
                }
            });
        }
    }

    // Mirror token to both environment names
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (token) {
        process.env.GH_TOKEN = token;
        process.env.GITHUB_TOKEN = token;
    }
    return token;
}

function maskToken(token) {
    if (!token || token.length < 8) return '****';
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

// -------------------------------------------------------------
// 2. RUN COMMAND HELPER
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
// 3. MAIN RELEASE PIPELINE
// -------------------------------------------------------------
async function main() {
    console.log('===============================================================');
    console.log('  🚀 NEXUS AUTOMATION - GITHUB RELEASE ENGINE');
    console.log('  Repository: Rishikesh0369/Nexus-Automation-Releases');
    console.log('===============================================================\n');

    const targetVersion = process.argv[2];
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');

    // If targetVersion is provided, validate it against semver regex
    if (targetVersion && !targetVersion.startsWith('-')) {
        const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
        if (!SEMVER_REGEX.test(targetVersion)) {
            console.error(`❌ Error: Invalid semver version provided: "${targetVersion}".`);
            console.error(`   Expected format: X.Y.Z (e.g. 1.1.1, 1.2.0-beta.1)`);
            process.exit(1);
        }

        // Automatically read and update "version": targetVersion in:
        // - ./package.json
        // - ./desktop-app/package.json (if exists)
        const rootPkgPath = path.join(ROOT_DIR, 'package.json');
        if (fs.existsSync(rootPkgPath)) {
            const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
            rootPkg.version = targetVersion;
            fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf8');
            console.log(`📝 Updated root package.json version to ${targetVersion}`);
        }

        const desktopPkgPath = path.join(DESKTOP_APP_DIR, 'package.json');
        if (fs.existsSync(desktopPkgPath)) {
            const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
            desktopPkg.version = targetVersion;
            fs.writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + '\n', 'utf8');
            console.log(`📝 Updated desktop-app/package.json version to ${targetVersion}`);
        }
    }

    // 1. Resolve Token
    const ghToken = loadEnvTokens();
    if (!ghToken) {
        console.error('❌ Error: GH_TOKEN or GITHUB_TOKEN not found.');
        console.error('Please configure GH_TOKEN in desktop-app/electron-builder.env or as an environment variable.');
        process.exit(1);
    }
    console.log(`🔑 GitHub Authentication: Token detected (${maskToken(ghToken)})`);

    // 2. Check Package Configuration
    const desktopPkgPath = path.join(DESKTOP_APP_DIR, 'package.json');
    if (!fs.existsSync(desktopPkgPath)) {
        console.error(`❌ Error: Could not find ${desktopPkgPath}`);
        process.exit(1);
    }

    const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
    const version = desktopPkg.version || '1.1.0';
    const publishConfig = desktopPkg.build?.publish;

    console.log(`📦 Application Name:   ${desktopPkg.name || 'nexus-automation'}`);
    if (targetVersion && !targetVersion.startsWith('-')) {
        console.log(`🏷️ Release Version: v${targetVersion}`);
    } else {
        console.log(`🏷️ Release Version: v${version}`);
    }
    console.log(`🌐 Target Repository:  ${publishConfig?.owner}/${publishConfig?.repo}`);

    if (publishConfig?.owner !== 'Rishikesh0369' || publishConfig?.repo !== 'Nexus-Automation-Releases') {
        console.error(`⚠️ Warning: publish configuration does not match expected target:`);
        console.error(`   Found: ${publishConfig?.owner}/${publishConfig?.repo}`);
        console.error(`   Expected: Rishikesh0369/Nexus-Automation-Releases`);
        process.exit(1);
    }

    if (isDryRun) {
        console.log('\n[DRY-RUN] Pre-checks passed successfully. No build or publish performed.');
        process.exit(0);
    }

    let obfuscated = false;

    try {
        // Step A: Archive prior builds
        console.log('\n[1/3] 📦 Archiving previous build artifacts...');
        runCommand('node', ['archive_build.js'], DESKTOP_APP_DIR);

        // Step B: Obfuscate code
        console.log('\n[2/3] 🔒 Applying code hardening & obfuscation...');
        runCommand('node', ['obfuscate.js'], DESKTOP_APP_DIR);
        obfuscated = true;

        // Step C: Build & Publish via electron-builder
        console.log('\n[3/3] 🚢 Building installer and publishing directly to GitHub Releases...');
        runCommand('npx', ['electron-builder', '--publish', 'always'], DESKTOP_APP_DIR);

        console.log('\n===============================================================');
        console.log(`  🎉 RELEASE v${version} PUBLISHED SUCCESSFULLY!`);
        console.log(`  GitHub Releases: https://github.com/Rishikesh0369/Nexus-Automation-Releases/releases`);
        console.log('===============================================================\n');
    } catch (err) {
        console.error('\n❌ Release process encountered an error:', err.message);
        process.exitCode = 1;
    } finally {
        // Step D: Ensure local source files are restored to clean non-obfuscated state
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
