// ── MITARBEITER LADEN ─────────────────────────────────────
async function loadEmployees() {
    const { data } = await db
        .from('employees_planit')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true)
        .order('name');
    employees = data || [];
}

function populateAvailEmployeeSelect() {
    const select = document.getElementById('avail-employee-select');
    select.innerHTML = employees.length
        ? `<option value="all">Alle Mitarbeiter</option>` + employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('')
        : '<option>Keine Mitarbeiter</option>';
}

// ── TEAM-ANSICHT ──────────────────────────────────────────
async function loadTeam() {
    const today = new Date().toISOString().split('T')[0];

    // Archivierungs-Hinweis
    const { data: archivePending } = await db
        .from('planit_terminations')
        .select('employee_id, approved_date, employees_planit!planit_terminations_employee_id_fkey(name, is_active)')
        .eq('user_id', adminSession.user.id)
        .eq('status', 'approved')
        .lte('approved_date', today);

    const toArchive  = (archivePending || []).filter(t => t.employees_planit?.is_active === true);
    const archiveCard = document.getElementById('archive-pending-card');
    if (toArchive.length > 0) {
        archiveCard.style.display = 'block';
        archiveCard.innerHTML = `
            <div class="card" style="border-left:3px solid var(--color-danger);">
                <div style="font-size:0.8rem; font-weight:700; color:var(--color-danger); margin-bottom:0.75rem;">ARCHIVIERUNG AUSSTEHEND</div>
                ${toArchive.map(t => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.35rem 0; border-top:1px solid var(--color-border);">
                        <div>
                            <div style="font-weight:600; font-size:0.9rem;">${t.employees_planit?.name || '–'}</div>
                            <div style="font-size:0.78rem; color:var(--color-text-light);">Letzter Arbeitstag: ${new Date(t.approved_date + 'T12:00:00').toLocaleDateString('de-DE', { day:'numeric', month:'long', year:'numeric' })}</div>
                        </div>
                        <button class="btn-small btn-delete btn-icon" onclick="archiveEmployee('${t.employee_id}')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                    </div>`).join('')}
            </div>`;
    } else {
        archiveCard.style.display = 'none';
    }

    // Geburtstage diesen Monat
    const thisMonth  = new Date().getMonth() + 1;
    const birthdays  = employees.filter(e => {
        if (!e.birthdate) return false;
        return parseInt(e.birthdate.split('-')[1]) === thisMonth;
    });
    const bdContainer = document.getElementById('birthdays-this-month');
    if (birthdays.length > 0) {
        const monthName = new Date().toLocaleDateString('de-DE', { month: 'long' });
        bdContainer.innerHTML = `
            <div class="card" style="background:#FFF9EC; border-left:3px solid var(--color-primary);">
                <div style="font-size:0.8rem; color:var(--color-text-light); margin-bottom:0.5rem;">🎂 GEBURTSTAGE IM ${monthName.toUpperCase()}</div>
                ${birthdays.map(e => {
                    const date  = new Date(e.birthdate + 'T00:00:00');
                    const month = date.toLocaleDateString('de-DE', { month: 'long' });
                    return `<div style="display:flex; justify-content:space-between; padding:0.25rem 0;">
                        <span style="font-weight:600;">${e.name}</span>
                        <span style="color:var(--color-text-light);">${date.getDate()}. ${month}</span>
                    </div>`;
                }).join('')}
            </div>`;
    } else {
        bdContainer.innerHTML = '';
    }

    const container = document.getElementById('team-list');
    if (employees.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Mitarbeiter vorhanden.</p></div>';
        return;
    }

    const { data: allPhases } = await db
        .from('employment_phases')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .order('start_date');

    const fmtDate  = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const fmtShort = d => { if (!d) return 'offen'; const p = d.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };
    const departments = [...new Set(employees.map(e => e.department || 'Allgemein'))].sort();

    container.innerHTML = departments.map(dept => {
        const deptEmployees = employees.filter(e => (e.department || 'Allgemein') === dept);
        return `
            <div style="font-size:0.85rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.05em; margin:1rem 0 0.5rem;">${dept.toUpperCase()}</div>
            ${deptEmployees.map(e => {
                const empPhases  = (allPhases || []).filter(p => p.employee_id === e.id).sort((a, b) => a.start_date.localeCompare(b.start_date));
                const phasesHtml = empPhases.length > 0
                    ? empPhases.map(p => `
                        <div style="display:flex; gap:0.5rem; align-items:baseline; font-size:0.82rem; padding:0.2rem 0; border-bottom:1px solid var(--color-border);">
                            <span style="min-width:7rem; color:var(--color-text-light);">${fmtShort(p.start_date)} – ${fmtShort(p.end_date)}</span>
                            <span>${p.hours_per_vacation_day}h/UT${p.notes ? ' · ' + p.notes : ''}</span>
                        </div>`).join('')
                    : `<div style="font-size:0.82rem; color:var(--color-text-light);">Keine Phasen eingetragen</div>`;

                return `
                <div style="border-radius:14px; margin-bottom:0.5rem; overflow:hidden; background:var(--color-gray);">
                    <div onclick="toggleTeamEmployee('${e.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; cursor:pointer;">
                        <div style="display:flex; align-items:center; gap:0.6rem;">
                            <span style="font-weight:700;">${e.name}</span>
                            ${e.is_apprentice ? '<span style="background:#E8D0FF; color:#9B59B6; font-size:0.7rem; padding:2px 6px; border-radius:8px; font-weight:600;">Azubi</span>' : ''}
                        </div>
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <button class="btn-small btn-pdf-view btn-icon" onclick="event.stopPropagation(); openEditEmployeeModal('${e.id}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="btn-small btn-delete btn-icon" onclick="event.stopPropagation(); deleteEmployee('${e.id}', '${e.name}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                            <span id="toggle-team-${e.id}" style="color:var(--color-text-light); font-size:0.85rem; margin-left:0.25rem;">▶</span>
                        </div>
                    </div>
                    <div id="teambody-${e.id}" style="display:none; padding:0.75rem 1rem; border-top:1px solid var(--color-border); background:white;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem 1rem; font-size:0.85rem; margin-bottom:0.75rem;">
                            <div><span style="color:var(--color-text-light);">Kürzel</span><br><strong>${e.login_code}</strong></div>
                            <div><span style="color:var(--color-text-light);">PIN</span><br><strong>${e.password_hash || '—'}</strong></div>
                            <div><span style="color:var(--color-text-light);">Abteilung</span><br><strong>${e.department || 'Allgemein'}</strong></div>
                            <div><span style="color:var(--color-text-light);">Eintrittsdatum</span><br><strong>${fmtDate(e.start_date)}</strong></div>
                            <div><span style="color:var(--color-text-light);">Geburtstag</span><br><strong>${fmtDate(e.birthdate)}</strong></div>
                            <div><span style="color:var(--color-text-light);">Urlaubstage / Jahr</span><br><strong>${e.vacation_days_per_year ?? 20}</strong></div>
                        </div>
                        <div style="font-size:0.8rem; font-weight:600; color:var(--color-text-light); margin-bottom:0.4rem;">BESCHÄFTIGUNGSPHASEN</div>
                        ${phasesHtml}
                    </div>
                </div>`;
            }).join('')}`;
    }).join('');
}

function toggleTeamEmployee(id) {
    const body  = document.getElementById(`teambody-${id}`);
    const arrow = document.getElementById(`toggle-team-${id}`);
    if (!body) return;
    const open = body.style.display !== 'none';
    body.style.display  = open ? 'none' : 'block';
    if (arrow) arrow.textContent = open ? '▶' : '▼';
}

// ── NEUER MITARBEITER ─────────────────────────────────────
function openNewEmployeeModal() {
    document.getElementById('employee-modal').classList.add('open');
    document.getElementById('emp-modal-error').style.display = 'none';
    document.getElementById('new-emp-name').value = '';
    document.getElementById('new-emp-code').value = '';
    document.getElementById('new-emp-password').value = '';
    populateDeptSelect(document.getElementById('new-emp-department'), departmentNames[0] || '');
}

function closeNewEmployeeModal() {
    document.getElementById('employee-modal').classList.remove('open');
}

function generateLoginCode(name) {
    const parts = name.trim().split(' ');
    const first = parts[0] || '';
    const last  = parts[1] || '';
    const clean = str => str.replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u')
                            .replace(/Ä/g,'A').replace(/Ö/g,'O').replace(/Ü/g,'U');
    const code = clean(first).slice(0,2) + clean(last).slice(0,2);
    return code.charAt(0).toUpperCase() + code.slice(1,2).toLowerCase() +
           code.charAt(2).toUpperCase() + code.slice(3,4).toLowerCase();
}

function previewLoginCode() {
    const name = document.getElementById('new-emp-name').value;
    document.getElementById('new-emp-code').value = name.trim() ? generateLoginCode(name) : '';
}

async function submitNewEmployee() {
    const name      = document.getElementById('new-emp-name').value.trim();
    const loginCode = document.getElementById('new-emp-code').value.trim();
    const password  = document.getElementById('new-emp-password').value;
    const errorDiv  = document.getElementById('emp-modal-error');
    errorDiv.style.display = 'none';

    if (!name || !loginCode || !password) {
        errorDiv.textContent   = 'Bitte alle Felder ausfüllen.';
        errorDiv.style.display = 'block';
        return;
    }

    const department          = document.getElementById('new-emp-department').value;
    const birthdate           = document.getElementById('new-emp-birthdate').value || null;
    const is_apprentice       = document.getElementById('new-emp-apprentice').checked;
    const startDate           = document.getElementById('new-emp-start-date').value || null;
    const hoursPerVacationDay = parseFloat(document.getElementById('new-emp-hours-per-vacation-day').value) || 8.0;
    const vacationDays        = parseInt(document.getElementById('new-emp-vacation-days')?.value) || 20;
    const employmentType      = document.getElementById('new-emp-employment-type').value || null;
    const wageType            = document.getElementById('new-emp-wage-type').value || null;
    const hourlyRate          = parseFloat(document.getElementById('new-emp-hourly-rate').value) || null;
    const hygieneErste        = document.getElementById('new-emp-hygiene-erste').value || null;
    const hygieneLetzte       = document.getElementById('new-emp-hygiene-letzte').value || null;
    const hygieneMonate       = parseInt(document.getElementById('new-emp-hygiene-monate').value) || 12;

    const { error } = await db.from('employees_planit').insert({
        user_id:                adminSession.user.id,
        name,
        login_code:             loginCode,
        password_hash:          password,
        department,
        is_active:              true,
        birthdate,
        is_apprentice,
        start_date:             startDate,
        hours_per_vacation_day: hoursPerVacationDay,
        vacation_days_per_year: vacationDays,
        employment_type:        employmentType,
        wage_type:              wageType,
        hourly_rate:            hourlyRate,
        hygiene_erste:          hygieneErste,
        hygiene_letzte:         hygieneLetzte,
        hygiene_gueltig_monate: hygieneMonate,
    });

    if (error) {
        errorDiv.textContent   = error.message.includes('unique')
            ? 'Mitarbeiter-Nummer bereits vergeben.'
            : 'Fehler beim Anlegen.';
        errorDiv.style.display = 'block';
        return;
    }

    closeNewEmployeeModal();
    await loadEmployees();
    await loadTeam();
    populateAvailEmployeeSelect();
    await loadWeekGrid();
}

// ── MITARBEITER BEARBEITEN ────────────────────────────────
let editEmployeeId = null;
let currentPhases  = [];

function openEditEmployeeModal(id) {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    editEmployeeId = id;

    document.getElementById('edit-emp-name').value     = emp.name;
    document.getElementById('edit-emp-code').value     = emp.login_code || '';
    document.getElementById('edit-emp-password').value = emp.password_hash || '';

    const selectedDepts   = (emp.departments || emp.department || '').split(',').map(s => s.trim()).filter(Boolean);
    const checksContainer = document.getElementById('edit-emp-departments-checks');
    checksContainer.style.display = 'none';
    checksContainer.previousElementSibling.querySelector('.toggle-arrow').textContent = '▶';
    checksContainer.innerHTML = departmentNames.map(name => `
        <label style="display:flex; align-items:center; gap:0.35rem; font-size:0.9rem; background:#F5F5F5; padding:0.35rem 0.6rem; border-radius:8px; cursor:pointer;">
            <input type="checkbox" value="${name}" ${selectedDepts.includes(name) ? 'checked' : ''} style="width:auto;">
            ${name}
        </label>
    `).join('');

    document.getElementById('edit-emp-error').style.display        = 'none';
    document.getElementById('edit-emp-birthdate').value            = emp.birthdate || '';
    document.getElementById('edit-emp-vacation-days').value        = emp.vacation_days_per_year ?? 20;
    document.getElementById('edit-emp-start-date').value           = emp.start_date || '';
    document.getElementById('edit-emp-hours-per-vacation-day').value = emp.hours_per_vacation_day || 8.0;
    document.getElementById('edit-emp-apprentice').checked         = emp.is_apprentice || false;
    document.getElementById('edit-emp-employment-type').value      = emp.employment_type || '';
    const wageTypeEl = document.getElementById('edit-emp-wage-type');
    wageTypeEl.value = emp.wage_type || 'Stundenlohn';
    document.getElementById('edit-emp-wage-label').textContent = wageTypeEl.value === 'Festgehalt' ? 'Festgehalt (€/Monat)' : 'Stundenlohn (€)';
    document.getElementById('edit-emp-hourly-rate').value = emp.hourly_rate || '';
    document.getElementById('edit-emp-hygiene-erste').value        = emp.hygiene_erste || '';
    document.getElementById('edit-emp-hygiene-letzte').value       = emp.hygiene_letzte || '';
    document.getElementById('edit-emp-hygiene-monate').value       = emp.hygiene_gueltig_monate ?? 12;

    currentPhases = [];
    renderEmploymentPhases();
    db.from('employment_phases').select('*').eq('employee_id', id).order('start_date')
        .then(({ data }) => { currentPhases = data || []; renderEmploymentPhases(); });

    document.getElementById('edit-employee-modal').classList.add('open');
}

function closeEditEmployeeModal() {
    document.getElementById('edit-employee-modal').classList.remove('open');
    editEmployeeId = null;
}

function renderEmploymentPhases() {
    const container = document.getElementById('edit-emp-phases');

    /* const infoEl = document.getElementById('edit-emp-current-phase-info');
    if (infoEl) {
        const today = new Date().toISOString().split('T')[0];
        const current = currentPhases
            .filter(p => p.start_date && p.start_date <= today && (!p.end_date || p.end_date >= today))
            .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
        if (current && current.employment_type && current.hourly_rate) {
            const rate = parseFloat(current.hourly_rate).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            infoEl.textContent = `Aktuell: ${current.employment_type} · ${rate} €/Std`;
            infoEl.style.display = 'block';
        } else {
            infoEl.style.display = 'none';
        }
    } */

    if (currentPhases.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.5rem;">Keine Phasen — Standardwerte gelten fürs ganze Jahr.</div>';
        return;
    }
    container.innerHTML = currentPhases.map((p, i) => `
        <div style="background:#F5F5F5; border-radius:8px; padding:0.75rem; margin-bottom:0.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <span style="font-size:0.8rem; font-weight:600;">Phase ${i + 1}</span>
                <button onclick="removeEmploymentPhase(${i})" style="background:none; border:none; color:var(--color-text-light); cursor:pointer; font-size:1rem;">✕</button>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:0.5rem;">
                <div>
                    <label style="font-size:0.75rem;">Von</label>
                    <input type="date" value="${p.start_date || ''}" onchange="updatePhase(${i}, 'start_date', this.value)" style="padding:0.4rem; font-size:0.8rem;">
                </div>
                <div>
                    <label style="font-size:0.75rem;">Bis (leer = offen)</label>
                    <input type="date" value="${p.end_date || ''}" onchange="updatePhase(${i}, 'end_date', this.value)" style="padding:0.4rem; font-size:0.8rem;">
                </div>
            </div>
            <div style="margin-bottom:0.5rem;">
                <label style="font-size:0.75rem;">Std/Urlaubstag</label>
                <input type="number" value="${p.hours_per_vacation_day ?? 8}" min="0" max="24" step="0.5" onchange="updatePhase(${i}, 'hours_per_vacation_day', parseFloat(this.value) || 0)" style="padding:0.4rem; font-size:0.8rem; width:100%;">
            </div>
            <div style="margin-bottom:0.5rem;">
                <label style="font-size:0.75rem;">AV-Art</label>
                <select onchange="updatePhase(${i}, 'employment_type', this.value)" style="padding:0.4rem; font-size:0.8rem; width:100%;">
                    <option value="">— bitte wählen —</option>
                    <option value="Vollzeit"       ${p.employment_type === 'Vollzeit'       ? 'selected' : ''}>Vollzeit</option>
                    <option value="Teilzeit"       ${p.employment_type === 'Teilzeit'       ? 'selected' : ''}>Teilzeit</option>
                    <option value="Minijob"        ${p.employment_type === 'Minijob'        ? 'selected' : ''}>Minijob</option>
                    <option value="Auszubildender" ${p.employment_type === 'Auszubildender' ? 'selected' : ''}>Azubi</option>
                    <option value="Elternzeit"     ${p.employment_type === 'Elternzeit'     ? 'selected' : ''}>Elternzeit</option>
                </select>
            </div>
            <div style="margin-bottom:0.5rem;">
                <label style="font-size:0.75rem;">Lohnart</label>
                <select onchange="updatePhase(${i}, 'wage_type', this.value); document.getElementById('phase-wage-label-${i}').textContent=this.value==='Festgehalt'?'Festgehalt (€/Monat)':'Stundenlohn (€)'" style="padding:0.4rem; font-size:0.8rem; width:100%;">
                    <option value="Stundenlohn" ${(p.wage_type || 'Stundenlohn') === 'Stundenlohn' ? 'selected' : ''}>Stundenlohn</option>
                    <option value="Festgehalt"  ${p.wage_type === 'Festgehalt'  ? 'selected' : ''}>Festgehalt</option>
                </select>
            </div>
            <div>
                <label id="phase-wage-label-${i}" style="font-size:0.75rem;">${p.wage_type === 'Festgehalt' ? 'Festgehalt (€/Monat)' : 'Stundenlohn (€)'}</label>
                <input type="number" value="${p.hourly_rate ?? ''}" min="0" step="0.01" placeholder="0.00" onchange="updatePhase(${i}, 'hourly_rate', parseFloat(this.value) || null)" style="padding:0.4rem; font-size:0.8rem; width:100%;">
            </div>
        </div>
    `).join('');
}

function addEmploymentPhase() {
    currentPhases.push({ start_date: '', end_date: '', hours_per_vacation_day: 8.0 });
    renderEmploymentPhases();
}

function removeEmploymentPhase(index) {
    currentPhases.splice(index, 1);
    renderEmploymentPhases();
}

function updatePhase(index, field, value) {
    currentPhases[index][field] = value;
}

async function submitEditEmployee() {
    const name      = document.getElementById('edit-emp-name').value.trim();
    const loginCode = document.getElementById('edit-emp-code').value.trim();
    const password  = document.getElementById('edit-emp-password').value.trim();
    const checkedDepts = [...document.querySelectorAll('#edit-emp-departments-checks input[type=checkbox]:checked')].map(cb => cb.value);
    const departments  = checkedDepts.join(',') || null;
    const department   = checkedDepts[0] || null;
    const birthdate    = document.getElementById('edit-emp-birthdate').value || null;
    const vacationDays = parseInt(document.getElementById('edit-emp-vacation-days').value) || 20;
    const startDate    = document.getElementById('edit-emp-start-date').value || null;
    const hoursPerVacationDay = parseFloat(document.getElementById('edit-emp-hours-per-vacation-day').value) || 8.0;
    const employmentType = document.getElementById('edit-emp-employment-type').value || null;
    const wageType     = document.getElementById('edit-emp-wage-type').value || null;
    const hourlyRate   = parseFloat(document.getElementById('edit-emp-hourly-rate').value) || null;
    const errorDiv     = document.getElementById('edit-emp-error');
    errorDiv.style.display = 'none';

    if (!name || !loginCode) {
        errorDiv.textContent   = 'Name und Kürzel sind Pflichtfelder.';
        errorDiv.style.display = 'block';
        return;
    }
    if (checkedDepts.length === 0) {
        errorDiv.textContent   = 'Mindestens eine Abteilung muss ausgewählt sein.';
        errorDiv.style.display = 'block';
        return;
    }

    const is_apprentice  = document.getElementById('edit-emp-apprentice').checked;
    const hygieneErste   = document.getElementById('edit-emp-hygiene-erste').value || null;
    const hygieneLetzte  = document.getElementById('edit-emp-hygiene-letzte').value || null;
    const hygieneMonate  = parseInt(document.getElementById('edit-emp-hygiene-monate').value) || 12;

    const payload = {
        name, login_code: loginCode, department, departments, birthdate,
        vacation_days_per_year: vacationDays, is_apprentice, start_date: startDate,
        hours_per_vacation_day: hoursPerVacationDay,
        employment_type: employmentType, wage_type: wageType, hourly_rate: hourlyRate,
        hygiene_erste: hygieneErste, hygiene_letzte: hygieneLetzte, hygiene_gueltig_monate: hygieneMonate,
    };
    if (password) payload.password_hash = password;

    const { error } = await db.from('employees_planit').update(payload).eq('id', editEmployeeId);
    if (error) {
        errorDiv.textContent   = 'Fehler beim Speichern.';
        errorDiv.style.display = 'block';
        return;
    }

    // Phasen: löschen + neu einfügen
    await db.from('employment_phases').delete().eq('employee_id', editEmployeeId);
    const phasesToInsert = currentPhases.filter(p => p.start_date).map(p => ({
        user_id:                adminSession.user.id,
        employee_id:            editEmployeeId,
        start_date:             p.start_date,
        end_date:               p.end_date || null,
        hours_per_vacation_day: p.hours_per_vacation_day,
        vacation_days_per_year: p.vacation_days_per_year,
        notes:                  p.notes || null,
        employment_type:        p.employment_type || null,
        wage_type:              p.wage_type || null,
        hourly_rate:            p.hourly_rate || null,
    }));
    if (phasesToInsert.length > 0) {
        await db.from('employment_phases').insert(phasesToInsert);
    }

    closeEditEmployeeModal();
    await loadEmployees();
    await loadTeam();
    populateAvailEmployeeSelect();
    await loadWeekGrid();
}

async function deleteEmployee(id, name) {
    if (!confirm(`${name} wirklich löschen?`)) return;
    await db.from('employees_planit').update({ is_active: false }).eq('id', id);
    await loadEmployees();
    await loadTeam();
    populateAvailEmployeeSelect();
    await loadWeekGrid();
}

// ── ARCHIVIERUNG ──────────────────────────────────────────
async function loadArchiveBadge() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await db
        .from('planit_terminations')
        .select('employee_id, employees_planit!planit_terminations_employee_id_fkey(name, is_active)')
        .eq('user_id', adminSession.user.id)
        .eq('status', 'approved')
        .lte('approved_date', today);

    const pending = (data || []).filter(t => t.employees_planit?.is_active === true);
    const badge   = document.getElementById('archive-badge');
    if (badge) {
        badge.textContent    = pending.length;
        badge.style.display  = pending.length > 0 ? 'inline' : 'none';
    }
}

async function archiveEmployee(employeeId) {
    await db.from('employees_planit').update({ is_active: false }).eq('id', employeeId);
    await loadEmployees();
    await loadTeam();
    await loadArchiveBadge();
}

// ── ABTEILUNGEN ───────────────────────────────────────────
async function loadDepartmentNames() {
    const { data } = await db.from('planit_departments').select('name').eq('user_id', adminSession.user.id).order('name');
    departmentNames = (data || []).map(d => d.name);
}

function populateDeptSelect(selectEl, selectedValue) {
    selectEl.innerHTML = departmentNames.map(name =>
        `<option value="${name}" ${name === selectedValue ? 'selected' : ''}>${name}</option>`
    ).join('');
    if (selectedValue) selectEl.value = selectedValue;
}

function toggleDepartmentsSection() {
    const body   = document.getElementById('departments-body');
    const toggle = document.getElementById('departments-toggle');
    const isOpen = body.style.display === 'block';
    body.style.display   = isOpen ? 'none' : 'block';
    toggle.textContent   = isOpen ? '▶' : '▼';
}

async function loadDepartments() {
    const { data: depts } = await db.from('planit_departments').select('*').eq('user_id', adminSession.user.id).order('name');
    const container = document.getElementById('departments-list');
    if (!container) return;
    if (!depts || depts.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light); padding:0.25rem 0;">Keine Abteilungen vorhanden.</div>';
        return;
    }
    container.innerHTML = depts.map(d => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
            <span style="font-size:0.9rem;">${d.name}</span>
            <button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="deleteDepartment('${d.id}')">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
        </div>
    `).join('');
}

async function addDepartment() {
    const input = document.getElementById('new-department-name');
    const name  = input.value.trim();
    if (!name) return;
    await db.from('planit_departments').insert({ user_id: adminSession.user.id, name });
    input.value = '';
    await loadDepartmentNames();
    await loadDepartments();
}

async function deleteDepartment(id) {
    if (!confirm('Abteilung wirklich löschen?')) return;
    await db.from('planit_departments').delete().eq('id', id);
    await loadDepartmentNames();
    await loadDepartments();
}

// ── KRANKMELDUNGEN ────────────────────────────────────────
let extendSickLeaveId = null;

function openSickLeaveModal() {
    const select = document.getElementById('sick-leave-employee');
    select.innerHTML = employees.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    document.getElementById('sick-leave-start').value = '';
    document.getElementById('sick-leave-end').value   = '';
    document.getElementById('sick-leave-modal').classList.add('active');
}

function closeSickLeaveModal() {
    document.getElementById('sick-leave-modal').classList.remove('active');
}

function openExtendSickLeaveModal(id, currentEnd) {
    extendSickLeaveId = id;
    document.getElementById('extend-sick-leave-end').value = currentEnd;
    document.getElementById('extend-sick-leave-modal').classList.add('active');
}

function closeExtendSickLeaveModal() {
    document.getElementById('extend-sick-leave-modal').classList.remove('active');
}

async function loadSickLeaves() {
    const { data: sickLeaves } = await db
        .from('sick_leaves')
        .select('*, employees_planit(name)')
        .eq('user_id', adminSession.user.id)
        .order('start_date', { ascending: false });

    const container = document.getElementById('sick-leave-list');
    if (!sickLeaves || sickLeaves.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Krankmeldungen vorhanden.</p></div>';
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    container.innerHTML = sickLeaves.map(s => {
        const isActive = s.end_date >= today;
        return `
        <div class="list-item">
            <div class="list-item-info">
                <h4>${s.employees_planit?.name || 'Unbekannt'} ${isActive ? '<span style="background:#FFE0CC; color:#E07040; font-size:0.7rem; padding:2px 6px; border-radius:8px;">Aktiv</span>' : ''}</h4>
                <p>${formatDate(s.start_date)} – ${formatDate(s.end_date)}</p>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <button class="btn-small btn-approve" onclick="openExtendSickLeaveModal('${s.id}', '${s.end_date}')">✎</button>
                <button class="btn-small" style="background:#FFD9D9; color:#C97E7E;" onclick="deleteSickLeave('${s.id}')">🗑</button>
            </div>
        </div>`;
    }).join('');
}

async function submitSickLeave() {
    const employeeId = document.getElementById('sick-leave-employee').value;
    const start      = document.getElementById('sick-leave-start').value;
    const end        = document.getElementById('sick-leave-end').value;
    if (!employeeId || !start || !end) return;

    const { error } = await db.from('sick_leaves').insert({
        user_id:     adminSession.user.id,
        employee_id: employeeId,
        start_date:  start,
        end_date:    end,
    });
    if (error) return;

    // Schichten in diesem Zeitraum automatisch öffnen
    const emp = employees.find(e => e.id === employeeId);
    const { data: shifts } = await db
        .from('shifts')
        .select('id, department')
        .eq('user_id', adminSession.user.id)
        .eq('employee_id', employeeId)
        .gte('shift_date', start)
        .lte('shift_date', end);

    if (shifts && shifts.length > 0) {
        for (const shift of shifts) {
            await db.from('shifts').update({
                is_open:     true,
                employee_id: null,
                open_note:   'Krankmeldung',
                department:  shift.department || emp?.department || 'Allgemein',
            }).eq('id', shift.id);
        }
    }

    closeSickLeaveModal();
    await loadSickLeaves();
    await loadWeekGrid();
}

// Alias
const saveSickLeave = submitSickLeave;

async function submitExtendSickLeave() {
    const newEnd = document.getElementById('extend-sick-leave-end').value;
    if (!newEnd) return;

    const { data: sick } = await db.from('sick_leaves').select('*').eq('id', extendSickLeaveId).maybeSingle();
    if (!sick) return;

    await db.from('sick_leaves').update({ end_date: newEnd }).eq('id', extendSickLeaveId);

    if (newEnd > sick.end_date) {
        const { data: shifts } = await db.from('shifts').select('id, department')
            .eq('user_id', adminSession.user.id)
            .eq('employee_id', sick.employee_id)
            .gt('shift_date', sick.end_date)
            .lte('shift_date', newEnd);
        if (shifts && shifts.length > 0) {
            const { data: empRow } = await db.from('employees_planit').select('department').eq('id', sick.employee_id).maybeSingle();
            for (const shift of shifts) {
                await db.from('shifts').update({
                    is_open: true, employee_id: null, open_note: 'Krankmeldung',
                    department: shift.department || empRow?.department || 'Allgemein',
                }).eq('id', shift.id);
            }
        }
    } else if (newEnd < sick.end_date) {
        const { data: shifts } = await db.from('shifts').select('id')
            .eq('user_id', adminSession.user.id)
            .eq('is_open', true).eq('open_note', 'Krankmeldung')
            .gt('shift_date', newEnd).lte('shift_date', sick.end_date);
        if (shifts && shifts.length > 0) {
            for (const shift of shifts) {
                await db.from('shifts').update({
                    is_open: false, employee_id: sick.employee_id, open_note: null, department: null,
                }).eq('id', shift.id);
            }
        }
    }

    closeExtendSickLeaveModal();
    await loadSickLeaves();
    await loadWeekGrid();
}

async function deleteSickLeave(id) {
    if (!confirm('Krankmeldung wirklich löschen?')) return;

    const { data: sick } = await db.from('sick_leaves').select('*').eq('id', id).maybeSingle();
    if (!sick) return;

    const { data: shifts } = await db.from('shifts').select('id')
        .eq('user_id', adminSession.user.id)
        .eq('is_open', true).eq('open_note', 'Krankmeldung')
        .gte('shift_date', sick.start_date).lte('shift_date', sick.end_date);

    if (shifts && shifts.length > 0) {
        for (const shift of shifts) {
            await db.from('shifts').update({
                is_open: false, employee_id: sick.employee_id, open_note: null, department: null,
            }).eq('id', shift.id);
        }
    }

    await db.from('sick_leaves').delete().eq('id', id);
    await loadSickLeaves();
    await loadWeekGrid();
}
