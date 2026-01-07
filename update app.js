// ============================================================================
// 1. KONFIGURASI & STATE (PUSAT PENYIMPANAN)
// ============================================================================

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

    setLoading(btn, isLoading, text = 'Loading...') {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = `<span class="animate-spin">⏳</span> ${text}`;
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

// ============================================================================
// 3. SERVICE LAYER (DATABASE)
// ============================================================================
const DB = {
   async getStudents() {
        const { data, error } = await db
            .from('students')
            .select('*') 
            .order('created_at', { ascending: false }); 
        
        if (error) { 
            console.error("DB Error:", error); 
            return []; 
        }
        
        return data.map(s => ({
            username: s.username || '-',
            nama: s.nama_lengkap || s.nama || '(Tanpa Nama)', 
            id_peserta: s.id_peserta || '-',
            pass: s.password || s.pass || '123456', 
            kelas: s.kelas || '-', 
            ruangan: s.ruangan || '-', 
            sesi: s.sesi || '1',
            sekolah: s.sekolah || '-', 
            agama: s.agama || '-', 
            catatan: s.catatan || '-'
        }));
    },

    async getClasses() {
        const { data, error } = await db.from('classes').select('id, kode_kelas, nama_kelas, deskripsi');
        if (error) return [];
        return data.map(c => ({ id: c.id, code: c.kode_kelas, name: c.nama_kelas, desc: c.deskripsi || '-', count: 0, date: 'Terdaftar' }));
    },

    async getRooms() {
        const { data, error } = await db.from('rooms').select('id, kode_ruangan, nama_ruangan, deskripsi');
        if (error) return [];
        return data.map(r => ({ id: r.id, code: r.kode_ruangan, name: r.nama_ruangan, desc: r.deskripsi || '-', count: 0, date: 'Terdaftar' }));
    },

    async getExams() {
        const { data, error } = await db
            .from('exams')
            .select('id, nama_ujian, status, alokasi, peserta, pengelola, acak_paket, acak_soal, acak_opsi, tampil_nilai')
            .order('created_at', { ascending: false });

        if (error) return [];
        return data.map(e => ({
            id: e.id, name: e.nama_ujian, status: e.status, alokasi: e.alokasi,
            peserta: e.peserta || 0, pengelola: e.pengelola || 'Admin',
            acakPaket: e.acak_paket || 'first', acakSoal: e.acak_soal || 'no',
            acakOpsi: e.acak_opsi || 'no', tampilNilai: e.tampil_nilai || 'hide'
        }));
    },

    // Helpers Hitung Data
    async getCount(table) { const { count } = await db.from(table).select('*', { count: 'exact', head: true }); return count || 0; },
    async getCountByFilter(table, col, val) { const { count } = await db.from(table).select('*', { count: 'exact', head: true }).eq(col, val); return count || 0; },
    async getStudentOnline() { return this.getCountByFilter('students', 'status_login', true); },
    async getUserOnline(role) { 
        const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('role', role).eq('status_login', true); 
        return count || 0; 
    },
    async getUserTotalByRole(role) { return this.getCountByFilter('users', 'role', role); },
    async getActiveExams() { return this.getCountByFilter('exams', 'status', 'Aktif'); },

    // CRUD
    async addStudent(data) { return await db.from('students').insert([data]); },
    async addClass(data) { return await db.from('classes').insert([data]); },
    async updateClass(id, data) { return await db.from('classes').update(data).eq('id', id); },
    async deleteClass(id) { return await db.from('classes').delete().eq('id', id); },
    async addRoom(data) { return await db.from('rooms').insert([data]); },
    async updateRoom(id, data) { return await db.from('rooms').update(data).eq('id', id); },
    async deleteRoom(id) { return await db.from('rooms').delete().eq('id', id); },
    async addExam(data) { return await db.from('exams').insert([data]); },
    async updateExam(id, data) { return await db.from('exams').update(data).eq('id', id); },
    async deleteExam(id) { return await db.from('exams').delete().eq('id', id); },
    async addQuestion(data) { return await db.from('questions').insert([data]); },
    
    // --- TRACKING & LOGS ---
    async incrementHit() {
        await db.rpc('increment_hit');
    },

    async logDevice() {
        let deviceId = localStorage.getItem('cbt_device_id');
        if (!deviceId) {
            deviceId = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            localStorage.setItem('cbt_device_id', deviceId);
        }

        const ua = navigator.userAgent;
        let deviceName = "Unknown Device";
        if (ua.includes("Win")) deviceName = "Windows PC";
        else if (ua.includes("Mac")) deviceName = "Macbook / iMac";
        else if (ua.includes("Linux")) deviceName = "Linux PC";
        else if (ua.includes("Android")) deviceName = "Android";
        else if (ua.includes("iPhone")) deviceName = "iPhone";
        
        if (ua.includes("Chrome")) deviceName += " (Chrome)";
        else if (ua.includes("Firefox")) deviceName += " (Firefox)";
        else if (ua.includes("Safari")) deviceName += " (Safari)";

        // OPTIMASI: Kirim Data Dulu (Tanpa await fetch IP) agar cepat
        const baseData = {
            device_id: deviceId,
            device_name: deviceName,
            last_seen: new Date(),
            ip_address: localStorage.getItem('last_known_ip') || '-' // Pakai IP lama dulu
        };

        // Simpan ke DB (Fire and Forget)
        db.from('device_logs').upsert(baseData, { onConflict: 'device_id' }).then();

        // Cari IP di background (Non-Blocking)
        setTimeout(async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                    const json = await res.json();
                    localStorage.setItem('last_known_ip', json.ip);
                    // Update IP belakangan
                    await db.from('device_logs').update({ ip_address: json.ip }).eq('device_id', deviceId);
                }
            } catch (e) {}
        }, 100);
    },

    async getDeviceLogs() {
        const { data, error } = await db
            .from('device_logs')
            .select('*')
            .order('last_seen', { ascending: false })
            .limit(50);
        return data || [];
    },
    
    async getSiteStats() {
        // [PERBAIKAN] Gunakan maybeSingle agar tidak error jika tabel kosong
        const { data } = await db.from('site_stats').select('total_hits').limit(1).maybeSingle();
        return data ? data.total_hits : 0;
    }
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
// 5. VIEW CONTROLLER (LOGIKA TAMPILAN)
// ============================================================================
const View = {
    nav(panelId) {
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden-view'));
        const target = Utils.getEl('panel-' + panelId) || Utils.getEl(panelId);
        if (target) target.classList.remove('hidden-view');

        // [PENTING] Handler untuk Riwayat Koneksi
        if (panelId === 'connections') this.renderConnections();

        document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active-nav'));
        const activeBtn = Utils.getEl('nav-' + panelId);
        if (activeBtn) activeBtn.classList.add('active-nav');

        if (window.innerWidth < 768) {
            Utils.getEl('sidebar')?.classList.add('-translate-x-full');
            Utils.getEl('sidebar-overlay')?.classList.add('hidden');
        }

        // Auto Refresh Data
        if (panelId === 'dashboard') this.updateDashboard();
        if (panelId === 'students') this.renderStudents(false);
        if (panelId === 'classes') this.renderClasses();
        if (panelId === 'rooms') this.renderRooms();
        if (panelId === 'questions') { this.switchBankTab('soal'); this.renderQuestions(); }
    },

    toggleSidebar() {
        const sidebar = Utils.getEl('sidebar');
        const overlay = Utils.getEl('sidebar-overlay');
        if (sidebar && overlay) {
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        }
    },

    async updateDashboard() {
        const btn = Utils.getEl('btn-refresh-dash');
        const icon = Utils.getEl('icon-refresh');
        const text = Utils.getEl('text-refresh');

        if (icon) icon.classList.add('animate-spin'); 
        if (text) text.innerText = "Updating...";     
        if (btn) btn.classList.add('bg-slate-100', 'text-blue-600'); 

        const ids = [
            'stat-students', 'stat-online', 'stat-classes', 'stat-rooms', 
            'stat-exams', 'stat-exams-active', 'stat-proctor-total', 
            'stat-proctor-online', 'stat-admin-total', 'stat-admin-online', 
            'stat-http', 'stat-active-devices'
        ];
        
        ids.forEach(id => { if(Utils.getEl(id)) Utils.getEl(id).innerText = "..."; });

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

        } catch (e) { 
            console.error("Gagal update dashboard:", e); 
        } finally {
            if (icon) icon.classList.remove('animate-spin');
            if (text) text.innerText = "Refresh";
            if (btn) btn.classList.remove('bg-slate-100', 'text-blue-600');
        }
    },

    async renderStudents(useCache = false) {
        const tbody = Utils.getEl('table-students-body');
        if (!useCache || STATE.cache.students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="13" class="text-center py-8"><span class="animate-spin">⏳</span> Memuat...</td></tr>`;
            STATE.cache.students = await DB.getStudents();
        }

        const filterClass = Utils.getEl('filter-class')?.value || 'Semua';
        const filterRoom = Utils.getEl('filter-room')?.value || 'Semua';

        const html = STATE.cache.students.map((s, i) => {
            if (filterClass !== 'Semua' && s.kelas !== filterClass) return '';
            if (filterRoom !== 'Semua' && s.ruangan !== filterRoom) return '';

            return `
            <tr class="border-b hover:bg-slate-50 transition group-row">
                <td class="px-2 py-3 text-center"><input type="checkbox" class="student-checkbox rounded border-slate-300 w-3.5 h-3.5" value="${Utils.escapeHTML(s.id_peserta)}"></td>
                <td class="px-2 py-3 text-center relative">
                    <button onclick="toggleActionDropdown(${i}, event)" class="bg-blue-50 p-1 rounded hover:bg-blue-100 text-blue-600"><i data-feather="more-horizontal" class="w-3.5 h-3.5"></i></button>
                    <div id="dropdown-${i}" class="action-dropdown text-left z-50">
                        <button onclick="View.nav('add-student')" class="block w-full text-left px-4 py-2 text-xs hover:bg-slate-50">Edit Data</button>
                        <button onclick="View.modals.confirmDelete('${Utils.escapeHTML(s.id_peserta)}', 'student')" class="block w-full text-left px-4 py-2 text-xs hover:bg-red-50 text-red-600">Hapus</button>
                    </div>
                </td>
                <td class="px-2 py-3 text-center text-[10px]">${i + 1}</td>
                <td class="px-2 py-3 font-mono text-xs">${Utils.escapeHTML(s.username)}</td>
                <td class="px-2 py-3 font-mono text-xs">***</td>
                <td class="px-2 py-3 font-bold text-xs uppercase">${Utils.escapeHTML(s.nama)}</td>
                <td class="px-2 py-3 text-xs">${Utils.escapeHTML(s.id_peserta)}</td>
                <td class="px-2 py-3"><span class="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-bold">${Utils.escapeHTML(s.kelas)}</span></td>
                <td class="px-2 py-3 text-xs">${Utils.escapeHTML(s.ruangan)}</td>
                <td class="px-2 py-3 text-center"><span class="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-bold">${Utils.escapeHTML(s.sesi)}</span></td>
                <td class="px-2 py-3 text-xs">${Utils.escapeHTML(s.sekolah)}</td>
                <td class="px-2 py-3 text-xs">${Utils.escapeHTML(s.agama)}</td>
                <td class="px-2 py-3 text-xs italic">${Utils.escapeHTML(s.catatan)}</td>
            </tr>`;
        }).join('');
        tbody.innerHTML = html || `<tr><td colspan="13" class="text-center py-4 text-xs">Data kosong.</td></tr>`;
        if (typeof feather !== 'undefined') feather.replace();
    },

    async renderClasses() {
        const tbody = Utils.getEl('table-classes-body');
        STATE.cache.classes = await DB.getClasses();
        const html = STATE.cache.classes.map((item, i) => `
            <tr class="border-b hover:bg-slate-50 transition">
                <td class="px-4 py-3 text-center"><input type="checkbox" class="w-3.5 h-3.5"></td>
                <td class="px-4 py-3 text-center text-xs">${i + 1}</td>
                <td class="px-4 py-3 font-mono font-bold text-xs">${Utils.escapeHTML(item.code)}</td>
                <td class="px-4 py-3 font-bold text-xs uppercase">${Utils.escapeHTML(item.name)}</td>
                <td class="px-4 py-3 text-xs italic">${Utils.escapeHTML(item.desc)}</td>
                <td class="px-4 py-3 text-xs font-bold text-blue-600">(${item.count || 0}) Peserta</td>
                <td class="px-4 py-3 text-[10px]">${item.date}</td>
                <td class="px-4 py-3 text-center relative">
                    <button onclick="View.modals.openEditClass('${item.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-1 rounded">Edit</button>
                    <button onclick="View.modals.confirmDelete('${item.id}', 'class')" class="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded ml-1">Hapus</button>
                </td>
            </tr>`).join('');
        tbody.innerHTML = html;
        if (typeof feather !== 'undefined') feather.replace();
    },

    async renderRooms() {
        const tbody = Utils.getEl('table-rooms-body');
        STATE.cache.rooms = await DB.getRooms();
        const html = STATE.cache.rooms.map((item, i) => `
            <tr class="border-b hover:bg-slate-50 transition">
                <td class="px-4 py-3 text-center"><input type="checkbox" class="w-3.5 h-3.5"></td>
                <td class="px-4 py-3 text-center text-xs">${i + 1}</td>
                <td class="px-4 py-3 font-mono font-bold text-xs">${Utils.escapeHTML(item.code)}</td>
                <td class="px-4 py-3 font-bold text-xs uppercase">${Utils.escapeHTML(item.name)}</td>
                <td class="px-4 py-3 text-xs italic">${Utils.escapeHTML(item.desc)}</td>
                <td class="px-4 py-3 text-xs font-bold text-blue-600">(${item.count || 0}) Peserta</td>
                <td class="px-4 py-3 text-[10px]">${item.date}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="View.modals.openEditRoom('${item.id}')" class="bg-blue-600 text-white text-[10px] px-2 py-1 rounded">Edit</button>
                    <button onclick="View.modals.confirmDelete('${item.id}', 'room')" class="bg-red-50 text-red-600 text-[10px] px-2 py-1 rounded ml-1">Hapus</button>
                </td>
            </tr>`).join('');
        tbody.innerHTML = html;
        if (typeof feather !== 'undefined') feather.replace();
    },

    async renderExamList() {
        const container = Utils.getEl('exam-list-body');
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
        container.innerHTML = html;
        if (typeof feather !== 'undefined') feather.replace();
    },

    renderQuestions() {
        const tbody = Utils.getEl('question-list-body');
        tbody.innerHTML = '';
        if(STATE.cache.questions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-xs text-slate-400">Belum ada soal.</td></tr>';
            return;
        }
        STATE.cache.questions.forEach((q, i) => {
            tbody.innerHTML += `
            <tr class="border-b">
                <td class="px-4 py-3 text-xs">${i+1}</td>
                <td class="px-4 py-3 text-xs truncate max-w-xs">${Utils.escapeHTML(q.text)}</td>
                <td class="px-4 py-3"><span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] uppercase">${q.type}</span></td>
                <td class="px-4 py-3">${q.media ? '<i data-feather="paperclip" class="w-3 h-3"></i>' : '-'}</td>
                <td class="px-4 py-3 text-center"><button class="text-red-500"><i data-feather="trash-2" class="w-4 h-4"></i></button></td>
            </tr>`;
        });
        feather.replace();
    },

    switchBankTab(tab) {
        ['view-bank-soal', 'view-bank-ujian', 'view-exam-detail', 'view-exam-participants'].forEach(id => Utils.getEl(id).classList.add('hidden-view'));
        ['tab-soal', 'tab-ujian'].forEach(id => Utils.getEl(id).classList.remove('active'));
        
        Utils.getEl('view-bank-'+tab).classList.remove('hidden-view');
        Utils.getEl('tab-'+tab).classList.add('active');
        if(tab === 'ujian') this.renderExamList();
    },

    switchSettingTab(e, tabId) {
        document.querySelectorAll('.setting-content').forEach(c => c.classList.add('hidden-view'));
        Utils.getEl('set-' + tabId).classList.remove('hidden-view');
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
            const modal = Utils.getEl('modal-success');
            Utils.getEl('msg-success').innerText = msg;
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.querySelector('.bg-slate-900\\/40').classList.remove('opacity-0');
                modal.querySelector('.relative').classList.remove('scale-95', 'opacity-0');
                modal.querySelector('.relative').classList.add('scale-100', 'opacity-100');
            }, 10);
        },

        closeSuccess() {
            const modal = Utils.getEl('modal-success');
            if(!modal) return;
            modal.querySelector('.bg-slate-900\\/40').classList.add('opacity-0');
            modal.querySelector('.relative').classList.remove('scale-100', 'opacity-100');
            modal.querySelector('.relative').classList.add('scale-95', 'opacity-0');
            setTimeout(() => modal.classList.add('hidden'), 300);
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
    },

    async renderConnections() {
        const tbody = Utils.getEl('table-connections-body');
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8"><span class="animate-spin">⏳</span> Memuat data perangkat...</td></tr>`;
        
        const logs = await DB.getDeviceLogs();
        
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Belum ada riwayat.</td></tr>`;
            return;
        }

        const html = logs.map((log, i) => `
            <tr class="border-b hover:bg-slate-50 transition">
                <td class="px-4 py-3 text-center text-[10px]">${i + 1}</td>
                <td class="px-4 py-3 font-mono text-xs font-bold text-blue-600">${Utils.escapeHTML(log.device_id)}</td>
                <td class="px-4 py-3 text-xs">
                    <div class="flex items-center gap-2">
                        <i data-feather="${log.device_name.includes('Mobile') || log.device_name.includes('Android') || log.device_name.includes('iPhone') ? 'smartphone' : 'monitor'}" class="w-3 h-3 text-slate-400"></i>
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
    }
};

// ============================================================================
// 6. BUSINESS LOGIC CONTROLLERS
// ============================================================================
const StudentController = {
    async save() {
        const btn = document.querySelector('button[onclick="saveStudentData()"]');
        const data = {
            nama_lengkap: Utils.getEl('input-nama').value,
            id_peserta: Utils.getEl('input-id-peserta').value,
            username: Utils.getEl('input-username').value,
            password: Utils.getEl('input-password').value,
            kelas: Utils.getEl('input-kelas').value,
            ruangan: Utils.getEl('input-ruangan').value,
            sesi: Utils.getEl('input-sesi').value
        };
        if (!data.nama_lengkap || !data.username) return alert("Lengkapi data!");
        
        Utils.setLoading(btn, true);
        const { error } = await DB.addStudent(data);
        Utils.setLoading(btn, false);
        
        if (!error) {
            View.modals.showSuccess("Siswa berhasil ditambahkan!");
            View.nav('students');
        } else alert(error.message);
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
    startTimer(target) {
        if(STATE.intervals.tokenTimer) clearInterval(STATE.intervals.tokenTimer);
        const circle = document.querySelector('.progress-ring__circle');
        const totalDuration = 15 * 60 * 1000; // Asumsi 15 menit full

        STATE.intervals.tokenTimer = setInterval(() => {
            const now = new Date();
            const diff = target - now;
            
            if(diff <= 0) {
                clearInterval(STATE.intervals.tokenTimer);
                Utils.getEl('dash-timer').innerText = "00:00";
                return;
            }

            // Update Text
            const m = Math.floor((diff/60000)%60).toString().padStart(2,'0');
            const s = Math.floor((diff/1000)%60).toString().padStart(2,'0');
            const text = `${m}:${s}`;
            if(Utils.getEl('dash-timer')) Utils.getEl('dash-timer').innerText = text;

            // Update SVG Ring Animation
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
window.renderCardPreview = () => {
    const container = Utils.getEl('card-preview-area');
    container.innerHTML = STATE.cache.students.map(s => `<div class="card p-4 border mb-2 font-bold">${Utils.escapeHTML(s.nama)} - ${Utils.escapeHTML(s.id_peserta)}</div>`).join('');
};
window.updateCardLogo = () => {};
window.updateCardSignature = () => {};

// Start App
document.addEventListener("DOMContentLoaded", () => App.init());

