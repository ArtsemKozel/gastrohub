// ── SCHICHTTAUSCH & OFFENE SCHICHTEN ─────────────────────
let selectedActionShift = null;

async function loadSwaps() {
    const today = new Date().toISOString().split('T')[0];

    // ── Meine zukünftigen Schichten ──────────────────────
    const { data: shifts } = await db
        .from('shifts')
        .select('*')
        .eq('employee_id', currentEmployee.id)
        .gte('shift_date', today)
        .order('shift_date');

    const shiftsList = document.getElementById('swap-shifts-list');
    if (!shifts || shifts.length === 0) {
        shiftsList.innerHTML = '<div class="empty-state"><p>Keine Schichten vorhanden.</p></div>';
    } else {
        shiftsList.innerHTML = shifts.map(s => `
            <div class="list-item" onclick="openShiftActionModal('${s.id}', '${s.shift_date}', '${s.start_time}', '${s.end_time}')">
                <div class="list-item-info">
                    <h4>${formatDate(s.shift_date)}</h4>
                    <p>${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)} Uhr</p>
                </div>
                <span style="color:var(--color-text-light); font-size:0.85rem;">›</span>
            </div>
        `).join('');
    }

    // ── Meine gesendeten Tausch-Requests ─────────────────
    const { data: swaps } = await db
        .from('shift_swaps')
        .select('*, shifts!shift_id(shift_date, start_time, end_time), target:shifts!target_shift_id(shift_date, start_time, end_time), to_emp:employees_planit!to_employee_id(name)')
        .eq('from_employee_id', currentEmployee.id)
        .order('created_at', { ascending: false });

    const requestsList = document.getElementById('swap-requests-list');
    if (!swaps || swaps.length === 0) {
        requestsList.innerHTML = '<div class="empty-state"><p>Keine Requests vorhanden.</p></div>';
    } else {
        requestsList.innerHTML = swaps.map(s => {
            const myShift    = s.shifts;
            const theirShift = s.target;
            const colleague  = s.to_emp;
            const colleagueStatus = s.to_employee_status === 'pending'
                ? 'Wartet auf Kollege'
                : s.to_employee_status === 'accepted' ? 'Kollege ✓' : 'Kollege ✗';
            const adminStatus = s.status === 'pending'
                ? 'Wartet auf Admin'
                : s.status === 'approved' ? 'Genehmigt' : 'Abgelehnt';
            return `
                <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:0.5rem;">
                    <div style="display:flex; justify-content:space-between; width:100%;">
                        <h4 style="font-size:0.95rem;">${colleague?.name || '—'}</h4>
                        <span class="badge badge-${s.status}">${adminStatus}</span>
                    </div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">
                        Meine Schicht: ${myShift ? formatDate(myShift.shift_date) + ' ' + myShift.start_time.slice(0,5) + ' – ' + myShift.end_time.slice(0,5) : '—'}
                    </div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">
                        Ihre Schicht: ${theirShift ? formatDate(theirShift.shift_date) + ' ' + theirShift.start_time.slice(0,5) + ' – ' + theirShift.end_time.slice(0,5) : '—'}
                    </div>
                    <span style="font-size:0.75rem; color:var(--color-text-light);">${colleagueStatus}</span>
                </div>`;
        }).join('');
    }

    // ── Meine gesendeten Abgabe-Requests ─────────────────
    const { data: handovers } = await db
        .from('shift_handovers')
        .select('*, shifts(shift_date, start_time, end_time), to_emp:employees_planit!to_employee_id(name)')
        .eq('from_employee_id', currentEmployee.id)
        .order('created_at', { ascending: false });

    const handoverList = document.getElementById('handover-requests-list');
    if (!handovers || handovers.length === 0) {
        handoverList.innerHTML = '<div style="color:var(--color-text-light); font-size:0.85rem;">Keine Abgabe-Requests.</div>';
    } else {
        handoverList.innerHTML = handovers.map(h => {
            const status = h.status === 'pending' ? 'Ausstehend'
                         : h.status === 'approved' ? 'Genehmigt' : 'Abgelehnt';
            return `
                <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:0.5rem;">
                    <div style="display:flex; justify-content:space-between; width:100%;">
                        <h4 style="font-size:0.95rem;">→ ${h.to_emp?.name || '—'}</h4>
                        <span class="badge badge-${h.status}">${status}</span>
                    </div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">
                        ${h.shifts ? formatDate(h.shifts.shift_date) + ' ' + h.shifts.start_time.slice(0,5) + ' – ' + h.shifts.end_time.slice(0,5) : '—'}
                    </div>
                </div>`;
        }).join('');
    }

    // ── Eingehende Tausch-Anfragen ────────────────────────
    const { data: incomingSwaps } = await db
        .from('shift_swaps')
        .select('*, shifts!shift_id(shift_date, start_time, end_time), target:shifts!target_shift_id(shift_date, start_time, end_time), from_emp:employees_planit!from_employee_id(name)')
        .eq('to_employee_id', currentEmployee.id)
        .eq('to_employee_status', 'pending')
        .order('created_at', { ascending: false });

    const incomingList = document.getElementById('swap-incoming-list');
    if (!incomingSwaps || incomingSwaps.length === 0) {
        incomingList.innerHTML = '<div style="color:var(--color-text-light); font-size:0.85rem;">Keine eingehenden Requests.</div>';
    } else {
        incomingList.innerHTML = incomingSwaps.map(s => {
            const myShift    = s.target;
            const theirShift = s.shifts;
            const colleague  = s.from_emp;
            return `
                <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:0.5rem;">
                    <div style="font-weight:700; font-size:0.95rem;">${colleague?.name || '—'} möchte tauschen</div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">
                        Ihre Schicht: ${theirShift ? formatDate(theirShift.shift_date) + ' ' + theirShift.start_time.slice(0,5) + ' – ' + theirShift.end_time.slice(0,5) : '—'}
                    </div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">
                        Meine Schicht: ${myShift ? formatDate(myShift.shift_date) + ' ' + myShift.start_time.slice(0,5) + ' – ' + myShift.end_time.slice(0,5) : '—'}
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:0.25rem;">
                        <button class="btn-text btn-approve" onclick="respondSwap('${s.id}', 'accepted')">✓ Akzeptieren</button>
                        <button class="btn-text btn-reject" onclick="respondSwap('${s.id}', 'rejected')">✕ Ablehnen</button>
                    </div>
                </div>`;
        }).join('');
    }

    // ── Schichten zur Übernahme (handover_requested) ──────
    const { data: handoverShifts } = await db
        .from('shifts')
        .select('*, employees_planit!shifts_employee_id_fkey(name)')
        .eq('handover_requested', true)
        .neq('employee_id', currentEmployee.id)
        .gte('shift_date', today)
        .order('shift_date');

    const handoverShiftsList = document.getElementById('handover-shifts-list');
    if (!handoverShifts || handoverShifts.length === 0) {
        handoverShiftsList.innerHTML = '<div style="color:var(--color-text-light); font-size:0.85rem;">Keine Schichten zur Übernahme.</div>';
    } else {
        handoverShiftsList.innerHTML = handoverShifts.map(s => `
            <div class="list-item" style="flex-direction:column; align-items:flex-start; gap:0.5rem;">
                <div>
                    <div style="font-weight:700; font-size:0.95rem;">${s.employees_planit?.name || '—'} gibt ab</div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">
                        ${formatDate(s.shift_date)} | ${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)} Uhr
                    </div>
                </div>
                <button class="btn-text btn-approve" onclick="applyForHandover('${s.id}')">Ich übernehme</button>
            </div>
        `).join('');
    }
}

// ── Schicht-Aktion Modal (Tauschen / Abgeben wählen) ─────
function openShiftActionModal(shiftId, date, start, end) {
    selectedActionShift = { id: shiftId, date, start, end };
    document.getElementById('shift-action-info').textContent =
        `${formatDate(date)} | ${start.slice(0,5)} – ${end.slice(0,5)} Uhr`;
    document.getElementById('shift-action-modal').classList.add('active');
}

function openSwapFromAction() {
    document.getElementById('shift-action-modal').classList.remove('active');
    openSwapModal(selectedActionShift.id, selectedActionShift.date, selectedActionShift.start, selectedActionShift.end);
}

async function openHandoverFromAction() {
    document.getElementById('shift-action-modal').classList.remove('active');
    if (!confirm('⚠️ Wenn niemand deine Schicht übernimmt oder der Admin ablehnt, musst du trotzdem erscheinen. Bist du sicher?')) return;

    const { error } = await db.from('shifts')
        .update({ handover_requested: true })
        .eq('id', selectedActionShift.id);
    if (!error) {
        alert('Abgabe-Request wurde gesendet. Deine Kollegen werden informiert.');
        await loadSwaps();
    }
}

// ── Tausch-Modal ─────────────────────────────────────────
async function openSwapModal(shiftId, date, start, end) {
    selectedSwapShift = shiftId;
    document.getElementById('swap-shift-info').textContent =
        `${formatDate(date)} | ${start.slice(0,5)} – ${end.slice(0,5)} Uhr`;

    const { data: colleagues } = await db
        .from('employees_planit')
        .select('id, name')
        .eq('user_id', currentEmployee.user_id)
        .eq('is_active', true)
        .neq('id', currentEmployee.id);

    const select = document.getElementById('swap-colleague');
    select.innerHTML = colleagues
        ? colleagues.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
        : '<option>Keine Kollegen gefunden</option>';

    document.getElementById('swap-modal').classList.add('open');
    document.getElementById('swap-error').style.display = 'none';
}

function closeSwapModal() {
    document.getElementById('swap-modal').classList.remove('open');
}

async function loadColleagueShifts() {
    const colleagueId = document.getElementById('swap-colleague').value;
    const select      = document.getElementById('swap-target-shift');
    select.innerHTML  = '<option value="">Wird geladen...</option>';

    if (!colleagueId) {
        select.innerHTML = '<option value="">— Kollege wählen —</option>';
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const { data: shifts } = await db
        .from('shifts')
        .select('*')
        .eq('employee_id', colleagueId)
        .eq('user_id', currentEmployee.user_id)
        .gte('shift_date', today)
        .order('shift_date');

    if (!shifts || shifts.length === 0) {
        select.innerHTML = '<option value="">Keine Schichten gefunden</option>';
        return;
    }

    select.innerHTML = shifts.map(s =>
        `<option value="${s.id}">${formatDate(s.shift_date)} | ${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)} Uhr</option>`
    ).join('');
}

async function submitSwap() {
    const toEmployee    = document.getElementById('swap-colleague').value;
    const targetShiftId = document.getElementById('swap-target-shift').value;
    const errorDiv      = document.getElementById('swap-error');
    errorDiv.style.display = 'none';

    if (!targetShiftId) {
        errorDiv.textContent    = 'Bitte eine Schicht des Kollegen auswählen.';
        errorDiv.style.display  = 'block';
        return;
    }

    const { error } = await db.from('shift_swaps').insert({
        user_id:           currentEmployee.user_id,
        shift_id:          selectedSwapShift,
        from_employee_id:  currentEmployee.id,
        to_employee_id:    toEmployee,
        target_shift_id:   targetShiftId,
        status:            'pending',
        to_employee_status:'pending'
    });

    if (error) {
        errorDiv.textContent   = 'Fehler beim Senden.';
        errorDiv.style.display = 'block';
        return;
    }
    closeSwapModal();
    await loadSwaps();
}

// Alias
const requestSwap = submitSwap;

async function respondSwap(swapId, response) {
    const { error } = await db
        .from('shift_swaps')
        .update({ to_employee_status: response })
        .eq('id', swapId);
    if (!error) await loadSwaps();
}

// Aliases für HTML-onclick
async function confirmSwap(swapId)        { await respondSwap(swapId, 'accepted'); }
async function rejectSwapEmployee(swapId) { await respondSwap(swapId, 'rejected'); }

async function applyForHandover(shiftId) {
    const { error } = await db.from('shift_handovers').insert({
        user_id:          currentEmployee.user_id,
        shift_id:         shiftId,
        from_employee_id: null,
        to_employee_id:   currentEmployee.id,
        status:           'pending'
    });
    if (!error) {
        alert('Du hast dich für die Schicht gemeldet!');
        await loadSwaps();
    }
}

// ── Offene Schichten ─────────────────────────────────────
async function openRequestModal(shift) {
    const date = new Date(shift.shift_date + 'T00:00:00')
        .toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    document.getElementById('request-modal-info').textContent =
        `${date} · ${shift.start_time.slice(0,5)} – ${shift.end_time.slice(0,5)} Uhr`;
    document.getElementById('request-modal-note').textContent  = shift.open_note || '';
    document.getElementById('request-shift-id').value         = shift.id;
    document.getElementById('request-modal-status').textContent = '';
    document.getElementById('request-modal-buttons').style.display = 'block';

    // Prüfen ob Mitarbeiter schon geantwortet hat
    const { data: existing } = await db
        .from('open_shift_requests')
        .select('id, status')
        .eq('shift_id', shift.id)
        .eq('employee_id', currentEmployee.id)
        .maybeSingle();

    if (existing) {
        const statusText = existing.status === 'yes'      ? '✅ Du hast Ja gesagt'    :
                           existing.status === 'no'       ? '❌ Du hast Nein gesagt'  :
                           existing.status === 'approved' ? '✅ Du wurdest eingeteilt' : '⏳ Ausstehend';
        document.getElementById('request-modal-status').textContent        = statusText;
        document.getElementById('request-modal-buttons').style.display = 'none';
    }

    document.getElementById('request-modal').classList.add('active');
}

function closeRequestModal() {
    document.getElementById('request-modal').classList.remove('active');
}

async function submitShiftRequest(answer) {
    const shiftId = document.getElementById('request-shift-id').value;

    const { data: existing } = await db
        .from('open_shift_requests')
        .select('id')
        .eq('shift_id', shiftId)
        .eq('employee_id', currentEmployee.id)
        .maybeSingle();

    if (existing) {
        await db.from('open_shift_requests')
            .update({ status: answer })
            .eq('id', existing.id);
    } else {
        await db.from('open_shift_requests').insert({
            shift_id:    shiftId,
            employee_id: currentEmployee.id,
            user_id:     currentEmployee.user_id,
            status:      answer
        });
    }

    closeRequestModal();
    await loadWeekGrid();
}

// Alias
const requestOpenShift = submitShiftRequest;

async function loadMyRequests() {
    if (!currentEmployee) return;

    const { data: requests, error } = await db
        .from('open_shift_requests')
        .select('*, shifts(shift_date, start_time, end_time, department)')
        .eq('employee_id', currentEmployee.id)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !requests || requests.length === 0) {
        document.getElementById('my-requests-list').innerHTML =
            '<div class="empty-state"><p>Keine Requests vorhanden.</p></div>';
        return;
    }

    const html = requests.map(r => {
        const date = new Date(r.shifts.shift_date + 'T00:00:00')
            .toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
        const time = `${r.shifts.start_time.slice(0,5)} – ${r.shifts.end_time.slice(0,5)} Uhr`;
        const dept = r.shifts.department || '';
        let statusHtml = '';
        if (r.status === 'pending')  statusHtml = '<span style="color:#C9A24D; font-weight:600;">⏳ Ausstehend</span>';
        if (r.status === 'approved') statusHtml = '<span style="color:var(--color-green); font-weight:600;">✓ Genehmigt</span>';
        if (r.status === 'rejected') statusHtml = '<span style="color:var(--color-red); font-weight:600;">✕ Abgelehnt</span>';
        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600;">${date}</div>
                    <div style="font-size:0.85rem; color:var(--color-text-light);">${time} · ${dept}</div>
                </div>
                <div>${statusHtml}</div>
            </div>
        </div>`;
    }).join('');

    document.getElementById('my-requests-list').innerHTML = html;
}
