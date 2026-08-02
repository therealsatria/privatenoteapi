/* public/js/api.js */

const API_URL = '/api';

/**
 * PING Endpoint: Memeriksa latensi API, mendapatkan IP Address & Region
 */
export async function pingApi() {
    const response = await fetch(`${API_URL}?action=ping`);
    if (!response.ok) throw new Error('API Unreachable');
    const result = await response.json();
    if (result.status === 'error') throw new Error(result.message);
    return result.data;
}

/**
 * Mengambil seluruh daftar catatan terenkripsi dari server
 */
export async function fetchNotesApi() {
    const response = await fetch(`${API_URL}?action=get_notes`);
    if (!response.ok) throw new Error('Gagal mengambil data dari API Vercel');
    const result = await response.json();
    if (result.status === 'error') throw new Error(result.message);
    return result.data || [];
}

/**
 * Mengirim catatan terenkripsi baru ke server
 */
export async function createNoteApi(payload) {
    const response = await fetch(`${API_URL}?action=create_note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.status === 'error') {
        throw new Error(result.message || "Gagal menyimpan catatan baru.");
    }
    return result.data;
}

/**
 * Memperbarui catatan terenkripsi di server berdasarkan ID (UUID)
 */
export async function updateNoteApi(payload) {
    const response = await fetch(`${API_URL}?action=update_note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.status === 'error') {
        throw new Error(result.message || "Gagal memperbarui catatan.");
    }
    return result.data;
}

/**
 * Menghapus catatan di server berdasarkan ID (UUID)
 */
export async function deleteNoteApi(id) {
    const response = await fetch(`${API_URL}?action=delete_note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    });
    const result = await response.json();
    if (!response.ok || result.status === 'error') {
        throw new Error(result.message || "Gagal menghapus catatan.");
    }
    return result.data;
}

/**
 * Mengambil N log aktivitas terbaru
 */
export async function fetchLogsApi(limit = 3) {
    const response = await fetch(`${API_URL}?action=get_logs&limit=${limit}`);
    if (!response.ok) throw new Error('Gagal mengambil data log');
    const result = await response.json();
    if (result.status === 'error') throw new Error(result.message);
    return result.data || [];
}

/**
 * Menghapus seluruh log aktivitas secara manual
 */
export async function clearLogsApi() {
    const response = await fetch(`${API_URL}?action=clear_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    const result = await response.json();
    if (!response.ok || result.status === 'error') {
        throw new Error(result.message || "Gagal membersihkan log.");
    }
    return result.data;
}