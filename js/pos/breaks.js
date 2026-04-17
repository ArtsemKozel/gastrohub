// ── POS PAUSENVERWALTUNG ──────────────────────────────────
// Pause starten/beenden via gh_breaks Tabelle
// Erfordert clock.js (posState, posShowToast, renderPOS)
//
// gh_breaks Spalten: id, user_id, employee_id, time_entry_id,
//                    break_start (timestamptz), break_end (timestamptz)
//
// posState wird um folgende Felder erweitert:
//   breaks      — heutige Pausen des eingeloggten Mitarbeiters
//   activeBreak — offene Pause (break_end = null), sonst null

// ── DATEN LADEN ───────────────────────────────────────────

async function loadBreakData() {
    const emp   = posState.employee;
    const entry = posState.entry;
    if (!emp || !entry) {
        posState.breaks      = [];
        posState.activeBreak = null;
        return;
    }

    const { data } = await db.from('gh_breaks')
        .select('id, employee_id, time_entry_id, break_start, break_end')
        .eq('user_id', posState.userId)
        .eq('employee_id', emp.id)
        .eq('time_entry_id', entry.id)
        .order('break_start', { ascending: true });

    posState.breaks      = data || [];
    posState.activeBreak = posState.breaks.find(b => !b.break_end) || null;
}

// ── PAUSE STARTEN ─────────────────────────────────────────

async function posBreakStart() {
    const emp   = posState.employee;
    const entry = posState.entry;
    if (!emp || !entry) return;

    const now = new Date().toISOString();

    const { error } = await db.from('gh_breaks')
        .insert({
            user_id:       posState.userId,
            employee_id:   emp.id,
            time_entry_id: entry.id,
            break_start:   now
        });

    if (error) { posShowToast('Fehler beim Starten der Pause'); return; }

    // Letzten offenen Break nachladen (analog zu posClockIn)
    const { data } = await db.from('gh_breaks')
        .select('id, employee_id, time_entry_id, break_start, break_end')
        .eq('user_id', posState.userId)
        .eq('employee_id', emp.id)
        .eq('time_entry_id', entry.id)
        .is('break_end', null)
        .order('break_start', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!data) { posShowToast('Fehler beim Starten der Pause'); return; }

    posState.breaks.push(data);
    posState.activeBreak = data;

    const timeStr = new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    posShowToast('⏸ Pause gestartet um ' + timeStr + ' Uhr');
    renderPOS();
}

// ── PAUSE BEENDEN ─────────────────────────────────────────

async function posBreakEnd() {
    const brk = posState.activeBreak;
    if (!brk) return;

    const now = new Date().toISOString();

    const { error } = await db.from('gh_breaks')
        .update({ break_end: now })
        .eq('id', brk.id);

    if (error) { posShowToast('Fehler beim Beenden der Pause'); return; }

    const updated = { ...brk, break_end: now };
    const idx = posState.breaks.findIndex(b => b.id === brk.id);
    if (idx > -1) posState.breaks[idx] = updated;
    posState.activeBreak = null;

    const timeStr = new Date(now).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    posShowToast('▶ Pause beendet um ' + timeStr + ' Uhr');
    renderPOS();
}

// ── RENDER PAUSE-BEREICH ──────────────────────────────────
// Buttons werden direkt in renderEmployeeScreen (clock.js) gerendert.
// Diese Funktion bleibt für externe Nutzung leer.

function renderBreakSection() { return ''; }
