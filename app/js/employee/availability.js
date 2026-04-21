// ── VERFÜGBARKEIT ─────────────────────────────────────────
let currentAvailDay = null;

async function renderAvailGrid(year, month) {
    const container = document.getElementById('avail-grid');
    container.innerHTML = '';

    // Urlaubstage laden (auch monatsübergreifende)
    const monthStart = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const monthEnd   = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;
    const { data: vacations } = await db
        .from('vacation_requests')
        .select('start_date, end_date')
        .eq('employee_id', currentEmployee.id)
        .eq('status', 'approved')
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;

    // Wochentag-Header
    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
        const h = document.createElement('div');
        h.className = 'calendar-day-header';
        h.textContent = d;
        container.appendChild(h);
    });

    // Leere Felder
    for (let i = 0; i < offset; i++) {
        const empty = document.createElement('div');
        empty.className = 'avail-day';
        empty.style.visibility = 'hidden';
        container.appendChild(empty);
    }

    // Tage
    for (let d = 1; d <= daysInMonth; d++) {
        const entry  = selectedAvailDays[d] || null;
        const status = entry ? entry.status : null;

        const div = document.createElement('div');
        div.className = 'avail-day';
        div.style.flexDirection = 'column';
        div.style.fontSize      = '0.75rem';
        div.style.gap           = '2px';

        const dateStr   = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isVacation = (vacations || []).some(v => v.start_date <= dateStr && v.end_date >= dateStr);

        if      (isVacation)          div.style.background = '#D0E8FF';
        else if (status === 'school') div.style.background = '#E8D0FF';
        else if (status === 'full')   div.style.background = '#D8F0D8';
        else if (status === 'partial')div.style.background = '#FFF3CC';
        else if (status === 'off')    div.style.background = '#FFD9D9';

        const timeHtml = (status === 'partial' && entry?.from)
            ? `<span style="font-size:0.6rem; line-height:1.2;">${entry.from}</span><span style="font-size:0.6rem; line-height:1.2;">${entry.to}</span>`
            : '';
        const commentTriangle = entry?.comment
            ? `<div style="position:absolute; top:0; left:0; width:0; height:0; border-top:8px solid #2C3E50; border-right:8px solid transparent;"></div>`
            : '';
        div.style.position = 'relative';
        div.innerHTML = `${commentTriangle}<span>${d}</span>${timeHtml}`;
        div.onclick = () => openAvailModal(d);
        container.appendChild(div);
    }
}

function openAvailModal(day) {
    currentAvailDay = day;
    document.getElementById('avail-modal-title').textContent = `${day}. – Verfügbarkeit`;
    document.getElementById('avail-time-fields').style.display = 'none';

    // Schule-Button nur für Azubis
    document.getElementById('avail-school-btn').style.display =
        currentEmployee.is_apprentice ? 'block' : 'none';

    // Bestehenden Kommentar laden
    const entry = selectedAvailDays[day];
    document.getElementById('avail-comment').value = entry?.comment || '';

    // Bestehende Zeiten laden falls partial
    if (entry?.status === 'partial' && entry.from) {
        document.getElementById('avail-time-fields').style.display = 'block';
        document.getElementById('avail-from').value = entry.from;
        document.getElementById('avail-to').value   = entry.to || '16:00';
    }

    document.getElementById('avail-modal').classList.add('open');
}

function closeAvailModal() {
    document.getElementById('avail-modal').classList.remove('open');
    currentAvailDay = null;
}

// Alias-Namen die im HTML per onclick verwendet werden können
function saveAvailFull()   { setAvailStatus('full'); }
function saveAvailOff()    { setAvailStatus('off'); }
function saveAvailSchool() { setAvailStatus('school'); }
function saveAvailPartial(){ setAvailStatus('partial'); }

function setAvailStatus(status) {
    // Alle Buttons zurücksetzen
    document.querySelectorAll('#avail-modal .btn-secondary').forEach(btn => {
        btn.style.outline = 'none';
    });

    // Gewählten Button markieren
    const colors = { full: '#a0c8a0', partial: '#d4c070', off: '#d4a0a0', school: '#c8a0e8' };
    if (event && event.currentTarget) {
        event.currentTarget.style.outline = `2px solid ${colors[status] || '#aaa'}`;
    }

    document.getElementById('avail-time-fields').style.display = status === 'partial' ? 'block' : 'none';
    document.getElementById('avail-confirm-btn').style.display = status === 'partial' ? 'none' : 'block';

    if (!selectedAvailDays[currentAvailDay]) selectedAvailDays[currentAvailDay] = {};
    selectedAvailDays[currentAvailDay].status = status;
}

async function confirmAvail() {
    const status  = selectedAvailDays[currentAvailDay]?.status;
    const comment = document.getElementById('avail-comment').value.trim();
    selectedAvailDays[currentAvailDay] = { status, ...(comment ? { comment } : {}) };
    await renderAvailGrid(availDate.getFullYear(), availDate.getMonth());
    closeAvailModal();
}

async function confirmPartialAvail() {
    const from    = document.getElementById('avail-from').value;
    const to      = document.getElementById('avail-to').value;
    const comment = document.getElementById('avail-comment').value.trim();
    selectedAvailDays[currentAvailDay] = { status: 'partial', from, to, ...(comment ? { comment } : {}) };
    await renderAvailGrid(availDate.getFullYear(), availDate.getMonth());
    closeAvailModal();
}

async function clearAvailDay() {
    delete selectedAvailDays[currentAvailDay];
    await renderAvailGrid(availDate.getFullYear(), availDate.getMonth());
    closeAvailModal();
}

async function loadAvailability() {
    const year  = availDate.getFullYear();
    const month = availDate.getMonth();
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni',
                        'Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('avail-month-label').textContent = `${monthNames[month]} ${year}`;

    const { data } = await db
        .from('availability')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .eq('month', monthStr)
        .maybeSingle();

    selectedAvailDays = (data && !Array.isArray(data.available_days)) ? data.available_days : {};
    await renderAvailGrid(year, month);
}

async function saveAvailability() {
    const year  = availDate.getFullYear();
    const month = availDate.getMonth();
    const monthStr = `${year}-${String(month+1).padStart(2,'0')}-01`;

    const { data: existing } = await db
        .from('availability')
        .select('id')
        .eq('employee_id', currentEmployee.id)
        .eq('month', monthStr)
        .maybeSingle();

    if (existing) {
        await db.from('availability').update({
            available_days: selectedAvailDays
        }).eq('id', existing.id);
    } else {
        await db.from('availability').insert({
            user_id:        currentEmployee.user_id,
            employee_id:    currentEmployee.id,
            month:          monthStr,
            available_days: selectedAvailDays
        });
    }
    alert('Verfügbarkeit gespeichert! ✅');
}

function changeAvailMonth(dir) {
    availDate.setMonth(availDate.getMonth() + dir);
    loadAvailability();
}
