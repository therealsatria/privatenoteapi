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
    updateEditorTagButtonStates
} from './ui.js';

// KONFIGURASI FLEKSIBEL: Jumlah baris log aktivitas yang ditampilkan
const LOG_LIMIT = 3; 

// Application State (RAM Only)
let currentCryptoKey = null;
let cachedNotes = [];
let filteredNotes = [];

let activeMode = 'LIST'; // Options: 'LIST' | 'EDITING' | 'VIEWING'
let selectedNoteIndex = null;
let originalFormData = { title: '', body: '', tags: '' };

// Tag Filter State
let selectedFilterTag = ''; // Tag yang sedang dipilih untuk penyaringan di tabel

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
    setupEventListeners();
    startRealtimeClock();
    startPeriodicPing();

    const storedPassphrase = sessionStorage.getItem('private_notes_passphrase');
    if (storedPassphrase) {
        try {
            currentCryptoKey = await deriveKeyFromPassphrase(storedPassphrase);
            showUnlockedUI();
            await fetchAndRenderNotes();
            await fetchAndRenderLogs();
        } catch (err) {
            console.error("Init Error:", err);
            handleLock();
        }
    } else {
        showLockedUI();
    }
}

// Vault Locking & Session Management
async function handleUnlock(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('passphrase-input').value.trim();
    if (!input) return alert("Passphrase wajib diisi!");

    sessionStorage.setItem('private_notes_passphrase', input);
    document.getElementById('passphrase-input').value = '';
    
    await logVaultEventApi('SET_KEY');
    await initApp();
}

async function handleLock() {
    await logVaultEventApi('RELEASE_KEY');

    sessionStorage.removeItem('private_notes_passphrase');
    currentCryptoKey = null;
    cachedNotes = [];
    filteredNotes = [];
    selectedNoteIndex = null;
    selectedFilterTag = '';
    
    switchMode('LIST');
    showLockedUI();
}

async function handleChangeKey() {
    const newKey = prompt("Masukkan Secret Key / Passphrase baru:");
    if (newKey && newKey.trim() !== '') {
        sessionStorage.setItem('private_notes_passphrase', newKey.trim());
        currentCryptoKey = await deriveKeyFromPassphrase(newKey.trim());
        
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
        selectedNoteIndex = null;
    }
    switchModeUI(newMode);
    renderNotesListTable();
    renderTopNavbar(activeMode, selectedNoteIndex);
}

// Fetch & Decrypt Notes
async function fetchAndRenderNotes() {
    try {
        const rawNotes = await fetchNotesApi();
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

        applyTitleSearchFilter();
    } catch (err) {
        console.error(err);
        document.getElementById('notes-list').innerHTML = `<tr><td colspan="5" style="color: red;">Error: ${err.message}</td></tr>`;
    }
}

// Fetch & Render Logs Aktivitas
async function fetchAndRenderLogs() {
    try {
        const logData = await fetchLogsApi(LOG_LIMIT);
        
        if (logData && typeof logData === 'object' && 'logs' in logData) {
            renderLogsTable(logData.logs, logData.total);
        } else {
            renderLogsTable(logData || [], (logData || []).length);
        }
    } catch (err) {
        console.error("Gagal memuat log:", err);
    }
}

async function handleClearLogs() {
    if (!confirm("Apakah Anda yakin ingin menghapus SELURUH log aktivitas?")) return;
    try {
        await clearLogsApi();
        alert("Seluruh log aktivitas berhasil dibersihkan!");
        await fetchAndRenderLogs();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// Filter Ganda (Kata Kunci Judul DAN Filter Tag)
function applyTitleSearchFilter() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    
    filteredNotes = cachedNotes.filter(note => {
        // 1. Pencocokan Judul
        const matchTitle = !query || note.title.toLowerCase().includes(query);
        
        // 2. Pencocokan Tag
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
    renderNotesTable(filteredNotes, cachedNotes, selectedNoteIndex, currentPage, itemsPerPage);
    renderTopNavbar(activeMode, selectedNoteIndex);
}

function handleSearchInput() {
    currentPage = 1;
    applyTitleSearchFilter();
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    selectedFilterTag = '';
    currentPage = 1;
    applyTitleSearchFilter();
}

function handleItemsPerPageChange() {
    itemsPerPage = parseInt(document.getElementById('items-per-page').value, 10);
    currentPage = 1;
    renderNotesListTable();
}

function changePage(direction) {
    const totalPages = Math.ceil(filteredNotes.length / itemsPerPage) || 1;
    currentPage += direction;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    renderNotesListTable();
}

function selectNoteRow(globalIndex) {
    if (selectedNoteIndex === globalIndex) {
        selectedNoteIndex = null;
    } else {
        selectedNoteIndex = globalIndex;
    }
    renderNotesListTable();
}

function clearSelection() {
    selectedNoteIndex = null;
    renderNotesListTable();
}

// Editor & CRUD Actions
function openNewNoteEditor() {
    setFormData({ id: '', title: '', body: '', tags: '' }, "Buat Catatan Baru");
    originalFormData = { title: '', body: '', tags: '' };
    switchMode('EDITING');
}

function editSelectedNote() {
    if (selectedNoteIndex === null) return;
    const note = cachedNotes[selectedNoteIndex];
    setFormData({ id: note.id, title: note.title, body: note.body, tags: note.tags || '' }, `Edit Catatan (UUID: ${note.id})`);
    originalFormData = { title: note.title, body: note.body, tags: note.tags || '' };
    switchMode('EDITING');
}

function resetFormToInitial() {
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

function readSelectedNote() {
    if (selectedNoteIndex === null) return;
    const note = cachedNotes[selectedNoteIndex];
    setViewerData(note);
    switchMode('VIEWING');
}

async function handleSaveNote(exitAfterSave = false) {
    if (isSaving) return;

    const { id, title, body, tags } = getFormData();
    if (!title || !body) return alert("Judul dan Isi Catatan wajib diisi!");

    try {
        isSaving = true;
        setSaveButtonsLoading(true);

        const encryptedPayload = await encryptNotePayload(title, body, currentCryptoKey);
        const payload = {
            encrypted_title: encryptedPayload.encrypted_title,
            encrypted_body: encryptedPayload.encrypted_body,
            iv: encryptedPayload.iv,
            tags: tags
        };

        let resultData;
        if (id) {
            payload.id = id;
            resultData = await updateNoteApi(payload);
        } else {
            resultData = await createNoteApi(payload);
            if (resultData && resultData.id) {
                document.getElementById('note-id').value = resultData.id;
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
        alert("Error: " + err.message);
    } finally {
        isSaving = false;
        setSaveButtonsLoading(false);
    }
}

async function deleteSelectedNote() {
    if (selectedNoteIndex === null) return;
    const note = cachedNotes[selectedNoteIndex];

    if (!confirm(`Hapus catatan secara permanen? \nUUID: ${note.id}`)) return;

    try {
        await deleteNoteApi(note.id);
        alert("Catatan berhasil dihapus.");
        switchMode('LIST');
        await fetchAndRenderNotes();
        await fetchAndRenderLogs();
    } catch (err) {
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
    document.getElementById('btn-change-key').addEventListener('click', handleChangeKey);
    document.getElementById('btn-lock-key').addEventListener('click', handleLock);

    document.getElementById('search-input').addEventListener('input', handleSearchInput);
    document.getElementById('btn-clear-search').addEventListener('click', clearSearch);
    document.getElementById('items-per-page').addEventListener('change', handleItemsPerPageChange);
    document.getElementById('btn-prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('btn-next-page').addEventListener('click', () => changePage(1));

    document.getElementById('btn-clear-logs').addEventListener('click', handleClearLogs);

    // Auto-expand textarea
    const bodyTextarea = document.getElementById('note-body');
    if (bodyTextarea) {
        bodyTextarea.addEventListener('input', (e) => {
            autoExpandTextarea(e.target);
        });
    }

    // Sinkronisasi tombol preset tag saat pengguna mengetik manual di input #note-tags
    const tagsInput = document.getElementById('note-tags');
    if (tagsInput) {
        tagsInput.addEventListener('input', () => {
            updateEditorTagButtonStates();
        });
    }

    // Event Delegation: Klik Tombol Tag Preset di Form Editor
    const editorTagContainer = document.getElementById('editor-tag-presets');
    if (editorTagContainer) {
        editorTagContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.editor-tag-btn');
            if (btn) {
                const tag = btn.getAttribute('data-tag');
                toggleTagInInput(tag);
            }
        });
    }

    // Event Delegation: Klik Tombol Tag Filter di Atas Tabel Daftar Catatan
    const listTagFilterContainer = document.getElementById('list-tag-filter-buttons');
    if (listTagFilterContainer) {
        listTagFilterContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.filter-tag-btn');
            if (btn) {
                selectedFilterTag = btn.getAttribute('data-tag');
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
        const btn = e.target.closest('.btn-select-row');
        if (btn) {
            const globalIndex = parseInt(btn.getAttribute('data-index'), 10);
            selectNoteRow(globalIndex);
        }
    });

    document.getElementById('navbar-buttons').addEventListener('click', (e) => {
        const id = e.target.id;
        if (id === 'btn-nav-new') openNewNoteEditor();
        else if (id === 'btn-nav-refresh') { fetchAndRenderNotes(); fetchAndRenderLogs(); }
        else if (id === 'btn-nav-read') readSelectedNote();
        else if (id === 'btn-nav-edit') editSelectedNote();
        else if (id === 'btn-nav-delete') deleteSelectedNote();
        else if (id === 'btn-nav-clear') clearSelection();
        else if (id === 'btn-nav-apply') handleSaveNote(false);
        else if (id === 'btn-nav-save-exit') handleSaveNote(true);
        else if (id === 'btn-nav-reset') resetFormToInitial();
        else if (id === 'btn-nav-cancel') switchMode('LIST');
        else if (id === 'btn-nav-close') switchMode('LIST');
    });
}

document.addEventListener('DOMContentLoaded', initApp);