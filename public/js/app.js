/* public/js/app.js */

import { deriveKeyFromPassphrase, encryptNotePayload, decryptNotePayload } from './crypto.js';
import { 
    fetchNotesApi, 
    createNoteApi, 
    updateNoteApi, 
    deleteNoteApi, 
    pingApi, 
    fetchLogsApi, 
    clearLogsApi,
    logVaultEventApi
} from './api.js';

import { 
    showLockedUI, 
    showUnlockedUI, 
    renderTopNavbar, 
    switchModeUI, 
    renderNotesTable, 
    getFormData, 
    setFormData, 
    setViewerData,
    renderLogsTable,
    renderFooterMetrics,
    autoExpandTextarea,
    setSaveButtonsLoading,
    renderListTagFilters,
    toggleTagInInput,
    updateEditorTagButtonStates,
    setupConsoleInterceptor,
    clearTerminalScreen,
    downloadPlaintextJson
} from './ui.js';

// KONFIGURASI FLEKSIBEL: Jumlah baris log aktivitas yang ditampilkan
const LOG_LIMIT = 3; 

// Application State (RAM Only)
let currentCryptoKey = null;
let cachedNotes = [];
let filteredNotes = [];

let activeMode = 'LIST'; // Options: 'LIST' | 'EDITING' | 'VIEWING'
let activeNoteIndex = null;
let originalFormData = { title: '', body: '', tags: '' };

// Tag Filter State
let selectedFilterTag = ''; 

let currentPage = 1;
let itemsPerPage = 10;

// Geo & Ping State
let userIp = null;
let userRegion = null;
let pingTimer = null;
let clockTimer = null;
let lastPingMs = null;
let lastPingStatusClass = 'orange';

// GUARD FLAGS
let isSaving = false;
let isEventListenersBound = false;

// Initialize Application
async function initApp() {
    setupConsoleInterceptor();
    console.log("[App] Inisialisasi aplikasi 'private note'...");
    
    setupEventListeners();
    startRealtimeClock();
    startPeriodicPing();

    const storedPassphrase = sessionStorage.getItem('private_notes_passphrase');
    if (storedPassphrase) {
        try {
            console.log("[Vault] Membuka Vault dari Sesi Aktif...");
            const startKeyTime = performance.now();
            currentCryptoKey = await deriveKeyFromPassphrase(storedPassphrase);
            console.log(`[Crypto] Derivasi Key SHA-256 selesai (${Math.round(performance.now() - startKeyTime)} ms)`);
            
            showUnlockedUI();
            await fetchAndRenderNotes();
            await fetchAndRenderLogs();
        } catch (err) {
            console.error("[Vault] Gagal membuka vault dari sesi:", err);
            handleLock();
        }
    } else {
        console.log("[Vault] Status Vault: TERKUNCI (Menunggu Passphrase & Gateway Key)");
        showLockedUI();
    }
}

// Vault Locking & Session Management (Mendukung Gateway Key & Passphrase)
async function handleUnlock(event) {
    if (event) event.preventDefault();
    console.log("[UI Click] Tombol 'Set Key / Unlock' diklik");
    
    const passphraseInput = document.getElementById('passphrase-input').value.trim();
    const gatewayInput = document.getElementById('gateway-key-input');
    const gatewayKey = gatewayInput ? gatewayInput.value.trim() : '';

    if (!passphraseInput) return alert("Passphrase Vault wajib diisi!");

    sessionStorage.setItem('private_notes_passphrase', passphraseInput);
    if (gatewayKey) {
        sessionStorage.setItem('private_notes_gateway_key', gatewayKey);
    }

    document.getElementById('passphrase-input').value = '';
    
    console.log("[Vault] Mengirim log event 'SET_KEY'...");
    await logVaultEventApi('SET_KEY');
    await initApp();
}

async function handleLock() {
    console.log("[UI Click] Tombol 'Lock Vault' diklik");
    console.log("[Vault] Memulai proses penguncian Vault & pembersihan RAM...");
    
    await logVaultEventApi('RELEASE_KEY');

    sessionStorage.removeItem('private_notes_passphrase');
    currentCryptoKey = null;
    cachedNotes = [];
    filteredNotes = [];
    activeNoteIndex = null;
    selectedFilterTag = '';
    
    switchMode('LIST');
    showLockedUI();
    console.log("[Vault] Vault berhasil dikunci. RAM & Passphrase Session cleared.");
}

async function handleChangeKey() {
    console.log("[UI Click] Tombol 'Change Key' diklik");
    const newKey = prompt("Masukkan Secret Key / Passphrase baru:");
    if (newKey && newKey.trim() !== '') {
        console.log("[Vault] Memperbarui Passphrase Sesi...");
        sessionStorage.setItem('private_notes_passphrase', newKey.trim());
        
        const startKeyTime = performance.now();
        currentCryptoKey = await deriveKeyFromPassphrase(newKey.trim());
        console.log(`[Crypto] Derivasi Key Baru SHA-256 selesai (${Math.round(performance.now() - startKeyTime)} ms)`);
        
        await logVaultEventApi('CHANGE_KEY');
        alert("Passphrase aktif diperbarui!");
        await fetchAndRenderNotes();
        await fetchAndRenderLogs();
    }
}

// Mode Controller
function switchMode(newMode) {
    activeMode = newMode;
    if (newMode === 'LIST') {
        activeNoteIndex = null;
    }
    switchModeUI(newMode);
    renderNotesListTable();
    renderTopNavbar();
}

// Fetch & Decrypt Notes
async function fetchAndRenderNotes() {
    try {
        console.log("[API] Mengambil daftar catatan terenkripsi dari server...");
        const startFetchTime = performance.now();
        const rawNotes = await fetchNotesApi();
        console.log(`[API] Berhasil menerima ${rawNotes.length} catatan (${Math.round(performance.now() - startFetchTime)} ms)`);

        console.log("[Crypto] Memulai dekripsi AES-256-GCM seluruh catatan di RAM...");
        const startDecryptTime = performance.now();
        cachedNotes = [];

        for (let note of rawNotes) {
            const decrypted = await decryptNotePayload(
                note.encrypted_title,
                note.encrypted_body,
                note.iv,
                currentCryptoKey
            );
            
            cachedNotes.push({
                ...note,
                title: decrypted.title,
                body: decrypted.body
            });
        }

        console.log(`[Crypto] Dekripsi ${cachedNotes.length} catatan selesai (${Math.round(performance.now() - startDecryptTime)} ms)`);
        applyTitleSearchFilter();
    } catch (err) {
        console.error("[API/Crypto] Error saat memuat/mendekripsi catatan:", err);
        document.getElementById('notes-list').innerHTML = `<tr><td colspan="5" style="color: red;">Error: ${err.message}</td></tr>`;
    }
}

// Fetch & Render Logs Aktivitas
async function fetchAndRenderLogs() {
    try {
        console.log(`[API] Memuat log aktivitas terbaru (Limit: ${LOG_LIMIT})...`);
        const logData = await fetchLogsApi(LOG_LIMIT);
        
        if (logData && typeof logData === 'object' && 'logs' in logData) {
            console.log(`[Logs] Berhasil memuat ${logData.logs.length} baris log (Total DB: ${logData.total})`);
            renderLogsTable(logData.logs, logData.total);
        } else {
            renderLogsTable(logData || [], (logData || []).length);
        }
    } catch (err) {
        console.error("[API] Gagal memuat log aktivitas:", err);
    }
}

async function handleClearLogs() {
    console.log("[UI Click] Tombol 'Clear All Logs' diklik");
    if (!confirm("Apakah Anda yakin ingin menghapus SELURUH log aktivitas?")) return;
    try {
        console.log("[API] Mengirim request pembersihan log...");
        await clearLogsApi();
        alert("Seluruh log aktivitas berhasil dibersihkan!");
        await fetchAndRenderLogs();
    } catch (err) {
        console.error("[API] Gagal membersihkan log:", err);
        alert("Error: " + err.message);
    }
}

// Filter Judul DAN Filter Tag Aktif
function applyTitleSearchFilter() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    
    filteredNotes = cachedNotes.filter(note => {
        const matchTitle = !query || note.title.toLowerCase().includes(query);
        
        const noteTags = (note.tags || '')
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(Boolean);
            
        const matchTag = !selectedFilterTag || noteTags.includes(selectedFilterTag.toLowerCase());
        
        return matchTitle && matchTag;
    });

    renderNotesListTable();
    renderListTagFilters(selectedFilterTag);
}

function renderNotesListTable() {
    renderNotesTable(filteredNotes, cachedNotes, currentPage, itemsPerPage);
    renderTopNavbar();
}

function handleSearchInput() {
    const query = document.getElementById('search-input').value;
    console.log(`[Search] Filter Kata Kunci Judul: "${query}"`);
    currentPage = 1;
    applyTitleSearchFilter();
}

function clearSearch() {
    console.log("[UI Click] Tombol 'Clear Search' diklik");
    document.getElementById('search-input').value = '';
    selectedFilterTag = '';
    currentPage = 1;
    applyTitleSearchFilter();
}

function handleItemsPerPageChange() {
    itemsPerPage = parseInt(document.getElementById('items-per-page').value, 10);
    console.log(`[Pagination] Mengubah Baris per Halaman -> ${itemsPerPage}`);
    currentPage = 1;
    renderNotesListTable();
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredNotes.length / itemsPerPage) || 1;
    currentPage += direction;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    console.log(`[Pagination] Navigasi Halaman -> ${currentPage} dari ${totalPages}`);
    renderNotesListTable();
}

// Editor & CRUD Actions
function openNewNoteEditor() {
    console.log("[UI Click] Tombol '+ Catatan Baru' diklik");
    activeNoteIndex = null;
    setFormData({ id: '', title: '', body: '', tags: '' }, "Buat Catatan Baru");
    originalFormData = { title: '', body: '', tags: '' };
    switchMode('EDITING');
}

function editNoteByIndex(globalIndex) {
    activeNoteIndex = globalIndex;
    const note = cachedNotes[globalIndex];
    if (!note) return;

    console.log(`[UI Click] Icon '✏️ Edit' diklik untuk Note UUID: ${note.id}`);
    setFormData({ id: note.id, title: note.title, body: note.body, tags: note.tags || '' }, `Edit Catatan (UUID: ${note.id})`);
    originalFormData = { title: note.title, body: note.body, tags: note.tags || '' };
    switchMode('EDITING');
}

function readNoteByIndex(globalIndex) {
    activeNoteIndex = globalIndex;
    const note = cachedNotes[globalIndex];
    if (!note) return;

    console.log(`[UI Click] Icon '👁️ Baca' diklik untuk Note UUID: ${note.id}`);
    setViewerData(note);
    switchMode('VIEWING');
}

function resetFormToInitial() {
    console.log("[UI Click] Tombol 'Reset Form' diklik");
    setFormData(
        { 
            id: document.getElementById('note-id').value, 
            title: originalFormData.title, 
            body: originalFormData.body, 
            tags: originalFormData.tags 
        }, 
        document.getElementById('form-legend').textContent
    );
}

async function handleSaveNote(exitAfterSave = false) {
    if (isSaving) return;

    const { id, title, body, tags } = getFormData();
    if (!title || !body) return alert("Judul dan Isi Catatan wajib diisi!");

    const actionName = exitAfterSave ? 'Save & Exit' : 'Apply (Draft)';
    console.log(`[UI Click] Tombol '${actionName}' diklik untuk ${id ? 'Update Note' : 'Create Note'}`);

    try {
        isSaving = true;
        setSaveButtonsLoading(true);

        console.log("[Crypto] Membangkitkan Random 96-bit IVs & mengenkripsi AES-256-GCM...");
        const startEncTime = performance.now();
        const encryptedPayload = await encryptNotePayload(title, body, currentCryptoKey);
        console.log(`[Crypto] Enkripsi selesai (${Math.round(performance.now() - startEncTime)} ms)`);

        const payload = {
            encrypted_title: encryptedPayload.encrypted_title,
            encrypted_body: encryptedPayload.encrypted_body,
            iv: encryptedPayload.iv,
            tags: tags
        };

        let resultData;
        if (id) {
            payload.id = id;
            console.log(`[API] Mengirim POST /api?action=update_note (UUID: ${id})...`);
            resultData = await updateNoteApi(payload);
        } else {
            console.log("[API] Mengirim POST /api?action=create_note...");
            resultData = await createNoteApi(payload);
            if (resultData && resultData.id) {
                document.getElementById('note-id').value = resultData.id;
                console.log(`[API] Catatan Baru berhasil dibuat (UUID: ${resultData.id})`);
            }
        }

        originalFormData = { title, body, tags };
        alert(exitAfterSave ? "Catatan tersimpan! Menutup editor..." : "Draft catatan berhasil disimpan (Apply)!");

        await fetchAndRenderNotes();
        await fetchAndRenderLogs();

        if (exitAfterSave) {
            switchMode('LIST');
        } else {
            const currentId = document.getElementById('note-id').value;
            document.getElementById('form-legend').textContent = `Edit Catatan (UUID: ${currentId})`;
        }
    } catch (err) {
        console.error("[CRUD Error] Gagal menyimpan catatan:", err);
        alert("Error: " + err.message);
    } finally {
        isSaving = false;
        setSaveButtonsLoading(false);
    }
}

async function deleteNoteByIndex(globalIndex) {
    const note = cachedNotes[globalIndex];
    if (!note) return;

    console.log(`[UI Click] Icon '🗑️ Hapus' diklik untuk Note UUID: ${note.id}`);
    if (!confirm(`Hapus catatan secara permanen? \nUUID: ${note.id}`)) return;

    try {
        console.log(`[API] Mengirim POST /api?action=delete_note (UUID: ${note.id})...`);
        await deleteNoteApi(note.id);
        alert("Catatan berhasil dihapus.");
        switchMode('LIST');
        await fetchAndRenderNotes();
        await fetchAndRenderLogs();
    } catch (err) {
        console.error("[CRUD Error] Gagal menghapus catatan:", err);
        alert("Error: " + err.message);
    }
}

// ----------------------------------------------------------------------
// REALTIME CLOCK, RESOLUTION MONITOR, & PERIODIC PING (FOOTER METRICS)
// ----------------------------------------------------------------------
function startRealtimeClock() {
    if (clockTimer) clearInterval(clockTimer);
    
    const updateMetrics = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const datetimeStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        const epochMs = now.getTime();

        const viewportRes = `${window.innerWidth}x${window.innerHeight} px`;
        const screenRes = `${window.screen.width}x${window.screen.height} px`;

        renderFooterMetrics({
            viewportRes,
            screenRes,
            datetimeStr,
            epochMs,
            ip: userIp,
            region: userRegion,
            pingMs: lastPingMs,
            statusClass: lastPingStatusClass
        });
    };

    updateMetrics();
    clockTimer = setInterval(updateMetrics, 200);
}

async function executePing() {
    if (document.visibilityState && document.visibilityState !== 'visible') return;

    const startTime = performance.now();
    try {
        const data = await pingApi();
        const endTime = performance.now();
        const rtt = Math.round(endTime - startTime);

        userIp = data.ip;
        userRegion = data.region;
        lastPingMs = rtt;

        if (rtt < 300) lastPingStatusClass = 'green';
        else if (rtt < 1000) lastPingStatusClass = 'orange';
        else lastPingStatusClass = 'red';

    } catch (err) {
        lastPingMs = null;
        lastPingStatusClass = 'red';
        console.warn("[Network] PING Heartbeat Gagal - Server Unreachable / Gateway Unauthorized");
    }
}

function startPeriodicPing() {
    executePing();
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(executePing, 15000);
}

// Global Event Listeners Setup
function setupEventListeners() {
    if (isEventListenersBound) return;
    isEventListenersBound = true;

    document.getElementById('unlock-form').addEventListener('submit', handleUnlock);

    document.getElementById('navbar-buttons').addEventListener('click', (e) => {
        if (e.target.id === 'btn-top-change-key') handleChangeKey();
        else if (e.target.id === 'btn-top-lock-key') handleLock();
    });

    document.getElementById('btn-list-new').addEventListener('click', openNewNoteEditor);
    document.getElementById('btn-list-refresh').addEventListener('click', () => {
        console.log("[UI Click] Tombol 'Refresh' diklik");
        fetchAndRenderNotes();
        fetchAndRenderLogs();
    });

    // Listener Tombol Export JSON Plaintext
    const exportBtn = document.getElementById('btn-list-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            console.log("[UI Click] Tombol 'Export JSON' diklik");
            if (!cachedNotes || cachedNotes.length === 0) {
                return alert("Tidak ada catatan untuk di-export!");
            }
            const confirmExport = confirm("SECURITY WARNING:\nFile yang di-export berisi seluruh catatan dalam format TEKS BIASA (UNENCRYPTED).\n\nApakah Anda yakin ingin mengunduh file backup ini?");
            if (confirmExport) {
                downloadPlaintextJson(cachedNotes);
                console.log(`[Export] Berhasil mengunduh ${cachedNotes.length} catatan versi Plaintext JSON`);
            }
        });
    }

    document.getElementById('btn-editor-apply').addEventListener('click', () => handleSaveNote(false));
    document.getElementById('btn-editor-save-exit').addEventListener('click', () => handleSaveNote(true));
    document.getElementById('btn-editor-reset').addEventListener('click', resetFormToInitial);
    document.getElementById('btn-editor-cancel').addEventListener('click', () => {
        console.log("[UI Click] Tombol 'Batal Editor' diklik");
        switchMode('LIST');
    });

    document.getElementById('btn-viewer-edit').addEventListener('click', () => {
        if (activeNoteIndex !== null) editNoteByIndex(activeNoteIndex);
    });
    document.getElementById('btn-viewer-delete').addEventListener('click', () => {
        if (activeNoteIndex !== null) deleteNoteByIndex(activeNoteIndex);
    });
    document.getElementById('btn-viewer-close').addEventListener('click', () => {
        console.log("[UI Click] Tombol 'Tutup Detail' diklik");
        switchMode('LIST');
    });

    document.getElementById('search-input').addEventListener('input', handleSearchInput);
    document.getElementById('btn-clear-search').addEventListener('click', clearSearch);
    document.getElementById('items-per-page').addEventListener('change', handleItemsPerPageChange);
    document.getElementById('btn-prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('btn-next-page').addEventListener('click', () => changePage(1));

    document.getElementById('btn-clear-logs').addEventListener('click', handleClearLogs);

    document.getElementById('btn-clear-terminal').addEventListener('click', () => {
        console.log("[UI Click] Tombol 'Clear Terminal' diklik");
        clearTerminalScreen();
    });

    const bodyTextarea = document.getElementById('note-body');
    if (bodyTextarea) {
        bodyTextarea.addEventListener('input', (e) => {
            autoExpandTextarea(e.target);
        });
    }

    const tagsInput = document.getElementById('note-tags');
    if (tagsInput) {
        tagsInput.addEventListener('input', () => {
            updateEditorTagButtonStates();
        });
    }

    const editorTagContainer = document.getElementById('editor-tag-presets');
    if (editorTagContainer) {
        editorTagContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.editor-tag-btn');
            if (btn) {
                const tag = btn.getAttribute('data-tag');
                console.log(`[UI Click] Preset Tag #${tag} diklik di Editor`);
                toggleTagInInput(tag);
            }
        });
    }

    const listTagFilterContainer = document.getElementById('list-tag-filter-buttons');
    if (listTagFilterContainer) {
        listTagFilterContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-tag-btn');
            if (btn) {
                selectedFilterTag = btn.getAttribute('data-tag');
                console.log(`[UI Click] Filter Tag '${selectedFilterTag || 'Semua'}' diklik`);
                currentPage = 1;
                applyTitleSearchFilter();
            }
        });
    }

    window.addEventListener('resize', () => {
        const viewportRes = `${window.innerWidth}x${window.innerHeight} px`;
        const screenRes = `${window.screen.width}x${window.screen.height} px`;
        const elRes = document.getElementById('footer-resolution');
        if (elRes) elRes.textContent = `${viewportRes} (Screen: ${screenRes})`;
    });

    document.getElementById('notes-list').addEventListener('click', (e) => {
        const readBtn = e.target.closest('.btn-row-read');
        const editBtn = e.target.closest('.btn-row-edit');
        const deleteBtn = e.target.closest('.btn-row-delete');

        if (readBtn) {
            const index = parseInt(readBtn.getAttribute('data-index'), 10);
            readNoteByIndex(index);
        } else if (editBtn) {
            const index = parseInt(editBtn.getAttribute('data-index'), 10);
            editNoteByIndex(index);
        } else if (deleteBtn) {
            const index = parseInt(deleteBtn.getAttribute('data-index'), 10);
            deleteNoteByIndex(index);
        }
    });
}

document.addEventListener('DOMContentLoaded', initApp);