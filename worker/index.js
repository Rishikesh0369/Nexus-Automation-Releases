/**
 * Bharat Gas Nexus - Cloudflare Worker Backend
 * Telemetry Ingestion, Support Messaging, Broadcast Notifications & Admin Portal
 */

const DEFAULT_ADMIN_PIN = '2026';
const DEFAULT_ANTICAPTCHA_KEY = '4de60f13638febd83275de5f12c956d1';

// In-memory KV fallback for development/local testing
const memoryStore = new Map();

const kvHelper = (env) => {
  const kv = env?.NEXUS_DATA;
  return {
    async get(key, type = 'text') {
      if (kv && typeof kv.get === 'function') {
        const val = await kv.get(key, type);
        return val;
      }
      const val = memoryStore.get(key);
      if (val === undefined || val === null) return null;
      if (type === 'json') {
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }
      return String(val);
    },
    async put(key, value) {
      const strVal = typeof value === 'string' ? value : JSON.stringify(value);
      if (kv && typeof kv.put === 'function') {
        await kv.put(key, strVal);
      } else {
        memoryStore.set(key, strVal);
      }
    },
    async delete(key) {
      if (kv && typeof kv.delete === 'function') {
        await kv.delete(key);
      } else {
        memoryStore.delete(key);
      }
    }
  };
};

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-PIN',
      ...extraHeaders
    }
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Pre-configured distributor slots & flexible registry
var DISTRIBUTOR_REGISTRY = {
  "NEXUS-LIC-1000": { agencyName: "Bela Bharat Gas", bpclUserId: "cc176240", expiresAt: "2026-12-07" },
  "NEXUS-LIC-102": { agencyName: "Agency Slot 02 (Unassigned)", bpclUserId: "cc_user_102", expiresAt: "2026-12-07" },
  "NEXUS-LIC-103": { agencyName: "Agency Slot 03 (Unassigned)", bpclUserId: "cc_user_103", expiresAt: "2026-12-07" },
  "NEXUS-LIC-104": { agencyName: "Agency Slot 04 (Unassigned)", bpclUserId: "cc_user_104", expiresAt: "2026-12-07" },
  "NEXUS-LIC-105": { agencyName: "Agency Slot 05 (Unassigned)", bpclUserId: "cc_user_105", expiresAt: "2026-12-07" },
  "NEXUS-LIC-106": { agencyName: "Agency Slot 06 (Unassigned)", bpclUserId: "cc_user_106", expiresAt: "2026-12-07" },
  "NEXUS-LIC-107": { agencyName: "Agency Slot 07 (Unassigned)", bpclUserId: "cc_user_107", expiresAt: "2026-12-07" },
  "NEXUS-LIC-108": { agencyName: "Agency Slot 08 (Unassigned)", bpclUserId: "cc_user_108", expiresAt: "2026-12-07" },
  "NEXUS-LIC-109": { agencyName: "Agency Slot 09 (Unassigned)", bpclUserId: "cc_user_109", expiresAt: "2026-12-07" },
  "NEXUS-LIC-110": { agencyName: "Agency Slot 10 (Unassigned)", bpclUserId: "cc_user_110", expiresAt: "2026-12-07" }
};

var KNOWN_LICENSES = Object.fromEntries(
  Object.entries(DISTRIBUTOR_REGISTRY).map(([k, v]) => [k, v.agencyName])
);

function resolveAgencyName(licenseKey) {
  const cleanKey = (licenseKey || '').trim();
  return DISTRIBUTOR_REGISTRY[cleanKey]?.agencyName || null;
}

const DEFAULT_RENEWAL_CONFIG = {
  planName: "Quarterly Pro (3 Months)",
  amount: "₹1,999",
  upiId: "7004015687@upi",
  phone: "+917004015687",
  whatsapp: "7004015687"
};

async function resolveLicenseExpiration(licenseKey, kv) {
  const cleanKey = (licenseKey || '').trim();
  // 1. Check KV for custom license metadata (e.g. license:KEY or license:KEY:expiry)
  let licInfo = await kv.get(`license:${cleanKey}`, 'json');
  if (!licInfo) {
    licInfo = await kv.get(`license:${cleanKey}:expiry`, 'json');
  }

  let expiresAt = licInfo?.expiresAt;
  let isExpired = licInfo?.isExpired;
  const renewalConfig = licInfo?.renewalConfig || DEFAULT_RENEWAL_CONFIG;

  // Default rule for active slots
  if (!expiresAt) {
    if (DISTRIBUTOR_REGISTRY[cleanKey]?.expiresAt) {
      expiresAt = DISTRIBUTOR_REGISTRY[cleanKey].expiresAt;
    } else {
      expiresAt = '2026-12-07';
    }
  }

  if (isExpired === undefined || isExpired === null) {
    const todayStr = getTodayString();
    isExpired = expiresAt < todayStr;
  }

  return {
    isExpired: Boolean(isExpired),
    expiresAt: String(expiresAt),
    renewalConfig
  };
}

function verifyAdmin(request, env) {
  const adminPin = String(env?.ADMIN_PIN || DEFAULT_ADMIN_PIN).trim();
  const headerPin = String(request.headers.get('X-Admin-PIN') || '').trim();
  const authHeader = String(request.headers.get('Authorization') || '').trim();
  const bearerPin = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

  return headerPin === adminPin || bearerPin === adminPin;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // 1. CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-PIN'
        }
      });
    }

    const kv = kvHelper(env);

    // -------------------------------------------------------------
    // 2. ADMIN PORTAL (WEB UI)
    // -------------------------------------------------------------
    if (path === '/admin') {
      return htmlResponse(renderAdminPortalHtml(env));
    }

    // -------------------------------------------------------------
    // 3. ADMIN API ENDPOINTS (PROTECTED BY PIN)
    // -------------------------------------------------------------
    if (path === '/api/admin/verify-pin' && method === 'POST') {
      try {
        const body = await request.json();
        const pin = String(body.pin || '').trim();
        const expectedPin = String(env?.ADMIN_PIN || DEFAULT_ADMIN_PIN).trim();
        if (pin === expectedPin) {
          return jsonResponse({ success: true, message: 'Admin verified successfully' });
        }
        return jsonResponse({ success: false, message: 'Invalid Admin PIN' }, 401);
      } catch (e) {
        return jsonResponse({ success: false, message: 'Invalid request' }, 400);
      }
    }

    if (path.startsWith('/api/admin/')) {
      if (!verifyAdmin(request, env)) {
        return jsonResponse({ success: false, message: 'Unauthorized: Invalid Admin PIN' }, 401);
      }

      // GET /api/admin/data: Aggregated stats, telemetry, broadcasts, chats grouped by agency
      if (path === '/api/admin/data' && method === 'GET') {
        const today = getTodayString();
        const announcements = (await kv.get('global_announcements', 'json')) || [];
        const storedRegistry = (await kv.get('agency_registry', 'json')) || [];
        const storedMap = new Map(storedRegistry.map(item => [item.licenseKey, item]));

        // Reset the displayed agencies list so it populates directly from the 10 slots of DISTRIBUTOR_REGISTRY, removing any stale legacy entries
        const agencies = Object.entries(DISTRIBUTOR_REGISTRY).map(([key, slot]) => {
          const stored = storedMap.get(key);
          return {
            licenseKey: key,
            agencyName: slot.agencyName,
            bpclUserId: slot.bpclUserId,
            lastSeen: stored?.lastSeen || ''
          };
        });

        // Fetch telemetry and chat history for each agency
        const telemetryList = [];
        let totalTodayCancellations = 0;
        let activeCountToday = 0;
        let totalUnreadSupportMessages = 0;

        for (const ag of agencies) {
          const tKey = `telemetry:${ag.licenseKey}:${today}`;
          const tData = (await kv.get(tKey, 'json')) || { count: 0, lastUpdated: ag.lastSeen || '' };
          const count = Number(tData.count) || 0;
          totalTodayCancellations += count;
          if (count > 0) activeCountToday++;

          // Get chat summary and messages
          const chatKey = `chat:${ag.licenseKey}`;
          const chats = (await kv.get(chatKey, 'json')) || [];
          const lastMsg = chats.length > 0 ? chats[chats.length - 1] : null;
          const unreadByAdmin = chats.filter(m => m.sender === 'client' && !m.readByAdmin).length;
          totalUnreadSupportMessages += unreadByAdmin;

          // Check license expiration
          const { isExpired, expiresAt, renewalConfig } = await resolveLicenseExpiration(ag.licenseKey, kv);

          telemetryList.push({
            licenseKey: ag.licenseKey,
            agencyName: ag.agencyName || resolveAgencyName(ag.licenseKey),
            bpclUserId: ag.bpclUserId || '',
            lastSeen: ag.lastSeen || '',
            todayCount: count,
            lastUpdated: tData.lastUpdated || ag.lastSeen || '',
            messageCount: chats.length,
            unreadCount: unreadByAdmin,
            isExpired,
            expiresAt,
            renewalConfig,
            lastMessage: lastMsg ? { text: lastMsg.message, timestamp: lastMsg.timestamp, sender: lastMsg.sender } : null,
            messages: chats // Provide full thread for instant inbox switching
          });
        }

        // Sort: agencies with unread messages first, then highest cancellations, then last activity
        telemetryList.sort((a, b) => {
          if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
          if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount;
          return new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime();
        });

        return jsonResponse({
          success: true,
          today,
          stats: {
            totalTodayCancellations,
            activeAgenciesToday: activeCountToday,
            totalAgencies: agencies.length,
            totalBroadcasts: announcements.length,
            totalUnreadMessages: totalUnreadSupportMessages
          },
          agencies: telemetryList,
          announcements
        });
      }

      // GET /api/admin/chat: Get thread for a specific licenseKey
      if (path === '/api/admin/chat' && method === 'GET') {
        const licenseKey = url.searchParams.get('licenseKey');
        if (!licenseKey) {
          return jsonResponse({ success: false, message: 'licenseKey required' }, 400);
        }
        const chatKey = `chat:${licenseKey.trim()}`;
        const messages = (await kv.get(chatKey, 'json')) || [];

        // Mark messages as read by admin
        let updated = false;
        for (const m of messages) {
          if (m.sender === 'client' && !m.readByAdmin) {
            m.readByAdmin = true;
            updated = true;
          }
        }
        if (updated) {
          await kv.put(chatKey, messages);
        }

        return jsonResponse({ success: true, licenseKey, messages });
      }

      // POST /api/admin/reply: Admin sends direct reply to distributor
      if (path === '/api/admin/reply' && method === 'POST') {
        try {
          const body = await request.json();
          const { licenseKey, message } = body;
          if (!licenseKey || !message || !message.trim()) {
            return jsonResponse({ success: false, message: 'licenseKey and message required' }, 400);
          }

          const cleanKey = licenseKey.trim();
          const chatKey = `chat:${cleanKey}`;
          const messages = (await kv.get(chatKey, 'json')) || [];
          const timestamp = new Date().toISOString();
          const newMsg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            sender: 'admin',
            message: message.trim(),
            timestamp,
            readByClient: false
          };
          messages.push(newMsg);
          await kv.put(chatKey, messages);

          // Also ensure agency is in agency_registry
          let registry = (await kv.get('agency_registry', 'json')) || [];
          const idx = registry.findIndex(item => item.licenseKey === cleanKey);
          const resolvedName = resolveAgencyName(cleanKey);
          if (idx >= 0) {
            registry[idx].lastSeen = timestamp;
            if (!registry[idx].agencyName) registry[idx].agencyName = resolvedName;
          } else {
            registry.push({
              licenseKey: cleanKey,
              agencyName: resolvedName,
              lastSeen: timestamp
            });
          }
          await kv.put('agency_registry', registry);

          return jsonResponse({ success: true, message: 'Reply sent successfully', messageData: newMsg });
        } catch (e) {
          return jsonResponse({ success: false, message: e.message }, 500);
        }
      }

      // POST /api/admin/broadcast: Admin adds announcement to global_announcements
      if (path === '/api/admin/broadcast' && method === 'POST') {
        try {
          const body = await request.json();
          const { title, message, priority = 'normal' } = body;
          if (!title || !message || !title.trim() || !message.trim()) {
            return jsonResponse({ success: false, message: 'title and message required' }, 400);
          }

          const announcements = (await kv.get('global_announcements', 'json')) || [];
          const timestamp = new Date().toISOString();
          const notice = {
            id: `ann_${Date.now()}`,
            title: title.trim(),
            message: message.trim(),
            priority: String(priority).toLowerCase() === 'urgent' ? 'urgent' : 'normal',
            timestamp
          };
          announcements.unshift(notice); // Latest first
          // Keep maximum 50 announcements
          if (announcements.length > 50) announcements.length = 50;
          await kv.put('global_announcements', announcements);

          return jsonResponse({ success: true, announcement: notice });
        } catch (e) {
          return jsonResponse({ success: false, message: e.message }, 500);
        }
      }

      // DELETE /api/admin/broadcast: Admin removes an announcement
      if (path === '/api/admin/broadcast' && method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) {
          return jsonResponse({ success: false, message: 'Announcement id required' }, 400);
        }
        let announcements = (await kv.get('global_announcements', 'json')) || [];
        announcements = announcements.filter(a => a.id !== id);
        await kv.put('global_announcements', announcements);
        return jsonResponse({ success: true, message: 'Announcement removed' });
      }
    }

    // -------------------------------------------------------------
    // 4. DISTRIBUTOR TELEMETRY ENDPOINT
    // -------------------------------------------------------------
    if (path === '/api/telemetry' && method === 'POST') {
      try {
        const body = await request.json();
        const { licenseKey, count = 0, agencyName } = body;
        if (!licenseKey) {
          return jsonResponse({ success: false, message: 'licenseKey required' }, 400);
        }

        const cleanKey = licenseKey.trim();
        const today = getTodayString();
        const resolvedName = agencyName || resolveAgencyName(cleanKey);
        const timestamp = new Date().toISOString();

        // 1. Update daily telemetry: telemetry:<licenseKey>:<YYYY-MM-DD>
        const teleKey = `telemetry:${cleanKey}:${today}`;
        const prev = (await kv.get(teleKey, 'json')) || { count: 0 };
        const newCount = Math.max(Number(prev.count) || 0, Number(count) || 0);

        const teleData = {
          licenseKey: cleanKey,
          agencyName: resolvedName,
          count: newCount,
          lastUpdated: timestamp
        };
        await kv.put(teleKey, teleData);

        // 2. Update agency registry list
        let registry = (await kv.get('agency_registry', 'json')) || [];
        const idx = registry.findIndex(item => item.licenseKey === cleanKey);
        if (idx >= 0) {
          registry[idx].agencyName = resolvedName;
          registry[idx].lastSeen = timestamp;
        } else {
          registry.push({
            licenseKey: cleanKey,
            agencyName: resolvedName,
            lastSeen: timestamp
          });
        }
        await kv.put('agency_registry', registry);

        return jsonResponse({ success: true, message: 'Telemetry recorded', data: teleData });
      } catch (e) {
        return jsonResponse({ success: false, message: e.message }, 500);
      }
    }

    // -------------------------------------------------------------
    // 5. DISTRIBUTOR CHAT ENDPOINTS
    // -------------------------------------------------------------
    // GET /api/chat: Retrieve message history for licenseKey
    if (path === '/api/chat' && method === 'GET') {
      const licenseKey = url.searchParams.get('licenseKey');
      if (!licenseKey) {
        return jsonResponse({ success: false, message: 'licenseKey parameter required' }, 400);
      }
      const chatKey = `chat:${licenseKey.trim()}`;
      const messages = (await kv.get(chatKey, 'json')) || [];

      // Mark admin messages as read by client
      let updated = false;
      for (const m of messages) {
        if (m.sender === 'admin' && !m.readByClient) {
          m.readByClient = true;
          updated = true;
        }
      }
      if (updated) {
        await kv.put(chatKey, messages);
      }

      return jsonResponse({ success: true, messages });
    }

    // POST /api/chat: Distributor sends support message to service provider
    if (path === '/api/chat' && method === 'POST') {
      try {
        const body = await request.json();
        const { licenseKey, message, agencyName, sender = 'client' } = body;
        if (!licenseKey || !message || !message.trim()) {
          return jsonResponse({ success: false, message: 'licenseKey and message required' }, 400);
        }

        const cleanKey = licenseKey.trim();
        const resolvedName = agencyName || resolveAgencyName(cleanKey);
        const timestamp = new Date().toISOString();

        // Append to chat:<licenseKey>
        const chatKey = `chat:${cleanKey}`;
        const messages = (await kv.get(chatKey, 'json')) || [];
        const newMsg = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          sender: sender === 'admin' ? 'admin' : 'client',
          message: message.trim(),
          timestamp,
          readByAdmin: sender === 'admin',
          readByClient: sender === 'client'
        };
        messages.push(newMsg);
        await kv.put(chatKey, messages);

        // Ensure agency is registered in agency_registry
        let registry = (await kv.get('agency_registry', 'json')) || [];
        const idx = registry.findIndex(item => item.licenseKey === cleanKey);
        if (idx >= 0) {
          registry[idx].agencyName = resolvedName;
          registry[idx].lastSeen = timestamp;
        } else {
          registry.push({
            licenseKey: cleanKey,
            agencyName: resolvedName,
            lastSeen: timestamp
          });
        }
        await kv.put('agency_registry', registry);

        return jsonResponse({ success: true, message: 'Message sent', messageData: newMsg });
      } catch (e) {
        return jsonResponse({ success: false, message: e.message }, 500);
      }
    }

    // -------------------------------------------------------------
    // 6. NOTIFICATIONS & BROADCASTS POLLING ENDPOINT
    // -------------------------------------------------------------
    if (path === '/api/notifications' && method === 'GET') {
      const licenseKey = url.searchParams.get('licenseKey');
      const since = url.searchParams.get('since'); // optional timestamp

      const announcements = (await kv.get('global_announcements', 'json')) || [];
      let unreadMessages = [];

      if (licenseKey) {
        const chatKey = `chat:${licenseKey.trim()}`;
        const messages = (await kv.get(chatKey, 'json')) || [];
        unreadMessages = messages.filter(m => m.sender === 'admin' && !m.readByClient);
      }

      // Filter by since if requested
      let filteredAnnouncements = announcements;
      if (since) {
        const sinceTime = new Date(since).getTime();
        if (!isNaN(sinceTime)) {
          filteredAnnouncements = announcements.filter(a => new Date(a.timestamp).getTime() > sinceTime);
        }
      }

      return jsonResponse({
        success: true,
        announcements,
        newAnnouncements: filteredAnnouncements,
        unreadMessages,
        totalUnread: unreadMessages.length + (filteredAnnouncements.length > 0 ? 1 : 0)
      });
    }

    // -------------------------------------------------------------
    // 7. LICENSE VERIFICATION & DYNAMIC MANIFEST (POST / or /api/verify or /api/license)
    // -------------------------------------------------------------
    if ((path === '/' || path === '/api/verify' || path === '/api/license') && (method === 'POST' || method === 'GET')) {
      try {
        let licenseKey = '';
        let bpclUserId = '';
        if (method === 'POST') {
          const body = await request.json().catch(() => ({}));
          licenseKey = body.licenseKey || body.key || '';
          bpclUserId = body.bpclUserId || body.userId || '';
        } else {
          licenseKey = url.searchParams.get('licenseKey') || url.searchParams.get('key') || '';
          bpclUserId = url.searchParams.get('bpclUserId') || url.searchParams.get('userId') || '';
        }

        const cleanKey = String(licenseKey || '').trim();
        const cleanUserId = String(bpclUserId || '').trim();

        // 1 & 2. Extract and trim both values. If either value is empty or missing:
        if (!cleanKey || !cleanUserId) {
          return jsonResponse({
            success: false,
            error: "MISSING_FIELDS",
            message: "कृपया BPCL User ID और License Key दोनों दर्ज करें।"
          }, 400);
        }

        // 3. Look up slot in DISTRIBUTOR_REGISTRY[cleanKey]
        const slot = DISTRIBUTOR_REGISTRY[cleanKey];

        // 4. Strict Pairing Verification:
        // If slot does not exist OR slot.bpclUserId.toLowerCase() !== cleanUserId.toLowerCase():
        if (!slot || slot.bpclUserId.toLowerCase() !== cleanUserId.toLowerCase()) {
          return jsonResponse({
            success: false,
            error: "AUTH_FAILED",
            message: "अमान्य BPCL User ID या License Key (Invalid BPCL User ID or License Key)"
          }, 403);
        }

        // 5. Check Expiry:
        const todayStr = getTodayString();
        const slotExpiry = slot.expiresAt || '2026-12-07';
        if (slotExpiry < todayStr) {
          return jsonResponse({
            success: false,
            isExpired: true,
            expiry: slotExpiry,
            expiresAt: slotExpiry,
            message: slot.expiryMessage || "License expired. Please renew."
          }, 403);
        }

        // Update agency registry last seen in KV
        const timestamp = new Date().toISOString();
        let registry = (await kv.get('agency_registry', 'json')) || [];
        const idx = registry.findIndex(item => item.licenseKey === cleanKey);
        if (idx >= 0) {
          registry[idx].agencyName = slot.agencyName;
          registry[idx].bpclUserId = slot.bpclUserId;
          registry[idx].lastSeen = timestamp;
        } else {
          registry.push({
            licenseKey: cleanKey,
            agencyName: slot.agencyName,
            bpclUserId: slot.bpclUserId,
            lastSeen: timestamp
          });
        }
        await kv.put('agency_registry', registry);

        // 6. On valid match:
        const anticaptchaApiKey = env?.ANTI_CAPTCHA_KEY || DEFAULT_ANTICAPTCHA_KEY;
        return jsonResponse({
          success: true,
          message: "सफलतापूर्वक सत्यापित किया गया (Verified)",
          distributor: slot.agencyName,
          agencyName: slot.agencyName,
          isExpired: false,
          expiresAt: slot.expiresAt,
          anticaptchaApiKey,
          latestVersion: "1.1.0",
          payload: {
            loginUrl: "https://econnect.bpcl.in/selfservice/menu/SELFSERVICE_MYINFO",
            selectors: {
              loginUser: "#principal",
              loginPass: "#input_password",
              captchaImg: "img#captcha",
              captchaInput: "input#captcha",
              loginBtn: ".login-btn",
              menuMyApps: "My Application",
              linkLpgOne: "LPG One",
              linkEDayEnd: "E-Day End This option is for",
              btnProceedDayEnd: "Proceed",
              product5350Text: "5350",
              linkDelvConfNotDone: "a[id*=\"hlDelvConfNotDone\"]",
              tableConsumers: "#gvProductConsumer tr",
              linkCashMemoCancel: "Cash Memo Cancel",
              txtConsumerNumber: "#ctl00_ContentPlaceHolder1_txtConsumerNumber",
              btnProceedCancel: "#ctl00_ContentPlaceHolder1_btnProceed",
              linkCancelMemo: "#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel",
              lblMessage: "#ctl00_ContentPlaceHolder1_lblMessage",
              btnClear: "#ctl00_ContentPlaceHolder1_btnClear",
              userInput: "#principal",
              passInput: "#input_password",
              memoSearchInput: "#ctl00_ContentPlaceHolder1_txtConsumerNumber",
              cancelMemoBtn: "#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel",
              confirmDialogYes: "#ctl00_ContentPlaceHolder1_btnProceed",
              userIdInput: "#principal",
              passwordInput: "#input_password",
              loginButton: ".login-btn",
              cancelMenuTab: "Cash Memo Cancel",
              memoRows: "#gvProductConsumer tr"
            }
          },
          manifest: {
            agencyName: slot.agencyName,
            distributor: slot.agencyName,
            anticaptchaApiKey,
            isExpired: false,
            expiresAt: slot.expiresAt,
            renewalConfig: DEFAULT_RENEWAL_CONFIG,
            selectors: {
              loginUser: "#principal",
              loginPass: "#input_password",
              captchaImg: "img#captcha",
              captchaInput: "input#captcha",
              loginBtn: ".login-btn",
              menuMyApps: "My Application",
              linkLpgOne: "LPG One",
              linkEDayEnd: "E-Day End This option is for",
              btnProceedDayEnd: "Proceed",
              product5350Text: "5350",
              linkDelvConfNotDone: "a[id*=\"hlDelvConfNotDone\"]",
              tableConsumers: "#gvProductConsumer tr",
              linkCashMemoCancel: "Cash Memo Cancel",
              txtConsumerNumber: "#ctl00_ContentPlaceHolder1_txtConsumerNumber",
              btnProceedCancel: "#ctl00_ContentPlaceHolder1_btnProceed",
              linkCancelMemo: "#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel",
              lblMessage: "#ctl00_ContentPlaceHolder1_lblMessage",
              btnClear: "#ctl00_ContentPlaceHolder1_btnClear",
              userInput: "#principal",
              passInput: "#input_password",
              memoSearchInput: "#ctl00_ContentPlaceHolder1_txtConsumerNumber",
              cancelMemoBtn: "#ctl00_ContentPlaceHolder1_grdConsumerDetails_ctl02_lnkCancel",
              confirmDialogYes: "#ctl00_ContentPlaceHolder1_btnProceed",
              userIdInput: "#principal",
              passwordInput: "#input_password",
              loginButton: ".login-btn",
              cancelMenuTab: "Cash Memo Cancel",
              memoRows: "#gvProductConsumer tr"
            },
            uiTheme: {
              themeVersion: "1.0.6",
              customCss: ""
            }
          }
        }, 200);
      } catch (e) {
        return jsonResponse({ success: false, message: e.message }, 500);
      }
    }

    // 404 Fallback
    return jsonResponse({ error: 'Endpoint not found', path }, 404);
  }
};

/**
 * Renders the sleek, dark-mode, mobile-friendly Admin Web Dashboard
 */
function renderAdminPortalHtml(env) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus Automation Admin Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #3b82f6;
      --primary-glow: rgba(59, 130, 246, 0.4);
      --cyan: #06b6d4;
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.35);
      --purple: #8b5cf6;
      --purple-glow: rgba(139, 92, 246, 0.4);
      --amber: #f59e0b;
      --red: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.12) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.1) 0px, transparent 50%);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Navigation Bar */
    header {
      background: rgba(11, 15, 25, 0.88);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--primary), var(--purple));
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 18px;
      box-shadow: 0 0 16px var(--primary-glow);
    }

    .brand h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
    .brand p { font-size: 12px; color: var(--text-muted); }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--emerald);
      font-size: 12px;
      font-weight: 600;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px var(--emerald);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-family: inherit;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--purple));
      color: white;
      box-shadow: 0 4px 14px var(--primary-glow);
    }

    .btn-primary:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--card-border);
      color: var(--text);
    }

    .btn-secondary:hover { background: rgba(255, 255, 255, 0.1); }

    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.35);
      color: #f87171;
    }

    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #fca5a5;
    }

    /* Sub-header Navigation Tabs */
    .nav-tabs-bar {
      background: rgba(15, 23, 42, 0.6);
      border-bottom: 1px solid var(--card-border);
      padding: 0 24px;
      display: flex;
      gap: 8px;
    }

    .nav-tab {
      padding: 12px 18px;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .nav-tab:hover {
      color: #fff;
    }

    .nav-tab.active {
      color: #fff;
      border-bottom-color: var(--primary);
    }

    .tab-badge {
      background: rgba(59, 130, 246, 0.25);
      color: #93c5fd;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 999px;
      font-weight: 700;
    }

    .tab-badge.unread {
      background: rgba(239, 68, 68, 0.25);
      color: #fca5a5;
      animation: pulse 2s infinite;
    }

    /* Main Container */
    main {
      flex: 1;
      max-width: 1380px;
      width: 100%;
      margin: 0 auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .stat-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 18px 20px;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s;
    }

    .stat-card:hover { transform: translateY(-2px); }

    .stat-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--purple));
    }

    .stat-card.alert-card::after {
      background: linear-gradient(90deg, var(--amber), var(--red));
    }

    .stat-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #fff;
    }

    .stat-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Panels & Cards */
    .panel {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 14px;
    }

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Table Styles */
    .table-container {
      overflow-x: auto;
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }

    th {
      padding: 10px 14px;
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.02);
    }

    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    tr:hover td { background: rgba(255, 255, 255, 0.02); }

    .agency-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .agency-name { font-weight: 600; color: #fff; }
    .agency-key { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); }

    .count-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 13px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    /* Form Styles */
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label { font-size: 12px; font-weight: 600; color: var(--text-muted); }

    input, textarea, select {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-family: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    input:focus, textarea:focus, select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary-glow);
    }

    /* -------------------------------------------------------------
       SUPPORT INBOX & MESSENGER (TWO-PANE LAYOUT)
       ------------------------------------------------------------- */
    .inbox-layout {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 18px;
      height: 680px;
    }

    @media (max-width: 900px) {
      .inbox-layout {
        grid-template-columns: 1fr;
        height: auto;
      }
    }

    /* Left: Agency Threads Sidebar */
    .inbox-sidebar {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .inbox-sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: rgba(255, 255, 255, 0.02);
    }

    .inbox-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .inbox-title-row h3 {
      font-size: 15px;
      font-weight: 700;
    }

    .inbox-search-input {
      width: 100%;
      padding: 8px 12px;
      font-size: 12px;
    }

    .threads-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .thread-card {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.2s ease;
      position: relative;
    }

    .thread-card:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .thread-card.active {
      background: rgba(59, 130, 246, 0.12);
      border-left: 3px solid var(--primary);
    }

    .thread-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .thread-agency-name {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 210px;
    }

    .thread-time {
      font-size: 11px;
      color: #64748b;
    }

    .thread-key-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--cyan);
      background: rgba(6, 182, 212, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      width: fit-content;
    }

    .thread-snippet-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .thread-snippet {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }

    .unread-indicator {
      background: #ef4444;
      color: white;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 999px;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    }

    /* Right: Active Chat Conversation View */
    .chat-view-panel {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .chat-view-header {
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .chat-view-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .chat-view-title {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }

    .chat-view-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chat-stream {
      flex: 1;
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: rgba(10, 15, 26, 0.4);
    }

    .chat-bubble {
      max-width: 75%;
      padding: 12px 16px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    }

    .chat-bubble.client {
      align-self: flex-start;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-bottom-left-radius: 3px;
    }

    .chat-bubble.admin {
      align-self: flex-end;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(139, 92, 246, 0.25));
      border: 1px solid rgba(99, 102, 241, 0.45);
      border-bottom-right-radius: 3px;
    }

    .bubble-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .bubble-sender {
      font-size: 11px;
      font-weight: 700;
      color: var(--emerald);
    }

    .chat-bubble.admin .bubble-sender {
      color: #93c5fd;
    }

    .bubble-time {
      font-size: 10px;
      color: #64748b;
    }

    .bubble-text {
      color: #f1f5f9;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Chat Reply Composer Bar */
    .chat-reply-bar {
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.02);
      border-top: 1px solid var(--card-border);
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .chat-reply-input {
      flex: 1;
      font-size: 13px;
      padding: 12px 16px;
    }

    /* -------------------------------------------------------------
       BROADCAST NOTIFICATION PANEL
       ------------------------------------------------------------- */
    .broadcast-layout {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 20px;
    }

    @media (max-width: 900px) {
      .broadcast-layout { grid-template-columns: 1fr; }
    }

    .broadcast-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 520px;
      overflow-y: auto;
    }

    .broadcast-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      transition: background 0.2s;
    }

    .broadcast-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .broadcast-item.urgent {
      border-left: 4px solid var(--amber);
      background: rgba(245, 158, 11, 0.06);
    }

    .broadcast-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .broadcast-content h4 {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .broadcast-content p {
      font-size: 12.5px;
      color: var(--text-muted);
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .broadcast-content .broadcast-meta {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    /* PIN Modal */
    .pin-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(3, 7, 18, 0.88);
      backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .pin-card {
      background: #0d1322;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      padding: 36px 32px;
      width: 100%;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .pin-input {
      font-size: 26px;
      letter-spacing: 8px;
      text-align: center;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: rgba(0, 0, 0, 0.4);
      color: #fff;
      outline: none;
    }

    .hidden { display: none !important; }
  </style>
</head>
<body>

  <!-- PIN Modal -->
  <div id="pinModal" class="pin-modal-backdrop">
    <div class="pin-card">
      <div class="brand-logo" style="margin: 0 auto; width: 50px; height: 50px; font-size: 24px;">⚡</div>
      <h2 style="font-size: 21px; font-weight: 800;">Nexus Admin Access</h2>
      <p style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">Enter the 4-digit Administrator PIN to manage telemetry, live support chat, and broadcast notices.</p>
      <input type="password" id="adminPinInput" class="pin-input" maxlength="8" placeholder="••••" autofocus>
      <button id="btnVerifyPin" class="btn btn-primary" style="justify-content: center; padding: 12px; font-size: 14px;">Unlock Operations Portal</button>
      <p id="pinErrorText" style="color: #ef4444; font-size: 12px;" class="hidden">Invalid Admin PIN. Default is 2026.</p>
    </div>
  </div>

  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-logo">⚡</div>
      <div>
        <h1>Nexus Automation Admin Console</h1>
        <p>Real-time BPCL Telemetry, Support Inbox & Global Broadcasts</p>
      </div>
    </div>
    <div class="header-actions">
      <div class="status-pill">
        <span class="status-dot"></span>
        <span>Cloudflare KV Live</span>
      </div>
      <button id="btnRefresh" class="btn btn-secondary" title="Refresh Live Data">🔄 Refresh</button>
      <button id="btnLogout" class="btn btn-secondary" title="Lock Session">🔒 Lock</button>
    </div>
  </header>

  <!-- Navigation Tabs -->
  <nav class="nav-tabs-bar">
    <button class="nav-tab active" data-tab="telemetry">
      <span>📊 Telemetry & Activity</span>
    </button>
    <button class="nav-tab" data-tab="inbox">
      <span>💬 Support Inbox</span>
      <span id="tabUnreadBadge" class="tab-badge hidden">0 NEW</span>
    </button>
    <button class="nav-tab" data-tab="broadcast">
      <span>📢 Broadcast Center</span>
      <span id="tabBroadcastCount" class="tab-badge">0</span>
    </button>
  </nav>

  <!-- Main Content -->
  <main>
    <!-- Stats Row (Always visible across all tabs) -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">Today's Memos Cancelled</div>
        <div id="statTotalCancelled" class="stat-value">0</div>
        <div class="stat-sub">Across all reporting agency engines</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Active Distributors Today</div>
        <div id="statActiveAgencies" class="stat-value">0</div>
        <div class="stat-sub">Distributors with live session activity</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Registered Agencies</div>
        <div id="statTotalAgencies" class="stat-value">0</div>
        <div class="stat-sub">Known agency licenses in system</div>
      </div>
      <div class="stat-card" id="cardUnreadSupport">
        <div class="stat-title">Pending Support Inquiries</div>
        <div id="statUnreadMessages" class="stat-value" style="color: #60a5fa;">0</div>
        <div class="stat-sub" id="statUnreadSub">Awaiting response from admin</div>
      </div>
    </div>

    <!-- TAB 1: Telemetry & Activity -->
    <section id="sectionTelemetry" class="panel">
      <div class="panel-header">
        <div class="panel-title">📊 Distributor Performance & E-Day End Telemetry</div>
        <span id="todayDateLabel" style="font-size: 12px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;"></span>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Distributor Agency</th>
              <th>Today's Cancelled</th>
              <th>Support Chat</th>
              <th>Last Reported</th>
              <th>Quick Actions</th>
            </tr>
          </thead>
          <tbody id="agencyTableBody">
            <tr>
              <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 36px;">Loading live telemetry...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- TAB 2: Support Inbox & Live Reply -->
    <section id="sectionInbox" class="inbox-layout hidden">
      <!-- Left: Agency Inquiries List -->
      <div class="inbox-sidebar">
        <div class="inbox-sidebar-header">
          <div class="inbox-title-row">
            <h3>Support Inbox</h3>
            <span id="inboxThreadCount" style="font-size: 11px; color: var(--text-muted);">0 Agencies</span>
          </div>
          <input type="text" id="inboxSearchInput" class="inbox-search-input" placeholder="🔍 Search agency name or license...">
        </div>
        <div class="threads-list" id="threadsListContainer">
          <div style="text-align: center; color: var(--text-muted); padding: 32px; font-size: 12px;">Loading agency threads...</div>
        </div>
      </div>

      <!-- Right: Active Conversation & Direct Reply Box -->
      <div class="chat-view-panel">
        <div class="chat-view-header">
          <div class="chat-view-info">
            <div id="chatActiveAgencyName" class="chat-view-title">Select an Agency Thread</div>
            <div class="chat-view-subtitle">
              <span id="chatActiveLicenseKey" class="thread-key-pill" style="display: none;"></span>
              <span id="chatActiveStats" style="font-size: 11px;">Select from the inbox on the left to review messages and reply.</span>
            </div>
          </div>
          <button id="btnRefreshThread" class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" disabled>🔄 Refresh Thread</button>
        </div>

        <div class="chat-stream" id="chatMessagesStream">
          <div style="text-align: center; color: var(--text-muted); padding: 80px 20px; font-size: 13px;">
            💬 Select an agency from the inbox sidebar to load previous conversations and send instant replies.
          </div>
        </div>

        <div class="chat-reply-bar">
          <input type="text" id="chatReplyInput" class="chat-reply-input" placeholder="Select an agency thread to send a reply..." disabled>
          <button id="btnSendReply" class="btn btn-primary" style="padding: 10px 20px;" disabled>
            <span>Send Reply</span>
            <span>➤</span>
          </button>
        </div>
      </div>
    </section>

    <!-- TAB 3: Broadcast Notification Center -->
    <section id="sectionBroadcast" class="panel hidden">
      <div class="panel-header">
        <div class="panel-title">📢 Broadcast Announcement Center</div>
        <span style="font-size: 12px; color: var(--text-muted);">Broadcast notices display as in-app notifications on all active distributor desktop apps</span>
      </div>

      <div class="broadcast-layout">
        <!-- Composer Form -->
        <div style="display: flex; flex-direction: column; gap: 14px; background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 18px;">
          <h3 style="font-size: 14px; font-weight: 700; color: #fff;">Compose New Announcement</h3>

          <div class="form-group">
            <label>Announcement Title</label>
            <input type="text" id="broadcastTitleInput" placeholder="e.g. Scheduled Maintenance / BPCL OTP Notice">
          </div>

          <div class="form-group">
            <label>Priority Level</label>
            <select id="broadcastPriority">
              <option value="normal">Normal (Informational Notice)</option>
              <option value="urgent">🚨 Urgent (Immediate Attention Required)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Announcement Message</label>
            <textarea id="broadcastTextInput" rows="4" placeholder="Write announcement details to broadcast across all active distributor desktop applications..."></textarea>
          </div>

          <button id="btnSendBroadcast" class="btn btn-primary" style="align-self: flex-start; margin-top: 4px;">
            📢 Post Global Announcement
          </button>
        </div>

        <!-- Active Announcements List -->
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <h3 style="font-size: 14px; font-weight: 700; color: #fff;">Live Announcements in KV</h3>
            <span id="broadcastCountLabel" style="font-size: 11px; color: var(--text-muted);">0 Active</span>
          </div>
          <div class="broadcast-list" id="announcementsList">
            <div style="color: var(--text-muted); font-size: 12px; padding: 20px; text-align: center;">Loading announcements...</div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    let currentAdminPin = sessionStorage.getItem('nexus_admin_pin') || '';
    let currentAgencies = [];
    let currentAnnouncements = [];
    let selectedLicenseKey = '';
    let activeTab = 'telemetry';

    const pinModal = document.getElementById('pinModal');
    const adminPinInput = document.getElementById('adminPinInput');
    const btnVerifyPin = document.getElementById('btnVerifyPin');
    const pinErrorText = document.getElementById('pinErrorText');

    // Tab Switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        switchTab(tab.getAttribute('data-tab'));
      });
    });

    function switchTab(tabName) {
      activeTab = tabName;
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
      });

      document.getElementById('sectionTelemetry').classList.toggle('hidden', tabName !== 'telemetry');
      document.getElementById('sectionInbox').classList.toggle('hidden', tabName !== 'inbox');
      document.getElementById('sectionBroadcast').classList.toggle('hidden', tabName !== 'broadcast');

      if (tabName === 'inbox' && !selectedLicenseKey && currentAgencies.length > 0) {
        // Select the first agency by default if none selected
        selectAgencyForChat(currentAgencies[0].licenseKey);
      }
    }

    async function checkPinAndInit() {
      if (currentAdminPin) {
        const ok = await verifyPinOnServer(currentAdminPin);
        if (ok) {
          pinModal.classList.add('hidden');
          loadDashboardData();
          return;
        }
      }
      pinModal.classList.remove('hidden');
      adminPinInput.focus();
    }

    async function verifyPinOnServer(pin) {
      try {
        const res = await fetch('/api/admin/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        return data.success === true;
      } catch (e) {
        return false;
      }
    }

    btnVerifyPin.addEventListener('click', async () => {
      const pin = adminPinInput.value.trim();
      if (!pin) return;
      btnVerifyPin.disabled = true;
      btnVerifyPin.textContent = 'Verifying...';

      const valid = await verifyPinOnServer(pin);
      btnVerifyPin.disabled = false;
      btnVerifyPin.textContent = 'Unlock Operations Portal';

      if (valid) {
        currentAdminPin = pin;
        sessionStorage.setItem('nexus_admin_pin', pin);
        pinModal.classList.add('hidden');
        pinErrorText.classList.add('hidden');
        loadDashboardData();
      } else {
        pinErrorText.classList.remove('hidden');
        adminPinInput.value = '';
        adminPinInput.focus();
      }
    });

    adminPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnVerifyPin.click();
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
      sessionStorage.removeItem('nexus_admin_pin');
      currentAdminPin = '';
      pinModal.classList.remove('hidden');
      adminPinInput.value = '';
      adminPinInput.focus();
    });

    document.getElementById('btnRefresh').addEventListener('click', () => {
      loadDashboardData();
    });

    async function fetchAdminApi(endpoint, options = {}) {
      return fetch(endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-PIN': currentAdminPin,
          ...(options.headers || {})
        }
      }).then(r => r.json());
    }

    async function loadDashboardData() {
      if (!currentAdminPin) return;
      try {
        const data = await fetchAdminApi('/api/admin/data');
        if (!data || !data.success) {
          if (data && data.message && data.message.includes('Unauthorized')) {
            sessionStorage.removeItem('nexus_admin_pin');
            currentAdminPin = '';
            pinModal.classList.remove('hidden');
          }
          return;
        }

        // 1. Stats Counter Updates
        document.getElementById('statTotalCancelled').textContent = (data.stats.totalTodayCancellations || 0).toLocaleString();
        document.getElementById('statActiveAgencies').textContent = data.stats.activeAgenciesToday || 0;
        document.getElementById('statTotalAgencies').textContent = data.stats.totalAgencies || 0;
        
        const unreadMsgCount = data.stats.totalUnreadMessages || 0;
        const statUnreadEl = document.getElementById('statUnreadMessages');
        statUnreadEl.textContent = unreadMsgCount;
        statUnreadEl.style.color = unreadMsgCount > 0 ? '#ef4444' : '#60a5fa';
        
        const tabUnreadBadge = document.getElementById('tabUnreadBadge');
        if (unreadMsgCount > 0) {
          tabUnreadBadge.textContent = unreadMsgCount + ' NEW';
          tabUnreadBadge.classList.add('unread');
          tabUnreadBadge.classList.remove('hidden');
        } else {
          tabUnreadBadge.classList.add('hidden');
        }

        const broadcastsCount = data.announcements ? data.announcements.length : 0;
        document.getElementById('tabBroadcastCount').textContent = broadcastsCount;
        document.getElementById('broadcastCountLabel').textContent = broadcastsCount + ' Active';
        document.getElementById('todayDateLabel').textContent = 'Date: ' + (data.today || '');

        // 2. Refresh Tables & Views
        currentAgencies = data.agencies || [];
        currentAnnouncements = data.announcements || [];

        renderAgenciesTable(currentAgencies);
        renderInboxSidebar(currentAgencies);
        renderAnnouncementsList(currentAnnouncements);

        // 3. If an agency was active, refresh its thread
        if (selectedLicenseKey) {
          const activeAgency = currentAgencies.find(a => a.licenseKey === selectedLicenseKey);
          if (activeAgency && activeAgency.messages) {
            renderChatMessages(activeAgency.messages);
          } else {
            loadChatThread(selectedLicenseKey);
          }
        }
      } catch (err) {
        console.error('Error loading admin data:', err);
      }
    }

    // Render Telemetry Table
    function renderAgenciesTable(agencies) {
      const tbody = document.getElementById('agencyTableBody');
      if (!agencies || agencies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 36px;">No distributor activity recorded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = agencies.map(ag => {
        const updatedTime = ag.lastUpdated ? new Date(ag.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending';
        return \`
          <tr>
            <td>
              <div class="agency-cell">
                <span class="agency-name">\${escapeHtml(ag.agencyName)}</span>
                <span class="agency-key">\${escapeHtml(ag.licenseKey)}</span>
              </div>
            </td>
            <td>
              <span class="count-badge">\${ag.todayCount || 0} memos</span>
            </td>
            <td>
              \${ag.unreadCount > 0 
                ? \`<span class="unread-indicator" style="padding: 3px 8px;">\${ag.unreadCount} Unread</span>\` 
                : \`<span style="color: var(--text-muted); font-size: 12px;">\${ag.messageCount || 0} msgs</span>\`}
            </td>
            <td style="color: var(--text-muted); font-size: 12px;">\${updatedTime}</td>
            <td>
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="openAgencyChat('\${escapeHtml(ag.licenseKey)}')">
                💬 Open Chat \${ag.unreadCount > 0 ? \`(\${ag.unreadCount})\` : ''}
              </button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    // Render Support Inbox Sidebar
    function renderInboxSidebar(agencies) {
      const container = document.getElementById('threadsListContainer');
      document.getElementById('inboxThreadCount').textContent = agencies.length + ' Agencies';

      if (!agencies || agencies.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 32px; font-size: 12px;">No agencies found.</div>';
        return;
      }

      const filterText = (document.getElementById('inboxSearchInput')?.value || '').toLowerCase().trim();
      const filtered = agencies.filter(ag => {
        if (!filterText) return true;
        return (ag.agencyName || '').toLowerCase().includes(filterText) ||
               (ag.licenseKey || '').toLowerCase().includes(filterText);
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 32px; font-size: 12px;">No matching agencies.</div>';
        return;
      }

      container.innerHTML = filtered.map(ag => {
        const isSelected = ag.licenseKey === selectedLicenseKey;
        const lastMsg = ag.lastMessage;
        let snippetText = 'No messages yet';
        let timeStr = '';
        if (lastMsg) {
          const senderLabel = lastMsg.sender === 'admin' ? 'You: ' : '';
          snippetText = senderLabel + lastMsg.text;
          timeStr = new Date(lastMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        return \`
          <div class="thread-card \${isSelected ? 'active' : ''}" onclick="selectAgencyForChat('\${escapeHtml(ag.licenseKey)}')">
            <div class="thread-header-row">
              <span class="thread-agency-name" title="\${escapeHtml(ag.agencyName)}">\${escapeHtml(ag.agencyName)}</span>
              <span class="thread-time">\${timeStr}</span>
            </div>
            <div class="thread-snippet-row">
              <span class="thread-key-pill">\${escapeHtml(ag.licenseKey)}</span>
              \${ag.unreadCount > 0 ? \`<span class="unread-indicator">\${ag.unreadCount} NEW</span>\` : ''}
            </div>
            <div class="thread-snippet" title="\${escapeHtml(snippetText)}">\${escapeHtml(snippetText)}</div>
          </div>
        \`;
      }).join('');
    }

    // Search filter in Inbox
    document.getElementById('inboxSearchInput').addEventListener('input', () => {
      renderInboxSidebar(currentAgencies);
    });

    // Helper to open chat from Telemetry Table
    window.openAgencyChat = function(licenseKey) {
      switchTab('inbox');
      selectAgencyForChat(licenseKey);
    };

    // Select Agency and Load Thread
    window.selectAgencyForChat = function(licenseKey) {
      selectedLicenseKey = licenseKey;
      renderInboxSidebar(currentAgencies);

      const ag = currentAgencies.find(a => a.licenseKey === licenseKey);
      const name = ag ? ag.agencyName : 'Agency ' + licenseKey;
      document.getElementById('chatActiveAgencyName').textContent = name;
      
      const keyEl = document.getElementById('chatActiveLicenseKey');
      keyEl.textContent = licenseKey;
      keyEl.style.display = 'inline-block';

      const memoText = (ag && ag.todayCount) ? \`🔥 \${ag.todayCount} Memos Today\` : 'Online';
      document.getElementById('chatActiveStats').textContent = memoText;

      const replyInput = document.getElementById('chatReplyInput');
      replyInput.disabled = false;
      replyInput.placeholder = \`Write a reply to \${name}... (Press Enter to send)\`;
      document.getElementById('btnSendReply').disabled = false;
      document.getElementById('btnRefreshThread').disabled = false;

      loadChatThread(licenseKey);
    };

    // Refresh Thread Button
    document.getElementById('btnRefreshThread').addEventListener('click', () => {
      if (selectedLicenseKey) loadChatThread(selectedLicenseKey);
    });

    // Load Chat Thread from Server
    async function loadChatThread(licenseKey) {
      const container = document.getElementById('chatMessagesStream');
      container.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 40px;">Loading chat messages...</div>';

      try {
        const data = await fetchAdminApi(\`/api/admin/chat?licenseKey=\${encodeURIComponent(licenseKey)}\`);
        if (!data || !data.success) {
          container.innerHTML = '<div style="text-align:center; color: #ef4444; padding: 40px;">Failed to load messages.</div>';
          return;
        }

        const messages = data.messages || [];
        // Update unread count locally for responsive UI
        const ag = currentAgencies.find(a => a.licenseKey === licenseKey);
        if (ag) {
          ag.unreadCount = 0;
          renderInboxSidebar(currentAgencies);
        }

        renderChatMessages(messages);
      } catch (e) {
        container.innerHTML = '<div style="text-align:center; color: #ef4444; padding: 40px;">Error connecting to chat service.</div>';
      }
    }

    // Render Messages Stream
    function renderChatMessages(messages) {
      const container = document.getElementById('chatMessagesStream');
      if (!messages || messages.length === 0) {
        container.innerHTML = \`
          <div style="text-align: center; color: var(--text-muted); padding: 80px 20px; font-size: 13px;">
            💬 No previous messages for this agency.
            <div style="margin-top: 6px; font-size: 12px; color: #64748b;">Type a direct reply or operational greeting below to initiate conversation.</div>
          </div>
        \`;
        return;
      }

      container.innerHTML = messages.map(m => {
        const isClient = m.sender === 'client';
        const senderLabel = isClient ? '👤 Distributor Operator' : '⚡ Support Admin (You)';
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        return \`
          <div class="chat-bubble \${isClient ? 'client' : 'admin'}">
            <div class="bubble-meta">
              <span class="bubble-sender">\${senderLabel}</span>
              <span class="bubble-time">\${timeStr}</span>
            </div>
            <div class="bubble-text">\${escapeHtml(m.message)}</div>
          </div>
        \`;
      }).join('');

      container.scrollTop = container.scrollHeight;
    }

    // Send Admin Reply
    async function sendAdminReply() {
      const input = document.getElementById('chatReplyInput');
      const message = input.value.trim();
      if (!message || !selectedLicenseKey) return;

      const btn = document.getElementById('btnSendReply');
      btn.disabled = true;

      try {
        const res = await fetchAdminApi('/api/admin/reply', {
          method: 'POST',
          body: JSON.stringify({ licenseKey: selectedLicenseKey, message })
        });
        btn.disabled = false;

        if (res && res.success) {
          input.value = '';
          input.focus();
          
          // Optimistically append message to stream
          const stream = document.getElementById('chatMessagesStream');
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const newBubble = document.createElement('div');
          newBubble.className = 'chat-bubble admin';
          newBubble.innerHTML = \`
            <div class="bubble-meta">
              <span class="bubble-sender">⚡ Support Admin (You)</span>
              <span class="bubble-time">\${timeStr}</span>
            </div>
            <div class="bubble-text">\${escapeHtml(message)}</div>
          \`;
          stream.appendChild(newBubble);
          stream.scrollTop = stream.scrollHeight;

          // Update local agency preview
          const ag = currentAgencies.find(a => a.licenseKey === selectedLicenseKey);
          if (ag) {
            ag.lastMessage = { sender: 'admin', text: message, timestamp: new Date().toISOString() };
            renderInboxSidebar(currentAgencies);
          }
        } else {
          alert('Failed to send reply: ' + (res?.message || 'Unknown error'));
        }
      } catch (e) {
        btn.disabled = false;
        alert('Network error sending reply to distributor.');
      }
    }

    document.getElementById('btnSendReply').addEventListener('click', sendAdminReply);
    document.getElementById('chatReplyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendAdminReply();
      }
    });

    // Send Broadcast Notice
    document.getElementById('btnSendBroadcast').addEventListener('click', async () => {
      const titleInput = document.getElementById('broadcastTitleInput');
      const textInput = document.getElementById('broadcastTextInput');
      const priorityInput = document.getElementById('broadcastPriority');

      const title = titleInput.value.trim();
      const text = textInput.value.trim();
      const priority = priorityInput.value;

      if (!title || !text) {
        alert('Please fill out both the announcement title and message text.');
        return;
      }

      const btn = document.getElementById('btnSendBroadcast');
      btn.disabled = true;
      btn.textContent = 'Broadcasting to All Agencies...';

      try {
        const res = await fetchAdminApi('/api/admin/broadcast', {
          method: 'POST',
          body: JSON.stringify({ title, message: text, priority })
        });
        btn.disabled = false;
        btn.textContent = '📢 Post Global Announcement';

        if (res && res.success) {
          titleInput.value = '';
          textInput.value = '';
          loadDashboardData();
          alert('✅ Broadcast announcement published to all desktop engines.');
        } else {
          alert('Failed to broadcast announcement: ' + (res?.message || 'Error'));
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '📢 Post Global Announcement';
        alert('Network error broadcasting announcement.');
      }
    });

    // Render Active Announcements List
    function renderAnnouncementsList(announcements) {
      const list = document.getElementById('announcementsList');
      if (!announcements || announcements.length === 0) {
        list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 24px; text-align: center;">No active broadcast announcements in KV.</div>';
        return;
      }

      list.innerHTML = announcements.map(a => \`
        <div class="broadcast-item \${a.priority === 'urgent' ? 'urgent' : ''}">
          <div class="broadcast-content">
            <h4>
              <span>\${escapeHtml(a.title)}</span>
              \${a.priority === 'urgent' ? '<span style="color: var(--amber); font-size: 11px;">(🚨 URGENT)</span>' : ''}
            </h4>
            <p>\${escapeHtml(a.message)}</p>
            <div class="broadcast-meta">Posted: \${new Date(a.timestamp).toLocaleString()}</div>
          </div>
          <button class="btn btn-danger" style="padding: 4px 10px; font-size: 11px;" onclick="deleteBroadcast('\${escapeHtml(a.id)}')">Delete</button>
        </div>
      \`).join('');
    }

    // Delete Broadcast Notice
    window.deleteBroadcast = async function(id) {
      if (!confirm('Are you sure you want to delete this broadcast notice from KV?')) return;
      try {
        const res = await fetchAdminApi(\`/api/admin/broadcast?id=\${encodeURIComponent(id)}\`, { method: 'DELETE' });
        if (res && res.success) {
          loadDashboardData();
        } else {
          alert('Failed to delete broadcast.');
        }
      } catch (e) {
        alert('Error deleting broadcast notice.');
      }
    };

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Auto-refresh data every 15 seconds
    setInterval(() => {
      if (currentAdminPin) loadDashboardData();
    }, 15000);

    // Initial check on load
    checkPinAndInit();
  </script>
</body>
</html>`;
}
