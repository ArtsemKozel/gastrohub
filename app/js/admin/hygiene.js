// ── HYGIENE ───────────────────────────────────────────────

async function loadHygiene() {
    const container = document.getElementById('hygiene-list');
    container.innerHTML = '<div style="color:var(--color-text-light); font-size:0.9rem;">Lädt…</div>';

    const [{ data }, { data: restaurant }, { data: inactiveData }] = await Promise.all([
        db.from('employees_planit')
            .select('id, name, department, hygiene_erste, hygiene_letzte, hygiene_gueltig_monate')
            .eq('user_id', adminSession.user.id)
            .eq('is_active', true)
            .order('name'),
        db.from('planit_restaurants')
            .select('hygiene_link_erst, hygiene_link_erneuerung')
            .eq('user_id', adminSession.user.id)
            .maybeSingle(),
        db.from('employees_planit')
            .select('id, name, department, hygiene_erste, hygiene_letzte, hygiene_gueltig_monate')
            .eq('user_id', adminSession.user.id)
            .eq('is_active', false)
            .order('name'),
    ]);

    const erstInput = document.getElementById('hygiene-link-erst');
    const erneuerungInput = document.getElementById('hygiene-link-erneuerung');
    if (erstInput) erstInput.value = restaurant?.hygiene_link_erst || '';
    if (erneuerungInput) erneuerungInput.value = restaurant?.hygiene_link_erneuerung || '';

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine aktiven Mitarbeiter gefunden.</p></div>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function addMonths(dateStr, months) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setMonth(d.getMonth() + months);
        return d;
    }

    function fmtD(dateStr) {
        if (!dateStr) return '–';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    function statusBadge(naechste) {
        const s = 'width:18px; height:18px; display:inline-block; border-radius:50%; padding:2px; flex-shrink:0;';
        if (!naechste) return `<span style="${s} background:#e2e3e5;"><svg viewBox="0 0 24 24" fill="none" stroke="#6c757d" stroke-width="3"><circle cx="12" cy="12" r="1"/><line x1="12" y1="6" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="12" y1="8" x2="12" y2="16"/></svg></span>`;
        const diff = (naechste - today) / (1000 * 60 * 60 * 24);
        if (diff < 0)  return `<span style="${s} background:#f8d7da;"><svg viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>`;
        if (diff < 14) return `<span style="${s} background:#fff3cd;"><svg viewBox="0 0 24 24" fill="none" stroke="#856404" stroke-width="3"><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="#856404" stroke="#856404"/></svg></span>`;
        return `<span style="${s} background:#d4edda;"><svg viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>`;
    }

    const groups = {};
    for (const emp of data) {
        const dept = emp.department || 'Allgemein';
        if (!groups[dept]) groups[dept] = [];
        groups[dept].push(emp);
    }

    const activeHtml = Object.entries(groups).map(([dept, emps]) => {
        const rows = emps.map(emp => {
            const monate = emp.hygiene_gueltig_monate ?? 12;
            const basisDatum = emp.hygiene_letzte || emp.hygiene_erste || null;
            const naechste = basisDatum ? addMonths(basisDatum, monate) : null;
            const naechsteStr = naechste ? naechste.toISOString().split('T')[0] : null;
            return `
            <div style="border-bottom:1px solid #F0F0F0;">
                <div onclick="const b=this.nextElementSibling; const open=b.style.display!=='none'; b.style.display=open?'none':'block'; this.querySelector('.hyg-arrow').textContent=open?'▶':'▼';"
                     class="hygiene-row" style="display:grid; gap:0.5rem; align-items:center; padding:0.6rem 0; font-size:0.85rem; cursor:pointer;">
                    <div style="font-weight:600;">${emp.name}</div>
                    <div style="color:var(--color-text-light);">${fmtD(emp.hygiene_erste)}</div>
                    <div style="color:var(--color-text-light);">${naechsteStr ? fmtD(naechsteStr) : '–'}</div>
                    <div>${statusBadge(naechste)}</div>
                    <div class="hyg-arrow" style="color:var(--color-text-light); font-size:0.7rem; min-width:1rem; text-align:center;">▶</div>
                </div>
                <div style="display:none; padding:0.75rem 0 1rem;">
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                        <div>
                            <label style="font-size:0.75rem; color:var(--color-text-light); display:block; margin-bottom:0.25rem;">Erstbelehrung</label>
                            <input type="date" id="hyg-erste-${emp.id}" value="${emp.hygiene_erste || ''}" style="width:100%; padding:0.4rem; font-size:0.85rem; border:1px solid #ddd; border-radius:6px;">
                        </div>
                        <div>
                            <label style="font-size:0.75rem; color:var(--color-text-light); display:block; margin-bottom:0.25rem;">Letzte</label>
                            <input type="date" id="hyg-letzte-${emp.id}" value="${emp.hygiene_letzte || ''}" style="width:100%; padding:0.4rem; font-size:0.85rem; border:1px solid #ddd; border-radius:6px;">
                        </div>
                        <div>
                            <label style="font-size:0.75rem; color:var(--color-text-light); display:block; margin-bottom:0.25rem;">Gültig (Monate)</label>
                            <input type="number" id="hyg-monate-${emp.id}" value="${monate}" min="1" style="width:100%; padding:0.4rem; font-size:0.85rem; border:1px solid #ddd; border-radius:6px;">
                        </div>
                    </div>
                    <button onclick="saveHygiene('${emp.id}')" class="btn-primary" style="padding:0.4rem 1rem; font-size:0.85rem;">Speichern</button>
                </div>
            </div>`;
        }).join('');

        return `
        <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.08em; margin:1rem 0 0.4rem;">${dept.toUpperCase()}</div>
        <div style="background:white; border-radius:12px; overflow:hidden; padding:0 0.75rem;">
            <div class="hygiene-row" style="display:grid; gap:0.5rem; padding:0.4rem 0; border-bottom:2px solid #F0F0F0; font-size:0.7rem; font-weight:700; color:var(--color-text-light);">
                <div>NAME</div><div>ERSTE</div><div>NÄCHSTE</div><div></div><div></div>
            </div>
            ${rows}
        </div>`;
    }).join('');

    let inactiveContent = '';
    if (inactiveData && inactiveData.length > 0) {
        const inactiveRows = inactiveData.map(emp => {
            const monate = emp.hygiene_gueltig_monate ?? 12;
            const basisDatum = emp.hygiene_letzte || emp.hygiene_erste || null;
            const naechste = basisDatum ? addMonths(basisDatum, monate) : null;
            const naechsteStr = naechste ? naechste.toISOString().split('T')[0] : null;
            return `
            <div style="border-bottom:1px solid #F0F0F0;">
                <div class="hygiene-row" style="display:grid; gap:0.5rem; align-items:center; padding:0.6rem 0; font-size:0.85rem;">
                    <div style="font-weight:600; color:var(--color-text-light);">${emp.name}</div>
                    <div style="color:var(--color-text-light);">${fmtD(emp.hygiene_erste)}</div>
                    <div style="color:var(--color-text-light);">${naechsteStr ? fmtD(naechsteStr) : '–'}</div>
                    <div>${statusBadge(naechste)}</div>
                    <div></div>
                </div>
            </div>`;
        }).join('');
        inactiveContent = `
            <div style="background:white; border-radius:12px; overflow:hidden; padding:0 0.75rem; margin-top:0.4rem;">
                <div class="hygiene-row" style="display:grid; gap:0.5rem; padding:0.4rem 0; border-bottom:2px solid #F0F0F0; font-size:0.7rem; font-weight:700; color:var(--color-text-light);">
                    <div>NAME</div><div>ERSTE</div><div>NÄCHSTE</div><div></div><div></div>
                </div>
                ${inactiveRows}
            </div>`;
    } else {
        inactiveContent = `<p style="font-size:0.85rem; color:var(--color-text-light); margin:0.5rem 0 0;">Keine ehemaligen Mitarbeiter</p>`;
    }

    const inactiveHtml = `
        <div style="margin-top:1.5rem;">
            <div onclick="const b=document.getElementById('hygiene-inactive-body'); const open=b.style.display!=='none'; b.style.display=open?'none':'block'; this.querySelector('.hyg-inactive-arrow').textContent=open?'▶':'▼';"
                 style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem; background:#F5F5F5; border-radius:8px; cursor:pointer;">
                <span style="font-weight:700; font-size:1.1rem; color:var(--color-primary);">Ehemalige Mitarbeiter</span>
                <span class="hyg-inactive-arrow" style="font-size:0.85rem; color:var(--color-text-light);">▶</span>
            </div>
            <div id="hygiene-inactive-body" style="display:none; margin-top:0.5rem;">
                ${inactiveContent}
            </div>
        </div>`;

    container.innerHTML = activeHtml + inactiveHtml;
}

async function saveHygiene(employeeId) {
    const erste = document.getElementById(`hyg-erste-${employeeId}`).value || null;
    const letzte = document.getElementById(`hyg-letzte-${employeeId}`).value || null;
    const monate = parseInt(document.getElementById(`hyg-monate-${employeeId}`).value) || 12;
    await db.from('employees_planit').update({
        hygiene_erste: erste,
        hygiene_letzte: letzte,
        hygiene_gueltig_monate: monate
    }).eq('id', employeeId);
    await Promise.all([loadHygiene(), loadHygieneBadge()]);
}

async function saveHygieneLinks() {
    const erst = document.getElementById('hygiene-link-erst').value.trim() || null;
    const erneuerung = document.getElementById('hygiene-link-erneuerung').value.trim() || null;
    const btn = document.querySelector('#hygiene-links-body button');
    if (btn) { btn.disabled = true; btn.textContent = 'Speichert…'; }

    const { error } = await db.from('planit_restaurants')
        .update({ hygiene_link_erst: erst, hygiene_link_erneuerung: erneuerung })
        .eq('user_id', adminSession.user.id);

    if (btn) { btn.disabled = false; btn.textContent = 'Speichern'; }

    if (error) {
        alert('Fehler beim Speichern: ' + error.message);
        return;
    }

    const body = document.getElementById('hygiene-links-body');
    if (body) body.style.display = 'none';
    const arrow = document.querySelector('.hyg-links-arrow');
    if (arrow) arrow.textContent = '▶';

    const header = document.querySelector('.hyg-links-arrow')?.closest('div[style*="background:#F5F5F5"]');
    if (header) {
        const msg = document.createElement('span');
        msg.textContent = ' ✓ Gespeichert';
        msg.style.cssText = 'font-size:0.8rem; color:#155724; font-weight:500; margin-left:0.5rem;';
        header.querySelector('span:first-child').appendChild(msg);
        setTimeout(() => msg.remove(), 2500);
    }
}

// ── HYGIENE BADGE ─────────────────────────────────────────

async function loadHygieneBadge() {
    const { data } = await db
        .from('employees_planit')
        .select('hygiene_erste, hygiene_letzte, hygiene_gueltig_monate')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true);

    const soon = new Date();
    soon.setHours(0, 0, 0, 0);
    soon.setDate(soon.getDate() + 14);

    const count = (data || []).filter(emp => {
        const basis = emp.hygiene_letzte || emp.hygiene_erste;
        if (!basis) return false;
        const n = new Date(basis + 'T00:00:00');
        n.setMonth(n.getMonth() + (emp.hygiene_gueltig_monate ?? 12));
        return n <= soon;
    }).length;

    const badge = document.getElementById('hygiene-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
    await loadMehrBadge();
}

// ── MEHR BADGE ────────────────────────────────────────────

async function loadMehrBadge() {
    const uid = adminSession.user.id;
    const [{ data: terminations }, { data: inventur }, { data: hygieneEmps }] = await Promise.all([
        db.from('planit_terminations').select('id').eq('user_id', uid).eq('status', 'pending'),
        db.from('planit_inventory_submissions').select('id').eq('user_id', uid),
        db.from('employees_planit').select('hygiene_erste, hygiene_letzte, hygiene_gueltig_monate').eq('user_id', uid).eq('is_active', true),
    ]);
    const soon = new Date();
    soon.setHours(0, 0, 0, 0);
    soon.setDate(soon.getDate() + 14);
    const hygieneCount = (hygieneEmps || []).filter(emp => {
        const basis = emp.hygiene_letzte || emp.hygiene_erste;
        if (!basis) return false;
        const n = new Date(basis + 'T00:00:00');
        n.setMonth(n.getMonth() + (emp.hygiene_gueltig_monate ?? 12));
        return n <= soon;
    }).length;
    const total = (terminations?.length || 0) + (inventur?.length || 0) + hygieneCount;
    const badge = document.getElementById('mehr-badge');
    if (!badge) return;
    if (total > 0) {
        badge.textContent = total;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}
