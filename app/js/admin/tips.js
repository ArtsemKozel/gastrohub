// ── TRINKGELD (ADMIN) ─────────────────────────────────────

function changeTrinkgeldMonth(dir) {
    trinkgeldDate.setMonth(trinkgeldDate.getMonth() + dir);
    loadTrinkgeld();
}

async function loadTrinkgeld() {
    const year        = trinkgeldDate.getFullYear();
    const month       = trinkgeldDate.getMonth();
    const monthStr    = `${year}-${String(month + 1).padStart(2, '0')}`;
    const label       = trinkgeldDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('trinkgeld-month-label').textContent = label;

    const firstDay    = `${monthStr}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDay     = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    const [
        { data: entries },
        { data: depts },
        { data: monthShifts },
        { data: sickLeaves },
    ] = await Promise.all([
        db.from('tip_entries').select('*').eq('user_id', adminSession.user.id).gte('entry_date', firstDay).lte('entry_date', lastDay).order('entry_date', { ascending: false }),
        db.from('tip_departments').select('*').eq('user_id', adminSession.user.id),
        db.from('shifts').select('employee_id,shift_date,start_time,end_time,break_minutes,actual_start_time,actual_end_time,actual_break_minutes,department').eq('user_id', adminSession.user.id).eq('is_open', false).gte('shift_date', firstDay).lte('shift_date', lastDay),
        db.from('sick_leaves').select('employee_id,start_date,end_date').eq('user_id', adminSession.user.id).lte('start_date', lastDay).gte('end_date', firstDay),
    ]);

    // Schichten in tip_hours synchronisieren
    const tipHoursRows = [];
    for (const shift of (monthShifts || [])) {
        if (!shift.employee_id) continue;
        const d = shift.shift_date;
        if ((sickLeaves || []).some(s => s.employee_id === shift.employee_id && s.start_date <= d && s.end_date >= d)) continue;
        const startStr = shift.actual_start_time || shift.start_time;
        const endStr   = shift.actual_end_time   || shift.end_time;
        const breakMin = shift.actual_break_minutes ?? shift.break_minutes ?? 0;
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        const minutes  = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
        if (minutes <= 0) continue;
        tipHoursRows.push({ user_id: adminSession.user.id, employee_id: shift.employee_id, work_date: d, minutes, department: shift.department || null });
    }
    if (tipHoursRows.length > 0) {
        await db.from('tip_hours').upsert(tipHoursRows, { onConflict: 'user_id,employee_id,work_date,department' });
    }

    const { data: tipHours } = await db.from('tip_hours').select('*, employees_planit(name, department)').eq('user_id', adminSession.user.id).gte('work_date', firstDay).lte('work_date', lastDay);

    // Fehlende Tage anlegen
    const existingDates = new Set((entries || []).map(e => e.entry_date));
    const toInsert = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
        if (!existingDates.has(dateStr)) {
            toInsert.push({ user_id: adminSession.user.id, entry_date: dateStr, amount_card: 0, amount_cash: 0 });
        }
    }
    if (toInsert.length > 0) {
        await db.from('tip_entries').upsert(toInsert, { onConflict: 'user_id,entry_date' });
        toInsert.forEach(e => (entries || []).push(e));
    }

    const allDates = [];
    for (let d = 1; d <= daysInMonth; d++) allDates.push(`${monthStr}-${String(d).padStart(2, '0')}`);

    // Pool-Berechnungen
    const poolDeptMonthMinutes = {};
    const poolEmpMonthShares   = {};
    for (const dept of (depts || [])) {
        if (!dept.pool_department) continue;
        const deptHours = (tipHours || []).filter(h => (h.department || h.employees_planit.department) === dept.department);
        const totalMins = deptHours.reduce((sum, h) => sum + h.minutes, 0);
        poolDeptMonthMinutes[dept.department] = totalMins;
        const empTotals = {};
        for (const h of deptHours) empTotals[h.employee_id] = (empTotals[h.employee_id] || 0) + h.minutes;
        poolEmpMonthShares[dept.department] = {};
        if (totalMins > 0) {
            for (const [empId, mins] of Object.entries(empTotals)) {
                poolEmpMonthShares[dept.department][empId] = mins / totalMins;
            }
        }
    }

    const empMonthTotals = {};
    const dayResults = {};

    for (const dateStr of allDates) {
        const dayEntry = (entries || []).find(e => e.entry_date === dateStr);
        const dayCard  = dayEntry ? parseFloat(dayEntry.amount_card) : 0;
        const dayCash  = dayEntry ? parseFloat(dayEntry.amount_cash) : 0;
        const dayHours = (tipHours || []).filter(h => h.work_date === dateStr);
        dayResults[dateStr] = { card: dayCard, cash: dayCash, hours: dayHours, empResults: {} };

        if (dayCard === 0 && dayCash === 0 && dayHours.length === 0) continue;
        if (!depts || depts.length === 0) continue;

        for (const dept of depts) {
            if (dept.pool_department) continue;
            const deptDayCard = dayCard * (dept.percentage / 100);
            const deptDayCash = dayCash * (dept.percentage / 100);
            const poolDepts   = depts.filter(d => d.pool_department === dept.department);

            const empDayMinutes = {};
            let totalDeptMinutes = 0;
            for (const h of dayHours) {
                const hDept = h.department || h.employees_planit.department;
                if (hDept !== dept.department) continue;
                empDayMinutes[h.employee_id] = (empDayMinutes[h.employee_id] || 0) + h.minutes;
                totalDeptMinutes += h.minutes;
            }

            const poolDailyAvg = {};
            for (const poolDept of poolDepts) {
                const avg = (poolDeptMonthMinutes[poolDept.department] || 0) / daysInMonth;
                poolDailyAvg[poolDept.department] = avg;
                totalDeptMinutes += avg;
            }

            if (totalDeptMinutes === 0) continue;

            for (const [empId, minutes] of Object.entries(empDayMinutes)) {
                const share = minutes / totalDeptMinutes;
                const key   = empId + '__' + dept.department;
                if (!dayResults[dateStr].empResults[key]) dayResults[dateStr].empResults[key] = { empId, dept: dept.department, card: 0, cash: 0 };
                dayResults[dateStr].empResults[key].card += deptDayCard * share;
                dayResults[dateStr].empResults[key].cash += deptDayCash * share;
                if (!empMonthTotals[empId]) empMonthTotals[empId] = { card: 0, cash: 0 };
                empMonthTotals[empId].card += deptDayCard * share;
                empMonthTotals[empId].cash += deptDayCash * share;
            }

            for (const poolDept of poolDepts) {
                const poolShare   = poolDailyAvg[poolDept.department] / totalDeptMinutes;
                const poolDayCard = deptDayCard * poolShare;
                const poolDayCash = deptDayCash * poolShare;
                const shares      = poolEmpMonthShares[poolDept.department] || {};
                for (const [empId, empShare] of Object.entries(shares)) {
                    const key = empId + '__' + poolDept.department;
                    if (!dayResults[dateStr].empResults[key]) dayResults[dateStr].empResults[key] = { empId, dept: poolDept.department, card: 0, cash: 0 };
                    dayResults[dateStr].empResults[key].card += poolDayCard * empShare;
                    dayResults[dateStr].empResults[key].cash += poolDayCash * empShare;
                    if (!empMonthTotals[empId]) empMonthTotals[empId] = { card: 0, cash: 0 };
                    empMonthTotals[empId].card += poolDayCard * empShare;
                    empMonthTotals[empId].cash += poolDayCash * empShare;
                }
            }
        }
    }

    // Tage rendern
    const daysContainer = document.getElementById('trinkgeld-days-list');
    if (allDates.length === 0) {
        daysContainer.innerHTML = '<div class="empty-state"><p>Keine Einträge vorhanden.</p></div>';
    } else {
        daysContainer.innerHTML = '<style>.tip-emp-col{display:inline-block;}.tip-emp-split{display:none;}@media(max-width:480px){.tip-emp-col,.tip-emp-total{display:none!important;}.tip-emp-split{display:block!important;}}</style>' + allDates.map(dateStr => {
            const d         = dayResults[dateStr];
            const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
            const total     = (d.card + d.cash).toFixed(2);

            const getEmpName = empId => {
                const fromHours = (tipHours || []).find(h => h.employee_id === empId);
                if (fromHours) return fromHours.employees_planit.name;
                const fromEmp = employees.find(e => e.id === empId);
                return fromEmp ? fromEmp.name : empId;
            };

            const empResultsSorted = Object.values(d.empResults).sort((a, b) => {
                const deptCmp = (a.dept || 'zzz').localeCompare(b.dept || 'zzz');
                if (deptCmp !== 0) return deptCmp;
                return getEmpName(a.empId).localeCompare(getEmpName(b.empId));
            });

            let lastDept = null;
            const empRows = empResultsSorted.map(r => {
                const name        = getEmpName(r.empId);
                const currentDept = r.dept;
                let deptHeader    = '';
                if (currentDept && currentDept !== lastDept) {
                    lastDept = currentDept;
                    deptHeader = `<div style="font-size:0.75rem; font-weight:700; color:var(--color-primary); padding:0.4rem 0 0.2rem; letter-spacing:0.05em;">${currentDept.toUpperCase()}</div>`;
                }
                const isPoolDept = (depts || []).find(pd => pd.department === currentDept && pd.pool_department);
                let hoursDisplay = '';
                if (isPoolDept) {
                    const avgMins = (poolDeptMonthMinutes[currentDept] || 0) / daysInMonth;
                    if (avgMins > 0) hoursDisplay = `⌀ ${Math.floor(avgMins / 60)}h ${String(Math.round(avgMins % 60)).padStart(2, '0')}m`;
                } else {
                    const hours = d.hours.find(h => h.employee_id === r.empId && ((h.department || h.employees_planit?.department) === currentDept));
                    if (hours) hoursDisplay = `${Math.floor(hours.minutes / 60)}h ${String(hours.minutes % 60).padStart(2, '0')}m`;
                }
                return `${deptHeader}
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; padding:0.3rem 0; border-bottom:1px solid var(--color-border);">
                    <span>${name}</span>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        ${hoursDisplay ? `<span style="color:var(--color-text-light);">${hoursDisplay}</span>` : ''}
                        <span class="tip-emp-col" style="color:var(--color-text-light); min-width:3.5rem; text-align:right; font-size:0.8rem;">${r.card.toFixed(2)} €</span>
                        <span class="tip-emp-col" style="color:var(--color-text-light); min-width:3.5rem; text-align:right; font-size:0.8rem;">${r.cash.toFixed(2)} €</span>
                        <span class="tip-emp-total" style="font-weight:600; min-width:4rem; text-align:right;">${(r.card + r.cash).toFixed(2)} €</span>
                        <div class="tip-emp-split" style="display:none; text-align:left;">
                            <div style="font-weight:600;">${(r.card + r.cash).toFixed(2)} €</div>
                            <div style="font-size:0.75rem; color:var(--color-text-light);">Karte: ${r.card.toFixed(2)} €</div>
                            <div style="font-size:0.75rem; color:var(--color-text-light);">Bar: ${r.cash.toFixed(2)} €</div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            return `
            <div style="background:var(--color-gray); border-radius:12px; margin-bottom:0.75rem; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; cursor:pointer;" onclick="toggleTrinkgeldDay('${dateStr}')">
                    <div style="font-weight:600;">${dateLabel}</div>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <span style="font-size:0.85rem; color:var(--color-primary); font-weight:700;">${total} €</span>
                        <button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="event.stopPropagation(); openTrinkgeldDayModal('${dateStr}')">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="event.stopPropagation(); deleteTrinkgeldDay('${dateStr}')">
                            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                        <span id="trinkgeld-day-toggle-${dateStr}" style="color:var(--color-text-light);">▶</span>
                    </div>
                </div>
                <div id="trinkgeld-day-body-${dateStr}" style="display:none; padding:0.5rem 1rem 0.75rem; background:white; border-top:1px solid var(--color-border);">
                    <div style="display:flex; gap:1rem; margin-bottom:0.5rem; font-size:0.8rem; color:var(--color-text-light);">
                        <span>Karte: ${d.card.toFixed(2)} €</span>
                        <span>Bar: ${d.cash.toFixed(2)} €</span>
                    </div>
                    ${empRows || '<div style="font-size:0.85rem; color:var(--color-text-light);">Keine Stunden eingetragen.</div>'}
                </div>
            </div>`;
        }).join('');
    }

    // Zusammenfassung rendern
    const resultsContainer = document.getElementById('trinkgeld-results');
    if (Object.keys(empMonthTotals).length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state"><p>Keine Daten vorhanden.</p></div>';
    } else {
        let totalCard = 0, totalCash = 0;
        (entries || []).forEach(e => { totalCard += parseFloat(e.amount_card); totalCash += parseFloat(e.amount_cash); });

        resultsContainer.innerHTML = `
            <div class="card" style="margin-bottom:0.75rem; display:flex; justify-content:space-between;">
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light);">KARTE GESAMT</div>
                    <div style="font-weight:700;">${totalCard.toFixed(2)} €</div>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light);">BAR GESAMT</div>
                    <div style="font-weight:700;">${totalCash.toFixed(2)} €</div>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light);">GESAMT</div>
                    <div style="font-weight:700; color:var(--color-primary);">${(totalCard + totalCash).toFixed(2)} €</div>
                </div>
            </div>
            ${Object.entries(empMonthTotals).sort(([aId], [bId]) => {
                const aEmp  = (tipHours || []).find(h => h.employee_id === aId);
                const bEmp  = (tipHours || []).find(h => h.employee_id === bId);
                const aDept = aEmp ? aEmp.employees_planit.department : 'zzz';
                const bDept = bEmp ? bEmp.employees_planit.department : 'zzz';
                if (aDept !== bDept) return aDept.localeCompare(bDept);
                return (aEmp ? aEmp.employees_planit.name : aId).localeCompare(bEmp ? bEmp.employees_planit.name : bId);
            }).map(([empId, totals], idx, arr) => {
                const emp         = (tipHours || []).find(h => h.employee_id === empId);
                const name        = emp ? emp.employees_planit.name : empId;
                const currentDept = emp ? emp.employees_planit.department : '';
                const prevEmp     = idx > 0 ? (tipHours || []).find(h => h.employee_id === arr[idx - 1][0]) : null;
                const prevDept    = prevEmp ? prevEmp.employees_planit.department : '';
                const deptHeader  = currentDept && currentDept !== prevDept
                    ? `<div style="font-size:0.75rem; font-weight:700; color:var(--color-primary); padding:0.5rem 0 0.25rem; letter-spacing:0.05em;">${currentDept.toUpperCase()}</div>` : '';
                const empTotalMin  = (tipHours || []).filter(h => h.employee_id === empId).reduce((sum, h) => sum + h.minutes, 0);
                const empHours     = empTotalMin > 0 ? `${Math.floor(empTotalMin / 60)}h ${String(empTotalMin % 60).padStart(2, '0')}m` : '';
                const isPoolDept = (depts || []).find(d => d.department === currentDept && d.pool_department);
                const avgDayMins = isPoolDept ? (poolDeptMonthMinutes[currentDept] || 0) / daysInMonth : null;
                const dayRows      = allDates.filter(dateStr => Object.values(dayResults[dateStr].empResults).some(r => r.empId === empId)).map(dateStr => {
                    const d           = dayResults[dateStr];
                    const dateLabel   = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                    const dayEmpTotal = Object.values(d.empResults).filter(r => r.empId === empId).reduce((sum, r) => sum + r.card + r.cash, 0);
                    let dayHoursStr;
                    if (avgDayMins !== null) {
                        const ah = Math.floor(avgDayMins / 60);
                        const am = Math.round(avgDayMins % 60);
                        dayHoursStr = `Ø ${ah} h ${String(am).padStart(2, '0')} m`;
                    } else {
                        const dayEmpMins = d.hours.filter(h => h.employee_id === empId).reduce((sum, h) => sum + h.minutes, 0);
                        dayHoursStr = dayEmpMins > 0 ? `${Math.floor(dayEmpMins / 60)}h ${String(dayEmpMins % 60).padStart(2, '0')}m` : '';
                    }
                    return `<div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; padding:0.25rem 0; border-bottom:1px solid var(--color-border);"><span style="color:var(--color-text-light);">${dateLabel}</span><div style="display:flex; gap:1rem; align-items:center;">${dayHoursStr ? `<span style="color:var(--color-text-light);">${dayHoursStr}</span>` : ''}<span style="font-weight:600; min-width:4rem; text-align:right;">${dayEmpTotal.toFixed(2)} €</span></div></div>`;
                }).join('');
                return `${deptHeader}
                <div style="background:white; border-radius:10px; margin-bottom:0.5rem; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.65rem 0.85rem; cursor:pointer;" onclick="(function(){var b=document.getElementById('te-b-${empId}'),t=document.getElementById('te-a-${empId}'),o=b.style.display==='block';b.style.display=o?'none':'block';t.textContent=o?'▶':'▼';})();">
                        <div><div style="font-weight:600; font-size:0.9rem;">${name}</div>${empHours ? `<div style="font-size:0.75rem; color:var(--color-text-light);">${empHours}</div>` : ''}</div>
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <span class="tip-emp-col" style="color:var(--color-text-light); min-width:3.5rem; text-align:right; font-size:0.8rem;">${totals.card.toFixed(2)} €</span>
                            <span class="tip-emp-col" style="color:var(--color-text-light); min-width:3.5rem; text-align:right; font-size:0.8rem;">${totals.cash.toFixed(2)} €</span>
                            <div class="tip-emp-total" style="font-weight:700; color:var(--color-primary); min-width:4rem; text-align:right;">${(totals.card + totals.cash).toFixed(2)} €</div>
                            <div class="tip-emp-split" style="display:none; text-align:left;">
                                <div style="font-weight:700; color:var(--color-primary);">${(totals.card + totals.cash).toFixed(2)} €</div>
                                <div style="font-size:0.75rem; color:var(--color-text-light);">Karte: ${totals.card.toFixed(2)} €</div>
                                <div style="font-size:0.75rem; color:var(--color-text-light);">Bar: ${totals.cash.toFixed(2)} €</div>
                            </div>
                            <span id="te-a-${empId}" style="color:var(--color-text-light); font-size:0.8rem;">▶</span>
                        </div>
                    </div>
                    <div id="te-b-${empId}" style="display:none; padding:0.5rem 0.85rem 0.65rem; border-top:1px solid var(--color-border); background:var(--color-gray);">${dayRows || '<div style="font-size:0.82rem; color:var(--color-text-light);">Keine Tagesdaten.</div>'}</div>
                </div>`;
            }).join('')}`;
    }
}

function toggleTrinkgeldDay(dateStr) {
    const body   = document.getElementById(`trinkgeld-day-body-${dateStr}`);
    const toggle = document.getElementById(`trinkgeld-day-toggle-${dateStr}`);
    const isOpen = body.style.display === 'block';
    body.style.display   = isOpen ? 'none' : 'block';
    toggle.textContent   = isOpen ? '▶' : '▼';
}

function toggleTrinkgeldSummary() {
    const body   = document.getElementById('trinkgeld-summary');
    const toggle = document.getElementById('trinkgeld-summary-toggle');
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

async function deleteTrinkgeldDay(dateStr) {
    if (!confirm(`Tag ${new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE')} löschen?`)) return;
    await db.from('tip_entries').delete().eq('user_id', adminSession.user.id).eq('entry_date', dateStr);
    await db.from('tip_hours').delete().eq('user_id', adminSession.user.id).eq('work_date', dateStr);
    loadTrinkgeld();
}

// ── TRINKGELD KONFIGURATION ───────────────────────────────

async function loadTrinkgeldConfig() {
    const { data: config } = await db
        .from('tip_config')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .maybeSingle();

    if (config) {
        document.getElementById('tip-mode').value             = config.mode;
        document.getElementById('tip-show-employees').checked = config.show_to_employees;
    }

    const { data: depts } = await db
        .from('tip_departments')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: true });

    renderTipDepartments(depts || []);
}

function renderTipDepartments(depts) {
    const container = document.getElementById('tip-departments-list');
    if (depts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Abteilungen konfiguriert.</p></div>';
        return;
    }
    container.innerHTML = depts.map(d => `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <div style="font-weight:600;">${d.department}</div>
                <button class="btn-small btn-pdf-view btn-icon" onclick="deleteTipDepartment('${d.id}')">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">ANTEIL %</div>
                    <input type="number" value="${d.percentage}" min="0" max="100" onchange="updateTipDept('${d.id}', 'percentage', this.value)" style="padding:0.4rem; font-size:0.85rem;">
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">POOL (falls fix)</div>
                    <input type="text" value="${d.pool_department || ''}" placeholder="z.B. Küche" onchange="updateTipDept('${d.id}', 'pool_department', this.value)" style="padding:0.4rem; font-size:0.85rem;">
                </div>
            </div>
            <div style="margin-top:0.5rem;">
                <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">FIX STUNDEN/MONAT (optional)</div>
                <input type="number" value="${d.fixed_hours_per_month || ''}" placeholder="z.B. 30" onchange="updateTipDept('${d.id}', 'fixed_hours_per_month', this.value)" style="padding:0.4rem; font-size:0.85rem;">
            </div>
        </div>`).join('');
}

async function addTipDepartment() {
    const name = prompt('Abteilungsname:');
    if (!name || !name.trim()) return;
    await db.from('tip_departments').insert({ user_id: adminSession.user.id, department: name.trim(), percentage: 0 });
    loadTrinkgeldConfig();
}

async function deleteTipDepartment(id) {
    if (!confirm('Abteilung löschen?')) return;
    await db.from('tip_departments').delete().eq('id', id);
    loadTrinkgeldConfig();
}

async function updateTipDept(id, field, value) {
    await db.from('tip_departments').update({ [field]: value || null }).eq('id', id);
}

async function saveTipConfig() {
    const mode            = document.getElementById('tip-mode').value;
    const showToEmployees = document.getElementById('tip-show-employees').checked;
    const { error } = await db.from('tip_config').upsert({
        user_id: adminSession.user.id,
        mode,
        show_to_employees: showToEmployees
    }, { onConflict: 'user_id' });
    if (error) { alert('Fehler: ' + error.message); return; }
    alert('Gespeichert!');
}

// ── TAG-MODAL (Eintrag + Stunden) ────────────────────────

async function openTrinkgeldDayModal(date = null) {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('trinkgeld-hours-date').value = date || today;

    if (date) {
        const { data: entry } = await db.from('tip_entries').select('*').eq('user_id', adminSession.user.id).eq('entry_date', date).maybeSingle();
        document.getElementById('trinkgeld-entry-card').value = entry ? entry.amount_card : '';
        document.getElementById('trinkgeld-entry-cash').value = entry ? entry.amount_cash : '';
        document.getElementById('trinkgeld-entry-id').value   = entry ? entry.id : '';
    } else {
        document.getElementById('trinkgeld-entry-card').value = '';
        document.getElementById('trinkgeld-entry-cash').value = '';
        document.getElementById('trinkgeld-entry-id').value   = '';
    }

    await loadTrinkgeldHoursEmployees(date || today);
    document.getElementById('trinkgeld-hours-modal').classList.add('active');
}

function closeTrinkgeldEntryModal() {
    document.getElementById('trinkgeld-entry-modal').classList.remove('active');
}

function closeTrinkgeldHoursModal() {
    document.getElementById('trinkgeld-hours-modal').classList.remove('active');
}

async function saveTrinkgeldEntry() {
    const id   = document.getElementById('trinkgeld-entry-id').value;
    const date = document.getElementById('trinkgeld-entry-date').value;
    const card = parseFloat(document.getElementById('trinkgeld-entry-card').value) || 0;
    const cash = parseFloat(document.getElementById('trinkgeld-entry-cash').value) || 0;
    if (!date) { alert('Bitte Datum eingeben.'); return; }

    if (id) {
        await db.from('tip_entries').update({ entry_date: date, amount_card: card, amount_cash: cash }).eq('id', id);
    } else {
        await db.from('tip_entries').upsert({
            user_id: adminSession.user.id,
            entry_date: date,
            amount_card: card,
            amount_cash: cash
        }, { onConflict: 'user_id,entry_date' });
    }
    closeTrinkgeldEntryModal();
    loadTrinkgeld();
}

async function deleteTrinkgeldEntry() {
    const id = document.getElementById('trinkgeld-entry-id').value;
    if (!confirm('Eintrag löschen?')) return;
    await db.from('tip_entries').delete().eq('id', id);
    closeTrinkgeldEntryModal();
    loadTrinkgeld();
}

async function deleteTrinkgeldEntryDirect(id) {
    if (!confirm('Eintrag löschen?')) return;
    await db.from('tip_entries').delete().eq('id', id);
    loadTrinkgeld();
}

// ── STUNDEN MODAL ─────────────────────────────────────────

async function loadTrinkgeldHoursEmployees(date) {
    const { data: existing } = await db
        .from('tip_hours')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .eq('work_date', date);

    const container = document.getElementById('trinkgeld-hours-employees');
    container.innerHTML = employees.map(emp => {
        const entry = (existing || []).find(e => e.employee_id === emp.id);
        const hours = entry ? Math.floor(entry.minutes / 60) : 0;
        const mins  = entry ? entry.minutes % 60 : 0;
        const label = (hours === 0 && mins === 0) ? '—' : `${hours}h ${String(mins).padStart(2, '0')}m`;
        return `
        <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.5rem;">
            <div style="flex:1; font-size:0.9rem; font-weight:600;">${emp.name}</div>
            <input type="hidden" id="tip-hours-h-${emp.id}" value="${hours}">
            <input type="hidden" id="tip-hours-m-${emp.id}" value="${mins}">
            <button id="tip-time-btn-${emp.id}"
                onclick="openTimePicker('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')"
                style="padding:0.45rem 0.85rem; border-radius:8px; border:1.5px solid var(--color-gray); background:white; font-size:0.9rem; font-weight:600; cursor:pointer; min-width:90px; text-align:center; color:var(--color-text);">
                ${label}
            </button>
        </div>`;
    }).join('');
}

async function saveTrinkgeldHours() {
    const date = document.getElementById('trinkgeld-hours-date').value;
    if (!date) { alert('Bitte Datum eingeben.'); return; }
    const userId  = (await db.auth.getUser()).data.user.id;
    const card    = parseFloat(document.getElementById('trinkgeld-entry-card').value) || 0;
    const cash    = parseFloat(document.getElementById('trinkgeld-entry-cash').value) || 0;
    const entryId = document.getElementById('trinkgeld-entry-id').value;

    if (card > 0 || cash > 0) {
        if (entryId) {
            await db.from('tip_entries').update({ entry_date: date, amount_card: card, amount_cash: cash }).eq('id', entryId);
        } else {
            await db.from('tip_entries').upsert({ user_id: userId, entry_date: date, amount_card: card, amount_cash: cash }, { onConflict: 'user_id,entry_date' });
        }
    }

    for (const emp of employees) {
        const h            = parseInt(document.getElementById(`tip-hours-h-${emp.id}`)?.value) || 0;
        const m            = parseInt(document.getElementById(`tip-hours-m-${emp.id}`)?.value) || 0;
        const totalMinutes = h * 60 + m;
        if (totalMinutes === 0) continue;
        await db.from('tip_hours').upsert({
            user_id: userId,
            employee_id: emp.id,
            work_date: date,
            minutes: totalMinutes,
            department: emp.department || null
        }, { onConflict: 'user_id,employee_id,work_date,department' });
    }

    closeTrinkgeldHoursModal();
    await loadTrinkgeld();
    await saveTrinkgeldResults();
}

async function loadTrinkgeldHours() {
    const year     = trinkgeldDate.getFullYear();
    const month    = trinkgeldDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDay = `${monthStr}-01`;
    const lastDay  = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data: hours } = await db
        .from('tip_hours')
        .select('*, employees_planit(name)')
        .eq('user_id', adminSession.user.id)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay)
        .order('work_date', { ascending: false });

    const container = document.getElementById('trinkgeld-hours-list');
    if (!hours || hours.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Stunden eingetragen.</p></div>';
        return;
    }

    const byDate = {};
    hours.forEach(h => {
        if (!byDate[h.work_date]) byDate[h.work_date] = [];
        byDate[h.work_date].push(h);
    });

    container.innerHTML = Object.entries(byDate).map(([date, entries]) => `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <div style="font-weight:600;">${new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-small btn-pdf-view btn-icon" onclick="openTrinkgeldHoursModalDate('${date}')">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-small btn-pdf-view btn-icon" onclick="deleteTrinkgeldHoursDate('${date}')">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </div>
            ${entries.map(e => `
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:0.2rem 0;">
                    <span>${e.employees_planit.name.split(' ')[0]}</span>
                    <span style="font-weight:600;">${Math.floor(e.minutes / 60)}h ${String(e.minutes % 60).padStart(2, '0')}m</span>
                </div>`).join('')}
        </div>`).join('');
}

async function openTrinkgeldHoursModalDate(date) {
    document.getElementById('trinkgeld-hours-date').value = date;
    await loadTrinkgeldHoursEmployees(date);
    document.getElementById('trinkgeld-hours-modal').classList.add('active');
}

async function deleteTrinkgeldHoursDate(date) {
    if (!confirm(`Alle Stunden für ${new Date(date + 'T12:00:00').toLocaleDateString('de-DE')} löschen?`)) return;
    await db.from('tip_hours').delete().eq('user_id', adminSession.user.id).eq('work_date', date);
    loadTrinkgeldHours();
}

// ── TIME PICKER ───────────────────────────────────────────

let timePickerEmpId   = null;
let timePickerCleanup = [];
const TP_ITEM_H  = 48;
const TP_H_COUNT = 24;
const TP_M_COUNT = 60;

function openTimePicker(empId, empName) {
    timePickerEmpId = empId;
    document.getElementById('time-picker-emp-name').textContent = empName;
    const currentH = parseInt(document.getElementById(`tip-hours-h-${empId}`)?.value) || 0;
    const currentM = parseInt(document.getElementById(`tip-hours-m-${empId}`)?.value) || 0;

    const hCol = document.getElementById('time-picker-hours');
    const mCol = document.getElementById('time-picker-minutes');

    const buildCircular = count => {
        let html = '';
        for (let rep = 0; rep < 3; rep++) {
            for (let i = 0; i < count; i++) html += `<div class="time-picker-item">${String(i).padStart(2, '0')}</div>`;
        }
        return html;
    };

    hCol.innerHTML = buildCircular(TP_H_COUNT);
    mCol.innerHTML = buildCircular(TP_M_COUNT);
    document.getElementById('time-picker-modal').classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        hCol.scrollTop = (TP_H_COUNT + currentH - 1) * TP_ITEM_H;
        mCol.scrollTop = (TP_M_COUNT + currentM - 1) * TP_ITEM_H;
    }, 50);

    timePickerCleanup.forEach(fn => fn());
    timePickerCleanup = [];

    const attachInfinite = (col, count) => {
        let timer = null;
        const check = () => {
            if (col.scrollTop < count * TP_ITEM_H) col.scrollTop += count * TP_ITEM_H;
            else if (col.scrollTop >= count * 2 * TP_ITEM_H) col.scrollTop -= count * TP_ITEM_H;
        };
        const handler = () => { clearTimeout(timer); timer = setTimeout(check, 100); };
        col.addEventListener('scroll', handler);
        timePickerCleanup.push(() => { col.removeEventListener('scroll', handler); clearTimeout(timer); });
    };
    attachInfinite(hCol, TP_H_COUNT);
    attachInfinite(mCol, TP_M_COUNT);

    const stopProp = e => e.stopPropagation();
    for (const col of [hCol, mCol]) {
        col.addEventListener('touchstart', stopProp);
        col.addEventListener('touchmove',  stopProp);
        col.addEventListener('touchend',   stopProp);
        timePickerCleanup.push(() => {
            col.removeEventListener('touchstart', stopProp);
            col.removeEventListener('touchmove',  stopProp);
            col.removeEventListener('touchend',   stopProp);
        });
    }
}

function closeTimePicker() {
    document.getElementById('time-picker-modal').classList.remove('active');
    document.body.style.overflow = '';
    timePickerCleanup.forEach(fn => fn());
    timePickerCleanup = [];
    timePickerEmpId = null;
}

function resetTimePicker() {
    document.getElementById('time-picker-hours').scrollTop  = (TP_H_COUNT - 1) * TP_ITEM_H;
    document.getElementById('time-picker-minutes').scrollTop = (TP_M_COUNT - 1) * TP_ITEM_H;
}

function confirmTimePicker() {
    if (!timePickerEmpId) return;
    const hCol = document.getElementById('time-picker-hours');
    const mCol = document.getElementById('time-picker-minutes');
    const h    = (Math.round(hCol.scrollTop / TP_ITEM_H) + 1) % TP_H_COUNT;
    const m    = (Math.round(mCol.scrollTop / TP_ITEM_H) + 1) % TP_M_COUNT;
    document.getElementById(`tip-hours-h-${timePickerEmpId}`).value   = h;
    document.getElementById(`tip-hours-m-${timePickerEmpId}`).value   = m;
    document.getElementById(`tip-time-btn-${timePickerEmpId}`).textContent = (h === 0 && m === 0) ? '—' : `${h}h ${String(m).padStart(2, '0')}m`;
    closeTimePicker();
}

// ── BERECHNUNG ────────────────────────────────────────────

async function calculateTrinkgeld() {
    const year        = trinkgeldDate.getFullYear();
    const month       = trinkgeldDate.getMonth();
    const monthStr    = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDay    = `${monthStr}-01`;
    const lastDay     = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const { data: config } = await db.from('tip_config').select('*').eq('user_id', adminSession.user.id).maybeSingle();
    if (!config) { alert('Bitte zuerst Einstellungen konfigurieren.'); return; }

    const { data: depts } = await db.from('tip_departments').select('*').eq('user_id', adminSession.user.id);
    if (!depts || depts.length === 0) { alert('Bitte Abteilungen konfigurieren.'); return; }

    const { data: entries } = await db.from('tip_entries').select('*').eq('user_id', adminSession.user.id).gte('entry_date', firstDay).lte('entry_date', lastDay);
    if (!entries || entries.length === 0) { alert('Keine Einträge für diesen Monat.'); return; }

    const { data: emps }        = await db.from('employees_planit').select('*').eq('user_id', adminSession.user.id).eq('is_active', true);
    const { data: actualHours } = await db.from('actual_hours').select('*').eq('user_id', adminSession.user.id).eq('month', monthStr);
    const { data: vacations }   = await db.from('vacation_requests').select('*').eq('user_id', adminSession.user.id).eq('status', 'approved').or(`start_date.lte.${lastDay},end_date.gte.${firstDay}`);
    const { data: sickLeaves }  = await db.from('sick_leaves').select('*').eq('user_id', adminSession.user.id).lte('start_date', lastDay).gte('end_date', firstDay);

    let totalCard = 0, totalCash = 0;
    entries.forEach(e => { totalCard += parseFloat(e.amount_card); totalCash += parseFloat(e.amount_cash); });

    if (config.mode === 'monthly') {
        await calculateMonthly(monthStr, totalCard, totalCash, depts, emps, actualHours, vacations, sickLeaves);
    } else {
        await calculateDaily(monthStr, firstDay, lastDay, daysInMonth, totalCard, totalCash, depts, emps, vacations, sickLeaves, entries);
    }

    loadTrinkgeld();
    alert('Berechnung abgeschlossen!');
}

async function calculateMonthly(monthStr, totalCard, totalCash, depts, emps, actualHours, vacations, sickLeaves) {
    const results = [];
    for (const dept of depts) {
        if (dept.fixed_hours_per_month) continue;
        const deptCard = totalCard * (dept.percentage / 100);
        const deptCash = totalCash * (dept.percentage / 100);
        const deptEmps = emps.filter(e => e.department === dept.department);
        const fixedDepts = depts.filter(d => d.pool_department === dept.department && d.fixed_hours_per_month);
        let fixedMinutes = 0;
        fixedDepts.forEach(d => { fixedMinutes += d.fixed_hours_per_month * 60; });

        let totalDeptMinutes = fixedMinutes;
        const empMinutes = {};
        for (const emp of deptEmps) {
            const isOnVacation = (vacations || []).some(v => v.employee_id === emp.id);
            const isOnSick     = (sickLeaves || []).some(s => s.employee_id === emp.id);
            if (isOnVacation || isOnSick) { empMinutes[emp.id] = 0; continue; }
            const ah = (actualHours || []).find(a => a.employee_id === emp.id);
            empMinutes[emp.id] = ah ? ah.actual_minutes : 0;
            totalDeptMinutes  += empMinutes[emp.id];
        }
        if (totalDeptMinutes === 0) continue;

        for (const fixedDept of fixedDepts) {
            const fixedEmp = emps.find(e => e.department === fixedDept.department);
            if (!fixedEmp) continue;
            const share = (fixedDept.fixed_hours_per_month * 60) / totalDeptMinutes;
            results.push({ employee_id: fixedEmp.id, amount_card: deptCard * share, amount_cash: deptCash * share });
        }
        for (const emp of deptEmps) {
            if (!empMinutes[emp.id]) continue;
            const share = empMinutes[emp.id] / totalDeptMinutes;
            results.push({ employee_id: emp.id, amount_card: deptCard * share, amount_cash: deptCash * share });
        }
    }

    for (const r of results) {
        await db.from('tip_results').upsert({
            user_id: (await db.auth.getUser()).data.user.id,
            employee_id: r.employee_id,
            month: monthStr,
            amount_card: Math.round(r.amount_card * 100) / 100,
            amount_cash: Math.round(r.amount_cash * 100) / 100
        }, { onConflict: 'user_id,employee_id,month' });
    }
}

async function calculateDaily(monthStr, firstDay, lastDay, daysInMonth, totalCard, totalCash, depts, emps, vacations, sickLeaves, entries) {
    const { data: tipHours } = await db.from('tip_hours').select('*').eq('user_id', adminSession.user.id).gte('work_date', firstDay).lte('work_date', lastDay);
    if (!tipHours || tipHours.length === 0) { alert('Keine Stunden eingetragen.'); return; }

    const empTotals  = {};
    const fixedTotals = {};
    emps.forEach(e => { empTotals[e.id] = { card: 0, cash: 0 }; });

    const workDays = [...new Set(tipHours.map(h => h.work_date))];
    for (const dateStr of workDays) {
        const dayHours = tipHours.filter(h => h.work_date === dateStr);
        const dayEntry = (entries || []).find(e => e.entry_date === dateStr);
        const dayCard  = dayEntry ? parseFloat(dayEntry.amount_card) : 0;
        const dayCash  = dayEntry ? parseFloat(dayEntry.amount_cash) : 0;
        if (dayCard === 0 && dayCash === 0) continue;

        for (const dept of depts) {
            if (dept.fixed_hours_per_month) continue;
            const deptDayCard  = dayCard * (dept.percentage / 100);
            const deptDayCash  = dayCash * (dept.percentage / 100);
            const fixedDepts   = depts.filter(d => d.pool_department === dept.department && d.fixed_hours_per_month);
            let totalDeptMinutes = 0;
            fixedDepts.forEach(d => { totalDeptMinutes += (d.fixed_hours_per_month / daysInMonth) * 60; });

            const empDayMinutes = {};
            for (const h of dayHours) {
                const emp = emps.find(e => e.id === h.employee_id);
                if (!emp || emp.department !== dept.department) continue;
                const isOnVacation = (vacations || []).some(v => v.employee_id === h.employee_id && v.start_date <= dateStr && v.end_date >= dateStr);
                const isOnSick     = (sickLeaves || []).some(s => s.employee_id === h.employee_id && s.start_date <= dateStr && s.end_date >= dateStr);
                if (isOnVacation || isOnSick) continue;
                empDayMinutes[h.employee_id] = h.minutes;
                totalDeptMinutes += h.minutes;
            }
            if (totalDeptMinutes === 0) continue;

            for (const fixedDept of fixedDepts) {
                const fixedMins = (fixedDept.fixed_hours_per_month / daysInMonth) * 60;
                const share     = fixedMins / totalDeptMinutes;
                if (!fixedTotals[fixedDept.department]) fixedTotals[fixedDept.department] = { card: 0, cash: 0 };
                fixedTotals[fixedDept.department].card += deptDayCard * share;
                fixedTotals[fixedDept.department].cash += deptDayCash * share;
            }
            for (const [empId, minutes] of Object.entries(empDayMinutes)) {
                const share = minutes / totalDeptMinutes;
                empTotals[empId].card += deptDayCard * share;
                empTotals[empId].cash += deptDayCash * share;
            }
        }
    }

    const userId = (await db.auth.getUser()).data.user.id;
    await db.from('tip_config').update({ fixed_results: JSON.stringify(fixedTotals) }).eq('user_id', userId);

    for (const [empId, totals] of Object.entries(empTotals)) {
        if (totals.card === 0 && totals.cash === 0) continue;
        await db.from('tip_results').upsert({
            user_id: userId,
            employee_id: empId,
            month: monthStr,
            amount_card: Math.round(totals.card * 100) / 100,
            amount_cash: Math.round(totals.cash * 100) / 100
        }, { onConflict: 'user_id,employee_id,month' });
    }
}

async function saveTrinkgeldResults() {
    const year        = trinkgeldDate.getFullYear();
    const month       = trinkgeldDate.getMonth();
    const monthStr    = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDay    = `${monthStr}-01`;
    const lastDay     = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const { data: entries }    = await db.from('tip_entries').select('*').eq('user_id', adminSession.user.id).gte('entry_date', firstDay).lte('entry_date', lastDay);
    const { data: tipHours }   = await db.from('tip_hours').select('*, employees_planit(name, department)').eq('user_id', adminSession.user.id).gte('work_date', firstDay).lte('work_date', lastDay);
    const { data: depts }      = await db.from('tip_departments').select('*').eq('user_id', adminSession.user.id);
    const { data: emps }       = await db.from('employees_planit').select('*').eq('user_id', adminSession.user.id).eq('is_active', true);
    const { data: vacations }  = await db.from('vacation_requests').select('*').eq('user_id', adminSession.user.id).eq('status', 'approved').or(`start_date.lte.${lastDay},end_date.gte.${firstDay}`);
    const { data: sickLeaves } = await db.from('sick_leaves').select('*').eq('user_id', adminSession.user.id).lte('start_date', lastDay).gte('end_date', firstDay);

    if (!entries || entries.length === 0 || !depts || depts.length === 0) return;

    const empMonthTotals = {};
    const allDates = [...new Set((tipHours || []).map(h => h.work_date))];

    for (const dateStr of allDates) {
        const dayEntry = (entries || []).find(e => e.entry_date === dateStr);
        const dayCard  = dayEntry ? parseFloat(dayEntry.amount_card) : 0;
        const dayCash  = dayEntry ? parseFloat(dayEntry.amount_cash) : 0;
        if (dayCard === 0 && dayCash === 0) continue;

        const dayHours = (tipHours || []).filter(h => h.work_date === dateStr);
        for (const dept of depts) {
            if (dept.fixed_hours_per_month) continue;
            const deptDayCard  = dayCard * (dept.percentage / 100);
            const deptDayCash  = dayCash * (dept.percentage / 100);
            const fixedDepts   = depts.filter(d => d.pool_department === dept.department && d.fixed_hours_per_month);
            let totalDeptMinutes = 0;
            fixedDepts.forEach(d => { totalDeptMinutes += (d.fixed_hours_per_month / daysInMonth) * 60; });

            const empDayMinutes = {};
            for (const h of dayHours) {
                if (h.employees_planit.department !== dept.department) continue;
                const isOnVacation = (vacations || []).some(v => v.employee_id === h.employee_id && v.start_date <= dateStr && v.end_date >= dateStr);
                const isOnSick     = (sickLeaves || []).some(s => s.employee_id === h.employee_id && s.start_date <= dateStr && s.end_date >= dateStr);
                if (isOnVacation || isOnSick) continue;
                empDayMinutes[h.employee_id] = h.minutes;
                totalDeptMinutes += h.minutes;
            }
            if (totalDeptMinutes === 0) continue;

            for (const [empId, minutes] of Object.entries(empDayMinutes)) {
                const share = minutes / totalDeptMinutes;
                if (!empMonthTotals[empId]) empMonthTotals[empId] = { card: 0, cash: 0 };
                empMonthTotals[empId].card += deptDayCard * share;
                empMonthTotals[empId].cash += deptDayCash * share;
            }
        }
    }

    const userId = (await db.auth.getUser()).data.user.id;
    for (const [empId, totals] of Object.entries(empMonthTotals)) {
        await db.from('tip_results').upsert({
            user_id: userId,
            employee_id: empId,
            month: monthStr,
            amount_card: Math.round(totals.card * 100) / 100,
            amount_cash: Math.round(totals.cash * 100) / 100
        }, { onConflict: 'user_id,employee_id,month' });
    }
}

// ── PDF EXPORT ────────────────────────────────────────────

async function downloadTrinkgeldPdf() {
    const year      = trinkgeldDate.getFullYear();
    const month     = trinkgeldDate.getMonth();
    const monthStr  = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthLabel = trinkgeldDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    const { data: results } = await db
        .from('tip_results')
        .select('*, employees_planit(name)')
        .eq('user_id', adminSession.user.id)
        .eq('month', monthStr)
        .order('employee_id');

    if (!results || results.length === 0) { alert('Keine Daten für diesen Monat.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(monthLabel, 190, 20, { align: 'right' });

    let y = 35;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.rect(15, y - 6, 90, 10);
    doc.rect(105, y - 6, 85, 10);
    doc.text('Mitarbeiter:', 17, y);
    doc.text('Trinkgeld, €', 188, y, { align: 'right' });
    y += 10;
    doc.setFont('helvetica', 'normal');

    let total = 0;
    for (const r of results) {
        const amount = Math.round(parseFloat(r.amount_card));
        total += amount;
        doc.rect(15, y - 6, 90, 10);
        doc.rect(105, y - 6, 85, 10);
        doc.text(r.employees_planit.name, 17, y);
        doc.text(String(amount), 188, y, { align: 'right' });
        y += 10;
    }

    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.rect(15, y - 6, 90, 10);
    doc.rect(105, y - 6, 85, 10);
    doc.text('Insgesamt:', 17, y);
    doc.text(String(total), 188, y, { align: 'right' });

    doc.save(`Trinkgeld_${monthStr}.pdf`);
}
