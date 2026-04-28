// ── URLAUBSANTRÄGE (ADMIN) ────────────────────────────────

async function loadAdminVacations() {
    const { data: vacations } = await db
        .from('vacation_requests')
        .select('*, employees_planit(name)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: false });

    const container = document.getElementById('admin-vacation-list');
    if (!vacations || vacations.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Anträge vorhanden.</p></div>';
        return;
    }

    const today    = new Date().toISOString().split('T')[0];
    const current  = vacations.filter(v => v.end_date >= today || v.status === 'pending');
    const archived = vacations.filter(v => v.end_date < today && v.status !== 'pending');

    const renderItem = v => `
        <div class="list-item">
            <div class="list-item-info">
                <h4>${v.employees_planit?.name || 'Unbekannt'}</h4>
                <p>${v.type === 'payout' ? `Erstellt am ${formatDate(v.start_date)}` : `${formatDate(v.start_date)} – ${formatDate(v.end_date)}`}</p>
${v.reason ? `<p style="font-size:0.8rem;">${v.reason}</p>` : ''}
${v.status === 'approved' ? `<p style="font-size:0.8rem; color:var(--color-primary);">${v.type === 'payout' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#B28A6E"><ellipse cx="12" cy="15" rx="8" ry="7"/><path d="M9 8 C9 5 15 5 15 8" /><path d="M10 8 Q12 6 14 8" fill="none" stroke="#B28A6E" stroke-width="1.5"/><text x="12" y="17" text-anchor="middle" font-size="7" fill="white" font-weight="bold">€</text></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#B28A6E"><path d="M12 3 C7 3 3 7 3 12 L12 12 Z"/><path d="M12 3 C17 3 21 7 21 12 L12 12 Z" opacity="0.6"/><rect x="11.5" y="12" width="1" height="9" rx="0.5"/><ellipse cx="12" cy="21.5" rx="3" ry="0.8"/></svg>'} ${(Math.round((v.deducted_days || 0) * 100) / 100).toFixed(2)} ${v.type === 'payout' ? 'Urlaubstage ausgezahlt' : 'Urlaubstage abgezogen'}${v.payout_month ? ` · ${v.payout_month}` : ''}</p>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:0.4rem; align-items:flex-end;">
                <span class="badge badge-${v.status}">
                    ${v.status === 'pending' ? 'Ausstehend' : v.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
                </span>
                ${v.status === 'pending' ? `
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn-small btn-approve" onclick="reviewVacation('${v.id}', 'approved')">✓</button>
                        <button class="btn-small btn-reject"  onclick="reviewVacation('${v.id}', 'rejected')">✕</button>
                    </div>
                ` : `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.3rem;">
                        <button class="btn-small btn-pdf-view btn-icon" onclick="editVacation('${v.id}', '${v.start_date}', '${v.end_date}', ${v.deducted_days || 0}, '${v.type || 'vacation'}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        ${v.pdf_url ? `<button class="btn-small btn-pdf-view btn-icon" onclick="downloadVacationPdf('${v.pdf_url}')"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` : '<div></div>'}
                        ${v.pdf_url ? `<button class="btn-small btn-pdf-view btn-icon" onclick="saveVacationPdf('${v.pdf_url}')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : '<div></div>'}
                        <button class="btn-small btn-delete btn-icon" onclick="deleteVacation('${v.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                    </div>
                `}
            </div>
        </div>`;

    let html = current.length > 0
        ? current.map(renderItem).join('')
        : '<div class="empty-state"><p>Keine aktuellen Anträge.</p></div>';

    if (archived.length > 0) {
        const byYear = {};
        archived.forEach(v => {
            const year = new Date(v.start_date).getFullYear();
            if (!byYear[year]) byYear[year] = [];
            byYear[year].push(v);
        });
        const archiveHtml = Object.keys(byYear).sort((a, b) => b - a).map(year => `
            <div style="margin-bottom:1rem;">
                <div style="font-size:0.8rem; font-weight:700; color:var(--color-text-light); margin-bottom:0.5rem;">${year}</div>
                ${byYear[year].map(renderItem).join('')}
            </div>`).join('');
        html += `
        <div style="margin-top:1.5rem;">
            <button onclick="toggleVacationArchive()" style="background:none; border:none; cursor:pointer; font-size:0.85rem; color:var(--color-text-light); display:flex; align-items:center; gap:0.5rem; padding:0;">
                <span id="archive-toggle-icon">▶</span> Archiv (${archived.length} Anträge)
            </button>
            <div id="vacation-archive" style="display:none; margin-top:0.75rem;">
                ${archiveHtml}
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

function toggleVacationArchive() {
    const archive = document.getElementById('vacation-archive');
    const icon    = document.getElementById('archive-toggle-icon');
    if (archive.style.display === 'none') {
        archive.style.display = 'block';
        icon.textContent = '▼';
    } else {
        archive.style.display = 'none';
        icon.textContent = '▶';
    }
}

async function saveVacationPdf(filePath) {
    const { data, error } = await db.storage.from('vacation-pdfs').createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) { alert('PDF konnte nicht geladen werden.'); return; }
    const response = await fetch(data.signedUrl);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `Urlaubsantrag_${filePath.split('/').pop()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
}

async function downloadVacationPdf(filePath) {
    const { data, error } = await db.storage.from('vacation-pdfs').createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) { alert('PDF konnte nicht geladen werden.'); return; }
    window.location.href = data.signedUrl;
}

async function deleteVacation(id) {
    if (!confirm('Urlaubsantrag wirklich löschen?')) return;
    const { error } = await db.from('vacation_requests').delete().eq('id', id);
    if (!error) await loadAdminVacations();
}

// ── GENEHMIGEN / ABLEHNEN ─────────────────────────────────

let rejectVacationId = null;
let editVacationId   = null;

function openRejectModal(id) {
    rejectVacationId = id;
    document.getElementById('reject-reason').value = '';
    document.getElementById('reject-modal').classList.add('open');
}

function closeRejectModal() {
    document.getElementById('reject-modal').classList.remove('open');
    rejectVacationId = null;
}

async function submitReject() {
    const reason = document.getElementById('reject-reason').value.trim();
    if (!reason) { alert('Bitte Grund eingeben.'); return; }
    const { data: vac } = await db.from('vacation_requests').select('employee_id').eq('id', rejectVacationId).maybeSingle();
    await db.from('vacation_requests').update({
        status: 'rejected',
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminSession.user.id
    }).eq('id', rejectVacationId);
    if (vac?.employee_id) sendPushNotification('Urlaubsantrag', 'Dein Urlaubsantrag wurde leider abgelehnt.', vac.employee_id);
    closeRejectModal();
    await loadAdminVacations();
}

async function reviewVacation(id, status) {
    if (status === 'rejected') { openRejectModal(id); return; }
    const { data: vac } = await db.from('vacation_requests').select('*').eq('id', id).maybeSingle();
    if (!vac) return;
    if (!vac.deducted_days || vac.deducted_days === 0) { editVacationAndApprove(vac); return; }
    await db.from('vacation_requests').update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminSession.user.id
    }).eq('id', id);
    if (vac.employee_id) sendPushNotification('Urlaubsantrag', 'Dein Urlaubsantrag wurde genehmigt! 🎉', vac.employee_id);
    await loadAdminVacations();
}

const approveVacation = id => reviewVacation(id, 'approved');
const rejectVacation  = id => reviewVacation(id, 'rejected');

function editVacationAndApprove(vac) {
    editVacationId = vac.id;
    editVacationApproveAfter = true;
    const isPayout = vac.type === 'payout';
    document.getElementById('edit-vacation-date-fields').style.display        = isPayout ? 'none'  : 'block';
    document.getElementById('edit-vacation-days-field').style.display         = isPayout ? 'none'  : 'block';
    document.getElementById('edit-vacation-payout-month-field').style.display = isPayout ? 'block' : 'none';
    document.getElementById('edit-vacation-start').value  = vac.start_date;
    document.getElementById('edit-vacation-end').value    = vac.end_date;
    document.getElementById('edit-vacation-days').value   = vac.deducted_days || 0;
    document.getElementById('edit-vacation-hours').value  = vac.deducted_hours ?? '';
    document.getElementById('edit-vacation-modal').classList.add('active');
}

function editVacation(id, startDate, endDate, deductedDays, type) {
    editVacationId = id;
    const isPayout = type === 'payout';
    document.getElementById('edit-vacation-date-fields').style.display        = isPayout ? 'none'  : 'block';
    document.getElementById('edit-vacation-days-field').style.display         = isPayout ? 'none'  : 'block';
    document.getElementById('edit-vacation-payout-month-field').style.display = isPayout ? 'block' : 'none';
    document.getElementById('edit-vacation-start').value        = startDate;
    document.getElementById('edit-vacation-end').value          = endDate;
    document.getElementById('edit-vacation-days').value         = deductedDays;
    document.getElementById('edit-vacation-hours').value        = '';
    document.getElementById('edit-vacation-payout-month').value = '';
    document.getElementById('edit-vacation-modal').classList.add('active');
}

function closeEditVacationModal() {
    document.getElementById('edit-vacation-modal').classList.remove('active');
}

async function submitEditVacation() {
    const start    = document.getElementById('edit-vacation-start').value;
    const end      = document.getElementById('edit-vacation-end').value;
    const rawValue = parseFloat(document.getElementById('edit-vacation-days').value) || 0;

    const { data: vac } = await db
        .from('vacation_requests')
        .select('type, employee_id, employees_planit(hours_per_vacation_day)')
        .eq('id', editVacationId)
        .maybeSingle();

    const isPayout      = vac?.type === 'payout';
    const hoursPerDay   = vac?.employees_planit?.hours_per_vacation_day || 8.0;
    const payoutMonth   = document.getElementById('edit-vacation-payout-month').value.trim() || null;
    const hoursRaw      = document.getElementById('edit-vacation-hours').value;
    const deductedHours = hoursRaw !== '' ? parseFloat(hoursRaw) : null;
    const days          = isPayout ? (deductedHours != null ? deductedHours / hoursPerDay : rawValue) : rawValue;

    const updateData = {
        start_date: start,
        end_date: end,
        deducted_days: days,
        deducted_hours: deductedHours,
        ...(isPayout && payoutMonth ? { payout_month: payoutMonth } : {})
    };

    const approving = editVacationApproveAfter;
    if (approving) {
        updateData.status      = 'approved';
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = adminSession.user.id;
        editVacationApproveAfter = false;
    }

    const { error } = await db.from('vacation_requests').update(updateData).eq('id', editVacationId);
    if (!error) {
        if (approving && vac?.employee_id) sendPushNotification('Urlaubsantrag', 'Dein Urlaubsantrag wurde genehmigt! 🎉', vac.employee_id);
        closeEditVacationModal();
        await loadAdminVacations();
    }
}

// ── ALLE URLAUBSANTRÄGE EXPORTIEREN ───────────────────────

async function downloadAllVacations() {
    const { data: vacations } = await db
        .from('vacation_requests')
        .select('*, employees_planit(name)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: false });

    if (!vacations || vacations.length === 0) { alert('Keine Anträge vorhanden.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Alle Urlaubsanträge', 20, 20);

    let y = 35;
    vacations.forEach(v => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(v.employees_planit?.name || 'Unbekannt', 20, y);
        doc.setFont('helvetica', 'normal');
        doc.text(`${formatDate(v.start_date)} – ${formatDate(v.end_date)}`, 70, y);
        const status = v.status === 'pending' ? 'Ausstehend' : v.status === 'approved' ? 'Genehmigt' : 'Abgelehnt';
        doc.text(status, 160, y);
        y += 10;
    });

    doc.save('Urlaubsantraege.pdf');
}

// ── URLAUBSKALENDER (ADMIN) ───────────────────────────────

let adminVacCalDate = new Date();

async function loadAdminVacationCalendar() {
    const year     = adminVacCalDate.getFullYear();
    const month    = adminVacCalDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni',
                        'Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('admin-vac-cal-month-label').textContent = `${monthNames[month]} ${year}`;

    const firstDay = `${monthStr}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

    const { data: all } = await db.from('vacation_requests')
        .select('*, employees_planit(name, department)')
        .eq('user_id', adminSession.user.id)
        .eq('status', 'approved')
        .or(`and(type.neq.payout,start_date.lte.${lastDay},end_date.gte.${firstDay}),and(type.eq.payout,payout_month.eq.${monthStr})`);

    renderAdminVacationCalendar(year, month, all || []);
}

function goldGradient(n) {
    const shades = ['#C9A24D','#B8913C','#DAB35E','#A8803B','#EBC46F','#987030','#F0C47A'];
    if (n === 1) return shades[0];
    const stops = [];
    for (let i = 0; i < n; i++) {
        const pct1 = (i / n * 100).toFixed(2);
        const pct2 = ((i + 1) / n * 100).toFixed(2);
        const c = shades[i % shades.length];
        stops.push(`${c} ${pct1}%`, `${c} ${pct2}%`);
    }
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

function showVacDayModal(dateStr, dayVacations) {
    const [y, , d] = dateStr.split('-');
    const date = new Date(dateStr + 'T12:00:00');
    const dayNames   = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('vac-day-modal-title').textContent =
        `${dayNames[date.getDay()]}, ${parseInt(d)}. ${monthNames[date.getMonth()]} ${y}`;
    const typeLabel = t => t === 'payout' ? 'Auszahlung' : t === 'manual' ? 'Manuell' : 'Urlaub';
    const typeBg    = t => t === 'payout' ? '#FFF3CC' : t === 'manual' ? '#E8D0FF' : '#D8F0D8';
    const typeColor = t => t === 'payout' ? '#C9A24D'  : t === 'manual' ? '#9B59B6'  : '#4CAF50';
    document.getElementById('vac-day-modal-body').innerHTML = dayVacations.map(v => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid var(--color-border);">
            <span style="font-weight:600;">${v.employees_planit?.name || '—'}</span>
            <span style="font-size:0.75rem; padding:2px 8px; border-radius:6px; background:${typeBg(v.type)}; color:${typeColor(v.type)};">${typeLabel(v.type)}</span>
        </div>`).join('');
    document.getElementById('vac-day-modal').classList.add('active');
}

function closeVacDayModal() {
    document.getElementById('vac-day-modal').classList.remove('active');
}

function renderAdminVacationCalendar(year, month, vacations) {
    const container = document.getElementById('admin-vac-calendar');
    container.innerHTML = '';

    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
        const h = document.createElement('div');
        h.className = 'calendar-day-header';
        h.textContent = d;
        grid.appendChild(h);
    });

    for (let i = 0; i < offset; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    const holidays = getBWHolidays(year);
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayVacations = vacations.filter(v => v.type !== 'payout' && v.start_date <= dateStr && v.end_date >= dateStr);
        const isHoliday    = holidays.includes(dateStr);

        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day' + (isHoliday ? ' holiday' : '');

        const numEl = document.createElement('span');
        numEl.textContent = d;
        numEl.style.fontSize = '0.8rem';
        dayEl.appendChild(numEl);

        if (dayVacations.length > 0) {
            dayEl.style.background = goldGradient(dayVacations.length);
            dayEl.style.color = 'white';
            numEl.style.color = 'white';
            dayEl.classList.add('has-vacation');
            dayEl.onclick = () => showVacDayModal(dateStr, dayVacations);
        }

        grid.appendChild(dayEl);
    }

    container.appendChild(grid);

    if (vacations.length > 0) {
        const fmtShort  = d => { const p = d.split('-'); return `${parseInt(p[2])}.${parseInt(p[1])}.`; };
        const typeLabel = t => t === 'payout' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#B28A6E"><ellipse cx="12" cy="15" rx="8" ry="7"/><path d="M9 8 C9 5 15 5 15 8" /><path d="M10 8 Q12 6 14 8" fill="none" stroke="#B28A6E" stroke-width="1.5"/><text x="12" y="17" text-anchor="middle" font-size="7" fill="white" font-weight="bold">€</text></svg>' : t === 'manual' ? '✏️' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#B28A6E"><path d="M12 3 C7 3 3 7 3 12 L12 12 Z"/><path d="M12 3 C17 3 21 7 21 12 L12 12 Z" opacity="0.6"/><rect x="11.5" y="12" width="1" height="9" rx="0.5"/><ellipse cx="12" cy="21.5" rx="3" ry="0.8"/></svg>';
        const depts = [...new Set(vacations.map(v => v.employees_planit?.department || 'Allgemein'))].sort();
        const listEl = document.createElement('div');
        listEl.style.marginTop = '1rem';
        depts.forEach(dept => {
            const deptVacs = vacations
                .filter(v => (v.employees_planit?.department || 'Allgemein') === dept)
                .sort((a, b) => a.start_date.localeCompare(b.start_date));
            const section = document.createElement('div');
            section.style.marginBottom = '0.75rem';
            section.innerHTML = `<div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.05em; margin-bottom:0.35rem;">${dept.toUpperCase()}</div>` +
                deptVacs.map(v => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-bottom:1px solid var(--color-border); font-size:0.85rem;">
                        <span>${typeLabel(v.type)} <strong>${v.employees_planit?.name || '—'}</strong></span>
                        <span style="color:var(--color-text-light);">${v.type === 'manual' ? fmtShort(v.start_date) : `${fmtShort(v.start_date)} – ${fmtShort(v.end_date)}`}</span>
                    </div>`).join('');
            listEl.appendChild(section);
        });
        container.appendChild(listEl);
    }
}

function changeAdminVacCalMonth(dir) {
    adminVacCalDate.setMonth(adminVacCalDate.getMonth() + dir);
    loadAdminVacationCalendar();
}

// ── BADGE ─────────────────────────────────────────────────

async function loadUrlaubBadge() {
    const { data } = await db
        .from('vacation_requests')
        .select('id')
        .eq('user_id', adminSession.user.id)
        .eq('status', 'pending');

    const badge = document.getElementById('urlaub-badge');
    if (!badge) return;
    if (data && data.length > 0) {
        badge.textContent = data.length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

// ── URLAUBSVERWALTUNG (KONTEN) ────────────────────────────

function _cutoffChangeHandler(e) {
    const input = e.target;
    if (input.dataset && input.dataset.empid) updateEmpAccount(input.dataset.empid);
}

async function loadUrlaubsverwaltung() {
    document.getElementById('urlaubsverwaltung-year-label').textContent = urlaubYear;
    const fromYearEl = document.getElementById('carry-over-from-year');
    const toYearEl   = document.getElementById('carry-over-to-year');
    if (fromYearEl) fromYearEl.textContent = urlaubYear;
    if (toYearEl)   toYearEl.textContent   = urlaubYear + 1;

    const year = urlaubYear;
    const container = document.getElementById('urlaubsverwaltung-list');
    container.innerHTML = '<div style="color:var(--color-text-light);">Wird geladen...</div>';

    const [
        { data: freshEmps },
        { data: allPhases },
        { data: vacations },
        { data: allShifts },
        { data: terminations }
    ] = await Promise.all([
        db.from('employees_planit').select('*').eq('user_id', adminSession.user.id).eq('is_active', true).order('name'),
        db.from('employment_phases').select('*').eq('user_id', adminSession.user.id).order('start_date'),
        db.from('vacation_requests').select('*, employees_planit(name)').eq('user_id', adminSession.user.id).eq('status', 'approved').gte('start_date', `${year}-01-01`).lte('end_date', `${year}-12-31`),
        db.from('shifts').select('employee_id, start_time, end_time, break_minutes, actual_start_time, actual_end_time, actual_break_minutes').eq('user_id', adminSession.user.id).gte('shift_date', `${year}-01-01`).lte('shift_date', `${year}-12-31`).not('employee_id', 'is', null),
        db.from('planit_terminations').select('employee_id, requested_date').eq('user_id', adminSession.user.id).eq('status', 'approved'),
    ]);

    _terminationDates = {};
    (terminations || []).forEach(t => { _terminationDates[t.employee_id] = t.requested_date; });

    container.innerHTML = '';
    container.removeEventListener('change', _cutoffChangeHandler);
    container.addEventListener('change', _cutoffChangeHandler);

    (freshEmps || []).forEach(emp => {
        const block = document.createElement('div');
        block.style.cssText = 'border-radius:14px; margin-bottom:1rem; overflow:hidden; background:var(--color-gray);';

        const empPhases         = (allPhases || []).filter(p => p.employee_id === emp.id);
        const terminationCutoff = _terminationDates[emp.id] || null;
        const account           = calculateVacationAccount(emp, year, vacations || [], [], empPhases, terminationCutoff);
        const empVacations      = (vacations || []).filter(v => v.employee_id === emp.id).sort((a, b) => a.start_date.localeCompare(b.start_date));
        vacationExplainData[emp.id] = { emp, account, phases: empPhases, vacations: empVacations, year };

        const empShifts = (allShifts || []).filter(s => s.employee_id === emp.id);
        let avgShiftText = '';
        if (empShifts.length > 0) {
            const totalMin = empShifts.reduce((sum, s) => {
                const startStr = s.actual_start_time || s.start_time;
                const endStr   = s.actual_end_time   || s.end_time;
                const brk      = s.actual_break_minutes ?? s.break_minutes ?? 0;
                const [sh, sm] = startStr.split(':').map(Number);
                const [eh, em] = endStr.split(':').map(Number);
                return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - brk);
            }, 0);
            const avgMin = Math.round(totalMin / empShifts.length);
            const avgH   = Math.floor(avgMin / 60);
            const avgM   = avgMin % 60;
            avgShiftText = ` | Ø ${avgH}h${avgM > 0 ? ` ${avgM}m` : ''} (${empShifts.length} Schichten)`;
        }

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:1rem 1.25rem; cursor:pointer;';
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.75rem;">
                <div>
                    <div style="font-weight:700; font-size:1rem;">${emp.name}</div>
                    <div style="font-size:0.8rem; color:var(--color-text-light);">${emp.department || 'Allgemein'}</div>
                </div>
                ${emp.is_apprentice ? '<span style="background:#E8D0FF; color:#9B59B6; font-size:0.7rem; padding:2px 6px; border-radius:8px;">Azubi</span>' : ''}
            </div>
            <div style="display:flex; align-items:center; gap:1rem;">
                <div style="text-align:right;">
                    <div style="font-size:0.75rem; color:var(--color-text-light);">ÜBRIG</div>
                    <div style="font-weight:700; color:${account.remaining <= 3 ? '#E57373' : account.remaining <= 7 ? '#C9A24D' : 'var(--color-primary)'};">${account.remaining.toFixed(2)} Tage</div>
                </div>
                <span id="toggle-${emp.id}" style="color:var(--color-text-light); font-size:0.85rem;">▶</span>
            </div>`;

        const body = document.createElement('div');
        body.id = `urlaubsbody-${emp.id}`;
        body.style.cssText = 'display:none; padding:1rem 1.25rem; border-top:1px solid var(--color-border); background:white;';
        body.innerHTML = `
            <div class="form-group">
                <label>Anspruch bis${terminationCutoff ? ' <span style="font-size:0.78rem; background:#E6F4E6; color:#2d7a2d; border-radius:6px; padding:1px 6px; vertical-align:middle;">Kündigung genehmigt</span>' : ''}</label>
                <input type="date" id="cutoff-${emp.id}" value="${terminationCutoff || `${year}-12-31`}" data-empid="${emp.id}"${terminationCutoff ? ' disabled' : ''}>
            </div>
            <div id="account-boxes-${emp.id}">${buildAccountBoxesHtml(emp.id, account)}</div>
            ${empPhases.length > 0
                ? empPhases.map(p => {
                    const fmt = d => { const parts = d.split('-'); return `${parts[2]}.${parts[1]}.${parts[0].slice(2)}`; };
                    return `<div style="font-size:0.8rem; color:var(--color-text-light); margin-bottom:0.25rem;">Std. pro UT: ${p.hours_per_vacation_day}h (${fmt(p.start_date)} – ${p.end_date ? fmt(p.end_date) : 'offen'})${p.notes ? ` · ${p.notes}` : ''}${avgShiftText}</div>`;
                }).join('')
                : `<div style="font-size:0.8rem; color:var(--color-text-light); margin-bottom:0.25rem;">Std. pro UT: ${emp.hours_per_vacation_day || 8.0}h${avgShiftText}</div>`
            }
            <div style="font-size:0.8rem; color:var(--color-text-light); margin-bottom:1rem;">Eintrittsdatum: ${emp.start_date ? formatDate(emp.start_date) : '–'}</div>
            <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.5rem;">Einträge ${year}:</div>
            <div id="eintraege-${emp.id}">
                ${(vacations || []).filter(v => v.employee_id === emp.id).length === 0
                    ? '<div style="color:var(--color-text-light); font-size:0.85rem; margin-bottom:0.75rem;">Keine Einträge</div>'
                    : (vacations || []).filter(v => v.employee_id === emp.id)
                        .sort((a, b) => a.start_date.localeCompare(b.start_date))
                        .map(v => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--color-border); font-size:0.85rem;">
                                <div>
                                    <span style="display:inline-block; font-size:0.7rem; padding:1px 6px; border-radius:6px; margin-right:0.4rem; background:${v.type === 'payout' ? '#FFF3CC' : v.type === 'manual' ? '#E8D0FF' : '#D8F0D8'}; color:${v.type === 'payout' ? '#C9A24D' : v.type === 'manual' ? '#9B59B6' : '#4CAF50'};">${v.type === 'payout' ? 'Auszahlung' : v.type === 'manual' ? 'Manuell' : 'Urlaub'}</span>
                                    <span>${v.type === 'manual' ? formatDate(v.start_date) : formatDate(v.start_date) + ' – ' + formatDate(v.end_date)}</span>
                                    ${v.reason ? `<div style="font-size:0.75rem; color:var(--color-text-light);">${v.reason}</div>` : ''}
                                </div>
                                <span style="font-weight:600; white-space:nowrap; text-align:right;">
                                    ${(Math.round((v.deducted_days || 0) * 100) / 100).toFixed(2)} Tage
                                    ${v.deducted_hours != null ? `<div style="font-size:0.75rem; color:var(--color-text-light); font-weight:400;">${v.deducted_hours} Std</div>` : v.type === 'payout' ? `<div style="font-size:0.75rem; color:var(--color-text-light); font-weight:400;">${((v.deducted_days || 0) * (emp.hours_per_vacation_day || 8)).toFixed(1)} Std</div>` : ''}
                                </span>
                            </div>`).join('')
                }
            </div>
            <button onclick="showAddEintragForm('${emp.id}', ${emp.hours_per_vacation_day || 8.0})" style="margin-top:0.75rem; width:100%; padding:0.6rem; border:2px dashed var(--color-border); border-radius:8px; background:transparent; color:var(--color-text-light); font-size:0.85rem; cursor:pointer;">+ Eintrag hinzufügen</button>
            <div id="eintrag-form-${emp.id}" style="display:none; margin-top:0.75rem; background:#F5F5F5; border-radius:8px; padding:0.75rem;">
                <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.5rem;">Neuer Eintrag</div>
                <select id="eintrag-type-${emp.id}" style="width:100%; padding:0.5rem; border-radius:8px; border:1px solid var(--color-border); margin-bottom:0.5rem; font-size:0.85rem;">
                    <option value="vacation">Urlaub genommen</option>
                    <option value="payout">Auszahlung</option>
                    <option value="manual">Manuelle Korrektur</option>
                </select>
                <input type="date" id="eintrag-date-${emp.id}" style="width:100%; padding:0.5rem; border-radius:8px; border:1px solid var(--color-border); margin-bottom:0.5rem; font-size:0.85rem; box-sizing:border-box;">
                <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
                    <input type="number" id="eintrag-hours-${emp.id}" placeholder="Stunden" step="0.25" min="0" style="flex:1; padding:0.5rem; border-radius:8px; border:1px solid var(--color-border); font-size:0.85rem;" oninput="syncEintragDays('${emp.id}', ${emp.hours_per_vacation_day || 8.0})">
                    <input type="number" id="eintrag-days-${emp.id}"  placeholder="Tage"    step="0.01" min="0" style="flex:1; padding:0.5rem; border-radius:8px; border:1px solid var(--color-border); font-size:0.85rem;" oninput="syncEintragHours('${emp.id}', ${emp.hours_per_vacation_day || 8.0})">
                </div>
                <input type="text" id="eintrag-comment-${emp.id}" placeholder="Kommentar (optional)" style="width:100%; padding:0.5rem; border-radius:8px; border:1px solid var(--color-border); margin-bottom:0.5rem; font-size:0.85rem; box-sizing:border-box;">
                <div style="display:flex; gap:0.5rem;">
                    <button onclick="saveEintrag('${emp.id}')"         style="flex:1; padding:0.6rem; background:var(--color-primary); color:white; border:none; border-radius:8px; font-size:0.85rem; cursor:pointer;">Speichern</button>
                    <button onclick="hideAddEintragForm('${emp.id}')" style="flex:1; padding:0.6rem; background:#F5F5F5; color:var(--color-text); border:1px solid var(--color-border); border-radius:8px; font-size:0.85rem; cursor:pointer;">Abbrechen</button>
                </div>
            </div>`;

        header.onclick = () => {
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            document.getElementById(`toggle-${emp.id}`).textContent = isOpen ? '▶' : '▼';
        };

        block.appendChild(header);
        block.appendChild(body);
        container.appendChild(block);
    });
}

function showAddEintragForm(empId, hoursPerDay) {
    document.getElementById(`eintrag-form-${empId}`).style.display = 'block';
    document.getElementById(`eintrag-date-${empId}`).value = new Date().toISOString().split('T')[0];
}

function hideAddEintragForm(empId) {
    document.getElementById(`eintrag-form-${empId}`).style.display = 'none';
}

function syncEintragDays(empId, hoursPerDay) {
    const hours = parseFloat(document.getElementById(`eintrag-hours-${empId}`).value) || 0;
    document.getElementById(`eintrag-days-${empId}`).value = (hours / hoursPerDay).toFixed(2);
}

function syncEintragHours(empId, hoursPerDay) {
    const days = parseFloat(document.getElementById(`eintrag-days-${empId}`).value) || 0;
    document.getElementById(`eintrag-hours-${empId}`).value = (days * hoursPerDay).toFixed(2);
}

async function saveEintrag(empId) {
    const type    = document.getElementById(`eintrag-type-${empId}`).value;
    const date    = document.getElementById(`eintrag-date-${empId}`).value;
    const days    = parseFloat(document.getElementById(`eintrag-days-${empId}`).value) || 0;
    const comment = document.getElementById(`eintrag-comment-${empId}`).value.trim();

    if (!date || days <= 0) { alert('Bitte Datum und Stunden/Tage eingeben.'); return; }

    const { error } = await db.from('vacation_requests').insert({
        user_id: adminSession.user.id,
        employee_id: empId,
        start_date: date,
        end_date: date,
        status: 'approved',
        type,
        deducted_days: days,
        reason: comment || null
    });

    if (error) { alert('Fehler beim Speichern.'); return; }
    hideAddEintragForm(empId);
    loadUrlaubsverwaltung();
}

function changeUrlaubYear(dir) {
    urlaubYear += dir;
    loadUrlaubsverwaltung();
}

function buildAccountBoxesHtml(empId, account) {
    const remColor = account.remaining <= 3 ? '#E57373' : 'var(--color-primary)';
    return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem;">
        <div class="info-box-clickable" style="background:#F5F5F5;" onclick="showVacationExplain('${empId}', 'jahresanspruch')">
            <div style="font-size:0.75rem; color:var(--color-text-light);">Jahresanspruch ⓘ</div>
            <div style="font-weight:700;">${account.entitlement.toFixed(2)} Tage</div>
            <div style="font-size:0.75rem; color:var(--color-text-light);">${account.entitlementH.toFixed(2)} Std</div>
        </div>
        <div class="info-box-clickable" style="background:#F5F5F5;" onclick="showVacationExplain('${empId}', 'carryover')">
            <div style="font-size:0.75rem; color:var(--color-text-light);">Übertrag Vorjahr ⓘ</div>
            <div style="font-weight:700;">${account.carryover.toFixed(2)} Tage</div>
            <div style="font-size:0.75rem; color:var(--color-text-light);">${account.carryoverH.toFixed(2)} Std</div>
        </div>
        <div class="info-box-clickable" style="background:#F5F5F5;" onclick="showVacationExplain('${empId}', 'genommen')">
            <div style="font-size:0.75rem; color:var(--color-text-light);">Genommen ⓘ</div>
            <div style="font-weight:700;">${account.used.toFixed(2)} Tage</div>
            <div style="font-size:0.75rem; color:var(--color-text-light);">${account.usedH.toFixed(2)} Std</div>
        </div>
        <div class="info-box-clickable" style="background:#F5F5F5;" onclick="showVacationExplain('${empId}', 'uebrig')">
            <div style="font-size:0.75rem; color:var(--color-text-light);">Übrig ⓘ</div>
            <div style="font-weight:700; color:${remColor};">${account.remaining.toFixed(2)} Tage</div>
            <div style="font-size:0.75rem; color:var(--color-text-light);">${account.remainingH.toFixed(2)} Std</div>
        </div>
    </div>`;
}

function updateEmpAccount(empId) {
    const d = vacationExplainData[empId];
    if (!d) return;
    const cutoff = _terminationDates[empId] || document.getElementById(`cutoff-${empId}`)?.value || `${d.year}-12-31`;
    const account = calculateVacationAccount(d.emp, d.year, d.vacations, [], d.phases, cutoff);
    vacationExplainData[empId].account = account;
    document.getElementById(`account-boxes-${empId}`).innerHTML = buildAccountBoxesHtml(empId, account);
}

function showVacationExplain(empId, type) {
    const d = vacationExplainData[empId];
    if (!d) return;
    const { emp, account, phases, vacations, year } = d;
    const daysInYear = ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
    const yearStart  = `${year}-01-01`;
    const yearEnd    = `${year}-12-31`;
    const fmt = dateStr => { const p = dateStr.split('-'); return `${p[2]}.${p[1]}.${p[0].slice(2)}`; };

    let title = '', body = '';

    if (type === 'jahresanspruch') {
        title = 'Jahresanspruch – Berechnung';
        const totalDaysPerYear = emp.vacation_days_per_year ?? 20;
        if (phases.length > 0) {
            body = phases.map(p => {
                const phaseStart  = new Date(Math.max(new Date(p.start_date + 'T12:00:00'), new Date(yearStart + 'T12:00:00')));
                const phaseEnd    = new Date(Math.min(p.end_date ? new Date(p.end_date + 'T12:00:00') : new Date(yearEnd + 'T12:00:00'), new Date(yearEnd + 'T12:00:00')));
                const daysInPhase = Math.round((phaseEnd - phaseStart) / 86400000) + 1;
                const phaseDays   = p.hours_per_vacation_day === 0 ? 0 : Math.round((daysInPhase / daysInYear) * totalDaysPerYear * 100) / 100;
                return `<div style="padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
                    <span style="color:var(--color-text-light);">${fmt(phaseStart.toISOString().split('T')[0])} – ${fmt(phaseEnd.toISOString().split('T')[0])}</span><br>
                    ${daysInPhase} / ${daysInYear} Tage × ${totalDaysPerYear} = <strong>${phaseDays.toFixed(2)} Tage</strong>
                    <span style="color:var(--color-text-light); font-size:0.8rem;">(${p.hours_per_vacation_day} Std/UT${p.notes ? ' · ' + p.notes : ''})</span>
                </div>`;
            }).join('');
        } else {
            const anteilig = emp.start_date && new Date(emp.start_date + 'T12:00:00').getFullYear() === year
                ? ` (anteilig ab ${fmt(emp.start_date)})` : '';
            body = `<div>${totalDaysPerYear} Tage/Jahr${anteilig}</div>`;
        }
        body += `<div style="margin-top:0.75rem; font-weight:700;">Gesamt: ${account.entitlement.toFixed(2)} Tage / ${account.entitlementH.toFixed(2)} Std</div>`;

    } else if (type === 'carryover') {
        title = 'Übertrag Vorjahr';
        body  = `<div style="display:grid; grid-template-columns:auto 1fr; gap:0.25rem 1rem;">
            <span style="color:var(--color-text-light);">Tage</span><strong>${account.carryover.toFixed(2)}</strong>
            <span style="color:var(--color-text-light);">Stunden</span><strong>${account.carryoverH.toFixed(2)}</strong>
        </div>
        <div style="margin-top:0.75rem; font-size:0.8rem; color:var(--color-text-light);">Werte aus Mitarbeiter-Stammdaten (carry_over_days / carry_over_hours) — direkt addiert, keine Umrechnung.</div>`;

    } else if (type === 'genommen') {
        title = 'Genommen – Einträge';
        if (vacations.length === 0) {
            body = '<div style="color:var(--color-text-light);">Keine Einträge.</div>';
        } else {
            body = vacations.map(v => {
                const typeLabel = v.type === 'payout' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#B28A6E"><ellipse cx="12" cy="15" rx="8" ry="7"/><path d="M9 8 C9 5 15 5 15 8" /><path d="M10 8 Q12 6 14 8" fill="none" stroke="#B28A6E" stroke-width="1.5"/><text x="12" y="17" text-anchor="middle" font-size="7" fill="white" font-weight="bold">€</text></svg>' : v.type === 'manual' ? '✏️' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#B28A6E"><path d="M12 3 C7 3 3 7 3 12 L12 12 Z"/><path d="M12 3 C17 3 21 7 21 12 L12 12 Z" opacity="0.6"/><rect x="11.5" y="12" width="1" height="9" rx="0.5"/><ellipse cx="12" cy="21.5" rx="3" ry="0.8"/></svg>';
                const hrs = v.deducted_hours != null ? ` / ${v.deducted_hours} Std` : '';
                return `<div style="display:flex; justify-content:space-between; align-items:baseline; padding:0.35rem 0; border-bottom:1px solid var(--color-border); font-size:0.85rem;">
                    <span>${typeLabel} ${fmt(v.start_date)}${v.reason ? ' · ' + v.reason : ''}</span>
                    <span style="font-weight:600; margin-left:0.5rem; white-space:nowrap;">${(Math.round((v.deducted_days || 0) * 100) / 100).toFixed(2)} T${hrs}</span>
                </div>`;
            }).join('');
            body += `<div style="margin-top:0.75rem; font-weight:700;">Gesamt: ${account.used.toFixed(2)} Tage / ${account.usedH.toFixed(2)} Std</div>`;
        }

    } else if (type === 'uebrig') {
        title = 'Übrig – Formel';
        const remColor = account.remaining <= 3 ? '#E57373' : 'var(--color-primary)';
        body  = `<div style="display:grid; grid-template-columns:auto 1fr auto; gap:0.35rem 0.75rem; align-items:baseline;">
            <span style="color:var(--color-text-light);">Jahresanspruch</span><span></span><span><strong>${account.entitlement.toFixed(2)} T</strong> / ${account.entitlementH.toFixed(2)} Std</span>
            <span style="color:var(--color-text-light);">+ Übertrag</span><span></span><span><strong>${account.carryover.toFixed(2)} T</strong> / ${account.carryoverH.toFixed(2)} Std</span>
            <span style="color:var(--color-text-light);">− Genommen</span><span></span><span><strong>${account.used.toFixed(2)} T</strong> / ${account.usedH.toFixed(2)} Std</span>
        </div>
        <div style="margin-top:0.75rem; padding-top:0.6rem; border-top:2px solid var(--color-border); font-weight:700; font-size:1.05rem; color:${remColor};">
            = ${account.remaining.toFixed(2)} Tage / ${account.remainingH.toFixed(2)} Std
        </div>`;
    }

    document.getElementById('vacation-explain-title').textContent = title;
    document.getElementById('vacation-explain-body').innerHTML     = body;
    document.getElementById('vacation-explain-modal').classList.add('active');
}

function closeVacationExplainModal() {
    document.getElementById('vacation-explain-modal').classList.remove('active');
}

function calculateVacationAccount(emp, year, vacations, _prevVacations, phases = [], cutoffDate = null) {
    if (year < 2026) {
        return { entitlement: 0, carryover: 0, used: 0, remaining: 0, entitlementH: 0, carryoverH: 0, usedH: 0, remainingH: 0 };
    }

    const yearStart    = `${year}-01-01`;
    const yearEnd      = cutoffDate || `${year}-12-31`;
    const activePhases = phases.filter(p => p.start_date <= yearEnd && (!p.end_date || p.end_date >= yearStart));

    let entitlement = 0, entitlementH = 0;

    if (activePhases.length > 0) {
        for (const phase of activePhases) {
            const phaseStart = new Date(Math.max(new Date(phase.start_date + 'T12:00:00'), new Date(yearStart + 'T12:00:00')));
            const phaseEnd   = new Date(Math.min(
                phase.end_date ? new Date(phase.end_date + 'T12:00:00') : new Date(yearEnd + 'T12:00:00'),
                new Date(yearEnd + 'T12:00:00')
            ));
            const totalDaysPerYear = emp.vacation_days_per_year ?? 20;
            const monthlyDays = totalDaysPerYear / 12;
            let phaseDays = 0;
            const startMonth = phaseStart.getMonth();
            const endMonth   = phaseEnd.getMonth();
            for (let m = startMonth; m <= endMonth; m++) {
                const daysInMonth = new Date(year, m + 1, 0).getDate();
                const firstDay = m === startMonth ? phaseStart.getDate() : 1;
                const lastDay  = m === endMonth   ? phaseEnd.getDate()   : daysInMonth;
                phaseDays += monthlyDays * ((lastDay - firstDay + 1) / daysInMonth);
            }
            if (phase.hours_per_vacation_day === 0) phaseDays = 0;
            entitlement  += phaseDays;
            entitlementH += phaseDays * (phase.hours_per_vacation_day || 0);
        }
    } else {
        const totalDays   = emp.vacation_days_per_year ?? 20;
        const hoursPerDay = emp.hours_per_vacation_day || 8.0;
        const monthlyDays = totalDays / 12;
        const cutoffEnd   = new Date(yearEnd + 'T12:00:00');
        if (emp.start_date) {
            const start = new Date(emp.start_date + 'T12:00:00');
            if (start.getFullYear() > year) {
                entitlement = 0;
            } else {
                const fromMonth = start.getFullYear() === year ? start.getMonth() : 0;
                const fromDay   = start.getFullYear() === year ? start.getDate()  : 1;
                const toMonth   = cutoffEnd.getMonth();
                const toDay     = cutoffEnd.getDate();
                for (let m = fromMonth; m <= toMonth; m++) {
                    const daysInMonth = new Date(year, m + 1, 0).getDate();
                    const firstDay = m === fromMonth ? fromDay : 1;
                    const lastDay  = m === toMonth   ? toDay   : daysInMonth;
                    entitlement += monthlyDays * ((lastDay - firstDay + 1) / daysInMonth);
                }
            }
        } else {
            const toMonth = cutoffEnd.getMonth();
            const toDay   = cutoffEnd.getDate();
            for (let m = 0; m <= toMonth; m++) {
                const daysInMonth = new Date(year, m + 1, 0).getDate();
                const lastDay = m === toMonth ? toDay : daysInMonth;
                entitlement += monthlyDays * (lastDay / daysInMonth);
            }
        }
        entitlementH = entitlement * hoursPerDay;
    }

    const empVacations = vacations.filter(v => v.employee_id === emp.id && v.start_date <= yearEnd);
    const used  = empVacations.reduce((sum, v) => sum + (v.deducted_days || 0), 0);
    const usedH = empVacations.reduce((sum, v) => {
        if (v.deducted_hours != null) return sum + v.deducted_hours;
        const date  = v.start_date;
        const phase = phases.find(p => p.start_date <= date && (!p.end_date || p.end_date >= date));
        const hpd   = phase ? (phase.hours_per_vacation_day || 0) : (emp.hours_per_vacation_day || 8.0);
        return sum + (v.deducted_days || 0) * hpd;
    }, 0);

    const r2 = v => Math.round(v * 100) / 100;
    const entitlementR  = r2(entitlement);
    const entitlementHR = r2(entitlementH);
    const usedR  = r2(used);
    const usedHR = r2(usedH);
    const carryover  = r2(emp.carry_over_days  || 0);
    const carryoverH = r2(emp.carry_over_hours || 0);
    const remaining  = r2(entitlementR  + carryover  - usedR);
    const remainingH = r2(entitlementHR + carryoverH - usedHR);
    return { entitlement: entitlementR, carryover, used: usedR, remaining, entitlementH: entitlementHR, carryoverH, usedH: usedHR, remainingH };
}

// ── OFFENE SCHICHTEN – ANFRAGEN ───────────────────────────

async function loadRequests() {
    const { data: openShifts } = await db
        .from('shifts')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .eq('is_open', true)
        .order('shift_date');

    const { data: requests } = await db
        .from('open_shift_requests')
        .select('*, employees_planit(name, department)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: false });

    const { data: allEmployees } = await db
        .from('employees_planit')
        .select('id, name, department')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true);

    const container = document.getElementById('requests-list');

    if (!openShifts || openShifts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine offenen Schichten.</p></div>';
        return;
    }

    const html = openShifts.map(shift => {
        const date = new Date(shift.shift_date + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
        const time = `${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)} Uhr`;
        const dept = shift.department || 'Allgemein';

        const deptEmployees = (allEmployees || []).filter(e => (e.department || 'Allgemein') === dept);
        const shiftRequests = (requests || []).filter(r => r.shift_id === shift.id);

        const employeeRows = deptEmployees.map(emp => {
            const req = shiftRequests.find(r => r.employee_id === emp.id);
            let statusHtml = '<span style="color:#aaa; font-size:0.8rem;">— noch keine Antwort</span>';
            let actionHtml = '';

            if (req) {
                if (req.status === 'yes') {
                    statusHtml = '<span style="color:#4CAF50; font-weight:600;">✅ Ja</span>';
                    actionHtml = `<button class="btn-primary" style="padding:0.25rem 0.75rem; font-size:0.8rem;" onclick="approveRequest('${req.id}', '${shift.id}', '${emp.id}')">Einteilen</button>`;
                } else if (req.status === 'no') {
                    statusHtml = '<span style="color:#E57373; font-weight:600;">❌ Nein</span>';
                } else if (req.status === 'approved') {
                    statusHtml = '<span style="color:#4CAF50; font-weight:600;">✅ Eingeteilt</span>';
                } else if (req.status === 'rejected') {
                    statusHtml = '<span style="color:#aaa; font-weight:600;">Abgelehnt</span>';
                } else if (req.status === 'pending') {
                    statusHtml = '<span style="color:#C9A24D; font-weight:600;">⏳ Ausstehend</span>';
                }
            }

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid var(--color-border);">
                    <span style="font-size:0.9rem;">${emp.name}</span>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        ${statusHtml}
                        ${actionHtml}
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="card" style="margin-bottom:1rem;">
                <div style="font-weight:700; margin-bottom:0.25rem;">${date} · ${dept}</div>
                <div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.75rem;">${time}</div>
                ${employeeRows || '<div style="color:#aaa; font-size:0.85rem;">Keine Mitarbeiter in dieser Abteilung.</div>'}
            </div>`;
    }).join('');

    container.innerHTML = html;
}

async function approveRequest(requestId, shiftId, employeeId) {
    const [{ data: shift }, { data: otherRequests }] = await Promise.all([
        db.from('shifts').select('shift_date').eq('id', shiftId).maybeSingle(),
        db.from('open_shift_requests').select('employee_id').eq('shift_id', shiftId).neq('id', requestId).eq('status', 'yes'),
    ]);

    const { error: shiftError } = await db.from('shifts').update({ employee_id: employeeId, is_open: false }).eq('id', shiftId);
    if (shiftError) { alert('Fehler!'); return; }
    await db.from('open_shift_requests').update({ status: 'approved' }).eq('id', requestId);
    await db.from('open_shift_requests').update({ status: 'rejected' }).eq('shift_id', shiftId).neq('id', requestId);

    const dateLabel = shift?.shift_date ? formatDate(shift.shift_date) : '';
    sendPushNotification('Schicht zugewiesen', `Schicht am ${dateLabel} — du bist eingeteilt! ✅`, employeeId);
    for (const req of (otherRequests || [])) {
        sendPushNotification('Offene Schicht', `Schicht am ${dateLabel} ist bereits besetzt.`, req.employee_id);
    }

    await loadRequests();
    await loadWeekGrid();
    alert('Schicht wurde zugewiesen!');
}

async function rejectRequest(requestId) {
    await db.from('open_shift_requests').update({ status: 'rejected' }).eq('id', requestId);
    await loadRequests();
}

async function loadRequestsBadge() {
    const { data } = await db
        .from('open_shift_requests')
        .select('id')
        .eq('status', 'pending');

    const badge = document.getElementById('requests-badge');
    if (!badge) return;
    if (data && data.length > 0) {
        badge.textContent = data.length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

async function loadRequestsStats() {
    const month = parseInt(document.getElementById('stats-month')?.value || '0');
    const year  = parseInt(document.getElementById('stats-year')?.value  || new Date().getFullYear());

    const { data: allEmployees } = await db
        .from('employees_planit')
        .select('id, name, department')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true)
        .order('name');

    let query = db.from('open_shift_requests').select('employee_id, status, created_at').eq('user_id', adminSession.user.id);

    if (month > 0) {
        const from = `${year}-${String(month).padStart(2, '0')}-01`;
        const to   = `${year}-${String(month).padStart(2, '0')}-31`;
        query = query.gte('created_at', from).lte('created_at', to);
    } else {
        query = query.gte('created_at', `${year}-01-01`).lte('created_at', `${year}-12-31`);
    }

    const { data: requests } = await query;
    if (!allEmployees || allEmployees.length === 0) return;

    const stats = allEmployees.map(emp => {
        const empRequests = (requests || []).filter(r => r.employee_id === emp.id);
        const total   = empRequests.filter(r => ['yes','no','approved','rejected'].includes(r.status)).length;
        const yes     = empRequests.filter(r => r.status === 'yes' || r.status === 'approved').length;
        const percent = total > 0 ? Math.round((yes / total) * 100) : null;
        return { ...emp, total, yes, percent };
    });

    stats.sort((a, b) => {
        if (a.percent === null && b.percent === null) return 0;
        if (a.percent === null) return 1;
        if (b.percent === null) return -1;
        return b.percent - a.percent;
    });

    const html = stats.map(s => {
        const barColor    = s.percent === null ? '#ddd' : s.percent >= 70 ? '#4CAF50' : s.percent >= 40 ? '#C9A24D' : '#E57373';
        const percentText = s.percent !== null ? `${s.percent}%` : '—';
        const subText     = s.total > 0 ? `${s.yes} von ${s.total} Mal Ja gesagt` : 'Noch keine Anfragen';
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid var(--color-border);">
                <div>
                    <div style="font-weight:600; font-size:0.9rem;">${s.name}</div>
                    <div style="font-size:0.78rem; color:var(--color-text-light);">${subText}</div>
                </div>
                <div style="font-size:1.1rem; font-weight:700; color:${barColor}; min-width:2.5rem; text-align:right;">${percentText}</div>
            </div>`;
    }).join('');

    document.getElementById('requests-stats').innerHTML = html;
}
