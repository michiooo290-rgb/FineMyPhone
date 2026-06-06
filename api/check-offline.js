// api/check-offline.js
// Dijalankan otomatis tiap 5 menit via Vercel Cron Jobs
// Cek HP yang tidak update lokasi lebih dari 15 menit, kirim alert Discord

import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const OFFLINE_THRESHOLD_MENIT = 15;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = new Date();
    const threshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MENIT * 60 * 1000);

    // Ambil semua device aktif beserta lokasi terakhirnya
    const { data: devices, error } = await db
      .from('devices')
      .select(`
        id, nama, model, user_id,
        locations (lat, lng, battery, timestamp)
      `)
      .eq('aktif', true)
      .order('timestamp', { referencedTable: 'locations', ascending: false })
      .limit(1, { referencedTable: 'locations' });

    if (error) throw error;

    for (const device of devices) {
      const lastLoc = device.locations?.[0];
      if (!lastLoc) continue;

      const lastUpdate = new Date(lastLoc.timestamp);
      const isOffline = lastUpdate < threshold;

      if (!isOffline) continue;

      // Cek apakah sudah kirim alert dalam 30 menit terakhir (anti spam)
      const { data: recentAlert } = await db
        .from('alert_log')
        .select('id')
        .eq('device_id', device.id)
        .eq('type', 'offline')
        .gte('created_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString())
        .single();

      if (recentAlert) continue; // Skip, sudah alert baru-baru ini

      // Hitung berapa menit offline
      const menitOffline = Math.floor((now - lastUpdate) / 60000);
      const googleMapsUrl = `https://maps.google.com/?q=${lastLoc.lat},${lastLoc.lng}`;

      // Kirim Discord alert
      await sendDiscordAlert({
        title: `📵 HP Offline — ${device.nama}`,
        color: 0xEF4444, // merah
        fields: [
          { name: '📱 Perangkat', value: `${device.nama} (${device.model})`, inline: true },
          { name: '⏱️ Offline sejak', value: `${menitOffline} menit lalu`, inline: true },
          { name: '🔋 Baterai terakhir', value: `${lastLoc.battery ?? '?'}%`, inline: true },
          { name: '📍 Lokasi terakhir', value: `[Lihat di Google Maps](${googleMapsUrl})`, inline: false },
          { name: '🕐 Terakhir aktif', value: lastUpdate.toLocaleString('id-ID'), inline: false },
        ]
      });

      // Catat ke alert_log supaya tidak spam
      await db.from('alert_log').insert({
        device_id: device.id,
        type: 'offline',
        created_at: now.toISOString()
      });
    }

    res.status(200).json({ ok: true, checked: devices.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function sendDiscordAlert({ title, color, fields }) {
  await fetch(DISCORD_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title,
        color,
        fields,
        footer: { text: 'FindMyPhone Alert System' },
        timestamp: new Date().toISOString()
      }]
    })
  });
}
