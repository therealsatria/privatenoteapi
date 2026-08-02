/* public/js/app.js */

import { deriveKeyFromPassphrase, encryptNotePayload, decryptNotePayload } from './crypto.js';
import { fetchNotesApi, createNoteApi, updateNoteApi, deleteNoteApi } from './api.js';
import { 
    showLockedUI, 
    showUnlockedUI, 
    renderTopNavbar, 
    switchModeUI, 
    renderNotesTable, 
    getFormData, 
    setFormData, 
    setViewerData 
} from './ui.js';

// Application State (RAM Only)
let currentCryptoKey = null;
let cachedNotes = [];
let filteredNotes = [];

let activeMode = 'LIST'; // Options: 'LIST' | 'EDITING' | 'VIEWING'
let selectedNoteIndex = null;
let originalFormData = { title: '', body: '', tags: '' };

let currentPage = 1;
let itemsPerPage = 10;

// Initialize Application
async function initApp() {
    setupEventListeners();
    
    const storedPassphrase = sessionStorage.getItem('private_notes_passphrase');
    if (storedPassphrase) {
        try {
            currentCryptoKey = await deriveKeyFromPassphrase(storedPassphrase);
            showUnlockedUI();
            await fetchAndRenderNotes();
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
    await initApp();
}

function handleLock() {
    sessionStorage.removeItem('private_notes_passphrase');
    currentCryptoKey = null;
    cachedNotes = [];
    filteredNotes = [];
    selectedNoteIndex = null;
    
    switchMode('LIST');
    showLockedUI();
}

async function handleChangeKey() {
    const newKey = prompt("Masukkan Secret Key / Passphrase baru:");
    if (newKey && newKey.trim() !== '') {
        sessionStorage.setItem('private_notes_passphrase', newKey.trim());
        currentCryptoKey = await deriveKeyFromPassphrase(newKey.trim());
        alert("Passphrase aktif diperbarui!");
        await fetchAndRenderNotes();
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

// Fetch & Decrypt Data
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

// Filter Title-Only & Pagination
function applyTitleSearchFilter() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    if (!query) {
        filteredNotes = [...cachedNotes];
    } else {
        filteredNotes = cachedNotes.filter(n => n.title.toLowerCase().includes(query));
    }
    renderNotesListTable();
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
    handleSearchInput();
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
    const { id, title, body, tags } = getFormData();
    if (!title || !body) return alert("Judul dan Isi Catatan wajib diisi!");

    try {
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

        if (exitAfterSave) {
            switchMode('LIST');
        } else {
            const currentId = document.getElementById('note-id').value;
            document.getElementById('form-legend').textContent = `Edit Catatan (UUID: ${currentId})`;
        }
    } catch (err) {
        alert("Error: " + err.message);
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
    } catch (err) {
        alert("Error: " + err.message);
    }
}

// Global Event Delegation setup untuk Elemen Dinamis
function setupEventListeners() {
    document.getElementById('unlock-form').addEventListener('submit', handleUnlock);
    document.getElementById('btn-change-key').addEventListener('click', handleChangeKey);
    document.getElementById('btn-lock-key').addEventListener('click', handleLock);

    document.getElementById('search-input').addEventListener('input', handleSearchInput);
    document.getElementById('btn-clear-search').addEventListener('click', clearSearch);
    document.getElementById('items-per-page').addEventListener('change', handleItemsPerPageChange);
    document.getElementById('btn-prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('btn-next-page').addEventListener('click', () => changePage(1));

    // Event Delegation untuk Tombol Pilih di Baris Tabel
    document.getElementById('notes-list').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-select-row');
        if (btn) {
            const globalIndex = parseInt(btn.getAttribute('data-index'), 10);
            selectNoteRow(globalIndex);
        }
    });

    // Event Delegation untuk Tombol Dinamis di Top Navbar
    document.getElementById('navbar-buttons').addEventListener('click', (e) => {
        const id = e.target.id;
        if (id === 'btn-nav-new') openNewNoteEditor();
        else if (id === 'btn-nav-refresh') fetchAndRenderNotes();
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