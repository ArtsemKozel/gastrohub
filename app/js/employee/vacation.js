// ── URLAUBS-STATE ─────────────────────────────────────────
let vacCalDate    = new Date();
let _vacEmp       = null;
let _vacPhases    = null;
let _vacRequests  = null;
let _vacYear      = new Date().getFullYear();
let _vacLastAccount = null;
let signaturePad  = null;

// ── URLAUBSKALENDER ───────────────────────────────────────
async function loadVacationCalendar() {
    const year     = vacCalDate.getFullYear();
    const month    = vacCalDate.getMonth();
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni',
                        'Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('vac-cal-month-label').textContent = `${monthNames[month]} ${year}`;

    const firstDay = `${monthStr}-01`;
    const lastDay  = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;

    const { data: all } = await db.from('vacation_requests')
        .select('*, employees_planit(name, department)')
        .eq('user_id', currentEmployee.user_id)
        .eq('status', 'approved')
        .or(`and(type.neq.payout,start_date.lte.${lastDay},end_date.gte.${firstDay}),and(type.eq.payout,payout_month.eq.${monthStr})`);

    renderVacationCalendar(year, month, all || []);
}

function renderVacationCalendar(year, month, vacations) {
    const container = document.getElementById('vac-calendar');
    container.innerHTML = '';

    const myDept = currentEmployee.department || 'Allgemein';
    const visible = vacations.filter(v =>
        v.employee_id === currentEmployee.id ||
        (v.employees_planit?.department || 'Allgemein') === myDept
    );

    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const offset       = firstWeekday === 0 ? 6 : firstWeekday - 1;

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
        const dateStr     = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayVacs     = visible.filter(v => v.type !== 'payout' && v.start_date <= dateStr && v.end_date >= dateStr);
        const isHoliday   = holidays.includes(dateStr);
        const dayEl       = document.createElement('div');
        dayEl.className   = 'calendar-day' + (isHoliday ? ' holiday' : '');

        const numEl = document.createElement('span');
        numEl.textContent = d;
        numEl.style.fontSize = '0.8rem';
        dayEl.appendChild(numEl);

        if (dayVacs.length > 0) {
            dayEl.style.background = goldGradient(dayVacs.length);
            dayEl.style.color = 'white';
            numEl.style.color = 'white';
            dayEl.classList.add('has-vacation');
            dayEl.onclick = () => showEmpVacDayModal(dateStr, dayVacs);
        }

        grid.appendChild(dayEl);
    }

    container.appendChild(grid);

    if (visible.length > 0) {
        const fmtShort  = d => { const p = d.split('-'); return `${parseInt(p[2])}.${parseInt(p[1])}.`; };
        const typeLabel = t => t === 'payout' ? '💰' : t === 'manual' ? '✏️' : '🏖';
        const listEl    = document.createElement('div');
        listEl.style.marginTop = '1rem';
        const sorted = [...visible].sort((a, b) => a.start_date.localeCompare(b.start_date));
        listEl.innerHTML = sorted.map(v => {
            const name = v.employee_id === currentEmployee.id ? 'Ich' : (v.employees_planit?.name || '—');
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-bottom:1px solid var(--color-border); font-size:0.85rem;">
                <span>${typeLabel(v.type)} <strong>${name}</strong></span>
                <span style="color:var(--color-text-light);">${v.type === 'manual' ? fmtShort(v.start_date) : `${fmtShort(v.start_date)} – ${fmtShort(v.end_date)}`}</span>
            </div>`;
        }).join('');
        container.appendChild(listEl);
    }
}

function changeVacCalMonth(dir) {
    vacCalDate.setMonth(vacCalDate.getMonth() + dir);
    loadVacationCalendar();
}

// ── TAG-MODAL ─────────────────────────────────────────────
function showEmpVacDayModal(dateStr, dayVacations) {
    const [y, , d]   = dateStr.split('-');
    const date       = new Date(dateStr + 'T12:00:00');
    const dayNames   = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    document.getElementById('emp-vac-day-modal-title').textContent =
        `${dayNames[date.getDay()]}, ${parseInt(d)}. ${monthNames[date.getMonth()]} ${y}`;

    const typeLabel = t => t === 'payout' ? 'Auszahlung' : t === 'manual' ? 'Manuell' : 'Urlaub';
    const typeBg    = t => t === 'payout' ? '#FFF3CC' : t === 'manual' ? '#E8D0FF' : '#D8F0D8';
    const typeColor = t => t === 'payout' ? '#C9A24D' : t === 'manual' ? '#9B59B6' : '#4CAF50';

    document.getElementById('emp-vac-day-modal-body').innerHTML = dayVacations.map(v => {
        const name = v.employee_id === currentEmployee.id ? 'Ich' : (v.employees_planit?.name || '—');
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0; border-bottom:1px solid var(--color-border);">
            <span style="font-weight:600;">${name}</span>
            <span style="font-size:0.75rem; padding:2px 8px; border-radius:6px; background:${typeBg(v.type)}; color:${typeColor(v.type)};">${typeLabel(v.type)}</span>
        </div>`;
    }).join('');

    document.getElementById('emp-vac-day-modal').classList.add('active');
}

function closeEmpVacDayModal() {
    document.getElementById('emp-vac-day-modal').classList.remove('active');
}

// ── URLAUBSLISTE ──────────────────────────────────────────
async function loadVacations() {
    const { data: vacations } = await db
        .from('vacation_requests')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .order('created_at', { ascending: false });

    const container = document.getElementById('vacation-list');

    if (!vacations || vacations.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Anträge vorhanden.</p></div>';
        return;
    }

    container.innerHTML = vacations.map(v => `
        <div class="list-item">
            <div class="list-item-info">
                <h4>${formatDate(v.start_date)} – ${formatDate(v.end_date)}</h4>
                <p>${v.reason || 'Kein Grund angegeben'}</p>
                ${v.status === 'rejected' && v.rejection_reason
                    ? `<p style="color:var(--color-red); font-size:0.85rem; margin-top:0.3rem;">Grund: ${v.rejection_reason}</p>`
                    : ''}
            </div>
            <span class="badge badge-${v.status}">
                ${v.status === 'pending' ? 'Ausstehend' : v.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
            </span>
        </div>
    `).join('');
}

// ── URLAUBSKONTO ──────────────────────────────────────────
async function loadVacationAccount() {
    _vacYear = new Date().getFullYear();
    document.getElementById('vacation-year-label').textContent = _vacYear;

    const [{ data: emp }, { data: phases }, { data: requests }] = await Promise.all([
        db.from('employees_planit')
            .select('vacation_days_per_year, start_date, hours_per_vacation_day, carry_over_days, carry_over_hours')
            .eq('id', currentEmployee.id).maybeSingle(),
        db.from('employment_phases')
            .select('*')
            .eq('employee_id', currentEmployee.id)
            .order('start_date'),
        db.from('vacation_requests')
            .select('deducted_days, deducted_hours, start_date, type')
            .eq('employee_id', currentEmployee.id)
            .eq('status', 'approved')
            .gte('start_date', `${_vacYear}-01-01`)
            .lte('start_date', `${_vacYear}-12-31`),
    ]);

    _vacEmp      = emp;
    _vacPhases   = phases || [];
    _vacRequests = requests || [];

    const cutoffEl = document.getElementById('vac-cutoff');
    cutoffEl.value    = `${_vacYear}-12-31`;
    cutoffEl.disabled = false;

    renderVacationAccount(`${_vacYear}-12-31`);
}

async function renderVacationAccount(cutoffDate) {
    if (!_vacEmp && !_vacPhases) return;

    const { data: termination } = await db.from('planit_terminations')
        .select('approved_date')
        .eq('employee_id', currentEmployee.id)
        .eq('status', 'approved')
        .limit(1).maybeSingle();

    const cutoffEl = document.getElementById('vac-cutoff');
    if (termination?.approved_date) {
        cutoffDate        = termination.approved_date;
        cutoffEl.value    = termination.approved_date;
        cutoffEl.disabled = true;
    } else {
        cutoffEl.disabled = false;
    }

    const year       = _vacYear;
    const yearStart  = `${year}-01-01`;
    const yearEnd    = cutoffDate || `${year}-12-31`;
    const totalDays  = _vacEmp?.vacation_days_per_year ?? 20;
    const hoursPerDay = _vacEmp?.hours_per_vacation_day || 8.0;
    const monthlyDays = totalDays / 12;

    let entitlement = 0;
    let entitlementH = 0;

    const activePhases = _vacPhases.filter(p =>
        p.start_date <= yearEnd && (!p.end_date || p.end_date >= yearStart)
    );

    if (activePhases.length > 0) {
        for (const phase of activePhases) {
            const phaseStart = new Date(Math.max(
                new Date(phase.start_date + 'T12:00:00'),
                new Date(yearStart + 'T12:00:00')
            ));
            const phaseEnd = new Date(Math.min(
                phase.end_date ? new Date(phase.end_date + 'T12:00:00') : new Date(yearEnd + 'T12:00:00'),
                new Date(yearEnd + 'T12:00:00')
            ));
            const phaseMonthlyDays = totalDays / 12;
            let phaseDays = 0;
            for (let m = phaseStart.getMonth(); m <= phaseEnd.getMonth(); m++) {
                const daysInMonth = new Date(year, m + 1, 0).getDate();
                const firstDay = m === phaseStart.getMonth() ? phaseStart.getDate() : 1;
                const lastDay  = m === phaseEnd.getMonth()   ? phaseEnd.getDate()   : daysInMonth;
                phaseDays += phaseMonthlyDays * ((lastDay - firstDay + 1) / daysInMonth);
            }
            if (phase.hours_per_vacation_day === 0) phaseDays = 0;
            entitlement  += phaseDays;
            entitlementH += phaseDays * (phase.hours_per_vacation_day || 0);
        }
    } else {
        const cutoffEnd = new Date(yearEnd + 'T12:00:00');
        if (_vacEmp?.start_date) {
            const start = new Date(_vacEmp.start_date + 'T12:00:00');
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

    const carryover  = _vacEmp?.carry_over_days  || 0;
    const carryoverH = _vacEmp?.carry_over_hours || 0;

    const usedEntries = _vacRequests.filter(r => r.start_date <= yearEnd);
    const usedDays    = usedEntries.reduce((sum, r) => sum + (r.deducted_days || 0), 0);
    const usedH       = usedEntries.reduce((sum, r) => {
        if (r.deducted_hours != null) return sum + r.deducted_hours;
        const phase = _vacPhases.find(p => p.start_date <= r.start_date && (!p.end_date || p.end_date >= r.start_date));
        const hpd   = phase ? (phase.hours_per_vacation_day || 0) : hoursPerDay;
        return sum + (r.deducted_days || 0) * hpd;
    }, 0);

    const remaining  = entitlement  + carryover  - usedDays;
    const remainingH = entitlementH + carryoverH - usedH;

    _vacLastAccount = { entitlement, entitlementH, carryover, carryoverH,
        used: usedDays, usedH, remaining, remainingH, usedEntries, activePhases, yearEnd, year };

    const fmt2 = v => v.toFixed(2);
    const sub  = v => `<span style="font-size:0.75rem; color:var(--color-text-light);">${v}</span>`;

    document.getElementById('vacation-account').style.color =
        remaining <= 3 ? '#E57373' : remaining <= 7 ? '#C9A24D' : 'var(--color-primary)';
    document.getElementById('vac-entitlement').innerHTML =
        `${fmt2(entitlement)} Tage<br>${sub(fmt2(entitlementH) + ' Std')}`;
    document.getElementById('vac-carryover').innerHTML =
        `${fmt2(carryover)} Tage<br>${sub(fmt2(carryoverH) + ' Std')}`;
    document.getElementById('vac-used-detail').innerHTML =
        `${fmt2(usedDays)} Tage<br>${sub(fmt2(usedH) + ' Std')}`;
    document.getElementById('vac-remaining-detail').innerHTML =
        `${fmt2(remaining)} Tage<br>${sub(fmt2(remainingH) + ' Std')}`;

    const phasesInfo = document.getElementById('vac-phases-info');
    if (activePhases.length > 0) {
        const fmt = d => { const p = d.split('-'); return `${p[2]}.${p[1]}.${p[0].slice(2)}`; };
        phasesInfo.innerHTML = activePhases.map(p =>
            `Std. pro UT: ${p.hours_per_vacation_day}h (${fmt(p.start_date)} – ${p.end_date ? fmt(p.end_date) : 'offen'})${p.notes ? ` · ${p.notes}` : ''}`
        ).join('<br>');
    } else {
        phasesInfo.innerHTML = `Std. pro UT: ${hoursPerDay}h`;
    }
}

// ── ERKLÄRUNGS-MODAL ──────────────────────────────────────
function showVacExplain(type) {
    const d = _vacLastAccount;
    if (!d) return;
    const fmt = dateStr => { const p = dateStr.split('-'); return `${p[2]}.${p[1]}.${p[0].slice(2)}`; };
    const f2  = v => v.toFixed(2);

    let title = '', body = '';

    if (type === 'jahresanspruch') {
        title = 'Jahresanspruch – Berechnung';
        const totalDaysPerYear = _vacEmp?.vacation_days_per_year ?? 20;
        const yearStart = `${d.year}-01-01`;
        const yearEnd   = d.yearEnd;
        if (d.activePhases.length > 0) {
            body = d.activePhases.map(p => {
                const phaseStart = new Date(Math.max(new Date(p.start_date + 'T12:00:00'), new Date(yearStart + 'T12:00:00')));
                const phaseEnd   = new Date(Math.min(
                    p.end_date ? new Date(p.end_date + 'T12:00:00') : new Date(yearEnd + 'T12:00:00'),
                    new Date(yearEnd + 'T12:00:00')
                ));
                const mDays = totalDaysPerYear / 12;
                let phaseDays = 0;
                for (let m = phaseStart.getMonth(); m <= phaseEnd.getMonth(); m++) {
                    const dim   = new Date(d.year, m + 1, 0).getDate();
                    const first = m === phaseStart.getMonth() ? phaseStart.getDate() : 1;
                    const last  = m === phaseEnd.getMonth()   ? phaseEnd.getDate()   : dim;
                    phaseDays += mDays * ((last - first + 1) / dim);
                }
                if (p.hours_per_vacation_day === 0) phaseDays = 0;
                return `<div style="padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
                    <span style="color:var(--color-text-light);">${fmt(phaseStart.toISOString().split('T')[0])} – ${fmt(phaseEnd.toISOString().split('T')[0])}</span><br>
                    ${totalDaysPerYear}/12 × Tage = <strong>${f2(phaseDays)} Tage</strong>
                    <span style="color:var(--color-text-light); font-size:0.8rem;">(${p.hours_per_vacation_day} Std/UT${p.notes ? ' · ' + p.notes : ''})</span>
                </div>`;
            }).join('');
        } else {
            const anteilig = _vacEmp?.start_date && new Date(_vacEmp.start_date + 'T12:00:00').getFullYear() === d.year
                ? ` (anteilig ab ${fmt(_vacEmp.start_date)})` : '';
            body = `<div>${totalDaysPerYear} Tage/Jahr${anteilig}</div>`;
        }
        body += `<div style="margin-top:0.75rem; font-weight:700;">Gesamt: ${f2(d.entitlement)} Tage / ${f2(d.entitlementH)} Std</div>`;

    } else if (type === 'carryover') {
        title = 'Übertrag Vorjahr';
        body  = `<div style="display:grid; grid-template-columns:auto 1fr auto; gap:0.25rem 1rem;">
            <span style="color:var(--color-text-light);">Tage</span><span></span><strong>${f2(d.carryover)}</strong>
            <span style="color:var(--color-text-light);">Stunden</span><span></span><strong>${f2(d.carryoverH)}</strong>
        </div>
        <div style="margin-top:0.75rem; font-size:0.8rem; color:var(--color-text-light);">Werte aus Mitarbeiter-Stammdaten — direkt addiert, keine Umrechnung.</div>`;

    } else if (type === 'genommen') {
        title = 'Genommen – Einträge';
        if (!d.usedEntries.length) {
            body = '<div style="color:var(--color-text-light);">Keine Einträge.</div>';
        } else {
            body  = d.usedEntries.map(r => {
                const typeLabel = r.type === 'payout' ? '💰' : r.type === 'manual' ? '✏️' : '🏖';
                const hrs       = r.deducted_hours != null ? ` / ${r.deducted_hours} Std` : '';
                return `<div style="display:flex; justify-content:space-between; padding:0.35rem 0; border-bottom:1px solid var(--color-border); font-size:0.85rem;">
                    <span>${typeLabel} ${fmt(r.start_date)}</span>
                    <span style="font-weight:600;">${f2(Math.round((r.deducted_days||0)*100)/100)} T${hrs}</span>
                </div>`;
            }).join('');
            body += `<div style="margin-top:0.75rem; font-weight:700;">Gesamt: ${f2(d.used)} Tage / ${f2(d.usedH)} Std</div>`;
        }

    } else if (type === 'uebrig') {
        title = 'Übrig – Formel';
        const remColor = d.remaining <= 3 ? '#E57373' : 'var(--color-primary)';
        body  = `<div style="display:grid; grid-template-columns:auto 1fr auto; gap:0.35rem 0.75rem; align-items:baseline;">
            <span style="color:var(--color-text-light);">Jahresanspruch</span><span></span><span><strong>${f2(d.entitlement)} T</strong> / ${f2(d.entitlementH)} Std</span>
            <span style="color:var(--color-text-light);">+ Übertrag</span><span></span><span><strong>${f2(d.carryover)} T</strong> / ${f2(d.carryoverH)} Std</span>
            <span style="color:var(--color-text-light);">− Genommen</span><span></span><span><strong>${f2(d.used)} T</strong> / ${f2(d.usedH)} Std</span>
        </div>
        <div style="margin-top:0.75rem; padding-top:0.6rem; border-top:2px solid var(--color-border); font-weight:700; font-size:1.05rem; color:${remColor};">
            = ${f2(d.remaining)} Tage / ${f2(d.remainingH)} Std
        </div>`;
    }

    document.getElementById('vac-explain-title').textContent  = title;
    document.getElementById('vac-explain-body').innerHTML     = body;
    document.getElementById('vac-explain-modal').classList.add('active');
}

function closeVacExplainModal() {
    document.getElementById('vac-explain-modal').classList.remove('active');
}

function toggleVacationDetails() {
    const details = document.getElementById('vacation-details');
    const toggle  = document.getElementById('vacation-toggle');
    const isOpen  = details.style.display !== 'none';
    details.style.display = isOpen ? 'none' : 'block';
    toggle.textContent    = isOpen ? '▶' : '▼';
}

// ── ANTRAG MODAL ──────────────────────────────────────────
function openVacationModal() {
    document.getElementById('vacation-modal').classList.add('open');
    document.getElementById('vacation-error').style.display = 'none';
    initSignaturePad();
}

function closeVacationModal() {
    document.getElementById('vacation-modal').classList.remove('open');
}

function initSignaturePad() {
    const canvas = document.getElementById('signature-canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = canvas.offsetWidth;
    canvas.height = 120;
    let drawing = false;
    canvas.addEventListener('pointerdown', e => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); });
    canvas.addEventListener('pointerup',   () => drawing = false);
}

function clearSignature() {
    const canvas = document.getElementById('signature-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function toggleVacationFields() {
    const type = document.getElementById('vacation-type').value;
    document.getElementById('vacation-date-fields').style.display   = type === 'payout' ? 'none'  : 'block';
    document.getElementById('vacation-payout-fields').style.display = type === 'payout' ? 'block' : 'none';
}

async function submitVacation() {
    const type     = document.getElementById('vacation-type').value;
    const errorDiv = document.getElementById('vacation-error');
    errorDiv.style.display = 'none';

    let start, end, payoutHours;

    if (type === 'payout') {
        payoutHours = parseFloat(document.getElementById('vacation-payout-hours').value) || 0;
        if (payoutHours <= 0) {
            errorDiv.textContent   = 'Bitte Urlaubsstunden eingeben.';
            errorDiv.style.display = 'block';
            return;
        }
        const today = new Date().toISOString().split('T')[0];
        start = today;
        end   = today;
    } else {
        start = document.getElementById('vacation-start').value;
        end   = document.getElementById('vacation-end').value;
        if (!start || !end) {
            errorDiv.textContent   = 'Bitte Start- und Enddatum auswählen.';
            errorDiv.style.display = 'block';
            return;
        }
    }

    const { error } = await db.from('vacation_requests').insert({
        user_id:     currentEmployee.user_id,
        employee_id: currentEmployee.id,
        start_date:  start,
        end_date:    end,
        reason:      type === 'payout' ? `Auszahlung: ${payoutHours} Std` : null,
        status:      'pending',
        type:        type,
    });

    if (error) {
        errorDiv.textContent   = 'Fehler: ' + error.message;
        errorDiv.style.display = 'block';
        return;
    }

    // PDF generieren und in Storage ablegen
    const canvas    = document.getElementById('signature-canvas');
    let   signature = null;
    try { signature = canvas.toDataURL('image/png'); } catch(e) {}

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Urlaubsantrag', 20, 20);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('Mitarbeiter:',       20, 40); doc.setFont('helvetica', 'bold');
    doc.text(currentEmployee.name, 70, 40); doc.setFont('helvetica', 'normal');
    doc.text('Datum des Antrags:', 20, 52);
    doc.text(new Date().toLocaleDateString('de-DE'), 70, 52);
    doc.text('Art:', 20, 64);
    doc.text(type === 'payout' ? 'Auszahlung' : 'Urlaub', 70, 64);

    if (type === 'payout') {
        doc.text('Stunden:', 20, 76);
        doc.text(`${payoutHours} Std`, 70, 76);
        if (signature) { doc.text('Unterschrift:', 20, 100); doc.addImage(signature, 'PNG', 20, 105, 60, 25); }
    } else {
        doc.text('Von:', 20, 76); doc.text(formatDate(start), 70, 76);
        doc.text('Bis:', 20, 88); doc.text(formatDate(end),   70, 88);
        if (signature) { doc.text('Unterschrift:', 20, 122); doc.addImage(signature, 'PNG', 20, 127, 60, 25); }
    }

    const pdfBlob = doc.output('blob');
    const fileName = `${currentEmployee.user_id}/${currentEmployee.id}_${start}_${Date.now()}.pdf`;
    const { error: uploadError } = await db.storage
        .from('vacation-pdfs')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

    if (!uploadError) {
        const { data: latest } = await db
            .from('vacation_requests').select('id')
            .eq('employee_id', currentEmployee.id)
            .eq('start_date', start)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();
        if (latest) {
            await db.from('vacation_requests').update({ pdf_url: fileName }).eq('id', latest.id);
        }
    }

    doc.save(`Urlaubsantrag_${currentEmployee.name}_${start}.pdf`);
    closeVacationModal();
    setTimeout(() => loadVacations(), 500);
}
