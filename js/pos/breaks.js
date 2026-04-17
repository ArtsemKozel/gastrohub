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

function renderBreakSection() {
    const entry       = posState.entry;
    const activeBreak = posState.activeBreak;
    const isClockedIn = !!(entry?.clock_in && !entry?.clock_out);

    if (!isClockedIn) return '';

    const onBreak = !!activeBreak;

    let breakInfo = '';
    if (onBreak) {
        const since = new Date(activeBreak.break_start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        breakInfo = `Pause läuft seit ${since} Uhr`;
    } else {
        const doneBreaks = (posState.breaks || []).filter(b => b.break_end);
        if (doneBreaks.length) {
            const totalMin = doneBreaks.reduce((sum, b) =>
                sum + Math.floor((new Date(b.break_end) - new Date(b.break_start)) / 60000), 0);
            const h = Math.floor(totalMin / 60), m = totalMin % 60;
            breakInfo = `Pausen heute: ${h > 0 ? h + 'h ' : ''}${m}min`;
        }
    }

    return `
    <div style="margin-top:0.75rem;">
        <button class="pos-action-btn"
            style="width:100%; background:${onBreak ? '#FFF3CD' : 'var(--color-bg)'}; color:${onBreak ? '#7D5E00' : 'var(--color-text)'};"
            onclick="${onBreak ? 'posBreakEnd()' : 'posBreakStart()'}">
            ${onBreak ? '▶ Pause beenden' : '⏸ Pause starten'}
        </button>
        ${breakInfo ? `<div class="pos-shift-info" style="margin-top:0.5rem;">${breakInfo}</div>` : ''}
    </div>`;
}
