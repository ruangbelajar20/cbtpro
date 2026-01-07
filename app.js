// ==========================================
// 1. KONFIGURASI & VARIABEL GLOBAL
// ==========================================

// --- Supabase Config ---
const SUPABASE_URL = 'https://vgemkulcjnpjquabhguv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnZW1rdWxjam5wanF1YWJoZ3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzUwNTEsImV4cCI6MjA4MDQxMTA1MX0.Z0NxOpNZAhuNlFuR_2h0uRLD8x4gYNpEI9veHNCxKxQ';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase Siap!");
let currentEditingRoomId = null; // TAMBAHKAN INI
let pendingDeleteId = null;      // TAMBAHKAN INI (Untuk hapus)
let pendingDeleteType = null;    // TAMBAHKAN INI (Untuk hapus)
// --- Variabel State Tambahan ---
let currentEditingClassId = null; // Penanda ID kelas yang sedang diedit
// --- Variabel State Aplikasi ---
let currentEditingExamId = null;
let cardLogoData = "https://via.placeholder.com/50";
let cardSignatureData = "";
let selectedStudentIds = [];

// --- Cache Data (Penyimpanan Sementara) ---
let adminDataCache = []; // Data Siswa
let classesData = [];    // Data Kelas
let roomsData = [];      // Data Ruangan
let questions = [];      // Data Soal
let exams = []; 
let currentRecapData = [];

// --- Ticker Data ---
let tickerIndex = 0;
const tickerMessages = [
    { text: '<span class="text-yellow-400 font-bold mr-2">[INFO UJIAN]</span> Selamat Datang di Portal Ujian CBT Pro.', anim: 'anim-scroll', duration: 20000 },
    { text: '<span class="text-blue-400 font-bold mr-2">[BANTUAN]</span> Jika terkendala hubungi Admin.', anim: 'anim-center-expand', duration: 10000 }
];

// --- Service Layer (Jembatan Database) ---
const DB = {
    async getStudents() {
        // --- PERBAIKAN: Hanya ambil kolom yang ditampilkan ---
        const { data, error } = await db
            .from('students')
            // Kita sebutkan satu per satu kolomnya (jauh lebih ringan)
            .select('username, nama_lengkap, id_peserta, password, kelas, ruangan, sesi, sekolah, agama, catatan') 
            .order('nama_lengkap', { ascending: true });
        if (error) { console.error("DB Error:", error); return []; }
        return data.map(s => ({
            username: s.username, nama: s.nama_lengkap, id_peserta: s.id_peserta,
            pass: s.password, kelas: s.kelas || '-', ruangan: s.ruangan || '-', sesi: s.sesi || '1',
            sekolah: s.sekolah || '-', agama: s.agama || '-', catatan: s.catatan || '-'
        }));
    },
    async getClasses() {
       // --- PERBAIKAN ---
        const { data, error } = await db
            .from('classes')
            .select('id, kode_kelas, nama_kelas, deskripsi'); // Ambil kolom penting saja
        if (error) return [];
        return data.map((c) => ({
            id: c.id, code: c.kode_kelas, name: c.nama_kelas, desc: c.deskripsi || '-', count: 0, date: 'Terdaftar'
        }));
    },
    async getRooms() {
        // --- PERBAIKAN ---
        const { data, error } = await db
            .from('rooms')
            .select('id, kode_ruangan, nama_ruangan, deskripsi');
        if (error) return [];
        return data.map((r) => ({
            id: r.id, code: r.kode_ruangan, name: r.nama_ruangan, desc: r.deskripsi || '-', count: 0, date: 'Terdaftar'
        }));
    }, 
    async getExams() {
       // --- PERBAIKAN ---
        const { data, error } = await db
            .from('exams')
            // Pastikan kolom ini sesuai dengan nama kolom di database Anda
            .select('id, nama_ujian, status, alokasi, peserta, pengelola, acak_paket, acak_soal, acak_opsi, tampil_nilai')
            .order('created_at', { ascending: false });
            
        if (error) { 
            console.error("Gagal ambil ujian:", error.message); 
            return []; 
        }
        
        // Mapping data dari Database ke Format Aplikasi
        return data.map(e => ({
            id: e.id,
            name: e.nama_ujian,       // Pastikan kolom DB: nama_ujian
            status: e.status,         // Pastikan kolom DB: status
            alokasi: e.alokasi,       // Pastikan kolom DB: alokasi
            peserta: e.peserta || 0,  // Pastikan kolom DB: peserta
            pengelola: e.pengelola || 'Admin',
            acakPaket: e.acak_paket || 'first',   // Default 'first'
            acakSoal: e.acak_soal || 'no',        // Default 'no'
            acakOpsi: e.acak_opsi || 'no',        // Default 'no'
            tampilNilai: e.tampil_nilai || 'hide' // Default 'hide'
        }));
    },

    // 1. Hitung Total Baris (Generic)
    // Digunakan untuk: Total Siswa, Total Kelas, Total Ruangan, Total Ujian
    async getCount(table) {
        const { count, error } = await db
            .from(table)
            .select('*', { count: 'exact', head: true });
        return error ? 0 : count;
    },

    // 2. Hitung Siswa Online
    async getStudentOnline() {
        const { count, error } = await db
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('status_login', true);
        return error ? 0 : count;
    },

    // 3. Hitung User Online (Admin/Pengawas)
    async getUserOnline(roleName) {
        const { count, error } = await db
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role', roleName)
            .eq('status_login', true);
        return error ? 0 : count;
    },
    // Digunakan untuk Angka Besar di Dashboard
    async getUserTotalByRole(roleName) {
        const { count, error } = await db
            .from('users') 
            .select('*', { count: 'exact', head: true })
            .eq('role', roleName); // Filter Role Saja
        return error ? 0 : count;
    },

    // 4. Hitung Ujian yang Sedang AKTIF (Baru)
    async getActiveExams() {
        const { count, error } = await db
            .from('exams')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Aktif'); // Filter status = 'Aktif'
        return error ? 0 : count;
    },
    async updateExam(id, updateData) {
        const { data, error } = await db
            .from('exams')
            .update(updateData)
            .eq('id', id) // Update berdasarkan ID ujian
            .select();

        if (error) {
            console.error("Gagal update ujian:", error.message);
            alert("Gagal update: " + error.message);
            return false;
        }
        return true;
    },
    async getCountByFilter(table, column, value) {
        const { count, error } = await db
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq(column, value); // Filter: Kolom = Nilai
        return error ? 0 : count;
    },
    // 5. Hitung Peserta sedang Mengerjakan (Opsional/Future Use)
    async getExamSessionCount() {
        try {
            const { count, error } = await db
                .from('exam_sessions') 
                .select('*', { count: 'exact', head: true })
                .eq('status', 'ongoing');
            return error ? 0 : count;
        } catch (e) {
            return 0; 
        }
    },
    async addStudent(studentData) {
        const { data, error } = await db
            .from('students')
            .insert([studentData]) // Mengirim object data
            .select();
        
        if (error) {
            console.error("Gagal tambah siswa:", error.message);
            alert("Gagal menyimpan: " + error.message);
            return false;
        }
        return true;
    },
    
    // 2. Tambah Kelas Baru
    async addClass(classData) {
        const { data, error } = await db
            .from('classes')
            .insert([classData])
            .select();
    
        if (error) {
            console.error("Gagal tambah kelas:", error.message);
            alert("Gagal menyimpan kelas: " + error.message);
            return false;
        }
        return true;
    },
    // 4. Update Kelas (Fungsi Baru)
    async updateClass(id, updateData) {
        const { error } = await db
            .from('classes')
            .update(updateData)
            .eq('id', id) // Kunci: Hanya update baris yang ID-nya cocok
            .select();

        if (error) {
            alert("Gagal update: " + error.message);
            return false;
        }
        return true;
    },
    // 3. Tambah Ruangan Baru
    async addRoom(roomData) {
        const { data, error } = await db
            .from('rooms')
            .insert([roomData])
            .select();
    
        if (error) {
            console.error("Gagal tambah ruang:", error.message);
            alert("Gagal menyimpan ruang: " + error.message);
            return false;
        }
        return true;
    },
    // --- TEMPEL DI SINI (Di dalam const DB) ---
    
    async updateRoom(id, updateData) {
        const { error } = await db.from('rooms').update(updateData).eq('id', id);
        if (error) { alert("Gagal update: " + error.message); return false; }
        return true;
    },
    
    async deleteRoom(id) {
        const { error } = await db.from('rooms').delete().eq('id', id);
        if (error) { alert("Gagal hapus: " + error.message); return false; }
        return true;
    },
    
    async deleteClass(id) { // Tambahan helper untuk hapus kelas
         const { error } = await db.from('classes').delete().eq('id', id);
         if (error) { alert("Gagal hapus: " + error.message); return false; }
         return true;
    }
};

async function saveStudentData() {
    // 1. Ambil Elemen Tombol (Untuk efek loading)
    const btn = document.querySelector('button[onclick="saveStudentData()"]');
    const originalContent = btn ? btn.innerHTML : 'Tambahkan';
    
    // 2. Ambil Nilai dari Input HTML (Pastikan ID di HTML sudah sesuai)
    const nama = document.getElementById('input-nama').value;
    const idPeserta = document.getElementById('input-id-peserta').value;
    const username = document.getElementById('input-username').value;
    const password = document.getElementById('input-password').value;
    
    // Data Opsional (Dropdown/Select)
    const kelas = document.getElementById('input-kelas').value;
    const ruangan = document.getElementById('input-ruangan').value;
    const sesi = document.getElementById('input-sesi').value;
    const sekolah = document.getElementById('input-sekolah').value;
    const agama = document.getElementById('input-agama').value;
    const catatan = document.getElementById('input-catatan').value;

    // 3. Validasi Sederhana
    if (!nama || !idPeserta || !username || !password) {
        alert("Mohon lengkapi data wajib (*) !");
        return;
    }

    // 4. Ubah Tombol jadi Loading (Agar user tahu sedang proses)
    if(btn) {
        btn.innerHTML = `<span class="animate-spin">⏳</span> Menyimpan...`;
        btn.disabled = true;
    }

    // 5. Panggil Service DB (Kirim ke Supabase)
    // PENTING: Bagian kiri (key) HARUS SAMA PERSIS dengan nama kolom di Tabel Supabase Anda
    const success = await DB.addStudent({
        nama_lengkap: nama,      // Kolom di DB: nama_lengkap
        id_peserta: idPeserta,   // Kolom di DB: id_peserta
        username: username,      // Kolom di DB: username
        password: password,      // Kolom di DB: password
        kelas: kelas,            // Kolom di DB: kelas
        ruangan: ruangan,        // Kolom di DB: ruangan
        sesi: sesi,              // Kolom di DB: sesi
        sekolah: sekolah,        // Kolom di DB: sekolah
        agama: agama,            // Kolom di DB: agama
        catatan: catatan         // Kolom di DB: catatan
    });

    // 6. Cek Hasil
    if (success) {
        alert("✅ Berhasil! Data siswa telah disimpan.");
        
        // Reset Formulir agar kosong kembali
        document.querySelectorAll('#panel-add-student input').forEach(input => input.value = '');
        
        // Tutup Panel Tambah & Kembali ke Tabel
        adminNav('students'); 
    }

    // 7. Kembalikan tombol seperti semula
    if(btn) {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

// 2. EVENT LISTENER (INIT)
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    // 1. Feather Icons
    if (typeof feather !== 'undefined') feather.replace();

    // 2. Start Ticker
    const tickerEl = document.getElementById('dynamic-ticker');
    if(tickerEl) playTicker();

    // 3. Start Clock
    setInterval(() => { 
        const now = new Date(); 
        if(document.getElementById('admin-clock')) 
            document.getElementById('admin-clock').innerText=now.toLocaleTimeString('id-ID', {hour12:false}); 
    }, 1000);

    // 4. Init Form Schedule
    if(typeof updateScheduleInfo === 'function') updateScheduleInfo();
    // 5. Update socket
    initRealtimePresence();
    // 6. Update Dashboard
    // updateDashboardStats();
    // 7. Update HTTP
    initRealTrafficMonitor();
    // 8. Check session
    checkSession();
    // 9. Init Token System
    initRealTokenSystem();
    // 10. init
     initRealtimeStudents(); // Jalankan listener
});

async function checkSession() {
    // Ambil data dari penyimpanan browser
    const sessionRaw = localStorage.getItem('cbt_user_session');
    
    if (sessionRaw) {
        // Kalau ada data sesi, langsung masuk ke dashboard
        const session = JSON.parse(sessionRaw);
        console.log("User terdeteksi:", session.username);
        
        showView('view-admin'); // Langsung loncat ke admin
        adminNav('dashboard');
        
        // Opsional: Perbarui status online lagi untuk memastikan
        await db.from('users').update({ status_login: true }).eq('id', session.id);
    }
}
// Tambahkan fitur ini agar angka berubah otomatis tanpa refresh
async function initRealtimeStudents() {
    const channel = db.channel('realtime_students')
        .on(
            'postgres_changes', 
            { event: '*', schema: 'public', table: 'students' }, 
            (payload) => {
                console.log('Ada perubahan data siswa, update dashboard...');
                updateDashboardStats(); // Panggil ulang hitungan saat ada insert/delete/update
                
                // Opsional: Jika sedang di halaman tabel siswa, refresh tabelnya juga
                if(!document.getElementById('panel-students').classList.contains('hidden-view')) {
                     fetchAdminData(false); 
                }
            }
        )
        .subscribe();
}
// Update Fungsi Logout agar menghapus sesi
function logoutAdmin() {
    const sessionRaw = localStorage.getItem('cbt_user_session');
    if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        // Set offline di database
        db.from('users').update({ status_login: false }).eq('id', session.id).then(() => {
            // Hapus sesi lokal
            localStorage.removeItem('cbt_user_session');
            location.reload(); // Refresh halaman ke login
        });
    } else {
        location.reload();
    }
}

// --- FUNGSI LOGIN ADMIN (VERSI OPTIMASI RESPONSIF) ---
async function verifyAdminLoginReal() {
    // 1. Ambil Elemen
    const usernameInput = document.getElementById('admin-user-input');
    const passwordInput = document.getElementById('admin-pass-input');
    const btn = document.getElementById('btn-admin-login');

    if (!usernameInput || !passwordInput || !btn) return;

    const usernameVal = usernameInput.value;
    const passwordVal = passwordInput.value;
    const originalText = btn.innerHTML; // Simpan teks asli tombol

    // 2. Validasi Input Kosong
    if (!usernameVal || !passwordVal) {
        showErrorModal("Data Belum Lengkap", "Harap isi Username dan Password!");
        // Fokuskan kursor ke input yang kosong
        if(!usernameVal) usernameInput.focus();
        else passwordInput.focus();
        return;
    }

    // 3. UI LOADING (Agar terlihat responsif)
    btn.innerHTML = `<i data-feather="loader" class="w-4 h-4 animate-spin"></i> Memproses...`;
    btn.disabled = true; // Matikan tombol sementara
    btn.classList.add('opacity-75', 'cursor-not-allowed'); // Efek visual mati
    if (typeof feather !== 'undefined') feather.replace();

    try {
        // 4. Cek ke Supabase (Database)
        const { data, error } = await db
            .from('users')
            .select('*')
            .eq('username', usernameVal)
            .eq('password', passwordVal) 
            .eq('role', 'admin') 
            .single();

        // 5. JIKA GAGAL / SALAH PASSWORD
        if (error || !data) {
            // Tampilkan Modal Error Kustom
            showErrorModal("Login Gagal", "Username atau Password salah. Silakan coba lagi.");
            
            // UX: Kosongkan password agar user bisa langsung ketik ulang
            passwordInput.value = ''; 
            passwordInput.focus(); // Arahkan kursor otomatis ke password
            
            // Stop proses di sini
            return; 
        }

        // 6. JIKA SUKSES
        // Simpan sesi
        const userSession = {
            id: data.id,
            username: data.username,
            role: data.role,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('cbt_user_session', JSON.stringify(userSession));
        
        // Update status online
        await db.from('users').update({ status_login: true }).eq('id', data.id);

        // Tutup Modal & Pindah Halaman
        document.getElementById('modal-pin').classList.add('hidden');
        showView('view-admin');
        adminNav('dashboard');

        // Reset Input
        usernameInput.value = '';
        passwordInput.value = '';

    } catch (err) {
        console.error("Error Login:", err);
        showErrorModal("Terjadi Kesalahan", "Gagal terhubung ke server. Cek koneksi internet Anda.");
    } finally {
        // 7. PENTING: KEMBALIKAN TOMBOL KE KEADAAN SEMULA (APAPUN HASILNYA)
        // Ini yang membuat aplikasi terasa "mulur" kembali setelah error
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        
        // Render ulang ikon jika perlu
        if (typeof feather !== 'undefined') feather.replace();
    }
}
// --- FUNGSI LOGIN ADMIN (REAL DATABASE) ---
async function attemptLogin() {
    // 1. Ambil nilai dari input HTML
    const usernameInput = document.getElementById('log-user').value;
    const passwordInput = document.getElementById('log-pass').value; // Dulu ini token, sekarang jadi password
    const btn = document.querySelector('button[onclick="attemptLogin()"]');

    // 2. Validasi Input Kosong
    if (!usernameInput || !passwordInput) {
        alert("Harap isi Username dan Password!");
        return;
    }

    // 3. Ubah tombol jadi loading
    const originalText = btn.innerText;
    btn.innerText = "Memeriksa...";
    btn.disabled = true;

    try {
        // 4. CEK KE DATABASE SUPABASE
        // "Cari di tabel users, dimana username = input DAN password = input"
        const { data, error } = await db // Gunakan variabel 'db' yang sudah kita rename sebelumnya
            .from('users')
            .select('*')
            .eq('username', usernameInput)
            .eq('password', passwordInput)
            .eq('role', 'admin') // Pastikan yang login adalah admin
            .single(); // .single() artinya kita harap cuma nemu 1 data

        // 5. JIKA EROR ATAU DATA TIDAK DITEMUKAN
        if (error || !data) {
            alert("Login Gagal! Username atau Password salah.");
            btn.innerText = originalText;
            btn.disabled = false;
            return; // Berhenti di sini
        }

        // 6. JIKA SUKSES (Data ditemukan)
        alert("Login Berhasil! Selamat datang, " + data.username);

        // A. Simpan sesi user ke browser (agar tidak hilang saat refresh)
        const userSession = {
            id: data.id,
            username: data.username,
            role: data.role,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('cbt_user_session', JSON.stringify(userSession));

        // B. Update status di database jadi ONLINE (TRUE)
        await db.from('users').update({ status_login: true }).eq('id', data.id);

        // C. Pindah ke Halaman Dashboard
        // Sembunyikan Login, Tampilkan Admin Panel
        document.getElementById('view-login').classList.add('hidden-view');
        document.getElementById('view-admin').classList.remove('hidden-view');
        
        // Panggil fungsi update dashboard agar angkanya langsung benar
        adminNav('dashboard'); 
        
    } catch (err) {
        console.error("Error Login:", err);
        alert("Terjadi kesalahan sistem. Cek koneksi internet.");
    } finally {
        // Kembalikan tombol (jika belum pindah halaman)
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- FUNGSI UPDATE DASHBOARD (FINAL VERSION) ---
async function updateDashboardStats() {
    // 1. Loading State (Update daftar ID agar lengkap)
    const ids = [
        'stat-students', 'stat-online', 
        'stat-classes', 'stat-rooms', 
        'stat-exams', 'stat-exams-active',
        'stat-proctor-total', 'stat-proctor-online', // ID Baru Pengawas
        'stat-admin-total', 'stat-admin-online'      // ID Baru Admin
    ];
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = "...";
    });

    try {
        // 2. Ambil SEMUA Data Secara Paralel
        const [
            totalSiswa, 
            siswaOnline,
            
            totalPengawas,    // Total Akun Pengawas
            pengawasOnline,   // Pengawas yg Login
            
            totalAdmin,       // Total Akun Admin
            adminOnline,      // Admin yg Login

            totalKelas, 
            totalRuang, 
            totalUjian, 
            ujianAktif
        ] = await Promise.all([
            DB.getCount('students'),       
            DB.getStudentOnline(),         
            
            DB.getUserTotalByRole('pengawas'), // Total Pengawas
            DB.getUserOnline('pengawas'),      // Pengawas Online
            
            DB.getUserTotalByRole('admin'),    // Total Admin
            DB.getUserOnline('admin'),         // Admin Online

            DB.getCount('classes'),        
            DB.getCount('rooms'),          
            DB.getCount('exams'),
            DB.getActiveExams(),
            DB.getCountByFilter('exams', 'status', 'Aktif')
        ]);

        // 3. Update Tampilan HTML
        
        // SISWA
        if(document.getElementById('stat-students')) 
            document.getElementById('stat-students').innerText = totalSiswa;
        if(document.getElementById('stat-online')) 
            document.getElementById('stat-online').innerText = siswaOnline;

        // PENGAWAS (New Logic)
        if(document.getElementById('stat-proctor-total')) 
            document.getElementById('stat-proctor-total').innerText = totalPengawas;
        if(document.getElementById('stat-proctor-online')) 
            document.getElementById('stat-proctor-online').innerText = pengawasOnline;

        // ADMIN (New Logic)
        if(document.getElementById('stat-admin-total')) 
            document.getElementById('stat-admin-total').innerText = totalAdmin;
        if(document.getElementById('stat-admin-online')) 
            document.getElementById('stat-admin-online').innerText = adminOnline;

        // MASTER DATA LAIN
        if(document.getElementById('stat-classes')) 
            document.getElementById('stat-classes').innerText = totalKelas;
        if(document.getElementById('stat-rooms')) 
            document.getElementById('stat-rooms').innerText = totalRuang;

        // UJIAN
        if(document.getElementById('stat-exams')) 
            document.getElementById('stat-exams').innerText = totalUjian;
        if(document.getElementById('stat-exams-active')) 
            document.getElementById('stat-exams-active').innerText = ujianAktif;

    } catch (e) {
        console.error("Gagal update dashboard:", e);
    }
}
// --- B. Navigasi ---
function showView(id) { 
    ['view-login','view-admin','view-exam'].forEach(v=>document.getElementById(v).classList.add('hidden-view')); 
    document.getElementById(id).classList.remove('hidden-view'); 
}

function adminNav(panelId) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden-view'));
    const targetPanel = document.getElementById('panel-' + panelId) || document.getElementById(panelId);
    if (targetPanel) targetPanel.classList.remove('hidden-view');
    
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active-nav'));
    const activeBtn = document.getElementById('nav-' + panelId);
    if (activeBtn) activeBtn.classList.add('active-nav');

    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar && overlay) {
            sidebar.classList.add('-translate-x-full'); // Sembunyikan sidebar
            overlay.classList.add('hidden'); // Sembunyikan overlay gelap
        }   
    }
    if (panelId === 'dashboard') {
        updateDashboardStats(); // Refresh angka setiap masuk dashboard
    }
    // Trigger Fetching Data Realtime
    if (panelId === 'dashboard' || panelId === 'students') fetchAdminData();
    if (panelId === 'classes') fetchClasses();
    if (panelId === 'rooms') fetchRooms();
    if (panelId === 'questions') { switchBankTab('soal'); fetchQuestions(); }
}
// --- LOGIKA SIDEBAR MOBILE ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    // Cek apakah elemen ada (untuk menghindari error)
    if (sidebar && overlay) {
        // Jika sidebar sedang sembunyi (ada class -translate-x-full), maka hapus class itu (munculkan)
        if (sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        } else {
            // Jika sidebar sedang muncul, sembunyikan lagi
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        }
    }
}

// --- C. Fetching Data (Siswa, Kelas, Ruangan) ---
// --- PERBAIKAN: Tambahkan parameter useCache = false ---
async function fetchAdminData(useCache = false) {
    const tbody = document.getElementById('table-students-body');
    
    // LOGIKA PINTAR:
    // Jika user TIDAK minta cache (useCache=false) ATAU data di memori masih kosong...
    // ...Maka kita ambil data baru dari Supabase (Loading muncul).
    if (!useCache || adminDataCache.length === 0) {
        try {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8"><div class="flex justify-center items-center gap-2 text-slate-500"><span class="animate-spin text-blue-600">⏳</span> Memuat data dari server...</div></td></tr>`;
            
            // Fetch ke Database
            adminDataCache = await DB.getStudents();
            
            // Update Angka Statistik Total (Hanya saat fetch baru)
            // const statEl = document.getElementById('stat-students');
            // if (statEl) statEl.innerText = adminDataCache.length;

        } catch (e) {
            console.error(e);
            tbody.innerHTML = `<tr><td colspan="13" class="text-center text-red-500 py-4">Gagal memuat data.</td></tr>`;
            return;
        }
    }

    // --- DI BAWAH SINI ADALAH KODE TAHAP 1 (Rendering) ---
    // Pastikan kode rendering (htmlRows = adminDataCache.map...) ada di bawah sini.
    // Kode rendering tidak perlu diubah lagi, biarkan seperti hasil Tahap 1.
    
    const filterClass = document.getElementById('filter-class').value;
    const filterRoom = document.getElementById('filter-room').value;
    
    // ... Lanjutkan dengan kode rendering Tahap 1 ...
        tbody.innerHTML = '';
        if (adminDataCache.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center py-4 text-xs">Belum ada data siswa.</td></tr>`;
            return;
        }

        // --- KODE BARU (OPTIMAL) ---
        // 1. Buat HTML string dalam memori dulu (Batching)
        const htmlRows = adminDataCache.map((s, i) => {
            // Logika Filter pindah ke sini
            if (filterClass !== 'Semua' && s.kelas !== filterClass) return '';
            if (filterRoom !== 'Semua' && s.ruangan !== filterRoom) return '';
            
            // Return string HTML baris (tanpa 'tbody.innerHTML +=')
            return `
            <tr class="border-b hover:bg-slate-50 transition group-row">
                <td class="px-2 py-3 text-center"><input type="checkbox" class="student-checkbox rounded border-slate-300 w-3.5 h-3.5" value="${s.id_peserta}" onclick="updateSelectionCount()"></td>
                <td class="px-2 py-3 text-center relative">
                    <button onclick="toggleActionDropdown(${i}, event)" class="bg-blue-50 p-1 rounded hover:bg-blue-100 text-blue-600 transition"><i data-feather="more-horizontal" class="w-3.5 h-3.5"></i></button>
                    <div id="dropdown-${i}" class="action-dropdown text-left z-50">
                        <button onclick="adminNav('add-student')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-700">Edit Data</button>
                        <button onclick="document.getElementById('modal-register-exam').classList.remove('hidden')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-blue-600 font-bold">Daftarkan Ujian</button>
                        <hr class="border-slate-100 my-1">
                        <button onclick="alert('Simulasi: Reset Password')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-600">Reset Password</button>
                        <button onclick="document.getElementById('modal-confirm-delete').classList.remove('hidden')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600 font-bold">Hapus Data</button>
                    </div>
                </td>
                <td class="px-2 py-3 text-center text-slate-500 text-[10px]">${i + 1}</td>
                <td class="px-2 py-3 font-mono text-xs text-slate-600">${s.username}</td>
                <td class="px-2 py-3 font-mono">
                    <div class="flex items-center gap-2 bg-slate-100 px-2 py-1 rounded w-fit">
                        <input type="password" value="${s.pass || '123456'}" class="bg-transparent border-none w-16 text-[10px] focus:ring-0 p-0 text-slate-500" readonly id="pass-${i}">
                        <button onclick="togglePassword(${i})" class="text-slate-400 hover:text-blue-600 transition"><i data-feather="eye" class="w-3 h-3"></i></button>
                    </div>
                </td>
                <td class="px-2 py-3 font-bold text-slate-700 text-xs uppercase whitespace-nowrap">${s.nama}</td>
                <td class="px-2 py-3 text-xs whitespace-nowrap">${s.id_peserta}</td>
                <td class="px-2 py-3"><span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">${s.kelas}</span></td>
                <td class="px-2 py-3 text-xs text-slate-500 whitespace-nowrap">${s.ruangan}</td>
                <td class="px-2 py-3 text-center"><span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">${s.sesi}</span></td>
                <td class="px-2 py-3 text-xs whitespace-nowrap">${s.sekolah || '-'}</td>
                <td class="px-2 py-3 text-xs whitespace-nowrap">${s.agama || '-'}</td>
                <td class="px-2 py-3 text-xs text-slate-400 italic whitespace-nowrap">${s.catatan || '-'}</td>
            </tr>`;
        }).join(''); // Gabung semua baris jadi 1 teks panjang

        // 2. Tempel ke layar SEKALI SAJA (Cepat!)
        tbody.innerHTML = htmlRows;
        
        // 3. Render ulang ikon
        if (typeof feather !== 'undefined') feather.replace();
}

// --- BAGIAN 1: Render Tabel dengan Tombol yang Aman ---
async function fetchClasses() {
    const tbody = document.getElementById('table-classes-body');
    
    // 1. Ambil data terbaru dari Database
    classesData = await DB.getClasses(); 

    // 2. Render HTML
    const htmlRows = classesData.map((item, i) => {
        // Sanitasi dasar
        const safeName = item.name ? item.name.replace(/'/g, "\\'") : '';
        const safeDesc = item.desc ? item.desc.replace(/'/g, "\\'") : '';
        
        // PENTING: Pastikan ID dikirim sebagai string yang aman
        const safeId = String(item.id); 

        return `
        <tr class="border-b hover:bg-slate-50 transition">
            <td class="px-4 py-3 text-center"><input type="checkbox" class="rounded border-slate-300 w-3.5 h-3.5" value="${safeId}"></td>
            <td class="px-4 py-3 text-center text-slate-500 text-xs">${i + 1}</td>
            <td class="px-4 py-3 font-mono font-bold text-slate-700 text-xs whitespace-nowrap"><i data-feather="copy" class="w-3 h-3 inline mr-1 text-slate-400"></i>${item.code}</td>
            <td class="px-4 py-3 text-slate-600 font-bold text-xs uppercase whitespace-nowrap">${item.name}</td>
            <td class="px-4 py-3 text-slate-500 text-xs italic whitespace-nowrap">${item.desc || '-'}</td>
            <td class="px-4 py-3 text-xs"><a href="#" onclick="filterStudents('class', '${safeName}'); return false;" class="text-blue-600 font-bold hover:underline">(${item.count || 0}) Peserta</a></td>
            <td class="px-4 py-3 text-slate-400 text-[10px]">${item.date}</td>
            <td class="px-4 py-3 text-center relative">
                <button onclick="toggleActionDropdown('class-${i}', event)" class="bg-blue-600 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-700 mx-auto shadow-sm">Edit <i data-feather="chevron-down" class="w-3 h-3"></i></button>
                <div id="dropdown-class-${i}" class="action-dropdown text-left z-50">
                    
                    <button onclick="prepareEditClass('${safeId}')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50">Edit Kelas</button>
                    
                    <button onclick="deleteClass('${safeId}')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600">Hapus</button>
                
                </div>
            </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = htmlRows;
    if (typeof feather !== 'undefined') feather.replace();
}
// --- BAGIAN 2: Fungsi Perantara untuk Memastikan Data Edit Terisi ---
function prepareEditClass(id) {
    // Debugging: Cek di console apakah ID masuk
    console.log("Mencari data untuk ID:", id);

    // Gunakan String() untuk membandingkan agar "12" sama dengan 12
    const targetClass = classesData.find(c => String(c.id) === String(id));

    if (targetClass) {
        console.log("Data ditemukan:", targetClass);
        // Buka modal dengan data yang ditemukan
        openEditClassModal(targetClass.id, targetClass.name, targetClass.desc);
    } else {
        alert("Error: Data kelas tidak ditemukan di memori. Silakan refresh halaman.");
    }
}
async function deleteClass(id) {
    // 1. Konfirmasi agar tidak terhapus tidak sengaja
    if (!confirm("⚠️ Yakin ingin menghapus KELAS ini? Data siswa di dalamnya mungkin akan terdampak.")) {
        return;
    }

    // 2. Hapus dari Supabase
    const { error } = await db
        .from('classes')
        .delete()
        .eq('id', id); // Hapus baris yang ID-nya cocok

    // 3. Cek Hasil
    if (error) {
        alert("Gagal menghapus: " + error.message);
    } else {
        alert("✅ Kelas berhasil dihapus.");
        fetchClasses(); // Refresh tabel otomatis
    }
}
// --- PERBAIKAN: Fungsi Modal yang Lebih Tegas ---
// GANTI FUNGSI openEditClassModal DENGAN INI
function openEditClassModal(id = null, name = '', desc = '') {
    // 1. Reset State Global (SANGAT PENTING)
    // Jika id null, artinya Mode Tambah. Jika ada isi, Mode Edit.
    currentEditingClassId = id; 

    console.log("Mode Modal Kelas:", currentEditingClassId ? "EDIT (ID: " + currentEditingClassId + ")" : "TAMBAH BARU");

    // 2. Ambil Elemen HTML
    const inputNama = document.getElementById('edit-class-name');
    const inputDesc = document.getElementById('edit-class-desc');
    const modalTitle = document.getElementById('modal-class-title');
    const btnSave = document.querySelector('#modal-edit-class button[onclick="saveClassData()"]');
    const modal = document.getElementById('modal-edit-class');

    // 3. Reset Form (Kosongkan dulu agar bersih)
    if (inputNama) inputNama.value = '';
    if (inputDesc) inputDesc.value = '';

    // 4. Isi Form (Jika Mode Edit)
    if (id) {
        if (inputNama) inputNama.value = name;
        if (inputDesc) inputDesc.value = desc;
        
        // Ubah UI untuk Mode Edit
        if (modalTitle) modalTitle.innerText = "Edit Data Kelas";
        if (btnSave) btnSave.innerHTML = `<i data-feather="save" class="w-4 h-4 mr-1"></i> Simpan Perubahan`;
    } else {
        // Ubah UI untuk Mode Tambah
        if (modalTitle) modalTitle.innerText = "Tambah Kelas Baru";
        if (btnSave) btnSave.innerHTML = `<i data-feather="plus-circle" class="w-4 h-4 mr-1"></i> Buat Kelas`;
    }

    // 5. Render Ikon & Tampilkan Modal
    if (typeof feather !== 'undefined') feather.replace();
    if (modal) modal.classList.remove('hidden');
}
async function fetchRooms() {
    const tbody = document.getElementById('table-rooms-body');
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8">⏳ Memuat...</td></tr>`;
    
    roomsData = await DB.getRooms();
    
    tbody.innerHTML = '';
    if (roomsData.length === 0) { tbody.innerHTML = `<tr><td colspan="8" class="text-center text-xs py-4">Belum ada ruangan.</td></tr>`; return; }

    const htmlRows = roomsData.map((item, i) => {
        const safeName = item.name ? item.name.replace(/'/g, "\\'") : '';
        const safeDesc = item.desc ? item.desc.replace(/'/g, "\\'") : '';
        const safeId = String(item.id);

        return `
        <tr class="border-b hover:bg-slate-50 transition">
            <td class="px-4 py-3 text-center"><input type="checkbox" class="rounded border-slate-300 w-3.5 h-3.5" value="${safeId}"></td>
            <td class="px-4 py-3 text-center text-slate-500 text-xs">${i + 1}</td>
            <td class="px-4 py-3 font-mono font-bold text-slate-700 text-xs whitespace-nowrap"><i data-feather="copy" class="w-3 h-3 inline mr-1 text-slate-400"></i>${item.code}</td>
            <td class="px-4 py-3 text-slate-600 font-bold text-xs uppercase">${item.name}</td>
            <td class="px-4 py-3 text-slate-500 text-xs italic">${item.desc || '-'}</td>
            <td class="px-4 py-3 text-xs"><a href="#" onclick="filterStudents('room', '${safeName}'); return false;" class="text-blue-600 font-bold hover:underline">(${item.count || 0}) Peserta</a></td>
            <td class="px-4 py-3 text-slate-400 text-[10px]">${item.date}</td>
            <td class="px-4 py-3 text-center relative">
                <button onclick="toggleActionDropdown('room-${i}', event)" class="bg-blue-600 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-700 mx-auto shadow-sm">Edit <i data-feather="chevron-down" class="w-3 h-3"></i></button>
                <div id="dropdown-room-${i}" class="action-dropdown text-left z-50">
                    <button onclick="openEditRoomModal('${safeId}', '${safeName}', '${safeDesc}')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50">Edit Ruangan</button>
                    <button onclick="confirmDelete('${safeId}', 'room')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600">Hapus</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    tbody.innerHTML = htmlRows;
    if (typeof feather !== 'undefined') feather.replace();
}

// --- D. Soal & Ujian ---
function fetchQuestions() { renderQuestionTable(); }
function renderQuestionTable() {
    const tbody = document.getElementById('question-list-body');
    tbody.innerHTML = '';
    if(questions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-xs">Belum ada soal.</td></tr>';
        return;
    }
    questions.forEach((q, i) => {
        tbody.innerHTML += `
        <tr class="border-b">
            <td class="px-4 py-3 text-xs">${i+1}</td>
            <td class="px-4 py-3 font-medium text-slate-700 text-xs truncate max-w-xs">${q.text}</td>
            <td class="px-4 py-3"><span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] font-bold uppercase">${q.type.replace('_',' ')}</span></td>
            <td class="px-4 py-3">${q.media ? '<i data-feather="paperclip" class="w-3 h-3"></i>' : '-'}</td>
            <td class="px-4 py-3 text-center"><button onclick="deleteQuestion(${i})" class="text-red-500 hover:text-red-700"><i data-feather="trash-2" class="w-4 h-4"></i></button></td>
        </tr>`;
    });
    feather.replace();
}

async function saveQuestion() {
    const text = document.getElementById('q-text').value;
    const type = document.getElementById('q-type').value;
    const mediaFile = document.getElementById('q-media').files[0];
    let mediaName = null;

    // Catatan: Jika ingin upload gambar asli, perlu konfigurasi Supabase Storage tambahan.
    if(mediaFile) mediaName = mediaFile.name; 

    const btn = document.querySelector('#modal-add-question button[onclick="saveQuestion()"]');
    if(btn) btn.innerText = "Menyimpan...";

    // Insert ke Database
    const { data, error } = await db
        .from('questions')
        .insert([{
            text: text,
            type: type,
            media: mediaName,
            // exam_id: currentEditingExamId // Aktifkan baris ini jika Anda sudah menghubungkan ID ujian
        }]);

    if(error) {
        alert("Gagal: " + error.message);
    } else {
        // Update tampilan lokal
        questions.push({ text, type, media: mediaName });
        document.getElementById('modal-add-question').classList.add('hidden');
        renderQuestionTable();
        document.getElementById('q-text').value = '';
        alert("Soal tersimpan di Database!");
    }
    if(btn) btn.innerText = "Simpan";
}

function deleteQuestion(index) {
    if(confirm("Hapus soal ini?")) {
        questions.splice(index, 1);
        renderQuestionTable();
    }
}

// --- FUNGSI TAMBAH UJIAN (INSERT) ---
async function addNewExam() { 
    // 1. Minta Input Nama
    const name = prompt("Masukkan Nama Mata Pelajaran Ujian:"); 
    
    if (name) { 
        // 2. Kirim Data ke Supabase
        const { data, error } = await db
            .from('exams') // Pastikan nama tabel di Supabase adalah 'exams'
            .insert([
                { 
                    nama_ujian: name,      // Kolom DB: nama_ujian
                    status: 'Tidak Aktif', // Default
                    alokasi: '90 Menit',   // Default
                    peserta: 0,
                    pengelola: 'Admin'
                }
            ])
            .select();

        // 3. Cek Hasil
        if (error) {
            console.error("Error:", error);
            alert("Gagal membuat ujian: " + error.message);
        } else {
            alert("✅ Ujian berhasil dibuat!");
            renderExamList();        // Refresh Tabel Ujian
            updateDashboardStats();  // Refresh Angka di Dashboard
        }
    } 
}
async function renderExamList() {
    const container = document.getElementById('exam-list-body');
    container.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500"><span class="animate-spin">⏳</span> Memuat data ujian...</td></tr>`;
    exams = await DB.getExams();
    container.innerHTML = '';
    if (exams.length === 0) {
        container.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">Belum ada jadwal ujian. Silakan buat baru.</td></tr>`;
        return;
    }
    // --- KODE BARU (OPTIMAL) ---
    const htmlRows = exams.map((ex, i) => {
        // Logika tampilan status tetap dimasukkan di sini
        const statusClass = ex.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200';
        const btnActionText = ex.status === 'Aktif' ? "Nonaktifkan Ujian" : "Aktifkan Ujian";
        const btnActionColor = ex.status === 'Aktif' ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50";

        return `
        <tr class="border-b hover:bg-slate-50 transition-colors">
            <td class="w-24 text-center py-3 relative">
                <div class="inline-flex rounded-md shadow-sm" role="group">
                    <button onclick="openExamDetail('${ex.name}')" type="button" class="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-l-lg hover:bg-blue-700">Detail</button>
                    <button onclick="toggleActionDropdown('exam-${i}', event)" type="button" class="px-2 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-r-lg hover:bg-blue-700 border-l border-blue-700"><i data-feather="chevron-down" class="w-3 h-3"></i></button>
                </div>
                <div id="dropdown-exam-${i}" class="action-dropdown text-left z-50 font-medium text-slate-600 text-[11px] py-1">
                    <button onclick="openExamDetail('${ex.name}')" class="block w-full text-left px-4 py-2 hover:bg-blue-50 font-bold border-b">Detail Soal</button>
                    <button onclick="openExamParticipants('${ex.name}')" class="block w-full text-left px-4 py-1.5 hover:bg-slate-50 text-blue-600 font-bold">Daftar Peserta</button>
                    <button onclick="openRecapView('${ex.name}')" class="block w-full text-left px-4 py-1.5 hover:bg-slate-50">Rekap Pengerjaan</button>
                    <button onclick="openExamSettings('${ex.name}', ${ex.id})" class="block w-full text-left px-4 py-1.5 hover:bg-slate-50">Pengaturan</button>
                    <hr class="my-1"><button onclick="toggleExamStatus(${i})" class="block w-full text-left px-4 py-1.5 font-bold ${btnActionColor}">${btnActionText}</button>
                    <hr class="my-1"><button onclick="deleteExam(${i})" class="block w-full text-left px-4 py-1.5 hover:bg-red-50 text-red-500">Hapus Ujian</button>
                </div>
            </td>
            <td class="py-3 px-4 font-bold text-slate-700 uppercase text-xs">${ex.name}</td>
            <td class="py-3 px-4 text-xs"><a href="#" onclick="openExamParticipants('${ex.name}'); return false;" class="text-blue-600 font-bold">(${ex.peserta}) Peserta</a></td>
            <td class="py-3 px-4 text-slate-500 text-xs">${ex.pengelola}</td>
            <td class="py-3 px-4 font-mono font-bold text-slate-700 text-xs">${ex.alokasi}</td>
            <td class="py-3 px-4"><span class="${statusClass} px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide">${ex.status}</span></td>
            <td class="py-3 px-4 text-slate-400 text-xs">-</td>
            <td class="py-3 px-4 text-slate-400 text-xs">-</td>
        </tr>`;
    }).join('');

    container.innerHTML = htmlRows;
    feather.replace();
}

async function toggleExamStatus(index) {
    const exam = exams[index];
    const newStatus = exam.status === 'Aktif' ? 'Tidak Aktif' : 'Aktif';
    
    // Update ke Database
    const { error } = await db
        .from('exams')
        .update({ status: newStatus })
        .eq('id', exam.id);

    if (!error) {
        exams[index].status = newStatus; // Update Lokal
        renderExamList();
        updateDashboardStats();
    } else {
        alert("Gagal update: " + error.message);
    }
}

async function deleteExam(index) {
    const exam = exams[index];
    if(confirm("Hapus ujian ini beserta seluruh datanya secara PERMANEN?")) {
        // Hapus dari Database
        const { error } = await db
            .from('exams')
            .delete()
            .eq('id', exam.id);

        if (!error) {
            exams.splice(index, 1); // Update Lokal
            renderExamList();
            updateDashboardStats();
        } else {
            alert("Gagal menghapus: " + error.message);
        }
    }
}

// --- E. Cetak Kartu & Print ---
function handlePrint() {
    if (!adminDataCache || adminDataCache.length === 0) {
        alert("Data peserta kosong! Silakan muat data terlebih dahulu.");
        return;
    }
    renderCardPreview(); // Render sebelum clone
    const previewContent = document.getElementById('card-preview-area').innerHTML;
    let printContainer = document.getElementById('print-result');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-result';
        document.body.appendChild(printContainer);
    }
    printContainer.innerHTML = previewContent;
    const originalBodyClass = document.body.className;
    document.body.className = "bg-white"; 
    setTimeout(() => {
        window.print();
        document.body.className = originalBodyClass;
        printContainer.remove();
    }, 500);
}

function renderCardPreview() {
    const container = document.getElementById('card-preview-area');
    if (!container) return;

    // Input Values
    const h1 = document.getElementById('card-h1')?.value || '';
    const h2 = document.getElementById('card-h2')?.value || '';
    const h3 = document.getElementById('card-h3')?.value || '';
    const title = document.getElementById('card-title')?.value || '';
    const subtitle = document.getElementById('card-subtitle')?.value || '';
    const teacherName = document.getElementById('card-teacher')?.value || '';
    const teacherNip = document.getElementById('card-nip')?.value || '';
    const today = new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'});

    const filterClass = document.getElementById('filter-class')?.value || 'Semua';
    const filterRoom = document.getElementById('filter-room')?.value || 'Semua';

    container.innerHTML = '';
    
    // Filter Data untuk Cetak
    const dataToPrint = adminDataCache.filter(s => {
        const matchClass = filterClass === 'Semua' || s.kelas === filterClass;
        const matchRoom = filterRoom === 'Semua' || s.ruangan === filterRoom;
        return matchClass && matchRoom;
    });

    if (dataToPrint.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#999; font-size:12px; grid-column:1/-1;">Data kosong / Tidak ada yang cocok filter.</div>';
        return;
    }

    dataToPrint.forEach((s) => {
        const imgDisplay = cardSignatureData ? `block` : `none`;
        const spacerDisplay = cardSignatureData ? `none` : `block`;
        
        const d = document.createElement('div');
        d.className = "exam-card";
        d.innerHTML = `
            <div class="exam-card-header">
                <img src="${cardLogoData}" class="exam-card-logo" style="display:block;">
                <div class="exam-card-header-text">
                    <div class="exam-card-h1">${h1}</div>
                    <div class="exam-card-h2">${h2}</div>
                    <div class="exam-card-h3">${h3}</div>
                </div>
            </div>
            <div class="exam-card-body">
                <div class="exam-card-photo-box">FOTO</div>
                <div class="exam-card-info">
                    <div class="exam-card-title">${title}</div>
                    <div class="exam-card-subtitle">${subtitle}</div>
                    <div class="exam-card-row"><div class="exam-card-label">Nama</div><div class="exam-card-val">: ${s.nama}</div></div>
                    <div class="exam-card-row"><div class="exam-card-label">No. Pst</div><div class="exam-card-val">: ${s.id_peserta}</div></div>
                    <div class="exam-card-row"><div class="exam-card-label">User</div><div class="exam-card-val">: ${s.username}</div></div>
                    <div class="exam-card-row"><div class="exam-card-label">Pass</div><div class="exam-card-val">: ${s.pass}</div></div>
                    <div class="exam-card-signature-area">
                        <div class="exam-card-date">Jakarta, ${today}</div>
                        <div class="exam-card-date">Kepala Sekolah,</div>
                        <img src="${cardSignatureData}" class="exam-card-sign-img" style="display:${imgDisplay};">
                        <div style="height:20px; display:${spacerDisplay};"></div>
                        <div class="exam-card-teacher-name">${teacherName}</div>
                        <div class="exam-card-teacher-nip">${teacherNip}</div>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(d);
    });
}

function updateCardLogo(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) { cardLogoData = e.target.result; renderCardPreview(); }
        reader.readAsDataURL(input.files[0]);
    }
}
function updateCardSignature(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) { cardSignatureData = e.target.result; renderCardPreview(); }
        reader.readAsDataURL(input.files[0]);
    }
}

// --- F. Utilitas & Interaksi UI ---
function switchSettingTab(e, tabId) {
    document.querySelectorAll('.setting-content').forEach(c => c.classList.add('hidden-view'));
    document.getElementById('set-' + tabId).classList.remove('hidden-view');
    document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
    if (e && e.currentTarget) e.currentTarget.classList.add('active');
    else {
        const btn = document.querySelector(`.settings-nav-item[onclick*="'${tabId}'"]`);
        if(btn) btn.classList.add('active');
    }
}

function switchBankTab(tab) {
    document.getElementById('view-bank-soal').classList.add('hidden-view');
    document.getElementById('view-bank-ujian').classList.add('hidden-view');
    document.getElementById('view-exam-detail').classList.add('hidden-view');
    document.getElementById('view-exam-participants').classList.add('hidden-view');
    document.getElementById('tab-soal').classList.remove('active');
    document.getElementById('tab-ujian').classList.remove('active');
    document.getElementById('view-bank-'+tab).classList.remove('hidden-view');
    document.getElementById('tab-'+tab).classList.add('active');
    if(tab === 'ujian') renderExamList();
}

function playTicker() {
    const tickerEl = document.getElementById('dynamic-ticker');
    const container = document.querySelector('.ticker-container');
    if(!tickerEl || !container) return;

    const currentMsg = tickerMessages[tickerIndex];
    tickerEl.className = 'ticker-text';
    tickerEl.style.animationDuration = ''; 
    tickerEl.style.width = ''; 
    void tickerEl.offsetWidth; 

    if (currentMsg.anim === 'anim-scroll') {
        container.style.justifyContent = 'flex-start';
        tickerEl.style.width = 'auto'; 
    } else {
        container.style.justifyContent = 'center';
        tickerEl.style.width = 'auto';
    }

    tickerEl.innerHTML = currentMsg.text;
    tickerEl.classList.add(currentMsg.anim);

    let displayDuration = currentMsg.duration;
    if (currentMsg.anim === 'anim-scroll') {
        const textWidth = tickerEl.scrollWidth;
        const containerWidth = container.offsetWidth;
        const totalDistance = containerWidth + textWidth;
        const dynamicDuration = totalDistance / 90; // Speed logic
        tickerEl.style.animationDuration = `${dynamicDuration}s`;
        displayDuration = (dynamicDuration * 1000); 
    }

    setTimeout(() => {
        tickerIndex++;
        if (tickerIndex >= tickerMessages.length) tickerIndex = 0;
        playTicker(); 
    }, displayDuration);
}
// ==========================================
// FITUR TOKEN & TIMER REALTIME (SUPABASE)
// ==========================================
let tokenInterval = null;

async function initRealTokenSystem() {
    // 1. Ambil Data Token Terakhir dari Database saat pertama kali buka
    fetchTokenData();

    // 2. Pasang Pendengar Realtime (Agar kalau di-generate ulang di HP lain, di sini ikut berubah)
    db.channel('public:exam_settings')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_settings' }, (payload) => {
            console.log("Token diperbarui:", payload.new);
            handleTokenUpdate(payload.new);
        })
        .subscribe();
}

async function fetchTokenData() {
    // Pastikan tabel exam_settings sudah dibuat di SQL Editor (ID 1)
    const { data, error } = await db.from('exam_settings').select('*').eq('id', 1).single();
    if (data) {
        handleTokenUpdate(data);
    }
}

function handleTokenUpdate(data) {
    // Update Teks Token & Timer
    const els = ['dash-token', 'setting-token-display'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = data.token_code;
    });

    if(data.expired_at) {
        startRealTimer(new Date(data.expired_at));
    }

    // --- BAGIAN PENTING: Update Input Form Pengaturan ---
    const inputDurasi = document.getElementById('token-duration');
    const toggleAuto = document.getElementById('toggle-auto-token');

    // Isi input durasi dengan data dari database
    if (inputDurasi && data.token_duration) {
        inputDurasi.value = data.token_duration;
    }
    
    // Centang/Uncentang toggle sesuai database
    if (toggleAuto && data.auto_refresh !== undefined) {
        toggleAuto.checked = data.auto_refresh;
    }
}

function startRealTimer(targetTime) {
    if (tokenInterval) clearInterval(tokenInterval);

    function updateTimer() {
        const now = new Date();
        const diff = targetTime - now; // Selisih waktu sekarang dengan waktu habis

        if (diff <= 0) {
            // Waktu Habis
            clearInterval(tokenInterval);
            updateTimerDisplay("0:00:00", 0);
            return;
        }

        // Konversi selisih milidetik ke Jam:Menit:Detik
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / (1000 * 60)) % 60);
        const s = Math.floor((diff / 1000) % 60);

        const txt = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        updateTimerDisplay(txt, diff);
    }

    updateTimer(); // Jalankan sekali langsung
    tokenInterval = setInterval(updateTimer, 1000); // Ulangi tiap detik
}

function updateTimerDisplay(text, remainingMs) {
    ['dash-timer', 'setting-timer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.innerText = text;
    });
    
    // Animasi Lingkaran
    const circle = document.querySelector('.progress-ring__circle');
    if (circle) {
        const totalDuration = 15 * 60 * 1000; // Asumsi durasi 15 Menit full
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        
        const percent = Math.max(0, (remainingMs / totalDuration) * 100);
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }
}

// Fungsi Tombol "Generate Baru"
async function regenerateToken() {
    const btn = document.querySelector('button[onclick="regenerateToken()"]');
    if(btn) { btn.innerText = "..."; btn.disabled = true; }

    try {
        // 1. AMBIL DURASI DARI DATABASE DULU (PENTING!)
        const { data: setting, error: fetchError } = await db
            .from('exam_settings')
            .select('token_duration')
            .eq('id', 1)
            .single();
        
        // Jika gagal ambil, pakai default 15 menit
        const durationMinutes = (setting && setting.token_duration) ? setting.token_duration : 15; 

        // 2. Buat Token Acak
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; 
        let newToken = "";
        for (let i = 0; i < 6; i++) newToken += chars.charAt(Math.floor(Math.random() * chars.length));

        // 3. Hitung Waktu Expired Berdasarkan Durasi Database
        const now = new Date();
        const expiredAt = new Date(now.getTime() + durationMinutes * 60000); 

        // 4. Simpan Token Baru ke Database
        const { error } = await db.from('exam_settings').update({
            token_code: newToken,
            expired_at: expiredAt.toISOString()
        }).eq('id', 1);

        if (error) throw error;

    } catch (err) {
        console.error("Gagal generate:", err);
        alert("Gagal generate token: " + err.message);
    } finally {
        if(btn) { 
            // Kembalikan tombol seperti semula (Pakai Icon HTML)
            btn.innerHTML = `<i data-feather="refresh-cw" class="w-4 h-4"></i> Generate Baru`; 
            btn.disabled = false; 
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
}
// --- FUNGSI SIMPAN PENGATURAN (VERSI FIX: HAPUS VARIABEL 'e') ---
async function saveTokenSettings(btnElement) {
    // 1. Definisikan tombol
    // Kita langsung pakai 'btnElement' yang dikirim dari HTML (this)
    let btn = btnElement;

    // Safety check: Jika tombol tidak terdeteksi (misal karena error loading),
    // kita cari manual menggunakan DOM selector sebagai cadangan.
    if (!btn) {
        btn = document.querySelector("button[onclick*='saveTokenSettings']");
    }

    // Pastikan yang kita pegang adalah elemen Button (bukan ikon di dalamnya)
    if (btn && btn.tagName !== 'BUTTON') {
        btn = btn.closest('button');
    }

    // Jika masih null, stop agar tidak error
    if (!btn) {
        console.error("Tombol Simpan tidak ditemukan!");
        return;
    }

    // 2. Simpan teks asli (untuk dikembalikan setelah loading)
    const originalContent = btn.innerHTML;

    // 3. Ambil data dari Input
    const durationInput = document.getElementById('token-duration');
    const autoRefreshInput = document.getElementById('toggle-auto-token');

    if (!durationInput || !autoRefreshInput) {
        alert("Error: Elemen input (token-duration/toggle) tidak ditemukan di HTML.");
        return;
    }

    const durationVal = parseInt(durationInput.value);
    const autoRefreshVal = autoRefreshInput.checked; // Mengambil status centang

    if (!durationVal || durationVal < 1) {
        alert("Durasi minimal 1 menit!");
        return;
    }

    // 4. Ubah tombol jadi Loading
    btn.innerHTML = `<span class="animate-spin">⏳</span> Menyimpan...`;
    btn.disabled = true;

    try {
        // 5. Simpan ke Database
        const { error } = await db.from('exam_settings').update({
            token_duration: durationVal,
            auto_refresh: autoRefreshVal
        }).eq('id', 1);

        if (error) throw error;

        alert("✅ Pengaturan Berhasil Disimpan!");

    } catch (err) {
        console.error("Error Simpan:", err);
        alert("Gagal menyimpan: " + err.message);
    } finally {
        // 6. Kembalikan tombol ke kondisi semula
        btn.innerHTML = originalContent;
        btn.disabled = false;
        
        // Render ulang ikon feather jika library tersedia
        if (typeof feather !== 'undefined') feather.replace();
    }
}
// UI Helpers
function getEl(id) { return document.getElementById(id); }
function safeSetText(id, text) { const el = getEl(id); if (el) el.innerText = text; }
function toggleFullScreen() { if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else if(document.exitFullscreen) document.exitFullscreen(); }
function toggleProfileMenu(e) { e.stopPropagation(); const d=document.getElementById('profile-dropdown'); d.classList.toggle('hidden'); d.classList.toggle('show'); }
function closeDropdowns(e) {
    if (!e || (e && !e.target.closest('#profile-dropdown'))) { document.getElementById('profile-dropdown')?.classList.add('hidden'); }
    if (e && !e.target.closest('.action-dropdown')) { document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show')); }
    if (e && !e.target.closest('.bulk-dropdown')) { document.querySelectorAll('.bulk-dropdown').forEach(d => d.classList.remove('show')); }
}
function toggleActionDropdown(id, e) {
    e.stopPropagation(); 
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show'));
    document.getElementById('dropdown-' + id)?.classList.toggle('show');
}
function toggleBulkActions(e) { e.stopPropagation(); document.getElementById('dropdown-bulk-actions').classList.toggle('show'); }
function filterStudents(type, value) {
    adminNav('students');
    
    // Update nilai dropdown sesuai pilihan
    const sel = document.getElementById(type === 'class' ? 'filter-class' : 'filter-room');
    if(sel) sel.value = value;
    
    // --- PERBAIKAN: Panggil dengan TRUE ---
    // Artinya: "Tolong tampilkan ulang tabel, tapi JANGAN download data baru, pakai yang sudah ada saja."
    fetchAdminData(true); 
}
function updateSelectionCount() {
    const checkboxes = document.querySelectorAll('.student-checkbox:checked');
    document.getElementById('selection-count').innerText = `(${checkboxes.length}) Terseleksi`;
}
function toggleAllStudents(source) {
    document.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = source.checked);
    updateSelectionCount();
}
function togglePassword(i) {
    const input = document.getElementById('pass-' + i);
    if(input) input.type = (input.type === "password") ? "text" : "password";
}

// --- Detail & Settings Ujian ---
function openExamDetail(name) {
    document.getElementById('view-bank-ujian').classList.add('hidden-view');
    document.getElementById('view-exam-detail').classList.remove('hidden-view');
    document.getElementById('detail-exam-title').innerText = name;
}
function closeExamDetail() {
    document.getElementById('view-exam-detail').classList.add('hidden-view');
    document.getElementById('view-bank-ujian').classList.remove('hidden-view');
}
function openExamSettings(examName, examId) {
    // 1. Simpan ID yang sedang diedit
    currentEditingExamId = examId;
    
    // 2. Cari data ujian spesifik dari memori (yang sudah di-fetch dari DB)
    // Pastikan konversi tipe data ID aman (String vs Number)
    const examData = exams.find(e => e.id == examId); 

    if (examData) {
        // --- ISI FORM INFO UTAMA ---
        document.getElementById('input-exam-name').value = examData.name;
        document.getElementById('setting-exam-name').innerText = examData.name;
        
        // Konversi "90 Menit" menjadi angka "90" untuk input number
        const allocNumber = parseInt(examData.alokasi) || 90;
        document.getElementById('sched-alloc').value = allocNumber;

        // --- ISI FORM PENGATURAN LAINNYA (SINKRONISASI) ---
        // Kita isi value <select> sesuai data dari database
        document.getElementById('input-random-packet').value = examData.acakPaket;
        document.getElementById('input-random-question').value = examData.acakSoal;
        document.getElementById('input-random-option').value = examData.acakOpsi;
        document.getElementById('input-show-score-student').value = examData.tampilNilai;
        
        // Set status dropdown (0/1 atau active/inactive)
        const statusVal = (examData.status === 'Aktif') ? '1' : '0';
        document.getElementById('input-exam-status').value = statusVal;
    }

    // 3. Update tampilan ringkasan sidebar agar sesuai data yang baru dimuat
    updateRealtimeSummary();
    updateScheduleInfo();
    
    // 4. Tampilkan View Pengaturan
    closeDropdowns(null);
    document.getElementById('panel-questions').classList.add('hidden-view');
    document.getElementById('view-exam-settings').classList.remove('hidden-view');
    document.querySelector('#view-exam-settings .custom-scrollbar')?.scrollTo(0,0);
}
function closeExamSettings() {
    document.getElementById('view-exam-settings').classList.add('hidden-view');
    document.getElementById('panel-questions').classList.remove('hidden-view');
    switchBankTab('ujian');
}
async function saveSpecificSettings(section) {
    // 1. Cek apakah ada ujian yang sedang diedit
    if (!currentEditingExamId) return;

    let updateData = {}; // Objek untuk menampung data yang mau diubah

    // 2. Tentukan data apa yang mau diubah berdasarkan Section
    if (section === 'info') {
        const newName = document.getElementById('input-exam-name').value;
        const statusVal = document.getElementById('input-exam-status').value;
        // Konversi nilai dropdown "1"/"0" menjadi text 'Aktif'/'Tidak Aktif' sesuai filter Dashboard
        const statusText = (statusVal === "1" || statusVal === "active") ? 'Aktif' : 'Tidak Aktif';
        
        updateData = { 
            nama_ujian: newName, // Pastikan nama kolom di DB 'nama_ujian' atau 'name'
            status: statusText 
        };
    } 
    else if (section === 'jadwal') {
        const alloc = document.getElementById('sched-alloc').value;
        updateData = { 
            alokasi: `${alloc} Menit` // Pastikan nama kolom DB sesuai
        };
    } 
    else if (section === 'lainnya') {
        updateData = {
            acak_paket: document.getElementById('input-random-packet').value,
            acak_soal: document.getElementById('input-random-question').value,
            acak_opsi: document.getElementById('input-random-option').value,
            tampil_nilai: document.getElementById('input-show-score-student').value
        };
    }

    // 3. Kirim Update ke Supabase
    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = "Menyimpan...";
    btn.disabled = true;

    const success = await DB.updateExam(currentEditingExamId, updateData);

    if (success) {
            alert("✅ Pengaturan berhasil disimpan ke Database!");
            
            // Mapping Data DB ke Data Aplikasi agar Tabel tidak Error
            const examIndex = exams.findIndex(e => e.id === currentEditingExamId);
            if (examIndex !== -1) {
                if (section === 'info') {
                    exams[examIndex].name = updateData.nama_ujian;
                    exams[examIndex].status = updateData.status;
                } 
                else if (section === 'jadwal') {
                    exams[examIndex].alokasi = updateData.alokasi;
                }
                else if (section === 'lainnya') {
                    exams[examIndex].acakPaket = updateData.acak_paket;
                    exams[examIndex].acakSoal = updateData.acak_soal;
                    exams[examIndex].acakOpsi = updateData.acak_opsi;
                    exams[examIndex].tampilNilai = updateData.tampil_nilai;
                }
            }
            renderExamList(); 
        }
    
    btn.innerText = oldText;
    btn.disabled = false;
}
function updateRealtimeSummary() {
    const titleVal = document.getElementById('input-exam-name')?.value || "NAMA UJIAN";
    safeSetText('summary-title', titleVal.toUpperCase());
    safeSetText('summary-desc', document.getElementById('input-exam-desc')?.value.toUpperCase() || "SELAMAT MENGERJAKAN");
    
    // Status
    const statusSelect = document.getElementById('input-exam-status');
    const statusContainer = document.getElementById('summary-status-container');
    if(statusSelect && statusContainer) {
        const val = statusSelect.value;
        statusContainer.innerHTML = (val === "1" || val === "active") 
            ? `: <span class="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold text-[10px]">Aktif</span>`
            : `: <span class="bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-bold text-[10px]">Tidak Aktif</span>`;
    }
    // Opsi Lain
    const selPaket = document.getElementById('input-random-packet');
    if(selPaket) document.getElementById('summary-packet').innerText = ": " + selPaket.options[selPaket.selectedIndex].text;
    const selSoal = document.getElementById('input-random-question');
    if(selSoal) document.getElementById('summary-question').innerText = ": " + selSoal.options[selSoal.selectedIndex].text;
    const selScore = document.getElementById('input-show-score-student');
    if(selScore) document.getElementById('summary-show-score').innerText = ": " + selScore.options[selScore.selectedIndex].text;
}
function updateScheduleInfo() {
    const startVal = document.getElementById('sched-start')?.value;
    const endVal = document.getElementById('sched-end')?.value;
    const allocVal = document.getElementById('sched-alloc')?.value || 0;
    const submitVal = document.getElementById('sched-submit')?.value || 0;
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    
    if(startVal) safeSetText('view-start', ": " + new Date(startVal).toLocaleDateString('en-US', options));
    if(endVal) safeSetText('view-end', ": " + new Date(endVal).toLocaleDateString('en-US', options));
    
    document.getElementById('view-alloc').innerText = `: ${allocVal} Menit`;
    document.getElementById('summary-alloc').innerText = `: ${allocVal} Menit`;
    document.getElementById('view-submit').innerText = `: ${submitVal} Menit`;
    
    if(startVal && endVal) {
        const diff = Math.floor((new Date(endVal) - new Date(startVal)) / 60000);
        if(diff > 0) {
            const h = Math.floor(diff/60), m = diff%60;
            const txt = `: ${h}:${m.toString().padStart(2,'0')}:00 (${diff} Menit)`;
            document.getElementById('view-duration').innerText = txt;
            document.getElementById('summary-duration').innerText = txt;
        } else {
            document.getElementById('view-duration').innerText = ": Waktu Invalid";
        }
    }
}

// --- G. Modal & Fitur Lain ---
function openAddParticipantInfo() { document.getElementById('modal-info-add-participant').classList.remove('hidden'); }
function showAddStudentForm() { adminNav('add-student'); document.querySelectorAll('#panel-add-student input').forEach(i => i.value = ''); clearAddImage(); }
function clearAddImage() { 
    document.getElementById('file-upload-add').value = ''; 
    document.getElementById('preview-foto-add').src = ''; 
    document.getElementById('preview-foto-add').classList.add('hidden'); 
    document.getElementById('icon-foto-add').classList.remove('hidden'); 
    document.getElementById('filename-add').innerText = 'Tidak ada berkas.'; 
}
function previewAddImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('preview-foto-add').src = e.target.result;
            document.getElementById('preview-foto-add').classList.remove('hidden');
            document.getElementById('icon-foto-add').classList.add('hidden');
            document.getElementById('filename-add').innerText = input.files[0].name;
        }
        reader.readAsDataURL(input.files[0]);
    }
}
// GANTI SELURUH FUNGSI saveClassData DENGAN INI
async function saveClassData() {
    // 1. Ambil Value dari Input
    const inputNama = document.getElementById('edit-class-name');
    const inputDesc = document.getElementById('edit-class-desc');
    const btnSave = document.querySelector('#modal-edit-class button[onclick="saveClassData()"]');

    const namaKelas = inputNama ? inputNama.value.trim() : "";
    const deskripsi = inputDesc ? inputDesc.value.trim() : "";

    // 2. Validasi
    if (!namaKelas) {
        alert("⚠️ Nama kelas wajib diisi!");
        inputNama.focus();
        return;
    }

    // 3. Ubah Tombol jadi Loading
    const originalText = btnSave.innerHTML;
    btnSave.innerHTML = `<span class="animate-spin">⏳</span> Menyimpan...`;
    btnSave.disabled = true;

    try {
        let success = false;
        
        // PENTING: Simpan status edit ke variabel lokal SEBELUM proses reset terjadi
        // Kita kunci nilainya di sini agar tidak hilang saat modal ditutup
        const isEditMode = currentEditingClassId; 

        // 4. LOGIKA CABANG: EDIT atau TAMBAH?
        if (isEditMode) {
            // === MODE UPDATE ===
            console.log("Melakukan Update ke ID:", isEditMode);
            success = await DB.updateClass(isEditMode, {
                nama_kelas: namaKelas,
                deskripsi: deskripsi
            });
        } else {
            // === MODE INSERT ===
            console.log("Melakukan Insert Baru");
            const kodeKelas = "KLS-" + Math.floor(Math.random() * 100000);
            success = await DB.addClass({
                nama_kelas: namaKelas,
                kode_kelas: kodeKelas,
                deskripsi: deskripsi || "Kelas Reguler"
            });
        }

        // 5. Handling Hasil
        if (success) {
            // A. Tutup Modal (Ini akan mereset currentEditingClassId global jadi null)
            closeEditClassModal(); 
            
            // B. Refresh Tabel
            await fetchClasses(); 

            // C. Tampilkan Pesan (Gunakan variabel lokal 'isEditMode' yang sudah kita amankan tadi)
            const pesan = isEditMode ? "Data kelas berhasil diperbarui!" : "Kelas baru berhasil dibuat!";
            showSuccessAlert(pesan); 
        }

    } catch (err) {
        console.error("Error Saving Class:", err);
        alert("Terjadi kesalahan sistem: " + err.message);
    } finally {
        // 6. Kembalikan Tombol
        if (btnSave) {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
            if (typeof feather !== 'undefined') feather.replace();
        }
    }
}
// TAMBAHKAN FUNGSI INI DI BAWAH saveClassData
function closeEditClassModal() {
    const modal = document.getElementById('modal-edit-class');
    if (modal) modal.classList.add('hidden');
    
    // PENTING: Reset ID agar saat tombol "Tambah" ditekan nanti, tidak membawa ID sisa edit
    currentEditingClassId = null; 
    
    // Reset Form
    document.getElementById('edit-class-name').value = '';
    document.getElementById('edit-class-desc').value = '';
}
async function saveRoomData() {
    const inputNama = document.getElementById('edit-room-name');
    const inputDesc = document.getElementById('edit-room-desc');
    const btnSave = document.querySelector('#modal-edit-room button[onclick="saveRoomData()"]');

    const nama = inputNama ? inputNama.value.trim() : "";
    const desc = inputDesc ? inputDesc.value.trim() : "";

    if (!nama) { alert("⚠️ Nama ruangan wajib diisi!"); return; }

    // Loading State
    const originalText = btnSave.innerHTML;
    btnSave.innerHTML = `<span class="animate-spin">⏳</span> Menyimpan...`;
    btnSave.disabled = true;

    try {
        let success = false;
        // Simpan status edit di variabel lokal
        const isEditMode = currentEditingRoomId; 

        if (isEditMode) {
            // === UPDATE ===
            success = await DB.updateRoom(isEditMode, {
                nama_ruangan: nama,
                deskripsi: desc
            });
        } else {
            // === INSERT ===
            const kode = "R-" + Math.floor(Math.random() * 1000);
            success = await DB.addRoom({
                nama_ruangan: nama,
                kode_ruangan: kode,
                deskripsi: desc
            });
        }

        if (success) {
            closeEditRoomModal();
            await fetchRooms(); // Refresh tabel
            
            // Panggil Modal Sukses Baru
            const pesan = isEditMode ? "Data ruangan berhasil diperbarui!" : "Ruangan baru berhasil dibuat!";
            showSuccessAlert(pesan); 
        }

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    } finally {
        btnSave.innerHTML = originalText;
        btnSave.disabled = false;
        if (typeof feather !== 'undefined') feather.replace();
    }
}
function showCardPreview() { adminNav('card-print'); renderCardPreview(); }

// Modal Helper
function openAddQuestionModal() { document.getElementById('modal-add-question').classList.remove('hidden'); renderAnswerInputs(); }
function renderAnswerInputs() {
    const type = document.getElementById('q-type').value;
    const container = document.getElementById('answer-container');
    container.innerHTML = '';
    if(type === 'pg') container.innerHTML = `<p class="text-xs font-bold mb-2">Jawaban</p>${['A','B','C','D','E'].map(o => `<div class="flex gap-2 mb-2"><input type="radio" name="c"><span class="font-bold w-4">${o}.</span><input class="flex-1 border p-1 rounded text-xs" placeholder="Isi Jawaban"></div>`).join('')}`;
    else if(type === 'essay') container.innerHTML = '<p class="text-xs italic text-slate-400">Essay dikoreksi manual.</p>';
}

function uploadImportFile(input) { 
    if(input.files[0]) { alert("Import Sukses!"); fetchQuestions(); } 
    input.value = ''; 
}
function toggleSection(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if(el.classList.contains('hidden')) { el.classList.remove('hidden'); icon.style.transform = 'rotate(180deg)'; }
    else { el.classList.add('hidden'); icon.style.transform = 'rotate(0deg)'; }
}

// Rekap & Export
function openRecapView(name) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden-view'));
    document.getElementById('view-recap').classList.remove('hidden-view');
    document.getElementById('recap-exam-title').innerText = name;
    filterRecapData();
    closeDropdowns(null);
}
function closeRecapView() { document.getElementById('view-recap').classList.add('hidden-view'); switchBankTab('ujian'); }
function filterRecapData() {
    // Mock Recap Data
    currentRecapData = [
        { name: "Budi Santoso", class: "XII IPA 1", room: "Lab 1", score: 85, answers: "A,B,C..." },
        { name: "Siti Aminah", class: "XII IPA 1", room: "Lab 1", score: 92, answers: "A,A,C..." }
    ];
    renderRecapTable(currentRecapData);
}
function renderRecapTable(data) {
    const tbody = document.getElementById('recap-table-body');
    tbody.innerHTML = '';
    data.forEach((r, i) => {
        tbody.innerHTML += `<tr class="border-b"><td class="py-3 px-6">${i+1}</td><td class="py-3 px-6">${r.name}</td><td class="py-3 px-6 font-bold text-emerald-600">${r.score}</td><td class="py-3 px-6 text-xs font-mono">${r.answers}</td></tr>`;
    });
}
function openExportRecapModal() { document.getElementById('modal-export-recap').classList.remove('hidden'); }
function executeExportRecap() { document.getElementById('modal-export-recap').classList.add('hidden'); alert("Data berhasil di-export ke Excel!"); }
function downloadTemplateWord() { alert("Template terunduh!"); }
function exportStudentsExcel() { alert("Data siswa ter-export!"); }

// Exam Participants
function openExamParticipants(name) {
    document.getElementById('panel-questions').classList.add('hidden-view');
    document.getElementById('view-exam-participants').classList.remove('hidden-view');
    document.getElementById('participant-exam-title').innerText = name;
    document.getElementById('exam-participants-body').innerHTML = `<tr><td colspan="16" class="text-center py-8">Simulasi Data Peserta...</td></tr>`;
}
function closeExamParticipants() {
    document.getElementById('view-exam-participants').classList.add('hidden-view');
    document.getElementById('panel-questions').classList.remove('hidden-view');
    switchBankTab('ujian');
}
function saveExamParticipants() { document.getElementById('modal-manage-participants').classList.add('hidden'); alert("Peserta tersimpan!"); }

// Helper
function openEditRoomModal(id) { document.getElementById('modal-edit-room').classList.remove('hidden'); }
function deleteRoom(i) { if(confirm("Hapus ruangan?")) fetchRooms(); }
function finishExam() { if(confirm("Selesai ujian?")) location.reload(); }
// --- FITUR REALTIME USER (PRESENCE) ---
function initRealtimePresence() {
    // 1. Buat Channel Khusus untuk melacak user online
    const room = db.channel('room_online_users', {
        config: {
            presence: {
                // Kita beri ID acak untuk setiap pengunjung
                key: 'user-' + Math.floor(Math.random() * 10000), 
            },
        },
    });

    // 2. Pasang Pendengar (Listener) saat status berubah (ada yg masuk/keluar)
    room.on('presence', { event: 'sync' }, () => {
        // Hitung jumlah user yang sedang aktif di channel ini
        const newState = room.presenceState();
        const onlineCount = Object.keys(newState).length;
        
        // 3. Update Angka di Dashboard HTML
        const elSocket = document.getElementById('stat-socket');
        const elOnline = document.getElementById('stat-online'); 
        const elConn = document.getElementById('stat-students'); // Jumlah Terkoneksi
        
        // Kita samakan angka Socket, Online, dan Koneksi untuk demo ini
        if(elSocket) elSocket.innerText = onlineCount;
        if(elOnline) elOnline.innerText = onlineCount;
        
        // Untuk 'Total Terkoneksi', kita bisa gabungkan dengan data database jika mau
        // Tapi untuk sekarang kita samakan dengan yang online
        if(elConn) elConn.innerText = onlineCount; 

        console.log("User Online Realtime:", onlineCount);
    });

    // 3. Mulai Berlangganan (Subscribe)
    room.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
            // Setelah terhubung, lapor ke Supabase bahwa "Saya Hadir!"
            await room.track({ 
                online_at: new Date().toISOString(),
                device: navigator.userAgent // Info perangkat (opsional)
            });
        }
    });
}
// --- FITUR TRAFIK MONITOR REAL (PENGGANTI SIMULASI) ---
async function initRealTrafficMonitor() {
    // 1. Tambahkan +1 Hitungan (Setiap kali halaman dimuat)
    // Kita panggil fungsi RPC 'increment_hit' yang sudah dibuat di SQL Editor
    await db.rpc('increment_hit');

    // 2. Ambil Angka Terbaru untuk Ditampilkan Pertama Kali
    const { data } = await db.from('site_stats').select('total_hits').eq('id', 1).single();
    if (data) {
        updateHttpUI(data.total_hits);
    }

    // 3. Pasang Pendengar Realtime (Agar angka nambah sendiri tanpa refresh)
    db.channel('public:site_stats')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_stats' }, (payload) => {
            // Saat ada perubahan di database, update angka di layar
            updateHttpUI(payload.new.total_hits);
        })
        .subscribe();
}

function updateHttpUI(number) {
    const el = document.getElementById('stat-http');
    if (el) {
        // Format angka jadi ribuan (contoh: 1.200)
        el.innerText = number.toLocaleString('id-ID'); 
    }
}

// --- HELPER UNTUK MODAL ERROR ---
function showErrorModal(title, message) {
    const modal = document.getElementById('modal-error');
    
    // Set teks dinamis
    document.getElementById('error-title').innerText = title || "Terjadi Kesalahan";
    document.getElementById('error-message').innerText = message || "Silakan coba beberapa saat lagi.";
    
    // Tampilkan Modal dengan Animasi
    modal.classList.remove('hidden');
    // Sedikit delay agar transisi CSS berjalan halus
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
    }, 10);
    
    if (typeof feather !== 'undefined') feather.replace();
}

function closeErrorModal() {
    const modal = document.getElementById('modal-error');
    
    // Animasi Keluar
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.remove('scale-100');
    modal.querySelector('div').classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300); // Sesuaikan dengan durasi transition CSS
}
// --- FUNGSI NOTIFIKASI MODERN ---

function showSuccessAlert(message) {
    const modal = document.getElementById('modal-success');
    const msgElement = document.getElementById('msg-success');
    
    // 1. Set Pesan
    if(msgElement) msgElement.innerText = message;
    
    // 2. Tampilkan Modal
    if(modal) {
        modal.classList.remove('hidden');
        // Refresh ikon agar animasi ping terlihat
        if(typeof feather !== 'undefined') feather.replace(); 
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('modal-success');
    if(modal) modal.classList.add('hidden');
}
// --- HELPER FUNGSI BARU (Letakkan di Paling Bawah) ---

function openEditRoomModal(id = null, name = '', desc = '') {
    currentEditingRoomId = id;
    const inputNama = document.getElementById('edit-room-name');
    const inputDesc = document.getElementById('edit-room-desc');
    const modalTitle = document.getElementById('modal-room-title');
    const modal = document.getElementById('modal-edit-room');

    if (inputNama) inputNama.value = '';
    if (inputDesc) inputDesc.value = '';

    if (id) {
        if (inputNama) inputNama.value = name;
        if (inputDesc) inputDesc.value = desc;
        if (modalTitle) modalTitle.innerHTML = `<i data-feather="edit" class="w-5 h-5 text-blue-600"></i> Edit Ruangan`;
    } else {
        if (modalTitle) modalTitle.innerHTML = `<i data-feather="plus-circle" class="w-5 h-5 text-blue-600"></i> Tambah Ruangan`;
    }

    if (typeof feather !== 'undefined') feather.replace();
    if (modal) modal.classList.remove('hidden');
}

function closeEditRoomModal() {
    const modal = document.getElementById('modal-edit-room');
    if (modal) modal.classList.add('hidden');
    currentEditingRoomId = null;
}

function confirmDelete(id, type) {
    pendingDeleteId = id;
    pendingDeleteType = type;

    const modalTitle = document.querySelector('#modal-confirm-delete h3');
    const modalDesc = document.querySelector('#modal-confirm-delete p');
    const btnYes = document.querySelector('#modal-confirm-delete button.bg-red-600'); 

    // Reset teks tombol "Batal" dan "Hapus" jika perlu, tapi fokus ke onclick btnYes
    if (btnYes) btnYes.setAttribute('onclick', 'executeDelete()');

    if (type === 'room') {
        if(modalTitle) modalTitle.innerText = "Hapus Ruangan?";
        if(modalDesc) modalDesc.innerText = "Data ruangan akan dihapus permanen.";
    } else if (type === 'class') {
        if(modalTitle) modalTitle.innerText = "Hapus Kelas?";
        if(modalDesc) modalDesc.innerText = "Seluruh siswa di kelas ini juga akan terhapus.";
    }

    document.getElementById('modal-confirm-delete').classList.remove('hidden');
}

async function executeDelete() {
    document.getElementById('modal-confirm-delete').classList.add('hidden');
    if (!pendingDeleteId || !pendingDeleteType) return;

    let success = false;
    if (pendingDeleteType === 'room') {
        success = await DB.deleteRoom(pendingDeleteId);
        if (success) await fetchRooms();
    } else if (pendingDeleteType === 'class') {
        success = await DB.deleteClass(pendingDeleteId);
        if (success) await fetchClasses();
    }

    if (success) {
        showSuccessAlert("Data berhasil dihapus permanen.");
    }
}


