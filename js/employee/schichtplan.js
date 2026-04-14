// ── SCHICHTPLAN / WOCHENANSICHT ───────────────────────────
let empWeekDate = new Date();

function getMonday(date) {
    const d   = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
}

function changeWeek(dir) {
    empWeekDate.setDate(empWeekDate.getDate() + dir * 7);
    loadWeekGrid();
}

async function loadWeekGrid() {
    const monday = getMonday(empWeekDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
    }

    document.getElementById('week-label').textContent =
        `${monday.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const firstDay = monday.toISOString().split('T')[0];
    const lastDay  = sunday.toISOString().split('T')[0];

    const [{ data: shifts }, { data: colleagues }, { data: sickLeaves }] = await Promise.all([
        db.from('shifts').select('*')
            .eq('user_id', currentEmployee.user_id)
            .gte('shift_date', firstDay)
            .lte('shift_date', lastDay),
        db.from('employees_planit').select('*')
            .eq('user_id', currentEmployee.user_id)
            .eq('is_active', true)
            .order('name'),
        db.from('sick_leaves').select('employee_id, start_date, end_date')
            .eq('user_id', currentEmployee.user_id)
            .lte('start_date', lastDay)
            .gte('end_date', firstDay),
    ]);

    renderWeekGrid(days, shifts || [], colleagues || [], sickLeaves || []);
}

function renderWeekGrid(days, shifts, colleagues, sickLeaves = []) {
    const grid    = document.getElementById('emp-week-grid');
    grid.innerHTML = '';
    const dayNames = ['Mo','Di','Mi','Do','Fr','Sa','So'];

    // Leer-Ecke oben links
    const corner = document.createElement('div');
    corner.className = 'week-header';
    grid.appendChild(corner);

    // Tages-Header
    const weekHolidays = getBWHolidays(days[0].getFullYear());
    days.forEach((d, i) => {
        const dateStr   = d.toISOString().split('T')[0];
        const isHoliday = weekHolidays.includes(dateStr);
        const header    = document.createElement('div');
        header.className = 'week-header';
        header.innerHTML = `${dayNames[i]}<br><small style="color:${isHoliday ? '#E07070' : 'inherit'};">${d.getDate()}.${d.getMonth()+1}.${isHoliday ? ' 🎌' : ''}</small>`;
        grid.appendChild(header);
    });

    // Abteilungen
    const departments = [...new Set(colleagues.map(e => e.department || 'Allgemein'))];

    departments.forEach(dept => {
        // Abteilungs-Label
        const deptRow = document.createElement('div');
        deptRow.style.cssText = 'grid-column:1/-1; padding:0.4rem 0.5rem; font-size:0.75rem; font-weight:600; color:var(--color-primary); border-top:1px solid var(--color-border); margin-top:0.25rem;';
        deptRow.textContent = dept.toUpperCase();
        grid.appendChild(deptRow);

        // Offene Schichten
        const deptOpenShifts = shifts.filter(s => s.is_open && s.department === dept);
        const openEmpCell    = document.createElement('div');
        openEmpCell.className   = 'week-employee';
        openEmpCell.style.color = '#C97E7E';
        openEmpCell.style.fontWeight = '700';
        openEmpCell.textContent = 'Offen';
        grid.appendChild(openEmpCell);

        days.forEach(d => {
            const dateStr = d.toISOString().split('T')[0];
            const shift   = deptOpenShifts.find(s => s.shift_date === dateStr);
            const cell    = document.createElement('div');
            cell.className  = 'week-cell' + (shift ? ' open-shift' : '');
            cell.textContent = shift ? `${shift.start_time.slice(0,5)}\n${shift.end_time.slice(0,5)}` : '';
            cell.style.whiteSpace = 'pre';
            if (shift) cell.onclick = () => openRequestModal(shift);
            grid.appendChild(cell);
        });

        // Mitarbeiter-Zeilen
        const deptColleagues = colleagues.filter(e => (e.department || 'Allgemein') === dept);
        deptColleagues.forEach(emp => {
            const empCell = document.createElement('div');
            empCell.className   = 'week-employee';
            empCell.textContent = emp.name.split(' ')[0];
            if (emp.id === currentEmployee.id) {
                empCell.style.color      = 'var(--color-primary)';
                empCell.style.fontWeight = '700';
            }
            grid.appendChild(empCell);

            days.forEach(d => {
                const dateStr = d.toISOString().split('T')[0];
                const shift   = shifts.find(s => s.employee_id === emp.id && s.shift_date === dateStr);
                const isOwn   = emp.id === currentEmployee.id;
                const cell    = document.createElement('div');
                cell.className  = 'week-cell' + (shift ? ' has-shift' : '');
                if (shift && isOwn) cell.style.background = 'var(--color-primary)';
                cell.textContent = shift ? `${shift.start_time.slice(0,5)}\n${shift.end_time.slice(0,5)}` : '';
                cell.style.whiteSpace = 'pre';

                const isSick = sickLeaves.some(s => s.employee_id === emp.id && s.start_date <= dateStr && s.end_date >= dateStr);
                if (isSick && !shift) {
                    cell.style.background = '#FFE0CC';
                    cell.textContent      = 'Krank';
                    cell.style.color      = '#E07040';
                    cell.style.fontSize   = '0.7rem';
                }
                grid.appendChild(cell);
            });
        });
    });
}
