async function loadFehlzeiten() {
    const input = document.getElementById('statistiken-month');
    if (!input.value) {
        const now = new Date();
        input.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const monthVal = input.value;

    const [year, month] = monthVal.split('-').map(Number);
    const firstDay = `${monthVal}-01`;
    const lastDay  = new Date(year, month, 0).toISOString().split('T')[0];

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

    const empMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));
    const tbody  = document.getElementById('fehlzeiten-tbody');

    if (!sickLeaves || sickLeaves.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding:1rem 0.5rem; color:var(--color-text-light); font-size:0.85rem;">Keine Krankmeldungen in diesem Monat.</td></tr>`;
        return;
    }

    const byEmp = {};
    for (const s of sickLeaves) {
        if (!byEmp[s.employee_id]) byEmp[s.employee_id] = [];
        byEmp[s.employee_id].push(s);
    }

    const rows = [];
    for (const [empId, leaves] of Object.entries(byEmp)) {
        let calDays    = 0;
        let shiftCount = 0;
        let sickMins   = 0;

        for (const s of leaves) {
            const clampStart = s.start_date < firstDay ? firstDay : s.start_date;
            const clampEnd   = s.end_date   > lastDay  ? lastDay  : s.end_date;
            calDays += Math.round((new Date(clampEnd) - new Date(clampStart)) / 86400000) + 1;

            const affected = (shifts || []).filter(sh =>
                sh.employee_id === empId &&
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

        const h    = Math.floor(sickMins / 60);
        const m    = String(sickMins % 60).padStart(2, '0');
        const name = empMap[empId] || 'Unbekannt';
        rows.push({ name, calDays, shiftCount, display: `${h}:${m}` });
    }

    rows.sort((a, b) => a.name.localeCompare(b.name, 'de'));

    tbody.innerHTML = rows.map(r => `
        <tr style="border-bottom:1px solid var(--color-border);">
            <td style="padding:0.65rem 0.5rem; font-weight:600;">${r.name}</td>
            <td style="padding:0.65rem 0.5rem;">${r.calDays}</td>
            <td style="padding:0.65rem 0.5rem; text-align:center;">${r.shiftCount}</td>
            <td style="padding:0.65rem 0.5rem; text-align:center;">${r.display}</td>
        </tr>`).join('');
}
