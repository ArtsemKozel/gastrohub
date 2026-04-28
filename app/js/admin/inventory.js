// ── INVENTUR ──────────────────────────────────────────────

let inventurDate = new Date();

// ── BADGE & SUBMISSIONS ───────────────────────────────────

async function loadInventurBadge() {
    const { data } = await db
        .from('planit_inventory_submissions')
        .select('id')
        .eq('user_id', adminSession.user.id);

    const badge = document.getElementById('inventur-badge');
    if (data && data.length > 0) {
        badge.textContent = data.length;
        badge.style.display = 'inline';
    } else {
        badge.style.display = 'none';
    }
}

async function loadInventurSubmissions() {
    const { data: submissions } = await db
        .from('planit_inventory_submissions')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .order('submitted_at', { ascending: false });

    const container = document.getElementById('submissions-list');
    if (!submissions || submissions.length === 0) {
        container.innerHTML = '';
        return;
    }

    const { data: employees } = await db
        .from('employees_planit')
        .select('id, name')
        .eq('user_id', adminSession.user.id);

    const empMap = {};
    (employees || []).forEach(e => { empMap[e.id] = e.name; });

    container.innerHTML = `
        <div style="font-size:0.85rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.05em; margin-bottom:0.5rem;">EINGEREICHTE INVENTUREN</div>
        ${submissions.map(s => {
            const name = empMap[s.employee_id] || 'Unbekannt';
            const date = new Date(s.submission_date + 'T12:00:00');
            const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const time = new Date(s.submitted_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return `
            <div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; padding:0.6rem 0.75rem;">
                <div>
                    <div style="font-size:0.9rem; font-weight:600;">${name}</div>
                    <div style="font-size:0.75rem; color:var(--color-text-light);">${dateStr} · ${time} Uhr</div>
                </div>
                <button class="btn-small btn-pdf-view" style="font-size:0.75rem; padding:0.3rem 0.75rem; height:auto; width:auto;" onclick="markInventurSubmissionSeen('${s.id}')">Gesehen</button>
            </div>`;
        }).join('')}
    `;
}

async function markInventurSubmissionSeen(id) {
    await db.from('planit_inventory_submissions').delete().eq('id', id);
    await loadInventurSubmissions();
    await loadInventurBadge();
}

// ── DELEGATION ────────────────────────────────────────────

async function loadInventurDelegation() {
    const { data: employees } = await db
        .from('employees_planit')
        .select('id, name, can_do_inventory')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

    const container = document.getElementById('inventur-delegation-list');
    if (!employees || employees.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light);">Keine Mitarbeiter vorhanden.</div>';
        return;
    }

    container.innerHTML = employees.map(e => `
        <label style="display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0; border-bottom:1px solid var(--color-border); cursor:pointer;">
            <input type="checkbox" data-emp-id="${e.id}" ${e.can_do_inventory ? 'checked' : ''} style="width:1.1rem; height:1.1rem; accent-color:var(--color-primary); cursor:pointer;">
            <span style="font-size:0.9rem;">${e.name}</span>
        </label>
    `).join('');
}

function toggleDelegationSection() {
    const body = document.getElementById('delegation-body');
    const toggle = document.getElementById('delegation-toggle');
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

async function saveInventurDelegation() {
    const checkboxes = document.querySelectorAll('#inventur-delegation-list input[data-emp-id]');
    for (const cb of checkboxes) {
        await db.from('employees_planit')
            .update({ can_do_inventory: cb.checked })
            .eq('id', cb.dataset.empId);
    }
    alert('Gespeichert!');
}

// ── CONFIG ────────────────────────────────────────────────

async function loadInventurConfig() {
    // Geöffnete Lieferanten merken, damit sie nach dem Re-Render wieder offen sind
    const openSuppliers = new Set(
        [...document.querySelectorAll('[id^="inventur-config-supplier-body-"]')]
            .filter(el => el.style.display === 'block')
            .map(el => el.id.replace('inventur-config-supplier-body-', ''))
    );

    const { data: suppliers } = await db
        .from('planit_suppliers')
        .select('*, planit_inventory_items(*)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: true });

    const container = document.getElementById('suppliers-list');
    if (!suppliers || suppliers.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Lieferanten vorhanden.</p></div>';
        return;
    }

    // Positionen initialisieren BEVOR Rendern
    for (const s of suppliers || []) {
        const items = (s.planit_inventory_items || []);
        for (let idx = 0; idx < items.length; idx++) {
            const updates = {};
            if (items[idx].inventory_position === null || items[idx].inventory_position === undefined) {
                updates.inventory_position = idx;
                items[idx].inventory_position = idx;
            }
            if (items[idx].order_position === null || items[idx].order_position === undefined) {
                updates.order_position = idx;
                items[idx].order_position = idx;
            }
            if (Object.keys(updates).length > 0) {
                await db.from('planit_inventory_items').update(updates).eq('id', items[idx].id);
            }
        }
    }

    const sortField = window.inventurSortMode === 'order' ? 'order_position' : 'inventory_position';
    container.innerHTML = suppliers.map(s => {
        const items = (s.planit_inventory_items || []).sort((a, b) => (a[sortField] ?? 0) - (b[sortField] ?? 0));
        return `
        <div style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:0.75rem 1rem; background:var(--color-gray); border-radius:12px; margin-bottom:0.25rem;" onclick="toggleInventurConfigSupplier('${s.id}')">
                <div style="font-size:0.85rem; font-weight:700; color:var(--color-primary); letter-spacing:0.05em;">${s.name.toUpperCase()}</div>
                <span id="inventur-config-supplier-toggle-${s.id}" style="color:var(--color-text-light);">▶</span>
            </div>
            <div id="inventur-config-supplier-body-${s.id}" style="display:none;">
            <div id="inventur-config-groups-${s.id}" style="margin-bottom:0.5rem;"></div>
            <div class="card" style="margin-bottom:0;">
                ${window.inventurSortMode === 'inventory' ? `
                <div style="display:flex; justify-content:flex-end; gap:0.5rem; margin-bottom:0.75rem;">
                    <button class="btn-small btn-pdf-view btn-icon" style="width:2rem; height:2rem;" onclick="addInventurItem('${s.id}')">
                        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="btn-small btn-pdf-view btn-icon" style="width:2rem; height:2rem;" onclick="deleteSupplier('${s.id}')">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>` : ''}
                ${items.length === 0 ? '<div style="font-size:0.85rem; color:var(--color-text-light);">Keine Waren.</div>' :
                items.map((item, i) => `
                    <div style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
                        <div style="flex:1;">
                            <div style="font-size:0.85rem;"><span style="font-size:0.75rem; color:var(--color-text-light); margin-right:0.35rem;">${i + 1}.</span>${item.name}</div>
                            <div style="font-size:0.75rem; color:var(--color-text-light);">Soll: ${item.target_amount} ${item.unit} · ${(item.price_per_unit || 0).toFixed(2)} €</div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.2rem;">
                            ${i > 0 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="moveInventurItem('${s.id}', ${i}, -1, '${window.inventurSortMode}')">
                                <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
                            </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                            ${window.inventurSortMode === 'inventory' ? `
                            <button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="editInventurItem('${item.id}', '${s.id}', '${item.name}', '${item.unit}', ${item.target_amount}, ${item.price_per_unit || 0}, '${item.group_id || ''}')">
                                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                            ${i < items.length - 1 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="moveInventurItem('${s.id}', ${i}, 1, '${window.inventurSortMode}')">
                                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                            ${window.inventurSortMode === 'inventory' ? `
                            <button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="deleteInventurItem('${item.id}')">
                                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                        </div>
                    </div>
                `).join('')}
            </div>
            </div>
        </div>`;
    }).join('');

    // Geöffnete Lieferanten wiederherstellen
    openSuppliers.forEach(id => {
        const body = document.getElementById(`inventur-config-supplier-body-${id}`);
        const toggle = document.getElementById(`inventur-config-supplier-toggle-${id}`);
        if (body) body.style.display = 'block';
        if (toggle) toggle.textContent = '▼';
        if (window.inventurSortMode === 'inventory') loadGroups(id);
    });

    // Aktiven Sort-Tab wiederherstellen
    document.getElementById('inventur-sort-tab-inventory')?.classList.toggle('active', window.inventurSortMode === 'inventory');
    document.getElementById('inventur-sort-tab-order')?.classList.toggle('active', window.inventurSortMode === 'order');
}

async function addSupplier() {
    openInventurSupplierModal();
}

async function deleteSupplier(id) {
    if (!confirm('Lieferant und alle Waren löschen?')) return;
    await db.from('planit_suppliers').delete().eq('id', id);
    loadInventurConfig();
}

async function addInventurItem(supplierId) {
    openInventurItemModal(supplierId);
}

async function editInventurItem(id, supplierId, name, unit, target, price, groupId) {
    openInventurItemModal(supplierId, id, name, unit, target, price, groupId);
}

async function deleteInventurItem(id) {
    if (!confirm('Ware löschen?')) return;
    await db.from('planit_inventory_items').delete().eq('id', id);
    loadInventurConfig();
}

// ── INVENTUR LADEN ────────────────────────────────────────

async function loadInventur() {
    updateInventurDateLabel();
    const date = document.getElementById('inventur-date').value;

    const [{ data: suppliers }, { data: entries }, { data: groups }, { data: prevEntriesRaw }] = await Promise.all([
        db.from('planit_suppliers').select('*, planit_inventory_items(*)').eq('user_id', adminSession.user.id).order('created_at', { ascending: true }),
        db.from('planit_inventory_entries').select('*').eq('user_id', adminSession.user.id).eq('entry_date', date),
        db.from('planit_inventory_groups').select('*').eq('user_id', adminSession.user.id).order('position', { ascending: true }),
        db.from('planit_inventory_entries').select('item_id,actual_amount,entry_date').eq('user_id', adminSession.user.id).lt('entry_date', date).order('entry_date', { ascending: false })
    ]);

    const prevEntries = {};
    for (const e of (prevEntriesRaw || [])) {
        if (!(e.item_id in prevEntries)) prevEntries[e.item_id] = e.actual_amount;
    }

    const container = document.getElementById('inventur-list');
    if (!suppliers || suppliers.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Waren konfiguriert. Bitte zuerst Einstellungen öffnen.</p></div>';
        return;
    }

    const groupMap = {};
    (groups || []).forEach(g => { groupMap[g.id] = g; });

    const renderItemRow = (item, supplierName) => {
        const entry = (entries || []).find(e => e.item_id === item.id);
        const actual = entry ? entry.actual_amount : '';
        const order = actual !== '' ? Math.max(0, item.target_amount - parseFloat(actual)) : '';
        return `
        <div style="display:grid; grid-template-columns:1fr 5rem 5rem 5rem; gap:0.5rem; padding:0.5rem 0.75rem; border-bottom:1px solid var(--color-border); align-items:center;">
            <div>
                <div style="font-size:0.9rem; font-weight:600;">${item.name}</div>
                <div style="font-size:0.75rem; color:var(--color-text-light);">${item.unit}</div>
            </div>
            <div style="text-align:center; font-size:0.9rem;">${item.target_amount}</div>
            <div>
                <input type="number" value="${actual}" min="0" step="0.1"
                    data-item-id="${item.id}"
                    data-target="${item.target_amount}"
                    data-price="${item.price_per_unit || 0}"
                    data-supplier="${supplierName}"
                    onchange="updateOrderValue(this)"
                    style="text-align:center; padding:0.3rem; border-radius:6px; border:1px solid var(--color-border); font-size:0.85rem; width:100%;">
                ${prevEntries[item.id] !== undefined ? `<div style="font-size:0.72rem; color:var(--color-text-light); text-align:center; margin-top:0.15rem;">Letztes Mal: ${prevEntries[item.id]} ${item.unit}</div>` : ''}
            </div>
            <div id="order-${item.id}" style="text-align:center; font-size:0.9rem; font-weight:600; color:${order > 0 ? 'var(--color-red)' : 'var(--color-green)'};">
                ${order !== '' ? order : '–'}
            </div>
        </div>`;
    };

    const renderGroupSection = (groupKey, groupName, items, supplierName) => {
        if (items.length === 0) return '';
        return `
        <div style="margin-bottom:0.25rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:0.4rem 0.75rem; background:var(--color-beige-light); border-radius:8px; margin-bottom:0.1rem;" onclick="toggleInventurGroup('${groupKey}')">
                <div style="font-size:0.8rem; font-weight:700; color:var(--color-secondary);">${groupName}</div>
                <span id="inventur-group-toggle-${groupKey}" style="font-size:0.75rem; color:var(--color-text-light);">▶</span>
            </div>
            <div id="inventur-group-body-${groupKey}" style="display:none;">
                ${items.map(item => renderItemRow(item, supplierName)).join('')}
            </div>
        </div>`;
    };

    container.innerHTML = suppliers.map(s => {
        const items = (s.planit_inventory_items || []).sort((a, b) => (a.inventory_position ?? 0) - (b.inventory_position ?? 0));
        if (items.length === 0) return '';

        const supplierGroups = (groups || []).filter(g => g.supplier_id === s.id);
        const grouped = {};
        const ungrouped = [];
        items.forEach(item => {
            if (item.group_id && groupMap[item.group_id]) {
                if (!grouped[item.group_id]) grouped[item.group_id] = [];
                grouped[item.group_id].push(item);
            } else {
                ungrouped.push(item);
            }
        });

        const hasGroups = supplierGroups.length > 0;

        return `
        <div style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:0.75rem 1rem; background:var(--color-gray); border-radius:12px; margin-bottom:0.25rem;" onclick="toggleInventurSupplier('${s.id}')">
                <div style="font-size:0.85rem; font-weight:700; color:var(--color-primary); letter-spacing:0.05em;">${s.name.toUpperCase()}</div>
                <span id="inventur-supplier-toggle-${s.id}" style="color:var(--color-text-light);">▶</span>
            </div>
            <div id="inventur-supplier-body-${s.id}" style="display:none;">
            <div class="card" style="padding:0;">
                <div style="display:grid; grid-template-columns:1fr 5rem 5rem 5rem; gap:0.5rem; padding:0.5rem 0.75rem; border-bottom:2px solid var(--color-border);">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light);">WARE</div>
                    <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); text-align:center;">SOLL</div>
                    <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); text-align:center;">IST</div>
                    <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); text-align:center;">BESTELL</div>
                </div>
                ${hasGroups
                    ? supplierGroups.map(g => renderGroupSection(g.id, g.name, grouped[g.id] || [], s.name)).join('')
                      + (ungrouped.length > 0 ? renderGroupSection(`${s.id}-allgemein`, 'Allgemein', ungrouped, s.name) : '')
                    : items.map(item => renderItemRow(item, s.name)).join('')
                }
            </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML += `<div class="card" id="lagerwert-block" style="margin-top:1rem;"></div>`;
    updateLagerwert();
}

function updateOrderValue(input) {
    const actual = parseFloat(input.value) || 0;
    const target = parseFloat(input.dataset.target) || 0;
    const order = Math.max(0, target - actual);
    const orderDiv = document.getElementById(`order-${input.dataset.itemId}`);
    if (orderDiv) {
        orderDiv.textContent = order;
        orderDiv.style.color = order > 0 ? 'var(--color-red)' : 'var(--color-green)';
    }
    updateLagerwert();
}

function updateLagerwert() {
    const inputs = document.querySelectorAll('#inventur-list input[data-item-id]');
    const supplierValues = {};
    let totalValue = 0;

    inputs.forEach(input => {
        const actual = parseFloat(input.value) || 0;
        const price = parseFloat(input.dataset.price) || 0;
        const supplier = input.dataset.supplier;
        const value = actual * price;
        if (value > 0) {
            if (!supplierValues[supplier]) supplierValues[supplier] = 0;
            supplierValues[supplier] += value;
            totalValue += value;
        }
    });

    const lagerwertDiv = document.getElementById('lagerwert-block');
    if (!lagerwertDiv) return;

    if (totalValue > 0) {
        lagerwertDiv.innerHTML = `
            <div style="font-size:0.85rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.05em; margin-bottom:0.75rem;">LAGERWERT</div>
            ${Object.entries(supplierValues).map(([name, value]) => `
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:0.3rem 0; border-bottom:1px solid var(--color-border);">
                    <span>${name}</span>
                    <span style="font-weight:600;">${value.toFixed(2)} €</span>
                </div>
            `).join('')}
            <div style="display:flex; justify-content:space-between; margin-top:0.75rem; padding-top:0.5rem; border-top:2px solid var(--color-border);">
                <span style="font-weight:700;">Gesamt</span>
                <span style="font-weight:700; font-size:1.1rem; color:var(--color-primary);">${totalValue.toFixed(2)} €</span>
            </div>`;
        lagerwertDiv.style.display = 'block';
    } else {
        lagerwertDiv.innerHTML = '';
    }
}

async function saveInventur() {
    const date = document.getElementById('inventur-date').value;
    if (!date) return;
    const userId = (await db.auth.getUser()).data.user.id;
    const inputs = document.querySelectorAll('#inventur-list input[data-item-id]');
    for (const input of inputs) {
        const actual = parseFloat(input.value);
        if (isNaN(actual)) continue;
        await db.from('planit_inventory_entries').upsert({
            user_id: userId,
            item_id: input.dataset.itemId,
            entry_date: date,
            actual_amount: actual
        }, { onConflict: 'user_id,item_id,entry_date' });
    }
    alert('Gespeichert!');
}

async function downloadInventurPdf() {
    const date = document.getElementById('inventur-date').value;
    if (!date) { alert('Bitte Datum wählen.'); return; }

    const { data: suppliers } = await db
        .from('planit_suppliers')
        .select('*, planit_inventory_items(*)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: true });

    const { data: entries } = await db
        .from('planit_inventory_entries')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .eq('entry_date', date);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('de-DE');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Inventur', 15, 20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(dateLabel, 190, 20, { align: 'right' });

    let y = 35;

    for (const s of suppliers || []) {
        const items = (s.planit_inventory_items || []).sort((a, b) => a.position - b.position);
        if (items.length === 0) continue;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(s.name, 15, y);
        y += 7;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Ware', 15, y);
        doc.text('Einheit', 90, y);
        doc.text('Soll', 120, y, { align: 'right' });
        doc.text('Ist', 150, y, { align: 'right' });
        doc.text('Bestell', 185, y, { align: 'right' });
        y += 5;
        doc.line(15, y, 195, y);
        y += 5;

        doc.setFont('helvetica', 'normal');
        for (const item of items) {
            const entry = (entries || []).find(e => e.item_id === item.id);
            const actual = entry ? entry.actual_amount : '–';
            const order = entry ? Math.max(0, item.target_amount - parseFloat(entry.actual_amount)) : '–';
            doc.text(item.name, 15, y);
            doc.text(item.unit, 90, y);
            doc.text(String(item.target_amount), 120, y, { align: 'right' });
            doc.text(String(actual), 150, y, { align: 'right' });
            doc.text(String(order), 185, y, { align: 'right' });
            y += 7;
            if (y > 270) { doc.addPage(); y = 20; }
        }
        y += 5;
    }

    doc.save(`Inventur_${date}.pdf`);
}

// ── DATUM NAVIGATION ──────────────────────────────────────

function changeInventurDate(dir) {
    inventurDate.setDate(inventurDate.getDate() + dir);
    updateInventurDateLabel();
    loadInventur();
    if (document.getElementById('inventur-subtab-bestellung').style.display !== 'none') {
        renderBestellansicht();
    }
}

function updateInventurDateLabel() {
    const dateStr = inventurDate.toISOString().split('T')[0];
    document.getElementById('inventur-date').value = dateStr;
}

function onInventurDateChange() {
    const val = document.getElementById('inventur-date').value;
    if (!val) return;
    inventurDate = new Date(val + 'T12:00:00');
    loadInventur();
    if (document.getElementById('inventur-subtab-bestellung').style.display !== 'none') {
        renderBestellansicht();
    }
}

function switchInventurSubTab(tab) {
    document.getElementById('inventur-subtab-inventur').style.display = tab === 'inventur' ? 'block' : 'none';
    document.getElementById('inventur-subtab-bestellung').style.display = tab === 'bestellung' ? 'block' : 'none';
    document.getElementById('inventur-sub-tab-inventur').classList.toggle('active', tab === 'inventur');
    document.getElementById('inventur-sub-tab-bestellung').classList.toggle('active', tab === 'bestellung');
    if (tab === 'bestellung') renderBestellansicht();
}

async function renderBestellansicht() {
    const date = inventurDate.toISOString().split('T')[0];
    const container = document.getElementById('bestellung-list');
    container.innerHTML = '<div style="text-align:center; color:var(--color-text-light); padding:1rem;">Lädt...</div>';

    const { data: suppliers } = await db
        .from('planit_suppliers')
        .select('*, planit_inventory_items(*)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: true });

    const { data: entries } = await db
        .from('planit_inventory_entries')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .eq('entry_date', date);

    if (!suppliers || suppliers.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Waren konfiguriert.</p></div>';
        return;
    }

    let html = '';
    for (const s of suppliers) {
        const items = (s.planit_inventory_items || [])
            .sort((a, b) => (a.order_position ?? 0) - (b.order_position ?? 0));
        if (items.length === 0) continue;

        html += `<div style="margin-bottom:1rem;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--color-primary); letter-spacing:0.05em; padding:0.5rem 0; border-bottom:2px solid var(--color-border); margin-bottom:0.5rem;">${s.name.toUpperCase()}</div>`;

        for (const item of items) {
            const entry = (entries || []).find(e => e.item_id === item.id);
            const hasEntry = !!entry;
            const actual = hasEntry ? parseFloat(entry.actual_amount) : null;
            const orderAmt = hasEntry ? Math.max(0, item.target_amount - actual) : null;

            if (hasEntry) {
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
                    <div>
                        <div style="font-size:0.9rem; font-weight:600;">${item.name}</div>
                        <div style="font-size:0.75rem; color:var(--color-text-light);">Ist: ${actual} ${item.unit}</div>
                    </div>
                    <div style="font-size:1rem; font-weight:700; color:${orderAmt > 0 ? 'var(--color-primary)' : 'var(--color-text-light)'};">
                        ${orderAmt} ${item.unit}
                    </div>
                </div>`;
            } else {
                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--color-border); opacity:0.45;">
                    <div>
                        <div style="font-size:0.9rem;">${item.name}</div>
                        <div style="font-size:0.75rem; color:var(--color-text-light);">nicht erfasst</div>
                    </div>
                    <div style="font-size:0.75rem; color:var(--color-text-light);">—</div>
                </div>`;
            }
        }
        html += `</div>`;
    }

    container.innerHTML = html || '<div class="empty-state"><p>Keine Waren gefunden.</p></div>';
}

// ── MODALS ────────────────────────────────────────────────

async function openInventurItemModal(supplierId, itemId = null, name = '', unit = 'Stück', target = 0, price = 0, groupId = '') {
    document.getElementById('inventur-item-id').value = itemId || '';
    document.getElementById('inventur-item-supplier-id').value = supplierId;
    document.getElementById('inventur-item-name').value = name;
    document.getElementById('inventur-item-unit').value = unit;
    document.getElementById('inventur-item-target').value = target;
    document.getElementById('inventur-item-price').value = price;
    document.getElementById('inventur-item-modal-title').textContent = itemId ? 'Ware bearbeiten' : 'Ware hinzufügen';

    const select = document.getElementById('inventur-item-group');
    select.innerHTML = '<option value="">— Kein Bereich —</option>';
    if (supplierId) {
        const { data: groups } = await db
            .from('planit_inventory_groups')
            .select('id, name')
            .eq('supplier_id', supplierId)
            .order('position', { ascending: true });
        (groups || []).forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            if (g.id === groupId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    document.getElementById('inventur-item-modal').classList.add('active');
}

function closeInventurItemModal() {
    document.getElementById('inventur-item-modal').classList.remove('active');
}

async function saveInventurItem() {
    const id = document.getElementById('inventur-item-id').value;
    const supplierId = document.getElementById('inventur-item-supplier-id').value;
    const name = document.getElementById('inventur-item-name').value.trim();
    const unit = document.getElementById('inventur-item-unit').value;
    const target = parseFloat(document.getElementById('inventur-item-target').value) || 0;
    const price = parseFloat(document.getElementById('inventur-item-price').value) || 0;
    const groupId = document.getElementById('inventur-item-group').value || null;
    if (!name) { alert('Bitte Name eingeben.'); return; }

    if (id) {
        await db.from('planit_inventory_items').update({ name, unit, target_amount: target, price_per_unit: price, group_id: groupId }).eq('id', id);
    } else {
        await db.from('planit_inventory_items').insert({
            user_id: adminSession.user.id,
            supplier_id: supplierId,
            name,
            unit,
            target_amount: target,
            price_per_unit: price,
            group_id: groupId
        });
    }
    closeInventurItemModal();
    loadInventurConfig();
}

function openInventurSupplierModal(id = null, name = '') {
    document.getElementById('inventur-supplier-id').value = id || '';
    document.getElementById('inventur-supplier-name').value = name;
    document.getElementById('inventur-supplier-modal').classList.add('active');
}

function closeInventurSupplierModal() {
    document.getElementById('inventur-supplier-modal').classList.remove('active');
}

function openInventurInfoModal() {
    document.getElementById('inventur-info-modal').classList.add('active');
}

function closeInventurInfoModal() {
    document.getElementById('inventur-info-modal').classList.remove('active');
}

async function saveInventurSupplier() {
    const id = document.getElementById('inventur-supplier-id').value;
    const name = document.getElementById('inventur-supplier-name').value.trim();
    if (!name) { alert('Bitte Name eingeben.'); return; }

    if (id) {
        await db.from('planit_suppliers').update({ name }).eq('id', id);
    } else {
        await db.from('planit_suppliers').insert({ user_id: adminSession.user.id, name });
    }
    closeInventurSupplierModal();
    loadInventurConfig();
}

function openJahresberichtModal() {
    document.getElementById('jahresbericht-date').value = inventurDate.toISOString().split('T')[0];
    document.getElementById('jahresbericht-modal').classList.add('active');
}

function closeJahresberichtModal() {
    document.getElementById('jahresbericht-modal').classList.remove('active');
}

async function downloadJahresberichtPdf() {
    const date = document.getElementById('jahresbericht-date').value;
    if (!date) { alert('Bitte Datum wählen.'); return; }

    const { data: suppliers } = await db
        .from('planit_suppliers')
        .select('*, planit_inventory_items(*)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: true });

    const { data: entries } = await db
        .from('planit_inventory_entries')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .eq('entry_date', date);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('de-DE');

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Jahresinventur', 15, 20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(dateLabel, 190, 20, { align: 'right' });

    let y = 35;
    let grandTotal = 0;

    for (const s of suppliers || []) {
        const items = (s.planit_inventory_items || []).sort((a, b) => a.position - b.position);
        if (items.length === 0) continue;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(s.name, 15, y);
        y += 7;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Ware', 15, y);
        doc.text('Einheit', 70, y);
        doc.text('Menge', 100, y, { align: 'right' });
        doc.text('Preis/Einheit', 140, y, { align: 'right' });
        doc.text('Gesamtwert', 185, y, { align: 'right' });
        y += 5;
        doc.line(15, y, 195, y);
        y += 5;

        let supplierTotal = 0;
        doc.setFont('helvetica', 'normal');
        for (const item of items) {
            const entry = (entries || []).find(e => e.item_id === item.id);
            const actual = entry ? parseFloat(entry.actual_amount) : 0;
            const price = parseFloat(item.price_per_unit) || 0;
            const value = actual * price;
            supplierTotal += value;
            grandTotal += value;

            doc.text(item.name, 15, y);
            doc.text(item.unit, 70, y);
            doc.text(String(actual), 100, y, { align: 'right' });
            doc.text(`${price.toFixed(2)} €`, 140, y, { align: 'right' });
            doc.text(`${value.toFixed(2)} €`, 185, y, { align: 'right' });
            y += 7;
            if (y > 270) { doc.addPage(); y = 20; }
        }

        doc.setFont('helvetica', 'bold');
        doc.text(`Gesamt ${s.name}:`, 140, y, { align: 'right' });
        doc.text(`${supplierTotal.toFixed(2)} €`, 185, y, { align: 'right' });
        y += 10;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.line(15, y, 195, y);
    y += 7;
    doc.text('GESAMTLAGERWERT:', 140, y, { align: 'right' });
    doc.text(`${grandTotal.toFixed(2)} €`, 185, y, { align: 'right' });

    doc.save(`Jahresinventur_${date}.pdf`);
    closeJahresberichtModal();
}

// ── TOGGLE HELPERS ────────────────────────────────────────

function toggleInventurSupplier(supplierId) {
    const body = document.getElementById(`inventur-supplier-body-${supplierId}`);
    const toggle = document.getElementById(`inventur-supplier-toggle-${supplierId}`);
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

function toggleInventurGroup(groupKey) {
    const body = document.getElementById(`inventur-group-body-${groupKey}`);
    const toggle = document.getElementById(`inventur-group-toggle-${groupKey}`);
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

function toggleInventurConfigSupplier(supplierId) {
    const body = document.getElementById(`inventur-config-supplier-body-${supplierId}`);
    const toggle = document.getElementById(`inventur-config-supplier-toggle-${supplierId}`);
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
    if (!isOpen && window.inventurSortMode === 'inventory') loadGroups(supplierId);
}

// ── GRUPPEN ───────────────────────────────────────────────

async function loadGroups(supplierId) {
    const { data: groups } = await db
        .from('planit_inventory_groups')
        .select('*')
        .eq('supplier_id', supplierId)
        .eq('user_id', adminSession.user.id)
        .order('position', { ascending: true });

    renderGroups(supplierId, groups || []);
}

function renderGroups(supplierId, groups) {
    const container = document.getElementById(`inventur-config-groups-${supplierId}`);
    if (!container) return;

    container.innerHTML = `
        <div class="card" style="margin-bottom:0; padding:0.5rem 0.75rem;">
            <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.05em; margin-bottom:0.5rem;">BEREICHE</div>
            ${groups.length === 0
                ? '<div style="font-size:0.8rem; color:var(--color-text-light); margin-bottom:0.5rem;">Keine Bereiche.</div>'
                : groups.map((g, i) => `
                    <div style="display:flex; align-items:center; gap:0.3rem; padding:0.3rem 0; border-bottom:1px solid var(--color-border);">
                        <input id="group-name-${g.id}" type="text" value="${g.name}"
                            style="flex:1; font-size:0.85rem; border:1px solid transparent; border-radius:6px; padding:0.2rem 0.35rem; background:transparent;"
                            onfocus="this.style.borderColor='var(--color-border)'"
                            onblur="this.style.borderColor='transparent'"
                            onkeydown="if(event.key==='Enter') renameGroup('${g.id}','${supplierId}',this.value)">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.2rem;">
                            ${i > 0 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.6rem; height:1.6rem;" onclick="moveGroup('${g.id}','${supplierId}',-1)">
                                <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
                            </button>` : `<div style="width:1.6rem;"></div>`}
                            <button class="btn-small btn-pdf-view btn-icon" style="width:1.6rem; height:1.6rem;" onclick="renameGroup('${g.id}','${supplierId}',document.getElementById('group-name-${g.id}').value)">
                                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            ${i < groups.length - 1 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.6rem; height:1.6rem;" onclick="moveGroup('${g.id}','${supplierId}',1)">
                                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>` : `<div style="width:1.6rem;"></div>`}
                            <button class="btn-small btn-pdf-view btn-icon" style="width:1.6rem; height:1.6rem;" onclick="deleteGroup('${g.id}','${supplierId}')">
                                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                        </div>
                    </div>
                `).join('')}
            <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                <input type="text" id="new-group-input-${supplierId}" placeholder="Neuer Bereich…" style="flex:1; padding:0.3rem 0.5rem; border:1px solid var(--color-border); border-radius:6px; font-size:0.85rem;">
                <button class="btn-small btn-pdf-view" style="font-size:0.75rem; height:auto; width:auto; padding:0.3rem 0.6rem;" onclick="addGroup('${supplierId}')">+</button>
            </div>
        </div>
    `;
}

async function addGroup(supplierId) {
    const input = document.getElementById(`new-group-input-${supplierId}`);
    const name = input?.value.trim();
    if (!name) return;

    const { data: existing } = await db
        .from('planit_inventory_groups')
        .select('position')
        .eq('supplier_id', supplierId)
        .order('position', { ascending: false })
        .limit(1);

    const nextPos = existing && existing.length > 0 ? (existing[0].position ?? 0) + 1 : 0;

    await db.from('planit_inventory_groups').insert({
        user_id: adminSession.user.id,
        supplier_id: supplierId,
        name,
        position: nextPos
    });
    loadGroups(supplierId);
}

async function deleteGroup(groupId, supplierId) {
    if (!confirm('Bereich löschen?')) return;
    await db.from('planit_inventory_groups').delete().eq('id', groupId);
    loadGroups(supplierId);
}

async function renameGroup(groupId, supplierId, newName) {
    const name = newName?.trim();
    if (!name) return;
    await db.from('planit_inventory_groups').update({ name }).eq('id', groupId);
    loadGroups(supplierId);
}

async function moveGroup(groupId, supplierId, dir) {
    const { data: groups } = await db
        .from('planit_inventory_groups')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('position', { ascending: true });

    if (!groups) return;
    const idx = groups.findIndex(g => g.id === groupId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= groups.length) return;

    const posA = groups[idx].position ?? idx;
    const posB = groups[swapIdx].position ?? swapIdx;
    await db.from('planit_inventory_groups').update({ position: posB }).eq('id', groups[idx].id);
    await db.from('planit_inventory_groups').update({ position: posA }).eq('id', groups[swapIdx].id);
    loadGroups(supplierId);
}

function setInventurSortMode(mode) {
    window.inventurSortMode = mode;
    document.getElementById('inventur-sort-tab-inventory').classList.toggle('active', mode === 'inventory');
    document.getElementById('inventur-sort-tab-order').classList.toggle('active', mode === 'order');
    loadInventurConfig();
}

async function moveInventurItem(supplierId, index, direction, type) {
    const { data: supplier } = await db
        .from('planit_suppliers')
        .select('*, planit_inventory_items(*)')
        .eq('id', supplierId)
        .maybeSingle();

    if (!supplier) return;
    const posField = type === 'order' ? 'order_position' : 'inventory_position';
    const items = (supplier.planit_inventory_items || [])
        .sort((a, b) => (a[posField] ?? 0) - (b[posField] ?? 0));

    if (type === 'order') {
        const positions = items.map(i => i[posField] ?? 0);
        const allSame = positions.every(p => p === positions[0]);
        if (allSame) {
            for (let i = 0; i < items.length; i++) {
                await db.from('planit_inventory_items').update({ [posField]: i }).eq('id', items[i].id);
                items[i][posField] = i;
            }
        }
    }

    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= items.length) return;

    const posA = items[index][posField] ?? index;
    const posB = items[swapIndex][posField] ?? swapIndex;

    await db.from('planit_inventory_items').update({ [posField]: posB }).eq('id', items[index].id);
    await db.from('planit_inventory_items').update({ [posField]: posA }).eq('id', items[swapIndex].id);

    loadInventurConfig();
}
