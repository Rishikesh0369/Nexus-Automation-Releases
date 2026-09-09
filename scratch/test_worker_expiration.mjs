import worker from '../worker/index.js';

async function runTests() {
    console.log('Testing Worker Verification & Renewal Schema...');

    const mockEnv = {
        ADMIN_PIN: '2026',
        ANTI_CAPTCHA_KEY: 'test-key'
    };

    // Test 1: Verify with expired license
    const reqExpired = new Request('https://api.example.com/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: 'TEST-EXPIRED-LICENSE' })
    });

    const resExpired = await worker.fetch(reqExpired, mockEnv);
    const dataExpired = await resExpired.json();

    console.log('\n--- Expired License Response ---');
    console.log('isExpired:', dataExpired.isExpired);
    console.log('expiresAt:', dataExpired.expiresAt);
    console.log('renewalConfig:', dataExpired.renewalConfig);
    console.log('manifest.renewalConfig:', dataExpired.manifest?.renewalConfig);

    if (dataExpired.isExpired !== true) {
        throw new Error('Expected isExpired to be true for TEST-EXPIRED-LICENSE');
    }
    if (!dataExpired.renewalConfig) {
        throw new Error('Expected renewalConfig in response');
    }
    if (dataExpired.renewalConfig.upiId !== '7004015687@upi') {
        throw new Error('Expected upiId to be 7004015687@upi');
    }
    if (dataExpired.renewalConfig.phone !== '+917004015687') {
        throw new Error('Expected phone to be +917004015687');
    }
    if (dataExpired.renewalConfig.whatsapp !== '7004015687') {
        throw new Error('Expected whatsapp to be 7004015687');
    }

    // Test 2: Verify with active license
    const reqActive = new Request('https://api.example.com/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: 'BELA-GAS-2026-NEXUS' })
    });

    const resActive = await worker.fetch(reqActive, mockEnv);
    const dataActive = await resActive.json();

    console.log('\n--- Active License Response ---');
    console.log('isExpired:', dataActive.isExpired);
    console.log('expiresAt:', dataActive.expiresAt);
    console.log('distributor:', dataActive.distributor);
    console.log('agencyName:', dataActive.agencyName);
    console.log('renewalConfig:', dataActive.renewalConfig);

    if (dataActive.agencyName !== 'Bela Bharat Gas Agency') {
        throw new Error(`Expected agencyName 'Bela Bharat Gas Agency', got '${dataActive.agencyName}'`);
    }

    console.log('\n✅ All Worker tests passed successfully!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
