// ── OVERVIEW ──────────────────────────────────────────────
async function loadOverview() {
    const now = overviewDate;
    const today = new Date().toISOString().split('T')[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const monthEnd   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()}`;
    const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
    const dayNames   = ['So','Mo','Di','Mi','Do','Fr','Sa'];

    document.getElementById('overview-month').textContent      = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    document.getElementById('overview-open-month').textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

    const [
        { data: sickLeave },
        { data: termination },
        { data: shifts },
        { data: sickShifts },
        { data: mySickLeave },
    ] = await Promise.all([
        db.from('sick_leaves').select('start_date, end_date')
            .eq('employee_id', currentEmployee.id)
            .gte('end_date', today).order('start_date').limit(1).maybeSingle(),
        db.from('planit_terminations').select('id, created_at, requested_date, status')
            .eq('employee_id', currentEmployee.id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('shifts').select('*')
            .eq('employee_id', currentEmployee.id)
            .gte('shift_date', monthStart).lte('shift_date', monthEnd).order('shift_date'),
        db.from('shifts').select('*')
            .eq('user_id', currentEmployee.user_id)
            .eq('is_open', true).eq('open_note', 'Krankmeldung')
            .gte('shift_date', monthStart).lte('shift_date', monthEnd).order('shift_date'),
        db.from('sick_leaves').select('start_date, end_date')
            .eq('employee_id', currentEmployee.id)
            .gte('end_date', monthStart).lte('start_date', monthEnd).maybeSingle(),
    ]);

    // ── Krankmeldungs-Karte ───────────────────────────────
    const sickCard = document.getElementById('sick-leave-card');
    if (sickLeave) {
        sickCard.style.display = 'block';
        sickCard.innerHTML = `
            <div style="background:#FFE8D0; border-radius:12px; padding:1rem; margin-bottom:1rem; display:flex; align-items:center; gap:0.75rem;">
                <span style="font-size:1.5rem;">🤒</span>
                <div>
                    <div style="font-weight:700; font-size:0.95rem;">Du bist krank gemeldet</div>
                    <div style="font-size:0.85rem; color:#E07040;">${formatDate(sickLeave.start_date)} – ${formatDate(sickLeave.end_date)}</div>
                </div>
            </div>`;
    } else {
        sickCard.style.display = 'none';
    }

    // ── Kündigungs-Karte ──────────────────────────────────
    const terminationCard = document.getElementById('termination-info-card');
    if (termination) {
        const submittedDate = new Date(termination.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
        const lastDay = termination.requested_date
            ? new Date(termination.requested_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
            : '–';
        const badgeColor = termination.status === 'approved' ? '#2d7a2d' : termination.status === 'rejected' ? 'var(--color-danger)' : '#B8860B';
        const badgeBg    = termination.status === 'approved' ? '#E6F4E6' : termination.status === 'rejected' ? '#FFE8E8' : '#FFF3CD';
        const badgeLabel = termination.status === 'approved' ? 'Genehmigt' : termination.status === 'rejected' ? 'Abgelehnt' : 'Ausstehend';
        terminationCard.style.display = 'block';
        terminationCard.innerHTML = `
            <div class="card" style="margin-bottom:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <div style="font-weight:700; font-size:0.95rem;">Kündigung eingereicht</div>
                    <span style="font-size:0.78rem; font-weight:700; color:${badgeColor}; background:${badgeBg}; border-radius:6px; padding:0.2rem 0.55rem;">${badgeLabel}</span>
                </div>
                ${termination.status === 'approved' ? `<div style="font-size:0.9rem; font-weight:600; color:#2d7a2d; margin-bottom:0.4rem;">Letzter Arbeitstag: ${lastDay}</div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <div>
                        <div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.2rem;">Eingereicht am: ${submittedDate}</div>
                        <div style="font-size:0.85rem; color:var(--color-text-light);">Gewünschter letzter Arbeitstag: <strong>${lastDay}</strong></div>
                    </div>
                    ${termination.status !== 'approved' ? `<button class="btn-small btn-delete btn-icon" onclick="deleteOwnTermination('${termination.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>` : ''}
                </div>
            </div>`;
    } else {
        terminationCard.style.display = 'none';
    }

    // ── Meine Schichten ───────────────────────────────────
    const mySickShifts = (sickShifts || []).filter(s =>
        mySickLeave && s.shift_date >= mySickLeave.start_date && s.shift_date <= mySickLeave.end_date
    );

    const listEl = document.getElementById('overview-shifts-list');
    listEl.innerHTML = '';

    mySickShifts.forEach(s => {
        const d = new Date(s.shift_date + 'T12:00:00');
        const row = document.createElement('div');
        row.style.cssText = `display:flex; align-items:center; gap:1rem; padding:0.75rem; border-radius:12px; margin-bottom:0.5rem; background:#FFF0F0;`;
        row.innerHTML = `
            <div style="min-width:2.5rem; text-align:center;">
                <div style="font-size:1.3rem; font-weight:700; line-height:1; color:#C97E7E;">${d.getDate()}</div>
                <div style="font-size:0.7rem; color:var(--color-text-light);">${dayNames[d.getDay()]}</div>
            </div>
            <div style="flex:1; background:white; border-radius:10px; padding:0.6rem 0.75rem;">
                <div style="font-weight:700; font-size:0.95rem; color:#C97E7E;">${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}</div>
                <div style="font-size:0.8rem; color:#C97E7E;">Krankmeldung</div>
            </div>`;
        listEl.appendChild(row);
    });

    const allShifts = shifts || [];

    if (allShifts.length === 0) {
        listEl.innerHTML = '<div style="color:var(--color-text-light); font-size:0.9rem;">Keine Schichten diesen Monat</div>';
    } else {
        const makeRow = (s, highlighted) => {
            const d           = new Date(s.shift_date + 'T12:00:00');
            const isPast      = s.shift_date < today;
            const innerBg     = isPast ? '#C9A24D' : 'white';
            const innerBorder = highlighted ? `box-shadow:0 0 0 2px var(--color-primary);` : '';
            const row = document.createElement('button');
            row.style.cssText = `display:flex; align-items:center; gap:1rem; padding:0.75rem; border-radius:12px; margin-bottom:0.5rem; background:var(--color-gray); cursor:pointer; width:100%; border:none; text-align:left; touch-action:manipulation;`;
            row.innerHTML = `
                <div style="min-width:2.5rem; text-align:center;">
                    <div style="font-size:1.3rem; font-weight:700; line-height:1; color:#2C3E50;">${d.getDate()}</div>
                    <div style="font-size:0.7rem; color:var(--color-text-light);">${dayNames[d.getDay()]}</div>
                </div>
                <div style="flex:1; background:${innerBg}; border-radius:10px; padding:0.6rem 0.75rem; ${innerBorder}">
                    <div style="font-weight:${highlighted ? '800' : '700'}; font-size:0.95rem; color:#2C3E50;">${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}</div>
                    ${s.notes ? `<div style="font-size:0.8rem; color:var(--color-text-light);">${s.notes}</div>` : ''}
                </div>`;
            row.onclick = () => openColleaguesModal(s);
            return row;
        };

        const nextIdx      = allShifts.findIndex(s => s.shift_date >= today);
        const centerIdx    = nextIdx >= 0 ? nextIdx : allShifts.length - 1;
        const visibleStart = Math.max(0, centerIdx - 1);
        const visibleEnd   = Math.min(allShifts.length, visibleStart + 3);
        const visible      = allShifts.slice(visibleStart, visibleEnd);
        const hidden       = [...allShifts.slice(0, visibleStart), ...allShifts.slice(visibleEnd)];

        visible.forEach((s, i) => listEl.appendChild(makeRow(s, visibleStart + i === centerIdx)));

        if (hidden.length > 0) {
            const moreContainer = document.createElement('div');
            moreContainer.id = 'overview-shifts-more';
            moreContainer.style.display = 'none';
            const pastHidden   = allShifts.slice(0, visibleStart);
            const futureHidden = allShifts.slice(visibleEnd);
            pastHidden.forEach(s => listEl.insertBefore(makeRow(s, false), listEl.firstChild));
            futureHidden.forEach(s => moreContainer.appendChild(makeRow(s, false)));
            listEl.appendChild(moreContainer);

            const btn = document.createElement('button');
            btn.className = 'btn-secondary';
            btn.style.cssText = 'width:100%; margin-top:0.25rem; font-size:1rem; padding:0.4rem;';
            btn.textContent = '▼';
            let expanded = false;
            btn.onclick = () => {
                expanded = !expanded;
                moreContainer.style.display = expanded ? 'block' : 'none';
                listEl.querySelectorAll('[data-past]').forEach(r => r.style.display = expanded ? 'flex' : 'none');
                btn.textContent = expanded ? '▲' : '▼';
            };
            Array.from(listEl.children).slice(0, pastHidden.length).forEach(r => {
                r.dataset.past = '1';
                r.style.display = 'none';
            });
            listEl.appendChild(btn);
        }
    }

    // ── Offene Schichten ──────────────────────────────────
    const { data: openShifts } = await db
        .from('shifts').select('*')
        .eq('user_id', currentEmployee.user_id)
        .eq('is_open', true)
        .is('employee_id', null)
        .gte('shift_date', monthStart).lte('shift_date', monthEnd)
        .order('shift_date');

    const filteredOpenShifts = (openShifts || []).filter(s => {
        if (s.open_note === 'Krankmeldung' && mySickLeave &&
            s.shift_date >= mySickLeave.start_date && s.shift_date <= mySickLeave.end_date) {
            return false;
        }
        return true;
    });

    const openEl = document.getElementById('overview-open-list');
    openEl.innerHTML = '';

    if (filteredOpenShifts.length === 0) {
        openEl.innerHTML = '<div style="color:var(--color-text-light); font-size:0.9rem;">Keine offenen Schichten</div>';
    } else {
        filteredOpenShifts.forEach(s => {
            const d = new Date(s.shift_date + 'T12:00:00');
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; gap:1rem; padding:0.75rem; border-radius:12px; margin-bottom:0.5rem; background:#FFF0F0; cursor:pointer;`;
            row.innerHTML = `
                <div style="min-width:2.5rem; text-align:center;">
                    <div style="font-size:1.3rem; font-weight:700; line-height:1; color:#C97E7E;">${d.getDate()}</div>
                    <div style="font-size:0.7rem; color:var(--color-text-light);">${dayNames[d.getDay()]}</div>
                </div>
                <div style="flex:1; background:white; border-radius:10px; padding:0.6rem 0.75rem;">
                    <div style="font-weight:700; font-size:0.95rem; color:#C97E7E;">${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}</div>
                </div>`;
            row.onclick = () => openRequestModal(s);
            openEl.appendChild(row);
        });
    }

    // ── Hygiene-Info-Karte ────────────────────────────────
    const [{ data: hygieneEmp }, { data: hygieneRestaurant }] = await Promise.all([
        db.from('employees_planit')
            .select('hygiene_erste, hygiene_letzte, hygiene_gueltig_monate')
            .eq('id', currentEmployee.id).maybeSingle(),
        db.from('planit_restaurants')
            .select('hygiene_link_erst, hygiene_link_erneuerung')
            .eq('user_id', currentEmployee.user_id).maybeSingle(),
    ]);

    const hygieneErste   = hygieneEmp?.hygiene_erste  || null;
    const hygieneLetzte  = hygieneEmp?.hygiene_letzte || null;
    const hygieneMonate  = hygieneEmp?.hygiene_gueltig_monate ?? 12;
    const linkErst       = hygieneRestaurant?.hygiene_link_erst || null;
    const linkErneuerung = hygieneRestaurant?.hygiene_link_erneuerung || null;
    const hygieneCard    = document.getElementById('hygiene-info-card');

    if (hygieneErste || hygieneLetzte) {
        const basis    = hygieneLetzte || hygieneErste;
        const naechste = new Date(basis + 'T00:00:00');
        naechste.setMonth(naechste.getMonth() + hygieneMonate);
        const naechsteStr = naechste.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
        const todayMs = new Date(); todayMs.setHours(0,0,0,0);
        const diff    = (naechste - todayMs) / (1000 * 60 * 60 * 24);

        let badgeBg, badgeColor, badgeText;
        if (diff < 0)        { badgeBg = '#FFE8E8'; badgeColor = '#C0392B'; badgeText = 'Abgelaufen — bitte sofort erneuern'; }
        else if (diff < 14)  { badgeBg = '#FFF3CD'; badgeColor = '#856404'; badgeText = 'Bitte bald erneuern'; }
        else                 { badgeBg = '#D4EDDA'; badgeColor = '#155724'; badgeText = 'Gültig'; }

        let actionBtn = '';
        if (!hygieneErste && linkErst) {
            actionBtn = `<a href="${linkErst}" target="_blank" rel="noopener" style="display:inline-block; margin-top:0.75rem; padding:0.45rem 1rem; background:var(--color-primary); color:#fff; border-radius:8px; font-size:0.85rem; font-weight:600; text-decoration:none;">Erstbelehrung</a>`;
        } else if (diff < 14 && linkErneuerung) {
            actionBtn = `<a href="${linkErneuerung}" target="_blank" rel="noopener" style="display:inline-block; margin-top:0.75rem; padding:0.45rem 1rem; background:var(--color-primary); color:#fff; border-radius:8px; font-size:0.85rem; font-weight:600; text-decoration:none;">Jetzt erneuern</a>`;
        }

        hygieneCard.innerHTML = `
            <div class="card" style="margin-bottom:1rem; margin-top:1rem;">
                <div style="font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">Hygieneschutzbelehrung</div>
                <div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.5rem;">Nächste Erneuerung: <strong>${naechsteStr}</strong></div>
                <span style="font-size:0.8rem; font-weight:600; color:${badgeColor}; background:${badgeBg}; border-radius:6px; padding:0.2rem 0.55rem;">${badgeText}</span>
                ${actionBtn}
            </div>`;
    } else if (linkErst) {
        hygieneCard.innerHTML = `
            <div class="card" style="margin-bottom:1rem; margin-top:1rem;">
                <div style="font-weight:700; font-size:0.95rem; margin-bottom:0.5rem;">Hygieneschutzbelehrung</div>
                <a href="${linkErst}" target="_blank" rel="noopener" style="display:inline-block; margin-top:0.25rem; padding:0.45rem 1rem; background:var(--color-primary); color:#fff; border-radius:8px; font-size:0.85rem; font-weight:600; text-decoration:none;">Erstbelehrung</a>
            </div>`;
    } else {
        hygieneCard.innerHTML = '';
    }
}

function changeOverviewMonth(dir) {
    overviewDate.setMonth(overviewDate.getMonth() + dir);
    loadOverview();
}

// ── KOLLEGEN-MODAL ────────────────────────────────────────
const _colleaguesCache = {};

async function openColleaguesModal(shift) {
    const dateStr  = shift.shift_date;
    const myDept   = shift.department || currentEmployee.department;
    const d        = new Date(dateStr + 'T12:00:00');
    const dayNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];
    const label    = `${d.getDate()}. ${d.toLocaleDateString('de-DE', { month: 'long' })} — ${dayNames[d.getDay()]}`;

    document.getElementById('colleagues-modal-title').textContent = label;
    document.getElementById('colleagues-modal').classList.add('open');

    let dayShifts;
    if (_colleaguesCache[dateStr]) {
        dayShifts = _colleaguesCache[dateStr];
    } else {
        document.getElementById('colleagues-modal-body').innerHTML = '<div style="color:var(--color-text-light); font-size:0.9rem;">Lädt…</div>';
        const { data } = await db
            .from('shifts')
            .select('start_time, end_time, department, employees_planit!shifts_employee_id_fkey(name)')
            .eq('user_id', currentEmployee.user_id)
            .eq('shift_date', dateStr)
            .eq('is_open', false)
            .neq('employee_id', currentEmployee.id);
        dayShifts = data || [];
        _colleaguesCache[dateStr] = dayShifts;
    }

    const colleagues = dayShifts.filter(s => (s.department || currentEmployee.department) === myDept);
    const body = document.getElementById('colleagues-modal-body');

    if (colleagues.length === 0) {
        body.innerHTML = '<div style="color:var(--color-text-light); font-size:0.9rem;">Keine Kollegen an diesem Tag in deiner Abteilung.</div>';
        return;
    }

    colleagues.sort((a, b) => a.start_time.localeCompare(b.start_time));
    body.innerHTML = colleagues.map(s => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid var(--color-border);">
            <div style="font-weight:600; font-size:0.95rem;">${s.employees_planit?.name || '—'}</div>
            <div style="font-size:0.85rem; color:var(--color-text-light);">${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}</div>
        </div>`).join('');
}

function closeColleaguesModal() {
    document.getElementById('colleagues-modal').classList.remove('open');
}

// ── MENÜ-SICHTBARKEIT ─────────────────────────────────────
async function checkTrinkgeldVisibility() {
    const { data: config } = await db
        .from('tip_config')
        .select('show_to_employees')
        .eq('user_id', currentEmployee.user_id)
        .maybeSingle();
    const menuItem = document.getElementById('trinkgeld-menu-item');
    if (menuItem) menuItem.style.display = config?.show_to_employees ? 'flex' : 'none';
}

async function checkInventurVisibility() {
    const menuItem = document.getElementById('inventur-emp-menu-item');
    if (!menuItem) return;
    const { data } = await db
        .from('employees_planit')
        .select('can_do_inventory')
        .eq('id', currentEmployee.id)
        .maybeSingle();
    menuItem.style.display = data?.can_do_inventory ? 'flex' : 'none';
}

async function checkTemperatureVisibility() {
    const menuItem = document.getElementById('temperature-emp-menu-item');
    if (!menuItem) return;
    const { data } = await db
        .from('employees_planit')
        .select('can_do_temperature')
        .eq('id', currentEmployee.id)
        .maybeSingle();
    menuItem.style.display = data?.can_do_temperature ? 'flex' : 'none';
}

function checkTimeclockVisibility() {
    const section = document.getElementById('timeclock-emp-section');
    if (section) section.style.display = currentEmployee.can_do_timeclock ? 'block' : 'none';
}

// ── MOBILE ZEITERFASSUNG ──────────────────────────────────
let empTimerInterval     = null;
let empClockTickInterval = null;
let empBreakTickInterval = null;
let empClockInTime       = null;
let empBreakStartTime    = null;
let empActiveBreakId     = null;
let empTimeEntryId       = null;

function empSetUI(isClockedIn, onBreak) {
    const btnIn  = document.getElementById('btn-emp-clock-in');
    const btnOut = document.getElementById('btn-emp-clock-out');
    const btnBS  = document.getElementById('btn-emp-break-start');
    const btnBE  = document.getElementById('btn-emp-break-end');
    const wrkBox = document.getElementById('timeclock-emp-arbeitszeit-box');
    const brkBox = document.getElementById('timeclock-emp-pause-box');
    const setBtn = (btn, disabled) => {
        if (!btn) return;
        btn.disabled      = disabled;
        btn.style.opacity = disabled ? '0.5' : '1';
        btn.style.cursor  = disabled ? 'default' : 'pointer';
    };
    setBtn(btnIn,  isClockedIn);
    setBtn(btnOut, !isClockedIn || onBreak);
    setBtn(btnBS,  !isClockedIn || onBreak);
    setBtn(btnBE,  !onBreak);
    if (wrkBox) wrkBox.style.display = isClockedIn ? 'flex' : 'none';
    if (brkBox) brkBox.style.display = onBreak     ? 'flex' : 'none';
}

function startEmpClock() {
    const clockEl = document.getElementById('timeclock-emp-clock');
    clearInterval(empClockTickInterval);
    const tick = () => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('de-DE'); };
    tick();
    empClockTickInterval = setInterval(tick, 1000);
}

async function loadEmpTimeclock() {
    if (!currentEmployee.can_do_timeclock) return;
    startEmpClock();
    empSetUI(false, false);
    const { data: entry } = await db
        .from('gh_time_entries')
        .select('id, clock_in')
        .eq('employee_id', currentEmployee.id)
        .is('clock_out', null)
        .maybeSingle();
    if (!entry) return;
    empClockInTime = new Date(entry.clock_in);
    empTimeEntryId = entry.id;
    startEmpTimer();
    const { data: brk } = await db
        .from('gh_breaks')
        .select('id, break_start')
        .eq('employee_id', currentEmployee.id)
        .eq('time_entry_id', entry.id)
        .is('break_end', null)
        .maybeSingle();
    if (brk) {
        empActiveBreakId  = brk.id;
        empBreakStartTime = new Date(brk.break_start);
        startEmpBreakTimer();
    }
    empSetUI(true, !!brk);
}

async function empClockIn() {
    const { data, error } = await db.from('gh_time_entries').insert({
        employee_id: currentEmployee.id,
        user_id:     currentEmployee.user_id,
        clock_in:    new Date().toISOString(),
        is_manual:   false,
    }).select('id').single();
    if (error) return;
    empClockInTime = new Date();
    empTimeEntryId = data.id;

    const today = empClockInTime.toISOString().split('T')[0];
    const { data: existingShift } = await db.from('shifts')
        .select('id').eq('user_id', currentEmployee.user_id)
        .eq('employee_id', currentEmployee.id).eq('shift_date', today).maybeSingle();
    if (!existingShift) {
        const p = n => String(n).padStart(2, '0');
        const startTime = `${p(empClockInTime.getHours())}:${p(empClockInTime.getMinutes())}`;
        const endTime   = `${p((empClockInTime.getHours() + 8) % 24)}:${p(empClockInTime.getMinutes())}`;
        await db.from('shifts').insert({
            user_id: currentEmployee.user_id, employee_id: currentEmployee.id,
            shift_date: today, start_time: startTime, end_time: endTime,
            break_minutes: 0, is_open: false, is_unplanned: true,
        });
    }

    empSetUI(true, false);
    startEmpTimer();
}

async function empClockOut() {
    const { data } = await db
        .from('gh_time_entries')
        .select('id')
        .eq('employee_id', currentEmployee.id)
        .is('clock_out', null)
        .maybeSingle();
    if (!data) return;
    await db.from('gh_time_entries')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', data.id);
    clearInterval(empTimerInterval);
    clearInterval(empBreakTickInterval);
    empTimerInterval     = null;
    empBreakTickInterval = null;
    empClockInTime       = null;
    empTimeEntryId       = null;
    empActiveBreakId     = null;
    empBreakStartTime    = null;
    empSetUI(false, false);
}

async function empBreakStart() {
    if (!empTimeEntryId) return;
    const now = new Date().toISOString();
    const { data, error } = await db.from('gh_breaks').insert({
        user_id:       currentEmployee.user_id,
        employee_id:   currentEmployee.id,
        time_entry_id: empTimeEntryId,
        break_start:   now,
    }).select('id').single();
    if (error) return;
    empActiveBreakId  = data.id;
    empBreakStartTime = new Date(now);
    empSetUI(true, true);
    startEmpBreakTimer();
}

async function empBreakEnd() {
    if (!empActiveBreakId) return;
    await db.from('gh_breaks')
        .update({ break_end: new Date().toISOString() })
        .eq('id', empActiveBreakId);
    clearInterval(empBreakTickInterval);
    empBreakTickInterval = null;
    empActiveBreakId     = null;
    empBreakStartTime    = null;
    empSetUI(true, false);
}

function startEmpTimer() {
    clearInterval(empTimerInterval);
    empTimerInterval = setInterval(() => {
        const el = document.getElementById('timeclock-emp-timer');
        if (!el || !empClockInTime) return;
        const s = Math.max(0, Math.floor((Date.now() - empClockInTime.getTime()) / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        el.textContent = (h > 0 ? h + 'h ' : '') + m + 'min';
    }, 1000);
}

function startEmpBreakTimer() {
    clearInterval(empBreakTickInterval);
    empBreakTickInterval = setInterval(() => {
        const el = document.getElementById('timeclock-emp-break-timer');
        if (!el || !empBreakStartTime) return;
        const s = Math.floor((Date.now() - empBreakStartTime.getTime()) / 1000);
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        el.textContent = (h > 0 ? h + 'h ' : '') + m + 'min';
    }, 1000);
}

// ── KÜNDIGUNG (eigene zurückziehen) ───────────────────────
async function deleteOwnTermination(id) {
    if (!confirm('Kündigungsantrag wirklich zurückziehen?')) return;
    await db.from('planit_terminations').delete().eq('id', id);
    loadOverview();
}
