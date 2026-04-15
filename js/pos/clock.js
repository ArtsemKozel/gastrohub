// ── POS ZEITERFASSUNG ─────────────────────────────────────
// PIN-Login via employees_planit.password_hash
// Clock-in/out via shifts.actual_start_time / actual_end_time
// Kiosk-Modus: benötigt aktive Admin-Session für user_id-Scoping

// ── STATE ─────────────────────────────────────────────────

const posState = {
    view:      'loading',   // loading | pin | employee
    userId:    null,        // admin user_id (aus Session)
    employees: [],          // employees_planit (is_active)
    shifts:    [],          // heutige shifts
    employee:  null,        // eingeloggter Mitarbeiter
    shift:     null,        // heutiger Shift des Mitarbeiters
    pin:       '',
    error:     ''
};

// ── INIT ──────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        document.getElementById('pos-root').innerHTML = `
            <div class="pos-card" style="text-align:center; padding:2rem;">
                <div style="font-size:1.1rem; font-weight:700; color:var(--color-primary); margin-bottom:0.75rem;">GastroHub · Zeiterfassung</div>
                <p style="color:var(--color-text-light); font-size:0.9rem; margin-bottom:1.25rem;">Bitte zuerst als Admin anmelden.</p>
                <a href="index.html" style="background:var(--color-primary);color:white;padding:0.75rem 1.5rem;border-radius:12px;text-decoration:none;font-weight:600;">Zum Login</a>
            </div>`;
        return;
    }

    posState.userId = session.user.id;
    await loadPosData();
    posState.view = 'pin';
    startPosClock();
    renderPOS();
});

async function loadPosData() {
    const today = new Date().toISOString().split('T')[0];
    const uid   = posState.userId;

    const [{ data: emps }, { data: shifts }] = await Promise.all([
        db.from('employees_planit')
            .select('id, name, department, password_hash, user_id')
            .eq('user_id', uid)
            .eq('is_active', true)
            .order('name'),
        db.from('shifts')
            .select('id, employee_id, shift_date, start_time, end_time, actual_start_time, actual_end_time, break_minutes, actual_break_minutes')
            .eq('user_id', uid)
            .eq('shift_date', today)
            .eq('is_open', false)
    ]);

    posState.employees = emps  || [];
    posState.shifts    = shifts || [];
}

// ── UHRZEIT-TICKER ────────────────────────────────────────

function startPosClock() {
    setInterval(() => {
        const el = document.getElementById('pos-time');
        if (el) el.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);
}

// ── RENDER ────────────────────────────────────────────────

function renderPOS() {
    const root = document.getElementById('pos-root');
    if (!root) return;
    if (posState.view === 'loading')  { root.innerHTML = '<div class="pos-loading">Lädt…</div>'; return; }
    if (posState.view === 'pin')      { root.innerHTML = renderPinScreen();      return; }
    if (posState.view === 'employee') { root.innerHTML = renderEmployeeScreen(); return; }
}

function renderPinScreen() {
    const now  = new Date();
    const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const dots = Array.from({ length: 4 }, (_, i) =>
        `<div class="pos-pin-dot ${i < posState.pin.length ? 'filled' : ''}"></div>`
    ).join('');

    return `
    <div class="pos-card">
        <div class="pos-header">
            <div class="pos-logo">GastroHub</div>
            <div style="font-size:0.8rem; color:var(--color-text-light);">Zeiterfassung</div>
        </div>
        <div class="pos-clock-display">
            <div class="time" id="pos-time">${time}</div>
            <div class="date">${date}</div>
        </div>
        <div style="text-align:center; font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.75rem;">PIN eingeben</div>
        <div class="pos-pin-dots">${dots}</div>
        <div class="pos-numpad">
            ${[1,2,3,4,5,6,7,8,9].map(n =>
                `<button class="pos-num-btn" onclick="posNumInput('${n}')">${n}</button>`
            ).join('')}
            <button class="pos-num-btn delete" onclick="posNumDelete()">⌫</button>
            <button class="pos-num-btn" onclick="posNumInput('0')">0</button>
            <button class="pos-num-btn enter" onclick="posLogin()">→</button>
        </div>
        <div class="pos-error" id="pos-error">${posState.error}</div>
    </div>`;
}

function renderEmployeeScreen() {
    const emp   = posState.employee;
    const shift = posState.shift;
    if (!emp) return '';

    const isClockedIn  = !!(shift?.actual_start_time && !shift?.actual_end_time);
    const isClockedOut = !!(shift?.actual_start_time && shift?.actual_end_time);

    let statusLabel, statusClass;
    if      (isClockedIn)  { statusLabel = 'Eingestempelt';           statusClass = 'clocked-in';  }
    else if (isClockedOut) { statusLabel = 'Ausgestempelt';           statusClass = 'clocked-out'; }
    else                   { statusLabel = 'Noch nicht eingestempelt'; statusClass = 'not-started'; }

    let shiftInfo = '';
    if (shift) {
        const startDisp = (shift.actual_start_time || shift.start_time).slice(0, 5);
        const endDisp   = (shift.actual_end_time   || shift.end_time).slice(0, 5);
        shiftInfo = `Schicht: ${startDisp} – ${endDisp} Uhr`;
        if (isClockedIn) {
            const startDt = new Date(new Date().toISOString().split('T')[0] + 'T' + shift.actual_start_time);
            const diffM   = Math.floor((Date.now() - startDt) / 60000);
            const h = Math.floor(diffM / 60), m = diffM % 60;
            shiftInfo += ` · ${h > 0 ? h + 'h ' : ''}${m}min`;
        }
    } else {
        shiftInfo = 'Keine Schicht heute geplant — freies Einstempeln';
    }

    const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return `
    <div class="pos-card">
        <div class="pos-employee-header">
            <button class="pos-back-btn" onclick="posLogout()">‹</button>
            <div>
                <div class="pos-emp-name">${emp.name}</div>
                ${emp.department ? `<div style="font-size:0.78rem; color:var(--color-text-light);">${emp.department}</div>` : ''}
            </div>
        </div>
        <div class="pos-clock-display" style="margin-bottom:1rem;">
            <div class="time" id="pos-time">${time}</div>
        </div>
        <div class="pos-status-badge ${statusClass}">${statusLabel}</div>
        <div class="pos-action-grid">
            <button class="pos-action-btn clock-in"
                ${isClockedIn || isClockedOut ? 'disabled' : ''}
                onclick="posClockIn()">
                Einstempeln
            </button>
            <button class="pos-action-btn clock-out"
                ${!isClockedIn ? 'disabled' : ''}
                onclick="posClockOut()">
                Ausstempeln
            </button>
        </div>
        <div class="pos-shift-info">${shiftInfo}</div>
    </div>`;
}

// ── NUMPAD ────────────────────────────────────────────────

function posNumInput(digit) {
    if (posState.pin.length >= 4) return;
    posState.pin  += digit;
    posState.error = '';
    renderPOS();
    if (posState.pin.length === 4) setTimeout(posLogin, 150);
}

function posNumDelete() {
    posState.pin   = posState.pin.slice(0, -1);
    posState.error = '';
    renderPOS();
}

// ── LOGIN / LOGOUT ────────────────────────────────────────

async function posLogin() {
    const pin = posState.pin;
    if (!pin) return;

    const emp = posState.employees.find(e => e.password_hash === pin);
    if (!emp) {
        posState.error = 'Falscher PIN. Bitte nochmals versuchen.';
        posState.pin   = '';
        renderPOS();
        return;
    }

    posState.employee = emp;
    posState.shift    = posState.shifts.find(s => s.employee_id === emp.id) || null;
    posState.pin      = '';
    posState.error    = '';
    posState.view     = 'employee';
    renderPOS();
}

function posLogout() {
    posState.employee = null;
    posState.shift    = null;
    posState.pin      = '';
    posState.error    = '';
    posState.view     = 'pin';
    renderPOS();
}

// ── CLOCK IN / OUT ────────────────────────────────────────

async function posClockIn() {
    const emp     = posState.employee;
    const today   = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toTimeString().slice(0, 8); // HH:MM:SS

    let shift = posState.shift;

    if (shift) {
        const { data, error } = await db.from('shifts')
            .update({ actual_start_time: nowTime })
            .eq('id', shift.id)
            .select('id, actual_start_time')
            .maybeSingle();
        if (error || !data) { posShowToast('Fehler beim Einstempeln'); return; }
        posState.shift = { ...shift, actual_start_time: nowTime, actual_end_time: null };
    } else {
        // Keine geplante Schicht — spontan anlegen
        const { data, error } = await db.from('shifts').insert({
            user_id:           posState.userId,
            employee_id:       emp.id,
            shift_date:        today,
            start_time:        nowTime,
            end_time:          nowTime,
            break_minutes:     0,
            actual_start_time: nowTime,
            is_open:           false,
            department:        emp.department || null
        }).select().maybeSingle();
        if (error || !data) { posShowToast('Fehler beim Einstempeln'); return; }
        posState.shift = data;
        posState.shifts.push(data);
    }

    posShowToast('✓ Eingestempelt um ' + nowTime.slice(0, 5) + ' Uhr');
    renderPOS();
}

async function posClockOut() {
    const shift = posState.shift;
    if (!shift?.actual_start_time) return;

    const nowTime = new Date().toTimeString().slice(0, 8);

    const { data, error } = await db.from('shifts')
        .update({ actual_end_time: nowTime })
        .eq('id', shift.id)
        .select('id, actual_end_time')
        .maybeSingle();
    if (error || !data) { posShowToast('Fehler beim Ausstempeln'); return; }

    posState.shift = { ...shift, actual_end_time: nowTime };
    const idx = posState.shifts.findIndex(s => s.id === shift.id);
    if (idx > -1) posState.shifts[idx] = posState.shift;

    posShowToast('✓ Ausgestempelt um ' + nowTime.slice(0, 5) + ' Uhr');
    renderPOS();
}

// ── TOAST ─────────────────────────────────────────────────

function posShowToast(msg) {
    const el = document.getElementById('pos-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}
