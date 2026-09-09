/**
 * Unit Test for Playwright Automation Stop & Abort Lifecycle
 * Verifies activeBrowser reference, isAborted flag, and break points in runCancellation.
 */

const assert = require('assert');
const runner = require('../desktop-app/bela_nexus_runner');

async function testRunnerStopLifecycle() {
    console.log('--- Testing bela_nexus_runner Stop & Abort Lifecycle ---');

    // 1. Initial State
    runner.resetStopAutomation();
    assert.strictEqual(runner.isAborted, false, 'isAborted should be false initially');
    assert.strictEqual(runner.activeBrowser, null, 'activeBrowser should be null initially');
    console.log('1. Initial state verified: isAborted=false, activeBrowser=null');

    // 2. Mock browser instance
    let closed = false;
    const mockBrowser = {
        close: async () => {
            closed = true;
        }
    };

    // Simulate setting activeBrowser when launched
    runner.activeBrowser = mockBrowser;
    assert.strictEqual(runner.activeBrowser, mockBrowser, 'activeBrowser should hold mockBrowser instance');
    console.log('2. Browser reference assignment verified');

    // 3. Trigger stop automation
    await runner.requestStopAutomation();
    assert.strictEqual(runner.isAborted, true, 'isAborted should be true after requestStopAutomation');
    assert.strictEqual(closed, true, 'activeBrowser.close() should be awaited and called');
    assert.strictEqual(runner.activeBrowser, null, 'activeBrowser should be reset to null after close');
    console.log('3. Stop automation termination verified: browser closed, activeBrowser=null, isAborted=true');

    // 4. Test runCancellation early abort before customer processing
    console.log('4. Testing runCancellation abort check before customer processing...');
    runner.resetStopAutomation();
    runner.setIsAborted(true); // Pre-set abort flag

    const createMockPage = (onLnkCancel) => ({
        locator: () => ({
            filter: () => ({
                first: () => ({
                    hover: async () => {},
                    click: async () => {}
                })
            }),
            first: () => ({
                hover: async () => {},
                click: async () => {}
            })
        }),
        context: () => ({
            waitForEvent: async () => ({
                waitForLoadState: async () => {},
                waitForTimeout: async () => {},
                locator: (sel) => {
                    if (sel && sel.includes('lnkCancel') && onLnkCancel) {
                        return onLnkCancel();
                    }
                    return {
                        filter: () => ({
                            first: () => ({ click: async () => {} })
                        }),
                        first: () => ({ click: async () => {} })
                    };
                },
                evaluate: async () => {},
                fill: async () => {},
                click: async () => {},
                textContent: async () => 'Successfully',
                isClosed: () => false,
                close: async () => {}
            })
        }),
        waitForTimeout: async () => {}
    });

    const mockPage = createMockPage();
    const stats = await runner.runCancellation(mockPage, ['1001', '1002', '1003']);
    assert.strictEqual(stats.stopped, true, 'Stats stopped should be true');
    assert.strictEqual(stats.processed, 0, 'No customers should be processed when pre-aborted');
    console.log('4. runCancellation aborted cleanly before customer processing: verified');

    // 5. Test runCancellation early abort immediately before cancelLink.click()
    console.log('5. Testing runCancellation abort check immediately before cancelLink.click()...');
    runner.resetStopAutomation();

    let cancelLinkClickCalled = false;
    const mockPage2 = createMockPage(() => ({
        isVisible: async () => {
            // Set isAborted = true right before click would occur
            runner.setIsAborted(true);
            return true;
        },
        click: async () => {
            cancelLinkClickCalled = true;
            throw new Error('cancelLink.click() MUST NOT be called if aborted!');
        }
    }));

    const stats2 = await runner.runCancellation(mockPage2, ['2001', '2002']);
    assert.strictEqual(cancelLinkClickCalled, false, 'cancelLink.click() was aborted before click');
    assert.strictEqual(stats2.stopped, true, 'Stats2 stopped should be true');
    console.log('5. runCancellation break before cancelLink.click() verified');

    // Cleanup
    runner.resetStopAutomation();

    console.log('\n=============================================');
    console.log('ALL RUNNER STOP LIFECYCLE TESTS PASSED! 🎉');
    console.log('=============================================');
}

testRunnerStopLifecycle().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
