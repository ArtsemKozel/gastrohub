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
    await loadTerminations();
    await loadTerminationBadge();
    await loadMehrBadge();
}

async function rejectTermination(id) {
    if (!confirm('Kündigung ablehnen?')) return;
    await db.from('planit_terminations').update({ status: 'rejected' }).eq('id', id);
    await loadTerminations();
    await loadTerminationBadge();
    await loadMehrBadge();
}

async function downloadTerminationPdf(filePath) {
    const win = window.open('', '_blank');
    const { data, error } = await db.storage
        .from('termination-pdfs')
        .createSignedUrl(filePath, 60);
    console.log('filePath:', filePath, '| error:', error, '| signedUrl:', data?.signedUrl);
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
