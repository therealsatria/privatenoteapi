/* public/js/ui.js */

// Daftar Preset Tag Default
export const PRESET_TAGS = ['akun', 'todo', 'pribadi', 'kerja', 'umum'];

// Daftar Emoticon Random
const EMOJI_LIST = [
    '📌', '📍', '🔹', '🔸', '➡️', '➔', '📝', '✍️', '✅', '☑️', 
    '⏳', '⏰', '💡', '📅', '🗓️', '🏷️', '📂', '📁', '⚠️', '🚨', 
    '✨', '🌟', '☕', '🔒', '🔥', '💧', '⚡', '🧊', '🌪️', '💥', 
    '🚀', '🎯', '💎', '💣', '🪩'
];

// Konfigurasi Maksimal Baris Terminal Layar
const MAX_TERMINAL_LOGS = 50;
let isConsoleIntercepted = false;

/**
 * Interceptor untuk menduplikasi console.log/warn/error ke Terminal Monitor Layar
 */
export function setupConsoleInterceptor() {
    if (isConsoleIntercepted) return;
    isConsoleIntercepted = true;

    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    console.log = function(...args) {
        origLog.apply(console, args);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        appendTerminalLine(msg, 'info');
    };

    console.warn = function(...args) {
        origWarn.apply(console, args);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        appendTerminalLine(msg, 'warn');
    };

    console.error = function(...args) {
        origError.apply(console, args);
        const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        appendTerminalLine(msg, 'error');
    };
}

/**
 * Menambahkan baris log baru ke Terminal Monitor UI
 */
export function appendTerminalLine(message, type = 'info') {
    const terminal = document.getElementById('terminal-screen');
    if (!terminal) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `[${hours}:${minutes}:${seconds}]`;

    const div = document.createElement('div');
    div.className = `terminal-line ${type}`;
    div.textContent = `${timeStr} ${message}`;

    terminal.appendChild(div);

    while (terminal.children.length > MAX_TERMINAL_LOGS) {
        terminal.removeChild(terminal.firstChild);
    }

    terminal.scrollTop = terminal.scrollHeight;
}

/**
 * Membersihkan layar terminal
 */
export function clearTerminalScreen() {
    const terminal = document.getElementById('terminal-screen');
    if (terminal) terminal.innerHTML = '';
}

/**
 * Mengambil 1 emoji secara acak dari daftar EMOJI_LIST
 */
export function getRandomEmoji() {
    const randomIndex = Math.floor(Math.random() * EMOJI_LIST.length);
    return EMOJI_LIST[randomIndex];
}

/**
 * Menghapus emoji lama yang berada di deretan paling kiri judul
 */
export function stripLeadingEmoji(title) {
    if (!title) return '';
    let trimmed = title.trimStart();
    for (const emoji of EMOJI_LIST) {
        if (trimmed.startsWith(emoji)) {
            trimmed = trimmed.slice(emoji.length).trimStart();
            break;
        }
    }
    return trimmed;
}

/**
 * Menyiapkan dan menyisipkan tombol Generator Emoji [🎲] persis di sebelah kiri input judul
 */
function injectEmojiButton() {
    const titleInput = document.getElementById('note-title');
    if (!titleInput) return;

    let emojiBtn = document.getElementById('btn-random-emoji');
    if (!emojiBtn) {
        emojiBtn = document.createElement('button');
        emojiBtn.type = 'button';
        emojiBtn.id = 'btn-random-emoji';
        emojiBtn.title = 'Ganti Emoji Random';
        emojiBtn.textContent = '🎲';
        emojiBtn.style.padding = '8px 12px';
        emojiBtn.style.cursor = 'pointer';
        emojiBtn.style.fontWeight = 'bold';
        emojiBtn.style.whiteSpace = 'nowrap';

        const flexGroup = document.createElement('div');
        flexGroup.style.display = 'flex';
        flexGroup.style.alignItems = 'center';
        flexGroup.style.gap = '6px';
        flexGroup.style.width = '100%';

        titleInput.parentNode.insertBefore(flexGroup, titleInput);
        flexGroup.appendChild(emojiBtn);
        flexGroup.appendChild(titleInput);

        titleInput.style.flex = '1';

        emojiBtn.addEventListener('click', () => {
            console.log("[UI Click] Tombol Generator Emoji [🎲] diklik");
            const currentTitle = titleInput.value;
            const cleanTitle = stripLeadingEmoji(currentTitle);
            const newEmoji = getRandomEmoji();
            titleInput.value = `${newEmoji} ${cleanTitle}`;
            titleInput.focus();
        });
    }
}

/**
 * Merender Tombol Preset Tag di Form Editor
 */
export function renderEditorTagPresets() {
    const container = document.getElementById('editor-tag-presets');
    if (!container) return;

    container.innerHTML = '';
    PRESET_TAGS.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-btn editor-tag-btn';
        btn.setAttribute('data-tag', tag);
        btn.textContent = `#${tag}`;
        container.appendChild(btn);
    });

    updateEditorTagButtonStates();
}

/**
 * Memperbarui status tombol tag aktif (biru) jika tag tersebut ada di input teks #note-tags
 */
export function updateEditorTagButtonStates() {
    const tagsInput = document.getElementById('note-tags');
    if (!tagsInput) return;

    const currentTags = tagsInput.value
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

    const buttons = document.querySelectorAll('.editor-tag-btn');
    buttons.forEach(btn => {
        const tag = btn.getAttribute('data-tag').toLowerCase();
        if (currentTags.includes(tag)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Toggle (Tambah / Hapus) tag pada kolom input teks #note-tags saat tombol preset diklik
 */
export function toggleTagInInput(tag) {
    const tagsInput = document.getElementById('note-tags');
    if (!tagsInput) return;

    let currentTags = tagsInput.value
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);

    const lowerTag = tag.toLowerCase();
    if (currentTags.includes(lowerTag)) {
        currentTags = currentTags.filter(t => t !== lowerTag);
    } else {
        currentTags.push(lowerTag);
    }

    tagsInput.value = currentTags.join(', ');
    updateEditorTagButtonStates();
}

/**
 * Merender Tombol Filter Tag di Atas Tabel Daftar Catatan
 */
export function renderListTagFilters(activeFilterTag) {
    const container = document.getElementById('list-tag-filter-buttons');
    if (!container) return;

    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `tag-btn filter-tag-btn ${!activeFilterTag ? 'active' : ''}`;
    allBtn.setAttribute('data-tag', '');
    allBtn.textContent = 'Semua Tag';
    container.appendChild(allBtn);

    PRESET_TAGS.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `tag-btn filter-tag-btn ${activeFilterTag === tag ? 'active' : ''}`;
        btn.setAttribute('data-tag', tag);
        btn.textContent = `#${tag}`;
        container.appendChild(btn);
    });
}

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

/**
 * Penyesuaian tinggi textarea secara otomatis mengikuti isi teks ketikan
 */
export function autoExpandTextarea(element) {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = Math.max(160, element.scrollHeight) + 'px';
}

/**
 * Pengunci status tombol Simpan saat proses async sedang berjalan
 */
export function setSaveButtonsLoading(isLoading) {
    const btnApply = document.getElementById('btn-editor-apply');
    const btnSaveExit = document.getElementById('btn-editor-save-exit');

    if (btnApply) {
        btnApply.disabled = isLoading;
        btnApply.textContent = isLoading ? 'Saving...' : 'Apply';
    }
    if (btnSaveExit) {
        btnSaveExit.disabled = isLoading;
        btnSaveExit.textContent = isLoading ? 'Saving...' : 'Save & Exit';
    }
}

export function showLockedUI() {
    document.getElementById('lock-section').style.display = 'block';
    document.getElementById('app-section').style.display = 'none';
    document.getElementById('top-navbar').style.display = 'none';

    const storedGatewayKey = sessionStorage.getItem('private_notes_gateway_key');
    const gatewayInput = document.getElementById('gateway-key-input');
    if (gatewayInput && storedGatewayKey) {
        gatewayInput.value = storedGatewayKey;
    }
}

export function showUnlockedUI() {
    document.getElementById('lock-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    document.getElementById('top-navbar').style.display = 'flex';
}

/**
 * Merender Top Sticky Navbar sebagai Global Header & Sesi Kontrol
 */
export function renderTopNavbar() {
    const btnGroup = document.getElementById('navbar-buttons');
    if (!btnGroup) return;
    
    btnGroup.innerHTML = `
        <button type="button" id="btn-top-change-key">Change Key</button>
        <button type="button" id="btn-top-lock-key">Lock Vault</button>
    `;
}

/**
 * Mengatur visibilitas fieldset (Editor, Viewer, List) berdasarkan Mode
 */
export function switchModeUI(newMode) {
    console.log(`[UI] Perubahan Mode Tampilan -> ${newMode}`);
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

        injectEmojiButton();
        renderEditorTagPresets();

        window.scrollTo({ top: editorFieldset.offsetTop - 60, behavior: 'smooth' });
        
        const bodyTextarea = document.getElementById('note-body');
        if (bodyTextarea) autoExpandTextarea(bodyTextarea);
    } else if (newMode === 'VIEWING') {
        editorFieldset.style.display = 'none';
        editorBr.style.display = 'none';
        viewerFieldset.style.display = 'block';
        viewerBr.style.display = 'block';
        window.scrollTo({ top: viewerFieldset.offsetTop - 60, behavior: 'smooth' });
    }
}

/**
 * Merender baris tabel catatan dengan Icon Aksi (👁️ ✏️ 🗑️) & Pagination
 */
export function renderNotesTable(filteredNotes, cachedNotes, currentPage, itemsPerPage) {
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

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td style='display:none;'><code>${note.id}</code></td>
            <td>${escapeHtml(note.title)}</td>
            <td><code>${escapeHtml(note.tags || '-')}</code></td>
            <td>${escapeHtml(note.updated_at || note.created_at || '-')}</td>
            <td>
                <div class="action-icon-group">
                    <button type="button" class="action-icon-btn btn-row-read" data-index="${globalIndex}" title="Baca Detail">👁️</button>
                    <button type="button" class="action-icon-btn btn-row-edit" data-index="${globalIndex}" title="Edit Catatan">✏️</button>
                    <button type="button" class="action-icon-btn btn-row-delete" data-index="${globalIndex}" title="Hapus Catatan">🗑️</button>
                </div>
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
 * Mengisi input form editor dengan data & auto-expand tinggi textarea
 */
export function setFormData({ id = '', title = '', body = '', tags = '' }, legendText = "Buat Catatan Baru") {
    document.getElementById('note-id').value = id;
    
    const titleInput = document.getElementById('note-title');
    if (!id && !title) {
        titleInput.value = `${getRandomEmoji()} `;
    } else {
        titleInput.value = title;
    }
    
    const bodyTextarea = document.getElementById('note-body');
    bodyTextarea.value = body;
    
    document.getElementById('note-tags').value = tags;
    document.getElementById('form-legend').textContent = legendText;

    injectEmojiButton();
    renderEditorTagPresets();
    autoExpandTextarea(bodyTextarea);
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