// ── POS ZEITERFASSUNG ─────────────────────────────────────
// PIN-Login via employees_planit.password_hash
// Clock-in/out via gh_time_entries (clock_in / clock_out)
// Kiosk-Modus: user_id wird aus URL-Parameter ?uid= gelesen

// ── STATE ─────────────────────────────────────────────────

const posState = {
    view:      'loading',   // loading | pin | employee
    userId:    null,        // restaurant user_id (aus URL-Parameter)
    employees: [],          // employees_planit (is_active)
    entries:   [],          // heutige gh_time_entries
    employee:  null,        // eingeloggter Mitarbeiter
    entry:     null,        // letzter time_entry des Mitarbeiters
    pin:       '',
    error:     ''
};

// ── INIT ──────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
    const uid = new URLSearchParams(window.location.search).get('uid')
             || '7bb9b579-edd9-449a-840c-21fb33bde772';

    posState.userId = uid;
    await loadPosData();
    posState.view = 'pin';
    startPosClock();
    renderPOS();
});

async function loadPosData() {
    const today = new Date().toISOString().split('T')[0];
    const uid   = posState.userId;

    const [{ data: emps }, { data: entries }] = await Promise.all([
        db.from('employees_planit')
            .select('id, name, department, password_hash, user_id')
            .eq('user_id', uid)
            .eq('is_active', true)
            .order('name'),
        db.from('gh_time_entries')
            .select('id, employee_id, clock_in, clock_out')
            .eq('user_id', uid)
            .gte('clock_in', today + 'T00:00:00')
            .lte('clock_in', today + 'T23:59:59')
            .order('clock_in', { ascending: true })
    ]);

    posState.employees = emps    || [];
    posState.entries   = entries || [];
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
    const entry = posState.entry;
    if (!emp) return '';

    const isClockedIn  = !!(entry?.clock_in && !entry?.clock_out);
    const isClockedOut = !!(entry?.clock_in && entry?.clock_out);

    let statusLabel, statusClass;
    if      (isClockedIn)  { statusLabel = 'Eingestempelt';           statusClass = 'clocked-in';  }
    else if (isClockedOut) { statusLabel = 'Ausgestempelt';           statusClass = 'clocked-out'; }
    else                   { statusLabel = 'Noch nicht eingestempelt'; statusClass = 'not-started'; }

    let entryInfo = '';
    if (entry) {
        const startDisp = new Date(entry.clock_in).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        if (isClockedIn) {
            const diffM = Math.floor((Date.now() - new Date(entry.clock_in)) / 60000);
            const h = Math.floor(diffM / 60), m = diffM % 60;
            entryInfo = `Eingestempelt: ${startDisp} Uhr · ${h > 0 ? h + 'h ' : ''}${m}min`;
        } else {
            const endDisp = new Date(entry.clock_out).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            entryInfo = `Schicht: ${startDisp} – ${endDisp} Uhr`;
        }
    } else {
        entryInfo = 'Heute noch nicht eingestempelt';
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
        <div class="pos-shift-info">${entryInfo}</div>
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

    // Letzten offenen Eintrag des Mitarbeiters ermitteln
    const empEntries = posState.entries.filter(e => e.employee_id === emp.id);
    const lastEntry  = empEntries.length ? empEntries[empEntries.length - 1] : null;

    posState.employee = emp;
    posState.entry    = lastEntry;
    posState.pin      = '';
    posState.error    = '';
    posState.view     = 'employee';
    renderPOS();
}

function posLogout() {
    posState.employee = null;
    posState.entry    = null;
    posState.pin      = '';
    posState.error    = '';
    posState.view     = 'pin';
    renderPOS();
}

// ── CLOCK IN / OUT ────────────────────────────────────────

async function posClockIn() {
    const emp  = posState.employee;
    const now  = new Date().toISOString();

    const { error } = await db.from('gh_time_entries')
        .insert({
            user_id:     posState.userId,
            employee_id: emp.id,
            clock_in:    now
        });

    if (error) { posShowToast('Fehler beim Einstempeln'); return; }

    const { data } = await db.from('gh_time_entries')
        .select('id, employee_id, clock_in, clock_out')
        .eq('user_id', posState.userId)
        .eq('employee_id', emp.id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!data) { posShowToast('Fehler beim Einstempeln'); return; }

    posState.entry = data;
    posState.entries.push(data);

    const timeStr = new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    posShowToast('✓ Eingestempelt um ' + timeStr + ' Uhr');
    renderPOS();
}

async function posClockOut() {
    const entry = posState.entry;
    if (!entry?.clock_in || entry.clock_out) return;

    const now = new Date().toISOString();

    const { data, error } = await db.from('gh_time_entries')
        .update({ clock_out: now })
        .eq('id', entry.id)
        .select()
        .maybeSingle();

    if (error || !data) { posShowToast('Fehler beim Ausstempeln'); return; }

    posState.entry = data;
    const idx = posState.entries.findIndex(e => e.id === entry.id);
    if (idx > -1) posState.entries[idx] = data;

    const timeStr = new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    posShowToast('✓ Ausgestempelt um ' + timeStr + ' Uhr');
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
