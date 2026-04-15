// ── POS ZEITERFASSUNG ─────────────────────────────────────
// PIN-Login via employees_planit.password_hash
// Clock-in/out via shifts.clock_in / clock_out
// Kiosk-Modus: user_id wird aus URL-Parameter ?uid= gelesen

// ── STATE ─────────────────────────────────────────────────

const posState = {
    view:      'loading',   // loading | pin | employee
    userId:    null,        // restaurant user_id (aus URL-Parameter)
    employees: [],          // employees_planit (is_active)
    shifts:    [],          // heutige shifts
    employee:  null,        // eingeloggter Mitarbeiter
    shift:     null,        // heutiger Shift des Mitarbeiters
    pin:       '',
    error:     ''
};

// ── INIT ──────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    const uid = new URLSearchParams(window.location.search).get('uid');
    if (!uid) {
        document.getElementById('pos-root').innerHTML = `
            <div class="pos-card" style="text-align:center; padding:2rem;">
                <div style="font-size:1.1rem; font-weight:700; color:var(--color-primary); margin-bottom:0.75rem;">GastroHub · Zeiterfassung</div>
                <p style="color:var(--color-text-light); font-size:0.9rem; margin-bottom:1.25rem;">Kein Restaurant konfiguriert.<br>Bitte URL-Parameter <code>?uid=…</code> angeben.</p>
            </div>`;
        return;
    }

    posState.userId = uid;
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
            .select('id, employee_id, shift_date, start_time, end_time, clock_in, clock_out, break_minutes')
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
        <input id="pos-pin-input" type="number" inputmode="numeric" pattern="[0-9]*"
            placeholder="••••"
            maxlength="4"
            style="width:100%; text-align:center; font-size:2rem; letter-spacing:0.3em; padding:0.75rem; border:2px solid var(--color-primary); border-radius:12px; outline:none; margin-bottom:0.75rem; -moz-appearance:textfield;"
            oninput="posPinInput(this.value)"
            onkeydown="if(event.key==='Enter') posLogin()">
        <button class="pos-action-btn clock-in" style="width:100%; margin-bottom:0.5rem;" onclick="posLogin()">Anmelden</button>
        <div class="pos-error" id="pos-error">${posState.error}</div>
    </div>`;
}

function renderEmployeeScreen() {
    const emp   = posState.employee;
    const shift = posState.shift;
    if (!emp) return '';

    const isClockedIn  = !!(shift?.clock_in && !shift?.clock_out);
    const isClockedOut = !!(shift?.clock_in && shift?.clock_out);

    let statusLabel, statusClass;
    if      (isClockedIn)  { statusLabel = 'Eingestempelt';           statusClass = 'clocked-in';  }
    else if (isClockedOut) { statusLabel = 'Ausgestempelt';           statusClass = 'clocked-out'; }
    else                   { statusLabel = 'Noch nicht eingestempelt'; statusClass = 'not-started'; }

    let shiftInfo = '';
    if (shift) {
        const startDisp = (shift.clock_in  || shift.start_time).slice(0, 5);
        const endDisp   = (shift.clock_out || shift.end_time).slice(0, 5);
        shiftInfo = `Schicht: ${startDisp} – ${endDisp} Uhr`;
        if (isClockedIn) {
            const startDt = new Date(new Date().toISOString().split('T')[0] + 'T' + shift.clock_in);
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

// ── PIN INPUT ─────────────────────────────────────────────

function posPinInput(value) {
    posState.pin   = value.slice(0, 4);
    posState.error = '';
}

// ── LOGIN / LOGOUT ────────────────────────────────────────

async function posLogin() {
    const input = document.getElementById('pos-pin-input');
    const pin   = input ? input.value.trim() : posState.pin.trim();
    if (!pin) return;

    console.log('Eingegebener PIN:', JSON.stringify(pin), 'DB-Wert:', JSON.stringify(posState.employees[0]?.password_hash));
    const emp = posState.employees.find(e => String(e.password_hash).trim() === String(pin).trim());
    if (!emp) {
        posState.error = 'Falscher PIN. Bitte nochmals versuchen.';
        posState.pin   = '';
        const errEl = document.getElementById('pos-error');
        if (errEl) errEl.textContent = posState.error;
        const inputEl = document.getElementById('pos-pin-input');
        if (inputEl) { inputEl.value = ''; inputEl.focus(); }
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
            .update({ clock_in: nowTime })
            .eq('id', shift.id)
            .select('id, clock_in')
            .maybeSingle();
        if (error || !data) { posShowToast('Fehler beim Einstempeln'); return; }
        posState.shift = { ...shift, clock_in: nowTime, clock_out: null };
    } else {
        // Keine geplante Schicht — spontan anlegen
        const { data, error } = await db.from('shifts').insert({
            user_id:      posState.userId,
            employee_id:  emp.id,
            shift_date:   today,
            start_time:   nowTime,
            end_time:     nowTime,
            break_minutes: 0,
            clock_in:     nowTime,
            is_open:      false,
            department:   emp.department || null
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
    if (!shift?.clock_in) return;

    const nowTime = new Date().toTimeString().slice(0, 8);

    const { data, error } = await db.from('shifts')
        .update({ clock_out: nowTime })
        .eq('id', shift.id)
        .select('id, clock_out')
        .maybeSingle();
    if (error || !data) { posShowToast('Fehler beim Ausstempeln'); return; }

    posState.shift = { ...shift, clock_out: nowTime };
    const idx = posState.shifts.findIndex(s => s.id === shift.id);
    if (idx > -1) posState.shifts[idx] = posState.shift;

    posShowToast('✓ Ausgestempelt um ' + nowTime.slice(0, 5) + ' Uhr');
    renderPOS();
    setTimeout(posLogout, 2200);
}

// ── TOAST ─────────────────────────────────────────────────

function posShowToast(msg) {
    const el = document.getElementById('pos-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}
