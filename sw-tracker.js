// sw-tracker.js — Service Worker untuk FindMyPhone Tracker
// Letakkan di ROOT folder project (sejajar index.html)

const SW_VERSION = '1.1.0';
const CACHE_NAME = 'tracker-v1';
const PENDING_CACHE = 'pending-locations';

let trackerConfig = null;
let isActive = false;

// =====================
// LIFECYCLE
// =====================
self.addEventListener('install', (event) => {
  // Langsung aktifkan tanpa menunggu tab lama tutup
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Hapus cache lama
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_NAME && k !== PENDING_CACHE)
            .map(k => caches.delete(k))
        )
      )
    ])
  );
});

// =====================
// PESAN DARI HALAMAN
// =====================
self.addEventListener('message', (event) => {
  const { type, config, location } = event.data || {};

  if (type === 'INIT_TRACKER') {
    trackerConfig = config;
    isActive = true;
    console.log('[SW] Config diterima, device:', config?.deviceId);
  }

  if (type === 'SEND_LOCATION' && isActive) {
    // Kirim lokasi dari SW sebagai backup
    event.waitUntil(
      sendLocationFromSW(location).then((ok) => {
        if (ok) {
          // Balas ke halaman bahwa lokasi terkirim via SW
          event.source?.postMessage({ type: 'SW_LOCATION_SENT' });
        }
      })
    );
  }

  if (type === 'STOP_TRACKER') {
    isActive = false;
    console.log('[SW] Tracker dihentikan');
  }
});

// =====================
// BACKGROUND SYNC
// =====================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-locations') {
    event.waitUntil(syncPendingLocations());
  }
});

// Periodic Background Sync (Chrome Android, perlu izin)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'tracker-keepalive') {
    event.waitUntil(notifyClients());
  }
});

// =====================
// FETCH (cache tracker assets)
// =====================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip: bukan origin sendiri atau cross-origin (Supabase, fonts, dll)
  if (url.origin !== self.location.origin) return;

  // Skip: API calls — jangan di-cache
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first untuk JS assets
  if (url.pathname.startsWith('/js/') || url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first untuk halaman HTML (tracker.html, dll)
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});

// =====================
// KIRIM LOKASI VIA SW
// =====================
async function sendLocationFromSW(location) {
  if (!trackerConfig || !location) return false;

  const payload = {
    device_id: trackerConfig.deviceId,
    lat: location.lat,
    lng: location.lng,
    accuracy: location.accuracy || null,
    speed: location.speed || null,
    battery: location.battery || null,
    timestamp: new Date().toISOString()
  };

  try {
    const response = await fetch(
      `${trackerConfig.supabaseUrl}/rest/v1/locations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': trackerConfig.supabaseKey,
          'Authorization': `Bearer ${trackerConfig.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      await savePendingLocation(payload);
      return false;
    }
    return true;
  } catch (e) {
    // Offline — simpan ke pending cache
    await savePendingLocation(payload);
    return false;
  }
}

// =====================
// PENDING LOCATIONS (IndexedDB-like via Cache API)
// =====================
async function savePendingLocation(location) {
  try {
    const cache = await caches.open(PENDING_CACHE);
    const key = `loc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await cache.put(
      new Request(key),
      new Response(JSON.stringify(location), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch (e) {
    console.warn('[SW] Gagal simpan pending:', e);
  }
}

async function syncPendingLocations() {
  if (!trackerConfig) return;

  let cache;
  try {
    cache = await caches.open(PENDING_CACHE);
  } catch (e) { return; }

  const keys = await cache.keys();
  if (!keys.length) return;

  console.log(`[SW] Sync ${keys.length} pending locations...`);

  for (const request of keys) {
    try {
      const response = await cache.match(request);
      const location = await response.json();

      const result = await fetch(
        `${trackerConfig.supabaseUrl}/rest/v1/locations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': trackerConfig.supabaseKey,
            'Authorization': `Bearer ${trackerConfig.supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(location)
        }
      );

      if (result.ok) {
        await cache.delete(request);
      }
    } catch (e) {
      // Tetap di cache, coba lagi nanti saat online
    }
  }

  // Notify clients bahwa sync selesai
  await notifyClients({ type: 'SYNC_COMPLETE' });
}

// =====================
// NOTIFY CLIENTS
// =====================
async function notifyClients(message = { type: 'KEEPALIVE' }) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}