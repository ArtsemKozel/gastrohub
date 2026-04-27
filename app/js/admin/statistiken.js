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
