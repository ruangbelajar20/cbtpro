// 1. KONFIGURASI & STATE (PUSAT PENYIMPANAN)
// 1. STATE & MEDIA (Hanya di sini saja)
let logoBase64 = localStorage.getItem('cbt_logo_data') || null;
let signatureBase64 = localStorage.getItem('cbt_sig_data') || null;
const CONFIG = {
    // API Key & URL Supabase
    SUPABASE_URL: 'https://vgemkulcjnpjquabhguv.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnZW1rdWxjam5wanF1YWJoZ3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MzUwNTEsImV4cCI6MjA4MDQxMTA1MX0.Z0NxOpNZAhuNlFuR_2h0uRLD8x4gYNpEI9veHNCxKxQ',
    
    // Ticker Text
    TICKER_MESSAGES: [
        { text: '<span class="text-yellow-400 font-bold mr-2">[INFO UJIAN]</span> Selamat Datang di Portal Ujian CBT Pro.', anim: 'anim-scroll', duration: 20000 },
        { text: '<span class="text-blue-400 font-bold mr-2">[BANTUAN]</span> Jika terkendala hubungi Admin.', anim: 'anim-center-expand', duration: 10000 }
    ]
};

// Inisialisasi Supabase
const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
// State Management Global
const STATE = {
    editing: {
        classId: null,
        roomId: null,
        examId: null,
        studentId: null, // <--- TAMBAHAN BARU
        pendingDeleteId: null,
        pendingDeleteType: null
    },
    ui: {
        tickerIndex: 0,
        cardLogo: "https://via.placeholder.com/50",
        cardSignature: "",
        selectedStudentIds: []
    },
    cache: {
        students: [],
        classes: [],
        rooms: [],
        questions: [],
        exams: [],
        recap: []
    },
    intervals: {
        tokenTimer: null
    },
    realtime: {
        presenceChannel: null 
    }
};
// --- HANDLER UNTUK FILE UPLOAD (LOGA & TTD) ---
const PrintHandler = {
    handleUpload: function(input, targetKey) {
        if (input.files && input.files[0]) {
            const file = input.files[0];

            // Validasi Ukuran (Maks 1MB) agar render tidak lag
            if (file.size > 1024 * 1024) {
                alert("Ukuran file terlalu besar! Maksimal 1MB.");
                input.value = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                // Simpan ke State
                STATE.print[targetKey] = e.target.result;
                
                // Update UI status jika ada (Opsional)
                const statusEl = document.getElementById(`${targetKey}-status`);
                if (statusEl) statusEl.innerText = "Terpasang";

                // Render ulang kartu secara Real-Time
                renderCardPreview();
            };
            reader.readAsDataURL(file);
        }
    }
};
// ============================================================================
// 2. UTILITIES (ALAT BANTU & KEAMANAN)
// ============================================================================
const Utils = {
    // [SECURITY] Sanitasi XSS (Wajib ada!)
    escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    },

    getEl(id) { return document.getElementById(id); },

    setLoading(btn, isLoading, text = 'Memproses...') {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.innerHTML;
            // Menggunakan SVG Spinner yang modern
            btn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg> ${text}`;
            btn.disabled = true;
            btn.classList.add('opacity-75', 'cursor-not-allowed');
        } else {
            btn.innerHTML = btn.dataset.originalText || 'Simpan';
            btn.disabled = false;
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    },

    formatDate(dateString) {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    }
};
// ==========================================
// 3. DATA UTILITY & EXPORT
// ==========================================

/**
 * FUNGSI DOWNLOAD TEMPLATE EXCEL
 * Dipanggil melalui window.downloadTemplateWord agar sinkron dengan HTML
 */
function downloadStudentTemplate() {
    try {
        // Struktur kolom sesuai kebutuhan database Supabase Anda
        const headers = [["nama_lengkap", "nisn", "kelas", "jurusan", "username", "password", "ruangan", "sesi"]];
        const sampleData = [
            ["Budi Sudarsono", "12345678", "XI", "Farmasi", "budi123", "pass123", "R 03", "1"]
        ];
        
        const data = [...headers, ...sampleData];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Daftar Siswa");

        // Proses download file asli Excel
        XLSX.writeFile(wb, "Template_Peserta_CBT.xlsx");
    } catch (error) {
        console.error("Gagal mendownload template:", error);
        alert("Terjadi kesalahan: Pastikan library XLSX sudah terpasang.");
    }
}

// BRIDGE: Menghubungkan klik tombol di HTML ke fungsi di atas
window.downloadTemplateWord = function(type) {
    if (type === 'student') {
        downloadStudentTemplate();
    } else {
        alert("Template untuk " + type + " belum tersedia.");
    }
};
// ============================================================================
// 3. SERVICE LAYER (DATABASE)
// ============================================================================
const DB = {
    // --- DATA SISWA ---
    async getStudents() {
        const { data, error } = await db.from('students').select('*').order('created_at', { ascending: false });
        if (error) return [];
        return data;
    },
    // Update data siswa berdasarkan ID
   // Update Single Student (Edit)
    async updateStudent(id, data) {
        // Bersihkan data undefined
        Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
        
        // Lakukan update berdasarkan ID (Primary Key)
        const { error } = await db.from('students').update(data).eq('id', id);
        return { error };
    },

    // --- DATA UTAMA (KELAS, RUANG, UJIAN) ---
   async getClasses() {
        // 1. Ambil daftar kelas
        const { data: classesData, error: errClass } = await db.from('classes').select('*');
        if (errClass) return [];

        // 2. Ambil data siswa (hanya kolom 'kelas' untuk menghitung jumlah)
        const { data: studentsData, error: errStu } = await db.from('students').select('kelas');
        
        // 3. Hitung jumlah siswa per kelas
        // Hasilnya misal: { "XII IPA 1": 25, "XII IPS 1": 30 }
        const counts = {};
        if (studentsData) {
            studentsData.forEach(s => {
                // Pastikan nama kelas persis sama (case sensitive)
                const k = s.kelas || 'Unassigned';
                counts[k] = (counts[k] || 0) + 1;
            });
        }

        // 4. Map data kelas dengan jumlah yang sudah dihitung
        return (classesData || []).map(c => ({
            id: c.id,
            code: c.kode_kelas,
            name: c.nama_kelas,
            desc: c.deskripsi || '-',
            // Ambil jumlah dari object counts, jika tidak ada set 0
            count: counts[c.nama_kelas] || 0, 
            date: Utils.formatDate(c.created_at) || 'Terdaftar'
        }));
    },
    async getRooms() {
        // 1. Ambil daftar ruangan
        const { data: roomsData, error: errRoom } = await db.from('rooms').select('*');
        if (errRoom) return [];

        // 2. Ambil data siswa (hanya kolom 'ruangan')
        const { data: studentsData, error: errStu } = await db.from('students').select('ruangan');

        // 3. Hitung jumlah siswa per ruangan
        const counts = {};
        if (studentsData) {
            studentsData.forEach(s => {
                const r = s.ruangan || 'Unassigned';
                counts[r] = (counts[r] || 0) + 1;
            });
        }

        // 4. Map data ruangan dengan jumlah yang sudah dihitung
        return (roomsData || []).map(r => ({
            id: r.id,
            code: r.kode_ruangan,
            name: r.nama_ruangan,
            desc: r.deskripsi || '-',
            // Ambil jumlah dari object counts, jika tidak ada set 0
            count: counts[r.nama_ruangan] || 0,
            date: Utils.formatDate(r.created_at) || 'Terdaftar'
        }));
    },
    async getExams() {
        const { data } = await db.from('exams').select('*').order('created_at', { ascending: false });
        return (data || []).map(e => ({
            id: e.id, name: e.nama_ujian, status: e.status, alokasi: e.alokasi,
            peserta: e.peserta || 0, pengelola: e.pengelola || 'Admin'
        }));
    },
    async getQuestions() {
        const { data } = await db.from('questions').select('*').order('created_at', { ascending: false });
        return data || [];
    },

    // --- LIST UNTUK DROPDOWN ---
    async getClassList() {
        const { data } = await db.from('classes').select('nama_kelas').order('nama_kelas');
        return (data || []).map(i => i.nama_kelas);
    },
    async getRoomList() {
        const { data } = await db.from('rooms').select('nama_ruangan').order('nama_ruangan');
        return (data || []).map(i => i.nama_ruangan);
    },
    async getExamList() {
        const { data } = await db.from('exams').select('id, nama_ujian').eq('status', 'Aktif');
        return data || [];
    },
    // --- FUNGSI BARU: UPLOAD FOTO ---
    async uploadPhoto(file) {
        if (!file) return null;

        // 1. Buat nama file unik (timestamp + nama file asli yang disanitasi)
        const fileExt = file.name.split('.').pop();
        const fileName = `student_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        // 2. Upload ke Supabase Storage (Bucket: 'student-photos')
        const { data, error } = await db.storage
            .from('student-photos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // 3. Ambil Public URL agar bisa diakses
        const { data: publicUrlData } = db.storage
            .from('student-photos')
            .getPublicUrl(filePath);

        return publicUrlData.publicUrl;
    },
    // --- FUNGSI TOKEN & PENGATURAN ---
    async updateToken(tokenCode) {
        // Update Token Code saja
        const { error } = await db.from('exam_settings').update({ 
            token_code: tokenCode, 
            updated_at: new Date() 
        }).eq('id', 1);
        return { error };
    },
    async updateTokenConfig(duration, autoRefresh) {
        // Update Durasi & Status Auto Refresh
        const { error } = await db.from('exam_settings').update({ 
            token_duration: duration,
            auto_refresh: autoRefresh,
            updated_at: new Date() 
        }).eq('id', 1);
        return { error };
    },
    async getTokenSettings() {
        const { data } = await db.from('exam_settings').select('*').eq('id', 1).single();
        return data;
    },

    // --- BULK ACTIONS (EKSEKUSI MASSAL) ---
    async bulkUpdateStudents(filterCol, filterValues, updateData) {
        const { error } = await db.from('students').update(updateData).in(filterCol, filterValues);
        return { error };
    },
    // 1. Update Data Massal (Untuk Kelas, Ruangan, Sesi, Password)
    async bulkUpdateStudents(ids, updateData) {
        // ids: Array ID Peserta ['1001', '1002']
        // updateData: Object { kelas: 'XII IPA 1' }
        const { data, error } = await db
            .from('students')
            .update(updateData)
            .in('id', ids)
            .select();
        return { data, error };
    },

    // 2. Hapus Data Massal
    async bulkDeleteStudents(ids) {
        const { error } = await db
            .from('students')
            .delete()
            .in('id', ids);
        return { error };
    },

    // 3. Daftarkan Peserta ke Ujian
    async registerExamParticipants(examId, studentIds) {
        // Siapkan data untuk diinsert banyak sekaligus
        const records = studentIds.map(sid => ({
            exam_id: examId,
            student_id: sid, // Pastikan ID ini sesuai tipe data di DB (UUID/BigInt)
            status: 'Terdaftar',
            created_at: new Date()
        }));

        // Gunakan upsert atau insert dengan ignoreDuplicates agar tidak error jika sudah terdaftar
        const { error } = await db
            .from('exam_participants')
            .insert(records)
            .select(); // Tambahkan select untuk debug
            
        return { error };
    },
    // --- HELPERS ---
    async getCount(table) { const { count } = await db.from(table).select('*', { count: 'exact', head: true }); return count || 0; },
    async getCountByFilter(table, col, val) { const { count } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, val); return count || 0; },
    async getStudentOnline() { return this.getCountByFilter('students', 'status_login', true); },
    async getUserTotalByRole(role) { return this.getCountByFilter('users', 'role', role); },
    async getUserOnline(role) { const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('role', role).eq('status_login', true); return count || 0; },
    async getActiveExams() { return this.getCountByFilter('exams', 'status', 'Aktif'); },
    async getSiteStats() { const { data } = await db.from('site_stats').select('total_hits').maybeSingle(); return data ? data.total_hits : 0; },
    
    // CRUD Create/Update/Delete lainnya tetap sama...
    async addStudent(d) { return await db.from('students').insert([d]); },
    async addClass(d) { return await db.from('classes').insert([d]); },
    async updateClass(id, d) { return await db.from('classes').update(d).eq('id', id); },
    async deleteClass(id) { return await db.from('classes').delete().eq('id', id); },
    async addRoom(d) { return await db.from('rooms').insert([d]); },
    async updateRoom(id, d) { return await db.from('rooms').update(d).eq('id', id); },
    async deleteRoom(id) { return await db.from('rooms').delete().eq('id', id); },
    async addExam(d) { return await db.from('exams').insert([d]); },
    async updateExam(id, d) { return await db.from('exams').update(d).eq('id', id); },
    async deleteExam(id) { return await db.from('exams').delete().eq('id', id); },
    async addQuestion(d) { return await db.from('questions').insert([d]); },
    
    async incrementHit() { await db.rpc('increment_hit'); },
    async logDevice() { /* Kode logDevice tetap sama */ },
    async getDeviceLogs() { const { data } = await db.from('device_logs').select('*').order('last_seen', { ascending: false }).limit(50); return data || []; }
};

// ============================================================================
// 4. AUTHENTICATION (LOGIN/LOGOUT)
// ============================================================================
const Auth = {
    init() {
        const sessionRaw = localStorage.getItem('cbt_user_session');
        if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            this.setSessionUI();
            db.from('users').update({ status_login: true }).eq('id', session.id);
        }
    },

    async login(userIdID, passID, btnID) {
        const userInput = Utils.getEl(userIdID);
        const passInput = Utils.getEl(passID);
        const btn = Utils.getEl(btnID);

        const userVal = userInput ? userInput.value.trim() : '';
        const passVal = passInput ? passInput.value.trim() : '';

        if (!userVal || !passVal) {
            View.modals.showError("Data Tidak Lengkap", "Harap isi Username dan Password!");
            return;
        }

        Utils.setLoading(btn, true, "Checking...");

        try {
            const { data, error } = await db
                .from('users').select('id, username, role')
                .eq('username', userVal).eq('password', passVal)
                .single();

            if (error || !data) throw new Error("Username/Password Salah");

            const session = { id: data.id, username: data.username, role: data.role };
            localStorage.setItem('cbt_user_session', JSON.stringify(session));
            
            db.from('users').update({ status_login: true }).eq('id', data.id).then();

            const pinModal = Utils.getEl('modal-pin');
            if(pinModal) pinModal.classList.add('hidden');

            View.modals.showSuccess("Berhasil masuk!");

            if (window.supabase) {
                RealtimeFeatures.initPresence(); 
                View.updateDashboard(); 
            }

            setTimeout(() => {
                View.modals.closeSuccess();
                this.setSessionUI(); 
            }, 800); 

        } catch (err) {
            View.modals.showError("Gagal Masuk", "Username atau Password salah.");
            Utils.setLoading(btn, false, "Masuk");
        } finally {
            if (!localStorage.getItem('cbt_user_session')) {
                Utils.setLoading(btn, false, "Masuk");
            }
            if(passInput) passInput.value = '';
        }
    },

    logout() {
        const session = JSON.parse(localStorage.getItem('cbt_user_session'));
        if (session) {
            db.from('users').update({ status_login: false }).eq('id', session.id).then(() => {
                localStorage.removeItem('cbt_user_session');
                location.reload();
            });
        } else {
            location.reload();
        }
    },

    setSessionUI() {
        const viewLogin = Utils.getEl('view-login');
        const viewAdmin = Utils.getEl('view-admin');
        
        if(viewLogin) {
            viewLogin.style.opacity = '0';
            setTimeout(() => {
                viewLogin.classList.add('hidden-view');
                if(viewAdmin) {
                    viewAdmin.classList.remove('hidden-view');
                    setTimeout(() => viewAdmin.style.opacity = '1', 50);
                }
                View.nav('dashboard');
            }, 300); 
        } else {
            if(viewAdmin) viewAdmin.classList.remove('hidden-view');
            View.nav('dashboard');
        }
    }
};

// ============================================================================
// 5. VIEW CONTROLLER (LOGIKA TAMPILAN) - FULL UPDATE
// ============================================================================
const View = {
    // 1. Variabel State Seleksi
    selectedItems: [],

    // 2. Navigasi Utama
    nav(panelId) {
        // 1. Sembunyikan semua panel
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden-view'));
        
        // 2. Tampilkan panel yang dituju
        const target = Utils.getEl('panel-' + panelId) || Utils.getEl(panelId);
        if (target) {
            target.classList.remove('hidden-view');
            // Efek Fade In
            target.style.opacity = 0;
            setTimeout(() => target.style.opacity = 1, 50);
        }

        // 3. Update Sidebar Active State
        document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active-nav'));
        const activeBtn = Utils.getEl('nav-' + panelId);
        if (activeBtn) activeBtn.classList.add('active-nav');

        // 4. Tutup Sidebar di Mobile (Jika layar kecil)
        if (window.innerWidth < 768) {
            Utils.getEl('sidebar')?.classList.add('-translate-x-full');
            Utils.getEl('sidebar-overlay')?.classList.add('hidden');
        }

        // --- LOGIKA PER HALAMAN (HANYA TULIS SATU KALI) ---
        // A. Dashboard
        if (panelId === 'dashboard') this.updateDashboard();
        
        // B. Data Peserta
        if (panelId === 'students') {
            this.populateFilters(); // Isi filter Kelas/Ruangan di atas tabel
            this.renderStudents(false);
        }
        
        // C. Kelas & Ruangan
        if (panelId === 'classes') this.renderClasses();
        if (panelId === 'rooms') this.renderRooms();
        
        // D. Riwayat Koneksi
        if (panelId === 'connections') this.renderConnections();

        // E. Bank Soal (PENTING: Agar tidak blank)
        if (panelId === 'questions') {
            this.switchBankTab('soal'); // Buka tab daftar soal
            this.renderQuestions();
        }

        // F. Pengaturan (PENTING: Agar tidak blank)
        if (panelId === 'settings') {
            this.loadSettingsData(); // Ambil data token
            this.switchSettingTab(null, 'profile'); // Buka tab profil
        }

        // 5. Reset Seleksi (Agar tombol 'Terseleksi' kembali ke 0 saat pindah menu)
       // Reset seleksi HANYA JIKA bukan pindah ke halaman cetak
        if (panelId !== 'card-print') { 
            this.selectedItems = [];
            this.updateBulkButtonUI();
        }
    },
    // --- FUNGSI PENCARIAN UNIVERSAL ---
    searchTimer: null,
    
    searchData(type, keyword) {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => {
            keyword = keyword.toLowerCase();
            
            if (type === 'students') {
                // Filter Data Siswa
                const filtered = STATE.cache.students.filter(s => 
                    (s.nama_lengkap || s.nama || '').toLowerCase().includes(keyword) ||
                    (s.id_peserta || '').toLowerCase().includes(keyword) ||
                    (s.username || '').toLowerCase().includes(keyword)
                );
                // Render ulang dengan data hasil filter
                this.renderStudents(false, filtered); 
            } 
            else if (type === 'classes') {
                // Filter Data Kelas
                const filtered = STATE.cache.classes.filter(c => 
                    (c.name || '').toLowerCase().includes(keyword) ||
                    (c.code || '').toLowerCase().includes(keyword)
                );
                this.renderClasses(filtered);
            }
            else if (type === 'rooms') {
                // Filter Data Ruangan
                const filtered = STATE.cache.rooms.filter(r => 
                    (r.name || '').toLowerCase().includes(keyword) ||
                    (r.code || '').toLowerCase().includes(keyword)
                );
                this.renderRooms(filtered);
            }
        }, 300); // Delay 300ms agar tidak berat
    },
    toggleSidebar() {
        const sidebar = Utils.getEl('sidebar');
        const overlay = Utils.getEl('sidebar-overlay');
        if (sidebar && overlay) {
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        }
    },

    // --- LOGIKA SELEKSI & TOMBOL ---
    toggleSelect(id, isChecked) {
        if (isChecked) {
            this.selectedItems.push(id);
        } else {
            this.selectedItems = this.selectedItems.filter(item => item !== id);
        }
        this.updateBulkButtonUI(); 
    },

toggleSelectAll(source) {
        // 1. Ambil semua checkbox baris yang sedang tampil di layar
        const checkboxes = document.querySelectorAll('.row-checkbox');
        
        // 2. Samakan status centang mereka dengan header
        checkboxes.forEach(cb => cb.checked = source.checked);
        
        if (source.checked) {
            // 3. JIKA DICENTANG: Ambil value (ID) dari checkbox tersebut
            // Kita pakai Set untuk menghindari duplikat
            const newIds = Array.from(checkboxes).map(cb => cb.value);
            this.selectedItems = [...new Set(newIds)];
        } else {
            // 4. JIKA DI-UNCHECK: Kosongkan seleksi
            this.selectedItems = [];
        }

        // 5. Update tampilan tombol aksi
        this.updateBulkButtonUI();
    },

    updateBulkButtonUI() {
        const countSpan = document.getElementById('selection-count');
        const btnContainer = document.getElementById('dropdown-bulk-actions');
        
        if (countSpan) {
            countSpan.innerText = `(${this.selectedItems.length}) Terseleksi`;
        }
        if (this.selectedItems.length === 0 && btnContainer) {
            btnContainer.classList.add('hidden');
            btnContainer.classList.remove('block'); 
        }
    },

    // --- FUNGSI DATA (POPULATE) ---
    async populateFilters() {
        const filterClass = document.getElementById('filter-class');
        const filterRoom = document.getElementById('filter-room');

        if (filterClass && filterRoom) {
            const classes = await DB.getClassList();
            const rooms = await DB.getRoomList();

            filterClass.innerHTML = `<option value="Semua">Semua Kelas</option>` + 
                classes.map(c => `<option value="${c}">${c}</option>`).join('');

            filterRoom.innerHTML = `<option value="Semua">Semua Ruangan</option>` + 
                rooms.map(r => `<option value="${r}">${r}</option>`).join('');
        }
    },

    async populateStudentForm() {
        const k = Utils.getEl('input-kelas');
        const r = Utils.getEl('input-ruangan');
        // const a = Utils.getEl('input-agama'); // Agama statis, tidak perlu fetch DB
        
        if(k && r) {
            // Ambil data dari DB
            const [classes, rooms] = await Promise.all([DB.getClassList(), DB.getRoomList()]);
            
            // Render Kelas
            if (classes.length > 0) {
                k.innerHTML = `<option value="">-- Pilih Kelas --</option>` + 
                              classes.map(i => `<option value="${i}">${i}</option>`).join('');
            } else {
                k.innerHTML = `<option value="">Belum ada kelas</option>`;
            }

            // Render Ruangan
            if (rooms.length > 0) {
                r.innerHTML = `<option value="">-- Pilih Ruangan --</option>` + 
                              rooms.map(i => `<option value="${i}">${i}</option>`).join('');
            } else {
                r.innerHTML = `<option value="">Belum ada ruangan</option>`;
            }
        }
    },
    async populateBulkDropdowns() {
        const selClass = document.getElementById('bulk-input-class');
        const selRoom = document.getElementById('bulk-input-room');
        const selExam = document.getElementById('bulk-input-exam'); 

        if (selClass) {
            selClass.innerHTML = '<option value="">Sedang memuat...</option>';
            const classes = await DB.getClassList();
            selClass.innerHTML = classes.length === 0 
                ? '<option value="">Belum ada data kelas</option>' 
                : `<option value="">-- Pilih Kelas Tujuan --</option>` + classes.map(c => `<option value="${c}">${c}</option>`).join('');
        }
        if (selRoom) {
            selRoom.innerHTML = '<option value="">Sedang memuat...</option>';
            const rooms = await DB.getRoomList();
            selRoom.innerHTML = rooms.length === 0 
                ? '<option value="">Belum ada data ruangan</option>' 
                : `<option value="">-- Pilih Ruangan Tujuan --</option>` + rooms.map(r => `<option value="${r}">${r}</option>`).join('');
        }
        if (selExam) {
            selExam.innerHTML = '<option value="">Sedang memuat...</option>';
            const exams = await DB.getExamList(); 
            selExam.innerHTML = exams.length === 0 
                ? '<option value="">Tidak ada ujian aktif</option>' 
                : `<option value="">-- Pilih Ujian --</option>` + exams.map(e => `<option value="${e.id}">${e.nama_ujian}</option>`).join('');
        }
    },

    async loadSettingsData() {
        const data = await DB.getTokenSettings();
        if(data) {
            if(Utils.getEl('setting-token-display')) Utils.getEl('setting-token-display').innerText = data.token_code;
            if(Utils.getEl('token-duration')) Utils.getEl('token-duration').value = data.token_duration;
            if(Utils.getEl('toggle-auto-token')) Utils.getEl('toggle-auto-token').checked = data.auto_refresh;
        }
    },

    // --- RENDER TABEL & LIST ---
async renderStudents(useCache = false, customData = null) {
        // 1. Reset Seleksi jika bukan refresh cache dan bukan pencarian
        if(!useCache && !customData) { 
            this.selectedItems = []; 
            this.updateBulkButtonUI(); 
        }

        const tbody = Utils.getEl('table-students-body');
        
        // 2. Tentukan Data: Pakai Custom (Search) atau Cache/DB
        let dataToRender = customData;

        if (!dataToRender) {
            // Jika tidak ada custom data (bukan sedang mencari)
            if (!useCache || STATE.cache.students.length === 0) {
                tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8"><span class="animate-spin text-blue-500">⏳</span> Memuat data...</td></tr>`;
                STATE.cache.students = await DB.getStudents();
            }
            dataToRender = STATE.cache.students;
        }

        const filterClass = Utils.getEl('filter-class')?.value || 'Semua';
        const filterRoom = Utils.getEl('filter-room')?.value || 'Semua';

        // 3. Render HTML (Looping pada dataToRender)
        const html = dataToRender.map((s, i) => {
            // Filter Dropdown (Hanya berlaku jika bukan sedang search)
            if (!customData) { 
                if (filterClass !== 'Semua' && s.kelas !== filterClass) return '';
                if (filterRoom !== 'Semua' && s.ruangan !== filterRoom) return '';
            }

            // --- DATA PENTING ---
            const internalId = s.id; 
            const nisn = s.id_peserta || '-';
            const namaSiswa = s.nama_lengkap || s.nama || '-';
            const passSiswa = s.password || s.pass || '';
            const username = s.username || '-';
            const kelas = s.kelas || '-';
            const ruangan = s.ruangan || '-';
            const sesi = s.sesi || '-';

            // --- HTML PASSWORD MODERN ---
            const passwordHtml = `
                <div class="relative flex items-center justify-center group/pass w-28 mx-auto">
                    <input type="password" value="${Utils.escapeHTML(passSiswa)}" id="pass-input-${i}" readonly class="w-full text-center bg-transparent border-none outline-none font-mono text-xs tracking-widest text-slate-600 cursor-default px-0">
                    <button onclick="View.togglePass(${i})" class="absolute -right-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all opacity-0 group-hover/pass:opacity-100 focus:opacity-100"><i data-feather="eye" id="icon-pass-${i}" class="w-3.5 h-3.5"></i></button>
                </div>`;

            // --- HTML ROW ---
            return `
            <tr class="border-b hover:bg-slate-50 transition group-row">
                <td class="px-4 py-3 text-center w-10">
                    <input type="checkbox" class="row-checkbox w-3.5 h-3.5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                        value="${internalId}" 
                        ${View.selectedItems.includes(String(internalId)) ? 'checked' : ''} 
                        onclick="View.toggleSelect('${internalId}', this.checked)">
                </td>
                <td class="px-2 py-3 text-center relative w-12">
                    <button onclick="toggleActionDropdown('stu-${i}', event)" class="bg-blue-50 p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"><i data-feather="more-horizontal" class="w-3.5 h-3.5"></i></button>
                    <div id="dropdown-stu-${i}" class="action-dropdown text-left z-50 hidden absolute left-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-slate-100 py-1">
                        <button onclick="StudentController.prepareEdit('${internalId}')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-slate-600 font-medium">Edit Data</button>
                        <button onclick="View.modals.confirmDelete('${internalId}', 'student')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600 font-medium">Hapus</button>
                    </div>
                </td>
                <td class="px-4 py-3 text-center text-[10px] text-slate-400 font-medium w-10">${i + 1}</td>
                <td class="px-4 py-3 font-mono text-xs text-slate-600 font-medium">${Utils.escapeHTML(username)}</td>
                <td class="px-2 py-3 text-center">${passwordHtml}</td>
                <td class="px-4 py-3 font-bold text-xs uppercase text-slate-700 min-w-[150px]">${Utils.escapeHTML(namaSiswa)}</td>
                <td class="px-4 py-3 text-xs font-mono text-slate-500">${Utils.escapeHTML(nisn)}</td>
                <td class="px-4 py-3"><span class="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-md text-[10px] font-bold border border-indigo-100">${Utils.escapeHTML(kelas)}</span></td>
                <td class="px-4 py-3 text-xs text-slate-600">${Utils.escapeHTML(ruangan)}</td>
                <td class="px-4 py-3 text-center"><span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-bold border border-slate-200">${Utils.escapeHTML(sesi)}</span></td>
                <td class="px-4 py-3 text-xs text-slate-500">${Utils.escapeHTML(s.sekolah || '-')}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${Utils.escapeHTML(s.agama || '-')}</td>
                <td class="px-4 py-3 text-xs italic text-slate-400 truncate max-w-[100px]" title="${Utils.escapeHTML(s.catatan)}">${Utils.escapeHTML(s.catatan || '-')}</td>
            </tr>`;
        }).join('');
        
        tbody.innerHTML = html || `<tr><td colspan="13" class="text-center py-8 text-xs text-slate-400 italic">Data tidak ditemukan.</td></tr>`;
        if (typeof feather !== 'undefined') feather.replace();
    },

    async renderClasses(customData = null) {
        // 1. Reset seleksi
        this.selectedItems = []; 
        this.updateBulkButtonUI();
        const tbody = Utils.getEl('table-classes-body');
        
        // 2. LOGIKA DATA: Gunakan data pencarian (jika ada) atau ambil dari DB
        let data = customData;
        if (!data) {
            // Jika bukan mode cari, ambil data terbaru dari database
            STATE.cache.classes = await DB.getClasses();
            data = STATE.cache.classes;
        }

        // 3. Render variabel 'data' (bukan STATE.cache.classes secara langsung)
        const html = data.map((item, i) => `
            <tr class="border-b hover:bg-slate-50 transition">
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" class="row-checkbox w-3.5 h-3.5" 
                        onchange="View.toggleSelect('${Utils.escapeHTML(item.name)}', this.checked)">
                </td>
                <td class="px-4 py-3 text-center text-xs">${i + 1}</td>
                <td class="px-4 py-3 font-mono font-bold text-xs">${Utils.escapeHTML(item.code)}</td>
                <td class="px-4 py-3 font-bold text-xs uppercase">${Utils.escapeHTML(item.name)}</td>
                <td class="px-4 py-3 text-xs italic">${Utils.escapeHTML(item.desc)}</td>
                
                <td class="px-4 py-3">
                    <button onclick="View.navToStudentFilter('kelas', '${Utils.escapeHTML(item.name)}')" class="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                        <i data-feather="users" class="w-3 h-3"></i> (${item.count || 0}) Peserta
                    </button>
                </td>
                
                <td class="px-4 py-3 text-[10px]">${item.date}</td>
                
                <td class="px-4 py-3 text-center relative">
                    <button onclick="toggleActionDropdown('cls-${i}', event)" class="bg-slate-100 p-1.5 rounded hover:bg-slate-200 text-slate-600">
                        <i data-feather="more-horizontal" class="w-3.5 h-3.5"></i>
                    </button>
                    <div id="dropdown-cls-${i}" class="action-dropdown text-left z-50 right-0 origin-top-right hidden absolute bg-white shadow-lg border rounded p-1">
                        <button onclick="View.modals.openEditClass('${item.id}')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-blue-600">Edit</button>
                        <button onclick="View.modals.confirmDelete('${item.id}', 'class')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600">Hapus</button>
                    </div>
                </td>
            </tr>`).join('');

        // Tampilkan pesan jika data kosong
        tbody.innerHTML = html || '<tr><td colspan="8" class="text-center py-8 text-xs text-slate-400">Data tidak ditemukan.</td></tr>';
        
        if (typeof feather !== 'undefined') feather.replace();
    },

    async renderRooms(customData = null) {
        // 1. Reset Seleksi
        this.selectedItems = [];
        this.updateBulkButtonUI();
        const tbody = Utils.getEl('table-rooms-body');
        
        // 2. LOGIKA DATA: Gunakan data pencarian (jika ada) atau ambil dari DB
        let data = customData;
        if (!data) {
            // Jika bukan mode cari, ambil data terbaru dari database
            STATE.cache.rooms = await DB.getRooms();
            data = STATE.cache.rooms;
        }

        // 3. Render variabel 'data'
        const html = data.map((item, i) => `
            <tr class="border-b hover:bg-slate-50 transition">
                <td class="px-4 py-3 text-center">
                    <input type="checkbox" class="row-checkbox w-3.5 h-3.5" 
                        onchange="View.toggleSelect('${Utils.escapeHTML(item.name)}', this.checked)">
                </td>
                <td class="px-4 py-3 text-center text-xs">${i + 1}</td>
                <td class="px-4 py-3 font-mono font-bold text-xs">${Utils.escapeHTML(item.code)}</td>
                <td class="px-4 py-3 font-bold text-xs uppercase">${Utils.escapeHTML(item.name)}</td>
                <td class="px-4 py-3 text-xs italic">${Utils.escapeHTML(item.desc)}</td>
                
                <td class="px-4 py-3">
                     <button onclick="View.navToStudentFilter('ruangan', '${Utils.escapeHTML(item.name)}')" class="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                        <i data-feather="users" class="w-3 h-3"></i> (${item.count || 0}) Peserta
                    </button>
                </td>
                
                <td class="px-4 py-3 text-[10px]">${item.date}</td>
                
                <td class="px-4 py-3 text-center relative">
                     <button onclick="toggleActionDropdown('room-${i}', event)" class="bg-slate-100 p-1.5 rounded hover:bg-slate-200 text-slate-600">
                        <i data-feather="more-horizontal" class="w-3.5 h-3.5"></i>
                    </button>
                    <div id="dropdown-room-${i}" class="action-dropdown text-left z-50 right-0 origin-top-right hidden absolute bg-white shadow-lg border rounded p-1">
                        <button onclick="View.modals.openEditRoom('${item.id}')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50 text-blue-600">Edit</button>
                        <button onclick="View.modals.confirmDelete('${item.id}', 'room')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600">Hapus</button>
                    </div>
                </td>
            </tr>`).join('');
            
        // Tampilkan pesan jika data kosong
        tbody.innerHTML = html || '<tr><td colspan="8" class="text-center py-4 text-xs text-slate-400">Data tidak ditemukan.</td></tr>';
        
        if (typeof feather !== 'undefined') feather.replace();
    },
    // --- NAVIGASI FILTER & LAINNYA ---
    navToStudentFilter(type, value) { 
        this.nav('students');
        setTimeout(() => {
            if(type === 'kelas') {
                const select = Utils.getEl('filter-class');
                if(select) { select.value = value; select.dispatchEvent(new Event('change')); }
            } else if (type === 'ruangan') {
                const select = Utils.getEl('filter-room');
                if(select) { select.value = value; select.dispatchEvent(new Event('change')); }
            }
            this.renderStudents(true); 
        }, 100); 
    },
   // PERBAIKAN: Menghapus kata 'function' agar sesuai format objek
    updateCardLogo(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                logoBase64 = e.target.result;
                renderCardPreview(); // Render ulang otomatis
            };
            reader.readAsDataURL(input.files[0]);
        }
    }, // Tambahkan koma di sini
    
    updateCardSignature(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                signatureBase64 = e.target.result;
                renderCardPreview(); // Render ulang otomatis
            };
            reader.readAsDataURL(input.files[0]);
        }
    }, // Tambahkan koma di sini

    downloadStudentTemplate() {
        const headers = [["Nama Lengkap", "NISN", "Kelas", "Jurusan", "Username", "Password"]];
        const data = [
            ...headers,
            ["Budi Sudarsono", "12345678", "XI", "Farmasi", "budi123", "pass123"]
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template Siswa");
        XLSX.writeFile(wb, "Template_Peserta_CBT.xlsx");
    },
        togglePass(index) {
        // 1. Ambil elemen input dan tombol
        const inputEl = Utils.getEl(`pass-input-${index}`);
        // Cari tombol pembungkus icon (karena feather me-replace tag <i> dengan <svg>)
        const btnEl = document.querySelector(`button[onclick="View.togglePass(${index})"]`);
        
        if (!inputEl) return;
    
        // 2. Cek tipe saat ini
        if (inputEl.type === "password") {
            // --- MODE BUKA PASSWORD ---
            inputEl.type = "text"; // Ubah jadi teks biasa
            
            // Styling agar teks terbaca jelas (hilangkan jarak antar huruf)
            inputEl.classList.remove('tracking-widest');
            inputEl.classList.add('text-blue-600', 'font-bold');
            
            // Ganti ikon jadi 'eye-off' (mata dicoret)
            if(btnEl) {
                btnEl.innerHTML = `<i data-feather="eye-off" id="icon-pass-${index}" class="w-3.5 h-3.5 transition-transform text-blue-600"></i>`;
            }
    
        } else {
            // --- MODE TUTUP PASSWORD ---
            inputEl.type = "password"; // Ubah jadi password (titik-titik)
            
            // Kembalikan styling default
            inputEl.classList.add('tracking-widest');
            inputEl.classList.remove('text-blue-600', 'font-bold');
            
            // Ganti ikon jadi 'eye' (mata biasa)
            if(btnEl) {
                btnEl.innerHTML = `<i data-feather="eye" id="icon-pass-${index}" class="w-3.5 h-3.5 transition-transform"></i>`;
            }
        }
        
        // 3. Render ulang ikon feather
        if (typeof feather !== 'undefined') feather.replace();
    },

    async updateDashboard() {
        const btn = Utils.getEl('btn-refresh-dash');
        const icon = Utils.getEl('icon-refresh');
        const text = Utils.getEl('text-refresh');

        if (icon) icon.classList.add('animate-spin'); 
        if (text) text.innerText = "Updating...";     
        if (btn) btn.classList.add('bg-slate-100', 'text-blue-600'); 

        try {
            const [
                totalSiswa, siswaOnline,
                totalPengawas, pengawasOnline,
                totalAdmin, adminOnline,
                totalKelas, totalRuang,
                totalUjian, ujianAktif,
                realHttpHits,            
                totalRecordedDevices    
            ] = await Promise.all([
                DB.getCount('students'), DB.getStudentOnline(),
                DB.getUserTotalByRole('pengawas'), DB.getUserOnline('pengawas'),
                DB.getUserTotalByRole('admin'), DB.getUserOnline('admin'),
                DB.getCount('classes'), DB.getCount('rooms'),
                DB.getCount('exams'), DB.getActiveExams(),
                DB.getSiteStats(),              
                DB.getCount('device_logs')    
            ]);

            const map = {
                'stat-students': totalSiswa, 'stat-online': siswaOnline,
                'stat-proctor-total': totalPengawas, 'stat-proctor-online': pengawasOnline,
                'stat-admin-total': totalAdmin, 'stat-admin-online': adminOnline,
                'stat-classes': totalKelas, 'stat-rooms': totalRuang,
                'stat-exams': totalUjian, 'stat-exams-active': ujianAktif,
                'stat-http': realHttpHits, 
                'stat-active-devices': totalRecordedDevices 
            };

            for (const [id, val] of Object.entries(map)) {
                if(Utils.getEl(id)) Utils.getEl(id).innerText = val;
            }
        } catch (e) { console.error("Dashboard error:", e); } 
        finally {
            if (icon) icon.classList.remove('animate-spin');
            if (text) text.innerText = "Refresh";
            if (btn) btn.classList.remove('bg-slate-100', 'text-blue-600');
        }
    },

    async renderExamList() {
        const container = Utils.getEl('exam-list-body');
        if (!container) return;
        container.innerHTML = `<tr><td colspan="8" class="text-center py-8">⏳ Memuat...</td></tr>`;
        STATE.cache.exams = await DB.getExams();
        
        const html = STATE.cache.exams.map((ex, i) => {
            const statusClass = ex.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';
            return `
            <tr class="border-b hover:bg-slate-50 transition-colors">
                <td class="w-24 text-center py-3 relative">
                    <div class="inline-flex rounded-md shadow-sm">
                        <button onclick="View.openExamDetail('${Utils.escapeHTML(ex.name)}')" class="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-l-lg">Detail</button>
                        <button onclick="toggleActionDropdown('exam-${i}', event)" class="px-2 py-1.5 text-xs font-bold text-white bg-blue-600 rounded-r-lg border-l border-blue-700"><i data-feather="chevron-down" class="w-3 h-3"></i></button>
                    </div>
                    <div id="dropdown-exam-${i}" class="action-dropdown text-left z-50">
                        <button onclick="View.openExamSettings('${Utils.escapeHTML(ex.name)}', ${ex.id})" class="block w-full text-left px-4 py-1.5 hover:bg-slate-50">Pengaturan</button>
                        <button onclick="ExamController.toggleStatus(${i})" class="block w-full text-left px-4 py-1.5 font-bold">${ex.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button>
                        <button onclick="ExamController.delete(${i})" class="block w-full text-left px-4 py-1.5 hover:bg-red-50 text-red-500">Hapus</button>
                    </div>
                </td>
                <td class="py-3 px-4 font-bold text-xs uppercase">${Utils.escapeHTML(ex.name)}</td>
                <td class="py-3 px-4 text-xs">(${ex.peserta}) Peserta</td>
                <td class="py-3 px-4 text-xs">${Utils.escapeHTML(ex.pengelola)}</td>
                <td class="py-3 px-4 font-mono font-bold text-xs">${Utils.escapeHTML(ex.alokasi)}</td>
                <td class="py-3 px-4"><span class="${statusClass} px-2 py-1 rounded text-[10px] font-bold uppercase">${ex.status}</span></td>
                <td class="py-3 px-4 text-xs">-</td>
                <td class="py-3 px-4 text-xs">-</td>
            </tr>`;
        }).join('');
        container.innerHTML = html || `<tr><td colspan="8" class="text-center py-4">Belum ada ujian.</td></tr>`;
        if (typeof feather !== 'undefined') feather.replace();
    },

    async renderQuestions() {
        const tbody = Utils.getEl('question-list-body');
        if (!tbody) return;
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8">⏳ Memuat...</td></tr>`;
        STATE.cache.questions = await DB.getQuestions(); 
        
        const html = STATE.cache.questions.map((q, i) => `
            <tr class="border-b">
                <td class="px-4 py-3 text-xs">${i+1}</td>
                <td class="px-4 py-3 text-xs truncate max-w-xs">${Utils.escapeHTML(q.text || 'Tanpa Teks')}</td>
                <td class="px-4 py-3"><span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] uppercase">${q.type}</span></td>
                <td class="px-4 py-3">${q.media ? '<i data-feather="paperclip" class="w-3 h-3"></i>' : '-'}</td>
                <td class="px-4 py-3 text-center"><button class="text-red-500"><i data-feather="trash-2" class="w-4 h-4"></i></button></td>
            </tr>`).join('');
        tbody.innerHTML = html || `<tr><td colspan="5" class="text-center py-4 text-xs text-slate-400">Belum ada soal.</td></tr>`;
        feather.replace();
    },

    async renderConnections() {
        const tbody = Utils.getEl('table-connections-body');
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8"><span class="animate-spin">⏳</span> Memuat data perangkat...</td></tr>`;
        STATE.cache.logs = await DB.getDeviceLogs(); 
        
        if (STATE.cache.logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Belum ada riwayat.</td></tr>`;
            return;
        }

        const html = STATE.cache.logs.map((log, i) => `
            <tr onclick="View.showConnectionDetail(${i})" class="border-b hover:bg-blue-50 cursor-pointer transition group">
                <td class="px-4 py-3 text-center text-[10px]">${i + 1}</td>
                <td class="px-4 py-3 font-mono text-xs font-bold text-blue-600 group-hover:underline">${Utils.escapeHTML(log.device_id)}</td>
                <td class="px-4 py-3 text-xs">
                    <div class="flex items-center gap-2">
                        <i data-feather="${log.device_name.includes('Mobile') || log.device_name.includes('Android') ? 'smartphone' : 'monitor'}" class="w-3 h-3 text-slate-400"></i>
                        ${Utils.escapeHTML(log.device_name)}
                    </div>
                </td>
                <td class="px-4 py-3 font-mono text-xs text-slate-500">${Utils.escapeHTML(log.ip_address)}</td>
                <td class="px-4 py-3 text-xs">
                    ${new Date(log.last_seen).toLocaleString('id-ID', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}
                </td>
                <td class="px-4 py-3 text-center text-xs font-bold bg-slate-50 rounded">${log.visit_count || 1}</td>
            </tr>
        `).join('');
        tbody.innerHTML = html;
        feather.replace();
    },

    showConnectionDetail(index) {
        const log = STATE.cache.logs[index];
        if(!log) return;
        Utils.getEl('detail-device-id').innerText = log.device_id;
        Utils.getEl('detail-device-name').innerText = log.device_name;
        Utils.getEl('detail-ip').innerText = log.ip_address;
        Utils.getEl('detail-last-seen').innerText = new Date(log.last_seen).toLocaleString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'});
        Utils.getEl('detail-visits').innerText = log.visit_count || 1;
        Utils.getEl('modal-connection-detail').classList.remove('hidden');
    },

    switchBankTab(tab) {
        ['view-bank-soal', 'view-bank-ujian', 'view-exam-detail', 'view-exam-participants'].forEach(id => {
            if(Utils.getEl(id)) Utils.getEl(id).classList.add('hidden-view');
        });
        ['tab-soal', 'tab-ujian'].forEach(id => {
            if(Utils.getEl(id)) Utils.getEl(id).classList.remove('active');
        });
        
        if(Utils.getEl('view-bank-'+tab)) Utils.getEl('view-bank-'+tab).classList.remove('hidden-view');
        if(Utils.getEl('tab-'+tab)) Utils.getEl('tab-'+tab).classList.add('active');
        
        if(tab === 'ujian') this.renderExamList();
        if(tab === 'soal') this.renderQuestions();
    },

    switchSettingTab(e, tabId) {
        document.querySelectorAll('.setting-content').forEach(c => c.classList.add('hidden-view'));
        const target = Utils.getEl('set-' + tabId);
        if(target) target.classList.remove('hidden-view');
        
        document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.remove('active'));
        if (e && e.currentTarget) e.currentTarget.classList.add('active');
    },

    modals: {
        openEditClass(id = null) {
            STATE.editing.classId = id;
            const target = STATE.cache.classes.find(c => String(c.id) === String(id));
            Utils.getEl('edit-class-name').value = target ? target.name : '';
            Utils.getEl('edit-class-desc').value = target ? target.desc : '';
            Utils.getEl('modal-class-title').innerText = id ? "Edit Data Kelas" : "Tambah Kelas Baru";
            Utils.getEl('modal-edit-class').classList.remove('hidden');
        },
        closeEditClass() { Utils.getEl('modal-edit-class').classList.add('hidden'); STATE.editing.classId = null; },
        
        openEditRoom(id = null) {
            STATE.editing.roomId = id;
            const target = STATE.cache.rooms.find(r => String(r.id) === String(id));
            Utils.getEl('edit-room-name').value = target ? target.name : '';
            Utils.getEl('edit-room-desc').value = target ? target.desc : '';
            Utils.getEl('modal-room-title').innerText = id ? "Edit Ruangan" : "Tambah Ruangan";
            Utils.getEl('modal-edit-room').classList.remove('hidden');
        },
        closeEditRoom() { Utils.getEl('modal-edit-room').classList.add('hidden'); STATE.editing.roomId = null; },

        confirmDelete(id, type) {
            STATE.editing.pendingDeleteId = id;
            STATE.editing.pendingDeleteType = type;
            Utils.getEl('modal-confirm-delete').classList.remove('hidden');
        },

showSuccess(msg) {
            const m = Utils.getEl('modal-success');
            if(!m) return;
            
            // Set pesan
            Utils.getEl('msg-success').innerText = msg;
            
            // Tampilkan modal
            m.classList.remove('hidden');
            
            // --- PERBAIKAN UTAMA: Selector disesuaikan HTML Baru ---
            // Cari elemen background (backdrop) dan panel konten
            // Kita gunakan selector yang lebih fleksibel
            const backdrop = m.querySelector('div.fixed.bg-slate-900\\/60'); 
            const panel = m.querySelector('div.relative.transform');

            // Animasi Masuk (Fade In & Scale Up)
            setTimeout(() => {
                if(backdrop) backdrop.classList.remove('opacity-0');
                if(panel) {
                    panel.classList.remove('scale-95', 'opacity-0');
                    panel.classList.add('scale-100', 'opacity-100');
                }
            }, 10);
            
            // Auto Close setelah 1.5 detik (sesuai durasi animasi loading bar di HTML)
            setTimeout(() => {
                this.closeSuccess();
            }, 1500); 
        },

        closeSuccess() {
            const m = Utils.getEl('modal-success');
            if(!m) return;
            
            // Selector yang sama
            const backdrop = m.querySelector('div.fixed.bg-slate-900\\/60');
            const panel = m.querySelector('div.relative.transform');

            // Animasi Keluar (Fade Out & Scale Down)
            if(backdrop) backdrop.classList.add('opacity-0');
            if(panel) {
                panel.classList.remove('scale-100', 'opacity-100');
                panel.classList.add('scale-95', 'opacity-0');
            }
            
            // Sembunyikan elemen setelah animasi selesai (300ms)
            setTimeout(() => m.classList.add('hidden'), 300);
        },

        showError(title, msg) {
            const modal = Utils.getEl('modal-error');
            Utils.getEl('error-title').innerText = title;
            Utils.getEl('error-message').innerText = msg;
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('div').classList.add('scale-100');
            }, 10);
        },
        closePin() { Utils.getEl('modal-pin').classList.add('hidden'); }
    },

    openExamDetail(name) {
        Utils.getEl('view-bank-ujian').classList.add('hidden-view');
        Utils.getEl('view-exam-detail').classList.remove('hidden-view');
        Utils.getEl('detail-exam-title').innerText = name;
    },
    closeExamDetail() {
        Utils.getEl('view-exam-detail').classList.add('hidden-view');
        Utils.getEl('view-bank-ujian').classList.remove('hidden-view');
    },
    openExamSettings(n, id) {
        STATE.editing.examId = id;
        const exam = STATE.cache.exams.find(e => e.id == id);
        if (exam) {
            Utils.getEl('input-exam-name').value = exam.name;
            Utils.getEl('sched-alloc').value = parseInt(exam.alokasi) || 90;
            Utils.getEl('input-exam-status').value = (exam.status === 'Aktif') ? '1' : '0';
        }
        Utils.getEl('panel-questions').classList.add('hidden-view');
        Utils.getEl('view-exam-settings').classList.remove('hidden-view');
    },
    closeExamSettings() {
        Utils.getEl('view-exam-settings').classList.add('hidden-view');
        Utils.getEl('panel-questions').classList.remove('hidden-view');
        this.switchBankTab('ujian');
    }
};
// ============================================================================
// 6. BUSINESS LOGIC CONTROLLERS
// ============================================================================
const StudentController = {
    // 1. FUNGSI PERSIAPAN TAMBAH (RESET TOTAL)
    async prepareAdd() {
        // A. Reset State ID (Kunci agar tidak dianggap Edit)
        STATE.editing.studentId = null; 
        
        // B. Reset Visual Judul & Tombol
        const titleEl = document.getElementById('form-student-title');
        const btnEl = document.getElementById('btn-save-student');
        
        if(titleEl) titleEl.innerText = "Tambah Peserta Baru";
        if(btnEl) {
            // Kembalikan tombol ke mode Tambah
            btnEl.innerHTML = `<i data-feather="plus" class="w-3.5 h-3.5"></i> <span>Tambahkan</span>`;
            if (typeof feather !== 'undefined') feather.replace();
        }

        // C. Load Dropdown (PENTING: Tunggu sampai selesai)
        await View.populateStudentForm(); 

        // D. Reset Input Text secara Paksa (Looping ID agar bersih)
        const inputs = ['input-nama', 'input-id-peserta', 'input-username', 'input-password', 'input-sesi', 'input-sekolah', 'input-catatan'];
        inputs.forEach(id => {
            const el = Utils.getEl(id);
            if(el) el.value = ''; // Kosongkan nilai
        });

        // E. Reset Select/Dropdown (FIXED: Pilih Index 0 / Default)
        const selects = ['input-kelas', 'input-ruangan', 'input-agama'];
        selects.forEach(id => {
            const el = Utils.getEl(id);
            if(el) {
                el.value = "";       // Reset value
                el.selectedIndex = 0; // Pilih opsi pertama (-- Pilih --)
            }
        });

        // F. RESET FOTO & PREVIEW
        const fileInput = Utils.getEl('file-upload-add');
        if(fileInput) fileInput.value = ''; // Hapus file yang terpilih
        
        Utils.getEl('preview-foto-add').classList.add('hidden');
        Utils.getEl('preview-foto-add').src = '';
        Utils.getEl('icon-foto-add').classList.remove('hidden');
        Utils.getEl('filename-add').innerText = "Tidak ada berkas dipilih.";

        // G. Pindah Halaman
        View.nav('add-student');
    },

    // 2. FUNGSI PERSIAPAN EDIT (Isi Form)
    async prepareEdit(id) {
        STATE.editing.studentId = id; 
        
        const student = STATE.cache.students.find(s => s.id == id || s.id_peserta == id);
        
        if (student) {
            // Ubah Judul & Tombol jadi "Update"
            const titleEl = document.getElementById('form-student-title');
            const btnEl = document.getElementById('btn-save-student');

            if(titleEl) titleEl.innerText = "Edit Data Peserta";
            if(btnEl) {
                btnEl.innerHTML = `<i data-feather="save" class="w-3.5 h-3.5"></i> <span>Update Data</span>`;
                if (typeof feather !== 'undefined') feather.replace();
            }

            // Load dropdown dulu sebelum mengisi value
            await View.populateStudentForm(); 

            // Isi Form
            if(Utils.getEl('input-nama')) Utils.getEl('input-nama').value = student.nama_lengkap || student.nama || '';
            if(Utils.getEl('input-id-peserta')) Utils.getEl('input-id-peserta').value = student.id_peserta || '';
            if(Utils.getEl('input-username')) Utils.getEl('input-username').value = student.username || '';
            if(Utils.getEl('input-password')) Utils.getEl('input-password').value = student.password || student.pass || '';
            if(Utils.getEl('input-sesi')) Utils.getEl('input-sesi').value = student.sesi || '';
            if(Utils.getEl('input-sekolah')) Utils.getEl('input-sekolah').value = student.sekolah || '';
            if(Utils.getEl('input-catatan')) Utils.getEl('input-catatan').value = student.catatan || '';
            
            // Isi Dropdown (Pastikan value cocok)
            if(Utils.getEl('input-kelas')) Utils.getEl('input-kelas').value = student.kelas || '';
            if(Utils.getEl('input-ruangan')) Utils.getEl('input-ruangan').value = student.ruangan || '';
            if(Utils.getEl('input-agama')) Utils.getEl('input-agama').value = student.agama || '';

            // Handling Foto
            const imgUrl = student.foto_url || student.foto;
            if (imgUrl) {
                Utils.getEl('preview-foto-add').src = imgUrl;
                Utils.getEl('preview-foto-add').classList.remove('hidden');
                Utils.getEl('icon-foto-add').classList.add('hidden');
                Utils.getEl('filename-add').innerText = "Foto tersimpan.";
            } else {
                Utils.getEl('preview-foto-add').classList.add('hidden');
                Utils.getEl('icon-foto-add').classList.remove('hidden');
                Utils.getEl('filename-add').innerText = "Belum ada foto.";
            }
            
            if(Utils.getEl('file-upload-add')) Utils.getEl('file-upload-add').value = '';

            View.nav('add-student');
        } else {
            alert("Data tidak ditemukan. Silakan refresh.");
        }
    },

    // 3. FUNGSI SIMPAN (UPLOAD + SAVE + AUTO RESET)
    async save() {
        const btn = document.getElementById('btn-save-student');
        
        const data = {
            nama_lengkap: Utils.getEl('input-nama').value,
            id_peserta: Utils.getEl('input-id-peserta').value,
            username: Utils.getEl('input-username').value,
            password: Utils.getEl('input-password').value,
            kelas: Utils.getEl('input-kelas').value,
            ruangan: Utils.getEl('input-ruangan').value,
            sesi: Utils.getEl('input-sesi').value,
            sekolah: Utils.getEl('input-sekolah').value || '-',
            agama: Utils.getEl('input-agama').value || '-',
            catatan: Utils.getEl('input-catatan').value || '-'
        };

        if (!data.nama_lengkap || !data.username) return alert("Nama dan Username wajib diisi!");

        const fileInput = Utils.getEl('file-upload-add');
        const file = fileInput && fileInput.files.length > 0 ? fileInput.files[0] : null;

        Utils.setLoading(btn, true, "Memproses...");

        try {
            if (file) {
                const photoUrl = await DB.uploadPhoto(file);
                if (photoUrl) data.foto_url = photoUrl;
            }

            let result;
            let isEditMode = STATE.editing.studentId !== null; 

            if (isEditMode) {
                // UPDATE
                result = await DB.updateStudent(STATE.editing.studentId, data);
            } else {
                // INSERT
                result = await DB.addStudent(data);
            }

            if (result.error) throw new Error(result.error.message);

            Utils.setLoading(btn, false);
            
            if (isEditMode) {
                View.modals.showSuccess("Data berhasil diperbarui!");
                
                // --- PERBAIKAN UTAMA (FIX BUG 1) ---
                // Setelah edit sukses, kita RESET state ID agar tidak "nyangkut"
                STATE.editing.studentId = null; 
                
                // Kembalikan tombol dan judul ke default (opsional, tapi aman)
                const titleEl = document.getElementById('form-student-title');
                if(titleEl) titleEl.innerText = "Tambah Peserta Baru";
                
                View.nav('students'); 
            } else {
                View.modals.showSuccess("Siswa berhasil ditambahkan!");
                this.prepareAdd(); // Reset form total
            }
            
            View.renderStudents(false);

        } catch (err) {
            Utils.setLoading(btn, false);
            alert("Terjadi Kesalahan: " + err.message);
            console.error(err);
        }
    }
};
const ClassController = {
    async save() {
        const btn = document.querySelector('#modal-edit-class button[onclick="saveClassData()"]');
        const name = Utils.getEl('edit-class-name').value;
        const desc = Utils.getEl('edit-class-desc').value;
        const isEdit = STATE.editing.classId;
        
        if(!name) return alert("Nama kelas wajib!");
        Utils.setLoading(btn, true);
        
        let res = isEdit ? await DB.updateClass(isEdit, { nama_kelas: name, deskripsi: desc }) 
                         : await DB.addClass({ nama_kelas: name, kode_kelas: "KLS-"+Date.now(), deskripsi: desc });
                          
        Utils.setLoading(btn, false);
        if(!res.error) {
            View.modals.closeEditClass();
            View.modals.showSuccess("Data kelas disimpan");
            View.renderClasses();
        }
    }
};

const RoomController = {
    async save() {
        const btn = document.querySelector('#modal-edit-room button[onclick="saveRoomData()"]');
        const name = Utils.getEl('edit-room-name').value;
        const desc = Utils.getEl('edit-room-desc').value;
        const isEdit = STATE.editing.roomId;
        
        if(!name) return alert("Nama wajib!");
        Utils.setLoading(btn, true);
        
        let res = isEdit ? await DB.updateRoom(isEdit, { nama_ruangan: name, deskripsi: desc })
                         : await DB.addRoom({ nama_ruangan: name, kode_ruangan: "R-"+Date.now(), deskripsi: desc });
                          
        Utils.setLoading(btn, false);
        if(!res.error) {
            View.modals.closeEditRoom();
            View.modals.showSuccess("Data ruangan disimpan");
            View.renderRooms();
        }
    },
    async delete() {
        const { pendingDeleteId: id, pendingDeleteType: type } = STATE.editing;
        Utils.getEl('modal-confirm-delete').classList.add('hidden');
        
        let res;
        if(type === 'class') { res = await DB.deleteClass(id); View.renderClasses(); }
        else if(type === 'room') { res = await DB.deleteRoom(id); View.renderRooms(); }
        else if(type === 'exam') { res = await DB.deleteExam(id); View.renderExamList(); }
        else if(type === 'student') { 
             const { error } = await db.from('students').delete().eq('id_peserta', id); 
             if(!error) View.renderStudents(false);
        }
        if(!res?.error) View.modals.showSuccess("Data berhasil dihapus");
    }
};

const ExamController = {
    async add() {
        const name = prompt("Nama Ujian:");
        if(name) {
            await DB.addExam({ nama_ujian: name, status: 'Tidak Aktif', alokasi: '90 Menit' });
            View.renderExamList();
            View.updateDashboard();
        }
    },
    async toggleStatus(idx) {
        const exam = STATE.cache.exams[idx];
        const newStatus = exam.status === 'Aktif' ? 'Tidak Aktif' : 'Aktif';
        await DB.updateExam(exam.id, { status: newStatus });
        View.renderExamList();
        View.updateDashboard();
    },
    async delete(idx) {
        const exam = STATE.cache.exams[idx];
        View.modals.confirmDelete(exam.id, 'exam');
    },
    async saveSettings(section) {
        const id = STATE.editing.examId;
        if(!id) return;
        let data = {};
        if (section === 'info') data = { 
            nama_ujian: Utils.getEl('input-exam-name').value, 
            status: (Utils.getEl('input-exam-status').value == '1') ? 'Aktif' : 'Tidak Aktif' 
        };
        await DB.updateExam(id, data);
        View.modals.showSuccess("Pengaturan tersimpan");
        View.renderExamList();
    }
};
// ============================================================================
// BULK CONTROLLER (LOGIKA EKSEKUSI MASSAL)
// ============================================================================
const BulkController = {
    // A. EKSEKUSI DENGAN INPUT (Pindah Kelas, Ruang, Sesi, Daftar Ujian)
    async execute(actionType) {
        const items = View.selectedItems; // Berisi array UUID [1, 2, 3...]
        if (items.length === 0) return alert("Pilih data peserta terlebih dahulu!");

        const btnSave = event.target; 
        let inputVal = "";
        let dbField = "";
        let modalId = "";

        // 1. DAFTARKAN UJIAN
        if (actionType === 'register_exam') {
            inputVal = Utils.getEl('bulk-input-exam').value;
            modalId = 'modal-register-exam';
            if (!inputVal) return alert("Silakan pilih ujian tujuan!");

            Utils.setLoading(btnSave, true, "Mendaftarkan...");
            
            // --- PERBAIKAN UTAMA DI SINI ---
            // Langsung kirim 'items' karena isinya sudah ID yang benar (UUID/BigInt)
            // Tidak perlu query 'select id from students' lagi.
            const { error } = await DB.registerExamParticipants(inputVal, items);
            
            Utils.setLoading(btnSave, false);

            if (!error) {
                this.finishAction(modalId, `Berhasil mendaftarkan ${items.length} siswa!`);
            } else {
                alert("Gagal daftar ujian: " + error.message);
                console.error(error); // Untuk debugging
            }
            return;
        }

        // 2. LOGIKA PINDAH KELAS / RUANGAN / SESI
        if (actionType === 'move_class') {
            inputVal = Utils.getEl('bulk-input-class').value;
            dbField = 'kelas';
            modalId = 'modal-move-class';
            if (!inputVal) return alert("Pilih kelas tujuan!");
        } 
        else if (actionType === 'move_room') {
            inputVal = Utils.getEl('bulk-input-room').value;
            dbField = 'ruangan';
            modalId = 'modal-move-room';
            if (!inputVal) return alert("Pilih ruangan tujuan!");
        } 
        else if (actionType === 'move_session') {
            inputVal = Utils.getEl('bulk-input-session').value;
            dbField = 'sesi';
            modalId = 'modal-move-session';
            if (!inputVal) return alert("Isi sesi baru!");
        }

        // Eksekusi Update Biasa
        Utils.setLoading(btnSave, true, "Menyimpan...");
        
        const updateData = {};
        updateData[dbField] = inputVal;

        const { error } = await DB.bulkUpdateStudents(items, updateData);
        Utils.setLoading(btnSave, false);

        if (!error) {
            this.finishAction(modalId, "Data berhasil diperbarui!");
        } else {
            alert("Gagal update: " + error.message);
            console.error(error);
        }
    },

    // B. EKSEKUSI LANGSUNG (Hapus Data & Random Password)
    async action(type) {
        const items = View.selectedItems;
        if (items.length === 0) return alert("Pilih data peserta terlebih dahulu!");

        // 1. HAPUS DATA MASSAL
        if (type === 'delete') {
            if (!confirm(`YAKIN HAPUS ${items.length} DATA?\nData yang dihapus tidak bisa kembali!`)) return;
            
            const { error } = await DB.bulkDeleteStudents(items);
            
            if (!error) {
                this.finishAction(null, "Data berhasil dihapus permanen.");
            } else {
                alert("Gagal hapus: " + error.message);
                console.error(error);
            }
        }

        // 2. RANDOM PASSWORD MASSAL
        // 2. RANDOM PASSWORD KUSTOM (BARU)
        else if (type === 'random_pass') {
            if (!confirm(`Reset password kustom untuk ${items.length} siswa?\nFormat: 3 Huruf Nama + 3 Angka Acak`)) return;

            // Kita gunakan try-catch untuk keamanan proses loop
            try {
                // Ambil data detail siswa yang dipilih dari cache
                const targetStudents = STATE.cache.students.filter(s => items.includes(s.id));
                
                // Siapkan array promise untuk update parallel (agar cepat)
                const updates = targetStudents.map(student => {
                    // Ambil nama, hapus spasi/simbol
                    const nama = (student.nama_lengkap || student.nama || 'USER').replace(/[^a-zA-Z]/g, ''); 
                    
                    // Ambil 3 huruf terakhir. Jika nama pendek, ambil semua lalu tambah 'X'
                    let suffix = "";
                    if (nama.length >= 3) {
                        suffix = nama.substring(nama.length - 3).toUpperCase();
                    } else {
                        suffix = nama.toUpperCase().padEnd(3, 'X');
                    }

                    // Generate 3 angka acak (100-999)
                    const randomNum = Math.floor(Math.random() * 900) + 100; 
                    
                    // Gabungkan: XXX + 123 = 6 Karakter
                    const newPass = suffix + randomNum;

                    // Update ke DB per user (menggunakan ID spesifik)
                    // Note: Kita update langsung via DB wrapper atau direct call
                    return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
                        .from('students')
                        .update({ password: newPass })
                        .eq('id', student.id);
                });

                // Jalankan semua update sekaligus
                await Promise.all(updates);

                this.finishAction(null, `Berhasil! Password siswa diubah sesuai format nama.`);
                
            } catch (e) {
                console.error(e);
                alert("Gagal update password massal: " + e.message);
            }
        }
    },

    // C. Helper Selesai Aksi
    finishAction(modalId, msg) {
        if (modalId) {
            const modal = document.getElementById(modalId);
            if(modal) modal.classList.add('hidden');
        }
        
        View.modals.showSuccess(msg);
        
        // Refresh Tabel & Reset Seleksi
        View.renderStudents(false); 
        View.selectedItems = [];
        View.updateBulkButtonUI();
        
        // Uncheck header checkbox
        const checkAll = document.getElementById('check-all-students');
        if(checkAll) checkAll.checked = false;
    }
};
// ============================================================================
// SETTINGS CONTROLLER (TOKEN & KONFIGURASI)
// ============================================================================
const SettingsController = {
    async generateToken() {
        const btn = event.target.closest('button');
        Utils.setLoading(btn, true, "Generating...");
        
        try {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let newToken = "";
            for (let i = 0; i < 6; i++) newToken += chars.charAt(Math.floor(Math.random() * chars.length));
            
            // Simpan ke Database
            const { error } = await DB.updateToken(newToken);
            
            if (error) throw error;
            View.modals.showSuccess("Token berhasil diperbarui!");
            
        } catch (e) {
            alert("Gagal: " + e.message);
        } finally {
            Utils.setLoading(btn, false);
            btn.innerHTML = `<i data-feather="refresh-cw" class="w-4 h-4"></i> Generate Baru`;
            feather.replace();
        }
    },

    async saveTokenSettings() {
        const btn = event.target.closest('button');
        const duration = Utils.getEl('token-duration').value;
        const autoRefresh = Utils.getEl('toggle-auto-token').checked;

        Utils.setLoading(btn, true, "Menyimpan...");
        
        const { error } = await DB.updateTokenConfig(duration, autoRefresh);
        
        Utils.setLoading(btn, false);
        
        if (!error) {
            View.modals.showSuccess("Pengaturan token disimpan!");
        } else {
            alert("Gagal menyimpan: " + error.message);
        }
    }
};
// ============================================================================
// 7. REALTIME FEATURES (TOKEN + ANIMASI SVG)
// ============================================================================
const RealtimeFeatures = {
    init() {
        this.initToken();
        this.initPresence();
        this.initTraffic();
    },

    initToken() {
        db.channel('public:exam_settings')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_settings' }, (payload) => {
                this.updateTokenUI(payload.new);
            })
            .subscribe();
        db.from('exam_settings').select('*').eq('id', 1).single().then(({data}) => { if(data) this.updateTokenUI(data); });
    },

    updateTokenUI(data) {
        if(Utils.getEl('dash-token')) Utils.getEl('dash-token').innerText = data.token_code;
        if(data.expired_at) this.startTimer(new Date(data.expired_at));
    },

    // [RESTORED] Logika Animasi Lingkaran Biru
    // Di dalam objek RealtimeFeatures
    startTimer(target) {
        if(STATE.intervals.tokenTimer) clearInterval(STATE.intervals.tokenTimer);
        const circle = document.querySelector('.progress-ring__circle');
        const timerText = Utils.getEl('dash-timer');
        // Asumsi 15 menit full (sesuaikan dengan alokasi token Anda)
        const totalDuration = 15 * 60 * 1000; 
    
        STATE.intervals.tokenTimer = setInterval(() => {
            const now = new Date();
            const diff = target - now;
            
            // --- PERBAIKAN POIN 1: Logika Expired ---
            if(diff <= 0) {
                clearInterval(STATE.intervals.tokenTimer);
                if(timerText) {
                    timerText.innerText = "EXPIRED";
                    timerText.classList.remove('text-slate-700');
                    timerText.classList.add('text-red-500', 'font-bold'); // Merah tebal
                }
                
                // Buat lingkaran kosong (putih)
                if (circle) {
                    const radius = circle.r.baseVal.value;
                    const circumference = radius * 2 * Math.PI;
                    circle.style.strokeDasharray = `${circumference} ${circumference}`;
                    circle.style.strokeDashoffset = circumference; // Offset penuh = kosong
                }
                return;
            }
            // ----------------------------------------
    
            // Reset warna jika token diperbarui
            if(timerText && timerText.classList.contains('text-red-500')) {
                timerText.classList.remove('text-red-500', 'font-bold');
                timerText.classList.add('text-slate-700');
            }
    
            const m = Math.floor((diff/60000)%60).toString().padStart(2,'0');
            const s = Math.floor((diff/1000)%60).toString().padStart(2,'0');
            if(timerText) timerText.innerText = `${m}:${s}`;
    
            if (circle) {
                const radius = circle.r.baseVal.value;
                const circumference = radius * 2 * Math.PI;
                circle.style.strokeDasharray = `${circumference} ${circumference}`;
                const percent = Math.max(0, (diff / totalDuration) * 100);
                const offset = circumference - (percent / 100) * circumference;
                circle.style.strokeDashoffset = offset;
            }
        }, 1000);
    },

    async regenerateToken() {
        const btn = document.querySelector('button[onclick="regenerateToken()"]');
        Utils.setLoading(btn, true, "...");
        try {
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let newToken = "";
            for (let i = 0; i < 6; i++) newToken += chars.charAt(Math.floor(Math.random() * chars.length));
            const expiredAt = new Date(Date.now() + 15 * 60000); // 15 menit
            await db.from('exam_settings').update({ token_code: newToken, expired_at: expiredAt.toISOString() }).eq('id', 1);
        } catch(e) { alert(e.message); } 
        finally { btn.innerHTML = `<i data-feather="refresh-cw" class="w-4 h-4"></i> Generate Baru`; btn.disabled = false; feather.replace(); }
    },
    async initPresence() {
        if (STATE.realtime && STATE.realtime.presenceChannel) {
            await STATE.realtime.presenceChannel.unsubscribe();
            db.removeChannel(STATE.realtime.presenceChannel);
            STATE.realtime.presenceChannel = null;
        }

        const session = JSON.parse(localStorage.getItem('cbt_user_session'));
        const myRole = session ? session.role : 'guest'; 
        const myUsername = session ? session.username : 'anon';

        const room = db.channel('online_users_room', {
            config: { presence: { key: myUsername + '-' + Date.now() } },
        });

        if (!STATE.realtime) STATE.realtime = {};
        STATE.realtime.presenceChannel = room;

    room.on('presence', { event: 'sync' }, () => {
            const state = room.presenceState();
            const allUsers = Object.values(state).flat();

            const uniqueDeviceSet = new Set(allUsers.map(u => u.username));
            const totalUniqueDevices = uniqueDeviceSet.size;

            const countAdmin = new Set(allUsers.filter(u => u.userRole === 'admin').map(u => u.username)).size;
            const countPengawas = new Set(allUsers.filter(u => u.userRole === 'pengawas').map(u => u.username)).size;
            const countSiswa = new Set(allUsers.filter(u => u.userRole === 'siswa').map(u => u.username)).size;
            const totalSocket = allUsers.length;

            if(Utils.getEl('stat-admin-online')) Utils.getEl('stat-admin-online').innerText = countAdmin;
            if(Utils.getEl('stat-proctor-online')) Utils.getEl('stat-proctor-online').innerText = countPengawas;
            if(Utils.getEl('stat-online')) Utils.getEl('stat-online').innerText = countSiswa;
            
            if(Utils.getEl('stat-socket')) Utils.getEl('stat-socket').innerText = totalSocket;

            if(Utils.getEl('stat-active-devices')) {
                Utils.getEl('stat-active-devices').innerText = totalUniqueDevices;
            }
        });

        room.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await room.track({
                    online: true,
                    userRole: myRole,
                    username: myUsername
                });
            }
        });
    },

    async initTraffic() {
        try {
            await db.rpc('increment_hit');
        } catch (err) { console.warn("Setup increment_hit di Supabase dulu."); }

        db.channel('public:site_stats')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_stats'}, (payload) => {
                if(Utils.getEl('stat-total-hits')) {
                    Utils.getEl('stat-total-hits').innerText = payload.new.total_hits;
                }
        }).subscribe();
        
        const { data } = await db.from('site_stats').select('total_hits').eq('id', 1).single();
        if(data && Utils.getEl('stat-total-hits')) {
            Utils.getEl('stat-total-hits').innerText = data.total_hits;
        }
    }
};

// ============================================================================
// 8. MAIN APP & TICKER
// ============================================================================
const App = {
    init() {
        console.log("CBT Pro Enterprise Loaded.");
        Auth.init();
        RealtimeFeatures.init();
        
        DB.incrementHit(); // Tambah counter HTTP
        DB.logDevice();    // Rekam Perangkat
        
        this.runTicker();
        if (typeof feather !== 'undefined') feather.replace();
        setInterval(() => {
            const el = Utils.getEl('admin-clock');
            if(el) el.innerText = new Date().toLocaleTimeString('id-ID', {hour12:false});
        }, 1000);
    },

    runTicker() {
        const el = Utils.getEl('dynamic-ticker');
        if(!el) return;
        const msg = CONFIG.TICKER_MESSAGES[STATE.ui.tickerIndex];
        el.innerHTML = msg.text;
        el.className = 'ticker-text ' + msg.anim;
        el.style.animation = 'none';
        el.offsetHeight; 
        el.style.animation = null; 
        setTimeout(() => {
            STATE.ui.tickerIndex = (STATE.ui.tickerIndex + 1) % CONFIG.TICKER_MESSAGES.length;
            this.runTicker();
        }, msg.duration);
    }
};

// ============================================================================
// 9. GLOBAL BRIDGES (AGAR HTML ONCLICK BERFUNGSI NORMAL)
// ============================================================================
window.adminNav = (id) => View.nav(id);
window.fetchAdminData = () => View.renderStudents(true);
window.saveStudentData = () => StudentController.save();
window.toggleAllStudents = (src) => document.querySelectorAll('.student-checkbox').forEach(c => c.checked = src.checked);

window.toggleActionDropdown = (i, e) => { 
    e.stopPropagation(); 
    document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show')); 
    const target = document.getElementById(`dropdown-${i}`);
    if(target) target.classList.toggle('show'); 
};
window.closeDropdowns = (e) => { 
    if(!e.target.closest('.action-dropdown')) document.querySelectorAll('.action-dropdown').forEach(d => d.classList.remove('show')); 
};

// Modals & Forms
window.openEditClassModal = () => View.modals.openEditClass();
window.closeEditClassModal = () => View.modals.closeEditClass();
window.saveClassData = () => ClassController.save();
window.openEditRoomModal = (id) => View.modals.openEditRoom(id);
window.closeEditRoomModal = () => View.modals.closeEditRoom();
window.saveRoomData = () => RoomController.save();
window.executeDelete = () => RoomController.delete();
window.prepareEditClass = (id) => View.modals.openEditClass(id);
window.deleteClass = (id) => View.modals.confirmDelete(id, 'class');
window.confirmDelete = (id, type) => View.modals.confirmDelete(id, type);

// Exams & Questions
window.addNewExam = () => ExamController.add();
window.openExamDetail = (name) => View.openExamDetail(name);
window.closeExamDetail = () => View.closeExamDetail();
window.openExamSettings = (n, id) => View.openExamSettings(n, id);
window.closeExamSettings = () => View.closeExamSettings();
window.saveSpecificSettings = (sec) => ExamController.saveSettings(sec);
window.switchBankTab = (tab) => View.switchBankTab(tab);
window.switchSettingTab = (e, tab) => View.switchSettingTab(e, tab);
window.updateRealtimeSummary = () => View.updateRealtimeSummary();
window.toggleExamStatus = (i) => ExamController.toggleStatus(i);
window.deleteExam = (i) => ExamController.delete(i);
window.saveQuestion = async () => {
    const text = Utils.getEl('q-text').value;
    const type = Utils.getEl('q-type').value;
    await DB.addQuestion({ text, type });
    Utils.getEl('modal-add-question').classList.add('hidden');
    View.renderQuestions();
};
window.openAddQuestionModal = () => Utils.getEl('modal-add-question').classList.remove('hidden');
window.renderAnswerInputs = () => { /* Logic render */ };
window.deleteQuestion = (i) => { if(confirm('Hapus?')) { STATE.cache.questions.splice(i,1); View.renderQuestions(); }};

// Auth & System
window.attemptLogin = () => Auth.login('log-user', 'log-pass', 'btn-login');
window.verifyAdminLoginReal = () => Auth.login('admin-user-input', 'admin-pass-input', 'btn-admin-login');
window.logoutAdmin = () => Auth.logout();
window.regenerateToken = () => RealtimeFeatures.regenerateToken();
window.updateDashboardStats = () => View.updateDashboard();
window.toggleSidebar = () => View.toggleSidebar();
window.toggleFullScreen = () => { if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else if(document.exitFullscreen) document.exitFullscreen(); };
window.toggleProfileMenu = (e) => { e.stopPropagation(); Utils.getEl('profile-dropdown').classList.toggle('hidden'); };

// Modal Close Animations
window.closeSuccessModal = () => View.modals.closeSuccess(); 
window.closeErrorModal = () => {
    const modal = Utils.getEl('modal-error');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

// Print Logic
window.handlePrint = () => {
    const content = Utils.getEl('card-preview-area').innerHTML;
    const win = window.open('', '', 'height=700,width=700');
    win.document.write('<html><head><title>Cetak Kartu</title>');
    win.document.write('<link rel="stylesheet" href="style.css">');
    win.document.write('</head><body>');
    win.document.write(content);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
};
// --- TAMBAHAN GLOBAL FUNCTIONS ---

// Fungsi untuk membuka/tutup dropdown tombol Terseleksi
window.toggleBulkActions = (e) => {
    e.stopPropagation(); // Mencegah event bubbling
    const dropdown = document.getElementById('dropdown-bulk-actions');
    
    // Hanya buka jika ada item yang dipilih
    if (View.selectedItems.length === 0) {
        alert("Pilih data peserta terlebih dahulu!");
        return;
    }

    if (dropdown) {
        dropdown.classList.toggle('hidden');
        dropdown.classList.toggle('block'); // Pastikan CSS block aktif
    }
};

// Tutup dropdown jika klik di luar (sudah ada di kode lama, tapi pastikan ini)
window.onclick = (e) => {
    if (!e.target.closest('#dropdown-bulk-actions') && !e.target.closest('button[onclick="toggleBulkActions(event)"]')) {
        const dropdown = document.getElementById('dropdown-bulk-actions');
        if (dropdown) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    }
    // ... fungsi closeDropdowns lain ...
};

// Tutup dropdown jika klik di luar
window.onclick = (e) => {
    if (!e.target.closest('#dropdown-bulk-actions') && !e.target.closest('button[onclick="toggleBulkActions(event)"]')) {
        const dropdown = document.getElementById('dropdown-bulk-actions');
        if (dropdown) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('block');
        }
    }
    // ... fungsi closeDropdowns lain ...
};
// Fungsi Helper untuk membuka modal Bulk Action sekaligus memuat datanya
window.openBulkModal = (modalId) => {
    // 1. Load data dropdown dari database
    View.populateBulkDropdowns(); 
    
    // 2. Tampilkan modal yang diminta
    const modal = document.getElementById(modalId);
    if(modal) modal.classList.remove('hidden');
};
// Global Function untuk Preview Image saat Input File berubah
window.previewAddImage = (input) => {
    const file = input.files[0];
    if (file) {
        // Validasi Ukuran (Max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert("Ukuran foto terlalu besar! Maksimal 2MB.");
            input.value = ""; // Reset input
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('preview-foto-add');
            const icon = document.getElementById('icon-foto-add');
            const label = document.getElementById('filename-add');
            
            img.src = e.target.result;
            img.classList.remove('hidden');
            icon.classList.add('hidden');
            label.innerText = file.name; // Tampilkan nama file
        }
        reader.readAsDataURL(file);
    }
};

window.clearAddImage = () => {
    const input = document.getElementById('file-upload-add');
    const img = document.getElementById('preview-foto-add');
    const icon = document.getElementById('icon-foto-add');
    const label = document.getElementById('filename-add');
    
    input.value = "";
    img.src = "";
    img.classList.add('hidden');
    icon.classList.remove('hidden');
    label.innerText = "Tidak ada berkas dipilih.";
};
// Tambahkan ini agar ikon foto bisa diklik
window.triggerPhotoUpload = () => {
    const input = document.getElementById('file-upload-add');
    if (input) input.click();
};
// 2. FUNGSI MEDIA
window.updateCardLogo = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            logoBase64 = e.target.result;
            localStorage.setItem('cbt_logo_data', logoBase64);
            const status = document.getElementById('logo-status');
            if(status) status.innerText = "Logo Terpasang";
            renderCardPreview(); 
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.updateCardSignature = function(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            signatureBase64 = e.target.result;
            localStorage.setItem('cbt_sig_data', signatureBase64);
            renderCardPreview();
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.removeLogo = function() {
    logoBase64 = null;
    localStorage.removeItem('cbt_logo_data');
    document.getElementById('card-logo-input').value = "";
    renderCardPreview();
};
// Ganti fungsi window.showCardPreview yang lama dengan ini:
window.showCardPreview = () => {
    // 1. Validasi: Harus ada siswa yang dipilih
    if (View.selectedItems.length === 0) {
        alert("Pilih minimal satu siswa untuk mencetak kartu!");
        return;
    }
    
    // 2. Pindah ke halaman cetak
    View.nav('card-print');
    
    // 3. Muat data yang tersimpan di memori (Auto-Fill)
    loadPrintSettings();
    
    // 4. Render Kartu (Beri sedikit delay agar elemen HTML siap)
    setTimeout(() => {
        renderCardPreview();
        autoScalePaper();
    }, 150);
};
window.renderCardPreview = () => {
    const container = Utils.getEl('card-preview-area');
    if (!container) return;

    // 1. Ambil Data Form
    const h1 = Utils.getEl('card-h1').value || 'DINAS PENDIDIKAN';
    const h2 = Utils.getEl('card-h2').value || 'NAMA SEKOLAH';
    const h3 = Utils.getEl('card-h3').value || 'Alamat Sekolah';
    const title = Utils.getEl('card-title').value || 'KARTU PESERTA UJIAN';
    const subtitle = Utils.getEl('card-subtitle').value || 'SEMESTER GANJIL';
    const teacher = Utils.getEl('card-teacher').value || 'Kepala Sekolah';
    const nip = Utils.getEl('card-nip').value || '-';

    // 2. Filter Data Siswa
    const selectedStudents = STATE.cache.students.filter(s => 
        View.selectedItems.includes(String(s.id))
    );

    if (selectedStudents.length === 0) {
        container.innerHTML = '<div class="flex h-full items-center justify-center text-slate-400 font-bold">Tidak ada data siswa dipilih.</div>';
        return;
    }

    // 3. Terapkan Style Grid
    container.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-auto-rows: max-content;
        gap: 2mm;
        padding: 5mm;
        box-sizing: border-box;
        width: 100%;
        background: transparent;
    `;

    // 4. Render Kartu dengan Integrasi Logo & TTD
    container.innerHTML = selectedStudents.map(s => `
        <div style="
            border: 1px solid #000; 
            padding: 5px; 
            font-family: 'Times New Roman', serif; 
            position: relative; 
            height: 80mm;
            background: white; 
            font-size: 10px;
            overflow: hidden;
            page-break-inside: avoid;
        ">
            <div style="display: flex; align-items: center; border-bottom: 2px double #000; padding-bottom: 3px; margin-bottom: 5px; min-height: 40px;">
                ${logoBase64 ? `
                    <img src="${logoBase64}" style="width: 30px; height: 35px; object-fit: contain; margin-right: 5px;">
                ` : '<div style="width: 30px;"></div>'}
                
                <div style="flex: 1; text-align: center; margin-right: ${logoBase64 ? '30px' : '0'};">
                    <h3 style="margin:0; font-size: 8px; font-weight: bold; text-transform: uppercase; line-height: 1.1;">${h1}</h3>
                    <h2 style="margin:0; font-size: 9px; font-weight: bold; text-transform: uppercase; line-height: 1.1;">${h2}</h2>
                    <p style="margin:0; font-size: 7px; line-height: 1.1;">${h3}</p>
                </div>
            </div>
            
            <div style="text-align: center; margin-bottom: 8px; background: #f1f5f9; padding: 3px; border: 1px solid #cbd5e1;">
                <strong style="font-size: 9px; text-transform: uppercase; display: block;">${title}</strong>
                <span style="font-size: 8px;">${subtitle}</span>
            </div>

            <div style="display: flex; gap: 6px;">
                <div style="width: 18mm; height: 24mm; border: 1px solid #94a3b8; display: flex; align-items: center; justify-content: center; font-size: 7px; color: #cbd5e1; background: #f8fafc; flex-shrink: 0;">
                    ${s.foto_url ? `<img src="${s.foto_url}" style="width:100%; height:100%; object-fit: cover;">` : 'FOTO 3x4'}
                </div>

                <div style="flex: 1;">
                    <table style="width: 100%; font-size: 8px; border-collapse: collapse; line-height: 1.2;">
                        <tr><td style="width: 45px;">No Peserta</td><td>: <b>${s.id_peserta || '-'}</b></td></tr>
                        <tr><td>Nama</td><td>: <b>${(s.nama_lengkap || s.nama || '-').toUpperCase().substring(0, 15)}</b></td></tr>
                        <tr><td>Kelas</td><td>: ${s.kelas || '-'}</td></tr>
                        <tr><td>Username</td><td>: ${s.username || '-'}</td></tr>
                        <tr><td>Password</td><td>: <b>${s.password || s.pass || '-'}</b></td></tr>
                        <tr><td>Ruang/Sesi</td><td>: ${s.ruangan || '-'} / ${s.sesi || '-'}</td></tr>
                    </table>
                </div>
            </div>

            <div style="position: absolute; bottom: 5px; right: 5px; text-align: center; font-size: 8px; width: 35mm;">
                <p style="margin-bottom: 2px;">Kepala Sekolah,</p>
                <div style="height: 30px; display: flex; align-items: center; justify-content: center; margin-bottom: 2px;">
                    ${signatureBase64 ? `
                        <img src="${signatureBase64}" style="height: 100%; max-width: 100%; object-fit: contain;">
                    ` : '<div style="height: 30px;"></div>'}
                </div>
                <p style="font-weight: bold; text-decoration: underline; margin: 0; line-height: 1;">${teacher}</p>
                <p style="margin: 0; line-height: 1;">NIP. ${nip}</p>
            </div>
        </div>
    `).join('');
    
    setTimeout(autoScalePaper, 50);
};
/**
 * FUNGSI AUTO-SCALE (V2.0)
 * Menyesuaikan kertas A4 (794px) agar pas di lebar layar tanpa merusak layout asli.
 */
function autoScalePaper() {
    const container = document.getElementById('preview-container'); // Wadah abu-abu
    const paper = document.getElementById('print-area-wrapper');    // Kertas A4 putih
    
    if (!container || !paper) return;

    // 1. Definisikan lebar standar A4 dalam pixel (96 DPI = 794px)
    const paperWidth = 794; 
    
    // 2. Ambil lebar layar yang tersedia (dikurangi padding agar tidak mepet)
    const availableWidth = container.clientWidth - 32; // 32px padding total

    // 3. Hitung skala (Scale)
    // Jika layar < 794px, maka hitung rasio pengecilannya. Jika lebih besar, tetap 1 (100%).
    let scale = availableWidth < paperWidth ? availableWidth / paperWidth : 1;
    
    // 4. Terapkan Transformasi CSS
    // Transform-origin 'top center' memastikan kertas tetap di tengah atas saat mengecil
    paper.style.transformOrigin = "top center"; 
    paper.style.transform = `scale(${scale})`;
    
    // 5. PENYESUAIAN TINGGI (PENTING)
    // Karena 'scale' tidak mengubah dimensi fisik elemen di DOM, 
    // kita harus menyesuaikan margin-bottom agar scrollbar bekerja dengan benar.
    const paperHeight = 1123; // Tinggi standar A4 (297mm)
    const scaledHeight = paperHeight * scale;
    
    // Hitung sisa ruang yang hilang akibat scaling untuk ditarik kembali
    const offset = paperHeight - scaledHeight;
    paper.style.marginBottom = `-${offset}px`; 

    // Opsional: Beri padding bawah pada container agar kertas tidak terpotong di paling bawah
    container.style.paddingBottom = "40px";
}

// Tambahkan Event Listener agar saat layar diputar (HP) atau di-resize (Laptop), skala update otomatis
window.addEventListener('resize', autoScalePaper);
// --- FUNGSI SIMPAN PENGATURAN CETAK ---
function savePrintSettings() {
    const settings = {
        h1: Utils.getEl('card-h1').value,
        h2: Utils.getEl('card-h2').value,
        h3: Utils.getEl('card-h3').value,
        title: Utils.getEl('card-title').value,
        subtitle: Utils.getEl('card-subtitle').value,
        teacher: Utils.getEl('card-teacher').value,
        nip: Utils.getEl('card-nip').value
    };

    localStorage.setItem('cbt_print_settings', JSON.stringify(settings));
    alert("✅ Pengaturan Kop Surat berhasil disimpan!");
}

// --- FUNGSI MUAT PENGATURAN CETAK ---
function loadPrintSettings() {
    const saved = localStorage.getItem('cbt_print_settings');
    if (saved) {
        const data = JSON.parse(saved);
        Utils.getEl('card-h1').value = data.h1 || '';
        Utils.getEl('card-h2').value = data.h2 || '';
        Utils.getEl('card-h3').value = data.h3 || '';
        Utils.getEl('card-title').value = data.title || '';
        Utils.getEl('card-subtitle').value = data.subtitle || '';
        Utils.getEl('card-teacher').value = data.teacher || '';
        Utils.getEl('card-nip').value = data.nip || '';
        
        // Render ulang preview agar perubahan langsung terlihat
        renderCardPreview();
    }
}
/**
 * FUNGSI DOWNLOAD TEMPLATE EXCEL
 */
function downloadStudentTemplate() {
    try {
        // Struktur kolom sesuai kebutuhan database
        const headers = [["nama_lengkap", "nisn", "kelas", "jurusan", "username", "password", "ruangan", "sesi"]];
        const sampleData = [
            ["Budi Sudarsono", "12345678", "XI", "Farmasi", "budi123", "pass123", "R 03", "1"]
        ];
        
        const data = [...headers, ...sampleData];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Daftar Siswa");

        // Download file
        XLSX.writeFile(wb, "Template_Peserta_CBT.xlsx");
    } catch (error) {
        console.error("Gagal mendownload template:", error);
        alert("Terjadi kesalahan saat membuat template Excel.");
    }
}
// ============================================================================
// Start App
// ============================================================================
document.addEventListener("DOMContentLoaded", () => App.init());




