import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // 1. Pengaturan Header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  // Tangani Request Preflight OPTIONS dari Browser
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Inisialisasi Koneksi Neon (Mengambil Connection String dari Vercel Environment Variable)
  const sql = neon(process.env.DATABASE_URL);

  // 3. Ambil parameter 'action' dan 'id' dari Query URL atau Body Request
  const { action, id: queryId } = req.query || {};
  const body = req.body || {};
  const targetId = queryId || body.id;

  try {
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

      // GET /api?action=get_note_by_id&id=X
      case 'get_note_by_id': {
        if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        if (!targetId) return res.status(400).json({ status: 'error', message: 'Missing parameter: id' });

        const [note] = await sql`
          SELECT id, encrypted_title, encrypted_body, iv, tags, created_at, updated_at 
          FROM notes 
          WHERE id = ${targetId}
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
              tags = ${tags || null}
          WHERE id = ${targetId}
          RETURNING id
        `;

        if (updated.length === 0) return res.status(404).json({ status: 'error', message: 'Note not found or no changes made' });
        return res.status(200).json({ status: 'success', message: 'Note updated', data: { id: targetId } });
      }

      // DELETE /api?action=delete_note atau POST /api?action=delete_note
      case 'delete_note': {
        if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
        if (!targetId) return res.status(400).json({ status: 'error', message: 'Missing parameter: id' });

        const deleted = await sql`DELETE FROM notes WHERE id = ${targetId} RETURNING id`;
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