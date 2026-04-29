let statistikenDate       = new Date();
let statistikenYear       = new Date().getFullYear();
let statistikenVerlaufYear  = new Date().getFullYear();
let verlaufChart            = null;
let statistikenTrinkgeldYear = new Date().getFullYear();
let trinkgeldChart          = null;

function changeStatistikenMonth(dir) {
    statistikenDate.setMonth(statistikenDate.getMonth() + dir);
    loadFehlzeiten();
}

function changeStatistikenYear(dir) {
    statistikenYear += dir;
    document.getElementById('statistiken-year-label').textContent = statistikenYear;
    loadFehlzeitenJahr();
}

async function loadFehlzeitenJahr() {
    document.getElementById('statistiken-year-label').textContent = statistikenYear;

    const firstDay = `${statistikenYear}-01-01`;
    const lastDay  = `${statistikenYear}-12-31`;

    const [{ data: sickLeaves }, { data: shifts }, { data: emps }] = await Promise.all([
        db.from('sick_leaves')
            .select('*')
            .eq('user_id', adminSession.user.id)
            .lte('start_date', lastDay)
            .gte('end_date', firstDay),
        db.from('shifts')
            .select('employee_id, shift_date, start_time, end_time, break_minutes')
            .eq('user_id', adminSession.user.id)
            .eq('is_open', false)
            .gte('shift_date', firstDay)
            .lte('shift_date', lastDay),
        db.from('employees_planit')
            .select('id, name')
            .eq('user_id', adminSession.user.id)
            .eq('is_active', true)
            .order('name'),
    ]);

    const byEmp = {};
    for (const s of (sickLeaves || [])) {
        if (!byEmp[s.employee_id]) byEmp[s.employee_id] = [];
        byEmp[s.employee_id].push(s);
    }

    const tbody = document.getElementById('fehlzeiten-year-tbody');

    tbody.innerHTML = (emps || []).map(emp => {
        const leaves = byEmp[emp.id] || [];
        let calDays    = 0;
        let shiftCount = 0;
        let sickMins   = 0;

        for (const s of leaves) {
            const clampStart = s.start_date < firstDay ? firstDay : s.start_date;
            const clampEnd   = s.end_date   > lastDay  ? lastDay  : s.end_date;
            calDays += Math.round((new Date(clampEnd) - new Date(clampStart)) / 86400000) + 1;

            const affected = (shifts || []).filter(sh =>
                sh.employee_id === emp.id &&
                sh.shift_date  >= s.start_date &&
                sh.shift_date  <= s.end_date
            );
            shiftCount += affected.length;

            for (const sh of affected) {
                const [startH, startM] = sh.start_time.split(':').map(Number);
                const [endH,   endM]   = sh.end_time.split(':').map(Number);
                const duration = (endH * 60 + endM) - (startH * 60 + startM) - (sh.break_minutes || 0);
                sickMins += Math.max(0, duration);
            }
        }

        const h = Math.floor(sickMins / 60);
        const m = String(sickMins % 60).padStart(2, '0');
        return `
        <tr style="border-bottom:1px solid var(--color-border);">
            <td style="padding:0.65rem 0.5rem; font-weight:600;">${emp.name}</td>
            <td style="padding:0.65rem 0.5rem;">${calDays}</td>
            <td style="padding:0.65rem 0.5rem; text-align:center;">${shiftCount}</td>
            <td style="padding:0.65rem 0.5rem; text-align:center;">${h}:${m}</td>
        </tr>`;
    }).join('');
}

function changeStatistikenVerlaufYear(dir) {
    statistikenVerlaufYear += dir;
    document.getElementById('statistiken-verlauf-year-label').textContent = statistikenVerlaufYear;
    loadKrankheitsverlauf();
}

async function loadKrankheitsverlauf() {
    document.getElementById('statistiken-verlauf-year-label').textContent = statistikenVerlaufYear;

    const firstDay = `${statistikenVerlaufYear}-01-01`;
    const lastDay  = `${statistikenVerlaufYear}-12-31`;

    const [{ data: sickLeaves }, { data: shifts }] = await Promise.all([
        db.from('sick_leaves')
            .select('*')
            .eq('user_id', adminSession.user.id)
            .lte('start_date', lastDay)
            .gte('end_date', firstDay),
        db.from('shifts')
            .select('employee_id, shift_date')
            .eq('user_id', adminSession.user.id)
            .eq('is_open', false)
            .gte('shift_date', firstDay)
            .lte('shift_date', lastDay),
    ]);

    const monthLabels = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    const monthCounts = Array(12).fill(0);

    for (const s of (sickLeaves || [])) {
        const affected = (shifts || []).filter(sh =>
            sh.employee_id === s.employee_id &&
            sh.shift_date  >= s.start_date &&
            sh.shift_date  <= s.end_date
        );
        for (const sh of affected) {
            const m = parseInt(sh.shift_date.split('-')[1], 10) - 1;
            monthCounts[m]++;
        }
    }

    const ctx = document.getElementById('krankheitsverlauf-chart').getContext('2d');
    if (verlaufChart) verlaufChart.destroy();
    verlaufChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Kranktage',
                data: monthCounts,
                backgroundColor: '#B28A6E',
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
            },
        },
    });
}

async function loadFehlzeiten() {
    const year     = statistikenDate.getFullYear();
    const month    = statistikenDate.getMonth() + 1;
    const monthStr = String(month).padStart(2, '0');
    const firstDay = `${year}-${monthStr}-01`;
    const lastDay  = new Date(year, month, 0).toISOString().split('T')[0];

    const label = statistikenDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('statistiken-month-label').textContent = label;

    const [{ data: sickLeaves }, { data: shifts }, { data: emps }] = await Promise.all([
        db.from('sick_leaves')
            .select('*')
            .eq('user_id', adminSession.user.id)
            .lte('start_date', lastDay)
            .gte('end_date', firstDay),
        db.from('shifts')
            .select('employee_id, shift_date, start_time, end_time, break_minutes')
            .eq('user_id', adminSession.user.id)
            .eq('is_open', false)
            .gte('shift_date', firstDay)
            .lte('shift_date', lastDay),
        db.from('employees_planit')
            .select('id, name')
            .eq('user_id', adminSession.user.id)
            .eq('is_active', true)
            .order('name'),
    ]);

    const tbody = document.getElementById('fehlzeiten-tbody');

    const byEmp = {};
    for (const s of (sickLeaves || [])) {
        if (!byEmp[s.employee_id]) byEmp[s.employee_id] = [];
        byEmp[s.employee_id].push(s);
    }

    const rows = (emps || []).map(emp => {
        const leaves = byEmp[emp.id] || [];
        let calDays    = 0;
        let shiftCount = 0;
        let sickMins   = 0;

        for (const s of leaves) {
            const clampStart = s.start_date < firstDay ? firstDay : s.start_date;
            const clampEnd   = s.end_date   > lastDay  ? lastDay  : s.end_date;
            calDays += Math.round((new Date(clampEnd) - new Date(clampStart)) / 86400000) + 1;

            const affected = (shifts || []).filter(sh =>
                sh.employee_id === emp.id &&
                sh.shift_date  >= s.start_date &&
                sh.shift_date  <= s.end_date
            );
            shiftCount += affected.length;

            for (const sh of affected) {
                const [startH, startM] = sh.start_time.split(':').map(Number);
                const [endH,   endM]   = sh.end_time.split(':').map(Number);
                const duration = (endH * 60 + endM) - (startH * 60 + startM) - (sh.break_minutes || 0);
                sickMins += Math.max(0, duration);
            }
        }

        const h = Math.floor(sickMins / 60);
        const m = String(sickMins % 60).padStart(2, '0');
        return { name: emp.name, calDays, shiftCount, display: `${h}:${m}` };
    });

    tbody.innerHTML = rows.map(r => `
        <tr style="border-bottom:1px solid var(--color-border);">
            <td style="padding:0.65rem 0.5rem; font-weight:600;">${r.name}</td>
            <td style="padding:0.65rem 0.5rem;">${r.calDays}</td>
            <td style="padding:0.65rem 0.5rem; text-align:center;">${r.shiftCount}</td>
            <td style="padding:0.65rem 0.5rem; text-align:center;">${r.display}</td>
        </tr>`).join('');
}

// ── BERICHTE ──────────────────────────────────────────────

async function loadBerichteFilters() {
    const { data: emps } = await db.from('employees_planit')
        .select('id, name, department')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true)
        .order('name');
    if (!emps) return;

    const depts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort();
    document.getElementById('bericht-abteilung').innerHTML =
        depts.map(d => `<option value="${d}">${d}</option>`).join('');

    document.getElementById('bericht-mitarbeiter-list').innerHTML =
        emps.map(e => `
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.9rem; cursor:pointer;">
                <input type="checkbox" value="${e.id}" checked style="width:1rem; height:1rem;">
                ${e.name}
            </label>`).join('');
}

async function downloadArbeitszeitbericht() {
    const mitFilter  = document.getElementById('bericht-mitarbeiter-filter').value;
    const zeitFilter = document.getElementById('bericht-zeitraum-filter').value;

    const today = new Date();
    let firstDay, lastDay, zeitraumLabel;

    if (zeitFilter === 'monat') {
        const y = today.getFullYear();
        const m = today.getMonth();
        firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
        lastDay  = new Date(y, m + 1, 0).toISOString().split('T')[0];
        zeitraumLabel = today.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    } else if (zeitFilter === 'woche') {
        const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
        const mon = new Date(today); mon.setDate(today.getDate() - dow);
        const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
        firstDay = mon.toISOString().split('T')[0];
        lastDay  = sun.toISOString().split('T')[0];
        zeitraumLabel = `${mon.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}–${sun.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    } else {
        firstDay = document.getElementById('bericht-von').value;
        lastDay  = document.getElementById('bericht-bis').value;
        if (!firstDay || !lastDay) { alert('Bitte Von- und Bis-Datum angeben.'); return; }
        zeitraumLabel = `${new Date(firstDay + 'T12:00:00').toLocaleDateString('de-DE')} – ${new Date(lastDay + 'T12:00:00').toLocaleDateString('de-DE')}`;
    }

    const { data: allEmps } = await db.from('employees_planit')
        .select('*').eq('user_id', adminSession.user.id).eq('is_active', true).order('name');
    if (!allEmps || allEmps.length === 0) { alert('Keine Mitarbeiter vorhanden.'); return; }

    let emps = allEmps;
    if (mitFilter === 'abteilung') {
        const dept = document.getElementById('bericht-abteilung').value;
        emps = allEmps.filter(e => e.department === dept);
    } else if (mitFilter === 'auswahl') {
        const checked = [...document.querySelectorAll('#bericht-mitarbeiter-list input:checked')].map(cb => cb.value);
        emps = allEmps.filter(e => checked.includes(String(e.id)));
    }
    if (emps.length === 0) { alert('Keine Mitarbeiter für den gewählten Filter.'); return; }

    const isMonth  = zeitFilter === 'monat';
    const monthStr = firstDay.slice(0, 7);

    const queries = [
        db.from('shifts').select('*').eq('user_id', adminSession.user.id).eq('is_open', false).gte('shift_date', firstDay).lte('shift_date', lastDay),
    ];
    if (isMonth) {
        queries.push(
            db.from('approved_hours').select('*').eq('user_id', adminSession.user.id).eq('month', monthStr),
            db.from('actual_hours').select('*').eq('user_id', adminSession.user.id).eq('month', monthStr),
        );
    }
    const results     = await Promise.all(queries);
    const shifts      = results[0].data || [];
    const approved    = isMonth ? (results[1].data || []) : [];
    const actualHours = isMonth ? (results[2].data || []) : [];

    const { jsPDF } = window.jspdf;
    const doc      = new jsPDF();
    const pageW    = 210;
    const marginL  = 15;
    const marginR  = 15;
    const contentW = pageW - marginL - marginR;
    const fmtMin   = m => `${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

    emps.forEach((emp, empIdx) => {
        if (empIdx > 0) doc.addPage();

        const empShifts = shifts
            .filter(s => s.employee_id === emp.id)
            .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(emp.name, marginL, 22);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(emp.department || '', marginL, 29);
        doc.text(zeitraumLabel, pageW - marginR, 22, { align: 'right' });
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
            doc.text('Keine Schichten im gewählten Zeitraum.', marginL + 1, y + 3);
            doc.setTextColor(0);
            y += 10;
        } else {
            empShifts.forEach((s, i) => {
                if (y > 250) { doc.addPage(); y = 20; }
                const dateLabel = new Date(s.shift_date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                const planned   = `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
                const startStr  = s.actual_start_time || s.start_time;
                const endStr    = s.actual_end_time   || s.end_time;
                const breakMin  = (s.actual_break_minutes !== null && s.actual_break_minutes !== undefined) ? s.actual_break_minutes : (s.break_minutes || 0);
                const hasActual = s.actual_start_time || s.actual_end_time;
                const actual    = hasActual ? `${startStr.slice(0, 5)}–${endStr.slice(0, 5)}` : '–';
                const [sh, sm]  = startStr.split(':').map(Number);
                const [eh, em]  = endStr.split(':').map(Number);
                const mins      = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
                totalActualMin += mins;
                const durStr    = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

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

        doc.setFontSize(9);
        const col1 = marginL + 1;

        if (isMonth) {
            const col2 = marginL + 60;
            const col3 = marginL + 110;
            const approvedEntry = approved.find(a => a.employee_id === emp.id);
            const approvedMin   = approvedEntry ? approvedEntry.approved_minutes : null;
            const actualEntry   = actualHours.find(a => a.employee_id === emp.id);
            const carryMin      = actualEntry ? (actualEntry.carry_over_minutes || 0) : 0;
            const diffMin       = approvedMin !== null ? totalActualMin - approvedMin + carryMin : null;

            doc.setFont('helvetica', 'bold');   doc.text('Gearbeitet:',  col1, y);
            doc.setFont('helvetica', 'normal'); doc.text(`${Math.floor(totalActualMin / 60)}:${String(totalActualMin % 60).padStart(2, '0')} h`, col1 + 28, y);
            doc.setFont('helvetica', 'bold');   doc.text('Abgerechnet:', col2, y);
            doc.setFont('helvetica', 'normal'); doc.text(approvedMin !== null ? `${fmtMin(approvedMin)} h` : '–', col2 + 32, y);
            doc.setFont('helvetica', 'bold');   doc.text('Vormonat:',    col3, y);
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
        } else {
            doc.setFont('helvetica', 'bold');   doc.text('Gearbeitet:', col1, y);
            doc.setFont('helvetica', 'normal'); doc.text(`${Math.floor(totalActualMin / 60)}:${String(totalActualMin % 60).padStart(2, '0')} h`, col1 + 28, y);
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

    doc.save(`Arbeitszeitbericht_${firstDay}_${lastDay}.pdf`);
}

function changeStatistikenTrinkgeldYear(dir) {
    statistikenTrinkgeldYear += dir;
    document.getElementById('statistiken-trinkgeld-year-label').textContent = statistikenTrinkgeldYear;
    loadTrinkgeldVerlauf();
}

async function loadTrinkgeldVerlauf() {
    document.getElementById('statistiken-trinkgeld-year-label').textContent = statistikenTrinkgeldYear;

    const firstDay = `${statistikenTrinkgeldYear}-01-01`;
    const lastDay  = `${statistikenTrinkgeldYear}-12-31`;

    const { data: entries } = await db.from('tip_entries')
        .select('entry_date, amount_card, amount_cash')
        .eq('user_id', adminSession.user.id)
        .gte('entry_date', firstDay)
        .lte('entry_date', lastDay);

    const monthTotals = Array(12).fill(0);
    for (const e of (entries || [])) {
        const m = parseInt(e.entry_date.split('-')[1], 10) - 1;
        monthTotals[m] += (e.amount_card || 0) + (e.amount_cash || 0);
    }

    const ctx = document.getElementById('trinkgeld-verlauf-chart').getContext('2d');
    if (trinkgeldChart) trinkgeldChart.destroy();
    trinkgeldChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['01','02','03','04','05','06','07','08','09','10','11','12'],
            datasets: [{
                label: 'Trinkgeld (€)',
                data: monthTotals.map(v => Math.round(v * 100) / 100),
                backgroundColor: '#B28A6E',
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => v + ' €' } },
            },
        },
    });
}
