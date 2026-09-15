/**
 * Nexus Automation - GitHub Direct Publishing Engine
 * 
 * Uploads existing built installer and update artifacts directly to GitHub Releases
 * without re-running code obfuscation or archiving existing builds:
 *  1. Injects environment from desktop-app/electron-builder.env (or fallback .env files)
 *  2. Validates GH_TOKEN / GITHUB_TOKEN
 *  3. Executes `npx electron-builder --win --publish always` in desktop-app/
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
// 3. MAIN PUBLISH-ONLY PIPELINE
// -------------------------------------------------------------
async function main() {
    console.log('===============================================================');
    console.log('  🚀 NEXUS AUTOMATION - GITHUB PUBLISH-ONLY ENGINE');
    console.log('  Mode: Upload Existing Build Artifacts Directly');
    console.log('  Repository: Rishikesh0369/Nexus-Automation-Releases');
    console.log('===============================================================\n');

    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');

    // 1. Resolve & Inject Environment Tokens
    const ghToken = loadEnvTokens();
    if (!ghToken) {
        console.error('❌ Error: GH_TOKEN or GITHUB_TOKEN not found.');
        console.error('Please configure GH_TOKEN in desktop-app/electron-builder.env or as an environment variable.');
        process.exit(1);
    }
    console.log(`🔑 GitHub Authentication: Token detected (${maskToken(ghToken)})`);

    // 2. Read Package Configuration
    const desktopPkgPath = path.join(DESKTOP_APP_DIR, 'package.json');
    if (!fs.existsSync(desktopPkgPath)) {
        console.error(`❌ Error: Could not find ${desktopPkgPath}`);
        process.exit(1);
    }

    const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
    const version = desktopPkg.version || '1.1.0';
    const publishConfig = desktopPkg.build?.publish;

    console.log(`📦 Application Name:   ${desktopPkg.name || 'nexus-automation'}`);
    console.log(`🏷️ Publish Version:    v${version}`);
    console.log(`🌐 Target Repository:  ${publishConfig?.owner}/${publishConfig?.repo}`);

    if (publishConfig?.owner !== 'Rishikesh0369' || publishConfig?.repo !== 'Nexus-Automation-Releases') {
        console.error(`⚠️ Warning: publish configuration does not match expected target:`);
        console.error(`   Found: ${publishConfig?.owner}/${publishConfig?.repo}`);
        console.error(`   Expected: Rishikesh0369/Nexus-Automation-Releases`);
        process.exit(1);
    }

    // 3. Check Existing Build Artifacts
    const outputDir = path.join(DESKTOP_APP_DIR, desktopPkg.build?.directories?.output || 'release');
    if (fs.existsSync(outputDir)) {
        const artifacts = fs.readdirSync(outputDir).filter(f => f.endsWith('.exe') || f.endsWith('.yml') || f.endsWith('.blockmap'));
        console.log(`📂 Existing release artifacts in ${path.relative(ROOT_DIR, outputDir)}:`);
        if (artifacts.length === 0) {
            console.warn('   ⚠️ No built .exe or update metadata files found. electron-builder will generate and publish.');
        } else {
            artifacts.forEach(f => console.log(`   - ${f}`));
        }
    }

    if (isDryRun) {
        console.log('\n[DRY-RUN] Pre-checks passed successfully. No publish performed.');
        process.exit(0);
    }

    try {
        console.log('\n🚢 Uploading build artifacts to GitHub Releases...');
        runCommand('npx', ['electron-builder', '--win', '--publish', 'always'], DESKTOP_APP_DIR);

        console.log('\n===============================================================');
        console.log(`  🎉 RELEASE v${version} PUBLISHED TO GITHUB SUCCESSFULLY!`);
        console.log(`  GitHub Releases: https://github.com/Rishikesh0369/Nexus-Automation-Releases/releases`);
        console.log('===============================================================\n');
    } catch (err) {
        console.error('\n❌ Publish process encountered an error:', err.message);
        process.exitCode = 1;
    }
}

main();
