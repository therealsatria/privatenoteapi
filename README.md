```markdown
# 🔒 private note - Zero-Knowledge Encrypted Vault

**private note** adalah web aplikasi catatan pribadi dengan arsitektur **Pure Zero-Knowledge (ZK)**. Seluruh proses enkripsi dan dekripsi data dilakukan secara *Client-Side* di dalam browser pengguna menggunakan **Web Crypto API (AES-256-GCM)**. Server (Vercel) dan Database (Neon PostgreSQL) hanya bertindak sebagai media lalu lintas dan tempat penyimpanan *ciphertext* (data terenkripsi). Server sama sekali **tidak memiliki kunci** untuk membaca judul maupun isi catatan pengguna.

---

## 🚀 Tech Stack & Infrastruktur Cloud

* **Frontend:** Vanilla HTML5, Vanilla CSS3 (Fluid Responsive & Sticky Layouts), Vanilla JavaScript (ES Modules / Native ES6+).
* **Kriptografi:** Web Crypto API (`AES-256-GCM` 256-bit Authenticated Encryption, `SHA-256` Key Derivation).
* **Backend API Layer:** Vercel Serverless Functions (Node.js ES Modules).
* **Database:** Neon.tech PostgreSQL (Cloud Serverless PostgreSQL dengan TLS/SSL `sslmode=require`).
* **Hosting & Deployment:** Vercel Static & Serverless Platform.

---

## 📁 Struktur Folder & File Proyek

```text
private-notes/
├── api/
│   └── index.js            <-- Backend Serverless Function (Vercel & Neon DB)
├── public/
│   ├── index.html          <-- Clean Skeleton HTML5
│   ├── css/
│   │   └── styles.css      <-- Responsive Styles, Top Sticky Navbar, Terminal, & Footer
│   └── js/
│       ├── crypto.js       <-- Web Crypto API (AES-GCM, SHA-256, Dual IVs)
│       ├── api.js          <-- Fetch Client Wrapper ke Endpoint /api
│       ├── ui.js           <-- DOM Helper, Terminal Interceptor, & Preset Render
│       └── app.js          <-- Controller Utama, State RAM Manager, & Event Handlers
├── package.json            <-- Dependency proyek (@neondatabase/serverless)
└── README.md               <-- Dokumentasi Arsitektur Proyek
```

---

## 🗄️ Skema Database PostgreSQL (Neon.tech)

Tabel dibuat secara otomatis oleh fungsi `ensureTableExists()` pada `api/index.js` saat API diakses pertama kali.

### 1. Tabel `notes` (Catatan Terenkripsi)
| Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Primary Key unik berpanjang 36 karakter (`gen_random_uuid()`). |
| `encrypted_title` | `TEXT` | Judul catatan terenkripsi AES-256-GCM (Base64). |
| `encrypted_body` | `TEXT` | Isi catatan terenkripsi AES-256-GCM (Base64). |
| `iv` | `TEXT` | Initialization Vectors gabungan (`ivTitle\|ivBody`). |
| `tags` | `TEXT` | Tag metadata catatan (misal: `pribadi, akun`). |
| `created_at` | `TIMESTAMPTZ` | Waktu pembuatan catatan (`CURRENT_TIMESTAMP`). |
| `updated_at` | `TIMESTAMPTZ` | Waktu pembaruan terakhir catatan. |

### 2. Tabel `logs` (Audit Trail & Jejak Aktivitas)
| Kolom | Tipe Data | Deskripsi |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Primary Key unik log. |
| `note_id` | `UUID` (Nullable) | Relasi UUID Catatan yang terpengaruh (Bisa NULL untuk event general). |
| `action_type` | `TEXT` | Jenis aksi (`CREATE_NOTE`, `UPDATE_NOTE`, `DELETE_NOTE`, `SET_KEY`, `CHANGE_KEY`, `RELEASE_KEY`, `CLEAR_LOGS`). |
| `ip_address` | `TEXT` | IP Address Pengunjung (dibaca dari Vercel Edge Headers). |
| `region` | `TEXT` | Geolocation Kota/Region Pengunjung (Vercel IP Headers). |
| `hostname` | `TEXT` | Host Domain + Ringkasan Device/Browser (contoh: `domain.vercel.app (Chrome on Windows)`). |
| `created_at` | `TIMESTAMPTZ` | Waktu kejadian log. |

> **Aturan Lazy Cleanup Log:** Setiap ada aktivitas CRUD baru, query `DELETE FROM logs WHERE created_at < NOW() - INTERVAL '3 months'` akan dieksekusi otomatis di background untuk menghapus log yang berusia lebih dari 90 hari.

---

## 🔐 Aturan Keamanan & Kriptografi (*Strict Security Rules*)

1. **Key Derivation:** Passphrase diketik oleh pengguna di browser ➔ di-hash menggunakan `SHA-256` ➔ diimpor sebagai `CryptoKey` AES-256-GCM 256-bit.
2. **In-Memory Lifecycle:** Passphrase dan `CryptoKey` **hanya hidup di memori RAM** dan `sessionStorage` lokal browser. Kunci otomatis hancur saat pengguna menekan tombol *Lock* atau menutup tab.
3. **Nonce Reuse Prevention (Dual IVs):** Untuk setiap operasi enkripsi catatan, sistem membangkitkan **dua buah IV 96-bit (12-byte) acak terpisah** (satu untuk `encrypted_title` dan satu untuk `encrypted_body`). Kedua IV digabungkan dengan format `ivTitle|ivBody` pada kolom `iv`.
4. **Strict Console Log Security:** Console log **TIDAK BOLEH** mencetak plaintext Passphrase, raw `CryptoKey`, atau judul/isi catatan yang sudah terdekripsi. Log hanya mencetak metadata, waktu latensi (ms), status HTTP, dan nama tombol yang diklik.
5. **XSS Defense:** Seluruh render teks terdekripsi ke DOM disaring menggunakan fungsi `escapeHtml()` untuk mencegah serangan *Stored XSS*.

---

## ✨ Fitur-Fitur Utama Aplikasi

1. **Dynamic Context-Aware Top Sticky Navbar:**
   * Navbar menempel di bagian atas layar (`position: sticky; top: 0`) dengan judul kecil `private note`.
   * Tombol di navbar berubah secara dinamis berdasarkan Mode Aplikasi:
     * **Mode LIST:** `[+ Catatan Baru]`, `[Refresh]`.
     * **Mode LIST (Row Dipilih):** `[Baca]`, `[Edit]`, `[Hapus]`, `[Batal Pilih]`.
     * **Mode EDITING:** `[Apply (Simpan Draft)]`, `[Save & Exit]`, `[Reset]`, `[Batal]`.
     * **Mode VIEWING:** `[Edit Catatan Ini]`, `[Hapus Catatan Ini]`, `[Tutup Detail]`.
   * **Responsive Mobile:** Tombol tersusun otomatis menjadi 2 baris jika lebar layar sempit (`< 600px`).

2. **Form Editor Responsif & Auto-Expand Textarea:**
   * Lebar form 100% fluid mengikuti ukuran layar.
   * Tinggi *textarea* isi catatan bertambah otomatis secara *real-time* mengikuti panjangnya ketikan pengguna (dengan fungsi `autoExpandTextarea`).

3. **Random Emoji Generator (`[🎲]`):**
   * Di sebelah kiri input judul terdapat tombol `[🎲]`.
   * Saat membuat catatan baru, judul otomatis diawali dengan 1 emoji acak dari daftar 35 preset emoji.
   * Menekan tombol `[🎲]` akan menghapus emoji lama di paling kiri judul dan menggantinya dengan emoji acak baru tanpa merusak teks judul.

4. **Quick Tag Presets & Multi-Filtering:**
   * Tersedia tombol tag preset (`#akun`, `#todo`, `#pribadi`, `#kerja`, `#umum`) di Form Editor. Klik tombol untuk menambah/menghapus tag dari kolom input.
   * Tersedia baris filter tag di atas tabel daftar catatan. Pencarian kata kunci Judul dan Filter Tag bekerja secara bersamaan (*real-time multi-filtering*).

5. **Title-Only Search & Pagination:**
   * Pencarian kata kunci judul yang sangat cepat di RAM tanpa overhead dekripsi ulang.
   * Pengaturan halaman (Pagination) dengan pilihan baris data: 10, 30, 50, atau 100 baris.

6. **Tabel Log Aktivitas Terakhir:**
   * Menampilkan N log aktivitas terbaru secara langsung di bawah halaman utama (Variabel fleksibel `LOG_LIMIT = 3`).
   * Menampilkan informasi **`Total Log: X Data`** dan tombol `[Clear All Logs]` untuk pembersihan manual.

7. **Realtime Metrics Footer:**
   * Baris footer melayang di paling bawah layar (`position: fixed; bottom: 0`).
   * **Resolusi:** Ukuran Viewport aktif & Layar Monitor (`1280x720 px (Screen: 1920x1080 px)`) yang update otomatis saat browser di-resize.
   * **Jam Realtime:** Tanggal, jam, dan milidetik (`Epoch ms`).
   * **Geolocation:** IP Address & Region pengunjung (via Vercel Edge Headers).
   * **API Latency Ping Dot:** Indikator lingkaran warna (🟢 `<300ms`, 🟠 `<1000ms`, 🔴 Offline/Error) dengan periodic ping 15 detik (otomatis *pause* saat tab tidak aktif).

8. **Realtime Terminal Console Monitor:**
   * Layar terminal ber-theme gelap (*Dark Theme*) di dalam web yang menayangkan jejak log DevTools, waktu eksekusi enkripsi/dekripsi (ms), latensi API, dan jejak klik tombol pengguna secara *real-time*.
   * Dilengkapi tombol `[Clear Terminal]` dan *buffer limit* 50 baris dengan *auto-scroll*.

9. **Proteksi Anti Double Submit & Listener Guard:**
   * Menggunakan guard flag `isSaving` dan status `disabled` ("Saving...") pada tombol saat proses simpan berlangsung.
   * Menggunakan guard flag `isEventListenersBound = true` untuk memastikan event listener hanya terikat 1 kali di browser, mencegah pendaftaran event ganda saat vault di-unlock berulang kali.

---

## 🛠️ Petunjuk Deployment (Vercel + Neon.tech)

1. **Database Setup:**
   * Buat proyek baru di [Neon.tech](https://neon.tech/).
   * Salin **Connection String** database PostgreSQL Anda.
2. **Vercel Setup:**
   * Push repository proyek ini ke GitHub.
   * Import repository ke [Vercel Dashboard](https://vercel.com/).
   * Tambahkan Environment Variable:
     * **Key:** `DATABASE_URL`
     * **Value:** `postgresql://username:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   * Klik **Deploy**.
3. **Auto-Table Generation:**
   * Saat Vercel Function dipanggil pertama kali, tabel `notes` dan `logs` beserta skema UUID akan otomatis dibuat oleh backend.

---

## 🤖 Panduan Prompt Handover untuk AI Studio / LLM di Masa Depan

Jika Anda ingin melanjutkan pengembangan proyek ini pada sesi chat AI baru di masa mendatang, salin dan gunakan kalimat prompt berikut di awal percakapan:

> **Prompt Handover:**
> *"Halo AI, saya sedang mengembangkan proyek Web Application bernama 'private note' dengan arsitektur Pure Zero-Knowledge (Client-Side AES-256-GCM Encryption, Vercel Serverless Function, dan Neon PostgreSQL). Berikut adalah file README.md yang berisi seluruh penjelasan arsitektur, struktur file, skema database, aturan keamanan, dan fitur yang sudah dibangun:*
> 
> *[PASTE / UPLOAD ISI FILE README.MD DI SINI]*
> 
> *Tolong pahami konteks seluruh proyek ini. Sekarang saya ingin mengembangkan fitur [Sebutkan Fitur Baru yang Ingin Dibuat]..."*

---
*Created with ❤️ & passion for privacy and open-source security.*