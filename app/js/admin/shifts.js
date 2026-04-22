// ── WOCHENANSICHT ─────────────────────────────────────────
function getMonday(date) {
    const d   = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d;
}

function changeWeek(dir) {
    weekDate.setDate(weekDate.getDate() + dir * 7);
    loadWeekGrid();
}

async function togglePlanningMode() {
    planningMode = !planningMode;
    const btn  = document.getElementById('planning-mode-btn');
    const icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    btn.innerHTML        = `${icon} Planungsmodus: ${planningMode ? 'AN' : 'AUS'}`;
    btn.style.background = '#C9A24D';
    btn.style.color      = 'white';
    await loadWeekGrid();
}

async function loadAvailabilityForWeek(days) {
    if (!planningMode) return {};

    const months = [...new Set(days.map(d => {
        const y = d.getFullYear(), m = d.getMonth();
        return `${y}-${String(m+1).padStart(2,'0')}-01`;
    }))];

    const weekStart = days[0].toISOString().split('T')[0];
    const weekEnd   = days[days.length-1].toISOString().split('T')[0];

    const [{ data }, { data: vacations }] = await Promise.all([
        db.from('availability').select('employee_id, available_days, month')
            .eq('user_id', adminSession.user.id).in('month', months),
        db.from('vacation_requests').select('employee_id, start_date, end_date')
            .eq('user_id', adminSession.user.id).eq('status', 'approved')
            .lte('start_date', weekEnd).gte('end_date', weekStart),
    ]);

    const cache = {};
    (data || []).forEach(a => {
        if (!cache[a.employee_id]) cache[a.employee_id] = {};
        const monthDate = new Date(a.month);
        const monthNum  = monthDate.getMonth();
        const year      = monthDate.getFullYear();
        Object.entries(a.available_days || {}).forEach(([day, val]) => {
            const dateStr = `${year}-${String(monthNum+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            cache[a.employee_id][dateStr] = val;
        });
    });

    (vacations || []).forEach(v => {
        if (!cache[v.employee_id]) cache[v.employee_id] = {};
        days.forEach(d => {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (v.start_date <= dateStr && v.end_date >= dateStr)
                cache[v.employee_id][dateStr] = { status: 'vacation' };
        });
    });

    return cache;
}

async function loadWeekGrid() {
    const monday = getMonday(weekDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
    }

    document.getElementById('week-label').textContent =
        `${monday.toLocaleDateString('de-DE', {day:'numeric', month:'short'})} – ${sunday.toLocaleDateString('de-DE', {day:'numeric', month:'short', year:'numeric'})}`;

    const firstDay = monday.toISOString().split('T')[0];
    const lastDay  = sunday.toISOString().split('T')[0];

    const [{ data: shifts }, { data: sickLeaves }] = await Promise.all([
        db.from('shifts').select('*').eq('user_id', adminSession.user.id)
            .gte('shift_date', firstDay).lte('shift_date', lastDay),
        db.from('sick_leaves').select('employee_id, start_date, end_date')
            .eq('user_id', adminSession.user.id)
            .lte('start_date', lastDay).gte('end_date', firstDay),
    ]);

    const availCache = await loadAvailabilityForWeek(days);
    await renderWeekGrid(days, shifts || [], availCache, sickLeaves || []);
}

async function renderWeekGrid(days, shifts, availCache = {}, sickLeaves = []) {
    const grid = document.getElementById('week-grid');
    grid.innerHTML = '';

    const dayNames    = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    const weekHolidays = getBWHolidays(days[0].getFullYear());
    const monday      = days[0];
    const year        = monday.getFullYear();
    const month       = monday.getMonth() + 1;
    const monthStart  = `${year}-${String(month).padStart(2,'0')}-01`;
    const monthEnd    = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
    const kwNumber    = Math.ceil(((monday - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7);
    const monthNames  = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    const { data: monthShifts } = await db.from('shifts')
        .select('employee_id, start_time, end_time, break_minutes')
        .eq('user_id', adminSession.user.id).eq('is_open', false)
        .gte('shift_date', monthStart).lte('shift_date', monthEnd);

    const addDayHeaders = (labelText, dept) => {
        const deptLabel = document.createElement('div');
        deptLabel.style.cssText = 'grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; gap:0.5rem; font-weight:600; font-size:0.8rem; color:var(--color-primary); padding:0.75rem 0 0.25rem; border-top:2px solid var(--color-primary);';
        const trashSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
        deptLabel.innerHTML = `<span>${labelText}</span><button class="btn-small" onclick="event.stopPropagation(); _openDeptActionMenu(this, '${dept}')" style="padding:0.2rem 0.4rem; min-width:unset; height:1.6rem; display:flex; align-items:center; outline:none; background:#C9A24D; color:white;">${trashSvg}</button>`;
        grid.appendChild(deptLabel);

        const corner = document.createElement('div');
        corner.className = 'week-header';
        grid.appendChild(corner);
        days.forEach((d, i) => {
            const dateStr   = d.toISOString().split('T')[0];
            const isHoliday = weekHolidays.includes(dateStr);
            const header    = document.createElement('div');
            header.className = 'week-header';
            header.innerHTML = `${dayNames[i]}<br><small style="color:${isHoliday ? '#E07070' : 'inherit'};">${d.getDate()}.${d.getMonth()+1}.${isHoliday ? ' 🎌' : ''}</small>`;
            grid.appendChild(header);
        });
    };

    if (employees.length === 0) {
        const empty = document.createElement('div');
        empty.style.gridColumn = '1/-1';
        empty.className = 'empty-state';
        empty.innerHTML = '<p>Keine Mitarbeiter vorhanden.</p>';
        grid.appendChild(empty);
        return;
    }

    const departments = [...new Set(employees.flatMap(e => getEmpDepartments(e)))];

    departments.forEach(dept => {
        addDayHeaders(dept.toUpperCase(), dept);

        // Offene Schichten
        const deptOpenShifts = shifts.filter(s => s.is_open && s.department === dept);
        const openEmpCell    = document.createElement('div');
        openEmpCell.className        = 'week-employee';
        openEmpCell.style.color      = '#C97E7E';
        openEmpCell.style.fontWeight = '700';
        openEmpCell.textContent      = 'Offen';
        grid.appendChild(openEmpCell);

        days.forEach(d => {
            const dateStr = d.toISOString().split('T')[0];
            const shift   = deptOpenShifts.find(s => s.shift_date === dateStr);
            const cell    = document.createElement('div');
            cell.className        = 'week-cell' + (shift ? ' open-shift' : '');
            cell.textContent      = shift ? `${shift.start_time.slice(0,5)}\n${shift.end_time.slice(0,5)}` : '+';
            cell.style.whiteSpace = 'pre';
            cell.onclick = () => openShiftModal(null, dateStr, shift || null, dept, true);
            grid.appendChild(cell);
        });

        // Mitarbeiter-Zeilen
        const deptEmployees = employees.filter(e => getEmpDepartments(e).includes(dept));
        deptEmployees.forEach(emp => {
            const parts       = emp.name.trim().split(' ');
            const displayName = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
            const empCell     = document.createElement('div');
            empCell.className   = 'week-employee';
            empCell.textContent = displayName;
            grid.appendChild(empCell);

            days.forEach(d => {
                const dateStr = d.toISOString().split('T')[0];
                const shift   = shifts.find(s =>
                    s.employee_id === emp.id && s.shift_date === dateStr && !s.is_open &&
                    (s.department === dept || (!s.department && (emp.department || 'Allgemein') === dept))
                );
                const cell = document.createElement('div');
                cell.className        = 'week-cell' + (shift ? ' has-shift' : '');
                cell.style.whiteSpace = 'pre';
                cell.style.position   = 'relative';

                if (shift) {
                    cell.textContent = `${shift.start_time.slice(0,5)}\n${shift.end_time.slice(0,5)}`;
                    if (shift.actual_start_time) cell.style.background = '#E8D4A0';
                } else {
                    cell.textContent = '+';
                }

                if (planningMode && !shift) {
                    const entry  = (availCache[emp.id] || {})[dateStr];
                    const status = entry ? entry.status : null;
                    if      (status === 'vacation') cell.style.background = '#D0E8FF';
                    else if (status === 'school')   cell.style.background = '#E8D0FF';
                    else if (status === 'full')     cell.style.background = '#D8F0D8';
                    else if (status === 'partial') {
                        cell.style.background = '#FFF3CC';
                        if (entry.from && entry.to) {
                            cell.textContent      = `${entry.from.slice(0,5)}\n${entry.to.slice(0,5)}`;
                            cell.style.fontSize   = '0.65rem';
                        }
                    }
                    else if (status === 'off') cell.style.background = '#FFD9D9';
                }

                const isSick = sickLeaves.some(s => s.employee_id === emp.id && s.start_date <= dateStr && s.end_date >= dateStr);
                if (isSick && !shift) {
                    cell.style.background = '#FFE0CC';
                    cell.textContent      = 'Krank';
                    cell.style.color      = '#E07040';
                    cell.style.fontSize   = '0.7rem';
                }

                cell.dataset.cell  = `${emp.id}_${dateStr}`;
                cell.dataset.dept  = dept;
                if (shift) {
                    cell.dataset.shiftId = shift.id;
                    cell.dataset.origBg  = shift.actual_start_time ? '#E8D4A0' : '';
                }
                cell.onclick = () => openShiftModal(emp.id, dateStr, shift, dept);
                grid.appendChild(cell);
            });
        });

        // Stunden-Übersicht (klappbar)
        const safeId             = dept.replace(/[^a-zA-Z0-9]/g, '_');
        const deptStundenWrapper = document.createElement('div');
        deptStundenWrapper.style.cssText = 'grid-column:1/-1; margin-top:0.25rem; margin-bottom:0.5rem;';
        deptStundenWrapper.innerHTML = `
            <div onclick="toggleDeptStunden('${safeId}')" style="font-size:0.75rem; font-weight:700; letter-spacing:0.05em; padding:10px 16px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#C9A24D; color:white;">
                <span>STUNDEN ÜBERSICHT</span>
                <span id="stunden-toggle-${safeId}">▶</span>
            </div>
            <div id="stunden-body-${safeId}" style="display:none; background:white; border-radius:0 0 8px 8px; padding:0.5rem 0.75rem;" data-stunden-dept="${dept}"></div>`;

        const deptEmps = employees.filter(e => (e.department || 'Allgemein') === dept);
        deptStundenWrapper.querySelector(`#stunden-body-${safeId}`).innerHTML =
            buildStundenDivHtml(deptEmps, shifts, monthShifts, kwNumber, month, monthNames);
        grid.appendChild(deptStundenWrapper);
    });
}

function buildStundenDivHtml(deptEmps, weekShifts, monthShifts, kwNumber, month, monthNames) {
    const toMin = s => { const [h,m] = s.slice(0,5).split(':').map(Number); return h*60+m; };
    return deptEmps.map(emp => {
        const empWeekShifts  = weekShifts.filter(s => s.employee_id === emp.id && !s.is_open);
        const weekMinutes    = empWeekShifts.reduce((acc, s) => acc + toMin(s.end_time) - toMin(s.start_time) - (s.break_minutes || 0), 0);
        const empMonthShifts = (monthShifts || []).filter(s => s.employee_id === emp.id);
        const monthMinutes   = empMonthShifts.reduce((acc, s) => acc + toMin(s.end_time) - toMin(s.start_time) - (s.break_minutes || 0), 0);
        const weekH   = (weekMinutes / 60).toFixed(1);
        const monthH  = (monthMinutes / 60).toFixed(1);
        const weekColor = weekMinutes === 0 ? 'var(--color-text-light)' :
            weekMinutes > 600 ? '#c05050' : weekMinutes < 240 ? '#b8a020' : '#6aaa6a';
        const parts = emp.name.trim().split(' ');
        const name  = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
            <span style="font-size:0.9rem; font-weight:600;">${name}</span>
            <div style="font-size:0.85rem;">
                <span style="color:${weekColor}; font-weight:600;">${weekH}h KW${kwNumber}</span>
                <span style="color:var(--color-text-light); margin-left:0.5rem;">/ ${monthH}h ${monthNames[month-1]}</span>
            </div>
        </div>`;
    }).join('');
}

function toggleDeptStunden(safeId) {
    const body   = document.getElementById(`stunden-body-${safeId}`);
    const toggle = document.getElementById(`stunden-toggle-${safeId}`);
    const header = toggle?.parentElement;
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display        = open ? 'none' : 'block';
    toggle.textContent        = open ? '▶' : '▼';
    if (header) {
        header.style.background   = open ? '#C9A24D' : 'var(--color-gray)';
        header.style.color        = open ? 'white' : 'var(--color-text-light)';
        header.style.borderRadius = open ? '8px' : '8px 8px 0 0';
    }
}

async function refreshHoursOverview() {
    const divs = document.querySelectorAll('[data-stunden-dept]');
    if (!divs.length) return;

    const monday     = getMonday(weekDate);
    const sunday     = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const year       = monday.getFullYear();
    const month      = monday.getMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2,'0')}-01`;
    const monthEnd   = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
    const weekStart  = monday.toISOString().split('T')[0];
    const weekEnd    = sunday.toISOString().split('T')[0];
    const kwNumber   = Math.ceil(((monday - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7);
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

    const [{ data: weekShifts }, { data: monthShifts }] = await Promise.all([
        db.from('shifts').select('employee_id,start_time,end_time,break_minutes').eq('user_id', adminSession.user.id).eq('is_open', false).gte('shift_date', weekStart).lte('shift_date', weekEnd),
        db.from('shifts').select('employee_id,start_time,end_time,break_minutes').eq('user_id', adminSession.user.id).eq('is_open', false).gte('shift_date', monthStart).lte('shift_date', monthEnd),
    ]);

    divs.forEach(div => {
        const dept     = div.dataset.stundenDept;
        const deptEmps = employees.filter(e => (e.department || 'Allgemein') === dept);
        div.innerHTML  = buildStundenDivHtml(deptEmps, weekShifts || [], monthShifts || [], kwNumber, month, monthNames);
    });
}

// ── ABTEILUNGS-AKTIONSMENÜ ────────────────────────────────
function _closeDeptActionMenu() {
    if (_deptActionMenu) { _deptActionMenu.el.remove(); _deptActionMenu = null; }
}

document.addEventListener('click', e => {
    if (_deptActionMenu && !_deptActionMenu.el.contains(e.target)) _closeDeptActionMenu();
});

function _openDeptActionMenu(btn, dept) {
    _closeDeptActionMenu();
    const menu = document.createElement('div');
    menu.style.cssText = 'position:absolute; z-index:999; background:white; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,0.15); min-width:200px; overflow:hidden; right:0; top:calc(100% + 4px);';
    menu.innerHTML = `
        <button onclick="deptDeleteAll('${dept}')" style="display:block;width:100%;padding:0.75rem 1rem;text-align:left;background:none;border:none;border-bottom:1px solid var(--color-border);font-size:0.88rem;cursor:pointer;color:var(--color-danger);">Alle löschen</button>
        <button onclick="deptStartSelection('${dept}')" style="display:block;width:100%;padding:0.75rem 1rem;text-align:left;background:none;border:none;font-size:0.88rem;cursor:pointer;">Auswählen</button>`;
    btn.parentElement.style.position = 'relative';
    btn.parentElement.appendChild(menu);
    _deptActionMenu = { el: menu, dept };
}

async function deptDeleteAll(dept) {
    _closeDeptActionMenu();
    const monday   = getMonday(weekDate);
    const sunday   = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const firstDay = monday.toISOString().split('T')[0];
    const lastDay  = sunday.toISOString().split('T')[0];
    if (!confirm(`Alle Schichten der Abteilung "${dept}" diese Woche (${firstDay} – ${lastDay}) löschen?`)) return;
    const { data: toDelete } = await db.from('shifts').select('id, employee_id, shift_date')
        .eq('user_id', adminSession.user.id).eq('department', dept)
        .gte('shift_date', firstDay).lte('shift_date', lastDay).eq('is_open', false);
    if (toDelete?.length) {
        await db.from('shifts').delete().in('id', toDelete.map(s => s.id));
        for (const s of toDelete) await syncTipHoursForShift(s.employee_id, s.shift_date);
    }
    await loadWeekGrid();
}

function deptStartSelection(dept) {
    _closeDeptActionMenu();
    _selectionDept = dept;
    _selectedShiftIds.clear();
    document.querySelectorAll(`[data-dept="${dept}"][data-shift-id]`).forEach(cell => {
        cell.style.outline       = '2px solid #C9A24D';
        cell.style.outlineOffset = '-2px';
        cell.onclick = () => _toggleShiftSelection(cell);
    });
    const bar = document.getElementById('dept-selection-bar');
    bar.style.display = 'flex';
    bar.querySelector('#dept-selection-label').textContent = `0 Schichten ausgewählt`;
    bar.querySelector('#dept-selection-dept').textContent  = dept;
}

function _toggleShiftSelection(cell) {
    const id = cell.dataset.shiftId;
    if (_selectedShiftIds.has(id)) {
        _selectedShiftIds.delete(id);
        cell.style.background = cell.dataset.origBg || '';
        cell.style.outline    = '2px solid #C9A24D';
    } else {
        _selectedShiftIds.add(id);
        cell.style.background = '#C9A24D33';
        cell.style.outline    = '2px solid #C9A24D';
    }
    document.getElementById('dept-selection-label').textContent =
        `${_selectedShiftIds.size} Schicht${_selectedShiftIds.size !== 1 ? 'en' : ''} ausgewählt`;
}

function deptCancelSelection() {
    _selectionDept = null;
    _selectedShiftIds.clear();
    document.getElementById('dept-selection-bar').style.display = 'none';
    document.querySelectorAll('[data-shift-id]').forEach(cell => {
        cell.style.outline    = '';
        cell.style.background = cell.dataset.origBg || '';
    });
    loadWeekGrid();
}

async function deptDeleteSelected() {
    if (_selectedShiftIds.size === 0) return;
    if (!confirm(`${_selectedShiftIds.size} ausgewählte Schicht(en) löschen?`)) return;
    const ids = [..._selectedShiftIds];
    const { data: toDelete } = await db.from('shifts').select('id, employee_id, shift_date').in('id', ids);
    await db.from('shifts').delete().in('id', ids);
    if (toDelete?.length) for (const s of toDelete) await syncTipHoursForShift(s.employee_id, s.shift_date);
    _selectionDept = null;
    _selectedShiftIds.clear();
    document.getElementById('dept-selection-bar').style.display = 'none';
    await loadWeekGrid();
}

// ── SCHICHT MODAL ─────────────────────────────────────────
let pendingShiftPayload  = null;
let pendingShiftIsRepeat = false;
let pendingShiftWeeks    = 1;
let shiftTemplates       = [];
let _clockListEmployeeId = null;
let _clockListDateStr    = null;

async function openShiftModal(employeeId, dateStr, existingShift, defaultDept, forceOpen = false) {
    _shiftModalScrollY      = window.scrollY;
    currentShiftEmployeeId  = employeeId;
    currentShiftDateStr     = dateStr;
    editShiftId             = existingShift ? existingShift.id : null;

    document.getElementById('shift-modal-title').textContent =
        existingShift ? 'Schicht bearbeiten' : 'Schicht erstellen';

    const select = document.getElementById('shift-employee');
    select.innerHTML = employees.map(e =>
        `<option value="${e.id}" ${e.id === employeeId ? 'selected' : ''}>${e.name}</option>`
    ).join('');

    document.getElementById('shift-date').value   = dateStr;
    document.getElementById('shift-start').value  = existingShift ? existingShift.start_time.slice(0,5) : '08:00';
    document.getElementById('shift-end').value    = existingShift ? existingShift.end_time.slice(0,5)   : '16:00';
    document.getElementById('shift-break').value  = existingShift ? existingShift.break_minutes : 30;
    document.getElementById('shift-notes').value  = existingShift ? (existingShift.notes || '') : '';
    document.getElementById('shift-error').style.display = 'none';

    document.getElementById('shift-delete-btn').style.display = existingShift ? 'block' : 'none';
    const isOpen     = forceOpen || existingShift?.is_open || false;
    document.getElementById('shift-is-open').checked          = isOpen;
    document.getElementById('shift-open-note').value          = existingShift?.open_note || '';

    const empGroup   = document.getElementById('shift-employee').closest('.form-group');
    const preselected = !!(employeeId && dateStr && defaultDept && !isOpen);

    document.getElementById('shift-employee').disabled                              = isOpen;
    empGroup.style.display                                                           = isOpen ? 'none' : (preselected ? 'none' : 'block');
    empGroup.style.opacity                                                           = isOpen ? '0.4' : '1';
    document.getElementById('shift-date').closest('.form-group').style.display      = preselected ? 'none' : 'block';
    document.getElementById('shift-dept-group').style.display                       = preselected ? 'none' : 'block';
    document.getElementById('shift-open-note-group').style.display                  = isOpen ? 'block' : 'none';

    const emp         = employees.find(e => e.id === (existingShift?.employee_id || employeeId));
    const deptToSelect = existingShift?.department || defaultDept || emp?.department || departmentNames[0] || '';
    populateDeptSelect(document.getElementById('shift-department'), deptToSelect);

    document.getElementById('shift-actual-group').style.display  = existingShift ? 'block' : 'none';
    document.getElementById('shift-actual-body').style.display   = 'none';
    document.getElementById('shift-actual-toggle').textContent   = '▶';
    const _aStart = document.getElementById('shift-actual-start');
    const _aEnd   = document.getElementById('shift-actual-end');
    _aStart.value              = existingShift?.actual_start_time ? existingShift.actual_start_time.slice(0,5) : (existingShift?.start_time ? existingShift.start_time.slice(0,5) : '');
    _aStart.dataset.hadActual  = existingShift?.actual_start_time ? '1' : '';
    _aStart.dataset.planned    = existingShift?.start_time ? existingShift.start_time.slice(0,5) : '';
    _aEnd.value                = existingShift?.actual_end_time   ? existingShift.actual_end_time.slice(0,5)   : (existingShift?.end_time   ? existingShift.end_time.slice(0,5)   : '');
    _aEnd.dataset.hadActual    = existingShift?.actual_end_time   ? '1' : '';
    _aEnd.dataset.planned      = existingShift?.end_time   ? existingShift.end_time.slice(0,5)   : '';
    document.getElementById('shift-actual-break').value          = existingShift?.actual_break_minutes ?? '';

    const clockGroup = document.getElementById('shift-clock-group');
    if (clockGroup && existingShift) {
        await loadAndRenderClockList(existingShift.employee_id, dateStr);
    }

    document.getElementById('shift-repeat').checked              = false;
    document.getElementById('shift-repeat-group').style.display  = 'none';
    document.getElementById('shift-repeat-weeks').value          = 4;

    await loadTemplates();
    document.getElementById('shift-modal').classList.add('open');
}

// ── STEMPELZEITEN AUS GH_TIME_ENTRIES ─────────────────────

async function loadAndRenderClockList(employeeId, dateStr) {
    const clockGroup = document.getElementById('shift-clock-group');
    if (!clockGroup) return;

    _clockListEmployeeId = employeeId;
    _clockListDateStr    = dateStr;

    const { data: timeEntries } = await db.from('gh_time_entries')
        .select('id, clock_in, clock_out, note, is_manual')
        .eq('user_id', adminSession.user.id)
        .eq('employee_id', employeeId)
        .gte('clock_in', dateStr + 'T00:00:00')
        .lte('clock_in', dateStr + 'T23:59:59')
        .order('clock_in', { ascending: true });

    const entries = timeEntries || [];
    clockGroup.style.display = 'block';

    const note = entries.map(e => e.note?.trim()).filter(Boolean).join(' / ');
    const noteEl     = document.getElementById('shift-clock-note');
    const noteTextEl = document.getElementById('shift-clock-note-text');
    if (noteEl && noteTextEl) {
        noteEl.style.display = note ? 'block' : 'none';
        noteTextEl.textContent = note;
    }

    // Pausen für alle Einträge laden
    const entryIds = entries.map(e => e.id);
    let breaks = [];
    if (entryIds.length) {
        const { data: bData } = await db.from('gh_breaks')
            .select('time_entry_id, break_start, break_end')
            .in('time_entry_id', entryIds);
        breaks = bData || [];
    }

    const breakMinByEntry = {};
    for (const b of breaks) {
        if (!b.break_end) continue;
        const m = Math.round((new Date(b.break_end) - new Date(b.break_start)) / 60000);
        breakMinByEntry[b.time_entry_id] = (breakMinByEntry[b.time_entry_id] || 0) + m;
    }

    let totalNettoMin = 0;

    const rows = entries.map((te, i) => {
        const cin   = new Date(te.clock_in).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const cout  = te.clock_out
            ? new Date(te.clock_out).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
            : '—';
        const label = entries.length > 1 ? `Eintrag ${i + 1}` : '';

        const pauseMin = breakMinByEntry[te.id] || 0;
        const pause    = pauseMin > 0 ? `${pauseMin} min` : '—';

        let netto = '—';
        if (te.clock_out) {
            const diffM = Math.round((new Date(te.clock_out) - new Date(te.clock_in)) / 60000);
            const netM  = diffM - pauseMin;
            totalNettoMin += netM;
            const h = Math.floor(netM / 60), m = netM % 60;
            netto = h > 0 ? `${h}h ${m}min` : `${m}min`;
        }

        return `
        <div style="display:flex; align-items:center; gap:0.5rem;">
            <div style="flex:1; display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:0.5rem;">
                <div style="background:var(--color-gray); border-radius:8px; padding:0.5rem 0.75rem;">
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.15rem;">${label ? label + ' · ' : ''}Ein</div>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        <span style="font-size:0.95rem; font-weight:600; color:var(--color-text);">${cin}</span>
                        ${te.is_manual ? '<span style="font-size:0.65rem; font-weight:600; background:#E8E3DE; color:#8B6F47; border-radius:5px; padding:0.1rem 0.35rem;">manuell</span>' : ''}
                    </div>
                </div>
                <div style="background:var(--color-gray); border-radius:8px; padding:0.5rem 0.75rem;">
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.15rem;">Aus</div>
                    <div style="font-size:0.95rem; font-weight:600; color:${te.clock_out ? 'var(--color-text)' : 'var(--color-text-light)'};">${cout}</div>
                </div>
                <div style="background:var(--color-gray); border-radius:8px; padding:0.5rem 0.75rem;">
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.15rem;">Pause</div>
                    <div style="font-size:0.95rem; font-weight:600; color:${pauseMin > 0 ? 'var(--color-text)' : 'var(--color-text-light)'};">${pause}</div>
                </div>
                <div style="background:var(--color-gray); border-radius:8px; padding:0.5rem 0.75rem;">
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.15rem;">Netto</div>
                    <div style="font-size:0.95rem; font-weight:600; color:var(--color-text);">${netto}</div>
                </div>
            </div>
            <button onclick="deleteTimeEntry('${te.id}','${employeeId}','${dateStr}')"
                style="flex-shrink:0; background:none; border:none; cursor:pointer; color:#B28A6E; font-size:1.1rem; padding:0.25rem;" title="Eintrag löschen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
        </div>`;
    });

    if (entries.length > 1 || totalNettoMin > 0) {
        const th = Math.floor(totalNettoMin / 60), tm = totalNettoMin % 60;
        const totalStr = th > 0 ? `${th}h ${tm}min` : `${tm}min`;
        rows.push(`
        <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.25rem;">
            <div style="flex:1; display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:0.5rem;">
                <div style="grid-column:4/5; background:#B28A6E1A; border-radius:8px; padding:0.5rem 0.75rem; border:1px solid #B28A6E44;">
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.15rem;">Gesamt Netto</div>
                    <div style="font-size:0.95rem; font-weight:700; color:#B28A6E;">${totalStr}</div>
                </div>
            </div>
            <div style="width:1.85rem; flex-shrink:0;"></div>
        </div>`);
    }

    document.getElementById('shift-clock-list').innerHTML = rows.join('');

    document.getElementById('shift-clock-add-wrap').innerHTML = `
        <div style="text-align:center; margin-top:0.75rem;">
            <button type="button" onclick="toggleClockAddForm()"
                style="background:none; border:1px solid #B28A6E; color:#B28A6E; border-radius:8px; padding:0.4rem 1rem; font-size:0.85rem; font-weight:600; cursor:pointer;">
                + Eintrag nachtragen
            </button>
        </div>
        <div id="shift-clock-add-form" style="display:none; margin-top:0.75rem; background:var(--color-gray); border-radius:10px; padding:0.75rem;">
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem; margin-bottom:0.6rem;">
                <div>
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.2rem;">Von</div>
                    <input id="clock-add-von" type="time"
                        style="width:100%; padding:0.4rem 0.5rem; border:1px solid #ddd; border-radius:7px; font-size:0.95rem;">
                </div>
                <div>
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.2rem;">Bis</div>
                    <input id="clock-add-bis" type="time"
                        style="width:100%; padding:0.4rem 0.5rem; border:1px solid #ddd; border-radius:7px; font-size:0.95rem;">
                </div>
                <div>
                    <div style="font-size:0.7rem; color:var(--color-text-light); margin-bottom:0.2rem;">Pause (Min)</div>
                    <input id="clock-add-pause" type="number" min="0" placeholder="0"
                        style="width:100%; padding:0.4rem 0.5rem; border:1px solid #ddd; border-radius:7px; font-size:0.95rem;">
                </div>
            </div>
            <div style="text-align:center;">
                <button type="button" onclick="saveManualClockEntry()"
                    style="background:#B28A6E; color:white; border:none; border-radius:8px; padding:0.45rem 1.25rem; font-size:0.875rem; font-weight:600; cursor:pointer;">
                    Speichern
                </button>
                <div id="clock-add-error" style="color:#E05555; font-size:0.8rem; margin-top:0.4rem;"></div>
            </div>
        </div>`;
}

function toggleClockAddForm() {
    const form = document.getElementById('shift-clock-add-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveManualClockEntry() {
    const von     = document.getElementById('clock-add-von')?.value;
    const bis     = document.getElementById('clock-add-bis')?.value;
    const pauseRaw = parseInt(document.getElementById('clock-add-pause')?.value || '0', 10);
    const pauseMin = isNaN(pauseRaw) || pauseRaw < 0 ? 0 : pauseRaw;
    const errorEl = document.getElementById('clock-add-error');

    if (errorEl) errorEl.textContent = '';

    if (!von || !bis) {
        if (errorEl) errorEl.textContent = 'Bitte Von und Bis ausfüllen.';
        return;
    }

    const clockIn  = new Date(`${_clockListDateStr}T${von}:00`);
    const clockOut = new Date(`${_clockListDateStr}T${bis}:00`);

    if (clockOut <= clockIn) {
        if (errorEl) errorEl.textContent = 'Bis muss nach Von liegen.';
        return;
    }

    // Überschneidungs-Check gegen bestehende Einträge
    const { data: existing } = await db.from('gh_time_entries')
        .select('id, clock_in, clock_out')
        .eq('user_id', adminSession.user.id)
        .eq('employee_id', _clockListEmployeeId)
        .gte('clock_in', _clockListDateStr + 'T00:00:00')
        .lte('clock_in', _clockListDateStr + 'T23:59:59');

    for (const e of existing || []) {
        const exIn  = new Date(e.clock_in);
        const exOut = e.clock_out ? new Date(e.clock_out) : null;
        if (!exOut) continue;
        if (clockIn < exOut && clockOut > exIn) {
            if (errorEl) errorEl.textContent = 'Zeitspanne überschneidet sich mit einem bestehenden Eintrag.';
            return;
        }
    }

    const { error: insertErr } = await db.from('gh_time_entries').insert({
        user_id:     adminSession.user.id,
        employee_id: _clockListEmployeeId,
        clock_in:    clockIn.toISOString(),
        clock_out:   clockOut.toISOString(),
        is_manual:   true
    });

    if (insertErr) {
        if (errorEl) errorEl.textContent = 'Fehler beim Speichern: ' + insertErr.message;
        return;
    }

    if (pauseMin > 0) {
        const { data: newEntry } = await db.from('gh_time_entries')
            .select('id')
            .eq('user_id', adminSession.user.id)
            .eq('employee_id', _clockListEmployeeId)
            .eq('clock_in', clockIn.toISOString())
            .maybeSingle();

        if (newEntry) {
            const breakStart = new Date(clockIn.getTime() + 60 * 60 * 1000);
            const breakEnd   = new Date(breakStart.getTime() + pauseMin * 60 * 1000);
            await db.from('gh_breaks').insert({
                user_id:       adminSession.user.id,
                employee_id:   _clockListEmployeeId,
                time_entry_id: newEntry.id,
                break_start:   breakStart.toISOString(),
                break_end:     breakEnd.toISOString()
            });
        }
    }

    await loadAndRenderClockList(_clockListEmployeeId, _clockListDateStr);
}

async function deleteTimeEntry(id, employeeId, dateStr) {
    if (!confirm('Stempel-Eintrag wirklich löschen?')) return;
    const { error: breakErr } = await db.from('gh_breaks').delete().eq('time_entry_id', id);
    if (breakErr) { alert('Fehler beim Löschen der Pausen: ' + breakErr.message); return; }
    const { error } = await db.from('gh_time_entries').delete().eq('id', id);
    if (error) { alert('Fehler: ' + error.message); return; }
    await loadAndRenderClockList(employeeId, dateStr);
}

function toggleShiftClock() {
    const body   = document.getElementById('shift-clock-body');
    const toggle = document.getElementById('shift-clock-toggle');
    const open   = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    toggle.textContent = open ? '▼' : '▶';
}

let _todayClockSummaryLoaded = false;

function toggleTodayClockSummary() {
    const body   = document.getElementById('today-clock-summary-body');
    const toggle = document.getElementById('today-clock-summary-toggle');
    const open   = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    toggle.textContent = open ? '▼' : '▶';
    if (open && !_todayClockSummaryLoaded) {
        _todayClockSummaryLoaded = true;
        const input = document.getElementById('today-clock-date');
        if (input && !input.value) input.value = new Date().toISOString().split('T')[0];
        loadTodayClockSummary();
    }
}

function onTodayClockDateChange() {
    loadTodayClockSummary();
}

async function loadTodayClockSummary() {
    const list = document.getElementById('today-clock-summary-list');
    if (!list) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const input    = document.getElementById('today-clock-date');
    const dateStr  = (input && input.value) ? input.value : todayStr;


    list.innerHTML = '<div style="color:var(--color-text-light); font-size:0.85rem;">Lädt…</div>';

    const { data: entries } = await db.from('gh_time_entries')
        .select('id, employee_id, clock_in, clock_out')
        .eq('user_id', adminSession.user.id)
        .gte('clock_in', dateStr + 'T00:00:00')
        .lte('clock_in', dateStr + 'T23:59:59')
        .order('clock_in', { ascending: true });

    if (!entries || entries.length === 0) {
        list.innerHTML = '<div style="color:var(--color-text-light); font-size:0.85rem;">Keine Stempelzeiten für diesen Tag.</div>';
        return;
    }

    const fmt = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    list.innerHTML = entries.map(e => {
        const emp      = employees.find(em => em.id === e.employee_id);
        const name     = emp ? emp.name : '—';
        const cin      = fmt(e.clock_in);
        const cout     = e.clock_out ? fmt(e.clock_out) : null;
        const endTime  = e.clock_out ? new Date(e.clock_out) : new Date();
        const diffM    = Math.round((endTime - new Date(e.clock_in)) / 60000);
        const h        = Math.floor(diffM / 60), m = diffM % 60;
        const duration = h > 0 ? `${h}h ${m}min` : `${m}min`;
        const status   = cout
            ? `<span style="color:var(--color-text-light);">${cout}</span>`
            : `<span style="background:#6B8E6F22; color:#6B8E6F; border-radius:5px; padding:0.1rem 0.4rem; font-size:0.75rem; font-weight:600;">noch da</span>`;

        return `
        <div style="display:grid; grid-template-columns:1.6fr 0.8fr 1fr 0.9fr; align-items:center; gap:0.5rem; padding:0.45rem 0.5rem; border-radius:8px; background:var(--color-gray); margin-bottom:0.35rem;">
            <div style="font-size:0.875rem; font-weight:600; color:var(--color-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
            <div style="font-size:0.875rem; color:var(--color-text);">${cin}</div>
            <div style="font-size:0.875rem;">${status}</div>
            <div style="font-size:0.8rem; color:var(--color-text-light); text-align:right;">${duration}</div>
        </div>`;
    }).join('');
}

function toggleShiftActual() {
    const body   = document.getElementById('shift-actual-body');
    const toggle = document.getElementById('shift-actual-toggle');
    const open   = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    toggle.textContent = open ? '▼' : '▶';
}

function closeShiftModal() {
    document.getElementById('shift-modal').classList.remove('open');
    editShiftId = null;
    window.scrollTo({ top: _shiftModalScrollY, behavior: 'instant' });
}

function toggleRepeat() {
    const checked = document.getElementById('shift-repeat').checked;
    document.getElementById('shift-repeat-group').style.display = checked ? 'block' : 'none';
}

async function loadTemplates() {
    const { data: templates } = await db.from('shift_templates').select('*')
        .eq('user_id', adminSession.user.id).order('name');
    shiftTemplates = templates || [];
    const select = document.getElementById('shift-template');
    select.innerHTML = '<option value="">— Keine Vorlage —</option>';
    (templates || []).forEach(t => {
        select.innerHTML += `<option value="${t.id}" data-start="${t.start_time}" data-end="${t.end_time}" data-break="${t.break_minutes}">${t.name} (${t.start_time.slice(0,5)}–${t.end_time.slice(0,5)})</option>`;
    });
}

function applyShiftTemplate() {
    const sel = document.getElementById('shift-template');
    const opt = sel.options[sel.selectedIndex];
    if (!opt.value) return;
    document.getElementById('shift-start').value = opt.dataset.start.slice(0,5);
    document.getElementById('shift-end').value   = opt.dataset.end.slice(0,5);
    document.getElementById('shift-break').value = opt.dataset.break;
}

async function checkAvailabilityWarning(employeeId, date, start, end) {
    if (!employeeId || !date) return null;
    const emp = employees.find(e => e.id === employeeId);
    if (!emp) return null;

    const { data: vacations } = await db.from('vacation_requests')
        .select('start_date, end_date').eq('user_id', adminSession.user.id)
        .eq('employee_id', employeeId).eq('status', 'approved')
        .lte('start_date', date).gte('end_date', date);
    if (vacations && vacations.length > 0) return `${emp.name} hat an diesem Tag genehmigten Urlaub!`;

    const d        = new Date(date + 'T12:00:00');
    const monthStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    const dayNum   = d.getDate();
    const { data } = await db.from('availability').select('available_days')
        .eq('employee_id', employeeId).eq('month', monthStr).maybeSingle();
    if (!data) return null;

    const entry  = (data.available_days || {})[dayNum];
    if (!entry) return null;
    if (entry.status === 'off')    return `${emp.name} ist an diesem Tag nicht verfügbar!`;
    if (entry.status === 'school') return `${emp.name} hat an diesem Tag Schule!`;
    if (entry.status === 'partial' && entry.from && entry.to) {
        const toMin = t => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
        if (toMin(start) < toMin(entry.from) || toMin(end) > toMin(entry.to))
            return `${emp.name} ist nur von ${entry.from}–${entry.to} Uhr verfügbar. Die Schicht liegt außerhalb!`;
    }
    return null;
}

function closeAvailWarningModal() {
    document.getElementById('avail-warning-modal').classList.remove('active');
    pendingShiftPayload = null;
}

async function confirmShiftDespiteWarning() {
    document.getElementById('avail-warning-modal').classList.remove('active');
    await saveShift(pendingShiftPayload, pendingShiftIsRepeat, pendingShiftWeeks);
}

async function submitShift() {
    const employeeId = document.getElementById('shift-employee').value;
    const date       = document.getElementById('shift-date').value;
    const start      = document.getElementById('shift-start').value;
    const end        = document.getElementById('shift-end').value;
    const breakMin   = document.getElementById('shift-break').value;
    const notes      = document.getElementById('shift-notes').value;
    const errorDiv   = document.getElementById('shift-error');
    errorDiv.style.display = 'none';

    if (!date || !start || !end) {
        errorDiv.textContent   = 'Bitte alle Pflichtfelder ausfüllen.';
        errorDiv.style.display = 'block';
        return;
    }

    const isOpen  = document.getElementById('shift-is-open').checked;
    const _aStartEl   = document.getElementById('shift-actual-start');
    const _aEndEl     = document.getElementById('shift-actual-end');
    const _aBreakEl   = document.getElementById('shift-actual-break');
    const _anyChanged =
        _aStartEl.dataset.hadActual === '1' ||
        _aEndEl.dataset.hadActual   === '1' ||
        (_aStartEl.value && _aStartEl.value !== _aStartEl.dataset.planned) ||
        (_aEndEl.value   && _aEndEl.value   !== _aEndEl.dataset.planned)   ||
        (_aBreakEl.value !== '');
    const _resolveActual = el => {
        if (!_anyChanged) return null;
        return el.value || el.dataset.planned || null;
    };
    const payload = editShiftId ? {
        actual_start_time:    _resolveActual(_aStartEl),
        actual_end_time:      _resolveActual(_aEndEl),
        actual_break_minutes: document.getElementById('shift-actual-break').value !== '' ? parseInt(document.getElementById('shift-actual-break').value) : null,
    } : {};
    Object.assign(payload, {
        user_id:      adminSession.user.id,
        employee_id:  isOpen ? null : employeeId,
        shift_date:   date,
        start_time:   start,
        end_time:     end,
        break_minutes: breakMin ? parseInt(breakMin) : 0,
        notes:        notes || null,
        is_open:      isOpen,
        open_note:    isOpen ? (document.getElementById('shift-open-note').value || null) : null,
        department:   document.getElementById('shift-department').value || null,
    });

    const repeat = document.getElementById('shift-repeat').checked;
    const weeks  = parseInt(document.getElementById('shift-repeat-weeks').value) || 1;

    if (!isOpen && !editShiftId) {
        const warning = await checkAvailabilityWarning(employeeId, date, start, end);
        if (warning) {
            pendingShiftPayload  = payload;
            pendingShiftIsRepeat = repeat;
            pendingShiftWeeks    = weeks;
            document.getElementById('avail-warning-text').textContent = warning;
            document.getElementById('avail-warning-modal').classList.add('active');
            return;
        }
    }

    await saveShift(payload, repeat, weeks);

    if (!editShiftId && isOpen) {
        fetch('https://gastrohub-notify.artsem86.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Offene Schicht',
                message: 'Eine neue offene Schicht ist verfügbar — schau in den Schichtplan!'
            })
        }).catch(e => console.error('[openShift notify]', e));
    }
}

async function saveShift(payload, repeat, weeks) {
    const errorDiv = document.getElementById('shift-error');
    let error;

    if (editShiftId) {
        ({ error } = await db.from('shifts').update(payload).eq('id', editShiftId));

        if (!error && repeat && weeks > 1 && payload.employee_id) {
            let delQ = db.from('shifts').delete()
                .eq('user_id', adminSession.user.id)
                .eq('employee_id', payload.employee_id)
                .eq('start_time', payload.start_time)
                .eq('end_time', payload.end_time)
                .gt('shift_date', payload.shift_date);
            if (payload.department) delQ = delQ.eq('department', payload.department);
            else                    delQ = delQ.is('department', null);
            await delQ;

            const { actual_start_time, actual_end_time, actual_break_minutes, ...basePayload } = payload;
            const repeatPayloads = [];
            for (let i = 1; i < weeks; i++) {
                const d = new Date(payload.shift_date + 'T12:00:00');
                d.setDate(d.getDate() + i * 7);
                repeatPayloads.push({ ...basePayload, shift_date: d.toISOString().split('T')[0] });
            }
            if (repeatPayloads.length > 0) await db.from('shifts').insert(repeatPayloads);
        }
    } else if (repeat && weeks > 1) {
        const payloads = [];
        for (let i = 0; i < weeks; i++) {
            const d = new Date(payload.shift_date + 'T12:00:00');
            d.setDate(d.getDate() + i * 7);
            payloads.push({ ...payload, shift_date: d.toISOString().split('T')[0] });
        }
        ({ error } = await db.from('shifts').insert(payloads));
    } else {
        ({ error } = await db.from('shifts').insert(payload));
    }

    // Arbeitsrecht-Warnungen (nicht bei Ist-Zeiten)
    if (!payload.actual_start_time && !payload.actual_end_time) {
        const warnings = await checkArbeitszeitWarnings(payload);
        if (warnings.length > 0) {
            if (!confirm('⚠️ Arbeitsrecht-Hinweise:\n\n' + warnings.join('\n\n') + '\n\nTrotzdem speichern?')) return;
        }
    }

    if (error) {
        errorDiv.textContent   = 'Fehler beim Speichern.';
        errorDiv.style.display = 'block';
        return;
    }

    closeShiftModal();
    if (payload.is_open) {
        await loadWeekGrid();
    } else {
        await updateShiftCell(currentShiftEmployeeId, currentShiftDateStr);
    }
    await refreshHoursOverview();

    if (payload.employee_id) {
        if (repeat && weeks > 1) {
            for (let i = 0; i < weeks; i++) {
                const d = new Date(payload.shift_date + 'T12:00:00');
                d.setDate(d.getDate() + i * 7);
                await syncTipHoursForShift(payload.employee_id, d.toISOString().split('T')[0]);
            }
        } else {
            await syncTipHoursForShift(payload.employee_id, payload.shift_date);
        }
    }
}

async function deleteShift() {
    if (!editShiftId) return;
    if (!confirm('Schicht wirklich löschen?')) return;

    await Promise.all([
        db.from('open_shift_requests').delete().eq('shift_id', editShiftId),
        db.from('shift_swaps').delete().eq('shift_id', editShiftId),
        db.from('shift_swaps').delete().eq('target_shift_id', editShiftId),
        db.from('shift_handovers').delete().eq('shift_id', editShiftId),
    ]);

    const { error } = await db.from('shifts').delete().eq('id', editShiftId);
    if (error) { alert('Fehler beim Löschen: ' + error.message); return; }

    closeShiftModal();

    const cells = document.querySelectorAll(`[data-cell="${currentShiftEmployeeId}_${currentShiftDateStr}"]`);
    if (cells.length && currentShiftEmployeeId) {
        const d         = new Date(currentShiftDateStr + 'T12:00:00');
        const monthStr  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
        const dayKey    = String(d.getDate());

        const [{ data: availRow }, { data: vacation }, { data: sick }] = await Promise.all([
            db.from('availability').select('available_days')
                .eq('user_id', adminSession.user.id)
                .eq('employee_id', currentShiftEmployeeId)
                .eq('month', monthStr)
                .maybeSingle(),
            db.from('vacation_requests').select('id')
                .eq('user_id', adminSession.user.id)
                .eq('employee_id', currentShiftEmployeeId)
                .eq('status', 'approved')
                .lte('start_date', currentShiftDateStr)
                .gte('end_date', currentShiftDateStr)
                .maybeSingle(),
            db.from('sick_leaves').select('id')
                .eq('user_id', adminSession.user.id)
                .eq('employee_id', currentShiftEmployeeId)
                .lte('start_date', currentShiftDateStr)
                .gte('end_date', currentShiftDateStr)
                .maybeSingle(),
        ]);

        const avail = vacation
            ? { status: 'vacation' }
            : (availRow?.available_days?.[dayKey] || null);

        cells.forEach(cell => {
            const cellDept = cell.dataset.dept;
            cell.className        = 'week-cell';
            cell.style.whiteSpace = 'pre';
            cell.style.position   = 'relative';
            cell.style.background = '';
            cell.style.color      = '';
            cell.style.fontSize   = '';
            cell.textContent      = '+';
            delete cell.dataset.shiftId;
            cell.dataset.origBg   = '';
            cell.onclick = () => openShiftModal(currentShiftEmployeeId, currentShiftDateStr, null, cellDept);

            if (sick) {
                cell.style.background = '#FFE0CC';
                cell.textContent      = 'Krank';
                cell.style.color      = '#E07040';
                cell.style.fontSize   = '0.7rem';
            } else if (planningMode && avail) {
                if      (avail.status === 'vacation') cell.style.background = '#D0E8FF';
                else if (avail.status === 'school')   cell.style.background = '#E8D0FF';
                else if (avail.status === 'full')     cell.style.background = '#D8F0D8';
                else if (avail.status === 'partial') {
                    cell.style.background = '#FFF3CC';
                    if (avail.from && avail.to) {
                        cell.textContent    = `${avail.from.slice(0,5)}\n${avail.to.slice(0,5)}`;
                        cell.style.fontSize = '0.65rem';
                    }
                }
                else if (avail.status === 'off') cell.style.background = '#FFD9D9';
            }
        });
    } else {
        await loadWeekGrid();
    }

    await refreshHoursOverview();
    await syncTipHoursForShift(currentShiftEmployeeId, currentShiftDateStr);
}

async function syncTipHoursForShift(employeeId, dateStr) {
    if (!employeeId || !dateStr) return;

    const { data: shifts } = await db.from('shifts')
        .select('start_time,end_time,break_minutes,actual_start_time,actual_end_time,actual_break_minutes,department')
        .eq('user_id', adminSession.user.id).eq('employee_id', employeeId)
        .eq('shift_date', dateStr).eq('is_open', false);

    await db.from('tip_hours').delete()
        .eq('user_id', adminSession.user.id).eq('employee_id', employeeId).eq('work_date', dateStr);

    if (!shifts || shifts.length === 0) return;

    const { data: sick } = await db.from('sick_leaves').select('id')
        .eq('user_id', adminSession.user.id).eq('employee_id', employeeId)
        .lte('start_date', dateStr).gte('end_date', dateStr).maybeSingle();
    if (sick) return;

    const rows = [];
    for (const shift of shifts) {
        const startStr = shift.actual_start_time || shift.start_time;
        const endStr   = shift.actual_end_time   || shift.end_time;
        const breakMin = shift.actual_break_minutes ?? shift.break_minutes ?? 0;
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        const minutes  = (eh*60+em) - (sh*60+sm) - breakMin;
        if (minutes > 0) rows.push({ user_id: adminSession.user.id, employee_id: employeeId, work_date: dateStr, minutes, department: shift.department || null });
    }
    if (rows.length > 0) {
        const { error: tipErr } = await db.from('tip_hours').upsert(rows, { onConflict: 'user_id,employee_id,work_date,department' });
        if (tipErr) console.error('tip_hours upsert error:', tipErr.message, tipErr.details);
    }
}

async function updateShiftCell(employeeId, dateStr) {
    const { data: shifts } = await db.from('shifts').select('*')
        .eq('user_id', adminSession.user.id).eq('shift_date', dateStr);

    if (employeeId) {
        const cells     = document.querySelectorAll(`[data-cell="${employeeId}_${dateStr}"]`);
        if (!cells.length) { await loadWeekGrid(); return; }
        const empShifts = (shifts || []).filter(s => s.employee_id === employeeId && !s.is_open);

        cells.forEach(cell => {
            const cellDept = cell.dataset.dept;
            const shift    = empShifts.find(s => s.department === cellDept || (!s.department && !cellDept));
            cell.className        = 'week-cell' + (shift ? ' has-shift' : '');
            cell.style.whiteSpace = 'pre';
            cell.style.position   = 'relative';
            cell.style.background = '';
            cell.style.color      = '';
            cell.style.fontSize   = '';
            cell.innerHTML        = '';
            if (shift) {
                cell.textContent = `${shift.start_time.slice(0,5)}\n${shift.end_time.slice(0,5)}`;
                if (shift.actual_start_time) cell.style.background = '#E8D4A0';
            } else {
                cell.textContent = '+';
            }
            cell.onclick = () => openShiftModal(employeeId, dateStr, shift || null, cellDept);
        });
    } else {
        await loadWeekGrid();
    }
}

async function checkArbeitszeitWarnings(payload) {
    const warnings = [];
    const [sh, sm] = payload.start_time.split(':').map(Number);
    const [eh, em] = payload.end_time.split(':').map(Number);
    const durationMinutes = (eh*60+em) - (sh*60+sm) - (payload.break_minutes || 0);
    const durationHours   = durationMinutes / 60;
    const breakMinutes    = payload.break_minutes || 0;

    if (durationHours > 10)
        warnings.push(`🕐 Schicht zu lang: ${durationHours.toFixed(1)}h (max. 10h erlaubt)`);
    if (durationHours > 9 && breakMinutes < 45)
        warnings.push(`☕ Pausenempfehlung: Ab 9h Arbeit mindestens 45 Min Pause (aktuell: ${breakMinutes} Min)`);
    else if (durationHours > 6 && breakMinutes < 30)
        warnings.push(`☕ Pausenempfehlung: Ab 6h Arbeit mindestens 30 Min Pause (aktuell: ${breakMinutes} Min)`);

    if (payload.employee_id) {
        const prevDate = new Date(payload.shift_date + 'T12:00:00');
        prevDate.setDate(prevDate.getDate() - 1);
        const { data: prevShift } = await db.from('shifts').select('end_time')
            .eq('employee_id', payload.employee_id)
            .eq('shift_date', prevDate.toISOString().split('T')[0]).maybeSingle();
        if (prevShift) {
            const [ph, pm]      = prevShift.end_time.split(':').map(Number);
            const restMinutes   = (24*60 - (ph*60+pm)) + (sh*60+sm);
            if (restMinutes < 11*60)
                warnings.push(`😴 Ruhezeit zu kurz: Nur ${(restMinutes/60).toFixed(1)}h zwischen den Schichten (min. 11h erforderlich)`);
        }
    }
    return warnings;
}

// ── OFFENE SCHICHTEN MODAL ────────────────────────────────
let openShiftData = null;

function openOpenShiftModal(dateStr, dept, existingShift) {
    currentShiftEmployeeId = null;
    currentShiftDateStr    = dateStr;
    openShiftData          = { dateStr, dept, existingShift };
    document.getElementById('open-shift-modal-title').textContent =
        `Offen – ${dept} – ${new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {day:'numeric', month:'short'})}`;
    document.getElementById('open-shift-start').value                    = existingShift ? existingShift.start_time.slice(0,5) : '08:00';
    document.getElementById('open-shift-end').value                      = existingShift ? existingShift.end_time.slice(0,5)   : '16:00';
    document.getElementById('open-shift-break').value                    = existingShift ? existingShift.break_minutes : 30;
    document.getElementById('open-shift-note').value                     = existingShift ? (existingShift.open_note || '') : '';
    document.getElementById('open-shift-error').style.display            = 'none';
    document.getElementById('open-shift-delete-btn').style.display       = existingShift ? 'block' : 'none';
    document.getElementById('open-shift-modal').classList.add('active');
}

function closeOpenShiftModal() {
    document.getElementById('open-shift-modal').classList.remove('active');
    openShiftData = null;
}

async function submitOpenShift() {
    const start    = document.getElementById('open-shift-start').value;
    const end      = document.getElementById('open-shift-end').value;
    const breakMin = document.getElementById('open-shift-break').value;
    const note     = document.getElementById('open-shift-note').value;
    const errorDiv = document.getElementById('open-shift-error');
    errorDiv.style.display = 'none';

    if (!start || !end) {
        errorDiv.textContent   = 'Bitte Von und Bis ausfüllen.';
        errorDiv.style.display = 'block';
        return;
    }

    const payload = {
        user_id:      adminSession.user.id,
        employee_id:  null,
        shift_date:   openShiftData.dateStr,
        start_time:   start,
        end_time:     end,
        break_minutes: breakMin ? parseInt(breakMin) : 0,
        is_open:      true,
        open_note:    note || null,
        department:   openShiftData.dept,
    };

    let error;
    if (openShiftData.existingShift) {
        ({ error } = await db.from('shifts').update(payload).eq('id', openShiftData.existingShift.id));
    } else {
        ({ error } = await db.from('shifts').insert(payload));
    }

    if (error) { errorDiv.textContent = 'Fehler beim Speichern.'; errorDiv.style.display = 'block'; return; }
    closeOpenShiftModal();
    await loadWeekGrid();
}

async function deleteOpenShift() {
    if (!openShiftData?.existingShift) return;
    if (!confirm('Offene Schicht wirklich löschen?')) return;
    await db.from('open_shift_requests').delete().eq('shift_id', openShiftData.existingShift.id);
    const { error } = await db.from('shifts').delete().eq('id', openShiftData.existingShift.id);
    if (error) { alert('Fehler beim Löschen!'); return; }
    closeOpenShiftModal();
    await loadWeekGrid();
}

// ── ADMIN-VERFÜGBARKEITSANSICHT ───────────────────────────
function changeAdminAvailMonth(dir) {
    adminAvailDate.setMonth(adminAvailDate.getMonth() + dir);
    loadAdminAvailability();
}

async function loadAdminAvailability() {
    const employeeId = document.getElementById('avail-employee-select').value;
    if (!employeeId) return;

    const loadId = `${employeeId}-${adminAvailDate.getFullYear()}-${adminAvailDate.getMonth()}`;
    loadAdminAvailability._currentLoad = loadId;

    const container = document.getElementById('admin-avail-grid');
    container.innerHTML = '';
    container.classList.remove('all-view');

    if (employeeId === 'all') { await loadAllAvailabilities(); return; }

    const year      = adminAvailDate.getFullYear();
    const month     = adminAvailDate.getMonth();
    const monthStr  = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const monthEnd  = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('admin-avail-month-label').textContent = `${monthNames[month]} ${year}`;

    const [{ data }, { data: vacations }] = await Promise.all([
        db.from('availability').select('*').eq('employee_id', employeeId).eq('month', monthStr).maybeSingle(),
        db.from('vacation_requests').select('start_date, end_date').eq('employee_id', employeeId).eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', monthStr),
    ]);

    if (loadAdminAvailability._currentLoad !== loadId) return;

    const availDays    = (data && !Array.isArray(data.available_days)) ? data.available_days : {};
    const daysInMonth  = new Date(year, month+1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const offset       = firstWeekday === 0 ? 6 : firstWeekday - 1;

    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
        const h = document.createElement('div'); h.className = 'calendar-day-header'; h.textContent = d; container.appendChild(h);
    });
    for (let i = 0; i < offset; i++) {
        const e = document.createElement('div'); e.className = 'avail-day'; e.style.visibility = 'hidden'; container.appendChild(e);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const entry   = availDays[d] || null;
        const status  = entry ? entry.status : null;
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isVac   = (vacations || []).some(v => v.start_date <= dateStr && v.end_date >= dateStr);
        const div     = document.createElement('div');
        div.className      = 'avail-day';
        div.style.cssText  = 'flex-direction:column; font-size:0.75rem; gap:2px; cursor:default;';
        if      (isVac)               div.style.background = '#D0E8FF';
        else if (status === 'school') div.style.background = '#E8D0FF';
        else if (status === 'full')   div.style.background = '#D8F0D8';
        else if (status === 'partial')div.style.background = '#FFF3CC';
        else if (status === 'off')    div.style.background = '#FFD9D9';
        const timeHtml    = (status === 'partial' && entry?.from) ? `<span style="font-size:0.6rem; line-height:1.2;">${entry.from}</span><span style="font-size:0.6rem; line-height:1.2;">${entry.to}</span>` : '';
        const commentHtml = entry?.comment ? `<span style="font-size:0.55rem; color:#888; line-height:1.2; white-space:normal; text-align:center;">${entry.comment}</span>` : '';
        div.innerHTML = `<span>${d}</span>${timeHtml}${commentHtml}`;
        container.appendChild(div);
    }
}

async function loadAllAvailabilities() {
    const year      = adminAvailDate.getFullYear();
    const month     = adminAvailDate.getMonth();
    const loadId    = `${year}-${month}`;
    loadAllAvailabilities._currentLoad = loadId;

    const monthStr  = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const monthStart = monthStr;
    const monthEnd  = `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    document.getElementById('admin-avail-month-label').textContent = `${monthNames[month]} ${year}`;

    const container = document.getElementById('admin-avail-grid');
    container.innerHTML = '';
    container.classList.add('all-view');

    for (const emp of employees) {
        if (loadAllAvailabilities._currentLoad !== loadId) return;
        const [{ data }, { data: vacations }] = await Promise.all([
            db.from('availability').select('*').eq('employee_id', emp.id).eq('month', monthStr).maybeSingle(),
            db.from('vacation_requests').select('start_date, end_date').eq('user_id', adminSession.user.id).eq('employee_id', emp.id).eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', monthStart),
        ]);
        if (loadAllAvailabilities._currentLoad !== loadId) return;

        const availDays    = (data && !Array.isArray(data.available_days)) ? data.available_days : {};
        const title        = document.createElement('div');
        title.style.cssText = 'font-weight:700; font-size:0.9rem; margin:1rem 0 0.5rem; color:var(--color-primary); max-width:480px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;';
        title.textContent  = emp.name;
        container.appendChild(title);

        const grid         = document.createElement('div');
        grid.className     = 'availability-grid';
        grid.style.marginBottom = '1.5rem';

        const daysInMonth  = new Date(year, month+1, 0).getDate();
        const firstWeekday = new Date(year, month, 1).getDay();
        const offset       = firstWeekday === 0 ? 6 : firstWeekday - 1;

        ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d => {
            const h = document.createElement('div'); h.className = 'calendar-day-header'; h.textContent = d; grid.appendChild(h);
        });
        for (let i = 0; i < offset; i++) {
            const e = document.createElement('div'); e.className = 'avail-day'; e.style.visibility = 'hidden'; grid.appendChild(e);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const entry   = availDays[d] || null;
            const status  = entry ? entry.status : null;
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isVac   = (vacations || []).some(v => v.start_date <= dateStr && v.end_date >= dateStr);
            const div     = document.createElement('div');
            div.className      = 'avail-day';
            div.style.cssText  = 'flex-direction:column; font-size:0.75rem; gap:2px; cursor:default;';
            if      (isVac)               div.style.background = '#D0E8FF';
            else if (status === 'school') div.style.background = '#E8D0FF';
            else if (status === 'full')   div.style.background = '#D8F0D8';
            else if (status === 'partial')div.style.background = '#FFF3CC';
            else if (status === 'off')    div.style.background = '#FFD9D9';
            const timeHtml    = (status === 'partial' && entry?.from) ? `<span style="font-size:0.6rem; line-height:1.2;">${entry.from}</span><span style="font-size:0.6rem; line-height:1.2;">${entry.to}</span>` : '';
            const commentHtml = entry?.comment ? `<span style="font-size:0.55rem; color:#888; white-space:normal; text-align:center;">${entry.comment}</span>` : '';
            div.innerHTML = `<span>${d}</span>${timeHtml}${commentHtml}`;
            grid.appendChild(div);
        }
        container.appendChild(grid);
    }
}

// ── TAUSCH / ABGABE ───────────────────────────────────────

async function loadAdminSwaps() {
    const { data: swaps } = await db
        .from('shift_swaps')
        .select('*, shifts!shift_id(shift_date, start_time, end_time), target:shifts!target_shift_id(shift_date, start_time, end_time), from_emp:employees_planit!from_employee_id(name), to_emp:employees_planit!to_employee_id(name)')
        .eq('user_id', adminSession.user.id)
        .eq('to_employee_status', 'accepted')
        .order('created_at', { ascending: false });

    const container = document.getElementById('admin-swap-list');
    if (!swaps || swaps.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Requests vorhanden.</p></div>';
        return;
    }

    container.innerHTML = swaps.map(s => {
        const colleagueStatus = s.to_employee_status === 'pending' ? '⏳ Wartet auf Kollege'
            : s.to_employee_status === 'accepted' ? '✓ Kollege akzeptiert'
            : '✗ Kollege abgelehnt';
        const canReview = s.status === 'pending' && s.to_employee_status === 'accepted';
        return `
            <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <h4>${s.from_emp?.name || '?'} ↔ ${s.to_emp?.name || '?'}</h4>
                    <span class="badge badge-${s.status}">
                        ${s.status === 'pending' ? 'Ausstehend' : s.status === 'approved' ? 'Genehmigt' : 'Abgelehnt'}
                    </span>
                </div>
                <div style="font-size:0.85rem; color:var(--color-text-light);">
                    ${s.from_emp?.name || '?'}: ${s.shifts ? formatShiftDate(s.shifts.shift_date) + ' ' + s.shifts.start_time.slice(0,5) + ' – ' + s.shifts.end_time.slice(0,5) : '—'}
                </div>
                <div style="font-size:0.85rem; color:var(--color-text-light);">
                    ${s.to_emp?.name || '?'}: ${s.target ? formatShiftDate(s.target.shift_date) + ' ' + s.target.start_time.slice(0,5) + ' – ' + s.target.end_time.slice(0,5) : '—'}
                </div>
                <div style="font-size:0.75rem; color:var(--color-text-light);">${colleagueStatus}</div>
                ${canReview ? `
                    <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
                        <button class="btn-small btn-approve btn-icon" onclick="reviewSwap('${s.id}', 'approved', '${s.shift_id}', '${s.target_shift_id}', '${s.from_employee_id}', '${s.to_employee_id}')">
                            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <button class="btn-small btn-reject btn-icon" onclick="reviewSwap('${s.id}', 'rejected', null, null, null, null)">
                            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                ` : ''}
            </div>`;
    }).join('');

    // Abzugebende Schichten laden
    const { data: handoverShifts } = await db
        .from('shifts')
        .select('*, employees_planit!shifts_employee_id_fkey(name, department)')
        .eq('user_id', adminSession.user.id)
        .eq('handover_requested', true)
        .gte('shift_date', new Date().toISOString().split('T')[0])
        .order('shift_date');

    const handoverContainer = document.getElementById('admin-handover-list');
    if (!handoverShifts || handoverShifts.length === 0) {
        handoverContainer.innerHTML = '<div class="empty-state"><p>Keine Requests vorhanden.</p></div>';
        return;
    }

    const handoverHTML = await Promise.all(handoverShifts.map(async s => {
        const { data: applicants } = await db
            .from('shift_handovers')
            .select('*, to_emp:employees_planit!to_employee_id(name)')
            .eq('shift_id', s.id)
            .eq('status', 'pending');

        const applicantsList = applicants && applicants.length > 0
            ? applicants.map(a => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.3rem 0; border-bottom:1px solid var(--color-border);">
                    <span style="font-size:0.85rem;">${a.to_emp?.name || '—'}</span>
                    <button class="btn-small btn-pdf-view btn-icon" onclick="approveHandover('${s.id}', '${a.to_employee_id}')">
                        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                </div>`).join('')
            : '<div style="font-size:0.85rem; color:var(--color-text-light);">Noch niemand gemeldet.</div>';

        return `
            <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:0.5rem;">
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <h4>${s.employees_planit?.name || '?'} gibt ab</h4>
                    <button class="btn-small btn-pdf-view btn-icon" onclick="cancelHandover('${s.id}')">
                        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div style="font-size:0.85rem; color:var(--color-text-light);">
                    ${formatShiftDate(s.shift_date)} | ${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)} Uhr · ${s.employees_planit?.department || ''}
                </div>
                <div style="font-weight:600; font-size:0.8rem; margin-top:0.25rem;">Interessenten:</div>
                ${applicantsList}
            </div>`;
    }));

    handoverContainer.innerHTML = handoverHTML.join('');
}

async function approveHandover(shiftId, toEmpId) {
    await db.from('shifts')
        .update({ employee_id: toEmpId, handover_requested: false })
        .eq('id', shiftId);
    await db.from('shift_handovers')
        .update({ status: 'rejected' })
        .eq('shift_id', shiftId);
    await db.from('shift_handovers')
        .update({ status: 'approved' })
        .eq('shift_id', shiftId)
        .eq('to_employee_id', toEmpId);
    await loadAdminSwaps();
    await loadWeekGrid();
}

async function cancelHandover(shiftId) {
    await db.from('shifts')
        .update({ handover_requested: false })
        .eq('id', shiftId);
    await db.from('shift_handovers')
        .update({ status: 'rejected' })
        .eq('shift_id', shiftId);
    await loadAdminSwaps();
}

async function reviewSwap(id, status, shiftId, targetShiftId, fromEmpId, toEmpId) {
    await db.from('shift_swaps').update({
        status,
        reviewed_at: new Date().toISOString()
    }).eq('id', id);

    if (status === 'approved') {
        await db.from('shifts').update({ employee_id: toEmpId }).eq('id', shiftId);
        await db.from('shifts').update({ employee_id: fromEmpId }).eq('id', targetShiftId);
    }

    await loadAdminSwaps();
    await loadWeekGrid();
}

window.toggleOpenShift = function() {
    const isOpen    = document.getElementById('shift-is-open').checked;
    const empGroup  = document.getElementById('shift-employee').closest('.form-group');
    if (empGroup) empGroup.style.display = isOpen ? 'none' : '';
    const openNoteGroup = document.getElementById('shift-open-note-group');
    if (openNoteGroup) openNoteGroup.style.display = isOpen ? '' : 'none';
    document.getElementById('shift-employee').disabled = isOpen;
};

function formatShiftDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

window.publishSchedule = async function() {
    const btn = document.getElementById('publish-schedule-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
        const res = await fetch('https://gastrohub-notify.artsem86.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Schichtplan',
                message: 'Dein Schichtplan für diese Woche wurde veröffentlicht.'
            })
        });
        const body = await res.text();
        console.log('[publishSchedule] status:', res.status, '| body:', body);
        if (btn) { btn.textContent = 'Gesendet ✓'; setTimeout(() => { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }, 2500); }
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Veröffentlichen'; }
        alert('Fehler beim Senden der Benachrichtigung.');
    }
}

