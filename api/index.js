import { neon } from '@neondatabase/serverless';

// Flag memori untuk mencegah re-running DDL query pada warm serverless instance
let isTableInitialized = false;

/**
 * Membuat tabel dengan tipe data UUID jika belum ada di database Neon
 */
async function ensureTableExists(sql) {
  if (isTableInitialized) return;

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

  isTableInitialized = true;
}

export default async function handler(req, res) {
  // Pengaturan Header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Inisialisasi tabel otomatis (bila belum ada)
    await ensureTableExists(sql);

    const { action, id: queryId } = req.query || {};
    const body = req.body || {};
    const targetId = queryId || body.id;

    // Jika diakses langsung tanpa parameter action
    if (!action) {
      return res.status(200).json({
        status: 'success',
        message: 'Private Notes Zero-Knowledge API is running!',
        available_actions: ['get_notes', 'get_note_by_id', 'create_note', 'update_note', 'delete_note']
      });
    }

    switch (action) {

      // GET /api?action=get_notes
      case 'get_notes': {
        if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });

        const notes = await sql`
          SELECT id, encrypted_title, encrypted_body, iv, tags, created_at, updated_at 
          FROM notes 
          ORDER BY updated_at DESC
        `;
        return res.status(200).json({ status: 'success', message: 'Notes retrieved', data: notes });
      }

      // GET /api?action=get_note_by_id&id=UUID
      case 'get_note_by_id': {
        if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        if (!targetId) return res.status(400).json({ status: 'error', message: 'Missing parameter: id' });

        const [note] = await sql`
          SELECT id, encrypted_title, encrypted_body, iv, tags, created_at, updated_at 
          FROM notes 
          WHERE id = ${targetId}::uuid
        `;

        if (!note) return res.status(404).json({ status: 'error', message: 'Note not found' });
        return res.status(200).json({ status: 'success', message: 'Note retrieved', data: note });
      }

      // POST /api?action=create_note
      case 'create_note': {
        if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });

        const { encrypted_title, encrypted_body, iv, tags } = body;
        if (!encrypted_title || !encrypted_body || !iv) {
          return res.status(400).json({ status: 'error', message: 'Payload incomplete. encrypted_title, encrypted_body, and iv are required.' });
        }

        const [created] = await sql`
          INSERT INTO notes (encrypted_title, encrypted_body, iv, tags)
          VALUES (${encrypted_title}, ${encrypted_body}, ${iv}, ${tags || null})
          RETURNING id, created_at, updated_at
        `;

        return res.status(201).json({ status: 'success', message: 'Note created', data: created });
      }

      // PUT /api?action=update_note atau POST /api?action=update_note
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
        return res.status(200).json({ status: 'success', message: 'Note updated', data: updated[0] });
      }

      // DELETE /api?action=delete_note atau POST /api?action=delete_note
      case 'delete_note': {
        if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        if (!targetId) return res.status(400).json({ status: 'error', message: 'Missing parameter: id' });

        const deleted = await sql`DELETE FROM notes WHERE id = ${targetId}::uuid RETURNING id`;
        if (deleted.length === 0) return res.status(404).json({ status: 'error', message: 'Note not found' });

        return res.status(200).json({ status: 'success', message: 'Note deleted', data: { id: targetId } });
      }

      default:
        return res.status(400).json({ status: 'error', message: 'Invalid API action' });
    }
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
}