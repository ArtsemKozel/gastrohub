// ── ARBEITGEBER-KÜNDIGUNG ─────────────────────────────────

let _employerTerminationEmployeeId = null;

async function loadEmployerTerminationSection() {
    const { data: employees } = await db
        .from('employees_planit')
        .select('id, name')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

    const list = document.getElementById('employer-termination-list');
    if (!employees || employees.length === 0) {
        list.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light); padding:0.5rem 0;">Keine aktiven Mitarbeiter.</div>';
        return;
    }
    list.innerHTML = employees.map(e => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid var(--color-border);">
            <span style="font-size:0.9rem;">${e.name}</span>
            <button class="btn-small btn-delete btn-icon" onclick="openEmployerTerminationModal('${e.id}', '${e.name.replace(/'/g, "\\'")}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg></button>
        </div>`).join('');
}

function toggleEmployerTerminationMenu() {
    const body  = document.getElementById('employer-termination-body');
    const arrow = document.getElementById('employer-termination-arrow');
    const open  = body.style.display === 'none';
    body.style.display  = open ? 'block' : 'none';
    arrow.textContent   = open ? '▼' : '▶';
    if (open) loadEmployerTerminationSection();
}

function openEmployerTerminationModal(employeeId, employeeName) {
    _employerTerminationEmployeeId = employeeId;
    document.getElementById('employer-termination-modal-title').textContent = `Kündigung — ${employeeName}`;
    document.getElementById('employer-termination-type').value  = 'Ordentlich';
    document.getElementById('employer-termination-date').value  = '';
    document.getElementById('employer-termination-reason').value = '';
    document.getElementById('employer-termination-error').style.display = 'none';
    document.getElementById('employer-termination-modal').classList.add('active');
}

function closeEmployerTerminationModal() {
    document.getElementById('employer-termination-modal').classList.remove('active');
    _employerTerminationEmployeeId = null;
}

async function submitEmployerTermination() {
    const type     = document.getElementById('employer-termination-type').value;
    const date     = document.getElementById('employer-termination-date').value;
    const reason   = document.getElementById('employer-termination-reason').value.trim();
    const errorDiv = document.getElementById('employer-termination-error');
    errorDiv.style.display = 'none';

    if (!date) {
        errorDiv.textContent   = 'Bitte einen letzten Arbeitstag auswählen.';
        errorDiv.style.display = 'block';
        return;
    }

    const { error } = await db.from('planit_terminations').insert({
        user_id:        adminSession.user.id,
        employee_id:    _employerTerminationEmployeeId,
        requested_date: date,
        reason:         reason ? `[${type}] ${reason}` : `[${type}]`,
        status:         'approved',
        approved_date:  date,
        initiated_by:   'employer',
    });

    if (error) {
        errorDiv.textContent   = 'Fehler beim Speichern. Bitte erneut versuchen.';
        errorDiv.style.display = 'block';
        return;
    }

    // Beschäftigungsphase abschließen
    await db.from('employment_phases')
        .delete()
        .eq('employee_id', _employerTerminationEmployeeId)
        .gt('start_date', date);
    await db.from('employment_phases')
        .update({ end_date: date })
        .eq('employee_id', _employerTerminationEmployeeId)
        .is('end_date', null);

    closeEmployerTerminationModal();
    await loadTerminations();
    await loadTerminationBadge();
    await loadMehrBadge();
}

// ── KÜNDIGUNGEN ───────────────────────────────────────────

async function loadTerminations() {
    const container = document.getElementById('terminations-list');
    container.innerHTML = '<div style="color:var(--color-text-light); font-size:0.9rem;">Lädt…</div>';

    const { data } = await db
        .from('planit_terminations')
        .select('*, employees_planit(name)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: false });

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Kündigungsanträge vorhanden.</p></div>';
        return;
    }

    container.innerHTML = data.map(t => {
        const name = t.employees_planit?.name || '–';
        const date = t.requested_date ? new Date(t.requested_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
        const statusColor = t.status === 'approved' ? '#2d7a2d' : t.status === 'rejected' ? 'var(--color-danger)' : 'var(--color-text-light)';
        const statusLabel = t.status === 'approved' ? 'Genehmigt' : t.status === 'rejected' ? 'Abgelehnt' : 'Offen';
        const address = [t.street, `${t.zip || ''} ${t.city || ''}`.trim()].filter(Boolean).join(', ');
        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <div style="font-weight:700; font-size:1rem;">${name}</div>
                <span style="font-size:0.8rem; font-weight:600; color:${statusColor};">${statusLabel}</span>
            </div>
            ${address ? `<div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.25rem;">${address}</div>` : ''}
            <div style="font-size:0.85rem; margin-bottom:0.25rem;">Letzter Arbeitstag: <strong>${date}</strong></div>
            ${t.reason ? `<div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.75rem;">Grund: ${t.reason}</div>` : '<div style="margin-bottom:0.75rem;"></div>'}
            <div style="display:flex; gap:0.5rem; align-items:center;">
                ${t.pdf_url ? `<button class="btn-small btn-pdf-view btn-icon" onclick="downloadTerminationPdf('${t.pdf_url}')"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
                ${t.status === 'pending' ? `<button class="btn-small btn-pdf-view btn-icon" onclick="approveTermination('${t.id}')"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
                ${t.status === 'pending' ? `<button class="btn-small btn-delete btn-icon" onclick="rejectTermination('${t.id}')"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ''}
                <button class="btn-small btn-delete btn-icon" onclick="deleteTermination('${t.id}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
            </div>
        </div>`;
    }).join('');
}

async function approveTermination(id) {
    if (!confirm('Kündigung genehmigen?')) return;
    const { data: t } = await db.from('planit_terminations').select('requested_date, employee_id').eq('id', id).maybeSingle();
    const approvedDate = t?.requested_date || null;
    await db.from('planit_terminations').update({ status: 'approved', approved_date: approvedDate }).eq('id', id);
    if (approvedDate && t?.employee_id) {
        await db.from('employment_phases')
            .delete()
            .eq('employee_id', t.employee_id)
            .gt('start_date', approvedDate);
        await db.from('employment_phases')
            .update({ end_date: approvedDate })
            .eq('employee_id', t.employee_id)
            .is('end_date', null);
    }
    if (t?.employee_id) sendPushNotification('Kündigung', 'Deine Kündigung wurde bestätigt.', t.employee_id);
    await loadTerminations();
    await loadTerminationBadge();
    await loadMehrBadge();
}

async function rejectTermination(id) {
    if (!confirm('Kündigung ablehnen?')) return;
    const { data: t } = await db.from('planit_terminations').select('employee_id').eq('id', id).maybeSingle();
    await db.from('planit_terminations').update({ status: 'rejected' }).eq('id', id);
    if (t?.employee_id) sendPushNotification('Kündigung', 'Deine Kündigung wurde abgelehnt.', t.employee_id);
    await loadTerminations();
    await loadTerminationBadge();
    await loadMehrBadge();
}

async function downloadTerminationPdf(filePath) {
    const win = window.open('', '_blank');
    const { data, error } = await db.storage
        .from('termination-pdfs')
        .createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) {
        win.close();
        alert('PDF konnte nicht geladen werden.');
        return;
    }
    win.location.href = data.signedUrl;
}

async function deleteTermination(id) {
    if (!confirm('Kündigungsantrag unwiderruflich löschen?')) return;
    const { data: t } = await db.from('planit_terminations').select('employee_id, approved_date').eq('id', id).maybeSingle();
    await db.from('planit_terminations').delete().eq('id', id);
    if (t?.employee_id) {
        const { data: phase } = await db.from('employment_phases')
            .select('id')
            .eq('employee_id', t.employee_id)
            .not('end_date', 'is', null)
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (phase) {
            await db.from('employment_phases').update({ end_date: null }).eq('id', phase.id);
        }
    }
    await loadTerminations();
    await loadTerminationBadge();
    await loadMehrBadge();

    if (t?.employee_id) {
        switchTab('team');
        await loadTeam();
        toggleTeamEmployee(t.employee_id);
        const body = document.getElementById(`teambody-${t.employee_id}`);
        if (body) {
            const hint = document.createElement('div');
            hint.style.cssText = 'background:#FFF3CD; border-radius:8px; padding:0.65rem 0.85rem; font-size:0.85rem; color:#856404; margin-bottom:0.75rem;';
            hint.textContent = 'Bitte Beschäftigungsphasen prüfen und anpassen.';
            body.prepend(hint);
        }
    }
}

// ── BADGES ────────────────────────────────────────────────

async function loadTerminationBadge() {
    const { data } = await db
        .from('planit_terminations')
        .select('id')
        .eq('user_id', adminSession.user.id)
        .eq('status', 'pending');

    const badge = document.getElementById('termination-badge');
    if (badge) {
        if (data && data.length > 0) {
            badge.textContent = data.length;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

async function loadArchiveBadge() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await db
        .from('planit_terminations')
        .select('employee_id, employees_planit!planit_terminations_employee_id_fkey(name, is_active)')
        .eq('user_id', adminSession.user.id)
        .eq('status', 'approved')
        .lte('approved_date', today);

    const pending = (data || []).filter(t => t.employees_planit?.is_active === true);

    const badge = document.getElementById('archive-badge');
    if (badge) {
        if (pending.length > 0) {
            badge.textContent = pending.length;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

async function archiveEmployee(employeeId) {
    await db.from('employees_planit').update({ is_active: false }).eq('id', employeeId);
    await loadEmployees();
    await loadTeam();
    await loadArchiveBadge();
}
