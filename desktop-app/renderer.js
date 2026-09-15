// -------------------------------------------------------------
// BELA BHARAT GAS NEXUS - RENDERER SCRIPT
// -------------------------------------------------------------

const WORKER_BASE_URL = (window.electronAPI && window.electronAPI.workerBaseUrl) || 'https://bharatgas-api.www-rishikesh111.workers.dev';
window.WORKER_BASE_URL = WORKER_BASE_URL;
const ipcRenderer = (typeof window !== 'undefined' && window.ipcRenderer) || (typeof require !== 'undefined' ? require('electron').ipcRenderer : null);

window.testNotification = async () => {
    await ipcRenderer.invoke('trigger-test-toast');
    console.log('Liquid-glass toast triggered.');
};

document.addEventListener('DOMContentLoaded', async () => {
    // Tab Elements
    const tabBtnDashboard = document.getElementById('tabBtnDashboard');
    const tabBtnSettings = document.getElementById('tabBtnSettings');
    const sectionDashboard = document.getElementById('sectionDashboard');
    const sectionSettings = document.getElementById('sectionSettings');

    // Dashboard UI Elements
    const statusPulseDot = document.getElementById('statusPulseDot');
    const statusBadgeText = document.getElementById('statusBadgeText');
    const statusDetailText = document.getElementById('statusDetailText');
    const currentStateText = document.getElementById('currentStateText') || statusDetailText;
    const liveProgressSummary = document.getElementById('liveProgressSummary');

    const btnStartCancellation = document.getElementById('btnStartCancellation');
    const btnStartText = document.getElementById('btnStartText');
    const playIcon = btnStartCancellation.querySelector('.play-icon');
    const stopIcon = btnStartCancellation.querySelector('.stop-icon');
    const spinnerIcon = btnStartCancellation.querySelector('.spinner-icon');

    const progressBarFill = document.getElementById('progressBarFill');
    const progressPercentageText = document.getElementById('progressPercentageText');

    const statTotal = document.getElementById('statTotal');
    const statProcessed = document.getElementById('statProcessed');
    const statSuccess = document.getElementById('statSuccess');
    const statFailed = document.getElementById('statFailed');
    const statSkipped = document.getElementById('statSkipped');

    const terminalConsole = document.getElementById('terminalConsole');
    const btnClearLogs = document.getElementById('btnClearLogs');

    // Settings UI Elements
    const inputBpclUser = document.getElementById('bpcl-user') || document.getElementById('inputUserId') || document.getElementById('txtBpclUserId');
    const inputBpclPassword = document.getElementById('bpcl-password') || document.getElementById('inputPassword') || document.getElementById('txtBpclPassword');
    const inputLicenseKey = document.getElementById('inputLicenseKey') || document.getElementById('txtLicenseKey');
    const selectBrowserChannel = document.getElementById('selectBrowserChannel');
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    const btnClearSettings = document.getElementById('btnClearSettings');

    // In-memory cache for credentials retrieved via IPC/store
    let cachedCredentials = {
        bpclUserId: '',
        bpclPassword: '',
        licenseKey: '',
        agencyName: '',
        browserChannel: 'chrome',
        expiresAt: ''
    };
    const saveStatusToast = document.getElementById('saveStatusToast');
    const settingsExpiryBadge = document.getElementById('settingsExpiryBadge');
    const settingsExpiryDateText = document.getElementById('settingsExpiryDateText');
    const dashboardExpiryWarning = document.getElementById('dashboardExpiryWarning');
    const dashboardExpiryWarningText = document.getElementById('dashboardExpiryWarningText');

    // Header & Agency Display
    const agencyBadge = document.getElementById('agencyBadge') || document.getElementById('agencyDisplay');
    const agencyDisplay = agencyBadge;
    let currentAgencyName = '';

    // Subscription Expiry UI Elements
    const subscriptionExpiryBanner = document.getElementById('subscriptionExpiryBanner');
    const expiryBannerMessage = document.getElementById('expiryBannerMessage');
    const banner = document.getElementById('banner') || expiryBannerMessage || subscriptionExpiryBanner;
    const btnRenewLicense = document.getElementById('btnRenewLicense');
    const btnBannerOpenSettings = document.getElementById('btnBannerOpenSettings');
    let isSubscriptionExpired = false;
    let currentExpiresAt = window.currentLicenseExpiresAt || '';
    window.currentLicenseExpiresAt = currentExpiresAt;
    window.currentServerErrorMessage = window.currentServerErrorMessage || '';

    // Subscription Renewal Hub Elements
    const renewalModal = document.getElementById('licenseRenewalModal') || document.getElementById('renewalModal');
    const btnCloseRenewalModal = document.getElementById('btnCloseRenewalModal');
    const renewalModalStatusText = document.getElementById('renewalModalStatusText');
    const renewalBanner = document.getElementById('renewalBanner') || renewalModalStatusText;
    const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
    const hubPayableAmount = document.getElementById('hubPayableAmount');
    const renewalQrImg = document.getElementById('renewalQrImg');
    const vpaAddressText = document.getElementById('vpaAddressText');
    const vpaPayableText = document.getElementById('vpaPayableText');
    const btnCopyVpa = document.getElementById('btnCopyVpa');
    const copyBtnText = document.getElementById('copyBtnText');
    const copyIcon = document.getElementById('copyIcon');
    const linkWaSupport = document.getElementById('linkWaSupport');
    const licenseExpiredDateDisplay = document.getElementById('licenseExpiredDateDisplay');

    let selectedRenewalPlan = {
        id: '1-month',
        name: '1 Month',
        price: '₹699',
        priceNum: 699,
        label: '1 Month (₹699)'
    };

    const RENEWAL_WA_PHONE = '917004015687';

    function getActiveAgencyName() {
        return (typeof currentAgencyName !== 'undefined' && currentAgencyName && currentAgencyName.trim()) 
            || (document.getElementById('agencyDisplay') ? document.getElementById('agencyDisplay').textContent.replace(/^[🟢🔴⚪\s]+/, '').trim() : '')
            || (document.getElementById('inputAgencyName') ? document.getElementById('inputAgencyName').value.trim() : '')
            || '';
    }

    function buildWhatsAppVerificationUrl(planLabel) {
        const agency = getActiveAgencyName();
        const message = `Payment Verification for Nexus Automation License.\nPlan: ${planLabel}\n\nPlease find attached the payment screenshot.\nAgency Name: ${agency}`;
        return `https://wa.me/${RENEWAL_WA_PHONE}?text=${encodeURIComponent(message)}`;
    }

    function updateRenewalPlanUI(planId) {
        if (planId === '3-month') {
            selectedRenewalPlan = {
                id: '3-month',
                name: '3 Months',
                price: '₹1,999',
                priceNum: 1999,
                label: '3 Months (₹1,999)'
            };
        } else {
            selectedRenewalPlan = {
                id: '1-month',
                name: '1 Month',
                price: '₹699',
                priceNum: 699,
                label: '1 Month (₹699)'
            };
        }

        const cards = document.querySelectorAll('.renewal-plans-grid .plan-card');
        cards.forEach(card => {
            if (card.dataset.plan === selectedRenewalPlan.id) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        const payableEl = document.getElementById('hubPayableAmount') || document.getElementById('qrPayableAmount');
        if (payableEl) {
            payableEl.textContent = selectedRenewalPlan.price;
        }

        const vpaPayableEl = document.getElementById('vpaPayableText');
        if (vpaPayableEl) {
            vpaPayableEl.textContent = selectedRenewalPlan.price;
        }
    }

    async function copyUpiVpaAddress() {
        const vpaEl = document.getElementById('vpaAddressText');
        const vpa = (vpaEl ? vpaEl.textContent.trim() : '') || 'mars@pingpay';
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(vpa);
            } else {
                const temp = document.createElement('textarea');
                temp.value = vpa;
                document.body.appendChild(temp);
                temp.select();
                document.execCommand('copy');
                temp.remove();
            }
            const copyBtn = document.getElementById('btnCopyVpa');
            const btnText = document.getElementById('copyBtnText');
            if (btnText) btnText.textContent = 'Copied!';
            if (copyBtn) copyBtn.classList.add('copied');
            setTimeout(() => {
                if (btnText) btnText.textContent = 'Copy UPI';
                if (copyBtn) copyBtn.classList.remove('copied');
            }, 2500);
        } catch (err) {
            console.error('Failed to copy UPI ID:', err);
        }
    }

    async function loadCloudflareQrCode() {
        const qrImg = document.getElementById('renewalQrImg');
        if (!qrImg) return;
        try {
            let base64 = null;
            if (window.electronAPI && typeof window.electronAPI.fetchCloudflareQr === 'function') {
                base64 = await window.electronAPI.fetchCloudflareQr();
            } else if (window.ipcRenderer && typeof window.ipcRenderer.invoke === 'function') {
                base64 = await window.ipcRenderer.invoke('fetch-cloudflare-qr');
            }
            if (base64) {
                qrImg.src = base64;
            }
        } catch (err) {
            console.error('[RENEWAL] Failed to fetch Base64 QR code:', err);
        }
    }

    // Update Notification UI Elements
    const updateBadge = document.getElementById('update-badge');
    const updateSpinner = updateBadge ? updateBadge.querySelector('.update-spinner') : null;
    const updatePercentText = document.getElementById('update-percent-text');
    const updateProgressBar = document.getElementById('update-progress-bar');
    const btnUpdatePill = document.getElementById('btn-update-pill');
    const updateBtn = document.getElementById('update-btn') || updateBadge;
    const updateModal = document.getElementById('updateModalOverlay') || document.getElementById('update-ready-modal') || document.getElementById('updateModal');
    const modalVersionInfo = document.getElementById('modalVersionInfo');
    const modalTargetVersion = document.getElementById('modalTargetVersion');
    const modalCurrentVersion = document.getElementById('modalCurrentVersion');
    const modalTargetVersionHighlight = document.getElementById('modalTargetVersionHighlight');
    const btnUpdateLater = document.getElementById('btnUpdateLater');
    const btnOpenAgain = document.getElementById('btnUpdateApply') || document.getElementById('btnOpenAgain') || document.getElementById('btnUpdateNow');
    const btnUpdateNow = btnOpenAgain;

    // Stop Confirmation Modal UI Elements
    const stopConfirmModal = document.getElementById('stopConfirmModal');
    const btnConfirmStop = document.getElementById('btnConfirmStop');
    const btnKeepRunning = document.getElementById('btnKeepRunning');
    const btnStopExplicit = document.getElementById('btnStop');

    // Start Confirmation Modal UI Elements
    const startConfirmModal = document.getElementById('startConfirmModal');
    const btnConfirmStart = document.getElementById('btnConfirmStart');
    const btnCancelStart = document.getElementById('btnCancelStart');

    // Subtle OTA Background Update Elements
    const otaUpdateBanner = document.getElementById('otaUpdateBanner');
    const btnOtaRestart = document.getElementById('btnOtaRestart');
    const btnOtaDismiss = document.getElementById('btnOtaDismiss');

    // Execution Report & Completion UI Elements
    const reportActionContainer = document.getElementById('reportActionContainer');
    const reportSuccessBadge = document.getElementById('reportSuccessBadge');
    const reportBadgeText = document.getElementById('reportBadgeText');
    const btnOpenReport = document.getElementById('btnOpenReport');
    let latestReportPath = null;

    function showReportAction(reportPath, isStopped = false) {
        if (!reportPath) return;
        latestReportPath = reportPath;
        if (reportActionContainer) {
            reportActionContainer.classList.remove('hidden');
        }
        if (reportBadgeText) {
            reportBadgeText.textContent = isStopped ? 'Stopped (Report Ready)' : 'Process Complete';
        }
    }

    if (btnOpenReport) {
        btnOpenReport.addEventListener('click', async () => {
            if (latestReportPath && window.electronAPI && window.electronAPI.openReport) {
                const reportFileName = latestReportPath.split(/[\/\\]/).pop();
                appendLog(`📄 Launching CSV Execution Report in Excel: ${reportFileName}`, 'system');
                const res = await window.electronAPI.openReport(latestReportPath);
                if (res && !res.success && res.message) {
                    appendLog(`⚠️ Could not open report: ${String(res.message).replace(/[A-Za-z]:\\[Uu]sers\\[^\\]+\\[^\s:)]+/gi, '[path]')}`, 'warn');
                }
            } else {
                appendLog('⚠️ No execution report path available.', 'warn');
            }
        });
    }

    if (btnOtaRestart) {
        btnOtaRestart.addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.restartApp) {
                appendLog('🔄 Restarting application to apply update...', 'system');
                await window.electronAPI.restartApp();
            }
        });
    }

    if (btnOtaDismiss) {
        btnOtaDismiss.addEventListener('click', () => {
            if (otaUpdateBanner) {
                otaUpdateBanner.classList.add('hidden');
            }
        });
    }

    let currentAppVersion = '1.0.0';
    let availableUpdateInfo = null;
    let isLicenseValid = false;

    // Dedicated delivery-report state readout. Separate elements from the cash
    // memo card, so neither automation's status text can overwrite the other's.
    const deliveryStateBadge = document.getElementById('deliveryStateBadge');
    const deliveryStateTitle = document.getElementById('deliveryStateTitle');
    const deliveryStateSummary = document.getElementById('deliveryStateSummary');

    const DELIVERY_IDLE_SUMMARY = 'No active run. Ready to extract drilldown details.';
    const DELIVERY_CONFIG_SUMMARY = 'Check credentials in Settings before fetching report.';

    const DELIVERY_STATES = {
        idle: { title: 'Ready For Delivery Report', badge: 'Idle', pill: 'status-idle' },
        running: { title: 'Extracting Delivery Records...', badge: 'Running', pill: 'status-running' },
        stopped: { title: 'Fetching Stopped by User', badge: 'Stopped', pill: 'status-stopped' },
        success: { title: 'Report Generated Successfully', badge: 'Success', pill: 'status-completed' },
        error: { title: 'Delivery Report Failed', badge: 'Error', pill: 'status-error' },
        // Invalid / expired / unverified license. Uses the same status-error
        // pill the cash memo card shows for a configuration error.
        config: { title: 'Process halted due to an issue.', badge: 'Configuration Error', pill: 'status-error' }
    };

    // The last non-error summary, so restoring from a config error puts back
    // the cached-report line rather than the credentials warning.
    let lastDeliverySummary = DELIVERY_IDLE_SUMMARY;
    let currentDeliveryStateKey = 'idle';

    /**
     * Drive the Delivery Report state card.
     *
     * @param {string} key   one of DELIVERY_STATES
     * @param {string} [summary] optional detail line; omit to leave it as-is
     */
    function setDeliveryState(key, summary) {
        const state = DELIVERY_STATES[key] || DELIVERY_STATES.idle;
        currentDeliveryStateKey = DELIVERY_STATES[key] ? key : 'idle';
        if (deliveryStateTitle) deliveryStateTitle.textContent = state.title;
        if (deliveryStateBadge) {
            deliveryStateBadge.textContent = `• ${state.badge}`;
            deliveryStateBadge.className = `status-pill ${state.pill}`;
        }
        if (summary !== undefined && deliveryStateSummary) {
            deliveryStateSummary.textContent = summary;
            if (key !== 'config') { lastDeliverySummary = summary; }
        }
    }

    // Detail line only, leaving the title/badge untouched (live progress).
    function setDeliverySummary(text) {
        if (!text) return;
        lastDeliverySummary = text;
        // Startup hydration can land after the license has already failed -
        // remember the cached-report line, but don't paint over the
        // credentials warning while the card is in the error state.
        if (currentDeliveryStateKey === 'config') return;
        if (deliveryStateSummary) deliveryStateSummary.textContent = text;
    }

    /**
     * Mirror the license verdict onto the Delivery Report state card, so it
     * shows the same configuration error the cash memo card does instead of
     * sitting on a stale "Ready For Delivery Report".
     */
    function applyDeliveryLicenseState(isValid) {
        // A live run owns the card - a re-verification must not reset it.
        if (window.__nexusDeliveryFetchRunning) return;

        if (isValid) {
            setDeliveryState('idle', lastDeliverySummary);
        } else {
            setDeliveryState('config', DELIVERY_CONFIG_SUMMARY);
        }
    }

    // ---------------------------------------------------------
    // LICENSE-GATED CONTROLS
    // ---------------------------------------------------------
    // Keeps every license-dependent control in step with the Cloudflare
    // Worker verdict. The Delivery Report button is resolved lazily by id
    // (never captured in a closure variable) because this function is called
    // during verification, before the delivery-report block further down in
    // this same DOMContentLoaded handler has run.
    function updateLicenseUIState(isValid) {
        // Published so the automation lock (and anything else that needs to
        // restore a button) can read the last known verdict.
        window.__currentLicenseValid = Boolean(isValid);

        const btnFetch = document.getElementById('btnFetchDeliveryReport');
        if (!btnFetch) return;

        // While a report is actually being fetched this button IS the Stop
        // control - locking it would strand the user in a running scrape.
        if (!isValid && window.__nexusDeliveryFetchRunning) return;

        // Keep the Delivery Report state card in step with the verdict. Note
        // #btnOpenLastReport is deliberately NOT touched: cached records stay
        // viewable offline even when the credentials are rejected.
        applyDeliveryLicenseState(isValid);

        // A running cancellation owns the automation slot; the mutual-exclusion
        // lock keeps this button down regardless of the license verdict.
        if (activeAutomation === 'cancellation') {
            updateAutomationLockState('cancellation');
            return;
        }

        btnFetch.disabled = !isValid;
        btnFetch.style.opacity = isValid ? '1' : '0.35';
        btnFetch.style.pointerEvents = isValid ? 'auto' : 'none';
        btnFetch.title = isValid
            ? 'Fetch the latest E-Day End delivery report'
            : 'Unavailable: your BPCL User ID / License Key is not valid.';
    }
    window.updateLicenseUIState = updateLicenseUIState;

    // ---------------------------------------------------------
    // MUTUAL EXCLUSION: ONE AUTOMATION AT A TIME
    // ---------------------------------------------------------
    // Cancellation and the delivery report share one BPCL session, so exactly
    // one may hold the "automation slot". Whichever is running locks the
    // other's button outright (disabled + dimmed + click-through disabled).
    //
    // Buttons are resolved by id on each call rather than captured, because
    // this runs during license verification - before the delivery-report block
    // further down this handler has executed.
    let activeAutomation = null; // 'cancellation' | 'delivery_report' | null

    function updateAutomationLockState(activeProcess) {
        activeAutomation = activeProcess || null;
        window.__activeAutomation = activeAutomation;

        const btnCancel = document.getElementById('btnStartCancellation')
            || document.querySelector('[data-action="start-cancellation"]');
        const btnFetch = document.getElementById('btnFetchDeliveryReport');

        // The owner's own button must stay usable - it is the Stop control.
        // Clearing any lock styling it picked up from a previous owner makes
        // this safe whichever order the two lifecycles fire in. `disabled` is
        // deliberately left alone: setButtonState / setDeliveryButtonState own
        // it (a 'stopping' state disables the button on purpose).
        const clearLockStyling = (btn) => {
            if (!btn) return;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            btn.title = '';
        };

        if (activeProcess === 'cancellation') {
            // Cash memo is running: lock fetch report completely.
            clearLockStyling(btnCancel);
            if (btnFetch) {
                btnFetch.disabled = true;
                btnFetch.style.opacity = '0.3';
                btnFetch.style.pointerEvents = 'none';
                btnFetch.title = 'Cannot fetch report while Cash Memo Cancellation is running';
            }
        } else if (activeProcess === 'delivery_report') {
            // Delivery report is running: lock cash memo cancellation completely.
            clearLockStyling(btnFetch);
            if (btnCancel) {
                btnCancel.disabled = true;
                btnCancel.style.opacity = '0.3';
                btnCancel.style.pointerEvents = 'none';
                btnCancel.title = 'Cannot start cancellation while Delivery Report is running';
            }
        } else {
            // Both idle: restore both buttons per the current license verdict.
            const licenseOk = window.__currentLicenseValid ?? true;
            if (btnCancel) {
                btnCancel.disabled = !licenseOk;
                btnCancel.style.opacity = licenseOk ? '1' : '0.35';
                btnCancel.style.pointerEvents = licenseOk ? 'auto' : 'none';
                btnCancel.title = '';
            }
            if (btnFetch) {
                btnFetch.disabled = !licenseOk;
                btnFetch.style.opacity = licenseOk ? '1' : '0.35';
                btnFetch.style.pointerEvents = licenseOk ? 'auto' : 'none';
                btnFetch.title = '';
            }
        }
    }
    window.updateAutomationLockState = updateAutomationLockState;

    /**
     * Re-derive the lock from who is actually running.
     *
     * Every lifecycle transition funnels through setButtonState (cancellation)
     * or setDeliveryButtonState (report), and both call this at the end.
     * Deriving the lock rather than setting it directly means one process
     * finishing can never clear a lock the OTHER one still holds.
     *
     * Reads the window-published flags rather than the closure variables:
     * license verification can reach this before `let isProcessRunning` has
     * been evaluated further down, which would be a TDZ ReferenceError.
     */
    function refreshAutomationLock() {
        if (window.__nexusCancellationRunning) {
            updateAutomationLockState('cancellation');
        } else if (window.__nexusDeliveryFetchRunning) {
            updateAutomationLockState('delivery_report');
        } else {
            updateAutomationLockState(null);
        }
    }

    // Start locked. Invalid, expired, or not-yet-verified all render the same:
    // the button only unlocks once the worker confirms the license.
    updateLicenseUIState(false);

    // STRICT IN-MEMORY VOLATILE SELECTORS & CLOUD API KEY
    // Held strictly in RAM. NEVER saved to electron-store, localStorage, or disk.
    let currentInMemorySelectors = null;
    let currentInMemoryAntiCaptchaKey = '';

    function formatExpiryDate(serverDate) {
        if (!serverDate) return null;
        const dateToParse = String(serverDate).trim();
        if (!dateToParse) return null;
        try {
            const cleanIso = /^\d{4}-\d{2}-\d{2}$/.test(dateToParse) ? `${dateToParse}T12:00:00` : dateToParse;
            const parsed = new Date(cleanIso);
            if (!isNaN(parsed.getTime())) {
                return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            }
        } catch (_) {}
        return null;
    }

    function renderRedErrorAlertBanner(serverMessage, expiryDate = undefined) {
        let error = null;
        let data = null;
        if (expiryDate && typeof expiryDate === 'object') {
            error = expiryDate;
            data = expiryDate.response?.data || expiryDate;
        } else if (typeof expiryDate === 'string' && expiryDate) {
            data = { expiresAt: expiryDate };
        } else if (window.currentLicenseExpiresAt || currentExpiresAt) {
            data = { expiresAt: window.currentLicenseExpiresAt || currentExpiresAt };
        }
        const expDate = error?.response?.data?.expiresAt || data?.expiresAt;
        currentExpiresAt = expDate || '';
        if (expDate) {
            window.currentLicenseExpiresAt = expDate;
            if (typeof updateLicenseExpiryDisplay === 'function') {
                updateLicenseExpiryDisplay(expDate);
            }
        }
        const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

        isSubscriptionExpired = true;
        isLicenseValid = false;
        updateLicenseUIState(false);

        // Top Header Banner displays the server message received directly
        if (banner) {
            banner.innerText = serverMessage;
        }
        if (expiryBannerMessage) {
            expiryBannerMessage.textContent = serverMessage;
        }
        if (subscriptionExpiryBanner) {
            const icon = subscriptionExpiryBanner.querySelector('.expiry-banner-icon');
            if (icon) icon.classList.add('hidden');
            subscriptionExpiryBanner.classList.remove('hidden');
        }

        // Show "Renew License Now" button on true expiration
        if (btnRenewLicense) {
            btnRenewLicense.classList.remove('hidden');
            btnRenewLicense.style.display = '';
        }
        const openSettingsBtn = document.getElementById('btnBannerOpenSettings') || btnBannerOpenSettings;
        if (openSettingsBtn) {
            openSettingsBtn.classList.add('hidden');
            openSettingsBtn.style.display = 'none';
        }

        // Dashboard Current State Alert
        if (currentStateText) {
            currentStateText.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
        }
        if (statusDetailText) {
            statusDetailText.textContent = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
        }

        // Subscription Renewal Hub modal warning box
        const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
        if (warningBox) {
            warningBox.innerText = formattedExp 
                ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
        }
        if (renewalBanner && renewalBanner !== warningBox) {
            renewalBanner.innerText = formattedExp 
                ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
        }

        btnStartCancellation.disabled = true;
        btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-config-error');
        btnStartCancellation.classList.add('btn-subscription-expired');
        btnStartText.textContent = '🔒 Subscription Expired';
        playIcon.classList.add('hidden');
        if (stopIcon) stopIcon.classList.add('hidden');
        spinnerIcon.classList.add('hidden');

        updateStatus('Subscription Expired');
        const alertMsg = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
        appendLog(`❌ ${alertMsg}`, 'error');
    }

    function handleInvalidCredentialsError(customMessage = '') {
        const errorMsg = 'Wrong BPCL User ID or License Key (Invalid Credentials)';
        isSubscriptionExpired = false;
        isLicenseValid = false;
        updateLicenseUIState(false);
        currentAgencyName = '';

        // Invalidate any stale cached agency name so it can never reappear after a
        // confirmed-invalid credential check.
        setPersistentSetting('agencyName', '');
        setPersistentSetting('expiresAt', '');
        if (window.electronAPI && window.electronAPI.saveSettings) {
            window.electronAPI.saveSettings({ agencyName: '', expiresAt: '', licenseValid: false }).catch(() => {});
        }

        // Top Header Banner displays standard error banner: "Wrong BPCL User ID or License Key (Invalid Credentials)"
        if (banner) {
            banner.innerText = errorMsg;
        }
        if (expiryBannerMessage) {
            expiryBannerMessage.textContent = errorMsg;
        }
        if (subscriptionExpiryBanner) {
            const icon = subscriptionExpiryBanner.querySelector('.expiry-banner-icon');
            if (icon) icon.classList.remove('hidden');
            subscriptionExpiryBanner.classList.remove('hidden');
        }

        // DO NOT show the "Renew License Now" button
        if (btnRenewLicense) {
            btnRenewLicense.classList.add('hidden');
            btnRenewLicense.style.display = 'none';
        }

        // Show neutral button: "Open Settings"
        let openSettingsBtn = document.getElementById('btnBannerOpenSettings') || btnBannerOpenSettings;
        if (!openSettingsBtn && subscriptionExpiryBanner) {
            openSettingsBtn = document.createElement('button');
            openSettingsBtn.id = 'btnBannerOpenSettings';
            openSettingsBtn.className = 'btn-banner-settings';
            openSettingsBtn.innerHTML = '<span>⚙️ Open Settings</span>';
            openSettingsBtn.title = 'Open Settings to check credentials';
            openSettingsBtn.addEventListener('click', () => switchTab('settings'));
            subscriptionExpiryBanner.appendChild(openSettingsBtn);
        }
        if (openSettingsBtn) {
            openSettingsBtn.classList.remove('hidden');
            openSettingsBtn.style.display = '';
        }

        // Update Agency Badge
        const badge = agencyBadge || agencyDisplay;
        if (badge) {
            badge.className = 'agency-tag badge-invalid';
            badge.textContent = '🔴 Invalid Credentials';
        }

        // Set current state text to "Configuration Error (Invalid ID/Key)"
        if (currentStateText) {
            currentStateText.innerText = 'Configuration Error (Invalid ID/Key)';
        }
        if (statusDetailText) {
            statusDetailText.textContent = 'Configuration Error (Invalid ID/Key)';
        }

        // DO NOT set UI state badge to "Subscription Expired"
        updateStatus('Configuration Error');

        // Reset Start button to disabled "Check Credentials in Settings"
        btnStartCancellation.disabled = true;
        btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-subscription-expired');
        btnStartCancellation.classList.add('btn-config-error');
        btnStartText.textContent = 'Check Credentials in Settings';
        playIcon.classList.add('hidden');
        if (stopIcon) stopIcon.classList.add('hidden');
        spinnerIcon.classList.add('hidden');

        // DO NOT log the subscription-expiry message here
        appendLog(`❌ ${errorMsg}`, 'error');
    }

    function updateAgencyBadge(status, agencyName = '', customMessage = '') {
        const badge = agencyBadge || agencyDisplay;
        if (!badge) return;

        badge.classList.remove('badge-unregistered', 'badge-verified', 'badge-invalid');

        if (status === 'verified') {
            const cleanName = (agencyName && agencyName.trim()) || currentAgencyName || 'Agency Slot';
            currentAgencyName = cleanName;
            isLicenseValid = true;
            isSubscriptionExpired = false;
            updateLicenseUIState(true);
            if (subscriptionExpiryBanner) {
                subscriptionExpiryBanner.classList.add('hidden');
            }
            if (btnRenewLicense) {
                btnRenewLicense.classList.add('hidden');
                btnRenewLicense.style.display = 'none';
            }
            const openSettingsBtn = document.getElementById('btnBannerOpenSettings') || btnBannerOpenSettings;
            if (openSettingsBtn) {
                openSettingsBtn.classList.add('hidden');
                openSettingsBtn.style.display = 'none';
            }
            badge.className = 'agency-tag badge-verified';
            badge.textContent = `🟢 ${cleanName}`;
            if (!isProcessRunning) {
                btnStartCancellation.disabled = false;
                btnStartCancellation.classList.remove('btn-subscription-expired', 'btn-config-error', 'btn-danger-pulsing');
                btnStartCancellation.classList.add('btn-primary');
                btnStartText.textContent = 'Start Auto-Cancellation';
                playIcon.classList.remove('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                // A valid license must not unlock this button while the
                // delivery report holds the automation slot.
                refreshAutomationLock();
            }
        } else if (status === 'invalid') {
            currentAgencyName = '';
            isLicenseValid = false;
            updateLicenseUIState(false);
            badge.className = 'agency-tag badge-invalid';
            const serverMessage = customMessage || 'Invalid license or invalid user ID';
            badge.textContent = `🔴 ${serverMessage}`;

            // Clear saved agency name in local storage if invalid, preserving credentials
            setPersistentSetting('agencyName', '');
            setPersistentSetting('expiresAt', '');
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({ agencyName: '', expiresAt: '', licenseValid: false }).catch(() => {});
            }

            if (serverMessage.toLowerCase().includes('expired')) {
                btnStartCancellation.disabled = true;
                btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-config-error');
                btnStartCancellation.classList.add('btn-subscription-expired');
                btnStartText.textContent = '🔒 Subscription Expired';
                playIcon.classList.add('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                updateStatus('Subscription Expired');
                if (statusDetailText) {
                    statusDetailText.textContent = serverMessage;
                }
            } else {
                btnStartCancellation.disabled = true;
                btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-subscription-expired');
                btnStartCancellation.classList.add('btn-config-error');
                btnStartText.textContent = 'Check Credentials in Settings';
                playIcon.classList.add('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                updateStatus('Configuration Error');
                if (statusDetailText) {
                    statusDetailText.textContent = 'Configuration Error (Invalid ID/Key)';
                }
                if (currentStateText) {
                    currentStateText.innerText = 'Configuration Error (Invalid ID/Key)';
                }
            }
            if (statusDetailText) {
                statusDetailText.textContent = serverMessage;
            }
        } else {
            // 'no-license' or 'unregistered': nothing configured, or configured but not yet
            // confirmed by the Cloudflare Worker. Cached/local credentials alone are never
            // treated as "verified" here — the worker response is the single source of truth,
            // so this state always renders as locked rather than trusting stale local data.
            currentAgencyName = '';
            isLicenseValid = false;
            updateLicenseUIState(false);
            badge.className = 'agency-tag badge-invalid';
            badge.textContent = '🔴 No License Configured';
            btnStartCancellation.disabled = true;
            btnStartCancellation.classList.remove('btn-danger-pulsing');
            btnStartCancellation.classList.add('btn-subscription-expired');
            btnStartText.textContent = '🔒 License Required';
            playIcon.classList.add('hidden');
            if (stopIcon) stopIcon.classList.add('hidden');
            spinnerIcon.classList.add('hidden');
            updateStatus('License Required');
            if (statusDetailText) {
                statusDetailText.textContent = 'Please enter both BPCL User ID and License Key in Settings.';
            }
        }
    }

    function updateAgencyDisplay(distributor) {
        if (distributor && distributor.trim()) {
            updateAgencyBadge('verified', distributor.trim());
        } else if (currentAgencyName && currentAgencyName.trim()) {
            updateAgencyBadge('verified', currentAgencyName.trim());
        } else if (cachedCredentials && cachedCredentials.agencyName && cachedCredentials.agencyName.trim()) {
            updateAgencyBadge('verified', cachedCredentials.agencyName.trim());
        } else {
            updateAgencyBadge('no-license');
        }
    }

    // Neutral interim state shown while a live Cloudflare verification is in flight,
    // so a stale cached agency name/state is never displayed as if it were confirmed.
    function showVerifyingBadge() {
        const badge = agencyBadge || agencyDisplay;
        if (badge) {
            badge.className = 'agency-tag badge-unregistered';
            badge.textContent = '⚪ Verifying License...';
        }
        // Stay locked until the worker answers - an unverified license is
        // treated exactly like an invalid one.
        updateLicenseUIState(false);
        if (!isProcessRunning) {
            btnStartCancellation.disabled = true;
            btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-subscription-expired', 'btn-config-error', 'btn-primary');
            btnStartText.textContent = '🔄 Verifying...';
            playIcon.classList.add('hidden');
            if (stopIcon) stopIcon.classList.add('hidden');
            spinnerIcon.classList.remove('hidden');
        }
        if (statusDetailText) statusDetailText.textContent = 'Verifying license with server...';
        if (currentStateText) currentStateText.innerText = 'Verifying license with server...';
    }

    // ---------------------------------------------------------
    // CENTRALIZED LICENSE STATE (Cloudflare Worker = single source of truth)
    // ---------------------------------------------------------
    // isValid: whether the worker confirmed the license as active.
    // data: the worker's /api/verify response (valid case) or an object carrying
    //       { message, isExpired } describing why it failed (invalid case).
    async function applyLicenseState(isValid, data = null) {
        // Single authoritative gate for every license-dependent control
        // (Delivery Report fetch included) before any branch-specific UI runs.
        updateLicenseUIState(Boolean(isValid));

        if (isValid) {
            const agencyName = String((data && (data.agencyName || data.distributor)) || currentAgencyName || 'Nexus').trim();
            const expiresAt = (data && (data.expiresAt || data.expiry || (data.manifest && data.manifest.expiresAt))) || '';

            // Dynamically bind the exact agency name returned by the Cloudflare Worker.
            updateAgencyBadge('verified', agencyName);

            // Clear the interim "Verifying license with server..." text now that the badge is
            // green — without stomping live progress text if automation is already running.
            if (!isProcessRunning) {
                if (currentStateText) currentStateText.textContent = 'Ready For Cash Memo Cancel';
                if (statusDetailText) statusDetailText.textContent = 'Ready For Cash Memo Cancel';
            }

            // Persist agencyName + expiresAt + licenseValid together in ONE awaited round-trip
            // to both storage layers, so a fast refresh can never observe a half-written state.
            await setPersistentSetting('agencyName', agencyName);
            if (expiresAt) await setPersistentSetting('expiresAt', expiresAt);
            if (window.electronAPI && window.electronAPI.saveSettings) {
                await window.electronAPI.saveSettings({ agencyName, expiresAt, licenseValid: true }).catch(() => {});
            }

            if (expiresAt) {
                window.currentLicenseExpiresAt = expiresAt;
                currentExpiresAt = expiresAt;
                updateLicenseExpiryDisplay(expiresAt);
            }

            // Cosmetic manifest processing (theme, update-check, expiry banners) must never be
            // able to throw its way into a caller's catch block and be misread as a failed
            // verification — the license IS valid at this point regardless of what happens here.
            if (data) {
                try {
                    processManifestResponse(data);
                } catch (err) {
                    console.warn('[License] Non-fatal error while applying manifest:', err);
                }
            }
            return true;
        }

        // Clear the interim "Verifying license with server..." text. The specific handlers
        // below refine this with the exact reason; this is the fallback so the pending text
        // can never remain stuck on screen.
        if (!isProcessRunning) {
            if (currentStateText) currentStateText.textContent = 'Process halted due to an issue.';
            if (statusDetailText) statusDetailText.textContent = 'Process halted due to an issue.';
        }

        // Invalid, expired, or unconfigured: wipe the stale cached agency name AND mark
        // licenseValid:false in ONE awaited round-trip to both storage layers, so a refresh
        // immediately after a failed save can never read back a half-cleared, stale record.
        await setPersistentSetting('agencyName', '');
        await setPersistentSetting('expiresAt', '');
        if (window.electronAPI && window.electronAPI.saveSettings) {
            await window.electronAPI.saveSettings({ agencyName: '', expiresAt: '', licenseValid: false }).catch(() => {});
        }

        const message = (data && data.message) || '';
        const isExpired = Boolean(data && (
            data.isExpired ||
            data.error === 'SUBSCRIPTION_EXPIRED' ||
            (message && message.toLowerCase().includes('expired'))
        ));

        if (isExpired) {
            updateAgencyBadge('invalid', '', message || 'Subscription Expired');
        } else if (message) {
            handleInvalidCredentialsError(message);
        } else {
            updateAgencyBadge('no-license');
        }
        return false;
    }

    // ---------------------------------------------------------
    // DYNAMIC CLOUD-DRIVEN UI THEME
    // ---------------------------------------------------------
    function applyDynamicTheme(uiTheme) {
        if (!uiTheme) return;
        let styleTag = document.getElementById('dynamic-cloud-theme');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-cloud-theme';
            document.head.appendChild(styleTag);
        }

        let css = '';
        if (uiTheme.buttonColor) {
            css += `
                :root {
                    --btn-cloud-color: ${uiTheme.buttonColor};
                }
                .btn-primary {
                    background: ${uiTheme.buttonColor} !important;
                    border-color: ${uiTheme.buttonColor} !important;
                    box-shadow: 0 4px 15px ${uiTheme.buttonColor}66 !important;
                }
                .btn-primary:hover:not(:disabled) {
                    filter: brightness(1.15);
                    box-shadow: 0 6px 20px ${uiTheme.buttonColor}99 !important;
                }
            `;
        }

        if (uiTheme.customCss) {
            css += `\n${uiTheme.customCss}`;
        }

        styleTag.textContent = css;
        if (uiTheme.themeVersion) {
            console.log(`🎨 Dynamic Cloud Theme v${uiTheme.themeVersion} applied.`);
        }
    }

    // ---------------------------------------------------------
    // OPTIONAL NON-BLOCKING UPDATE NOTIFICATION
    // ---------------------------------------------------------
    function isNewerVersion(current, latest) {
        if (!latest) return false;
        const cleanCurrent = (current || '1.0.0').replace(/^v/, '').trim();
        const cleanLatest = String(latest).replace(/^v/, '').trim();
        const curParts = cleanCurrent.split('.').map(n => parseInt(n, 10) || 0);
        const latParts = cleanLatest.split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < Math.max(curParts.length, latParts.length); i++) {
            const c = curParts[i] || 0;
            const l = latParts[i] || 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    }

    // ---------------------------------------------------------
    // IN-APP BACKGROUND AUTO-UPDATER & 'OPEN AGAIN' CONTROLLER
    // ---------------------------------------------------------
    let isUpdateDownloaded = false;
    let currentIncomingVersion = '';

    function formatVersionTag(v) {
        if (!v) return '';
        const s = String(v).trim();
        return s.startsWith('v') ? s : `v${s}`;
    }

    function updateModalVersionDisplay(targetVer, currVer) {
        if (targetVer) {
            currentIncomingVersion = targetVer;
        }
        const incoming = formatVersionTag(targetVer || currentIncomingVersion) || 'v1.1.3';
        let current = currVer;
        if (!current) {
            const headerBadge = document.getElementById('appVersionBadge');
            current = (headerBadge && headerBadge.textContent) || (window.electronAPI && window.electronAPI.appVersion) || 'v1.1.2';
        }
        const formattedCurrent = formatVersionTag(current) || 'v1.1.2';

        if (modalTargetVersion) {
            modalTargetVersion.textContent = incoming;
        }
        if (modalTargetVersionHighlight) {
            modalTargetVersionHighlight.textContent = incoming;
        }
        if (modalCurrentVersion) {
            modalCurrentVersion.textContent = formattedCurrent;
        }
        if (modalVersionInfo) {
            modalVersionInfo.textContent = `Ready to apply • ${incoming}`;
        }
    }

    function showUpdateReadyUI(version) {
        isUpdateDownloaded = true;
        if (updateBadge) {
            updateBadge.classList.add('hidden');
        }
        if (btnUpdatePill) {
            btnUpdatePill.classList.remove('hidden');
        }
        updateModalVersionDisplay(version);
    }

    async function checkInitialUpdateStatus() {
        try {
            const client = window.ipcRenderer || ipcRenderer;
            if (client && typeof client.invoke === 'function') {
                const status = await client.invoke('get-update-status');
                if (status && status.isDownloaded) {
                    showUpdateReadyUI(status.version);
                    if (status.currentVersion) {
                        updateModalVersionDisplay(status.version, status.currentVersion);
                    }
                }
            }
        } catch (err) {
            console.warn('Could not query initial update status:', err);
        }
    }

    function handleUpdateAvailable(info) {
        safeConsoleLog(`✨ [UPDATER] New update available: v${info?.version || ''}`);
        appendLog(`✨ New update available (v${info?.version || ''}). Downloading in background...`, 'system');
        if (updateBadge) {
            updateBadge.classList.remove('hidden');
            updateBadge.classList.remove('ready');
        }
        if (updateSpinner) {
            updateSpinner.textContent = '🔄';
            updateSpinner.style.animation = 'spinUpdate 1.4s linear infinite';
        }
        if (updatePercentText) {
            updatePercentText.textContent = 'Updating 0%';
        }
        if (updateProgressBar) {
            updateProgressBar.style.width = '0%';
        }
        if (info?.version) {
            updateModalVersionDisplay(info.version);
        }
    }

    function handleUpdateProgress(data) {
        const percent = Math.max(0, Math.min(100, Math.round(data?.percent || 0)));
        if (updateBadge) {
            updateBadge.classList.remove('hidden');
        }
        if (updatePercentText) {
            updatePercentText.textContent = `Updating ${percent}%`;
        }
        if (updateProgressBar) {
            updateProgressBar.style.width = `${percent}%`;
        }
    }

    function handleUpdateDownloaded(info) {
        isUpdateDownloaded = true;
        const targetVer = info?.version || '1.1.3';
        safeConsoleLog(`🎉 [UPDATER] Update downloaded: v${info?.version || targetVer}`);
        appendLog(`🎉 Update v${info?.version || targetVer} downloaded! Click 'Open Again' to restart and apply.`, 'system');
        
        // Hide the Updating 100% progress bar / pill completely
        if (updateBadge) {
            updateBadge.classList.add('hidden');
        }
        // Show the ✨ Update Ready button in the header
        if (btnUpdatePill) {
            btnUpdatePill.classList.remove('hidden');
        }
        updateModalVersionDisplay(targetVer);

        // Show the "Update Ready to Install" modal popup with [Later] and [Open Again]
        if (updateModal) {
            updateModal.classList.remove('hidden');
        }
    }

    function applyUpdateAndReopen() {
        if (btnOpenAgain) {
            btnOpenAgain.disabled = true;
            btnOpenAgain.innerHTML = '<span>🚀</span> Relaunching...';
        }
        appendLog('🔄 Applying update and relaunching Nexus Automation...', 'system');
        const client = window.ipcRenderer || ipcRenderer;
        if (client && typeof client.send === 'function') {
            client.send('apply-update-and-reopen');
        } else if (window.electronAPI && typeof window.electronAPI.applyUpdateAndReopen === 'function') {
            window.electronAPI.applyUpdateAndReopen();
        }
    }

    // Hook IPC events from electron-updater in main process
    const clientIpc = window.ipcRenderer || ipcRenderer;
    if (clientIpc && typeof clientIpc.on === 'function') {
        clientIpc.on('update-available', (_e, info) => handleUpdateAvailable(info));
        clientIpc.on('update-progress', (_e, data) => handleUpdateProgress(data));
        clientIpc.on('update-downloaded', (_e, info) => handleUpdateDownloaded(info));
    } else if (window.electronAPI) {
        if (window.electronAPI.onUpdateAvailable) window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
        if (window.electronAPI.onUpdateProgress) window.electronAPI.onUpdateProgress(handleUpdateProgress);
        if (window.electronAPI.onUpdateDownloaded) window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
    }

    // Clicking the header update badge opens the modal
    if (updateBadge) {
        updateBadge.addEventListener('click', () => {
            if (updateModal) {
                updateModal.classList.remove('hidden');
            }
        });
    }

    // When User clicks the ✨ Update Ready header button at any time:
    // Re-open / display the "Update Ready to Install" modal popup so the user can click [Open Again] whenever they are ready.
    if (btnUpdatePill) {
        btnUpdatePill.addEventListener('click', () => {
            if (updateModal) {
                updateModal.classList.remove('hidden');
            }
        });
    }

    // When User clicks "Later":
    // Hide the modal popup. DO NOT hide the ✨ Update Ready header button. Keep it pinned in the header.
    if (btnUpdateLater) {
        btnUpdateLater.addEventListener('click', () => {
            if (updateModal) {
                updateModal.classList.add('hidden');
            }
            if (btnUpdatePill) {
                btnUpdatePill.classList.remove('hidden');
            }
        });
    }

    // When User clicks "Open Again": Trigger applyUpdateAndReopen
    if (btnOpenAgain) {
        btnOpenAgain.addEventListener('click', applyUpdateAndReopen);
    }

    // Dismiss modal on clicking backdrop
    if (updateModal) {
        updateModal.addEventListener('click', (e) => {
            if (e.target === updateModal) {
                updateModal.classList.add('hidden');
                if (isUpdateDownloaded && btnUpdatePill) {
                    btnUpdatePill.classList.remove('hidden');
                }
            }
        });
    }

    // Cloud Manifest Fallback Checker
    function checkForUpdates(latestVersion, updateUrl) {
        if (!latestVersion) return;
        const hasUpdate = isNewerVersion(currentAppVersion, latestVersion);
        if (hasUpdate) {
            availableUpdateInfo = { latestVersion, updateUrl };
            if (updateBadge && updateBadge.classList.contains('hidden')) {
                updateBadge.classList.remove('hidden');
            }
            if (modalVersionInfo) {
                modalVersionInfo.textContent = `Version ${latestVersion} available (Current: v${currentAppVersion})`;
            }
            console.log(`✨ Newer version detected in manifest: v${latestVersion}`);
        }
    }

    // ---------------------------------------------------------
    // UNIFIED MANIFEST PROCESSOR
    // ---------------------------------------------------------
    function processManifestResponse(response) {
        if (!response) {
            updateAgencyBadge('invalid');
            return;
        }

        // Check if verification returned failure or 403 status
        if (response.success === false || response.error === 'INVALID_LICENSE' || response.status === 403) {
            const serverMessage = response.message || "License verification failed.";
            const data = response;
            const expDate = data?.expiresAt || data?.expiry || response.manifest?.expiresAt || '';
            const isExpired = Boolean(
                response.isExpired || 
                response.manifest?.isExpired || 
                response.error === 'SUBSCRIPTION_EXPIRED' || 
                (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
            );
            if (isExpired) {
                updateAgencyBadge('invalid', '', serverMessage);
                const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

                banner.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
                currentStateText.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
                renewalBanner.innerText = formattedExp ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;

                renderRedErrorAlertBanner(serverMessage, expDate);
            } else {
                handleInvalidCredentialsError(serverMessage);
            }
            return;
        }

        // STRICT IN-MEMORY VOLATILE SELECTORS & ANTI-CAPTCHA KEY
        // Hold manifest.selectors and anticaptchaApiKey strictly in volatile RAM (never persist to store or disk)
        const manifestSelectors = response?.manifest?.selectors || response?.payload?.selectors || response?.selectors;
        if (manifestSelectors && typeof manifestSelectors === 'object' && Object.keys(manifestSelectors).length > 0) {
            currentInMemorySelectors = Object.freeze({ ...manifestSelectors });
        }
        const cloudApiKey = response?.manifest?.anticaptchaApiKey || response?.anticaptchaApiKey || response?.payload?.anticaptchaApiKey || response?.apiKey;
        if (cloudApiKey) {
            currentInMemoryAntiCaptchaKey = String(cloudApiKey).trim();
        }

        // 1. Dynamic Agency Name
        const distributor = response.agencyName || response.distributor || response.license?.name || response.name;
        if (distributor) {
            updateAgencyBadge('verified', distributor);
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({
                    agencyName: distributor.trim()
                }).catch(() => {});
            }
        } else {
            updateAgencyBadge('verified', 'Bharat Gas Agency');
        }

        // 2. Dynamic Cloud-Driven UI/Theme
        const uiTheme = response.uiTheme || response.manifest?.uiTheme;
        if (uiTheme) {
            applyDynamicTheme(uiTheme);
        }

        // 3. Optional Non-Blocking Update Check
        const latestVersion = response.latestVersion || response.manifest?.latestVersion || response.version;
        const updateUrl = response.updateUrl || response.manifest?.updateUrl;
        if (latestVersion) {
            checkForUpdates(latestVersion, updateUrl);
        }

        // 4. Graceful Subscription Expiration Check
        handleSubscriptionExpiration(response);
    }

    function updateLicenseExpiryDisplay(rawExpiresAt) {
        if (!rawExpiresAt) {
            if (settingsExpiryDateText) settingsExpiryDateText.textContent = '--/--/----';
            if (dashboardExpiryWarning) {
                dashboardExpiryWarning.textContent = '';
                dashboardExpiryWarning.classList.add('hidden');
                dashboardExpiryWarning.style.display = 'none';
            }
            return;
        }

        try {
            const cleanIso = /^\d{4}-\d{2}-\d{2}$/.test(String(rawExpiresAt).trim())
                ? `${String(rawExpiresAt).trim()}T12:00:00`
                : rawExpiresAt;
            const parsedDate = new Date(cleanIso);
            if (isNaN(parsedDate.getTime())) {
                if (settingsExpiryDateText) settingsExpiryDateText.textContent = '--/--/----';
                if (dashboardExpiryWarning) {
                    dashboardExpiryWarning.textContent = '';
                    dashboardExpiryWarning.classList.add('hidden');
                    dashboardExpiryWarning.style.display = 'none';
                }
                return;
            }

            // Strictly format date to DD/MM/YYYY
            const formattedDate = parsedDate.toLocaleDateString('en-GB');
            if (settingsExpiryDateText) {
                settingsExpiryDateText.textContent = formattedDate;
            }

            // Expiry Countdown Logic:
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const expDate = new Date(rawExpiresAt);
            expDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            const warningElement = dashboardExpiryWarning;
            if (warningElement) {
                if (diffDays > 0 && diffDays <= 7) {
                    warningElement.textContent = diffDays === 1 ? 'Subscription expires in 1 day' : `Subscription expires in ${diffDays} days`;
                    warningElement.classList.remove('hidden');
                    warningElement.style.display = 'flex';
                } else {
                    warningElement.classList.add('hidden');
                    warningElement.style.display = 'none';
                }
            }
        } catch (err) {
            console.warn('[LICENSE] Error updating expiry display:', err);
        }
    }
    window.updateLicenseExpiryDisplay = updateLicenseExpiryDisplay;

    function handleSubscriptionExpiration(response) {
        if (!response) return;

        const isExpired = Boolean(response.isExpired ?? response.manifest?.isExpired);
        const expiresAt = response.expiresAt || response.manifest?.expiresAt || '';
        const renewalCfg = response.renewalConfig || response.manifest?.renewalConfig;

        if (renewalCfg) {
            currentRenewalConfig = {
                ...currentRenewalConfig,
                ...renewalCfg
            };
        }

        isSubscriptionExpired = isExpired;
        currentExpiresAt = expiresAt;

        if (expiresAt) {
            window.currentLicenseExpiresAt = expiresAt;
            setPersistentSetting('expiresAt', expiresAt);
        }

        // Update settings expiry badge & dashboard 7-day countdown alert
        updateLicenseExpiryDisplay(expiresAt);

        if (isExpired) {
            const serverMessage = response.message || (expiresAt ? `Subscription Expired: Your plan expired on ${expiresAt}. Automation is paused.` : "License expired. Please renew.");
            renderRedErrorAlertBanner(serverMessage, expiresAt);
        } else {
            // Active subscription
            if (subscriptionExpiryBanner) {
                subscriptionExpiryBanner.classList.add('hidden');
            }
            btnStartCancellation.classList.remove('btn-subscription-expired');
            if (!isProcessRunning) {
                btnStartCancellation.disabled = false;
                btnStartText.textContent = 'Start Auto-Cancellation';
                playIcon.classList.remove('hidden');
            }
        }
    }

    function openRenewalModal(error = null) {
        const modal = document.getElementById('licenseRenewalModal') || document.getElementById('renewalModal') || renewalModal;
        if (!modal) return;

        const rawDate = error?.response?.data?.expiresAt || window.currentLicenseExpiresAt || currentExpiresAt;
        if (rawDate) {
            window.currentLicenseExpiresAt = rawDate;
            currentExpiresAt = rawDate;
        }
        const formattedExp = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

        // Update expiry display
        const expiryDateDisplay = document.getElementById('licenseExpiredDateDisplay');
        if (expiryDateDisplay) {
            expiryDateDisplay.textContent = formattedExp || 'Recently';
        }

        // Synchronize current plan UI & WhatsApp link
        updateRenewalPlanUI(selectedRenewalPlan.id || '1-month');

        // Fetch Base64 QR code via Node.js main process
        loadCloudflareQrCode();

        const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
        if (warningBox) {
            warningBox.innerText = formattedExp 
                ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
        }
        if (renewalBanner && renewalBanner !== warningBox) {
            renewalBanner.innerText = formattedExp 
                ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
        }

        modal.classList.remove('hidden');
    }

    function closeRenewalModal() {
        const modal = document.getElementById('licenseRenewalModal') || document.getElementById('renewalModal') || renewalModal;
        if (!modal) return;
        modal.classList.add('hidden');
    }

    const btnTogglePassword = document.getElementById('btnTogglePassword');

    // ---------------------------------------------------------
    // TAB SWITCHING LOGIC (Dashboard, Settings)
    // ---------------------------------------------------------
    function switchTab(targetTab) {
        if (tabBtnDashboard) tabBtnDashboard.classList.toggle('active', targetTab === 'dashboard');
        if (tabBtnSettings) tabBtnSettings.classList.toggle('active', targetTab === 'settings');

        if (sectionDashboard) sectionDashboard.classList.toggle('active', targetTab === 'dashboard');
        if (sectionSettings) sectionSettings.classList.toggle('active', targetTab === 'settings');
    }

    if (tabBtnDashboard) tabBtnDashboard.addEventListener('click', () => switchTab('dashboard'));
    if (tabBtnSettings) tabBtnSettings.addEventListener('click', () => switchTab('settings'));

    // ---------------------------------------------------------
    // USER CANCELLATION HISTORY ENGINE (electron-store: cancellation_history, 90 days)
    // ---------------------------------------------------------
    const HISTORY_STORAGE_KEY = 'cancellation_history';
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

    async function getCancellationHistory() {
        try {
            const raw = await getPersistentSetting(HISTORY_STORAGE_KEY);
            if (!raw) return [];
            let parsed = [];
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                return [];
            }
            if (!Array.isArray(parsed)) return [];

            // Prune records older than 90 days
            const cutoff = Date.now() - NINETY_DAYS_MS;
            const valid = parsed.filter(item => (Number(item?.timestamp) || 0) >= cutoff);

            // Newest at the top
            valid.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));

            if (valid.length !== parsed.length) {
                await setPersistentSetting(HISTORY_STORAGE_KEY, JSON.stringify(valid));
            }
            return valid;
        } catch (err) {
            console.warn('[History] Failed to retrieve cancellation history:', err);
            return [];
        }
    }

    async function addCancellationHistoryRecord(metrics) {
        try {
            const current = await getCancellationHistory();
            const newRecord = {
                id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                date: metrics?.date || new Date().toLocaleDateString('en-GB'),
                time: metrics?.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                scrapedCount: Number(metrics?.scrapedCount) || 0,
                cancelledCount: Number(metrics?.cancelledCount) || 0,
                timeTaken: String(metrics?.timeTaken || '0m 00s'),
                rawDurationMs: Number(metrics?.rawDurationMs) || 0,
                timestamp: Number(metrics?.timestamp) || Date.now()
            };

            current.unshift(newRecord);
            const cutoff = Date.now() - NINETY_DAYS_MS;
            const valid = current.filter(item => (Number(item?.timestamp) || 0) >= cutoff);
            valid.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));

            await setPersistentSetting(HISTORY_STORAGE_KEY, JSON.stringify(valid));
            renderHistoryTable(valid);
            return newRecord;
        } catch (err) {
            console.warn('[History] Failed to add cancellation history record:', err);
        }
    }

    function renderHistoryTable(records = []) {
      const tbody = document.getElementById('historyTableBody');
      const emptyState = document.getElementById('historyEmptyState');
      if (!tbody) return;

      tbody.innerHTML = '';
      if (!records || records.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
      }
      if (emptyState) emptyState.classList.add('hidden');

      const sorted = [...records].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      sorted.forEach(item => {
        const tr = document.createElement('tr');
        const dt = item.date && item.time ? `${item.date} • ${item.time}` : (item.date || '—');
        tr.innerHTML = `
          <td>${dt}</td>
          <td style="text-align: center;"><span class="history-count-badge">${item.cancelledCount ?? 0}</span></td>
          <td style="text-align: right;"><span class="history-time-text">${item.timeTaken || '—'}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
    window.renderHistoryTable = renderHistoryTable;

    const historyBtn = document.getElementById('historyBtn');
    const historyIcon = document.getElementById('historyIcon');
    const historyModal = document.getElementById('historyModal');

    if (historyBtn && historyIcon) {
      historyBtn.addEventListener('click', async () => {
        historyIcon.classList.remove('pulse');
        requestAnimationFrame(() => historyIcon.classList.add('pulse'));

        const records = await ipcRenderer.invoke('get-cancellation-history');
        renderHistoryTable(records);
        if (historyModal) historyModal.classList.remove('hidden');
      });
    }

    const closeBtn = document.getElementById('closeHistoryModalBtn');
    if (closeBtn && historyModal) {
      closeBtn.onclick = () => historyModal.classList.add('hidden');
      historyModal.onclick = (e) => {
        if (e.target === historyModal) historyModal.classList.add('hidden');
      };
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && historyModal && !historyModal.classList.contains('hidden')) {
        historyModal.classList.add('hidden');
      }
    });

    // ---------------------------------------------------------
    // PERSISTENT STORAGE HELPERS (nexusStore with localStorage fallback)
    // ---------------------------------------------------------
    async function getPersistentSetting(key) {
        let val = null;
        if (window.nexusStore && typeof window.nexusStore.get === 'function') {
            try {
                val = await window.nexusStore.get(key);
            } catch (e) {
                console.warn(`[nexusStore] Failed to read ${key}:`, e);
            }
        }
        if (val === null || val === undefined || val === '') {
            try {
                val = localStorage.getItem(key);
            } catch (e) {
                console.warn(`[localStorage] Failed to read ${key}:`, e);
            }
        }
        return val ? String(val).trim() : '';
    }

    async function setPersistentSetting(key, val) {
        const strVal = (val === null || val === undefined) ? '' : String(val).trim();
        if (window.nexusStore && typeof window.nexusStore.set === 'function') {
            try {
                await window.nexusStore.set(key, strVal);
            } catch (e) {
                console.warn(`[nexusStore] Failed to write ${key}:`, e);
            }
        }
        try {
            localStorage.setItem(key, strVal);
        } catch (e) {
            console.warn(`[localStorage] Failed to write ${key}:`, e);
        }
    }

    async function clearPersistentSettings() {
        if (window.nexusStore && typeof window.nexusStore.clear === 'function') {
            try {
                await window.nexusStore.clear();
            } catch (e) {
                console.warn('[nexusStore] Failed to clear:', e);
            }
        }
        try {
            localStorage.removeItem('bpclUserId');
            localStorage.removeItem('bpclPassword');
            localStorage.removeItem('licenseKey');
            localStorage.removeItem('agencyName');
            localStorage.removeItem('userId');
            localStorage.removeItem('password');
            localStorage.removeItem('expiresAt');
            localStorage.removeItem('antiCaptchaKey');
        } catch (e) {
            console.warn('[localStorage] Failed to clear:', e);
        }
    }

    // ---------------------------------------------------------
    // NOTIFICATION & VERIFICATION HELPERS
    // ---------------------------------------------------------
    // The Cloudflare Worker and the automation runner still emit some Hindi strings. The UI is
    // English-only, so every message coming from outside this file is mapped here before display.
    // Declared as a hoisted function (map inline) so early log calls can never hit a TDZ error.
    function toEnglishMessage(message) {
        if (!message || typeof message !== 'string') return message;
        const remoteMessagesEn = {
            'कृपया BPCL User ID और License Key दोनों दर्ज करें।': 'Please enter both BPCL User ID and License Key.',
            'अमान्य BPCL User ID या License Key (Invalid BPCL User ID or License Key)': 'Wrong BPCL User ID or License Key (Invalid Credentials)',
            'सफलतापूर्वक सत्यापित किया गया (Verified)': 'Verified successfully',
            'सुरक्षा उल्लंघन: लॉगिन क्रेडेंशियल्स के साथ छेड़छाड़ की गई है।': 'Security violation: login credentials have been tampered with.',
            '3 प्रयासों के बाद भी "LPG One" मेनू स्क्रीन पर दिखाई नहीं दिया।': 'The "LPG One" menu did not appear on screen after 3 attempts.',
            'लाइसेंस समाप्त हो गया है': 'License has expired'
        };
        let out = message;
        for (const [hindi, english] of Object.entries(remoteMessagesEn)) {
            if (out.includes(hindi)) {
                out = out.split(hindi).join(english);
            }
        }
        return out;
    }

    function showNotification(message, type = 'info') {
        message = toEnglishMessage(message);
        if (saveStatusToast) {
            const toastText = saveStatusToast.querySelector('#saveStatusText') || saveStatusToast;
            if (toastText !== saveStatusToast) {
                toastText.textContent = message;
            }
            if (type === 'error') {
                saveStatusToast.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                saveStatusToast.style.color = '#f87171';
            } else if (type === 'success') {
                saveStatusToast.style.borderColor = 'rgba(34, 197, 94, 0.5)';
                saveStatusToast.style.color = '#4ade80';
            } else {
                saveStatusToast.style.borderColor = '';
                saveStatusToast.style.color = '';
            }
            saveStatusToast.classList.remove('hidden');
            clearTimeout(saveStatusToast._timer);
            saveStatusToast._timer = setTimeout(() => {
                saveStatusToast.classList.add('hidden');
            }, 3500);
        }
        appendLog((type === 'error' ? '❌ ' : type === 'success' ? '✅ ' : 'ℹ️ ') + message, type);
    }

    // Verification runs exactly twice in the app's lifetime by design: once on launch/refresh
    // and once per "Save Configuration" click. This guard collapses any overlap between those
    // two (or repeated clicks) into ONE in-flight request so the worker is never hammered.
    let inFlightVerification = null;

    function verifyCredentials(licenseKey, bpclUserId) {
        const cleanKey = (licenseKey || '').trim();
        const cleanUserId = (bpclUserId || '').trim();
        const requestKey = `${cleanUserId}::${cleanKey}`;

        if (inFlightVerification && inFlightVerification.key === requestKey) {
            return inFlightVerification.promise;
        }

        const promise = performVerification(cleanKey, cleanUserId).finally(() => {
            if (inFlightVerification && inFlightVerification.key === requestKey) {
                inFlightVerification = null;
            }
        });
        inFlightVerification = { key: requestKey, promise };
        return promise;
    }

    async function performVerification(cleanKey, cleanUserId) {
        if (!cleanKey || !cleanUserId) {
            return {
                status: 400,
                success: false,
                error: 'MISSING_FIELDS',
                message: 'Please enter both BPCL User ID and License Key.'
            };
        }

        let response;
        // Hard 10s ceiling so a hung connection fails once, cleanly, instead of leaving the
        // UI stuck on "Verifying..." or piling up retries.
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 10000);
        try {
            const verifyUrl = `${WORKER_BASE_URL}/api/verify?_t=${Date.now()}`;
            response = await fetch(verifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store',
                signal: abortController.signal,
                body: JSON.stringify({ licenseKey: cleanKey, bpclUserId: cleanUserId })
            });
            clearTimeout(timeoutId);

            // Non-200 HTTP response handler
            if (!response.ok) {
                let error = new Error(`HTTP Error ${response.status}`);
                error.response = response;
                let responseJson = null;
                try {
                    responseJson = await response.clone().json();
                } catch (_) {}
                if (responseJson && typeof responseJson === 'object') {
                    error.response = { ...response, data: responseJson };
                }
                console.log('[LICENSE DEBUG] Response received:', error.response?.data || error);
                const serverMessage = error.response?.data?.message || (await response?.json())?.message || error.message || "License verification failed.";
                const serverDate = error.response?.data?.expiresAt || (await error.response?.json?.())?.expiresAt || responseJson?.expiresAt || error.response?.data?.expiry || responseJson?.expiry || responseJson?.manifest?.expiresAt || '';
                if (serverDate) {
                    window.currentLicenseExpiresAt = serverDate;
                    currentExpiresAt = serverDate;
                }
                return {
                    status: response.status,
                    ok: false,
                    success: false,
                    isExpired: Boolean(responseJson?.isExpired) || responseJson?.error === 'SUBSCRIPTION_EXPIRED' || serverMessage.toLowerCase().includes('expired'),
                    error: responseJson?.error || (response.status === 403 ? 'AUTH_FAILED' : 'HTTP_ERROR'),
                    expiry: serverDate,
                    expiresAt: serverDate,
                    ...responseJson,
                    // Declared AFTER the spread so the English-normalized text wins over the
                    // raw server message, which the worker still sends in Hindi.
                    message: toEnglishMessage(serverMessage)
                };
            }

            const data = await response.json().catch(() => ({ success: false, message: 'Invalid response from verification server.' }));
            const serverDate = data?.expiresAt || data?.expiry || data?.manifest?.expiresAt || '';
            if (serverDate) {
                window.currentLicenseExpiresAt = serverDate;
                currentExpiresAt = serverDate;
            }
            const receivedSelectors = data?.manifest?.selectors || data?.payload?.selectors || data?.selectors;
            if (receivedSelectors && typeof receivedSelectors === 'object' && Object.keys(receivedSelectors).length > 0) {
                currentInMemorySelectors = Object.freeze({ ...receivedSelectors });
            }
            const receivedApiKey = data?.manifest?.anticaptchaApiKey || data?.anticaptchaApiKey || data?.payload?.anticaptchaApiKey || data?.apiKey;
            if (receivedApiKey) {
                currentInMemoryAntiCaptchaKey = String(receivedApiKey).trim();
            }
            return {
                status: response.status,
                ok: response.ok,
                expiry: serverDate,
                expiresAt: serverDate,
                ...data,
                message: toEnglishMessage(data?.message)
            };
        } catch (error) {
            // Error/catch block — transport-level failure (offline, DNS, reset, or our 10s abort)
            clearTimeout(timeoutId);
            const isTimeout = error?.name === 'AbortError';
            console.warn('[LICENSE] Verification request failed:', isTimeout ? 'timed out after 10s' : (error?.message || error));
            const serverMessage = isTimeout
                ? 'Verification timed out. Please check your internet connection and try again.'
                : (error.response?.data?.message || (await error.response?.json?.().catch(() => null))?.message || error.message || "License verification failed.");
            const serverDate = error.response?.data?.expiresAt || (await error.response?.json?.().catch(() => null))?.expiresAt || error.response?.data?.expiry || error.expiresAt || error.expiry || '';
            if (serverDate) {
                window.currentLicenseExpiresAt = serverDate;
                currentExpiresAt = serverDate;
            }
            const isCatchExpired = Boolean(
                error.response?.data?.isExpired ||
                error.response?.data?.error === 'SUBSCRIPTION_EXPIRED' ||
                (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
            );
            if (window.electronAPI && window.electronAPI.verifyLicense) {
                try {
                    const ipcRes = await window.electronAPI.verifyLicense(cleanKey, cleanUserId);
                    if (ipcRes && (ipcRes.message || ipcRes.success !== undefined)) {
                        return {
                            ...ipcRes,
                            isExpired: Boolean(ipcRes.isExpired || ipcRes.error === 'SUBSCRIPTION_EXPIRED' || (typeof ipcRes.message === 'string' && ipcRes.message.toLowerCase().includes('expired'))),
                            message: toEnglishMessage(ipcRes.message)
                        };
                    }
                } catch (ipcErr) {
                    const ipcMessage = ipcErr.response?.data?.message || (await ipcErr.response?.json?.().catch(() => null))?.message || ipcErr.message || serverMessage;
                    const ipcDate = ipcErr.response?.data?.expiresAt || (await ipcErr.response?.json?.().catch(() => null))?.expiresAt || ipcErr.response?.data?.expiry || serverDate;
                    const isIpcExpired = Boolean(ipcErr.response?.data?.isExpired || ipcErr.response?.data?.error === 'SUBSCRIPTION_EXPIRED' || (typeof ipcMessage === 'string' && ipcMessage.toLowerCase().includes('expired')));
                    return { success: false, status: 0, isExpired: isIpcExpired, message: toEnglishMessage(ipcMessage), expiry: ipcDate, expiresAt: ipcDate };
                }
            }
            return { success: false, status: response?.status || 0, isExpired: isCatchExpired, message: toEnglishMessage(serverMessage), expiry: serverDate, expiresAt: serverDate };
        }
    }

    // ---------------------------------------------------------
    // PERSISTENT STORE CREDENTIALS & LICENSE VALIDATION ENGINE
    // ---------------------------------------------------------
    async function getStoredCredentials() {
        let bpclUserId = '';
        let bpclPassword = '';
        let licenseKey = '';
        let agencyName = '';
        let browserChannel = 'chrome';
        let expiresAt = '';
        let licenseValid = false;

        // 1. Primary authority: Electron Main Process persistent store via IPC
        try {
            const client = window.ipcRenderer || ipcRenderer;
            let ipcSettings = null;
            if (client && typeof client.invoke === 'function') {
                ipcSettings = await client.invoke('get-settings').catch(() => null)
                           || await client.invoke('get-credentials').catch(() => null);
            } else if (window.electronAPI && window.electronAPI.getSettings) {
                ipcSettings = await window.electronAPI.getSettings().catch(() => null);
            }
            if (ipcSettings) {
                if (ipcSettings.bpclUserId || ipcSettings.userId) {
                    bpclUserId = String(ipcSettings.bpclUserId || ipcSettings.userId).trim();
                }
                if (ipcSettings.bpclPassword || ipcSettings.password) {
                    bpclPassword = String(ipcSettings.bpclPassword || ipcSettings.password).trim();
                }
                if (ipcSettings.licenseKey) {
                    licenseKey = String(ipcSettings.licenseKey).trim();
                }
                if (ipcSettings.agencyName) {
                    agencyName = String(ipcSettings.agencyName).trim();
                }
                if (ipcSettings.browserChannel) {
                    browserChannel = ipcSettings.browserChannel === 'msedge' ? 'msedge' : 'chrome';
                }
                if (ipcSettings.expiresAt) {
                    expiresAt = String(ipcSettings.expiresAt).trim();
                }
                licenseValid = Boolean(ipcSettings.licenseValid);
            }
        } catch (_) {}

        // 2. Fallback to nexusStore / localStorage if any fields missing
        if (!bpclUserId) {
            bpclUserId = (await getPersistentSetting('bpclUserId')) || (await getPersistentSetting('userId')) || '';
        }
        if (!bpclPassword) {
            bpclPassword = (await getPersistentSetting('bpclPassword')) || (await getPersistentSetting('password')) || '';
        }
        if (!licenseKey) {
            licenseKey = (await getPersistentSetting('licenseKey')) || '';
        }
        if (!agencyName) {
            agencyName = (await getPersistentSetting('agencyName')) || '';
        }
        if (!expiresAt) {
            expiresAt = (await getPersistentSetting('expiresAt')) || '';
        }

        // 3. Fallback to DOM input fields only if store was completely blank
        if (!bpclUserId && inputBpclUser) {
            bpclUserId = (inputBpclUser.value || '').trim();
        }
        if (!bpclPassword && inputBpclPassword) {
            bpclPassword = (inputBpclPassword.value || '').trim();
        }
        if (!licenseKey && inputLicenseKey) {
            licenseKey = (inputLicenseKey.value || '').trim();
        }

        return {
            bpclUserId,
            bpclPassword,
            licenseKey,
            agencyName,
            browserChannel,
            expiresAt,
            licenseValid
        };
    }

    // A cached agency badge may only be restored during a network outage if the store still
    // holds a real name from a previously SUCCESSFUL verification. Never invent a placeholder.
    function restoreLastVerifiedBadge(creds) {
        const cachedName = (creds?.agencyName || '').trim();
        if (creds?.licenseValid && cachedName) {
            updateAgencyBadge('verified', cachedName);
            return true;
        }
        updateAgencyBadge('no-license');
        // Credentials are present but unconfirmed — say so, rather than telling the operator
        // to enter details they have already entered.
        if ((creds?.bpclUserId || '').trim() && (creds?.licenseKey || '').trim() && !isProcessRunning) {
            const offlineMsg = 'Could not reach the license server. Check your internet connection and reopen the app.';
            if (statusDetailText) statusDetailText.textContent = offlineMsg;
            if (currentStateText) currentStateText.textContent = offlineMsg;
        }
        return false;
    }

    async function checkLicenseStatus(options = {}) {
        try {
            // ALWAYS retrieve credentials from persistent store via IPC
            const creds = await getStoredCredentials();
            const bpclUserId = (creds.bpclUserId || '').trim();
            const licenseKey = (creds.licenseKey || '').trim();

            cachedCredentials = { ...creds };

            // If BOTH the persistent store AND the inputs are completely empty:
            const domUser = (inputBpclUser?.value || '').trim();
            const domKey = (inputLicenseKey?.value || '').trim();
            if (!bpclUserId && !licenseKey && !domUser && !domKey) {
                updateAgencyBadge('no-license');
                updateLicenseExpiryDisplay(null);
                return { success: false, error: 'NO_LICENSE_CONFIGURED' };
            }

            if (options.passiveOnly) {
                // A passive check makes no live call, so it cannot confirm anything —
                // never claim "verified" from cache alone; leave the current UI as-is.
                return { success: true, credentials: creds };
            }

            // Saved credentials exist but are not yet confirmed by this check — show a
            // neutral pending state rather than trusting the cached agency name.
            if (bpclUserId && licenseKey) {
                showVerifyingBadge();
            }

            // Invoke Cloudflare verification — the single source of truth for license state.
            // `success === true` is the ONE canonical signal for a valid, non-expired,
            // correctly-paired license; nothing else should gate this branch.
            const res = await verifyCredentials(licenseKey || domKey, bpclUserId || domUser);
            if (res && res.success === true) {
                await applyLicenseState(true, res);
                return { success: true, manifest: res };
            }

            const isExpired = Boolean(res && (res.isExpired || res.error === 'SUBSCRIPTION_EXPIRED'));
            const isDefinitivelyInvalid = Boolean(res && (isExpired || res.status === 403 || (res.status === 400 && res.error === 'INVALID_LICENSE')));

            if (isDefinitivelyInvalid) {
                const serverMessage = res?.message || 'Configuration Error (Invalid ID/Key)';
                await applyLicenseState(false, { message: serverMessage, isExpired });
                return { success: false, expired: isExpired, error: isExpired ? 'SUBSCRIPTION_EXPIRED' : 'INVALID_CREDENTIALS', message: serverMessage };
            }

            // Network error or timeout (no definitive server verdict): restore the last
            // SUCCESSFULLY verified badge only — never a placeholder or unverified name.
            restoreLastVerifiedBadge(creds);
            return { success: false, networkError: true };
        } catch (err) {
            console.warn('[License Validation] Error in checkLicenseStatus:', err);
            const creds = await getStoredCredentials().catch(() => ({}));
            restoreLastVerifiedBadge(creds);
            return { success: false, error: err.message };
        }
    }

    const validateLicensePeriodically = checkLicenseStatus;
    const refreshLicenseState = checkLicenseStatus;
    window.checkLicenseStatus = checkLicenseStatus;
    window.validateLicensePeriodically = validateLicensePeriodically;
    window.refreshLicenseState = refreshLicenseState;

    // ---------------------------------------------------------
    // SETTINGS MANAGEMENT (nexusStore + localStorage Dual Persistence)
    // ---------------------------------------------------------
    async function loadStoredSettings() {
        try {
            if (window.electronAPI && window.electronAPI.getAppVersion) {
                currentAppVersion = await window.electronAPI.getAppVersion().catch(() => '1.1.7');
            }

            // 1. Fetch saved configuration from main process first via IPC
            const creds = await getStoredCredentials();
            cachedCredentials = { ...creds };

            const savedUser = creds.bpclUserId || '';
            const savedPass = creds.bpclPassword || '';
            const savedKey = creds.licenseKey || '';
            const savedBrowser = creds.browserChannel || 'chrome';
            const savedExpiresAt = creds.expiresAt || '';

            // 2. Automatically populate the inputs with the saved values
            if (inputBpclUser) inputBpclUser.value = savedUser || '';
            if (inputBpclPassword) inputBpclPassword.value = savedPass || '';
            if (inputLicenseKey) inputLicenseKey.value = savedKey || '';
            if (selectBrowserChannel) selectBrowserChannel.value = savedBrowser === 'msedge' ? 'msedge' : 'chrome';

            // 3. Do NOT trust the cached agency name as "verified" yet — show a neutral
            // pending state and let the live Cloudflare Worker check below decide.
            if (savedUser && savedKey) {
                showVerifyingBadge();
            } else {
                updateAgencyBadge('no-license');
            }

            if (savedExpiresAt) {
                window.currentLicenseExpiresAt = savedExpiresAt;
                currentExpiresAt = savedExpiresAt;
                updateLicenseExpiryDisplay(savedExpiresAt);
            }

            const bpclUserId = savedUser.trim();
            const licenseKey = savedKey.trim();

            // Startup auto-load: On DOMContentLoaded, load saved credentials from storage;
            // if both exist, run verification silently in the background to restore the green badge.
            if (!bpclUserId || !licenseKey) {
                updateAgencyBadge('no-license');
                updateLicenseExpiryDisplay(null);
                return;
            }

            let error = { response: { data: null } };
            const res = await verifyCredentials(licenseKey, bpclUserId);
            const data = res;
            error = { response: { data: res } };
            console.log('[LICENSE DEBUG] Response received:', error.response?.data || error);
            const rawDate = error.response?.data?.expiresAt || window.currentLicenseExpiresAt;
            const formattedExp = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            if (rawDate) {
                window.currentLicenseExpiresAt = rawDate;
                currentExpiresAt = rawDate;
                await setPersistentSetting('expiresAt', rawDate);
                updateLicenseExpiryDisplay(rawDate);
            }

            if (res && res.success === true) {
                // Bind the exact agency name returned by the Cloudflare Worker — the single
                // source of truth — not the possibly-stale cached value.
                await applyLicenseState(true, res);
            } else {
                const serverMessage = res?.message || "License verification failed.";
                const isExpired = Boolean(
                    res?.isExpired ||
                    res?.manifest?.isExpired ||
                    res?.error === 'SUBSCRIPTION_EXPIRED' ||
                    (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
                );
                if (isExpired) {
                    await applyLicenseState(false, { message: serverMessage, isExpired: true });
                    const expDate = error.response?.data?.expiresAt || data?.expiresAt;
                    const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                    if (expDate) {
                        window.currentLicenseExpiresAt = expDate;
                        currentExpiresAt = expDate;
                    }

                    // Top Header Banner displays server message directly
                    if (banner) {
                        banner.innerText = serverMessage;
                    }
                    if (expiryBannerMessage) {
                        expiryBannerMessage.textContent = serverMessage;
                    }
                    if (currentStateText) {
                        currentStateText.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
                    }
                    const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
                    if (warningBox) {
                        warningBox.innerText = formattedExp 
                            ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                            : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
                    }
                    if (renewalBanner && renewalBanner !== warningBox) {
                        renewalBanner.innerText = formattedExp 
                            ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.` 
                            : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
                    }

                    renderRedErrorAlertBanner(serverMessage, expDate);
                } else if (res && Number(res.status) > 0) {
                    // The worker answered with a definitive rejection (403 AUTH_FAILED,
                    // 400 INVALID_LICENSE/MISSING_FIELDS, 5xx). Wipe the cached agency and
                    // render the locked state — NEVER fall back to a previously cached name.
                    await applyLicenseState(false, { message: serverMessage });
                } else {
                    // No HTTP response at all (offline / DNS / timeout / connection reset):
                    // restore the last SUCCESSFULLY verified badge instead of locking the
                    // operator out — but only if the store actually holds one.
                    restoreLastVerifiedBadge(creds);
                }
            }
        } catch (err) {
            console.warn('[License Startup] Error during startup settings load:', err);
            const storedCreds = await getStoredCredentials().catch(() => ({}));
            restoreLastVerifiedBadge(storedCreds);
        }
    }

    // Auto-persist browser selection when dropdown changes
    if (selectBrowserChannel) {
        selectBrowserChannel.addEventListener('change', async () => {
            const channel = selectBrowserChannel.value === 'msedge' ? 'msedge' : 'chrome';
            await setPersistentSetting('browserChannel', channel);
            if (window.electronAPI && window.electronAPI.saveSettings) {
                await window.electronAPI.saveSettings({ browserChannel: channel }).catch(() => {});
            }
            appendLog(`🌐 Preferred browser set to: ${channel === 'msedge' ? 'Microsoft Edge' : 'Google Chrome'}`, 'system');
        });
    }

    btnSaveSettings.addEventListener('click', async () => {
        const bpclUserId = (inputBpclUser ? inputBpclUser.value : '').trim();
        const bpclPassword = (inputBpclPassword ? inputBpclPassword.value : '').trim();
        const licenseKey = (inputLicenseKey ? inputLicenseKey.value : '').trim();
        const browserChannel = selectBrowserChannel ? selectBrowserChannel.value : 'chrome';

        // 1 & 2. If either input is blank:
        if (!bpclUserId || !licenseKey) {
            showNotification('Please enter both BPCL User ID and License Key.', 'error');
            updateAgencyBadge('no-license');
            return;
        }

        // 1. Immediately save bpclUserId, bpclPassword, and licenseKey to store FIRST, before making network validation call
        await Promise.all([
            setPersistentSetting('bpclUserId', bpclUserId),
            setPersistentSetting('bpclPassword', bpclPassword),
            setPersistentSetting('licenseKey', licenseKey),
            setPersistentSetting('browserChannel', browserChannel)
        ]);

        if (window.electronAPI && window.electronAPI.saveSettings) {
            await window.electronAPI.saveSettings({
                bpclUserId,
                bpclPassword,
                licenseKey,
                browserChannel
            }).catch(() => {});
        }

        cachedCredentials = {
            bpclUserId,
            bpclPassword,
            licenseKey,
            browserChannel,
            agencyName: currentAgencyName || ''
        };

        try {
            btnSaveSettings.disabled = true;
            appendLog('🔐 Verifying BPCL User ID and License Key...', 'system');
            // Show a neutral pending state immediately so no stale badge/agency name from a
            // previous configuration is visible while this fresh verification is in flight.
            showVerifyingBadge();

            // 3. Send POST request to /api/verify with { licenseKey, bpclUserId }
            let error = { response: { data: null } };
            const res = await verifyCredentials(licenseKey, bpclUserId);
            const data = res;
            error = { response: { data: res } };
            console.log('[LICENSE DEBUG] Response received:', error.response?.data || error);
            const serverDate = res?.expiresAt || res?.expiry || (res?.manifest && res.manifest.expiresAt) || '';
            if (serverDate) {
                window.currentLicenseExpiresAt = serverDate;
                currentExpiresAt = serverDate;
            }

            // 4. Cloudflare's `success` flag is the single canonical verdict — checking any
            // other property here (status codes, isExpired, etc.) is what was producing a
            // false "Wrong BPCL User ID and License Key" toast for genuinely valid saves.
            if (!res || res.success !== true) {
                const serverMessage = res?.message || "License verification failed.";
                const isExpired = Boolean(
                    res?.isExpired ||
                    res?.manifest?.isExpired ||
                    res?.error === 'SUBSCRIPTION_EXPIRED' ||
                    (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
                );
                if (isExpired) {
                    await applyLicenseState(false, { message: serverMessage, isExpired: true });
                    showNotification(serverMessage, 'error');
                    const expDate = error.response?.data?.expiresAt || data?.expiresAt;
                    const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                    if (expDate) {
                        window.currentLicenseExpiresAt = expDate;
                        currentExpiresAt = expDate;
                    }

                    // Top Header Banner displays server message directly
                    if (banner) {
                        banner.innerText = serverMessage;
                    }
                    if (expiryBannerMessage) {
                        expiryBannerMessage.textContent = serverMessage;
                    }
                    if (currentStateText) {
                        currentStateText.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
                    }
                    const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
                    if (warningBox) {
                        warningBox.innerText = formattedExp
                            ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.`
                            : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
                    }
                    if (renewalBanner && renewalBanner !== warningBox) {
                        renewalBanner.innerText = formattedExp
                            ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.`
                            : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
                    }

                    renderRedErrorAlertBanner(serverMessage, expDate);
                } else {
                    await applyLicenseState(false, { message: serverMessage });
                    showNotification('Invalid credentials. Please verify your BPCL User ID and License Key.', 'error');
                }
                btnSaveSettings.disabled = false;
                // Do NOT clear or reset stored credentials when license validation returns 403 or fails.
                return;
            }

            // 5. If response is success (200): bind the exact agencyName/expiry returned by
            // the Cloudflare Worker — the single source of truth — and persist them.
            await applyLicenseState(true, res);

            const verifiedAgencyName = res.agencyName || res.distributor || currentAgencyName || 'Agency Slot';
            showNotification(`Configuration saved and verified: ${verifiedAgencyName}`, 'success');
            setTimeout(() => {
                btnSaveSettings.disabled = false;
            }, 1000);
        } catch (error) {
            console.log('[LICENSE DEBUG] Response received:', error.response?.data || error);
            btnSaveSettings.disabled = false;
            let data = null;
            try {
                if (error.response && typeof error.response.json === 'function') {
                    data = await error.response.json();
                } else if (error.response?.data) {
                    data = error.response.data;
                }
            } catch (_) {}
            const expDate = error.response?.data?.expiresAt || data?.expiresAt;
            const formattedExp = expDate ? new Date(expDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

            const serverMessage = error.response?.data?.message || data?.message || error.message || "License verification failed.";
            if (expDate) {
                window.currentLicenseExpiresAt = expDate;
                currentExpiresAt = expDate;
            }
            const isExpired = Boolean(
                error.response?.data?.isExpired ||
                data?.isExpired ||
                error.error === 'SUBSCRIPTION_EXPIRED' ||
                (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
            );
            if (isExpired) {
                await applyLicenseState(false, { message: serverMessage, isExpired: true });
                showNotification(serverMessage, 'error');
                // Top Header Banner displays server message directly
                if (banner) {
                    banner.innerText = serverMessage;
                }
                if (expiryBannerMessage) {
                    expiryBannerMessage.textContent = serverMessage;
                }
                if (currentStateText) {
                    currentStateText.innerText = formattedExp ? `🔴 License has expired (Expired on: ${formattedExp})` : `🔴 License has expired (Subscription Expired)`;
                }
                const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
                if (warningBox) {
                    warningBox.innerText = formattedExp
                        ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.`
                        : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
                }
                if (renewalBanner && renewalBanner !== warningBox) {
                    renewalBanner.innerText = formattedExp
                        ? `⚠️ Subscription Expired on ${formattedExp}: Automation is paused. Please renew license.`
                        : `⚠️ Subscription Expired: Automation is paused. Please renew license.`;
                }

                renderRedErrorAlertBanner(serverMessage, expDate);
            } else {
                await applyLicenseState(false, { message: serverMessage });
                showNotification('Invalid credentials. Please verify your BPCL User ID and License Key.', 'error');
            }
            // Do NOT clear or reset stored credentials when license validation fails.
        }
    });

    // Clear / Reset Settings (Purge all stored credentials and local data)
    if (btnClearSettings) {
        btnClearSettings.addEventListener('click', async () => {
            try {
                btnClearSettings.disabled = true;
                await clearPersistentSettings();
                if (window.electronAPI && window.electronAPI.clearSettings) {
                    await window.electronAPI.clearSettings().catch(() => {});
                }
                inputBpclUser.value = '';
                inputBpclPassword.value = '';
                inputLicenseKey.value = '';
                if (selectBrowserChannel) selectBrowserChannel.value = 'chrome';
                cachedCredentials = {
                    bpclUserId: '',
                    bpclPassword: '',
                    licenseKey: '',
                    agencyName: '',
                    browserChannel: 'chrome',
                    expiresAt: ''
                };
                updateAgencyBadge('unregistered');
                updateLicenseExpiryDisplay(null);
                appendLog('🗑️ All saved credentials and local data have been purged.', 'system');
                setTimeout(() => {
                    btnClearSettings.disabled = false;
                }, 400);
            } catch (err) {
                btnClearSettings.disabled = false;
                appendLog(`❌ Error clearing settings: ${err.message}`, 'error');
            }
        });
    }

    // Password visibility toggle
    btnTogglePassword.addEventListener('click', () => {
        const isPassword = inputBpclPassword.type === 'password';
        inputBpclPassword.type = isPassword ? 'text' : 'password';
    });

    // ---------------------------------------------------------
    // STATUS & PROGRESS PRESENTATION
    // ---------------------------------------------------------
    function updateStatus(state) {
        if (statusBadgeText) statusBadgeText.textContent = state;
        const stateBadge = document.getElementById('stateBadge');
        if (stateBadge) {
            const cleanState = state ? state.replace(/^[•\s]+/, '') : 'Idle';
            stateBadge.textContent = `• ${cleanState}`;
            stateBadge.className = 'status-pill';
            const sLower = cleanState.toLowerCase();
            if (sLower.includes('idle')) {
                stateBadge.classList.add('status-idle');
            } else if (sLower.includes('complete')) {
                stateBadge.classList.add('status-completed');
            } else if (sLower.includes('stopping') || sLower.includes('stopped')) {
                stateBadge.classList.add('status-stopped');
            } else if (sLower.includes('error') || sLower.includes('fail')) {
                stateBadge.classList.add('status-error');
            } else {
                stateBadge.classList.add('status-running');
            }
        }

        if (statusPulseDot) {
            statusPulseDot.className = 'pulse-dot';
            const s = (state || '').toLowerCase();
            if (s.includes('idle')) {
                statusPulseDot.classList.add('idle');
            } else if (s.includes('complete')) {
                statusPulseDot.classList.add('completed');
            } else if (s.includes('stopping')) {
                statusPulseDot.classList.add('stopped');
            } else if (s.includes('stopped')) {
                statusPulseDot.classList.add('stopped');
            } else if (s.includes('error') || s.includes('fail')) {
                statusPulseDot.classList.add('error');
            } else {
                statusPulseDot.classList.add('running');
            }
        }

        const s = (state || '').toLowerCase();
        if (s.includes('stopped by user')) {
            statusDetailText.textContent = 'Process stopped by user (Idle).';
        } else if (s.includes('idle')) {
            statusDetailText.textContent = 'Ready For Cash Memo Cancel';
        } else if (s.includes('complete')) {
            statusDetailText.textContent = 'All operations completed successfully.';
        } else if (s.includes('stopping')) {
            statusDetailText.textContent = 'Gracefully stopping after current memo...';
        } else if (s.includes('stopped')) {
            if (!statusDetailText.textContent.includes('Process stopped')) {
                statusDetailText.textContent = 'Process stopped by user (Idle).';
            }
        } else if (s.includes('error') || s.includes('fail')) {
            statusDetailText.textContent = 'Process halted due to an issue.';
        } else {
            statusDetailText.textContent = state;
        }
    }

    function updateProgress(data) {
        if (!data) return;
        const current = data.current || 0;
        const total = data.total || 0;
        const success = data.success || 0;
        const failed = data.failed || 0;
        const skipped = data.skipped || 0;

        // Progress Pill: "[12/50] Processed | Success: 11 | Failed: 1"
        liveProgressSummary.textContent = `[${current}/${total}] Processed | Success: ${success} | Failed: ${failed}`;

        // Percentage & bar
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        progressBarFill.style.width = `${percent}%`;
        progressPercentageText.textContent = `${percent}%`;

        // Metric numbers
        statTotal.textContent = total;
        statProcessed.textContent = current;
        statSuccess.textContent = success;
        statFailed.textContent = failed;
        statSkipped.textContent = skipped;
    }

    let isProcessRunning = false;
    let isStopping = false;

    function setButtonState(state) {
        // state: 'idle' | 'running' | 'stopping'
        if (state === 'running') {
            isProcessRunning = true;
            isStopping = false;
            btnStartCancellation.disabled = false;
            btnStartCancellation.classList.remove('btn-primary');
            btnStartCancellation.classList.add('btn-danger-pulsing');
            playIcon.classList.add('hidden');
            if (stopIcon) stopIcon.classList.remove('hidden');
            spinnerIcon.classList.add('hidden');
            btnStartText.textContent = 'Stop Auto-Cancellation';
        } else if (state === 'stopping') {
            isProcessRunning = true;
            isStopping = true;
            btnStartCancellation.disabled = true;
            btnStartCancellation.classList.remove('btn-primary');
            btnStartCancellation.classList.add('btn-danger-pulsing');
            playIcon.classList.add('hidden');
            if (stopIcon) stopIcon.classList.add('hidden');
            spinnerIcon.classList.remove('hidden');
            btnStartText.textContent = 'Stopping...';
        } else {
            // 'idle'
            isProcessRunning = false;
            isStopping = false;
            if (isSubscriptionExpired) {
                btnStartCancellation.disabled = true;
                btnStartCancellation.classList.remove('btn-danger-pulsing');
                btnStartCancellation.classList.add('btn-primary', 'btn-subscription-expired');
                playIcon.classList.add('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                btnStartText.textContent = '🔒 Subscription Expired';
            } else if (!inputLicenseKey?.value?.trim() && !cachedCredentials?.licenseKey) {
                btnStartCancellation.disabled = true;
                btnStartCancellation.classList.remove('btn-danger-pulsing');
                btnStartCancellation.classList.add('btn-primary', 'btn-subscription-expired');
                playIcon.classList.add('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                btnStartText.textContent = '🔒 License Required';
            } else {
                btnStartCancellation.disabled = false;
                btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-subscription-expired', 'btn-config-error');
                btnStartCancellation.classList.add('btn-primary');
                playIcon.classList.remove('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                btnStartText.textContent = 'Start Auto-Cancellation';
            }
        }

        // Every cancellation lifecycle transition lands here, so this is the
        // single place the mutual-exclusion lock needs hooking: 'running' /
        // 'stopping' lock the Fetch Delivery Report button, 'idle' releases it.
        window.__nexusCancellationRunning = isProcessRunning;
        refreshAutomationLock();
    }

    // ---------------------------------------------------------
    // TERMINAL LOG CONSOLE
    // ---------------------------------------------------------
    function appendLog(message, type = 'default') {
        const line = document.createElement('div');
        line.className = `log-line ${type}`;

        const timestamp = new Date().toLocaleTimeString();
        line.textContent = `[${timestamp}] ${toEnglishMessage(message)}`;

        terminalConsole.appendChild(line);
        terminalConsole.scrollTop = terminalConsole.scrollHeight;
    }

    btnClearLogs.addEventListener('click', () => {
        terminalConsole.innerHTML = '';
        appendLog('[System] Nexus Automation Environment initialized. Ready to proceed.', 'system');
    });

    // Claude AI Hexagonal Refresh Button Logic
    const refreshBtn = document.getElementById('btnStateRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        // Trigger spin animation
        refreshBtn.classList.remove('spin');
        void refreshBtn.offsetWidth; // restart animation
        refreshBtn.classList.add('spin');

        // Native Electron Ctrl+R reload
        setTimeout(() => {
          window.location.reload();
        }, 350);
      });
    }

    // ---------------------------------------------------------
    // START AUTOMATION ACTION & MODAL LOGIC
    // ---------------------------------------------------------
    let isPromptingConfirmation = false;

    function openStartConfirmModal() {
        if (startConfirmModal) {
            startConfirmModal.classList.remove('hidden');
            if (btnConfirmStart) {
                btnConfirmStart.focus();
            }
        }
    }

    function closeStartConfirmModal() {
        if (startConfirmModal) {
            startConfirmModal.classList.add('hidden');
        }
    }

    async function executeStartCancellation() {
        closeStartConfirmModal();
        if (isProcessRunning || isPromptingConfirmation) return;
        isPromptingConfirmation = true;

        // Auto-save form inputs in case user edited without clicking save
        const browserChannel = selectBrowserChannel ? selectBrowserChannel.value : 'chrome';
        let bpclUserId = (inputBpclUser?.value || '').trim();
        let bpclPassword = (inputBpclPassword?.value || '').trim();
        let licenseKey = (inputLicenseKey?.value || '').trim();

        // Fallback to stored credentials if DOM inputs are empty/unmounted so we never wipe saved configuration!
        if (!bpclUserId || !licenseKey) {
            const stored = await getStoredCredentials();
            if (!bpclUserId) bpclUserId = (stored.bpclUserId || '').trim();
            if (!bpclPassword) bpclPassword = (stored.bpclPassword || '').trim();
            if (!licenseKey) licenseKey = (stored.licenseKey || '').trim();
        }

        const settings = {
            bpclUserId,
            bpclPassword,
            licenseKey,
            browserChannel,
            userId: bpclUserId,
            password: bpclPassword
        };

        if (bpclUserId) await setPersistentSetting('bpclUserId', bpclUserId);
        if (bpclPassword) await setPersistentSetting('bpclPassword', bpclPassword);
        if (licenseKey) await setPersistentSetting('licenseKey', licenseKey);
        await setPersistentSetting('browserChannel', browserChannel);

        if (window.electronAPI && window.electronAPI.saveSettings && (bpclUserId || licenseKey)) {
            await window.electronAPI.saveSettings(settings);
        }

        appendLog('Starting auto-cancellation process...', 'system');

        // Ensure manifest.selectors & manifest.anticaptchaApiKey received from Cloudflare license validation is held strictly in volatile RAM
        if ((!currentInMemorySelectors || !currentInMemoryAntiCaptchaKey) && settings.licenseKey && settings.bpclUserId) {
            appendLog('🔐 Initializing automation security manifest...', 'system');
            try {
                const verifyRes = await verifyCredentials(settings.licenseKey, settings.bpclUserId);
                if (verifyRes && verifyRes.success) {
                    const s = verifyRes.manifest?.selectors || verifyRes.payload?.selectors || verifyRes.selectors;
                    if (s && typeof s === 'object' && Object.keys(s).length > 0) {
                        currentInMemorySelectors = Object.freeze({ ...s });
                    }
                    const k = verifyRes.manifest?.anticaptchaApiKey || verifyRes.anticaptchaApiKey || verifyRes.payload?.anticaptchaApiKey || verifyRes.apiKey;
                    if (k) {
                        currentInMemoryAntiCaptchaKey = String(k).trim();
                    }
                }
            } catch (_) {}
        }

        try {
            if (window.electronAPI && window.electronAPI.startCancellation) {
                const response = await window.electronAPI.startCancellation({
                    browserChannel,
                    anticaptchaApiKey: currentInMemoryAntiCaptchaKey,
                    selectors: currentInMemorySelectors
                });
                if (response && response.cancelled) {
                    appendLog(`Process cancelled: ${response.reason}`, 'warn');
                    setButtonState('idle');
                    updateStatus('Idle');
                }
            }
        } catch (err) {
            appendLog(`Execution error: ${err.message}`, 'error');
            setButtonState('idle');
            updateStatus('Error');
        } finally {
            isPromptingConfirmation = false;
        }
    }

    btnStartCancellation.addEventListener('click', async () => {
        if (isProcessRunning) {
            if (isStopping) return;
            openStopConfirmModal();
            return;
        }

        // Mutual exclusion: the button is already dimmed and click-through
        // disabled, but refuse here too in case a click lands anyway.
        if (activeAutomation === 'delivery_report' || window.__nexusDeliveryFetchRunning) {
            appendLog('⚠️ Cannot start cancellation while the Delivery Report is running. Stop it first.', 'warn');
            return;
        }

        if (isSubscriptionExpired) {
            const formattedDate = formatExpiryDate(currentExpiresAt);
            appendLog(`⚠️ Cannot start operations: Subscription expired${formattedDate ? ` on ${formattedDate}` : ''}. Automation is paused.`, 'warn');
            openRenewalModal();
            return;
        }

        const stored = await getStoredCredentials();
        const currentLicense = (inputLicenseKey?.value || '').trim() || (stored.licenseKey || '').trim();
        if (!currentLicense) {
            appendLog('❌ Cannot start operations: License key is required. Please check Settings.', 'error');
            return;
        }

        if (isPromptingConfirmation) return;

        openStartConfirmModal();
    });

    // ---------------------------------------------------------
    // DELIVERY REPORT (ADDITIVE)
    // ---------------------------------------------------------
    // Completely independent of the cash-memo cancellation flow: its own
    // IPC channels, its own button state and its own in-memory cache.
    // ---------------------------------------------------------
    const btnFetchDeliveryReport = document.getElementById('btnFetchDeliveryReport');
    const btnFetchDeliveryText = document.getElementById('btnFetchDeliveryText');
    // Renamed to btnOpenLastReport in the two-section dashboard; the old id is
    // kept as a fallback so an older index.html still wires up.
    const btnViewLastDeliveryReport = document.getElementById('btnOpenLastReport')
        || document.getElementById('btnViewLastDeliveryReport');

    const deliveryReportModal = document.getElementById('deliveryReportModal');
    const modalTotalDelivered = document.getElementById('modalTotalDelivered');
    const modalOperatorDelivered = document.getElementById('modalOperatorDelivered');
    const deliveryOperatorTableBody = document.getElementById('deliveryOperatorTableBody');
    const deliveryReportEmpty = document.getElementById('deliveryReportEmpty');
    const deliveryReportMeta = document.getElementById('deliveryReportMeta');
    const btnDownloadDeliveryCsv = document.getElementById('btnDownloadDeliveryCsv');
    const btnCloseDeliveryModal = document.getElementById('btnCloseDeliveryModal');
    const btnCloseDeliveryModalX = document.getElementById('btnCloseDeliveryModalX');

    if (btnFetchDeliveryReport) {
        const deliveryBtnIcon = btnFetchDeliveryReport.querySelector('.delivery-btn-icon');
        const deliveryBtnSpinner = btnFetchDeliveryReport.querySelector('.delivery-btn-spinner');

        // Latest report is cached here so the modal can be reopened
        // without hitting the portal again.
        let latestDeliveryReport = null;
        let isDeliveryFetchRunning = false;

        // ---- Durable cache ------------------------------------
        // Survives both an early Stop and a full app refresh. Records are
        // upserted by consumer number, never wiped, so a stopped run can only
        // ever add to what was already collected.
        const DELIVERY_REPORT_STORAGE_KEY = 'nexus_saved_delivery_report';

        function loadSavedDeliveryReport() {
            try {
                const raw = localStorage.getItem(DELIVERY_REPORT_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return null;
                if (!Array.isArray(parsed.rawRecords)) parsed.rawRecords = [];
                if (!Array.isArray(parsed.operatorSummary)) parsed.operatorSummary = [];
                return parsed;
            } catch (err) {
                console.warn('[DeliveryReport] Could not read saved report:', err);
                return null;
            }
        }

        function saveDeliveryReport(report) {
            try {
                localStorage.setItem(DELIVERY_REPORT_STORAGE_KEY, JSON.stringify(report));
                return true;
            } catch (err) {
                console.warn('[DeliveryReport] Could not save report:', err);
                return false;
            }
        }

        // Descending operator leaderboard, recomputed from the merged dataset
        // so the table always matches the records actually held.
        function buildOperatorSummaryFromRecords(records) {
            const tally = new Map();
            for (const rec of (records || [])) {
                const name = String(rec?.operatorName || '').trim() || 'Unassigned';
                tally.set(name, (tally.get(name) || 0) + 1);
            }
            return Array.from(tally.entries())
                .map(([operatorName, count]) => ({ operatorName, count }))
                .sort((a, b) => (b.count - a.count) || a.operatorName.localeCompare(b.operatorName));
        }

        /**
         * Upsert an incoming report into the saved one and persist the result.
         *
         * consumerNumber is the unique id: existing consumers are refreshed,
         * new ones appended, and nothing is ever removed. A run that stops with
         * zero records therefore leaves the previous dataset fully intact.
         */
        function mergeAndPersistDeliveryReport(incoming) {
            const previous = loadSavedDeliveryReport();
            const merged = new Map();

            for (const rec of (previous?.rawRecords || [])) {
                const key = String(rec?.consumerNumber || '').trim();
                if (!key) continue;
                merged.set(key, {
                    consumerNumber: key,
                    consumerName: rec.consumerName || '',
                    areaDescription: rec.areaDescription || '',
                    bookDate: rec.bookDate || '',
                    operatorName: rec.operatorName || ''
                });
            }

            let addedCount = 0;
            for (const rec of (incoming?.rawRecords || [])) {
                const key = String(rec?.consumerNumber || '').trim();
                if (!key) continue;
                if (!merged.has(key)) addedCount++;
                merged.set(key, {
                    consumerNumber: key,
                    consumerName: rec.consumerName || '',
                    areaDescription: rec.areaDescription || '',
                    bookDate: rec.bookDate || '',
                    operatorName: rec.operatorName || ''
                });
            }

            const rawRecords = Array.from(merged.values());

            // Header figures: trust a fresh non-zero reading, otherwise keep the
            // last good one rather than regressing the modal to 0.
            const pickCount = (fresh, saved) => {
                const f = Number(fresh);
                if (Number.isFinite(f) && f > 0) return f;
                const s = Number(saved);
                return Number.isFinite(s) && s > 0 ? s : (Number.isFinite(f) ? f : 0);
            };

            const mergedReport = {
                totalDelivered: pickCount(incoming?.totalDelivered, previous?.totalDelivered),
                deliveredViaApp: pickCount(incoming?.deliveredViaApp, previous?.deliveredViaApp),
                rawRecords,
                operatorSummary: buildOperatorSummaryFromRecords(rawRecords),
                stopped: Boolean(incoming?.stopped),
                pagesScraped: incoming?.pagesScraped ?? previous?.pagesScraped ?? 0,
                generatedAt: incoming?.generatedAt || new Date().toISOString(),
                addedThisRun: addedCount
            };

            saveDeliveryReport(mergedReport);
            return mergedReport;
        }

        function setDeliveryButtonState(running) {
            isDeliveryFetchRunning = running;
            // Read by updateLicenseUIState so a license flip mid-run can never
            // lock the user out of the Stop control.
            window.__nexusDeliveryFetchRunning = running;

            if (running) {
                // RED STOP state: flat red, static text, NO spinner and no
                // loading animation. 'is-loading' is deliberately not applied -
                // it is the loader marker and drives the rotating SVG's styling.
                btnFetchDeliveryReport.classList.remove('is-loading');
                btnFetchDeliveryReport.classList.add('is-stopping');
                btnFetchDeliveryReport.disabled = false;
                btnFetchDeliveryReport.style.opacity = '1';
                btnFetchDeliveryReport.style.pointerEvents = 'auto';
                btnFetchDeliveryReport.title = 'Stop fetching the delivery report';
                if (deliveryBtnIcon) deliveryBtnIcon.classList.add('hidden');
                if (deliveryBtnSpinner) deliveryBtnSpinner.classList.add('hidden');
                if (btnFetchDeliveryText) btnFetchDeliveryText.textContent = '⏹ Stop Fetching Report';
            } else {
                // The run is over - a stop dialog left open is now moot.
                closeDeliveryStopConfirmModal();
                // Back to the cyan/teal "Start Fetching Report" appearance.
                btnFetchDeliveryReport.classList.remove('is-loading', 'is-stopping');
                if (deliveryBtnIcon) deliveryBtnIcon.classList.add('hidden');
                if (deliveryBtnSpinner) deliveryBtnSpinner.classList.add('hidden');
                if (btnFetchDeliveryText) btnFetchDeliveryText.textContent = 'Start Fetching Report';
                // Re-enable only if the license still allows it (this also
                // restores the title text).
                updateLicenseUIState(isLicenseValid);
            }

            // Lock / release the Auto-Cancellation button to match.
            refreshAutomationLock();
        }

        // Establish the idle label/state on load (the markup ships with it, but
        // this keeps the button and the state card in sync from one place).
        if (deliveryBtnIcon) deliveryBtnIcon.classList.add('hidden');
        if (btnFetchDeliveryText) btnFetchDeliveryText.textContent = 'Start Fetching Report';

        function openDeliveryReportModal() {
            if (deliveryReportModal) deliveryReportModal.classList.remove('hidden');
        }

        function closeDeliveryReportModal() {
            if (deliveryReportModal) deliveryReportModal.classList.add('hidden');
        }

        function renderDeliveryReport(report) {
            if (!report) return;

            const summary = Array.isArray(report.operatorSummary) ? report.operatorSummary : [];
            const records = Array.isArray(report.rawRecords) ? report.rawRecords : [];

            if (modalTotalDelivered) {
                modalTotalDelivered.textContent = String(report.totalDelivered ?? 0);
            }
            if (modalOperatorDelivered) {
                modalOperatorDelivered.textContent = String(report.deliveredViaApp ?? 0);
            }

            if (deliveryOperatorTableBody) {
                deliveryOperatorTableBody.innerHTML = '';
                // Already sorted descending by the scraper; re-sort defensively
                // so the table is correct even for a cached/legacy payload.
                const rows = summary.slice().sort((a, b) => (b.count - a.count));
                for (const entry of rows) {
                    const tr = document.createElement('tr');

                    const name = entry.operatorName || 'Unassigned';

                    // The name is ellipsised when it overflows, so it needs a
                    // tooltip. Uses the app's own [data-tooltip] dark pill (the
                    // same one the Refresh and History buttons use) rather than
                    // a native `title`, which renders as the OS's default box.
                    // The tooltip anchors on the cell (which must not clip) while
                    // the inner span does the ellipsising - an element cannot
                    // both hide its overflow and let a tooltip escape it.
                    const tdName = document.createElement('td');
                    tdName.className = 'col-operator';
                    tdName.setAttribute('data-tooltip', name);
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'delivery-operator-name';
                    nameSpan.textContent = name;
                    tdName.appendChild(nameSpan);

                    const tdCount = document.createElement('td');
                    tdCount.className = 'col-count';
                    tdCount.textContent = String(entry.count ?? 0);

                    tr.appendChild(tdName);
                    tr.appendChild(tdCount);
                    deliveryOperatorTableBody.appendChild(tr);
                }
            }

            if (deliveryReportEmpty) {
                deliveryReportEmpty.classList.toggle('hidden', summary.length > 0);
            }

            if (deliveryReportMeta) {
                const parts = [`${records.length} consumer record${records.length === 1 ? '' : 's'}`];
                if (report.stopped) parts.push('partial (stopped)');
                deliveryReportMeta.textContent = parts.join(' · ');
            }

            if (btnDownloadDeliveryCsv) {
                btnDownloadDeliveryCsv.disabled = records.length === 0;
            }

            if (btnViewLastDeliveryReport) {
                btnViewLastDeliveryReport.classList.remove('hidden');
            }
        }

        // ---- Fetch confirmation modal ------------------------
        const deliveryConfirmModal = document.getElementById('deliveryConfirmModal');
        const btnConfirmFetchDelivery = document.getElementById('btnConfirmFetchDelivery');
        const btnCancelFetchDelivery = document.getElementById('btnCancelFetchDelivery');

        function openDeliveryConfirmModal() {
            if (deliveryConfirmModal) {
                deliveryConfirmModal.classList.remove('hidden');
                if (btnConfirmFetchDelivery) btnConfirmFetchDelivery.focus();
                return true;
            }
            return false;
        }

        function closeDeliveryConfirmModal() {
            if (deliveryConfirmModal) deliveryConfirmModal.classList.add('hidden');
        }

        // ---- Stop confirmation ("Keep Running" / "Stop Fetching") ----
        const deliveryStopConfirmModal = document.getElementById('deliveryStopConfirmModal');
        const btnConfirmStopDelivery = document.getElementById('btnConfirmStopDelivery');
        const btnKeepFetchingDelivery = document.getElementById('btnKeepFetchingDelivery');

        function openDeliveryStopConfirmModal() {
            if (deliveryStopConfirmModal) {
                deliveryStopConfirmModal.classList.remove('hidden');
                // "Keep Running" is the safe default, so it takes focus.
                if (btnKeepFetchingDelivery) btnKeepFetchingDelivery.focus();
                return true;
            }
            return false;
        }

        function closeDeliveryStopConfirmModal() {
            if (deliveryStopConfirmModal) deliveryStopConfirmModal.classList.add('hidden');
        }

        // Only reached once the operator has confirmed "Stop Fetching".
        async function executeDeliveryReportStop() {
            closeDeliveryStopConfirmModal();
            if (!isDeliveryFetchRunning) return;

            btnFetchDeliveryReport.disabled = true;
            if (btnFetchDeliveryText) btnFetchDeliveryText.textContent = 'Stopping...';
            setDeliverySummary('Stopping — keeping the records collected so far...');
            appendLog('🛑 Stopping delivery report — records already collected will be kept.', 'warn');
            try {
                await ipcRenderer.invoke('stop-delivery-report');
            } catch (_) {}
        }

        // ---- Trigger / Stop ----------------------------------
        async function executeDeliveryReportFetch() {
            closeDeliveryConfirmModal();
            if (isDeliveryFetchRunning) return;

            // Re-check: the license could have been invalidated - or a
            // cancellation could have started - while the confirmation dialog
            // was sitting open.
            if (!isLicenseValid) {
                appendLog('❌ Cannot fetch report: your BPCL User ID / License Key is not valid. Please check Settings.', 'error');
                return;
            }
            if (isProcessRunning || activeAutomation === 'cancellation') {
                appendLog('⚠️ Cannot fetch the report while Cash Memo Cancellation is running. Stop it first.', 'warn');
                return;
            }

            const stored = await getStoredCredentials();
            const currentLicense = (inputLicenseKey?.value || '').trim() || (stored.licenseKey || '').trim();
            if (!currentLicense) {
                appendLog('❌ Cannot fetch report: License key is required. Please check Settings.', 'error');
                return;
            }

            // Hydrate RAM-only selectors / captcha key, same as the main flow.
            if ((!currentInMemorySelectors || !currentInMemoryAntiCaptchaKey) && currentLicense && stored.bpclUserId) {
                try {
                    const verifyRes = await verifyCredentials(currentLicense, stored.bpclUserId);
                    if (verifyRes && verifyRes.success) {
                        const sel = verifyRes.manifest?.selectors || verifyRes.payload?.selectors || verifyRes.selectors;
                        if (sel && typeof sel === 'object' && Object.keys(sel).length > 0) {
                            currentInMemorySelectors = Object.freeze({ ...sel });
                        }
                        const key = verifyRes.manifest?.anticaptchaApiKey || verifyRes.anticaptchaApiKey
                            || verifyRes.payload?.anticaptchaApiKey || verifyRes.apiKey;
                        if (key) currentInMemoryAntiCaptchaKey = String(key).trim();
                    }
                } catch (_) {}
            }

            setDeliveryButtonState(true);
            appendLog('📊 Fetching delivery report...', 'system');

            try {
                const response = await ipcRenderer.invoke('start-delivery-report', {
                    browserChannel: selectBrowserChannel ? selectBrowserChannel.value : 'chrome',
                    anticaptchaApiKey: currentInMemoryAntiCaptchaKey,
                    selectors: currentInMemorySelectors
                });

                if (response && response.cancelled) {
                    appendLog(`Delivery report cancelled: ${response.reason}`, 'warn');
                } else if (response && response.error) {
                    appendLog(`❌ Delivery report failed: ${response.error}`, 'error');
                }
            } catch (err) {
                appendLog(`❌ Delivery report error: ${err.message}`, 'error');
            } finally {
                setDeliveryButtonState(false);
            }
        }

        btnFetchDeliveryReport.addEventListener('click', async () => {
            // Running (red STOP state): confirm before killing the run, so a
            // mis-click cannot throw away an in-progress fetch.
            if (isDeliveryFetchRunning) {
                if (!openDeliveryStopConfirmModal()) {
                    if (window.confirm('Are you sure you want to stop fetching? Records already collected will be preserved.')) {
                        executeDeliveryReportStop();
                    }
                }
                return;
            }

            if (!isLicenseValid) {
                appendLog('❌ Cannot fetch report: your BPCL User ID / License Key is not valid. Please check Settings.', 'error');
                return;
            }

            // Never contend with a running cancellation for the browser session.
            if (isProcessRunning || activeAutomation === 'cancellation') {
                appendLog('⚠️ Cannot fetch the report while Cash Memo Cancellation is running. Stop it first.', 'warn');
                return;
            }

            if (isSubscriptionExpired) {
                const formattedDate = formatExpiryDate(currentExpiresAt);
                appendLog(`⚠️ Cannot fetch report: Subscription expired${formattedDate ? ` on ${formattedDate}` : ''}.`, 'warn');
                openRenewalModal();
                return;
            }

            // Scraping never starts on the click itself - the operator has to
            // confirm first. Native confirm() is the fallback if the modal
            // markup is unavailable for any reason.
            if (!openDeliveryConfirmModal()) {
                if (window.confirm('Do you want to start fetching the Delivery Report?')) {
                    executeDeliveryReportFetch();
                }
            }
        });

        if (btnConfirmFetchDelivery) {
            btnConfirmFetchDelivery.addEventListener('click', (e) => {
                e.preventDefault();
                executeDeliveryReportFetch();
            });
        }
        if (btnCancelFetchDelivery) {
            btnCancelFetchDelivery.addEventListener('click', (e) => {
                e.preventDefault();
                closeDeliveryConfirmModal();
                appendLog('Delivery report fetch cancelled.', 'system');
            });
        }
        if (deliveryConfirmModal) {
            deliveryConfirmModal.addEventListener('click', (e) => {
                if (e.target === deliveryConfirmModal) closeDeliveryConfirmModal();
            });
        }

        if (btnConfirmStopDelivery) {
            btnConfirmStopDelivery.addEventListener('click', (e) => {
                e.preventDefault();
                executeDeliveryReportStop();
            });
        }
        if (btnKeepFetchingDelivery) {
            // "Keep Running": dismiss and let the fetch carry on untouched.
            btnKeepFetchingDelivery.addEventListener('click', (e) => {
                e.preventDefault();
                closeDeliveryStopConfirmModal();
                appendLog('▶️ Continuing delivery report fetch.', 'system');
            });
        }
        if (deliveryStopConfirmModal) {
            deliveryStopConfirmModal.addEventListener('click', (e) => {
                // Dismissing the backdrop keeps the fetch running.
                if (e.target === deliveryStopConfirmModal) closeDeliveryStopConfirmModal();
            });
        }

        // ---- Reopen the cached report (no re-scrape) ---------
        if (btnViewLastDeliveryReport) {
            btnViewLastDeliveryReport.addEventListener('click', () => {
                // Falls back to the durable cache so the link keeps working
                // after a refresh, when nothing has been fetched this session.
                const report = latestDeliveryReport || loadSavedDeliveryReport();
                if (!report) {
                    appendLog('ℹ️ No delivery report has been fetched yet.', 'system');
                    return;
                }
                latestDeliveryReport = report;
                renderDeliveryReport(report);
                openDeliveryReportModal();
            });
        }

        // ---- Modal close ------------------------------------
        if (btnCloseDeliveryModal) {
            btnCloseDeliveryModal.addEventListener('click', closeDeliveryReportModal);
        }
        if (btnCloseDeliveryModalX) {
            btnCloseDeliveryModalX.addEventListener('click', closeDeliveryReportModal);
        }
        if (deliveryReportModal) {
            deliveryReportModal.addEventListener('click', (e) => {
                if (e.target === deliveryReportModal) closeDeliveryReportModal();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // Escape on the stop dialog means "Keep Running" - never stop.
            if (deliveryStopConfirmModal && !deliveryStopConfirmModal.classList.contains('hidden')) {
                e.preventDefault();
                closeDeliveryStopConfirmModal();
                return;
            }
            if (deliveryConfirmModal && !deliveryConfirmModal.classList.contains('hidden')) {
                e.preventDefault();
                closeDeliveryConfirmModal();
                return;
            }
            if (deliveryReportModal && !deliveryReportModal.classList.contains('hidden')) {
                closeDeliveryReportModal();
            }
        });

        // ---- CSV export --------------------------------------
        if (btnDownloadDeliveryCsv) {
            btnDownloadDeliveryCsv.addEventListener('click', async () => {
                const records = latestDeliveryReport && Array.isArray(latestDeliveryReport.rawRecords)
                    ? latestDeliveryReport.rawRecords
                    : [];

                if (!records.length) {
                    appendLog('⚠️ There are no delivery records to export yet.', 'warn');
                    return;
                }

                // Deduplicate by consumer number before handing off.
                const seen = new Set();
                const deduped = [];
                for (const rec of records) {
                    const key = String(rec?.consumerNumber || '').trim();
                    if (!key || seen.has(key)) continue;
                    seen.add(key);
                    deduped.push({
                        operatorName: rec.operatorName || '',
                        consumerNumber: key,
                        consumerName: rec.consumerName || '',
                        areaDescription: rec.areaDescription || '',
                        bookDate: rec.bookDate || ''
                    });
                }

                btnDownloadDeliveryCsv.disabled = true;
                try {
                    const res = await ipcRenderer.invoke('export-delivery-report-csv', deduped);
                    if (res && res.success) {
                        appendLog(`✅ Delivery report exported (${res.rowCount} rows).`, 'success');
                    } else if (res && res.cancelled) {
                        appendLog('Export cancelled.', 'system');
                    } else {
                        appendLog(`❌ Export failed: ${res?.error || 'Unknown error'}`, 'error');
                    }
                } catch (err) {
                    appendLog(`❌ Export failed: ${err.message}`, 'error');
                } finally {
                    btnDownloadDeliveryCsv.disabled = false;
                }
            });
        }

        // ---- Main-process events -----------------------------
        if (ipcRenderer) {
            ipcRenderer.on('delivery-report-started', () => {
                setDeliveryButtonState(true);
                setDeliveryState('running', 'Starting up...');
            });

            ipcRenderer.on('delivery-report-log', (_event, msg) => {
                if (msg) appendLog(msg, 'default');
            });

            // Delivery progress writes ONLY to the delivery state card. It used
            // to call updateStatus(), which drives the cash-memo card - so a
            // report run visibly overwrote the cancellation's state text.
            ipcRenderer.on('delivery-report-status', (_event, status) => {
                if (status) setDeliverySummary(status);
            });

            ipcRenderer.on('delivery-report-progress', (_event, data) => {
                if (!data) return;
                if (data.phase === 'scraping') {
                    setDeliverySummary(`Scraping page ${data.page} — ${data.recordsCollected} records collected`);
                } else if (data.phase === 'summary') {
                    setDeliverySummary(`Total delivered: ${data.totalDelivered} · via Operator App: ${data.deliveredViaApp}`);
                }
            });

            ipcRenderer.on('delivery-report-complete', (_event, report) => {
                setDeliveryButtonState(false);
                if (!report) return;

                // Full run or early stop, the incoming records are merged into
                // the saved dataset (upsert by consumer number) and persisted,
                // so stopping can only ever add records - never wipe them.
                const merged = mergeAndPersistDeliveryReport(report);
                latestDeliveryReport = merged;
                renderDeliveryReport(merged);
                openDeliveryReportModal();

                const scrapedNow = report.rawRecords?.length || 0;
                if (report.stopped) {
                    appendLog(
                        `🛑 Delivery report stopped early — kept ${merged.rawRecords.length} records `
                        + `(${scrapedNow} scraped this run, ${merged.addedThisRun} new).`,
                        'warn'
                    );
                    setDeliveryState('stopped', `${merged.rawRecords.length} records kept · ${merged.addedThisRun} new this run`);
                } else {
                    appendLog(`✅ Delivery report ready: ${merged.rawRecords.length} records across ${merged.operatorSummary.length} operator(s).`, 'success');
                    setDeliveryState('success', `${merged.rawRecords.length} records · ${merged.operatorSummary.length} operator(s)`);
                }
            });

            ipcRenderer.on('delivery-report-error', (_event, msg) => {
                setDeliveryButtonState(false);
                appendLog(`❌ Delivery report failed: ${msg}`, 'error');
                setDeliveryState('error', String(msg || 'Unknown error'));
            });
        }

        // ---- Startup hydration (survives a refresh) ----------
        // Restores the last saved report into memory and surfaces the
        // "View last report" link so the modal can be reopened with the
        // previously fetched numbers and table intact.
        (function hydrateSavedDeliveryReport() {
            const saved = loadSavedDeliveryReport();
            if (!saved || !Array.isArray(saved.rawRecords) || saved.rawRecords.length === 0) return;

            latestDeliveryReport = saved;
            if (btnViewLastDeliveryReport) {
                btnViewLastDeliveryReport.classList.remove('hidden');
            }
            // Surface the cached figures in the state card so a refresh shows
            // what is already on hand instead of a blank "no active run".
            setDeliverySummary(
                `Last report: ${saved.rawRecords.length} records · ${saved.operatorSummary.length} operator(s)`
            );
        })();
    }


    const btnStartExplicit = document.getElementById('btnStart');
    if (btnStartExplicit && btnStartExplicit !== btnStartCancellation) {
        btnStartExplicit.addEventListener('click', (e) => {
            e.preventDefault();
            btnStartCancellation.click();
        });
    }

    if (btnConfirmStart) {
        btnConfirmStart.addEventListener('click', (e) => {
            e.preventDefault();
            executeStartCancellation();
        });
    }

    if (btnCancelStart) {
        btnCancelStart.addEventListener('click', (e) => {
            e.preventDefault();
            closeStartConfirmModal();
        });
    }

    if (startConfirmModal) {
        startConfirmModal.addEventListener('click', (e) => {
            if (e.target === startConfirmModal) {
                closeStartConfirmModal();
            }
        });
    }

    // ---------------------------------------------------------
    // STOP CANCELLATION CONFIRMATION MODAL LOGIC
    // ---------------------------------------------------------
    function openStopConfirmModal() {
        if (stopConfirmModal) {
            stopConfirmModal.classList.remove('hidden');
            if (btnKeepRunning) {
                btnKeepRunning.focus();
            }
        }
    }

    function closeStopConfirmModal() {
        if (stopConfirmModal) {
            stopConfirmModal.classList.add('hidden');
        }
    }

    async function executeStopCancellation() {
        closeStopConfirmModal();
        setButtonState('idle');
        updateStatus('Stopped by User (Idle)');
        appendLog('🛑 Auto-cancellation stopped by user.', 'warn');

        try {
            if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
                await ipcRenderer.invoke('stop-automation');
            } else if (window.electronAPI && typeof window.electronAPI.stopAutomation === 'function') {
                await window.electronAPI.stopAutomation();
            } else if (window.electronAPI && typeof window.electronAPI.stopCancellation === 'function') {
                await window.electronAPI.stopCancellation();
            }
        } catch (err) {
            console.error('Stop automation error:', err);
        }
    }

    // Secondary / Danger action: Confirm Stop
    if (btnConfirmStop) {
        btnConfirmStop.addEventListener('click', (e) => {
            e.preventDefault();
            executeStopCancellation();
        });
    }

    // Primary / Safe action: Keep Running (focused by default)
    if (btnKeepRunning) {
        btnKeepRunning.addEventListener('click', (e) => {
            e.preventDefault();
            closeStopConfirmModal();
        });
    }

    // Explicit #btnStop element support if present in DOM
    if (btnStopExplicit) {
        btnStopExplicit.addEventListener('click', (e) => {
            e.preventDefault();
            if (isProcessRunning && !isStopping) {
                openStopConfirmModal();
            }
        });
    }

    // Dismiss on click outside modal dialog
    if (stopConfirmModal) {
        stopConfirmModal.addEventListener('click', (e) => {
            if (e.target === stopConfirmModal) {
                closeStopConfirmModal();
            }
        });
    }

    // Keyboard shortcut support: Pressing Escape while modal is visible triggers dismissal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (stopConfirmModal && !stopConfirmModal.classList.contains('hidden')) {
                e.preventDefault();
                closeStopConfirmModal();
            }
            if (startConfirmModal && !startConfirmModal.classList.contains('hidden')) {
                e.preventDefault();
                closeStartConfirmModal();
            }
        }
    });

    // ---------------------------------------------------------
    // IPC EVENT LISTENERS
    // ---------------------------------------------------------
    if (window.electronAPI) {
        if (window.electronAPI.onAutomationStarted) {
            window.electronAPI.onAutomationStarted(() => {
                closeStartConfirmModal();
                // Confirmation approved! Toggle button to red "Stop Auto-Cancellation" immediately
                if (reportActionContainer) {
                    reportActionContainer.classList.add('hidden');
                }
                latestReportPath = null;
                setButtonState('running');
            });
        }

        if (window.electronAPI.onAutomationStopped) {
            window.electronAPI.onAutomationStopped((stats) => {
                closeStopConfirmModal();
                setButtonState('idle');
                updateStatus('Stopped by User (Idle)');
                if (stats && stats.total) {
                    statusDetailText.textContent = `Process stopped by user (Idle). Memos cancelled: ${stats.success || 0} / ${stats.total || 0}`;
                } else {
                    statusDetailText.textContent = 'Process stopped by user (Idle).';
                }
                if (stats && stats.reportPath) {
                    showReportAction(stats.reportPath, true);
                    appendLog(`📄 Execution report saved: ${stats.reportPath}`, 'system');
                }
            });
        }

        window.electronAPI.onStatusUpdate((status) => {
            updateStatus(status);
            const s = (status || '').toLowerCase();
            if (s.includes('stopped')) {
                closeStopConfirmModal();
                setButtonState('idle');
            } else if (s.includes('logging') || s.includes('scraping') || s.includes('cancelling') || s.includes('verifying')) {
                if (!isProcessRunning && !isStopping) {
                    setButtonState('running');
                }
            }
        });

        window.electronAPI.onProgressUpdate((progressData) => {
            updateProgress(progressData);
        });

        window.electronAPI.onLogMessage((msg) => {
            let type = 'default';
            if (msg.includes('❌') || msg.includes('[ERROR]') || msg.includes('Error') || msg.includes('Failed')) type = 'error';
            else if (msg.includes('✅') || msg.includes('[OK]') || msg.includes('Success')) type = 'success';
            else if (msg.includes('⚠️') || msg.includes('[WARN]') || msg.includes('warning') || msg.includes('PASS 2')) type = 'warn';
            else if (msg.includes('🚀') || msg.includes('[LAUNCH]') || msg.includes('🌐') || msg.includes('🔐') || msg.includes('[CHECK]')) type = 'system';

            appendLog(msg, type);
        });

        window.electronAPI.onProcessComplete(async (stats) => {
            closeStopConfirmModal();
            setButtonState('idle');
            if (stats && stats.stopped) {
                updateStatus('Stopped by User (Idle)');
                statusDetailText.textContent = `Process stopped by user (Idle). Memos cancelled: ${stats.success || 0} / ${stats.total || 0}`;
            } else {
                updateStatus('Completed');
                appendLog(`🎉 Process finished: Total: ${stats?.total || 0} | Success: ${stats?.success || 0} | Failed: ${stats?.failed || 0} | Skipped: ${stats?.skipped || 0}`, 'success');
            }

            // 1. Precise execution metrics extraction
            const metrics = stats?.metrics || {
                date: new Date().toLocaleDateString('en-GB'),
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                scrapedCount: Number(stats?.total) || 0,
                cancelledCount: Number(stats?.success) || 0,
                timeTaken: '0m 00s',
                rawDurationMs: 0,
                timestamp: Date.now()
            };

            if (metrics.timeTaken && metrics.timeTaken !== '0m 00s') {
                appendLog(`⏱️ Time Taken: ${metrics.timeTaken}`, 'info');
            }

            // 2. Persist to local 90-day history in electron-store
            await addCancellationHistoryRecord(metrics);

            // 3. Dispatch background telemetry to Cloudflare
            const licenseKey = (inputLicenseKey?.value || await getPersistentSetting('licenseKey') || '').trim();
            const agencyName = (currentAgencyName || (agencyDisplay ? agencyDisplay.textContent.replace(/^[🟢🔴⚪\s]+/, '') : '') || await getPersistentSetting('agencyName') || '').trim();

            sendTelemetryPayload({
                licenseKey,
                agencyName,
                scrapedCount: metrics.scrapedCount,
                cancelledCount: metrics.cancelledCount,
                timeTaken: metrics.timeTaken,
                date: metrics.date,
                time: metrics.time
            });

            const executionDurationString = metrics.timeTaken || '0m 00s';
            if (ipcRenderer && !stats?.stopped) {
                ipcRenderer.send('show-completion-toast', {
                    totalCancelled: stats.success,
                    timeTaken: executionDurationString
                });
            }

            if (stats && stats.reportPath) {
                showReportAction(stats.reportPath, Boolean(stats.stopped));
                appendLog(`📄 Execution report saved: ${stats.reportPath}`, 'success');
            }
        });

        if (window.electronAPI.onAutomationCompleted) {
            window.electronAPI.onAutomationCompleted((data) => {
                const reportPath = data?.reportPath || (typeof data === 'string' ? data : null);
                if (reportPath && reportActionContainer && reportActionContainer.classList.contains('hidden')) {
                    showReportAction(reportPath, Boolean(data?.stopped));
                }
            });
        }

        window.electronAPI.onProcessError((errMsg) => {
            setButtonState('idle');
            updateStatus('Error');
            appendLog(`❌ Automation process aborted: ${errMsg}`, 'error');
            if (statusDetailText) {
                statusDetailText.textContent = errMsg;
            }
            if (errMsg && (errMsg.toLowerCase().includes('expired') || errMsg.includes('403'))) {
                renderRedErrorAlertBanner(errMsg);
            }
        });

        if (window.electronAPI.onAgencyUpdate) {
            window.electronAPI.onAgencyUpdate((distributor) => {
                updateAgencyDisplay(distributor);
            });
        }

        if (window.electronAPI.onManifestLoaded) {
            window.electronAPI.onManifestLoaded((manifestData) => {
                processManifestResponse(manifestData);
            });
        }

        // Support & Notification Updates from Background Polling
        if (window.electronAPI.onNotificationUpdate) {
            window.electronAPI.onNotificationUpdate((data) => {
                const unread = Number(data?.totalUnread) || 0;
                if (notifBadgeCount) {
                    if (unread > 0) {
                        notifBadgeCount.textContent = unread > 9 ? '9+' : unread;
                        notifBadgeCount.classList.remove('hidden');
                    } else {
                        notifBadgeCount.classList.add('hidden');
                    }
                }
                if (tabNotifBadge) {
                    const annCount = Number(data?.announcementsCount) || 0;
                    if (annCount > 0) {
                        tabNotifBadge.textContent = annCount;
                        tabNotifBadge.classList.remove('hidden');
                    } else {
                        tabNotifBadge.classList.add('hidden');
                    }
                }
            });
        }

        if (window.electronAPI.onOpenSupportModal) {
            window.electronAPI.onOpenSupportModal(() => {
                openSupportModal('chat');
            });
        }
    }

    // ---------------------------------------------------------
    // LIQUID GLASS SUPPORT MODAL & NOTIFICATION BELL
    // ---------------------------------------------------------
    const btnNotificationBell = document.getElementById('btnNotificationBell');
    const notifBadgeCount = document.getElementById('notifBadgeCount');
    const btnOpenSupport = document.getElementById('btnOpenSupport');
    const supportModal = document.getElementById('supportModal');
    const btnCloseSupportModal = document.getElementById('btnCloseSupportModal');
    const btnTabSupportChat = document.getElementById('btnTabSupportChat');
    const btnTabSupportAnnouncements = document.getElementById('btnTabSupportAnnouncements');
    const tabNotifBadge = document.getElementById('tabNotifBadge');
    const supportViewChat = document.getElementById('supportViewChat');
    const supportViewAnnouncements = document.getElementById('supportViewAnnouncements');
    const supportMessagesContainer = document.getElementById('supportMessagesContainer');
    const supportAnnouncementsContainer = document.getElementById('supportAnnouncementsContainer');
    const supportInputMessage = document.getElementById('supportInputMessage');
    const btnSendSupportMessage = document.getElementById('btnSendSupportMessage');

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function openSupportModal(tab = 'chat', prefillMessage = '') {
        if (!supportModal) return;
        supportModal.classList.remove('hidden');
        switchSupportTab(tab, prefillMessage);
        if (notifBadgeCount) {
            notifBadgeCount.classList.add('hidden');
        }
    }

    function closeSupportModal() {
        if (!supportModal) return;
        supportModal.classList.add('hidden');
    }

    function switchSupportTab(tabName, prefillMessage = '') {
        if (tabName === 'announcements') {
            if (btnTabSupportAnnouncements) btnTabSupportAnnouncements.classList.add('active');
            if (btnTabSupportChat) btnTabSupportChat.classList.remove('active');
            if (supportViewAnnouncements) supportViewAnnouncements.classList.remove('hidden');
            if (supportViewChat) supportViewChat.classList.add('hidden');
            loadAnnouncements();
        } else {
            if (btnTabSupportChat) btnTabSupportChat.classList.add('active');
            if (btnTabSupportAnnouncements) btnTabSupportAnnouncements.classList.remove('active');
            if (supportViewChat) supportViewChat.classList.remove('hidden');
            if (supportViewAnnouncements) supportViewAnnouncements.classList.add('hidden');
            loadSupportChat();
            if (supportInputMessage) {
                if (prefillMessage) {
                    supportInputMessage.value = prefillMessage;
                }
                supportInputMessage.focus();
            }
        }
    }

    async function sendTelemetryPayload(telemetryData = {}) {
        try {
            const licenseKey = (telemetryData.licenseKey || inputLicenseKey?.value || await getPersistentSetting('licenseKey') || '').trim();
            if (!licenseKey) return null;

            const agencyName = (telemetryData.agencyName || currentAgencyName || (agencyDisplay ? agencyDisplay.textContent.replace(/^[🟢🔴⚪\s]+/, '') : '') || await getPersistentSetting('agencyName') || '').trim();

            const payload = {
                licenseKey,
                agencyName,
                scrapedCount: Number(telemetryData.scrapedCount) || 0,
                cancelledCount: Number(telemetryData.cancelledCount) || 0,
                timeTaken: String(telemetryData.timeTaken || '0m 00s'),
                date: String(telemetryData.date || new Date().toLocaleDateString('en-GB')),
                time: String(telemetryData.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
                count: Number(telemetryData.cancelledCount) || 0
            };

            const res = await fetch(`${WORKER_BASE_URL}/api/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch((err) => {
                console.warn('[Telemetry] Dispatch network error:', err);
                return null;
            });
            return res ? await res.json().catch(() => null) : null;
        } catch (err) {
            console.warn('[Telemetry] Dispatch error:', err);
            return null;
        }
    }
    window.sendTelemetryPayload = sendTelemetryPayload;

    async function sendTelemetry(count, agencyName = '') {
        return await sendTelemetryPayload({
            cancelledCount: Number(count) || 0,
            agencyName: agencyName
        });
    }
    window.sendTelemetry = sendTelemetry;

    async function loadSupportChat() {
        if (!supportMessagesContainer) return;
        try {
            let data = null;
            let fetchFailed = false;

            if (window.electronAPI && window.electronAPI.getSupportChat) {
                try {
                    data = await window.electronAPI.getSupportChat();
                } catch (e) {
                    // Fall back to direct fetch
                }
            }

            // Fallback to direct HTTP fetch if electronAPI returned null, undefined, or error
            if (!data || (data.success === false && !Array.isArray(data))) {
                try {
                    const licenseKey = (inputLicenseKey?.value || '').trim();
                    const url = licenseKey 
                        ? `${WORKER_BASE_URL}/api/chat?licenseKey=${encodeURIComponent(licenseKey)}`
                        : `${WORKER_BASE_URL}/api/chat`;
                    const res = await fetch(url);
                    if (res && res.ok) {
                        data = await res.json().catch(() => []);
                    } else {
                        fetchFailed = true;
                    }
                } catch (netErr) {
                    fetchFailed = true;
                }
            }

            // Extract messages array whether server returns an array, { messages: [] }, or { data: [] }
            let messages = null;
            if (Array.isArray(data)) {
                messages = data;
            } else if (data && Array.isArray(data.messages)) {
                messages = data.messages;
            } else if (data && Array.isArray(data.data)) {
                messages = data.data;
            } else if (data && typeof data === 'object' && data.success && !data.messages) {
                messages = [];
            }

            // If fetch actually failed or data could not be retrieved
            if (messages === null) {
                if (fetchFailed || !data) {
                    supportMessagesContainer.innerHTML = `
                        <div class="support-empty-state">
                            <span class="support-empty-icon">⚠️</span>
                            <p>Unable to connect to support service.</p>
                        </div>`;
                    return;
                }
                messages = [];
            }

            if (messages.length === 0) {
                supportMessagesContainer.innerHTML = `
                    <div class="support-empty-state">
                        <span class="support-empty-icon">💬</span>
                        <p>No messages yet. Send a message to your service provider to start a conversation.</p>
                    </div>`;
                return;
            }

            supportMessagesContainer.innerHTML = messages.map(m => {
                const isClient = m.sender === 'client';
                const senderLabel = isClient ? 'Agency Operator (You)' : 'Service Provider Admin';
                const timeStr = m.timestamp 
                    ? (m.timestamp.includes(':') && m.timestamp.length <= 10 
                        ? m.timestamp 
                        : new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) 
                    : '';
                return `
                    <div class="support-msg-card ${isClient ? 'client' : 'admin'}">
                        <div class="support-msg-meta">
                            <span class="support-msg-sender">${escapeHtml(senderLabel)}</span>
                            <span class="support-msg-time">${escapeHtml(timeStr)}</span>
                        </div>
                        <div>${escapeHtml(m.message || '')}</div>
                    </div>`;
            }).join('');

            supportMessagesContainer.scrollTop = supportMessagesContainer.scrollHeight;
        } catch (err) {
            supportMessagesContainer.innerHTML = `
                <div class="support-empty-state">
                    <span class="support-empty-icon">⚠️</span>
                    <p>Unable to connect to support service.</p>
                </div>`;
        }
    }

    async function sendSupportMessage() {
        if (!supportInputMessage) return;
        const msg = supportInputMessage.value.trim();
        if (!msg) return;

        if (btnSendSupportMessage) btnSendSupportMessage.disabled = true;

        try {
            // Optimistic UI Append
            const optimisticDiv = document.createElement('div');
            optimisticDiv.className = 'support-msg-card client';
            optimisticDiv.innerHTML = `
                <div class="support-msg-meta">
                    <span class="support-msg-sender">Agency Operator (You)</span>
                    <span class="support-msg-time">Just now</span>
                </div>
                <div>${escapeHtml(msg)}</div>`;

            // Remove empty state if present
            const emptyState = supportMessagesContainer.querySelector('.support-empty-state');
            if (emptyState) emptyState.remove();

            supportMessagesContainer.appendChild(optimisticDiv);
            supportMessagesContainer.scrollTop = supportMessagesContainer.scrollHeight;
            supportInputMessage.value = '';

            let res = null;
            if (window.electronAPI && window.electronAPI.sendSupportMessage) {
                res = await window.electronAPI.sendSupportMessage(msg);
            }
            if (!res || !res.success) {
                const licenseKey = (inputLicenseKey?.value || '').trim();
                const response = await fetch(`${WORKER_BASE_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        licenseKey,
                        message: msg,
                        sender: 'client'
                    })
                }).catch(() => null);
                if (response) res = await response.json().catch(() => null);
            }

            if (!res || !res.success) {
                appendLog(`⚠️ Message delivery notice: ${res?.message || 'Could not send message'}`, 'warn');
            }
        } catch (err) {
            appendLog(`❌ Message error: ${err.message}`, 'error');
        } finally {
            if (btnSendSupportMessage) btnSendSupportMessage.disabled = false;
        }
    }

    async function loadAnnouncements() {
        if (!supportAnnouncementsContainer) return;
        try {
            let data = null;
            if (window.electronAPI && window.electronAPI.getNotifications) {
                data = await window.electronAPI.getNotifications();
            }
            if (!data || !data.success) {
                const licenseKey = (inputLicenseKey?.value || '').trim();
                const url = licenseKey 
                    ? `${WORKER_BASE_URL}/api/notifications?licenseKey=${encodeURIComponent(licenseKey)}`
                    : `${WORKER_BASE_URL}/api/notifications`;
                const res = await fetch(url).catch(() => null);
                if (res) data = await res.json().catch(() => null);
            }

            if (!data || !data.success) {
                supportAnnouncementsContainer.innerHTML = `
                    <div class="support-empty-state">
                        <span class="support-empty-icon">📢</span>
                        <p>No announcements currently posted by service provider.</p>
                    </div>`;
                return;
            }

            const announcements = data.announcements || [];
            if (announcements.length === 0) {
                supportAnnouncementsContainer.innerHTML = `
                    <div class="support-empty-state">
                        <span class="support-empty-icon">📢</span>
                        <p>No broadcasts or notices currently active.</p>
                    </div>`;
                return;
            }

            supportAnnouncementsContainer.innerHTML = announcements.map(a => {
                const dateStr = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
                return `
                    <div class="announcement-card ${a.priority === 'urgent' ? 'urgent' : ''}">
                        <div class="announcement-header">
                            <span class="announcement-title">${escapeHtml(a.title)} ${a.priority === 'urgent' ? '🚨' : ''}</span>
                            <span class="announcement-date">${escapeHtml(dateStr)}</span>
                        </div>
                        <div class="announcement-body">${escapeHtml(a.message)}</div>
                    </div>`;
            }).join('');
        } catch (err) {
            supportAnnouncementsContainer.innerHTML = `
                <div class="support-empty-state">
                    <span class="support-empty-icon">⚠️</span>
                    <p>Failed to load broadcasts.</p>
                </div>`;
        }
    }

    // Modal Triggers
    if (btnNotificationBell) {
        btnNotificationBell.addEventListener('click', () => {
            openSupportModal('announcements');
        });
    }

    if (btnOpenSupport) {
        btnOpenSupport.addEventListener('click', () => {
            openSupportModal('chat');
        });
    }

    if (btnRenewLicense) {
        btnRenewLicense.addEventListener('click', openRenewalModal);
    }

    if (btnBannerOpenSettings) {
        btnBannerOpenSettings.addEventListener('click', () => switchTab('settings'));
    }

    if (btnCloseRenewalModal) {
        btnCloseRenewalModal.addEventListener('click', closeRenewalModal);
    }

    const activeRenewalModal = document.getElementById('licenseRenewalModal') || renewalModal;
    if (activeRenewalModal) {
        activeRenewalModal.addEventListener('click', (e) => {
            if (e.target === activeRenewalModal) closeRenewalModal();
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('licenseRenewalModal') || document.getElementById('renewalModal') || renewalModal;
            if (modal && !modal.classList.contains('hidden')) {
                closeRenewalModal();
            }
        }
    });

    // Plan Cards Toggle
    document.querySelectorAll('.renewal-plans-grid .plan-card').forEach(card => {
        card.addEventListener('click', () => {
            const plan = card.dataset.plan || '1-month';
            updateRenewalPlanUI(plan);
        });
    });

    // Copy UPI VPA Button
    const btnCopyVpaEl = document.getElementById('btnCopyVpa');
    if (btnCopyVpaEl) {
        btnCopyVpaEl.addEventListener('click', copyUpiVpaAddress);
    }

    // Proactively fetch Base64 QR code via Node main process.
    // The retry is capped at a single attempt: an unbounded onerror -> refetch handler turns a
    // failing image into an infinite R2 request loop (the source of rapid ECONNRESET spam).
    const renewalQrImgEl = document.getElementById('renewalQrImg');
    if (renewalQrImgEl) {
        let qrRetried = false;
        renewalQrImgEl.onerror = () => {
            if (qrRetried) return;
            qrRetried = true;
            loadCloudflareQrCode();
        };
    }
    loadCloudflareQrCode();

    if (btnCloseSupportModal) {
        btnCloseSupportModal.addEventListener('click', closeSupportModal);
    }

    if (supportModal) {
        supportModal.addEventListener('click', (e) => {
            if (e.target === supportModal) closeSupportModal();
        });
    }

    if (btnTabSupportChat) {
        btnTabSupportChat.addEventListener('click', () => switchSupportTab('chat'));
    }

    if (btnTabSupportAnnouncements) {
        btnTabSupportAnnouncements.addEventListener('click', () => switchSupportTab('announcements'));
    }

    if (btnSendSupportMessage) {
        btnSendSupportMessage.addEventListener('click', sendSupportMessage);
    }

    if (supportInputMessage) {
        supportInputMessage.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendSupportMessage();
            }
        });
    }

    // Preset quick chips
    document.querySelectorAll('.support-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.getAttribute('data-chip');
            if (text && supportInputMessage) {
                supportInputMessage.value = text;
                supportInputMessage.focus();
            }
        });
    });

    // -------------------------------------------------------------
    // DYNAMIC APPLICATION VERSION DISPLAY
    // -------------------------------------------------------------
    async function initAppVersion() {
        let version = window.electronAPI && window.electronAPI.appVersion;
        if (!version && window.electronAPI && window.electronAPI.getAppVersion) {
            try {
                version = await window.electronAPI.getAppVersion();
            } catch (e) {
                console.warn('[Version] Could not fetch app version:', e);
            }
        }
        if (version) {
            const raw = version.toString().trim();
            const formatted = raw.startsWith('v') ? raw : `v${raw}`;
            const headerBadge = document.getElementById('appVersionBadge');
            if (headerBadge) headerBadge.textContent = formatted;
            const settingsBadge = document.getElementById('settingsVersionBadge');
            if (settingsBadge) settingsBadge.textContent = formatted;
        }
    }

    // Initial Load
    await initAppVersion();
    await loadStoredSettings();
    await checkInitialUpdateStatus();
});

// -------------------------------------------------------------
// MOCK TESTING FUNCTION FOR AUTO-UPDATER UI
// -------------------------------------------------------------
window.testUpdateUI = function() {
    const badge = document.getElementById('update-badge');
    const percentText = document.getElementById('update-percent-text');
    const progressBar = document.getElementById('update-progress-bar');
    const pill = document.getElementById('btn-update-pill');
    const modal = document.getElementById('updateModalOverlay') || document.getElementById('update-ready-modal') || document.getElementById('updateModal');

    if (!badge || !percentText || !progressBar || !modal) {
        console.error('Update UI elements not found in DOM!');
        return;
    }

    // Reset states
    modal.classList.add('hidden');
    if (pill) pill.classList.add('hidden');
    badge.classList.remove('hidden');

    let currentPercent = 0;
    console.log('🔄 Simulating download progress...');

    const interval = setInterval(() => {
        currentPercent += 10;
        percentText.innerText = `Updating ${currentPercent}%`;
        progressBar.style.width = `${currentPercent}%`;

        if (currentPercent >= 100) {
            clearInterval(interval);
            isUpdateDownloaded = true;
            console.log('✨ Download simulation complete! Showing Open Again modal.');
            const targetBadge = document.getElementById('modalTargetVersion');
            const targetHigh = document.getElementById('modalTargetVersionHighlight');
            const currHigh = document.getElementById('modalCurrentVersion');
            if (targetBadge) targetBadge.textContent = 'v1.2.0';
            if (targetHigh) targetHigh.textContent = 'v1.2.0';
            if (currHigh) currHigh.textContent = 'v1.1.2';
            setTimeout(() => {
                badge.classList.add('hidden');
                if (pill) pill.classList.remove('hidden');
                modal.classList.remove('hidden');
            }, 500);
        }
    }, 300);
};

