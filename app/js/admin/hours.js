// ── STUNDENKONTO (ADMIN) ──────────────────────────────────

let adminStundenDate = new Date();

function changeAdminStundenMonth(dir) {
    adminStundenDate.setMonth(adminStundenDate.getMonth() + dir);
    loadAdminStunden();
}

async function loadAdminStunden() {
    const label = adminStundenDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('admin-stunden-month-label').textContent = label;

    const year     = adminStundenDate.getFullYear();
    const month    = adminStundenDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDay = `${monthStr}-01`;
    const lastDay  = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const prevDate     = new Date(year, month - 1, 1);
    const prevYear     = prevDate.getFullYear();
    const prevMonth    = prevDate.getMonth();
    const prevMonthStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    const prevFirstDay = `${prevMonthStr}-01`;
    const prevLastDay  = new Date(prevYear, prevMonth + 1, 0).toISOString().split('T')[0];

    const { data: emps } = await db
        .from('employees_planit')
        .select('*')
        .eq('is_active', true)
        .order('name');

    if (!emps || emps.length === 0) {
        document.getElementById('admin-stunden-list').innerHTML = '<div class="empty-state"><p>Keine Mitarbeiter vorhanden.</p></div>';
        return;
    }

    const [
        { data: shifts },
        { data: approved },
        { data: actualHours },
        { data: vacations },
        { data: prevShifts },
        { data: prevApproved },
        { data: prevActualHours },
        { data: prevVacations },
    ] = await Promise.all([
        db.from('shifts').select('*').gte('shift_date', firstDay).lte('shift_date', lastDay),
        db.from('approved_hours').select('*').eq('month', monthStr),
        db.from('actual_hours').select('*').eq('month', monthStr),
        db.from('vacation_requests')
            .select('employee_id, deducted_days, deducted_hours')
            .eq('user_id', adminSession.user.id)
            .eq('status', 'approved')
            .eq('type', 'vacation')
            .lte('start_date', lastDay)
            .gte('end_date', firstDay),
        db.from('shifts').select('*').gte('shift_date', prevFirstDay).lte('shift_date', prevLastDay),
        db.from('approved_hours').select('*').eq('month', prevMonthStr),
        db.from('actual_hours').select('*').eq('month', prevMonthStr),
        db.from('vacation_requests')
            .select('employee_id, deducted_days, deducted_hours')
            .eq('user_id', adminSession.user.id)
            .eq('status', 'approved')
            .eq('type', 'vacation')
            .lte('start_date', prevLastDay)
            .gte('end_date', prevFirstDay),
    ]);

    // Auto carry-over: für Mitarbeiter ohne bestehenden actual_hours-Eintrag
    // den Saldo des Vormonats automatisch übernehmen (manuell gesetzte Werte bleiben unberührt)
    const effectiveActualHours = [...(actualHours || [])];
    const autoUpserts = [];
    for (const emp of emps) {
        if (effectiveActualHours.find(a => a.employee_id === emp.id)) continue;
        const prevApprovedEntry = (prevApproved || []).find(a => a.employee_id === emp.id);
        if (!prevApprovedEntry) continue;

        let prevActualMins = 0;
        (prevShifts || []).filter(s => s.employee_id === emp.id).forEach(s => {
            const startStr = s.actual_start_time || s.start_time;
            const endStr   = s.actual_end_time   || s.end_time;
            const breakMin = s.actual_break_minutes ?? s.break_minutes ?? 0;
            const [sh, sm] = startStr.split(':').map(Number);
            const [eh, em] = endStr.split(':').map(Number);
            prevActualMins += (eh * 60 + em) - (sh * 60 + sm) - breakMin;
        });

        const hoursPerDay = emp.hours_per_vacation_day || 8;
        let prevVacMins = 0;
        (prevVacations || []).filter(v => v.employee_id === emp.id).forEach(v => {
            if (v.deducted_hours != null) prevVacMins += Math.round(v.deducted_hours * 60);
            else if (v.deducted_days)    prevVacMins += Math.round(v.deducted_days * hoursPerDay * 60);
        });

        const prevCarryEntry  = (prevActualHours || []).find(a => a.employee_id === emp.id);
        const prevCarryMins   = prevCarryEntry ? (prevCarryEntry.carry_over_minutes || 0) : 0;
        const autoCarry       = prevActualMins + prevVacMins - prevApprovedEntry.approved_minutes + prevCarryMins;

        effectiveActualHours.push({ employee_id: emp.id, carry_over_minutes: autoCarry });
        autoUpserts.push(db.from('actual_hours').upsert({
            employee_id: emp.id, month: monthStr,
            carry_over_minutes: autoCarry,
            user_id: adminSession.user.id,
        }, { onConflict: 'employee_id,month' }));
    }
    if (autoUpserts.length) Promise.all(autoUpserts);

    const html = emps.map(emp => {
        const empShifts = (shifts || []).filter(s => s.employee_id === emp.id);

        // Geplante Stunden
        let plannedMinutes = 0;
        empShifts.forEach(s => {
            const [sh, sm] = s.start_time.split(':').map(Number);
            const [eh, em] = s.end_time.split(':').map(Number);
            plannedMinutes += (eh * 60 + em) - (sh * 60 + sm) - (s.break_minutes || 0);
        });

        // Abgerechnete Stunden
        const approvedEntry   = (approved || []).find(a => a.employee_id === emp.id);
        const approvedMinutes = approvedEntry ? approvedEntry.approved_minutes : null;
        const ah = approvedMinutes !== null ? Math.floor(approvedMinutes / 60) : '–';
        const am = approvedMinutes !== null ? String(approvedMinutes % 60).padStart(2, '0') : '';
        const approvedDisplay = approvedMinutes !== null ? `${ah}h ${am}m` : '–';

        // Gearbeitete Stunden (actual wenn vorhanden, sonst geplant)
        let actualMinutes = 0;
        empShifts.forEach(s => {
            const startStr = s.actual_start_time || s.start_time;
            const endStr   = s.actual_end_time   || s.end_time;
            const breakMin = (s.actual_break_minutes !== null && s.actual_break_minutes !== undefined)
                ? s.actual_break_minutes : (s.break_minutes || 0);
            const [sh, sm] = startStr.split(':').map(Number);
            const [eh, em] = endStr.split(':').map(Number);
            actualMinutes += (eh * 60 + em) - (sh * 60 + sm) - breakMin;
        });

        // Urlaubsstunden
        const empVacations   = (vacations || []).filter(v => v.employee_id === emp.id);
        const hoursPerDay    = emp.hours_per_vacation_day || 8;
        let vacationMinutes  = 0;
        empVacations.forEach(v => {
            if (v.deducted_hours != null) {
                vacationMinutes += Math.round(v.deducted_hours * 60);
            } else if (v.deducted_days) {
                vacationMinutes += Math.round(v.deducted_days * hoursPerDay * 60);
            }
        });

        const totalMinutes = actualMinutes + vacationMinutes;
        const fmtMins = m => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
        let actualDisplay = fmtMins(totalMinutes);
        if (vacationMinutes > 0) {
            actualDisplay += ` <span style="font-size:0.75rem; color:var(--color-text-light);">(inkl. ${fmtMins(vacationMinutes)} Urlaub)</span>`;
        }

        // Vormonat-Differenz
        const actualEntry    = effectiveActualHours.find(a => a.employee_id === emp.id);
        const prevDiffMinutes = actualEntry ? (actualEntry.carry_over_minutes || 0) : 0;

        // Saldo
        const diffMinutes = approvedMinutes !== null
            ? totalMinutes - approvedMinutes + prevDiffMinutes
            : null;
        const diffDisplay = diffMinutes !== null
            ? `${diffMinutes >= 0 ? '+' : ''}${Math.floor(Math.abs(diffMinutes) / 60)}h ${String(Math.abs(diffMinutes) % 60).padStart(2, '00')}m`
            : '–';
        const diffColor = diffMinutes === null ? 'var(--color-text-light)'
            : diffMinutes > 0 ? '#2d7a2d'
            : diffMinutes < 0 ? 'var(--color-red)'
            : 'var(--color-text-light)';

        // Schicht-Zeilen
        const shiftRows = empShifts
            .slice().sort((a, b) => a.shift_date.localeCompare(b.shift_date))
            .map(s => {
                const dateLabel = new Date(s.shift_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                const startStr  = s.actual_start_time || s.start_time;
                const endStr    = s.actual_end_time   || s.end_time;
                const breakMin  = (s.actual_break_minutes !== null && s.actual_break_minutes !== undefined) ? s.actual_break_minutes : (s.break_minutes || 0);
                const [sh, sm]  = startStr.split(':').map(Number);
                const [eh, em]  = endStr.split(':').map(Number);
                const mins      = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
                const durStr    = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
                const plannedStr = `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
                const hasActual = s.actual_start_time || s.actual_end_time;
                const actualStr = hasActual
                    ? `<span style="color:var(--color-primary);">${(s.actual_start_time || s.start_time).slice(0, 5)}–${(s.actual_end_time || s.end_time).slice(0, 5)}${s.actual_break_minutes != null ? ` (${s.actual_break_minutes}m)` : ''}</span>`
                    : '';
                return `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; padding:0.25rem 0; border-bottom:1px solid var(--color-border);">
                    <span style="min-width:6rem;">${dateLabel}</span>
                    <span style="color:var(--color-text-light);">${plannedStr}</span>
                    ${actualStr}
                    <span style="font-weight:600; min-width:4rem; text-align:right;">${durStr}</span>
                </div>`;
            }).join('');

        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <button style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:1rem; background:none; border:none; padding:0; cursor:pointer; touch-action:manipulation; text-align:left;" onclick="toggleStundenEmp('${emp.id}')">
                <div style="font-weight:600; font-size:1.1rem;">${emp.name}</div>
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="font-size:0.8rem; color:var(--color-text-light);">${emp.department}</div>
                    <span id="stunden-toggle-${emp.id}" style="color:var(--color-text-light);">▶</span>
                </div>
            </button>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:1rem;">
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.3rem;">ABGERECHNET</div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-weight:600;">${approvedDisplay}</span>
                        <button class="btn-small btn-pdf-view btn-icon" data-empid="${emp.id}" data-name="${emp.name}" data-month="${monthStr}" data-minutes="${approvedMinutes !== null ? approvedMinutes : 0}" onclick="openApproveModal(this)">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                    </div>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.3rem;">GEARBEITET</div>
                    <div style="font-weight:600;">${actualDisplay}</div>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.3rem;">VORMONAT</div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-weight:600;">${prevDiffMinutes >= 0 ? '+' : '-'}${Math.floor(Math.abs(prevDiffMinutes) / 60)}h ${String(Math.abs(prevDiffMinutes) % 60).padStart(2, '0')}m</span>
                        <button class="btn-small btn-pdf-view btn-icon" data-empid="${emp.id}" data-name="${emp.name}" data-month="${monthStr}" data-minutes="${prevDiffMinutes}" onclick="openCarryOverModal(this)">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div style="margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--color-border);">
                <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.2rem;">SALDO</div>
                <div style="font-weight:700; font-size:1.1rem; color:${diffColor};">${diffDisplay}</div>
            </div>
            <div id="stunden-shifts-${emp.id}" style="display:none; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--color-border);">
                ${shiftRows || '<div style="font-size:0.8rem; color:var(--color-text-light);">Keine Schichten.</div>'}
            </div>
        </div>`;
    }).join('');

    document.getElementById('admin-stunden-list').innerHTML = html;
}

function toggleStundenEmp(empId) {
    const body   = document.getElementById(`stunden-shifts-${empId}`);
    const toggle = document.getElementById(`stunden-toggle-${empId}`);
    const open   = body.style.display === 'none';
    body.style.display   = open ? 'block' : 'none';
    toggle.textContent   = open ? '▼' : '▶';
}

// ── APPROVE MODAL ─────────────────────────────────────────

function openApproveModal(btn) {
    const employeeId     = btn.dataset.empid;
    const name           = btn.dataset.name;
    const month          = btn.dataset.month;
    const currentMinutes = parseInt(btn.dataset.minutes) || 0;
    document.getElementById('approve-modal-title').textContent   = name;
    document.getElementById('approve-employee-id').value         = employeeId;
    document.getElementById('approve-month').value               = month;
    document.getElementById('approve-hours').value   = Math.floor(currentMinutes / 60);
    document.getElementById('approve-minutes').value = currentMinutes % 60;
    document.querySelector('#approve-modal .btn-primary').onclick = () => saveApprovedHours();
    document.getElementById('approve-modal').classList.add('active');
}

function openCarryOverModal(btn) {
    const empId      = btn.dataset.empid;
    const name       = btn.dataset.name;
    const month      = btn.dataset.month;
    const minutes    = parseInt(btn.dataset.minutes) || 0;
    const isNegative = minutes < 0;
    const absMinutes = Math.abs(minutes);
    document.getElementById('approve-modal-title').textContent = `Vormonat: ${name}`;
    document.getElementById('approve-hours').value   = Math.floor(absMinutes / 60) * (isNegative ? -1 : 1);
    document.getElementById('approve-minutes').value = absMinutes % 60;
    document.querySelector('#approve-modal .btn-primary').onclick = () => submitCarryOver(empId, month);
    document.getElementById('approve-modal').classList.add('active');
}

function closeApproveModal() {
    document.getElementById('approve-modal').classList.remove('active');
}

async function saveApprovedHours() {
    const employeeId   = document.getElementById('approve-employee-id').value;
    const month        = document.getElementById('approve-month').value;
    const hours        = parseInt(document.getElementById('approve-hours').value)   || 0;
    const minutes      = parseInt(document.getElementById('approve-minutes').value) || 0;
    const totalMinutes = hours * 60 + minutes;

    const { data: existing } = await db
        .from('approved_hours')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('month', month)
        .maybeSingle();

    let error;
    if (existing) {
        ({ error } = await db.from('approved_hours').update({ approved_minutes: totalMinutes }).eq('id', existing.id));
    } else {
        ({ error } = await db.from('approved_hours').insert({
            employee_id: employeeId,
            month,
            approved_minutes: totalMinutes,
            user_id: (await db.auth.getUser()).data.user.id
        }));
    }

    if (error) { alert('Fehler beim Speichern!'); return; }
    closeApproveModal();
    loadAdminStunden();
}

async function submitCarryOver(empId, month) {
    const h            = parseInt(document.getElementById('approve-hours').value)   || 0;
    const m            = parseInt(document.getElementById('approve-minutes').value) || 0;
    const totalMinutes = h * 60 + (h < 0 ? -m : m);

    const { error } = await db.from('actual_hours').upsert({
        employee_id: empId,
        month,
        carry_over_minutes: totalMinutes,
        user_id: (await db.auth.getUser()).data.user.id
    }, { onConflict: 'employee_id,month' });

    if (error) { alert('Fehler: ' + error.message); return; }
    document.getElementById('approve-modal').classList.remove('active');
    loadAdminStunden();
}

// ── PDF EXPORT ────────────────────────────────────────────

async function downloadStundenPdf() {
    const year      = adminStundenDate.getFullYear();
    const month     = adminStundenDate.getMonth();
    const monthStr  = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = adminStundenDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const firstDay  = `${monthStr}-01`;
    const lastDay   = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [{ data: emps }, { data: shifts }, { data: approved }, { data: actualHours }] = await Promise.all([
        db.from('employees_planit').select('*').eq('is_active', true).order('name'),
        db.from('shifts').select('*').eq('user_id', adminSession.user.id).eq('is_open', false).gte('shift_date', firstDay).lte('shift_date', lastDay),
        db.from('approved_hours').select('*').eq('user_id', adminSession.user.id).eq('month', monthStr),
        db.from('actual_hours').select('*').eq('user_id', adminSession.user.id).eq('month', monthStr),
    ]);

    if (!emps || emps.length === 0) { alert('Keine Mitarbeiter vorhanden.'); return; }

    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF();
    const pageW     = 210;
    const marginL   = 15;
    const marginR   = 15;
    const contentW  = pageW - marginL - marginR;

    emps.forEach((emp, empIdx) => {
        if (empIdx > 0) doc.addPage();

        const empShifts = (shifts || [])
            .filter(s => s.employee_id === emp.id)
            .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(emp.name, marginL, 22);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(emp.department || '', marginL, 29);
        doc.text(monthLabel, pageW - marginR, 22, { align: 'right' });
        doc.setTextColor(0);
        doc.setDrawColor(200);
        doc.line(marginL, 33, pageW - marginR, 33);

        let y = 42;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(245, 245, 245);
        doc.rect(marginL, y - 5, contentW, 7, 'F');
        doc.text('Datum',        marginL + 1,   y);
        doc.text('Geplant',      marginL + 38,  y);
        doc.text('Tatsächlich',  marginL + 75,  y);
        doc.text('Pause',        marginL + 120, y);
        doc.text('Stunden',      pageW - marginR, y, { align: 'right' });
        y += 6;

        doc.setFont('helvetica', 'normal');
        let totalActualMin = 0;

        if (empShifts.length === 0) {
            doc.setTextColor(150);
            doc.text('Keine Schichten in diesem Monat.', marginL + 1, y + 3);
            doc.setTextColor(0);
            y += 10;
        } else {
            empShifts.forEach((s, i) => {
                if (y > 250) { doc.addPage(); y = 20; }
                const dateLabel  = new Date(s.shift_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                const planned    = `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
                const startStr   = s.actual_start_time || s.start_time;
                const endStr     = s.actual_end_time   || s.end_time;
                const breakMin   = (s.actual_break_minutes !== null && s.actual_break_minutes !== undefined) ? s.actual_break_minutes : (s.break_minutes || 0);
                const hasActual  = s.actual_start_time || s.actual_end_time;
                const actual     = hasActual ? `${startStr.slice(0, 5)}–${endStr.slice(0, 5)}` : '–';
                const [sh, sm]   = startStr.split(':').map(Number);
                const [eh, em]   = endStr.split(':').map(Number);
                const mins       = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
                totalActualMin  += mins;
                const durStr     = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

                if (i % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(marginL, y - 4, contentW, 6, 'F');
                }
                doc.text(dateLabel, marginL + 1,   y);
                doc.text(planned,   marginL + 38,  y);
                if (hasActual) doc.setTextColor(180, 140, 50);
                doc.text(actual,    marginL + 75,  y);
                doc.setTextColor(0);
                doc.text(`${breakMin} Min`, marginL + 120, y);
                doc.text(durStr, pageW - marginR, y, { align: 'right' });
                y += 6;
            });
        }

        y += 2;
        doc.setDrawColor(200);
        doc.line(marginL, y, pageW - marginR, y);
        y += 7;

        const approvedEntry = (approved || []).find(a => a.employee_id === emp.id);
        const approvedMin   = approvedEntry ? approvedEntry.approved_minutes : null;
        const actualEntry   = (actualHours || []).find(a => a.employee_id === emp.id);
        const carryMin      = actualEntry ? (actualEntry.carry_over_minutes || 0) : 0;
        const diffMin       = approvedMin !== null ? totalActualMin - approvedMin + carryMin : null;
        const fmtMin        = m => `${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

        doc.setFontSize(9);
        const col1 = marginL + 1;
        const col2 = marginL + 60;
        const col3 = marginL + 110;

        doc.setFont('helvetica', 'bold');  doc.text('Gearbeitet:',  col1, y);
        doc.setFont('helvetica', 'normal'); doc.text(`${Math.floor(totalActualMin / 60)}:${String(totalActualMin % 60).padStart(2, '0')} h`, col1 + 28, y);
        doc.setFont('helvetica', 'bold');  doc.text('Abgerechnet:', col2, y);
        doc.setFont('helvetica', 'normal'); doc.text(approvedMin !== null ? `${fmtMin(approvedMin)} h` : '–', col2 + 32, y);
        doc.setFont('helvetica', 'bold');  doc.text('Vormonat:',    col3, y);
        doc.setFont('helvetica', 'normal'); doc.text(`${carryMin >= 0 ? '+' : '-'}${fmtMin(carryMin)} h`, col3 + 24, y);
        y += 7;

        doc.setFont('helvetica', 'bold'); doc.text('Saldo:', col1, y);
        if (diffMin !== null) {
            doc.setTextColor(diffMin > 0 ? 45 : diffMin < 0 ? 180 : 0, diffMin > 0 ? 122 : diffMin < 0 ? 50 : 0, 0);
            doc.text(`${diffMin >= 0 ? '+' : '-'}${fmtMin(diffMin)} h`, col1 + 28, y);
            doc.setTextColor(0);
        } else {
            doc.setFont('helvetica', 'normal'); doc.text('–', col1 + 28, y);
        }

        y = Math.max(y + 20, 240);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setDrawColor(150);
        doc.line(marginL, y, marginL + 70, y);
        doc.line(pageW - marginR - 70, y, pageW - marginR, y);
        doc.setTextColor(130);
        doc.text('Datum, Unterschrift Mitarbeiter',  marginL, y + 5);
        doc.text('Datum, Unterschrift Vorgesetzter', pageW - marginR - 70, y + 5);
        doc.setTextColor(0);
    });

    doc.save(`Stundenkonto_${monthStr}.pdf`);
}
