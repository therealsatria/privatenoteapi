# 🔒 private note - Zero-Knowledge Encrypted Vault

**private note** adalah web aplikasi catatan pribadi dengan arsitektur **Pure Zero-Knowledge (ZK)**. Seluruh proses enkripsi dan dekripsi data dilakukan secara *Client-Side* di dalam browser pengguna menggunakan **Web Crypto API (AES-256-GCM)**. 

Server (Vercel) dan Database (Neon PostgreSQL) hanya bertindak sebagai media lalu lintas dan tempat penyimpanan *ciphertext* (data terenkripsi). Server sama sekali **tidak memiliki kunci** untuk membaca judul maupun isi catatan pengguna. Aplikasi ini juga dilengkapi dengan proteksi gerbang API (*Gateway Key*), pembatas *request* (*Rate Limiting*), dan jejak audit lengkap (*Audit Trail & Console Monitor*).

---

## 🚀 Tech Stack & Infrastruktur Cloud

* **Frontend:** Vanilla HTML5, Vanilla CSS3 (Fluid Responsive, Sticky Top Header, & Fixed Bottom Footer), Vanilla JavaScript (ES Modules / Native ES6+).
* **Kriptografi:** Web Crypto API (`AES-256-GCM` 256-bit Authenticated Encryption, `SHA-256` Key Derivation).
* **Backend API Layer:** Vercel Serverless Functions (Node.js ES Modules).
* **Database:** Neon.tech PostgreSQL (Cloud Serverless PostgreSQL dengan TLS/SSL `sslmode=require`).
* **Hosting & Deployment:** Vercel Static & Serverless Platform.

---

## 📁 Struktur Folder & File Proyek

```text
private-notes/
├── api/
│   └── index.js            <-- Backend Serverless Function (Gateway, Rate Limiter, Vercel & Neon DB)
├── public/
│   ├── index.html          <-- Clean Skeleton HTML5
│   ├── css/
│   │   └── styles.css      <-- Responsive Styles, Top Header, Terminal, Tag Presets, & Footer
│   └── js/
│       ├── crypto.js       <-- Web Crypto API (AES-GCM, SHA-256, Dual IVs)
│       ├── api.js          <-- Fetch Client Wrapper (Dengan Header x-gateway-key)
│       ├── ui.js           <-- DOM Helper, Terminal Interceptor, Auto-Expand Textarea, & Tag/Emoji Presets
│       └── app.js          <-- Controller Utama, RAM State Manager, Anti-Double Submit, & Footer Metrics
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
| `note_id` | `UUID` (Nullable) | Relasi UUID Catatan yang terpengaruh (Bisa NULL untuk event general/vault). |
| `action_type` | `TEXT` | Jenis aksi (`CREATE_NOTE`, `UPDATE_NOTE`, `DELETE_NOTE`, `SET_KEY`, `CHANGE_KEY`, `RELEASE_KEY`, `CLEAR_LOGS`). |
| `ip_address` | `TEXT` | IP Address Pengunjung (dibaca dari Vercel Edge Headers). |
| `region` | `TEXT` | Geolocation Kota/Region Pengunjung (Vercel IP Headers). |
| `hostname` | `TEXT` | Host Domain + Ringkasan Device/Browser (contoh: `domain.vercel.app (Chrome on Windows)`). |
| `created_at` | `TIMESTAMPTZ` | Waktu kejadian log. |

> **Aturan Lazy Cleanup Log:** Setiap ada aktivitas CRUD baru, query `DELETE FROM logs WHERE created_at < NOW() - INTERVAL '3 months'` akan dieksekusi otomatis di background untuk menghapus log yang berusia lebih dari 90 hari.

---

## 🛡️ Lapisan Keamanan & Proteksi API (*Security Layers*)

Aplikasi menggunakan **5 Lapisan Perlindungan**:

1. **Layer 1: Zero-Knowledge Data Encryption (AES-256-GCM)**
   * Passphrase di-hash dengan SHA-256 menjadi 256-bit AES-GCM raw key. Kunci hanya hidup di RAM/`sessionStorage` dan terhapus saat vault dikunci/tab ditutup.
   * Menggunakan **2x 96-bit Random IV independen** untuk Title dan Body yang digabung dengan separator `|` (`ivTitle|ivBody`) untuk mencegah *GCM Nonce Reuse*.
2. **Layer 2: Gateway Passcode Protection (Proteksi Pintu Pagar API)**
   * API Vercel memeriksa Header `'x-gateway-key'`. Jika Environment Variable `GATEWAY_KEY` di-set di Vercel Dashboard, setiap request wajib menyertakan kunci ini. Request tanpa kunci yang valid akan ditolak `401 Unauthorized` sebelum menyentuh database Neon.
3. **Layer 3: Rate Limiting & Throttling (Proteksi DDoS / Spamming)**
   * API menerapkan *In-Memory Rate Limiter* maksimal **30 request / menit per IP Address**. Request berlebihan akan ditolak dengan `429 Too Many Requests`.
4. **Layer 4: Strict Console Logging Rule**
   * Console log **TIDAK BOLEH** mencetak plaintext Passphrase, raw key, atau isi catatan terdekripsi. Log hanya mencetak metadata, waktu latensi (ms), status HTTP, dan jejak klik tombol.
5. **Layer 5: Anti Double-Submit & Event Guard**
   * Menggunakan guard flag `isSaving` dan status `disabled` ("Saving...") pada tombol saat proses simpan berlangsung.
   * Menggunakan guard flag `isEventListenersBound = true` untuk memastikan event listener hanya terikat 1 kali di browser, mencegah pendaftaran event ganda saat vault di-unlock berulang kali.

---

## ✨ Fitur-Fitur Utama & Workflow UI/UX

1. **Top Sticky Navbar (Global Header):**
   * Menempel di bagian atas layar (`position: sticky; top: 0`) dengan logo `private note` dan tombol kontrol sesi vault (`[Change Key]` & `[Lock Vault]`).
2. **Navigasi Tombol Aksi Lokal (Hukum Kedekatan / Law of Proximity):**
   * **Aksi Baris Tabel (1-Klik):** Menggunakan icon instan `👁️` (Baca), `✏️` (Edit), dan `🗑️` (Hapus) langsung di kolom *Aksi* setiap baris catatan.
   * **Toolbar Tabel:** Tombol `[+ Catatan Baru]` dan `[Refresh]` terletak di toolbar atas tabel.
   * **Form Editor:** Tombol `[Apply]`, `[Save & Exit]`, `[Reset]`, `[Batal]` terletak tepat di bawah *textarea* tempat menulis.
   * **Viewer Detail:** Tombol `[Edit Catatan Ini]`, `[Hapus Catatan Ini]`, `[Tutup Detail]` terletak tepat di bawah teks detail catatan.
3. **Form Editor Responsif 100% Fluid & Auto-Expand Textarea:**
   * Lebar form 100% fluid memenuhi container.
   * Tinggi *textarea* isi catatan bertambah otomatis secara *real-time* mengikuti panjangnya ketikan pengguna (`autoExpandTextarea`).
4. **Random Emoji Generator (`[🎲]`) & Auto-Prepend Title:**
   * Judul catatan baru otomatis diawali dengan 1 emoji acak.
   * Tombol `[🎲]` di sebelah kiri input judul secara otomatis mengganti/menukar emoji paling kiri tanpa merusak teks judul.
5. **Quick Tag Presets & Multi-Filtering:**
   * Tombol tag preset (`#akun`, `#todo`, `#pribadi`, `#kerja`, `#umum`) di Form Editor. Klik tombol untuk menambah/menghapus tag dari kolom input.
   * Baris filter tag di atas tabel daftar catatan. Pencarian kata kunci Judul dan Filter Tag bekerja secara bersamaan (*real-time multi-filtering*).
6. **Title-Only Search & Pagination:**
   * Pencarian kata kunci judul yang sangat cepat di RAM tanpa overhead dekripsi ulang.
   * Pengaturan halaman (Pagination) dengan pilihan baris data: 10, 30, 50, atau 100 baris.
7. **Tabel Log Aktivitas Terakhir & Total Count:**
   * Menampilkan N log aktivitas terbaru secara langsung di bawah halaman utama (`LOG_LIMIT = 3`).
   * Menampilkan informasi **`Total Log: X Data`** dan tombol `[Clear All Logs]` untuk pembersihan manual.
8. **Realtime Metrics Footer:**
   * Baris footer melayang di paling bawah layar (`position: fixed; bottom: 0`).
   * **Resolusi:** Ukuran Viewport aktif & Layar Monitor (`1280x720 px (Screen: 1920x1080 px)`) yang update otomatis saat browser di-resize.
   * **Jam Realtime:** Tanggal, jam, dan milidetik (`Epoch ms`).
   * **Geolocation:** IP Address & Region pengunjung (via Vercel Edge Headers).
   * **API Latency Ping Dot:** Indikator lingkaran warna (🟢 `<300ms`, 🟠 `<1000ms`, 🔴 Offline/Error) dengan periodic ping 15 detik (otomatis *pause* saat tab tidak aktif).
9. **Realtime Terminal Console Monitor:**
   * Layar terminal *Dark Theme* di dalam web yang menayangkan jejak log DevTools & klik tombol secara *real-time* lewat *Console Interceptor*.
   * Dilengkapi tombol `[Clear Terminal]` dan *buffer limit* 50 baris dengan *auto-scroll*.

---

## 🛠️ Petunjuk Deployment (Vercel + Neon.tech)

1. **Database Setup:**
   * Buat proyek baru di [Neon.tech](https://neon.tech/).
   * Salin **Connection String** database PostgreSQL Anda.
2. **Vercel Setup:**
   * Push repository proyek ini ke GitHub.
   * Import repository ke [Vercel Dashboard](https://vercel.com/).
   * Tambahkan Environment Variables di Vercel Settings:
     * **Key:** `DATABASE_URL` ➔ **Value:** `postgresql://username:password@ep-xxx.neon.tech/neondb?sslmode=require`
     * **Key:** `GATEWAY_KEY` *(Opsional)* ➔ **Value:** `MyGatewayPasscode123` *(Password pintu pagar API)*
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