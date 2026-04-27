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
    noteSaved:   false,       // Kommentar nach Einstempeln bereits gespeichert
    recentEntries: [],        // letzte Schichten des Mitarbeiters (mit Pausen)
    shiftsOpen:    false      // klappbares Schichten-Menü offen/zu
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

async function loadRecentEntries() {
    const emp = posState.employee;
    if (!emp) return;

    const { data: entries } = await db.from('gh_time_entries')
        .select('id, clock_in, clock_out, note')
        .eq('user_id', posState.userId)
        .eq('employee_id', emp.id)
        .order('clock_in', { ascending: false })
        .limit(20);

    if (!entries || entries.length === 0) { posState.recentEntries = []; return; }

    const ids = entries.map(e => e.id);
    const { data: breaks } = await db.from('gh_breaks')
        .select('time_entry_id, break_start, break_end')
        .in('time_entry_id', ids)
        .not('break_end', 'is', null);

    posState.recentEntries = entries.map(e => ({
        ...e,
        breaks: (breaks || []).filter(b => b.time_entry_id === e.id)
    }));
}

// ── UHRZEIT-TICKER ────────────────────────────────────────

function startPosClock() {
    setInterval(() => {
        const el = document.getElementById('pos-time');
        if (el) el.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const workEl  = document.getElementById('pos-work-elapsed');
        const breakEl = document.getElementById('pos-break-elapsed');
        if (posState.entry?.clock_in && !posState.entry?.clock_out) {
            const completedBreakS = (posState.breaks || [])
                .filter(b => b.break_end)
                .reduce((sum, b) => sum + Math.floor((new Date(b.break_end) - new Date(b.break_start)) / 1000), 0);

            if (workEl) {
                let s = posState.activeBreak
                    ? Math.max(0, Math.floor((new Date(posState.activeBreak.break_start) - new Date(posState.entry.clock_in)) / 1000) - completedBreakS)
                    : Math.max(0, Math.floor((Date.now() - new Date(posState.entry.clock_in)) / 1000) - completedBreakS);
                const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
                workEl.textContent = (h > 0 ? h + 'h ' : '') + m + 'min ' + sec + 's';
            }

            if (breakEl) {
                let s = completedBreakS + (posState.activeBreak
                    ? Math.floor((Date.now() - new Date(posState.activeBreak.break_start)) / 1000)
                    : 0);
                const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
                breakEl.textContent = posState.activeBreak
                    ? (h > 0 ? h + 'h ' : '') + m + 'min ' + sec + 's'
                    : (h > 0 ? h + 'h ' : '') + m + 'min';
            }
        }
    }, 1000);
}

function posToggleShifts() {
    posState.shiftsOpen = !posState.shiftsOpen;
    const body  = document.getElementById('pos-shifts-body');
    const arrow = document.getElementById('pos-shifts-arrow');
    if (body)  body.style.display  = posState.shiftsOpen ? 'block' : 'none';
    if (arrow) arrow.textContent   = posState.shiftsOpen ? '▼' : '▶';
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
            <div class="pos-logo"><img src="assets/logo.png" alt="GastroHub" style="height: 32px;"></div>
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
    const onBreak     = !!posState.activeBreak;
    if (!emp) return '';

    const isClockedIn = !!(entry?.clock_in && !entry?.clock_out);
    const hasBreaks   = isClockedIn;
    const time        = new Date().toLocaleTimeString('de-DE');

    let workTimeStr = '–', breakTimeStr = '–';
    if (isClockedIn && entry) {
        const completedBreakS = (posState.breaks || [])
            .filter(b => b.break_end)
            .reduce((sum, b) => sum + Math.floor((new Date(b.break_end) - new Date(b.break_start)) / 1000), 0);
        let workS = onBreak
            ? Math.max(0, Math.floor((new Date(posState.activeBreak.break_start) - new Date(entry.clock_in)) / 1000) - completedBreakS)
            : Math.max(0, Math.floor((Date.now() - new Date(entry.clock_in)) / 1000) - completedBreakS);
        const wh = Math.floor(workS / 3600), wm = Math.floor((workS % 3600) / 60);
        workTimeStr = (wh > 0 ? wh + 'h ' : '') + wm + 'min';
        let breakS = completedBreakS + (onBreak ? Math.floor((Date.now() - new Date(posState.activeBreak.break_start)) / 1000) : 0);
        const bh = Math.floor(breakS / 3600), bm = Math.floor((breakS % 3600) / 60);
        breakTimeStr = (bh > 0 ? bh + 'h ' : '') + bm + 'min';
    }

    return `
    <div style="background: var(--color-bg); min-height: 100vh; padding: 1rem;">
        <div style="max-width: 600px; margin: 0 auto; background: transparent; border-radius: 12px; padding: 2rem; box-shadow: none; position: relative;">

            <button onclick="posLogout()" style="position: absolute; top: 1rem; right: 1rem; background: var(--color-bg); border: none; padding: 0.5rem; cursor: pointer; width: 2.5rem; height: 2.5rem; border-radius: 12px; display:flex; align-items:center; justify-content:center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B6F47" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <h2 style="color: #2C3E50; font-weight: 700; margin-bottom: 1.5rem; text-align: center;">Hey, ${emp.name.split(' ')[0]}!</h2>

            <div style="background: #B28A6E; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; text-align: center; color: white;">
                <div id="pos-time" style="font-size: 2.5rem; font-weight: 700; margin-bottom: 0.75rem;">${time}</div>
                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:130px; background:rgba(255,255,255,0.2); border-radius:14px; padding:1rem;">
                        <div style="font-size:0.7rem; opacity:0.85; margin-bottom:0.4rem; text-transform:uppercase; letter-spacing:0.06em;">Arbeitszeit</div>
                        <div id="pos-work-elapsed" style="font-size:2.5rem; font-weight:800; line-height:1;">${workTimeStr}</div>
                    </div>
                    ${hasBreaks ? `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:130px; background:rgba(107,142,111,0.5); border-radius:14px; padding:1rem;">
                        <div style="font-size:0.7rem; opacity:0.85; margin-bottom:0.4rem; text-transform:uppercase; letter-spacing:0.06em;">🍽️ Pause</div>
                        <div id="pos-break-elapsed" style="font-size:2.5rem; font-weight:800; line-height:1;">${breakTimeStr}</div>
                    </div>` : ''}
                </div>
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

            ${(() => {
                const all = posState.recentEntries || [];
                if (all.length === 0) return '';

                const fmtTime = iso => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const fmtDate = iso => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                const fmtDur  = mins => {
                    const h = Math.floor(mins / 60), m = mins % 60;
                    return (h > 0 ? h + 'h ' : '') + m + 'min';
                };

                const renderEntry = e => {
                    const breakMins = (e.breaks || []).reduce((sum, b) => {
                        if (!b.break_end) return sum;
                        return sum + Math.floor((new Date(b.break_end) - new Date(b.break_start)) / 60000);
                    }, 0);
                    const ausStr   = e.clock_out ? fmtTime(e.clock_out) : '–';
                    const pauseStr = breakMins > 0 ? fmtDur(breakMins) : '–';
                    const nettoStr = e.clock_out
                        ? fmtDur(Math.max(0, Math.floor((new Date(e.clock_out) - new Date(e.clock_in)) / 60000) - breakMins))
                        : '–';
                    return `<div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:0.25rem; font-size:0.76rem; text-align:center; padding:0.35rem 0; border-bottom:1px solid #EDE7E0; color:#2C3E50;">
                        <span><span style="opacity:0.6;">Ein</span><br>${fmtTime(e.clock_in)}</span>
                        <span><span style="opacity:0.6;">Aus</span><br>${ausStr}</span>
                        <span><span style="opacity:0.6;">Pause</span><br>${pauseStr}</span>
                        <span><span style="opacity:0.6;">Netto</span><br><strong>${nettoStr}</strong></span>
                    </div>`;
                };

                // Einträge nach Datum (YYYY-MM-DD) gruppieren
                const groups = [];
                const groupMap = {};
                all.forEach(e => {
                    const key = e.clock_in.split('T')[0];
                    if (!groupMap[key]) { groupMap[key] = []; groups.push({ key, entries: groupMap[key] }); }
                    groupMap[key].push(e);
                });

                const renderGroup = g => `<div style="margin-bottom:0.5rem;">
                    <div style="text-align:center; font-weight:700; font-size:0.82rem; padding:0.4rem 0 0.2rem; color:#5C4033; border-bottom:2px solid #D4C5B5; margin-bottom:0.1rem;">${fmtDate(g.entries[0].clock_in)}</div>
                    ${g.entries.map(renderEntry).join('')}
                </div>`;

                const visible = groups.slice(0, 3).map(renderGroup).join('');
                const hidden  = groups.slice(3).map(renderGroup).join('');
                const hasMore = groups.length > 3;

                return `
                <div style="margin-top:1.5rem; background:#FBF8F5; border-radius:12px; padding:1rem;">
                    <button onclick="posToggleShifts()" style="width:100%; background:none; border:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; padding:0; font-size:0.9rem; font-weight:600; color:#5C4033;">
                        <span>Meine Schichten</span>
                        <span id="pos-shifts-arrow" style="font-size:0.75rem;">▶</span>
                    </button>
                    <div id="pos-shifts-body" style="display:none; margin-top:0.75rem;">
                        ${visible}
                        ${hasMore ? `<div id="pos-shifts-extra" style="display:none;">${hidden}</div>
                        <button onclick="document.getElementById('pos-shifts-extra').style.display='block'; this.style.display='none';"
                            style="margin-top:0.5rem; background:none; border:none; cursor:pointer; font-size:0.78rem; color:#B28A6E; padding:0;">
                            + ${groups.length - 3} weitere Tage anzeigen
                        </button>` : ''}
                    </div>
                </div>`;
            })()}

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

    posState.employee    = emp;
    posState.entry       = lastEntry;
    posState.pin         = '';
    posState.error       = '';
    posState.shiftsOpen  = false;
    posState.view        = 'employee';
    await loadBreakData();
    await loadRecentEntries();
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

    await loadRecentEntries();
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

    await loadRecentEntries();
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
