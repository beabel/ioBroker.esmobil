const path = require('path');
const { tests } = require('@iobroker/testing');

// Starts the adapter against a real (temporary) js-controller instance and
// verifies it starts up cleanly without crashing, even without any school/
// credentials configured (as is the case in CI) - the adapter is expected to
// log warnings and skip the network calls in that case, not throw.
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Adapter startup', (getHarness) => {
            let harness;
            before(() => {
                harness = getHarness();
            });

            it('should start without crashing', async function () {
                this.timeout(60000);
                // If the adapter throws/crashes during startup, this promise rejects
                // and the test fails - that is the actual assertion here.
                await harness.startAdapterAndWait();
            });
        });
    }
});
