// ── LOHNABRECHNUNG ────────────────────────────────────────
// Ported from GastroHub/ShiftIn/js/payroll.js + ui.js
// Adapted for PlanIt DB structure:
//   - employees_planit (not adminState.employees)
//   - shifts with actual_start_time/end_time (not time-clock entries)
//   - sick_leaves, vacation_requests (not adminState.absences)
//   - getBWHolidays() from shared/utils.js

// ── STATE ─────────────────────────────────────────────────

const payrollState = {
    step: 0, // 0=geschlossen, 1=Zeitraum, 2=Spalten, 3=Daten, 4=PDF
    period: {
        startDate: '',
        endDate: '',
        restaurantName: '',
        holidays: []   // manuell hinzugefügte Extra-Feiertage (YYYY-MM-DD)
    },
    columns: {
        // Pflicht (immer aktiv)
        name: true, avType: true, hourlyRate: true,
        workedHours: true, totalHours: true, grossPay: true,
        // Optional
        overtime: false, sickHours: false, vacationHours: false,
        allowances: false, bonus: false, vwl: false,
        benefits: false, comment: false,
        // Zusatz-Tabellen
        allowancesDetail: false, sickHoursDetail: false
    },
    allowanceRates: { night: 25, sunday: 50, holiday: 125, overtime: 25 },
    employees: [],          // befüllt in Schritt 2→3
    _shiftsCache: null,     // { startDate, endDate, data }
    _sickCache: null,
    _vacCache: null
};

// ── FEIERTAGS-PRÜFUNG ─────────────────────────────────────

function payrollIsHoliday(dateStr) {
    if (payrollState.period.holidays.includes(dateStr)) return true;
    const year = parseInt(dateStr.split('-')[0], 10);
    const bwHols = getBWHolidays(year);   // aus shared/utils.js
    return Object.values(bwHols).includes(dateStr);
}

// ── HILFSFUNKTION: Dezimalstunden → "Xh Ymin" ─────────────

function fmtHours(decimalHours) {
    const total = parseFloat(decimalHours) || 0;
    const h = Math.floor(total);
    const m = Math.round((total - h) * 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── UI-RENDERING ──────────────────────────────────────────

function renderPayrollUI() {
    let overlay = document.getElementById('payroll-overlay');
    if (payrollState.step === 0) {
        if (overlay) overlay.remove();
        return;
    }
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'payroll-overlay';
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = renderPayrollWizardHTML();
    // Überstunden + Brutto nach Render initialisieren
    if (payrollState.step === 3) {
        setTimeout(() => {
            payrollState.employees.forEach((_, i) => {
                updatePayrollOvertime(i);
                updatePayrollAllowancesUI(i);
            });
        }, 50);
    }
}

function renderPayrollWizardHTML() {
    return `
    <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;overflow-y:auto;padding:1rem;box-sizing:border-box;">
        <div style="background:#F9F5F1;border-radius:24px;padding:1.5rem;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;box-sizing:border-box;">
            <div style="position:relative;text-align:center;margin-bottom:0.25rem;">
                <h2 style="color:var(--color-text);margin:0;">Vorlohnabrechnung</h2>
                <button onclick="closePayrollWizard()" style="position:absolute;top:0;right:0;background:none;border:none;cursor:pointer;padding:0.25rem;color:var(--color-text-light);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <p style="color:var(--color-text-light);font-size:0.85rem;margin-bottom:1.5rem;text-align:center;">Schritt ${payrollState.step} von 4</p>

            ${payrollState.step === 1 ? renderPayrollStep1() : ''}
            ${payrollState.step === 2 ? renderPayrollStep2() : ''}
            ${payrollState.step === 3 ? renderPayrollStep3() : ''}
            ${payrollState.step === 4 ? renderPayrollStep4() : ''}

            ${payrollState.step < 4 ? `
            <div style="display:flex;justify-content:center;align-items:center;gap:1rem;margin-top:1.25rem;">
                ${payrollState.step > 1 ? `
                <button onclick="previousPayrollStep()" style="width:3.2rem;height:3.2rem;border-radius:50%;background:#8B6F47;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>` : ''}
                <button onclick="nextPayrollStep()" style="width:3.2rem;height:3.2rem;border-radius:50%;background:#B28A6E;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>
            </div>` : ''}
        </div>
    </div>`;
}

function renderPayrollStep1() {
    const holiInputs = payrollState.period.holidays.map((h, i) => `
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;align-items:center;">
            <input type="date" value="${h}"
                min="${payrollState.period.startDate}" max="${payrollState.period.endDate}"
                onchange="payrollState.period.holidays[${i}]=this.value; renderPayrollUI();"
                style="flex:1;padding:0.6rem;border:1px solid #ddd;border-radius:8px;font-size:0.9rem;">
            <button onclick="payrollState.period.holidays.splice(${i},1); renderPayrollUI();"
                class="btn-small btn-delete btn-icon">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>`).join('');

    return `
    <div>
        <div class="form-group">
            <label>Restaurant-Name</label>
            <input type="text" value="${payrollState.period.restaurantName}"
                oninput="payrollState.period.restaurantName=this.value"
                placeholder="Restaurant-Namen eingeben"
                style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div class="form-group">
                <label>Von</label>
                <input type="date" value="${payrollState.period.startDate}"
                    onchange="payrollState.period.startDate=this.value; renderPayrollUI();"
                    style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
            </div>
            <div class="form-group">
                <label>Bis</label>
                <input type="date" value="${payrollState.period.endDate}"
                    onchange="payrollState.period.endDate=this.value; renderPayrollUI();"
                    style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
            </div>
        </div>
        <div class="form-group">
            <label>Extra-Feiertage im Zeitraum</label>
            <div id="payroll-holidays-container">${holiInputs}</div>
            <button onclick="payrollState.period.holidays.push(''); renderPayrollUI();"
                class="btn-secondary" style="font-size:0.85rem;padding:0.4rem 0.9rem;margin-top:0.5rem;">
                + Feiertag hinzufügen
            </button>
        </div>
    </div>`;
}

function renderPayrollStep2() {
    const col = payrollState.columns;
    const checkbox = (key, label) =>
        `<label style="display:flex;align-items:center;gap:8px;margin-bottom:0.5rem;cursor:pointer;">
            <input type="checkbox" ${col[key] ? 'checked' : ''}
                onchange="payrollState.columns.${key}=this.checked; renderPayrollUI();"
                style="width:auto;flex-shrink:0;">
            <span>${label}</span>
        </label>`;
    return `
    <div>
        <div style="background:#F0EAE4;padding:0.75rem 1rem;border-radius:10px;margin-bottom:1rem;font-size:0.85rem;color:var(--color-text-light);">
            <strong>PFLICHT:</strong> Name, AV-Art, Stundenlohn, Gearbeitet, Gesamt Std., Brutto
        </div>
        <p style="font-weight:700;margin-bottom:0.5rem;">OPTIONAL:</p>
        ${checkbox('overtime',       'Überstunden')}
        ${checkbox('sickHours',      'Krankheitsstunden')}
        ${checkbox('vacationHours',  'Urlaubsstunden')}
        ${checkbox('allowances',     'Zuschläge (Summe)')}
        ${checkbox('bonus',          'Prämie')}
        ${checkbox('vwl',            'VWL')}
        ${checkbox('benefits',       'Sachbezug')}
        ${checkbox('comment',        'Kommentar')}
        <p style="font-weight:700;margin:1rem 0 0.5rem;">ZUSATZ-TABELLEN:</p>
        ${checkbox('allowancesDetail', 'Zuschläge-Detail')}
        ${checkbox('sickHoursDetail',  'Krankstunden-Detail')}
    </div>`;
}

function renderPayrollStep3() {
    const { startDate, endDate } = payrollState.period;
    const rows = payrollState.employees.map((emp, i) => {
        const hasVacation = (payrollState._vacTakenCache || []).some(v => v.employee_id === emp.id);
        const hasSick     = (payrollState._sickCache     || []).some(v => v.employee_id === emp.id);
        const badges = [
            hasVacation ? `<span style="font-size:0.72rem;font-weight:500;padding:2px 8px;border-radius:20px;background:#D8F0D8;color:#4CAF50;">🌴 Urlaub vorhanden</span>` : '',
            hasSick     ? `<span style="font-size:0.72rem;font-weight:500;padding:2px 8px;border-radius:20px;background:#FEF3C7;color:#D97706;">🤒 Krankmeldung vorhanden</span>` : '',
        ].filter(Boolean).join('');
        return `
        <div style="background:#F5EFEA;padding:1.25rem;border-radius:16px;margin-bottom:0.75rem;">
            <h4 onclick="const b=this.nextElementSibling;const o=b.style.display==='none';b.style.display=o?'block':'none';this.querySelector('.prl-arr').textContent=o?'▼':'▶';"
                style="margin:0 0 0 0;cursor:pointer;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                <span class="prl-arr">▶</span> ${emp.name}
                ${badges}
            </h4>
            <div style="display:none;">
                <div style="background:#718974;color:white;padding:0.75rem 1rem;border-radius:10px;margin:0.75rem 0;font-size:0.85rem;">
                    <div>Gearbeitet: <strong>${fmtHours(emp.workedHours)}</strong></div>
                    <div>Krank: <strong>${fmtHours(emp.sickHours)}</strong></div>
                    <div>Urlaub: <strong>${fmtHours(emp.vacationHours)}</strong></div>
                    <div>Überstd. Vormonat: <strong>${fmtHours(emp.overtimeFromPrevMonth || 0)}</strong></div>
                    ${emp.avType ? `<div>AV-Art: <strong>${emp.avType}</strong></div>` : ''}
                    ${emp.hourlyRate ? `<div>${emp.wageType === 'Festgehalt' ? 'Festgehalt' : 'Stundenlohn'}: <strong>${parseFloat(emp.hourlyRate).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${emp.wageType === 'Festgehalt' ? '€/Monat' : '€'}</strong></div>` : ''}
                </div>
                ${false ? `
                <div class="form-group">
                    <label style="font-size:0.8rem;">Vereinbarte Std./Monat (für Überstunden)</label>
                    <input type="number" step="0.5" value="${emp.monthlyHours}"
                        oninput="updatePayrollMonthlyHours(${i}, this.value)"
                        style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
                </div>
                <p style="font-size:0.85rem;color:#718974;margin:0.25rem 0 0.75rem;">
                    Überstunden: <strong id="payroll-overtime-${i}">0h</strong>
                </p>
                <div id="payroll-allowances-${i}" style="margin-bottom:0.75rem;"></div>
                ` : ''}
                ${payrollState.columns.bonus ? `
                <div class="form-group">
                    <label style="font-size:0.8rem;">Prämie (€)</label>
                    <input type="number" step="0.01" value="${emp.bonus||''}" placeholder="0.00"
                        oninput="payrollState.employees[${i}].bonus=this.value"
                        style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
                </div>` : ''}
                ${payrollState.columns.vwl ? `
                <div class="form-group">
                    <label style="font-size:0.8rem;">VWL (€)</label>
                    <input type="number" step="0.01" value="${emp.vwl||''}" placeholder="0.00"
                        oninput="payrollState.employees[${i}].vwl=this.value"
                        style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
                </div>` : ''}
                ${payrollState.columns.benefits ? `
                <div class="form-group">
                    <label style="font-size:0.8rem;">Sachbezug (€)</label>
                    <input type="number" step="0.01" value="${emp.benefits||''}" placeholder="0.00"
                        oninput="payrollState.employees[${i}].benefits=this.value"
                        style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;">
                </div>` : ''}
                <div class="form-group">
                    <label style="font-size:0.8rem;">Kommentar/Notiz</label>
                    <textarea oninput="payrollState.employees[${i}].comment=this.value"
                        placeholder="Optional"
                        style="width:100%;padding:0.6rem;border:1px solid #ddd;border-radius:8px;min-height:50px;resize:vertical;">${emp.comment||''}</textarea>
                </div>
                <p style="font-weight:700;font-size:0.95rem;padding-top:0.75rem;border-top:1px solid #ddd;margin-top:0.5rem;">
                    Brutto: <span id="payroll-brutto-${i}">0,00 €</span>
                </p>
            </div>
        </div>`;
    }).join('');

    return `
    <div>
        <h3 style="margin-bottom:0.75rem;">Mitarbeiter-Daten</h3>
        ${rows}
    </div>`;
}

function renderPayrollStep4() {
    const s = payrollState.period;
    const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('de-DE');
    return `
    <div>
        <h3 style="margin-bottom:0.75rem;">PDF erstellen</h3>
        <div style="background:#F5EFEA;padding:1rem;border-radius:12px;margin-bottom:1rem;font-size:0.9rem;">
            <div><strong>Zeitraum:</strong> ${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}</div>
            <div><strong>Mitarbeiter:</strong> ${payrollState.employees.length}</div>
        </div>
        <div style="display:flex;justify-content:center;gap:1rem;margin-top:0.5rem;">
            <button onclick="previousPayrollStep()" title="Zurück" style="width:3.2rem;height:3.2rem;border-radius:50%;background:#8B6F47;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <button onclick="previewPayrollPDF()" title="Vorschau" style="width:3.2rem;height:3.2rem;border-radius:50%;background:#8B6F47;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button onclick="downloadPayrollPDF()" title="Herunterladen" style="width:3.2rem;height:3.2rem;border-radius:50%;background:#B28A6E;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
        </div>
    </div>`;
}

// ── WIZARD-STEUERUNG ──────────────────────────────────────

async function openPayrollWizard() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    payrollState.period.startDate = fmt(firstDay);
    payrollState.period.endDate   = fmt(lastDay);
    const { data: restaurant } = await db
        .from('planit_restaurants')
        .select('name')
        .eq('user_id', adminSession.user.id)
        .maybeSingle();
    payrollState.period.restaurantName = restaurant?.name || '';
    payrollState.step = 1;
    renderPayrollUI();
}

function closePayrollWizard() {
    payrollState.step = 0;
    renderPayrollUI();
}

function previousPayrollStep() {
    payrollState.step--;
    renderPayrollUI();
}

async function nextPayrollStep() {
    if (payrollState.step === 1) {
        if (!payrollState.period.startDate || !payrollState.period.endDate) {
            alert('Bitte beide Daten auswählen!'); return;
        }
        if (new Date(payrollState.period.endDate) < new Date(payrollState.period.startDate)) {
            alert('Enddatum muss nach Startdatum liegen!'); return;
        }
    }
    if (payrollState.step === 2) {
        await loadPayrollEmployeeData();
    }
    payrollState.step++;
    renderPayrollUI();
}

// ── DATEN LADEN ───────────────────────────────────────────

async function loadPayrollEmployeeData() {
    const { startDate, endDate } = payrollState.period;
    const uid = adminSession.user.id;

    // Vormonat-Monatsstring für actual_hours (carry_over_minutes)
    const periodStart  = new Date(startDate + 'T12:00:00');
    const prevMonthStr = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;

    const [{ data: emps }, { data: shifts }, { data: sickLeaves }, { data: vacTaken }, { data: restaurant }, { data: actualHours }, { data: phases }] = await Promise.all([
        db.from('employees_planit').select('*').eq('user_id', uid).eq('is_active', true).order('name'),
        db.from('shifts')
            .select('employee_id, shift_date, start_time, end_time, break_minutes, actual_start_time, actual_end_time, actual_break_minutes')
            .eq('user_id', uid).eq('is_open', false)
            .gte('shift_date', startDate).lte('shift_date', endDate),
        db.from('sick_leaves').select('employee_id, start_date, end_date')
            .eq('user_id', uid)
            .lte('start_date', endDate).gte('end_date', startDate),
        db.from('vacation_requests')
            .select('employee_id, start_date, end_date, deducted_hours, deducted_days')
            .eq('user_id', uid).eq('status', 'approved')
            .lte('start_date', endDate).gte('end_date', startDate),
        db.from('planit_restaurants').select('name').eq('user_id', uid).maybeSingle(),
        db.from('actual_hours').select('employee_id, carry_over_minutes').eq('month', prevMonthStr),
        db.from('employment_phases').select('employee_id, start_date, end_date, employment_type, hourly_rate').eq('user_id', uid)
    ]);

    if (restaurant?.name && !payrollState.period.restaurantName) {
        payrollState.period.restaurantName = restaurant.name;
    }

    payrollState._shiftsCache   = shifts    || [];
    payrollState._sickCache     = sickLeaves || [];
    payrollState._vacTakenCache = vacTaken  || [];

    payrollState.employees = (emps || []).map(e => {
        const empShifts = (shifts || []).filter(s => s.employee_id === e.id);

        const activePhase = (phases || [])
            .filter(p => p.employee_id === e.id
                && p.start_date <= startDate
                && (!p.end_date || p.end_date >= endDate))
            .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];

        const resolvedAvType    = activePhase?.employment_type || e.employment_type || '';
        const resolvedHourlyRate = activePhase?.hourly_rate ?? e.hourly_rate ?? null;

        return {
            id:                  e.id,
            name:                e.name,
            avType:              resolvedAvType,
            wageType:            e.wage_type || 'Stundenlohn',
            hourlyRate:          resolvedHourlyRate ? String(parseFloat(resolvedHourlyRate)) : '',
            monthlyHours:        e.monthly_hours   ? String(parseFloat(e.monthly_hours)) : '',
            workedHours:         calcWorkedHours(empShifts).toFixed(2),
            sickHours:           calcSickHours(e.id, sickLeaves || [], empShifts, startDate, endDate).toFixed(2),
            vacationHours:       calcVacationHours(e.id, vacTaken || [], startDate, endDate, parseFloat(e.hours_per_vacation_day) || 8).toFixed(2),
            nightHours:          calcNightHours(empShifts).toFixed(2),
            sundayHours:         calcSundayHours(empShifts).toFixed(2),
            holidayHours:        calcHolidayHours(empShifts).toFixed(2),
            overtimeFromPrevMonth: (() => {
                const entry = (actualHours || []).find(a => a.employee_id === e.id);
                return entry ? parseFloat((entry.carry_over_minutes / 60).toFixed(2)) : 0;
            })(),
            payOvertime:         false,
            payOvertimeAllowance:false,
            payAllowances:       false,
            payNightAllowance:   false,
            paySundayAllowance:  false,
            payHolidayAllowance: false,
            overtimePayout:      false,
            overtimePercent:     payrollState.allowanceRates.overtime,
            bonus: '', vwl: '', benefits: '', comment: ''
        };
    });
}

// ── STUNDENBERECHNUNGEN (auf Basis von shifts) ────────────

function shiftMinutes(s) {
    const startStr = s.actual_start_time || s.start_time;
    const endStr   = s.actual_end_time   || s.end_time;
    const breakMin = (s.actual_break_minutes !== null && s.actual_break_minutes !== undefined)
        ? s.actual_break_minutes : (s.break_minutes || 0);
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm) - breakMin);
}

function calcWorkedHours(empShifts) {
    return empShifts.reduce((sum, s) => sum + shiftMinutes(s) / 60, 0);
}

function calcSickHours(empId, sickLeaves, empShifts, startDate, endDate) {
    // Für Krankheitstage: Schichtstunden an diesen Tagen zählen (oder 0 wenn keine Schicht)
    let total = 0;
    sickLeaves.filter(sl => sl.employee_id === empId).forEach(sl => {
        const sickStart = sl.start_date > startDate ? sl.start_date : startDate;
        const sickEnd   = sl.end_date   < endDate   ? sl.end_date   : endDate;
        // Alle Schichten an Krankheitstagen
        empShifts.filter(s => s.shift_date >= sickStart && s.shift_date <= sickEnd)
            .forEach(s => { total += shiftMinutes(s) / 60; });
    });
    return total;
}

function calcVacationHours(empId, vacations, startDate, endDate, hoursPerDay = 8) {
    const pStart = new Date(startDate);
    const pEnd   = new Date(endDate);
    return vacations
        .filter(v => v.employee_id === empId)
        .reduce((sum, v) => {
            const vStart = new Date(v.start_date);
            const vEnd   = new Date(v.end_date);
            const totalDays   = Math.round((vEnd - vStart) / 86400000) + 1;
            const overlapStart = pStart > vStart ? pStart : vStart;
            const overlapEnd   = pEnd   < vEnd   ? pEnd   : vEnd;
            const overlapDays  = Math.round((overlapEnd - overlapStart) / 86400000) + 1;
            if (overlapDays <= 0) return sum;
            const hours = parseFloat(v.deducted_hours) || parseFloat(v.deducted_days) * hoursPerDay || 0;
            return sum + hours * (overlapDays / totalDays);
        }, 0);
}

function calcNightHours(empShifts) {
    let nightHours = 0;
    empShifts.forEach(s => {
        const startStr = s.actual_start_time || s.start_time;
        const endStr   = s.actual_end_time   || s.end_time;
        const [sh, sm] = startStr.split(':').map(Number);
        const [eh, em] = endStr.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin   = eh * 60 + em;
        // Nachtstunden: 20:00–24:00 und 00:00–06:00
        for (let m = startMin; m < endMin; m += 60) {
            const h = Math.floor(m / 60) % 24;
            if (h >= 20 || h < 6) nightHours += 1;
        }
    });
    return nightHours;
}

function calcSundayHours(empShifts) {
    return empShifts.reduce((sum, s) => {
        if (new Date(s.shift_date + 'T12:00:00').getDay() === 0) {
            return sum + shiftMinutes(s) / 60;
        }
        return sum;
    }, 0);
}

function calcHolidayHours(empShifts) {
    return empShifts.reduce((sum, s) => {
        if (payrollIsHoliday(s.shift_date)) {
            return sum + shiftMinutes(s) / 60;
        }
        return sum;
    }, 0);
}

// ── BRUTTO-HILFSBERECHNUNG ────────────────────────────────

const MINIJOB_CAP = 603;

function calcEmpBrutto(emp) {
    const rate       = parseFloat(emp.hourlyRate || 0);
    const totalHours = parseFloat(emp.workedHours) + parseFloat(emp.sickHours || 0) + parseFloat(emp.vacationHours || 0);
    let brutto, displayHours;
    if (emp.wageType === 'Festgehalt') {
        brutto       = rate;
        displayHours = totalHours;
    } else if ((emp.avType === 'Vollzeit' || emp.avType === 'Auszubildender') && emp.monthlyHours && parseFloat(emp.monthlyHours) > 0) {
        const vacPay = parseFloat(emp.vacationHours || 0) * rate;
        brutto       = parseFloat(emp.monthlyHours) * rate + vacPay;
        displayHours = totalHours;
    } else {
        brutto       = totalHours * rate;
        displayHours = totalHours;
    }
    if (emp.avType === 'Minijob' && brutto > MINIJOB_CAP) {
        brutto       = MINIJOB_CAP;
        displayHours = rate > 0 ? MINIJOB_CAP / rate : displayHours;
    }
    return { brutto, displayHours };
}

// ── LIVE-UPDATE-FUNKTIONEN ────────────────────────────────

function updatePayrollOvertime(index) {
    const emp = payrollState.employees[index];
    const totalWorked = parseFloat(emp.workedHours) + parseFloat(emp.overtimeFromPrevMonth || 0);
    const overtime = emp.monthlyHours && totalWorked > parseFloat(emp.monthlyHours)
        ? (totalWorked - parseFloat(emp.monthlyHours)).toFixed(2) : '0';

    const el = document.getElementById(`payroll-overtime-${index}`);
    if (el) el.textContent = fmtHours(overtime);

    const { brutto } = calcEmpBrutto(emp);
    const bEl = document.getElementById(`payroll-brutto-${index}`);
    if (bEl) bEl.textContent = brutto.toFixed(2).replace('.', ',') + ' €';

    updatePayrollAllowancesUI(index);
}

function updatePayrollHourlyRate(index, value) {
    payrollState.employees[index].hourlyRate = value;
    updatePayrollOvertime(index);
}

function updatePayrollMonthlyHours(index, value) {
    payrollState.employees[index].monthlyHours = value;
    updatePayrollOvertime(index);
}

function updatePayrollAllowancesUI(index) {
    const emp = payrollState.employees[index];
    const container = document.getElementById(`payroll-allowances-${index}`);
    if (!container) return;

    const rates = payrollState.allowanceRates;
    const rate  = parseFloat(emp.hourlyRate || 0);
    const totalWorked = parseFloat(emp.workedHours) + parseFloat(emp.overtimeFromPrevMonth || 0);
    const overtime = emp.monthlyHours && totalWorked > parseFloat(emp.monthlyHours)
        ? (totalWorked - parseFloat(emp.monthlyHours)).toFixed(2) : '0';

    const nightAmt   = (parseFloat(emp.nightHours || 0)   * rate * rates.night   / 100).toFixed(2);
    const sundayAmt  = (parseFloat(emp.sundayHours || 0)  * rate * rates.sunday  / 100).toFixed(2);
    const holidayAmt = (parseFloat(emp.holidayHours || 0) * rate * rates.holiday / 100).toFixed(2);
    const otAmt      = (parseFloat(overtime) * rate * (emp.overtimePercent || rates.overtime) / 100).toFixed(2);

    const cb = (stateKey, label) =>
        `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:white;border-radius:8px;cursor:pointer;margin-bottom:0.4rem;">
            <input type="checkbox" ${emp[stateKey]?'checked':''} style="width:18px;height:18px;"
                onchange="payrollState.employees[${index}].${stateKey}=this.checked; updatePayrollAllowancesUI(${index})">
            <span style="font-size:0.85rem;">${label}</span>
        </label>`;

    container.innerHTML = `
    <div style="background:#F5EFEA;padding:0.75rem;border-radius:10px;">
        ${parseFloat(overtime) > 0 ? `
            ${cb('payOvertime', 'Überstunden auszahlen')}
            ${emp.payOvertime ? `
                <div style="margin-left:1.5rem;margin-bottom:0.5rem;">
                    ${cb('payOvertimeAllowance', `Überstd.-Zuschlag (${emp.overtimePercent || rates.overtime}%)`)}
                    ${emp.payOvertimeAllowance ? `<p style="font-size:0.8rem;color:#555;margin:0 0 0.4rem 1.5rem;">${overtime}h × ${rate}€ × ${emp.overtimePercent || rates.overtime}% = <strong>${otAmt} €</strong></p>` : ''}
                </div>` : ''}
        ` : ''}
        ${cb('payAllowances', 'Zuschläge auszahlen')}
        ${emp.payAllowances ? `
        <div style="margin-left:1.5rem;">
            ${cb('payNightAllowance',    `🌙 Nachtzuschlag (${rates.night}%)`)}
            ${emp.payNightAllowance   ? `<p style="font-size:0.8rem;color:#555;margin:0 0 0.4rem 1.5rem;">${emp.nightHours}h × ${rate}€ × ${rates.night}% = <strong>${nightAmt} €</strong></p>` : ''}
            ${cb('paySundayAllowance',   `☀️ Sonntagszuschlag (${rates.sunday}%)`)}
            ${emp.paySundayAllowance  ? `<p style="font-size:0.8rem;color:#555;margin:0 0 0.4rem 1.5rem;">${emp.sundayHours}h × ${rate}€ × ${rates.sunday}% = <strong>${sundayAmt} €</strong></p>` : ''}
            ${cb('payHolidayAllowance',  `🎉 Feiertagszuschlag (${rates.holiday}%)`)}
            ${emp.payHolidayAllowance ? `<p style="font-size:0.8rem;color:#555;margin:0 0 0.4rem 1.5rem;">${emp.holidayHours}h × ${rate}€ × ${rates.holiday}% = <strong>${holidayAmt} €</strong></p>` : ''}
        </div>` : ''}
    </div>`;
}

// ── PDF AUFBAU ────────────────────────────────────────────

async function buildPayrollPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    const fmt = n => parseFloat(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('de-DE');

    let yPos = 15;
    const checkBreak = () => { if (yPos > 180) { doc.addPage(); yPos = 20; } };

    // Header
    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(payrollState.period.restaurantName || 'Vorlohnabrechnung', 148, yPos, { align: 'center' });
    yPos += 8;
    doc.setFontSize(12); doc.setFont(undefined, 'normal');
    doc.text(`Zeitraum: ${fmtDate(payrollState.period.startDate)} – ${fmtDate(payrollState.period.endDate)}`, 148, yPos, { align: 'center' });
    yPos += 12;

    // ── Tabelle 1: Lohn/Gehalt ──
    const colW = { name: 35, avType: 18, rate: 22, worked: 22, sick: 22, vac: 22, ot: 22, total: 22, gross: 28 };
    doc.setFont(undefined, 'bold'); doc.setFontSize(12);
    doc.text('Lohn / Gehalt', 14, yPos); yPos += 7;
    doc.setFontSize(9);
    let x = 14;
    const cols = payrollState.columns;
    doc.text('Name', x, yPos); x += colW.name;
    doc.text('AV-Art', x, yPos); x += colW.avType;
    doc.text('Stundenlohn', x, yPos); x += colW.rate;
    doc.text('Gearbeitet', x, yPos); x += colW.worked;
    if (cols.sickHours)     { doc.text('Krank', x, yPos); x += colW.sick; }
    if (cols.vacationHours) { doc.text('Urlaub', x, yPos); x += colW.vac; }
    if (cols.overtime)      { doc.text('Überstunden', x, yPos); x += colW.ot; }
    doc.text('Gesamt Std', x, yPos); x += colW.total;
    doc.text('Brutto', x, yPos); x += colW.gross;
    if (cols.comment) doc.text('Kommentar', x, yPos);
    yPos += 2; doc.setLineWidth(0.3); doc.line(14, yPos, 282, yPos); yPos += 5;

    doc.setFont(undefined, 'normal');
    payrollState.employees.forEach(emp => {
        x = 14;
        const rate = parseFloat(emp.hourlyRate || 0);
        const { brutto, displayHours } = calcEmpBrutto(emp);

        const nameLines = doc.splitTextToSize(emp.name, colW.name - 1);
        const rowH = Math.max(6, nameLines.length * 5);
        if (yPos + rowH > 185) { doc.addPage(); yPos = 20; }

        doc.text(nameLines, x, yPos); x += colW.name;
        doc.text((emp.avType === 'Auszubildender' ? 'Azubi' : emp.avType) || '–', x, yPos); x += colW.avType;
        doc.text(fmt(rate) + ' €', x, yPos); x += colW.rate;
        doc.text(fmt(emp.workedHours) + ' h', x, yPos); x += colW.worked;
        if (cols.sickHours)     { doc.text(fmt(emp.sickHours) + ' h', x, yPos); x += colW.sick; }
        if (cols.vacationHours) { doc.text(fmt(emp.vacationHours) + ' h', x, yPos); x += colW.vac; }
        if (cols.overtime) {
            const ot = emp.monthlyHours
                ? Math.max(0, parseFloat(emp.workedHours) + parseFloat(emp.overtimeFromPrevMonth||0) - parseFloat(emp.monthlyHours))
                : 0;
            doc.text(fmt(ot) + ' h', x, yPos); x += colW.ot;
        }
        doc.text(fmt(displayHours) + ' h', x, yPos); x += colW.total;
        doc.text(fmt(brutto) + ' €', x, yPos); x += colW.gross;
        if (cols.comment && emp.comment) doc.text(emp.comment.substring(0, 30), x, yPos);
        yPos += rowH;
    });
    yPos += 5; checkBreak();

    // ── Tabelle 1B: Zusatzleistungen ──
    const hasAdd = cols.bonus || cols.vwl || cols.benefits;
    if (hasAdd) {
        if (yPos > 140) { doc.addPage(); yPos = 20; }
        doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        doc.text('Zusatzleistungen', 14, yPos); yPos += 7;
        doc.setFontSize(9); x = 14;
        doc.text('Name', x, yPos); x += 50;
        if (cols.bonus)    { doc.text('Prämie', x, yPos); x += 30; }
        if (cols.vwl)      { doc.text('VWL', x, yPos); x += 30; }
        if (cols.benefits) { doc.text('Sachbezug', x, yPos); x += 35; }
        yPos += 2; doc.line(14, yPos, 282, yPos); yPos += 5;
        doc.setFont(undefined, 'normal');
        payrollState.employees.forEach(emp => {
            x = 14;
            doc.text(emp.name, x, yPos); x += 50;
            if (cols.bonus)    { doc.text(emp.bonus    ? fmt(emp.bonus)    + ' €' : '–', x, yPos); x += 30; }
            if (cols.vwl)      { doc.text(emp.vwl      ? fmt(emp.vwl)      + ' €' : '–', x, yPos); x += 30; }
            if (cols.benefits) { doc.text(emp.benefits ? fmt(emp.benefits) + ' €' : '–', x, yPos); x += 35; }
            yPos += 6;
        });
        yPos += 5; checkBreak();
    }

    // ── Tabelle 2: Zuschläge Detail ──
    const hasAllowances = payrollState.employees.some(e => e.payAllowances || e.payOvertime);
    if (cols.allowancesDetail && hasAllowances) {
        if (yPos > 140) { doc.addPage(); yPos = 20; }
        const rates = payrollState.allowanceRates;
        doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        doc.text('Zuschläge', 14, yPos); yPos += 7;
        doc.setFontSize(9); x = 14;
        doc.text('Name', x, yPos); x += colW.name;
        doc.text(`Nacht (${rates.night}%)`, x, yPos); x += 30;
        doc.text(`Sonntag (${rates.sunday}%)`, x, yPos); x += 30;
        doc.text(`Feiertag (${rates.holiday}%)`, x, yPos); x += 35;
        doc.text(`Überstd (${rates.overtime}%)`, x, yPos);
        yPos += 2; doc.line(14, yPos, 282, yPos); yPos += 5;
        doc.setFont(undefined, 'normal');
        payrollState.employees.forEach(emp => {
            if (!emp.payAllowances && !emp.payOvertime) return;
            x = 14;
            const rate  = parseFloat(emp.hourlyRate || 0);
            const ot    = emp.monthlyHours
                ? Math.max(0, parseFloat(emp.workedHours) + parseFloat(emp.overtimeFromPrevMonth||0) - parseFloat(emp.monthlyHours))
                : 0;
            doc.text(emp.name, x, yPos); x += colW.name;
            doc.text(emp.payNightAllowance    ? fmt(parseFloat(emp.nightHours)   * rate * rates.night   / 100) + ' €' : '–', x, yPos); x += 30;
            doc.text(emp.paySundayAllowance   ? fmt(parseFloat(emp.sundayHours)  * rate * rates.sunday  / 100) + ' €' : '–', x, yPos); x += 30;
            doc.text(emp.payHolidayAllowance  ? fmt(parseFloat(emp.holidayHours) * rate * rates.holiday / 100) + ' €' : '–', x, yPos); x += 35;
            doc.text(emp.payOvertimeAllowance ? fmt(ot * rate * (emp.overtimePercent || rates.overtime) / 100) + ' €' : '–', x, yPos);
            yPos += 6;
        });
        yPos += 5; checkBreak();
    }

    // ── Personalkosten Gesamt ──
    if (yPos > 140) { doc.addPage(); yPos = 20; }
    const rates = payrollState.allowanceRates;
    let bruttoGes = 0, zuschlGes = 0, sonstGes = 0;
    payrollState.employees.forEach(emp => {
        const rate = parseFloat(emp.hourlyRate || 0);
        bruttoGes += calcEmpBrutto(emp).brutto;
        if (emp.payNightAllowance)    zuschlGes += parseFloat(emp.nightHours||0)   * rate * rates.night   / 100;
        if (emp.paySundayAllowance)   zuschlGes += parseFloat(emp.sundayHours||0)  * rate * rates.sunday  / 100;
        if (emp.payHolidayAllowance)  zuschlGes += parseFloat(emp.holidayHours||0) * rate * rates.holiday / 100;
        if (emp.payOvertimeAllowance && emp.monthlyHours) {
            const ot = Math.max(0, parseFloat(emp.workedHours) + parseFloat(emp.overtimeFromPrevMonth||0) - parseFloat(emp.monthlyHours));
            zuschlGes += ot * rate * (emp.overtimePercent || rates.overtime) / 100;
        }
        sonstGes += parseFloat(emp.bonus||0) + parseFloat(emp.vwl||0) + parseFloat(emp.benefits||0);
    });
    const gesamt = bruttoGes + zuschlGes + sonstGes;

    doc.setFont(undefined, 'bold'); doc.setFontSize(12);
    doc.text('Personalkosten Gesamt', 14, yPos); yPos += 7;
    doc.setFillColor(245, 239, 234);
    doc.rect(14, yPos - 4, 268, 40, 'F');
    doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    doc.text('Brutto-Gehälter:', 20, yPos + 4);            doc.text(fmt(bruttoGes) + ' €', 250, yPos + 4, { align: 'right' });
    doc.text('Zuschläge (steuerfrei):', 20, yPos + 11);    doc.text(fmt(zuschlGes) + ' €', 250, yPos + 11, { align: 'right' });
    doc.text('Sonstiges (Bonus/VWL/Sachbezug):', 20, yPos + 18); doc.text(fmt(sonstGes) + ' €', 250, yPos + 18, { align: 'right' });
    doc.setLineWidth(0.5); doc.line(20, yPos + 22, 250, yPos + 22);
    doc.setFont(undefined, 'bold'); doc.setFontSize(11);
    doc.text('GESAMT:', 20, yPos + 29);                    doc.text(fmt(gesamt) + ' €', 250, yPos + 29, { align: 'right' });
    yPos += 48; checkBreak();

    // ── Kranktage pro Mitarbeiter ──
    const { startDate, endDate } = payrollState.period;
    const sickCache   = payrollState._sickCache   || [];
    const shiftsCache = payrollState._shiftsCache  || [];

    const empSickRows = payrollState.employees.map(emp => {
        const leaves = sickCache.filter(sl => sl.employee_id === emp.id);
        if (leaves.length === 0) return null;

        const rows = [];
        leaves.forEach(sl => {
            const sickStart = sl.start_date > startDate ? sl.start_date : startDate;
            const sickEnd   = sl.end_date   < endDate   ? sl.end_date   : endDate;
            let cur = new Date(sickStart + 'T12:00:00');
            const last = new Date(sickEnd + 'T12:00:00');
            while (cur <= last) {
                const dateStr = cur.toISOString().split('T')[0];
                const shift = shiftsCache.find(s => s.employee_id === emp.id && s.shift_date === dateStr);
                const hrs = shift ? shiftMinutes(shift) / 60 : 0;
                rows.push({ date: dateStr, hrs });
                cur.setDate(cur.getDate() + 1);
            }
        });
        return rows.length > 0 ? { emp, rows } : null;
    }).filter(Boolean);

    if (empSickRows.length > 0) {
        if (yPos > 140) { doc.addPage(); yPos = 20; }
        doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        doc.text('Kranktage', 14, yPos); yPos += 7;

        empSickRows.forEach(({ emp, rows }) => {
            checkBreak();
            doc.setFont(undefined, 'bold'); doc.setFontSize(10);
            doc.text(emp.name, 14, yPos); yPos += 5;
            doc.setFontSize(9);
            doc.text('Datum', 20, yPos);
            doc.text('Geplante Stunden', 70, yPos);
            yPos += 2; doc.setLineWidth(0.3); doc.line(20, yPos, 130, yPos); yPos += 4;
            doc.setFont(undefined, 'normal');
            rows.forEach(r => {
                doc.text(fmtDate(r.date), 20, yPos);
                doc.text(r.hrs > 0 ? fmt(r.hrs) + ' h' : '–', 70, yPos);
                yPos += 5;
            });
            const total = rows.reduce((s, r) => s + r.hrs, 0);
            doc.setFont(undefined, 'bold');
            doc.text('Gesamt:', 20, yPos);
            doc.text(fmt(total) + ' h', 70, yPos);
            doc.setFont(undefined, 'normal');
            yPos += 8;
        });
        checkBreak();
    }

    // ── Tabelle 3: Krankstunden-Detail ──
    if (cols.sickHoursDetail) {
        doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        doc.text('Krankstunden (Detail)', 14, yPos); yPos += 7;
        doc.setFontSize(9); x = 14;
        doc.text('Name', x, yPos); x += 50;
        doc.text('Zeitraum', x, yPos); x += 50;
        doc.text('Stunden', x, yPos);
        yPos += 2; doc.line(14, yPos, 282, yPos); yPos += 5;
        doc.setFont(undefined, 'normal');
        const sickRows = (payrollState._sickCache || []);
        if (sickRows.length > 0) {
            sickRows.forEach(sl => {
                const emp = payrollState.employees.find(e => e.id === sl.employee_id);
                if (!emp) return;
                const empShifts = (payrollState._shiftsCache || []).filter(s =>
                    s.employee_id === sl.employee_id &&
                    s.shift_date >= (sl.start_date > startDate ? sl.start_date : startDate) &&
                    s.shift_date <= (sl.end_date < endDate ? sl.end_date : endDate)
                );
                const hrs = empShifts.reduce((sum, s) => sum + shiftMinutes(s) / 60, 0);
                x = 14;
                doc.text(emp.name, x, yPos); x += 50;
                doc.text(`${fmtDate(sl.start_date)} – ${fmtDate(sl.end_date)}`, x, yPos); x += 50;
                doc.text(fmt(hrs) + ' h', x, yPos);
                yPos += 6;
            });
        } else {
            doc.text('Keine Krankheitstage im gewählten Zeitraum', 14, yPos);
        }
    }

    return doc;
}

// ── PDF VORSCHAU / DOWNLOAD ───────────────────────────────

async function previewPayrollPDF() {
    const doc = await buildPayrollPDF();
    const uri = doc.output('dataurlstring');
    const modal = document.createElement('div');
    modal.id = 'payroll-pdf-preview';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:2000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="width:92%;height:92%;background:white;border-radius:16px;padding:1rem;display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                <h3 style="margin:0;">Vorschau</h3>
                <button onclick="document.getElementById('payroll-pdf-preview').remove()"
                    class="btn-small btn-delete btn-icon">
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <iframe src="${uri}" style="flex:1;border:none;border-radius:8px;"></iframe>
        </div>`;
    document.body.appendChild(modal);
}

async function downloadPayrollPDF() {
    const doc = await buildPayrollPDF();
    // Abrechnung in DB speichern
    let totalGross = 0;
    payrollState.employees.forEach(emp => {
        totalGross += calcEmpBrutto(emp).brutto;
    });
    await db.from('planit_payrolls').insert({
        user_id:        adminSession.user.id,
        start_date:     payrollState.period.startDate,
        end_date:       payrollState.period.endDate,
        restaurant_name: payrollState.period.restaurantName || null,
        employee_count: payrollState.employees.length,
        total_gross:    parseFloat(totalGross.toFixed(2))
    });
    doc.save(`Vorlohnabrechnung_${payrollState.period.startDate}_${payrollState.period.endDate}.pdf`);
}

// ── ÜBERSICHT ─────────────────────────────────────────────

async function loadPayroll() {
    const container = document.getElementById('tab-payroll');
    if (!container) return;

    const { data } = await db
        .from('planit_payrolls')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .order('start_date', { ascending: false });

    const fmtDate  = d => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    const fmtMoney = n => parseFloat(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const listHtml = (!data || data.length === 0)
        ? '<div class="empty-state"><p>Noch keine Abrechnungen erstellt.</p></div>'
        : data.map(p => `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                <div style="font-weight:700; font-size:0.95rem;">
                    ${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}
                </div>
                <button class="btn-small btn-delete btn-icon" onclick="deletePayroll('${p.id}')">
                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
            </div>
            ${p.restaurant_name ? `<div style="font-size:0.8rem; color:var(--color-text-light); margin-bottom:0.2rem;">${p.restaurant_name}</div>` : ''}
            <div style="font-size:0.85rem; color:var(--color-text-light);">
                ${p.employee_count ?? '–'} Mitarbeiter · Brutto gesamt: <strong>${fmtMoney(p.total_gross)} €</strong>
            </div>
        </div>`).join('');

    container.innerHTML = `
        <div style="display:grid; grid-template-columns:1fr auto 1fr; align-items:center; margin-bottom:1rem;">
            <button onclick="switchTab('mehr')" style="background:none; border:none; color:var(--color-primary); font-size:0.95rem; cursor:pointer; text-align:left; display:flex; align-items:center; gap:0.25rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                Zurück
            </button>
            <div style="font-size:1.1rem; font-weight:700; color:var(--color-text);">Vorlohnabrechnung</div>
            <div style="display:flex; justify-content:flex-end;">
                <button class="btn-small btn-primary" onclick="openPayrollWizard()" title="Neue Abrechnung" style="font-size:1.2rem;color:white;">&#xFF0B;</button>
            </div>
        </div>
        ${listHtml}`;
}

async function deletePayroll(id) {
    if (!confirm('Abrechnung unwiderruflich löschen?')) return;
    await db.from('planit_payrolls').delete().eq('id', id);
    await loadPayroll();
}
