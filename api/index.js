import { neon } from '@neondatabase/serverless';

let isTableInitialized = false;

// IN-MEMORY RATE LIMITER (Solusi 3)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 30;              // Maksimal 30 request per menit per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // Jendela waktu 1 Menit (60.000 ms)

/**
 * Memeriksa apakah IP Address tertentu melebihi batas request
 */
function isRateLimitExceeded(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count += 1;
  }

  rateLimitMap.set(ip, record);
  return record.count > RATE_LIMIT_MAX;
}

/**
 * Membuat tabel 'notes' & 'logs' serta menambahkan kolom 'hostname' jika belum ada
 */
async function ensureTableExists(sql) {
  if (isTableInitialized) return;

  // Tabel Catatan Terenkripsi
  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      encrypted_title TEXT NOT NULL,
      encrypted_body TEXT NOT NULL,
      iv TEXT NOT NULL,
      tags TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // Tabel Log Aktivitas
  await sql`
    CREATE TABLE IF NOT EXISTS logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id UUID NULL,
      action_type TEXT NOT NULL,
      ip_address TEXT,
      region TEXT,
      hostname TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    ALTER TABLE logs ADD COLUMN IF NOT EXISTS hostname TEXT;
  `;

  isTableInitialized = true;
}

/**
 * Parser ringkas untuk mendeteksi Browser & Sistem Operasi dari User-Agent
 */
function parseUserAgent(ua) {
  if (!ua) return 'Unknown Device';
  
  let browser = 'Browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'OS';
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} on ${os}`;
}

/**
 * Membaca IP Address, Region, dan Hostname/Device Info dari Request Vercel Edge
 */
function getClientGeoAndHostInfo(req) {
  const ip = req.headers['x-real-ip'] || 
             (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : '127.0.0.1');
  
  const city = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : '';
  const country = req.headers['x-vercel-ip-country'] || '';
  const regionCode = req.headers['x-vercel-ip-country-region'] || '';

  const regionParts = [city, regionCode, country].filter(Boolean);
  const region = regionParts.length > 0 ? regionParts.join(', ') : 'Local / Unknown';

  const host = req.headers['host'] || 'localhost';
  const ua = req.headers['user-agent'] || '';
  const deviceInfo = parseUserAgent(ua);
  
  const hostname = `${host} (${deviceInfo})`;

  return { ip, region, hostname };
}

/**
 * Mencatat Aktivitas ke Tabel Logs & Menjalankan Lazy Cleanup (>3 Bulan)
 */
async function logActivity(sql, req, actionType, noteId = null) {
  try {
    const { ip, region, hostname } = getClientGeoAndHostInfo(req);

    await sql`
      INSERT INTO logs (note_id, action_type, ip_address, region, hostname)
      VALUES (${noteId ? noteId : null}, ${actionType}, ${ip}, ${region}, ${hostname})
    `;

    await sql`
      DELETE FROM logs WHERE created_at < NOW() - INTERVAL '3 months'
    `;
  } catch (err) {
    console.error("Gagal mencatat log aktivitas:", err);
  }
}

export default async function handler(req, res) {
  // Header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-gateway-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientGeo = getClientGeoAndHostInfo(req);

  // --------------------------------------------------------------------------
  // SOLUSI 3: PROTEKSI RATE LIMITING (Max 30 Req/Menit per IP)
  // --------------------------------------------------------------------------
  if (isRateLimitExceeded(clientGeo.ip)) {
    return res.status(429).json({
      status: 'error',
      message: 'Too Many Requests: Batas maksimum request API (30x/menit) terlampaui. Silakan tunggu 1 menit.'
    });
  }

  // --------------------------------------------------------------------------
  // SOLUSI 2: PROTEKSI GATEWAY KEY (Hanya Diproses Jika GATEWAY_KEY Cocok)
  // --------------------------------------------------------------------------
  const expectedGatewayKey = process.env.GATEWAY_KEY;
  const clientGatewayKey = req.headers['x-gateway-key'] || req.query.gateway_key;

  // Jika GATEWAY_KEY di-set di Vercel Environment Variables, maka wajib dicocokkan!
  if (expectedGatewayKey && clientGatewayKey !== expectedGatewayKey) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: Gateway Key API tidak valid atau belum diisi.'
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureTableExists(sql);

    const { action, id: queryId, limit: queryLimit } = req.query || {};
    const body = req.body || {};
    const targetId = queryId || body.id;

    if (!action) {
      return res.status(200).json({
        status: 'success',
        message: 'Private Notes Zero-Knowledge API is running!',
        available_actions: ['ping', 'get_notes', 'get_note_by_id', 'create_note', 'update_note', 'delete_note', 'get_logs', 'clear_logs', 'log_vault_event']
      });
    }

    switch (action) {

      // ----------------------------------------------------------------------
      // ACTION: PING
      // ----------------------------------------------------------------------
      case 'ping': {
        return res.status(200).json({
          status: 'success',
          message: 'pong',
          data: {
            ip: clientGeo.ip,
            region: clientGeo.region,
            hostname: clientGeo.hostname,
            server_time: Date.now()
          }
        });
      }

      // ----------------------------------------------------------------------
      // ACTION: LOG VAULT EVENT
      // ----------------------------------------------------------------------
      case 'log_vault_event': {
        if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        
        const { event_type } = body;
        if (!event_type) return res.status(400).json({ status: 'error', message: 'Missing event_type' });

        await logActivity(sql, req, event_type, null);
        return res.status(200).json({ status: 'success', message: 'Vault event logged' });
      }

      // ----------------------------------------------------------------------
      // ACTION: GET NOTES
      // ----------------------------------------------------------------------
      case 'get_notes': {
        if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });

        const notes = await sql`
          SELECT id, encrypted_title, encrypted_body, iv, tags, created_at, updated_at 
          FROM notes 
          ORDER BY updated_at DESC
        `;
        return res.status(200).json({ status: 'success', message: 'Notes retrieved', data: notes });
      }

      // ----------------------------------------------------------------------
      // ACTION: CREATE NOTE
      // ----------------------------------------------------------------------
      case 'create_note': {
        if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });

        const { encrypted_title, encrypted_body, iv, tags } = body;
        if (!encrypted_title || !encrypted_body || !iv) {
          return res.status(400).json({ status: 'error', message: 'Payload incomplete' });
        }

        const [created] = await sql`
          INSERT INTO notes (encrypted_title, encrypted_body, iv, tags)
          VALUES (${encrypted_title}, ${encrypted_body}, ${iv}, ${tags || null})
          RETURNING id, created_at, updated_at
        `;

        await logActivity(sql, req, 'CREATE_NOTE', created.id);

        return res.status(201).json({ status: 'success', message: 'Note created', data: created });
      }

      // ----------------------------------------------------------------------
      // ACTION: UPDATE NOTE
      // ----------------------------------------------------------------------
      case 'update_note': {
        if (req.method !== 'PUT' && req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        if (!targetId) return res.status(400).json({ status: 'error', message: 'Missing parameter: id' });

        const { encrypted_title, encrypted_body, iv, tags } = body;
        if (!encrypted_title || !encrypted_body || !iv) {
          return res.status(400).json({ status: 'error', message: 'Payload incomplete' });
        }

        const updated = await sql`
          UPDATE notes
          SET encrypted_title = ${encrypted_title},
              encrypted_body = ${encrypted_body},
              iv = ${iv},
              tags = ${tags || null},
              updated_at = NOW()
          WHERE id = ${targetId}::uuid
          RETURNING id, updated_at
        `;

        if (updated.length === 0) return res.status(404).json({ status: 'error', message: 'Note not found' });

        await logActivity(sql, req, 'UPDATE_NOTE', targetId);

        return res.status(200).json({ status: 'success', message: 'Note updated', data: updated[0] });
      }

      // ----------------------------------------------------------------------
      // ACTION: DELETE NOTE
      // ----------------------------------------------------------------------
      case 'delete_note': {
        if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        if (!targetId) return res.status(400).json({ status: 'error', message: 'Missing parameter: id' });

        const deleted = await sql`DELETE FROM notes WHERE id = ${targetId}::uuid RETURNING id`;
        if (deleted.length === 0) return res.status(404).json({ status: 'error', message: 'Note not found' });

        await logActivity(sql, req, 'DELETE_NOTE', targetId);

        return res.status(200).json({ status: 'success', message: 'Note deleted', data: { id: targetId } });
      }

      // ----------------------------------------------------------------------
      // ACTION: GET LOGS
      // ----------------------------------------------------------------------
      case 'get_logs': {
        if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });

        const limitVal = parseInt(queryLimit || '3', 10);

        const logs = await sql`
          SELECT id, note_id, action_type, ip_address, region, hostname, created_at
          FROM logs
          ORDER BY created_at DESC
          LIMIT ${limitVal}
        `;

        const [{ count }] = await sql`SELECT COUNT(*) AS count FROM logs`;

        return res.status(200).json({ 
          status: 'success', 
          message: 'Logs retrieved', 
          data: {
            logs: logs,
            total: parseInt(count || '0', 10)
          } 
        });
      }

      // ----------------------------------------------------------------------
      // ACTION: CLEAR LOGS
      // ----------------------------------------------------------------------
      case 'clear_logs': {
        if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });

        await sql`DELETE FROM logs`;
        await logActivity(sql, req, 'CLEAR_LOGS', null);

        return res.status(200).json({ status: 'success', message: 'All logs cleared successfully' });
      }

      default:
        return res.status(400).json({ status: 'error', message: 'Invalid API action' });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}