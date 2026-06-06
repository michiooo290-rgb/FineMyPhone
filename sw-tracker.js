// sw-tracker.js — Service Worker untuk FindMyPhone Tracker
// Menjaga tracking tetap jalan saat tab di-background

const SW_VERSION = '1.0.0';
let trackerConfig = null;

// Install — langsung aktifkan
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate — claim semua client
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Terima pesan dari tracker.html
self.addEventListener('message', (event) => {
  if (event.data.type === 'INIT_TRACKER') {
    trackerConfig = event.data.config;
  }

  if (event.data.type === 'SEND_LOCATION') {
    // Terima lokasi dari halaman dan kirim ke Supabase via SW
    event.waitUntil(sendLocationFromSW(event.data.location));
  }
});

// Background sync — kirim lokasi yang pending saat online kembali
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-locations') {
    event.waitUntil(syncPendingLocations());
  }
});

// Periodic background sync (jika didukung browser)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'tracker-keepalive') {
    event.waitUntil(notifyClients());
  }
});

// Fetch event — cache strategy untuk asset tracker
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Hanya intercept request ke origin sendiri
  if (url.origin !== self.location.origin) return;

  // Jangan intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // Network-first untuk halaman tracker
  if (url.pathname === '/tracker.html') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache halaman tracker untuk offline
          const clone = response.clone();
          caches.open('tracker-v1').then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});

// Kirim lokasi dari Service Worker (fallback jika halaman di-throttle)
async function sendLocationFromSW(location) {
  if (!trackerConfig) return;

  try {
    const response = await fetch(`${trackerConfig.supabaseUrl}/rest/v1/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': trackerConfig.supabaseKey,
        'Authorization': `Bearer ${trackerConfig.supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        device_id: trackerConfig.deviceId,
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
        speed: location.speed,
        battery: location.battery,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      // Simpan ke cache untuk sync nanti
      await savePendingLocation(location);
    }
  } catch (e) {
    await savePendingLocation(location);
  }
}

// Simpan lokasi pending di IndexedDB-like cache
async function savePendingLocation(location) {
  const cache = await caches.open('pending-locations');
  const key = `loc-${Date.now()}`;
  await cache.put(
    new Request(key),
    new Response(JSON.stringify(location))
  );
}

// Sync semua lokasi pending
async function syncPendingLocations() {
  if (!trackerConfig) return;

  const cache = await caches.open('pending-locations');
  const keys = await cache.keys();

  for (const request of keys) {
    try {
      const response = await cache.match(request);
      const location = await response.json();

      const result = await fetch(`${trackerConfig.supabaseUrl}/rest/v1/locations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': trackerConfig.supabaseKey,
          'Authorization': `Bearer ${trackerConfig.supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          device_id: trackerConfig.deviceId,
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          speed: location.speed,
          battery: location.battery,
          timestamp: location.timestamp || new Date().toISOString()
        })
      });

      if (result.ok) {
        await cache.delete(request);
      }
    } catch (e) {
      // Tetap di cache, coba lagi nanti
    }
  }
}

// Notify semua clients untuk tetap aktif
async function notifyClients() {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'KEEPALIVE' });
  }
}
