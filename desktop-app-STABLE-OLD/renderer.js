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
    const inputBpclUser = document.getElementById('bpcl-user') || document.getElementById('inputUserId');
    const inputBpclPassword = document.getElementById('bpcl-password') || document.getElementById('inputPassword');
    const inputLicenseKey = document.getElementById('inputLicenseKey');
    const selectBrowserChannel = document.getElementById('selectBrowserChannel');
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    const btnClearSettings = document.getElementById('btnClearSettings');
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

    // Renewal Hub Modal Elements
    const renewalModal = document.getElementById('renewalModal');
    const btnCloseRenewalModal = document.getElementById('btnCloseRenewalModal');
    const renewalModalStatusText = document.getElementById('renewalModalStatusText');
    const renewalBanner = document.getElementById('renewalBanner') || renewalModalStatusText;
    const warningBox = document.getElementById('renewalModalStatusText') || renewalModalStatusText || renewalBanner;
    const renewalPlanName = document.getElementById('renewalPlanName');
    const renewalAmount = document.getElementById('renewalAmount');
    const renewalUpiId = document.getElementById('renewalUpiId');
    const btnCopyUpi = document.getElementById('btnCopyUpi');
    const copyUpiText = document.getElementById('copyUpiText');
    const btnRenewalWhatsApp = document.getElementById('btnRenewalWhatsApp');
    const btnRenewalCall = document.getElementById('btnRenewalCall');
    const renewalCallText = document.getElementById('renewalCallText');
    const btnRenewalInAppChat = document.getElementById('btnRenewalInAppChat');

    let currentRenewalConfig = {
        planName: "Quarterly Pro (3 Months)",
        amount: "₹1,999",
        upiId: "7004015687@upi",
        phone: "+917004015687",
        whatsapp: "7004015687"
    };

    // Update Notification UI Elements
    const updateBtn = document.getElementById('update-btn');
    const updateModal = document.getElementById('updateModal');
    const modalVersionInfo = document.getElementById('modalVersionInfo');
    const btnUpdateLater = document.getElementById('btnUpdateLater');
    const btnUpdateNow = document.getElementById('btnUpdateNow');

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
                appendLog(`📄 Launching CSV Execution Report in Excel: ${latestReportPath}`, 'system');
                const res = await window.electronAPI.openReport(latestReportPath);
                if (res && !res.success && res.message) {
                    appendLog(`⚠️ Could not open report: ${res.message}`, 'warn');
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
            currentStateText.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
        }
        if (statusDetailText) {
            statusDetailText.textContent = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
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
        const alertMsg = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
        appendLog(`❌ ${alertMsg}`, 'error');
    }

    function handleInvalidCredentialsError(customMessage = '') {
        const errorMsg = 'गलत BPCL User ID या License Key (Invalid Credentials)';
        isSubscriptionExpired = false;
        isLicenseValid = false;

        // Top Header Banner displays standard error banner: "गलत BPCL User ID या License Key (Invalid Credentials)"
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

        // DO NOT log "लाइसेंस समाप्त हो गया है"
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
            }
        } else if (status === 'invalid') {
            currentAgencyName = '';
            isLicenseValid = false;
            badge.className = 'agency-tag badge-invalid';
            const serverMessage = customMessage || 'Invalid license or invalid user ID';
            badge.textContent = `🔴 ${serverMessage}`;

            // Clear saved agency name in local storage if invalid, preserving credentials
            setPersistentSetting('agencyName', '');
            if (window.electronAPI && window.electronAPI.saveSettings) {
                window.electronAPI.saveSettings({ agencyName: '' }).catch(() => {});
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
            // 'no-license' or 'unregistered'
            currentAgencyName = '';
            isLicenseValid = false;
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
            updateAgencyBadge('verified', distributor);
        } else {
            updateAgencyBadge('no-license');
        }
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

    function checkForUpdates(latestVersion, updateUrl) {
        if (!latestVersion) return;
        const hasUpdate = isNewerVersion(currentAppVersion, latestVersion);
        if (hasUpdate) {
            availableUpdateInfo = { latestVersion, updateUrl };
            if (updateBtn) {
                updateBtn.classList.remove('hidden');
            }
            if (modalVersionInfo) {
                modalVersionInfo.textContent = `Version ${latestVersion} available (Current: v${currentAppVersion})`;
            }
            console.log(`✨ Newer version detected: v${latestVersion}`);
        } else {
            if (updateBtn) {
                updateBtn.classList.add('hidden');
            }
        }
    }

    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            if (updateModal) {
                updateModal.classList.remove('hidden');
            }
        });
    }

    if (btnUpdateLater) {
        btnUpdateLater.addEventListener('click', () => {
            if (updateModal) {
                updateModal.classList.add('hidden');
            }
        });
    }

    if (btnUpdateNow) {
        btnUpdateNow.addEventListener('click', async () => {
            if (updateModal) {
                updateModal.classList.add('hidden');
            }
            appendLog('✨ Update acknowledged. Opening update source...', 'system');
            if (availableUpdateInfo && availableUpdateInfo.updateUrl && window.electronAPI && window.electronAPI.openExternal) {
                await window.electronAPI.openExternal(availableUpdateInfo.updateUrl);
            } else {
                appendLog('ℹ️ You are on the latest verified release track.', 'system');
            }
        });
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

                banner.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
                currentStateText.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
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
        if (!renewalModal) return;

        const rawDate = error?.response?.data?.expiresAt || window.currentLicenseExpiresAt || currentExpiresAt;
        if (rawDate) {
            window.currentLicenseExpiresAt = rawDate;
            currentExpiresAt = rawDate;
        }
        const formattedExp = rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

        const planName = currentRenewalConfig.planName || 'Quarterly Pro (3 Months)';
        const amount = currentRenewalConfig.amount || '₹1,999';
        const upiId = currentRenewalConfig.upiId || '7004015687@upi';
        const phone = currentRenewalConfig.phone || '+917004015687';

        if (renewalPlanName) renewalPlanName.textContent = planName;
        if (renewalAmount) renewalAmount.textContent = amount;
        if (renewalUpiId) renewalUpiId.textContent = upiId;

        const statusIcon = renewalModal.querySelector('.renewal-status-icon');
        if (statusIcon) statusIcon.style.display = 'none';

        const serverErrorMessage = error?.response?.data?.message 
            || (typeof error === 'string' ? error : '') 
            || window.currentServerErrorMessage 
            || (formattedExp ? `Subscription Expired on ${formattedExp}` : 'Subscription Expired');
        window.currentServerErrorMessage = serverErrorMessage;

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
        if (renewalCallText) {
            renewalCallText.textContent = `Call Support (${phone})`;
        }

        renewalModal.classList.remove('hidden');
    }

    function closeRenewalModal() {
        if (!renewalModal) return;
        renewalModal.classList.add('hidden');
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
    function showNotification(message, type = 'info') {
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

    async function verifyCredentials(licenseKey, bpclUserId) {
        const cleanKey = (licenseKey || '').trim();
        const cleanUserId = (bpclUserId || '').trim();

        if (!cleanKey || !cleanUserId) {
            return {
                status: 400,
                success: false,
                error: 'MISSING_FIELDS',
                message: 'कृपया BPCL User ID और License Key दोनों दर्ज करें।'
            };
        }

        let response;
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
                body: JSON.stringify({ licenseKey: cleanKey, bpclUserId: cleanUserId })
            });

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
                    message: serverMessage,
                    expiry: serverDate,
                    expiresAt: serverDate,
                    ...responseJson
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
                ...data
            };
        } catch (error) {
            // Error/catch block
            console.log('[LICENSE DEBUG] Response received:', error.response?.data || error);
            const serverMessage = error.response?.data?.message || (await error.response?.json?.().catch(() => null))?.message || error.message || "License verification failed.";
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
                            isExpired: Boolean(ipcRes.isExpired || ipcRes.error === 'SUBSCRIPTION_EXPIRED' || (typeof ipcRes.message === 'string' && ipcRes.message.toLowerCase().includes('expired')))
                        };
                    }
                } catch (ipcErr) {
                    const ipcMessage = ipcErr.response?.data?.message || (await ipcErr.response?.json?.().catch(() => null))?.message || ipcErr.message || serverMessage;
                    const ipcDate = ipcErr.response?.data?.expiresAt || (await ipcErr.response?.json?.().catch(() => null))?.expiresAt || ipcErr.response?.data?.expiry || serverDate;
                    const isIpcExpired = Boolean(ipcErr.response?.data?.isExpired || ipcErr.response?.data?.error === 'SUBSCRIPTION_EXPIRED' || (typeof ipcMessage === 'string' && ipcMessage.toLowerCase().includes('expired')));
                    return { success: false, status: 0, isExpired: isIpcExpired, message: ipcMessage, expiry: ipcDate, expiresAt: ipcDate };
                }
            }
            return { success: false, status: response?.status || 0, isExpired: isCatchExpired, message: serverMessage, expiry: serverDate, expiresAt: serverDate };
        }
    }

    // ---------------------------------------------------------
    // SETTINGS MANAGEMENT (nexusStore + localStorage Dual Persistence)
    // ---------------------------------------------------------
    async function loadStoredSettings() {
        try {
            if (window.electronAPI && window.electronAPI.getAppVersion) {
                currentAppVersion = await window.electronAPI.getAppVersion();
            }

            // Read bpclUserId, bpclPassword, licenseKey, browserChannel, and expiresAt from nexusStore (fallback to localStorage)
            let [savedUser, savedPass, savedKey, savedBrowser, savedExpiresAt] = await Promise.all([
                getPersistentSetting('bpclUserId'),
                getPersistentSetting('bpclPassword'),
                getPersistentSetting('licenseKey'),
                getPersistentSetting('browserChannel'),
                getPersistentSetting('expiresAt')
            ]);

            // Legacy backward-compatibility fallbacks
            if (!savedUser) {
                savedUser = await getPersistentSetting('userId');
            }
            if (!savedPass) {
                savedPass = await getPersistentSetting('password');
            }

            // Electron main store fallback if needed
            if (window.electronAPI && window.electronAPI.getSettings && (!savedUser || !savedKey)) {
                try {
                    const ipcSettings = await window.electronAPI.getSettings();
                    if (ipcSettings) {
                        if (!savedUser) savedUser = ipcSettings.bpclUserId || ipcSettings.userId || '';
                        if (!savedPass) savedPass = ipcSettings.bpclPassword || ipcSettings.password || '';
                        if (!savedKey) savedKey = ipcSettings.licenseKey || '';
                        if (!savedBrowser) savedBrowser = ipcSettings.browserChannel || '';
                        if (!savedExpiresAt && ipcSettings.expiresAt) savedExpiresAt = ipcSettings.expiresAt;
                    }
                } catch (_) {}
            }

            // Automatically populate the inputs with the saved values
            if (inputBpclUser) inputBpclUser.value = savedUser || '';
            if (inputBpclPassword) inputBpclPassword.value = savedPass || '';
            if (inputLicenseKey) inputLicenseKey.value = savedKey || '';
            if (selectBrowserChannel) selectBrowserChannel.value = savedBrowser === 'msedge' ? 'msedge' : 'chrome';
            if (savedExpiresAt) {
                window.currentLicenseExpiresAt = savedExpiresAt;
                currentExpiresAt = savedExpiresAt;
                updateLicenseExpiryDisplay(savedExpiresAt);
            }

            const bpclUserId = (savedUser || '').trim();
            const licenseKey = (savedKey || '').trim();

            // Startup auto-load: On DOMContentLoaded, load saved credentials from storage;
            // if both exist, run verification silently in the background to restore the green badge.
            if (!bpclUserId || !licenseKey) {
                updateAgencyBadge('no-license');
                updateLicenseExpiryDisplay(null);
            } else {
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
                }

                if (res && res.success && res.status !== 400 && res.status !== 403) {
                    const agencyName = res.agencyName || res.distributor || 'Agency Slot';
                    updateAgencyBadge('verified', agencyName);
                    processManifestResponse(res);
                } else {
                    const serverMessage = res?.message || "License verification failed.";
                    const isExpired = Boolean(
                        res?.isExpired || 
                        res?.manifest?.isExpired || 
                        res?.error === 'SUBSCRIPTION_EXPIRED' || 
                        (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
                    );
                    if (isExpired) {
                        updateAgencyBadge('invalid', '', serverMessage);
                        const error = { response: { data: res } };
                        const data = res;
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
                            currentStateText.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
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
                        handleInvalidCredentialsError(serverMessage);
                    }
                }
            }
        } catch (err) {
            updateAgencyBadge('no-license');
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
            showNotification('कृपया BPCL User ID और License Key दोनों दर्ज करें।', 'error');
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

        try {
            btnSaveSettings.disabled = true;
            appendLog('🔐 Verifying BPCL User ID and License Key...', 'system');

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

            // 4. If response is not success (status 400/403 or success: false):
            if (!res || res.status === 400 || res.status === 403 || !res.success || res.isExpired || res.error === 'SUBSCRIPTION_EXPIRED') {
                const serverMessage = res?.message || "License verification failed.";
                const isExpired = Boolean(
                    res?.isExpired || 
                    res?.manifest?.isExpired || 
                    res?.error === 'SUBSCRIPTION_EXPIRED' || 
                    (typeof serverMessage === 'string' && serverMessage.toLowerCase().includes('expired'))
                );
                if (isExpired) {
                    updateAgencyBadge('invalid', '', serverMessage);
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
                        currentStateText.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
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
                    handleInvalidCredentialsError(serverMessage);
                    showNotification('गलत BPCL User ID या License Key (Invalid Credentials)', 'error');
                }
                btnSaveSettings.disabled = false;
                // Do NOT clear or reset stored credentials when license validation returns 403 or fails.
                return;
            }

            // 5. If response is success (200):
            const agencyName = res.agencyName || res.distributor || 'Agency Slot';
            updateAgencyBadge('verified', agencyName);

            // Persist agencyName alongside already-saved credentials
            await setPersistentSetting('agencyName', agencyName);
            if (window.electronAPI && window.electronAPI.saveSettings) {
                await window.electronAPI.saveSettings({ agencyName }).catch(() => {});
            }

            const expDate = res.expiresAt || res.expiry || res.manifest?.expiresAt || serverDate;
            if (expDate) {
                window.currentLicenseExpiresAt = expDate;
                currentExpiresAt = expDate;
                await setPersistentSetting('expiresAt', expDate);
                updateLicenseExpiryDisplay(expDate);
            }

            // Process full manifest (theme, updates, expiration, anticaptcha)
            processManifestResponse(res);

            showNotification('Configuration Saved Successfully', 'success');
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
                updateAgencyBadge('invalid', '', serverMessage);
                showNotification(serverMessage, 'error');
                // Top Header Banner displays server message directly
                if (banner) {
                    banner.innerText = serverMessage;
                }
                if (expiryBannerMessage) {
                    expiryBannerMessage.textContent = serverMessage;
                }
                if (currentStateText) {
                    currentStateText.innerText = formattedExp ? `🔴 लाइसेंस समाप्त हो गया है (Expired on: ${formattedExp})` : `🔴 लाइसेंस समाप्त हो गया है (Subscription Expired)`;
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
                handleInvalidCredentialsError(serverMessage);
                showNotification('गलत BPCL User ID या License Key (Invalid Credentials)', 'error');
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
            statusDetailText.textContent = 'Ready to initiate E-Day End checks.';
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
            } else if (!inputLicenseKey.value.trim()) {
                btnStartCancellation.disabled = true;
                btnStartCancellation.classList.remove('btn-danger-pulsing');
                btnStartCancellation.classList.add('btn-primary', 'btn-subscription-expired');
                playIcon.classList.add('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                btnStartText.textContent = '🔒 License Required';
            } else {
                btnStartCancellation.disabled = false;
                btnStartCancellation.classList.remove('btn-danger-pulsing', 'btn-subscription-expired');
                btnStartCancellation.classList.add('btn-primary');
                playIcon.classList.remove('hidden');
                if (stopIcon) stopIcon.classList.add('hidden');
                spinnerIcon.classList.add('hidden');
                btnStartText.textContent = 'Start Auto-Cancellation';
            }
        }
    }

    // ---------------------------------------------------------
    // TERMINAL LOG CONSOLE
    // ---------------------------------------------------------
    function appendLog(message, type = 'default') {
        const line = document.createElement('div');
        line.className = `log-line ${type}`;

        const timestamp = new Date().toLocaleTimeString();
        line.textContent = `[${timestamp}] ${message}`;

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
        const settings = {
            bpclUserId: inputBpclUser.value.trim(),
            bpclPassword: inputBpclPassword.value.trim(),
            licenseKey: inputLicenseKey.value.trim(),
            browserChannel,
            userId: inputBpclUser.value.trim(),
            password: inputBpclPassword.value.trim()
        };

        await Promise.all([
            setPersistentSetting('bpclUserId', settings.bpclUserId),
            setPersistentSetting('bpclPassword', settings.bpclPassword),
            setPersistentSetting('licenseKey', settings.licenseKey),
            setPersistentSetting('browserChannel', browserChannel)
        ]);

        if (window.electronAPI && window.electronAPI.saveSettings) {
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

        if (isSubscriptionExpired) {
            const formattedDate = formatExpiryDate(currentExpiresAt);
            appendLog(`⚠️ Cannot start operations: Subscription expired${formattedDate ? ` on ${formattedDate}` : ''}. Automation is paused.`, 'warn');
            openRenewalModal();
            return;
        }

        const currentLicense = (inputLicenseKey?.value || '').trim();
        if (!currentLicense) {
            appendLog('❌ Cannot start operations: License key is required. Please check Settings.', 'error');
            return;
        }

        if (isPromptingConfirmation) return;

        openStartConfirmModal();
    });

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

        if (window.electronAPI.onUpdateDownloaded) {
            window.electronAPI.onUpdateDownloaded((info) => {
                if (otaUpdateBanner) {
                    otaUpdateBanner.classList.remove('hidden');
                }
                appendLog('✨ A new update has been installed in the background. It will apply when you restart the app.', 'system');
            });
        }

        if (window.electronAPI.onUpdateAvailable) {
            window.electronAPI.onUpdateAvailable((info) => {
                const verText = info?.version ? ` (v${info.version})` : '';
                appendLog(`📥 New update detected${verText}. Downloading in background...`, 'system');
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
                timeTaken: String(telemetryData.timeTaken || '0 मिनट 0 सेकंड'),
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

    if (renewalModal) {
        renewalModal.addEventListener('click', (e) => {
            if (e.target === renewalModal) closeRenewalModal();
        });
    }

    if (btnCopyUpi) {
        btnCopyUpi.addEventListener('click', async () => {
            const upi = currentRenewalConfig.upiId || '7004015687@upi';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(upi);
                } else {
                    const temp = document.createElement('textarea');
                    temp.value = upi;
                    document.body.appendChild(temp);
                    temp.select();
                    document.execCommand('copy');
                    temp.remove();
                }
                if (copyUpiText) copyUpiText.textContent = 'Copied!';
                btnCopyUpi.classList.add('copied');
                setTimeout(() => {
                    if (copyUpiText) copyUpiText.textContent = 'Copy UPI';
                    btnCopyUpi.classList.remove('copied');
                }, 2500);
            } catch (err) {
                console.error('Failed to copy UPI ID:', err);
            }
        });
    }

    if (btnRenewalWhatsApp) {
        btnRenewalWhatsApp.addEventListener('click', async () => {
            const rawWa = currentRenewalConfig.whatsapp || '7004015687';
            let cleanWa = String(rawWa).replace(/[^0-9]/g, '');
            if (cleanWa.length === 10) {
                cleanWa = '91' + cleanWa;
            }
            const agency = currentAgencyName || (agencyDisplay ? agencyDisplay.textContent.replace(/^[🟢🔴⚪\s]+/, '') : '').trim() || 'Bharat Gas Agency';
            const text = `Hi Admin, I have paid renewal fee for ${agency}. Please extend validity.`;
            const waUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(text)}`;

            if (window.electronAPI && window.electronAPI.openExternal) {
                await window.electronAPI.openExternal(waUrl);
            } else {
                window.open(waUrl, '_blank');
            }
        });
    }

    if (btnRenewalCall) {
        btnRenewalCall.addEventListener('click', async () => {
            const phone = (currentRenewalConfig.phone || '+917004015687').trim();
            const telUrl = `tel:${phone}`;
            if (window.electronAPI && window.electronAPI.openExternal) {
                await window.electronAPI.openExternal(telUrl);
            } else {
                window.open(telUrl, '_blank');
            }
        });
    }

    if (btnRenewalInAppChat) {
        btnRenewalInAppChat.addEventListener('click', () => {
            closeRenewalModal();
            const amount = currentRenewalConfig.amount || '₹1,999';
            const formattedDate = formatExpiryDate(currentExpiresAt);
            const chatMsg = formattedDate
                ? `Hello Admin, my plan expired on ${formattedDate}. I am renewing for ${amount}.`
                : `Hello Admin, my plan has expired. I am renewing for ${amount}.`;
            openSupportModal('chat', chatMsg);
        });
    }

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
});
