/* public/js/ui.js */

/**
 * Mencegah serangan Stored XSS dengan escaping karakter HTML
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function showLockedUI() {
    document.getElementById('lock-section').style.display = 'block';
    document.getElementById('app-section').style.display = 'none';
    document.getElementById('top-navbar').style.display = 'none';
}

export function showUnlockedUI() {
    document.getElementById('lock-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    document.getElementById('top-navbar').style.display = 'flex';
}

/**
 * Merender tombol di Top Navbar secara dinamis berdasarkan Mode
 */
export function renderTopNavbar(activeMode, selectedNoteIndex) {
    const btnGroup = document.getElementById('navbar-buttons');
    btnGroup.innerHTML = '';

    if (activeMode === 'LIST') {
        if (selectedNoteIndex !== null) {
            btnGroup.innerHTML = `
                <button type="button" id="btn-nav-read">[Baca]</button>
                <button type="button" id="btn-nav-edit">[Edit]</button>
                <button type="button" id="btn-nav-delete">[Hapus]</button>
                <button type="button" id="btn-nav-clear">[Batal Pilih]</button>
            `;
        } else {
            btnGroup.innerHTML = `
                <button type="button" id="btn-nav-new">+ Catatan Baru</button>
                <button type="button" id="btn-nav-refresh">Refresh</button>
            `;
        }
    } else if (activeMode === 'EDITING') {
        btnGroup.innerHTML = `
            <button type="button" id="btn-nav-apply">Apply</button>
            <button type="button" id="btn-nav-save-exit">Save & Exit</button>
            <button type="button" id="btn-nav-reset">Reset</button>
            <button type="button" id="btn-nav-cancel">Batal</button>
        `;
    } else if (activeMode === 'VIEWING') {
        btnGroup.innerHTML = `
            <button type="button" id="btn-nav-edit">Edit Catatan Ini</button>
            <button type="button" id="btn-nav-delete">Hapus Catatan Ini</button>
            <button type="button" id="btn-nav-close">Tutup Detail</button>
        `;
    }
}

/**
 * Mengatur visibilitas fieldset (Editor, Viewer, List) berdasarkan Mode
 */
export function switchModeUI(newMode) {
    const editorFieldset = document.getElementById('editor-fieldset');
    const editorBr = document.getElementById('editor-br');
    const viewerFieldset = document.getElementById('viewer-fieldset');
    const viewerBr = document.getElementById('viewer-br');

    if (newMode === 'LIST') {
        editorFieldset.style.display = 'none';
        editorBr.style.display = 'none';
        viewerFieldset.style.display = 'none';
        viewerBr.style.display = 'none';
    } else if (newMode === 'EDITING') {
        editorFieldset.style.display = 'block';
        editorBr.style.display = 'block';
        viewerFieldset.style.display = 'none';
        viewerBr.style.display = 'none';
        window.scrollTo({ top: editorFieldset.offsetTop - 60, behavior: 'smooth' });
    } else if (newMode === 'VIEWING') {
        editorFieldset.style.display = 'none';
        editorBr.style.display = 'none';
        viewerFieldset.style.display = 'block';
        viewerBr.style.display = 'block';
        window.scrollTo({ top: viewerFieldset.offsetTop - 60, behavior: 'smooth' });
    }
}

/**
 * Merender baris tabel catatan & menghitung pagination
 */
export function renderNotesTable(filteredNotes, cachedNotes, selectedNoteIndex, currentPage, itemsPerPage) {
    const tbody = document.getElementById('notes-list');
    tbody.innerHTML = '';

    if (filteredNotes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Tidak ada catatan yang ditemukan.</td></tr>';
        document.getElementById('pagination-info').textContent = 'Halaman 0 dari 0';
        document.getElementById('btn-prev-page').disabled = true;
        document.getElementById('btn-next-page').disabled = true;
        return;
    }

    const totalPages = Math.ceil(filteredNotes.length / itemsPerPage) || 1;
    const validPage = currentPage > totalPages ? totalPages : currentPage;

    const startIndex = (validPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedNotes = filteredNotes.slice(startIndex, endIndex);

    paginatedNotes.forEach((note) => {
        const globalIndex = cachedNotes.findIndex(c => c.id === note.id);
        const isSelected = (selectedNoteIndex === globalIndex);

        const tr = document.createElement('tr');
        if (isSelected) tr.className = 'active-row';

        tr.innerHTML = `
            <td><code>${note.id}</code></td>
            <td>${escapeHtml(note.title)}</td>
            <td>${escapeHtml(note.tags || '-')}</td>
            <td>${escapeHtml(note.updated_at || note.created_at || '-')}</td>
            <td>
                <button type="button" class="btn-select-row" data-index="${globalIndex}">${isSelected ? '✓ Selected' : 'Pilih'}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('pagination-info').textContent = `Halaman ${validPage} dari ${totalPages} (Total: ${filteredNotes.length} Catatan)`;
    document.getElementById('btn-prev-page').disabled = (validPage === 1);
    document.getElementById('btn-next-page').disabled = (validPage === totalPages);
}

/**
 * Mengambil nilai input dari form editor
 */
export function getFormData() {
    return {
        id: document.getElementById('note-id').value,
        title: document.getElementById('note-title').value.trim(),
        body: document.getElementById('note-body').value.trim(),
        tags: document.getElementById('note-tags').value.trim()
    };
}

/**
 * Mengisi input form editor dengan data
 */
export function setFormData({ id = '', title = '', body = '', tags = '' }, legendText = "Buat Catatan Baru") {
    document.getElementById('note-id').value = id;
    document.getElementById('note-title').value = title;
    document.getElementById('note-body').value = body;
    document.getElementById('note-tags').value = tags;
    document.getElementById('form-legend').textContent = legendText;
}

/**
 * Mengisi detail catatan ke komponen viewer
 */
export function setViewerData(note) {
    document.getElementById('view-title').textContent = note.title || '';
    document.getElementById('view-body').textContent = note.body || '';
    document.getElementById('view-tags').textContent = note.tags || '-';
    document.getElementById('view-date').textContent = note.updated_at || note.created_at || '-';
    document.getElementById('view-uuid').textContent = note.id || '';
}

/**
 * Merender Baris Tabel Log Aktivitas (Max LOG_LIMIT baris) + Hostname/Device + Total Count
 */
export function renderLogsTable(logs, totalCount = 0) {
    const tbody = document.getElementById('logs-list');
    const elTotal = document.getElementById('logs-total-info');
    tbody.innerHTML = '';

    if (elTotal) {
        elTotal.textContent = `Total Log: ${totalCount} Data`;
    }

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">Belum ada log aktivitas tersimpan.</td></tr>';
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(log.created_at || '-')}</td>
            <td><strong>${escapeHtml(log.action_type)}</strong></td>
            <td><code>${log.note_id ? escapeHtml(log.note_id) : '-'}</code></td>
            <td>${escapeHtml(log.hostname || 'Unknown Device')}</td>
            <td>${escapeHtml(log.ip_address || '-')} (${escapeHtml(log.region || 'Local')})</td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Merender Informasi Footer (Resolusi, Jam Realtime, IP, & Latency Ping)
 */
export function renderFooterMetrics({ viewportRes, screenRes, datetimeStr, epochMs, ip, region, pingMs, statusClass }) {
    const elRes = document.getElementById('footer-resolution');
    const elTime = document.getElementById('footer-datetime');
    const elGeo = document.getElementById('footer-geo');
    const elPing = document.getElementById('footer-ping');

    if (elRes) elRes.textContent = `${viewportRes} (Screen: ${screenRes})`;
    if (elTime) elTime.textContent = `${datetimeStr} (${epochMs} ms)`;
    if (elGeo && ip) elGeo.textContent = `IP: ${ip} (${region || 'Unknown'})`;
    
    if (elPing) {
        elPing.innerHTML = `<span class="status-dot ${statusClass}"></span> API ${pingMs !== null ? pingMs + ' ms' : 'Offline'}`;
    }
}