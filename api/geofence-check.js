// api/geofence-check.js
// Dipanggil dari tracker.html setiap kirim lokasi baru
// Cek apakah HP keluar dari zona aman (geofence)

import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

// Formula Haversine — hitung jarak antara 2 koordinat (meter)
function hitungJarak(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radius bumi dalam meter
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { device_id, lat, lng } = req.body;
    if (!device_id || lat == null || lng == null) return res.status(400).json({ error: 'Data tidak lengkap' });

    // Ambil info device (hanya yang aktif)
    const { data: device } = await db
      .from('devices')
      .select('nama, model')
      .eq('id', device_id)
      .eq('aktif', true)
      .single();

    if (!device) return res.status(404).json({ error: 'Device tidak ditemukan' });

    // Ambil semua geofence aktif untuk device ini
    const { data: geofences } = await db
      .from('geofences')
      .select('*')
      .eq('device_id', device_id)
      .eq('aktif', true);

    if (!geofences?.length) return res.status(200).json({ ok: true, geofences: 0 });

    const now = new Date();
    const alerts = [];

    for (const zone of geofences) {
      const jarak = hitungJarak(lat, lng, zone.lat_pusat, zone.lng_pusat);
      const diLuar = jarak > zone.radius_meter;

      if (!diLuar) continue;

      // Cek sudah kirim alert zona ini dalam 30 menit?
      const { data: recentAlert } = await db
        .from('alert_log')
        .select('id')
        .eq('device_id', device_id)
        .eq('type', `geofence_${zone.id}`)
        .gte('created_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString())
        .single();

      if (recentAlert) continue;

      const googleMapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

      // Kirim Discord alert geofence
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: `🚨 HP Keluar Zona — ${device.nama}`,
            color: 0xF97316, // oranye
            fields: [
              { name: '📱 Perangkat', value: `${device.nama} (${device.model})`, inline: true },
              { name: '📌 Zona aman', value: zone.nama, inline: true },
              { name: '📏 Jarak dari zona', value: `${Math.round(jarak)} meter`, inline: true },
              { name: '📍 Posisi saat ini', value: `[Lihat di Google Maps](${googleMapsUrl})`, inline: false },
            ],
            footer: { text: 'FindMyPhone Alert System' },
            timestamp: now.toISOString()
          }]
        })
      });

      // Catat alert
      await db.from('alert_log').insert({
        device_id,
        type: `geofence_${zone.id}`,
        created_at: now.toISOString()
      });

      alerts.push(zone.nama);
    }

    res.status(200).json({ ok: true, alerts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
