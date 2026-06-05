// api/check-battery.js
// Dipanggil dari tracker.html saat baterai < 10%
// Kirim alert Discord baterai kritis

import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { device_id, battery, lat, lng } = req.body;
    if (!device_id || battery == null) return res.status(400).json({ error: 'Data tidak lengkap' });

    // Ambil info device
    const { data: device } = await db
      .from('devices')
      .select('nama, model')
      .eq('id', device_id)
      .single();

    if (!device) return res.status(404).json({ error: 'Device tidak ditemukan' });

    // Cek sudah kirim alert baterai dalam 1 jam terakhir? (anti spam)
    const { data: recentAlert } = await db
      .from('alert_log')
      .select('id')
      .eq('device_id', device_id)
      .eq('type', 'battery')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .single();

    if (recentAlert) return res.status(200).json({ ok: true, skipped: true });

    const googleMapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;

    // Kirim Discord alert baterai kritis
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `🪫 Baterai Kritis — ${device.nama}`,
          color: 0xF59E0B, // kuning
          fields: [
            { name: '📱 Perangkat', value: `${device.nama} (${device.model})`, inline: true },
            { name: '🔋 Baterai', value: `${battery}% — kritis!`, inline: true },
            ...(googleMapsUrl ? [{ name: '📍 Lokasi saat ini', value: `[Lihat di Google Maps](${googleMapsUrl})`, inline: false }] : []),
          ],
          footer: { text: 'FindMyPhone Alert System' },
          timestamp: new Date().toISOString()
        }]
      })
    });

    // Catat ke alert_log
    await db.from('alert_log').insert({
      device_id,
      type: 'battery',
      created_at: new Date().toISOString()
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
