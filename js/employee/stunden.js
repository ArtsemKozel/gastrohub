// ── MEINE STUNDEN ─────────────────────────────────────────
let stundenDate = new Date();

function changeStundenMonth(dir) {
    stundenDate.setMonth(stundenDate.getMonth() + dir);
    loadMeineStunden();
}

async function loadMeineStunden() {
    if (!currentEmployee) return;

    const year     = stundenDate.getFullYear();
    const month    = stundenDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const label    = stundenDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('stunden-month-label').textContent = label;

    const firstDay = `${monthStr}-01`;
    const lastDay  = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data: shifts, error } = await db
        .from('shifts')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .gte('shift_date', firstDay)
        .lte('shift_date', lastDay)
        .order('shift_date', { ascending: true });

    if (error || !shifts) {
        document.getElementById('stunden-list').innerHTML = '<div class="empty-state"><p>Fehler beim Laden.</p></div>';
        return;
    }

    // Tatsächliche Stunden aus Schichten (Fallback auf Planzeiten)
    let actualMinutes = 0;
    shifts.forEach(s => {
        const startStr = s.actual_start_time || s.start_time;
        const endStr   = s.actual_end_time   || s.end_time;
        const breakMin = (s.actual_break_minutes !== null && s.actual_break_minutes !== undefined)
            ? s.actual_break_minutes : (s.break_minutes || 0);
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        actualMinutes += (eh * 60 + em) - (sh * 60 + sm) - breakMin;
    });

    // Abgerechnete Stunden, Übertrag & Urlaubsanträge
    const [{ data: approved }, { data: actualEntry }, { data: vacations }] = await Promise.all([
        db.from('approved_hours').select('*')
            .eq('employee_id', currentEmployee.id)
            .eq('month', monthStr)
            .maybeSingle(),
        db.from('actual_hours').select('carry_over_minutes')
            .eq('employee_id', currentEmployee.id)
            .eq('month', monthStr)
            .maybeSingle(),
        db.from('vacation_requests')
            .select('deducted_hours, deducted_days')
            .eq('employee_id', currentEmployee.id)
            .eq('type', 'vacation')
            .eq('status', 'approved')
            .lte('start_date', lastDay)
            .gte('end_date', firstDay),
    ]);

    const hoursPerDay   = currentEmployee.hours_per_vacation_day || 8;
    let vacationMinutes = 0;
    (vacations || []).forEach(v => {
        if (v.deducted_hours != null) {
            vacationMinutes += Math.round(v.deducted_hours * 60);
        } else if (v.deducted_days) {
            vacationMinutes += Math.round(v.deducted_days * hoursPerDay * 60);
        }
    });

    const totalMinutes    = actualMinutes + vacationMinutes;
    const approvedMinutes = approved    ? approved.approved_minutes      : null;
    const carryOver       = actualEntry ? (actualEntry.carry_over_minutes || 0) : 0;
    const diffMinutes     = approvedMinutes !== null
        ? totalMinutes - approvedMinutes + carryOver
        : null;

    const fmtMin    = m => `${Math.floor(Math.abs(m)/60)}h ${String(Math.abs(m)%60).padStart(2,'0')}m`;
    const diffColor = diffMinutes === null ? 'var(--color-text-light)'
                    : diffMinutes > 0  ? '#2d7a2d'
                    : diffMinutes < 0  ? 'var(--color-red)'
                    : 'var(--color-text-light)';
    const diffDisplay  = diffMinutes !== null ? `${diffMinutes >= 0 ? '+' : '-'}${fmtMin(diffMinutes)}` : '–';
    const carryDisplay = `${carryOver >= 0 ? '+' : '-'}${fmtMin(carryOver)}`;

    document.getElementById('stunden-total').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; margin-bottom:1rem;">
            <div>
                <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">ABGERECHNET</div>
                <div style="font-weight:600;">${approvedMinutes !== null ? fmtMin(approvedMinutes) : '–'}</div>
            </div>
            <div>
                <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">GEARBEITET</div>
                <div style="font-weight:600;">${fmtMin(totalMinutes)}</div>
            </div>
            <div>
                <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">VORMONAT</div>
                <div style="font-weight:600;">${carryDisplay}</div>
            </div>
        </div>
        <div style="padding-top:0.75rem; border-top:1px solid var(--color-border);">
            <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">SALDO</div>
            <div style="font-weight:700; font-size:1.3rem; color:${diffColor};">${diffDisplay}</div>
        </div>`;

    document.getElementById('stunden-count').textContent = shifts.length;

    if (shifts.length === 0) {
        document.getElementById('stunden-list').innerHTML = '<div class="empty-state"><p>Keine Schichten in diesem Monat.</p></div>';
        return;
    }

    const weekdays = ['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'];
    document.getElementById('stunden-list').innerHTML = shifts.map(s => {
        const date = new Date(s.shift_date + 'T00:00:00');
        const day  = date.getDate();
        const wd   = weekdays[date.getDay()];
        const start = s.start_time.slice(0, 5);
        const end   = s.end_time.slice(0, 5);
        const note  = s.notes ? `<div style="font-size:0.8rem; color:var(--color-text-light);">${s.notes}</div>` : '';
        return `
        <div style="display:flex; align-items:center; gap:1rem; margin-bottom:0.75rem;">
            <div style="min-width:2.5rem; text-align:center;">
                <div style="font-size:1.3rem; font-weight:700; color:var(--color-text-light);">${day}</div>
                <div style="font-size:0.75rem; color:var(--color-text-light);">${wd}</div>
            </div>
            <div class="card" style="flex:1; margin-bottom:0; padding:0.75rem 1rem;">
                <div style="font-weight:600;">${start} – ${end} Uhr</div>
                ${note}
            </div>
        </div>`;
    }).join('');
}
