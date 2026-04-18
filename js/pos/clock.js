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
    employee:    null,        // eingeloggter Mitarbeiter
    entry:       null,        // letzter time_entry des Mitarbeiters
    breaks:      [],          // heutige gh_breaks des Mitarbeiters
    activeBreak: null,        // offene Pause (break_end = null)
    pin:         '',
    error:       '',
    noteSaved:   false        // Kommentar nach Einstempeln bereits gespeichert
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
            .select('id, employee_id, clock_in, clock_out, note')
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

        const elapsedEl = document.getElementById('pos-elapsed');
        if (elapsedEl && posState.entry?.clock_in) {
            const diffS = Math.floor((Date.now() - new Date(posState.entry.clock_in)) / 1000);
            const h = Math.floor(diffS / 3600);
            const m = Math.floor((diffS % 3600) / 60);
            const s = diffS % 60;
            elapsedEl.textContent = (h > 0 ? h + 'h ' : '') + m + 'min ' + s + 's';
        }
    }, 1000);
}

// ── RENDER ────────────────────────────────────────────────

function renderPOS() {
    const root = document.getElementById('pos-root');
    if (!root) return;
    document.body.classList.toggle('employee-view', posState.view === 'employee');
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
        <input id="pos-pin-input" type="password" inputmode="numeric" pattern="[0-9]*"
            placeholder="PIN eingeben"
            maxlength="4"
            style="width:100%; text-align:center; font-size:1rem; letter-spacing:0.3em; padding:0.75rem; border:2px solid var(--color-primary); border-radius:12px; outline:none;"
            oninput="posPinInput(this.value)"
            onkeydown="if(event.key==='Enter') posLogin()">
        <div style="display:flex; justify-content:center;">
            <button onclick="posLogin()" style="width:3.2rem; height:3.2rem; border-radius:50%; background:#B28A6E; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
        </div>
        <div class="pos-error" id="pos-error">${posState.error}</div>
    </div>`;
}

function renderEmployeeScreen() {
    const emp     = posState.employee;
    const entry   = posState.entry;
    const onBreak = !!posState.activeBreak;
    if (!emp) return '';

    const isClockedIn = !!(entry?.clock_in && !entry?.clock_out);
    const time        = new Date().toLocaleTimeString('de-DE');

    let clockSub = '';
    if (isClockedIn && !onBreak && entry) {
        const since  = new Date(entry.clock_in).toLocaleTimeString('de-DE');
        const diffM  = Math.floor((Date.now() - new Date(entry.clock_in)) / 60000);
        const h = Math.floor(diffM / 60), m = diffM % 60;
        clockSub = `
            <div style="font-size: 0.875rem; opacity: 0.9;">Eingestempelt seit: ${since}</div>
            <div id="pos-elapsed" style="font-size: 1.5rem; margin-top: 0.5rem; font-weight: 600;">${h > 0 ? h + 'h ' : ''}${m}min</div>`;
    } else if (onBreak) {
        const since = new Date(posState.activeBreak.break_start).toLocaleTimeString('de-DE');
        const diffM = Math.floor((Date.now() - new Date(posState.activeBreak.break_start)) / 60000);
        const h = Math.floor(diffM / 60), m = diffM % 60;
        clockSub = `
            <div style="font-size: 1.5rem; font-weight: 600;">🍽️ PAUSE</div>
            <div style="font-size: 0.875rem; opacity: 0.9; margin-top: 0.25rem;">Seit: ${since}</div>
            <div style="font-size: 1.5rem; margin-top: 0.5rem; font-weight: 600;">${h > 0 ? h + 'h ' : ''}${m}min</div>`;
    }

    return `
    <div style="background: var(--color-bg); min-height: 100vh; padding: 1rem;">
        <div style="max-width: 600px; margin: 0 auto; background: transparent; border-radius: 12px; padding: 2rem; box-shadow: none; position: relative;">

            <button onclick="posLogout()" style="position: absolute; top: 1rem; right: 1rem; background: var(--color-bg); border: none; padding: 0.5rem; cursor: pointer; width: 2.5rem; height: 2.5rem; border-radius: 12px; display:flex; align-items:center; justify-content:center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B6F47" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <h2 style="color: #2C3E50; font-weight: 700; margin-bottom: 1.5rem; text-align: center;">Hey, ${emp.name.split(' ')[0]}!</h2>

            <div style="background: ${onBreak ? '#F59E0B' : '#B28A6E'}; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; text-align: center; color: white;">
                <div id="pos-time" style="font-size: 2.5rem; font-weight: 700; margin-bottom: 0.5rem;">${time}</div>
                ${clockSub}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <button onclick="posClockIn()" ${isClockedIn ? 'disabled' : ''} style="background: #6B8E6F; color: white; border: none; padding: 1rem; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1rem; opacity: ${isClockedIn ? '0.5' : '1'};">Einstempeln</button>
                <button onclick="posClockOut()" ${!isClockedIn || onBreak ? 'disabled' : ''} style="background: #B28A6E; color: white; border: none; padding: 1rem; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1rem; opacity: ${!isClockedIn || onBreak ? '0.5' : '1'};">Ausstempeln</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                <button onclick="posBreakStart()" ${!isClockedIn || onBreak ? 'disabled' : ''} style="background: #B28A6E; color: white; border: none; padding: 1rem; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1rem; opacity: ${!isClockedIn || onBreak ? '0.5' : '1'};">🍽️ Pause starten</button>
                <button onclick="posBreakEnd()" ${!onBreak ? 'disabled' : ''} style="background: #6B8E6F; color: white; border: none; padding: 1rem; border-radius: 12px; cursor: pointer; font-weight: 600; font-size: 1rem; opacity: ${!onBreak ? '0.5' : '1'};">✓ Pause beenden</button>
            </div>

            ${isClockedIn && !posState.noteSaved ? `
            <div style="margin-top: 1.5rem;">
                <textarea id="pos-note-input" placeholder="Kommentar für Admin..." rows="2"
                    style="width: 100%; resize: vertical; padding: 0.75rem; border: 2px solid #B28A6E; border-radius: 12px; font-size: 1rem; box-sizing: border-box; color: #2C3E50; font-family: inherit;"></textarea>
                <div style="display:flex; justify-content:center; margin-top:0.5rem;">
                    <button onclick="posSubmitNote()"
                        style="width:3.2rem; height:3.2rem; border-radius:50%; background:#B28A6E; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                </div>
            </div>` : ''}

        </div>
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
    await loadBreakData();
    renderPOS();
}

function posLogout() {
    posState.employee    = null;
    posState.entry       = null;
    posState.breaks      = [];
    posState.activeBreak = null;
    posState.pin         = '';
    posState.error       = '';
    posState.noteSaved   = false;
    posState.view        = 'pin';
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
        .select('id, employee_id, clock_in, clock_out, note')
        .eq('user_id', posState.userId)
        .eq('employee_id', emp.id)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!data) { posShowToast('Fehler beim Einstempeln'); return; }

    posState.entry       = data;
    posState.breaks      = [];
    posState.activeBreak = null;
    posState.noteSaved   = false;
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
}

// ── KOMMENTAR ─────────────────────────────────────────────

async function posSubmitNote() {
    const entry = posState.entry;
    if (!entry) return;
    const note = (document.getElementById('pos-note-input')?.value || '').trim();

    const { error } = await db.from('gh_time_entries')
        .update({ note })
        .eq('id', entry.id);

    if (error) { posShowToast('Fehler beim Speichern'); return; }

    posState.entry.note = note;
    posState.noteSaved  = true;
    posShowToast('✓ Kommentar gespeichert');
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
