// ── INVENTUR (MITARBEITER) ────────────────────────────────
let empInventurDate = new Date();

function updateEmpInventurDateLabel() {
    document.getElementById('emp-inventur-date').value = empInventurDate.toISOString().split('T')[0];
}

function changeEmpInventurDate(dir) {
    empInventurDate.setDate(empInventurDate.getDate() + dir);
    loadEmpInventur();
}

function onEmpInventurDateChange() {
    const val = document.getElementById('emp-inventur-date').value;
    if (!val) return;
    empInventurDate = new Date(val + 'T12:00:00');
    loadEmpInventur();
}

async function loadEmpInventur() {
    updateEmpInventurDateLabel();
    const date = empInventurDate.toISOString().split('T')[0];

    const { data: suppliers } = await db
        .from('planit_suppliers')
        .select('*, planit_inventory_items(*)')
        .eq('user_id', currentEmployee.user_id)
        .order('created_at', { ascending: true });

    const { data: entries } = await db
        .from('planit_inventory_entries')
        .select('*')
        .eq('user_id', currentEmployee.user_id)
        .eq('entry_date', date);

    renderEmpInventur(suppliers, entries);
}

function renderEmpInventur(suppliers, entries) {
    const container = document.getElementById('emp-inventur-list');

    if (!suppliers || suppliers.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Waren konfiguriert.</p></div>';
        return;
    }

    container.innerHTML = suppliers.map(s => {
        const items = (s.planit_inventory_items || [])
            .sort((a, b) => (a.inventory_position ?? 0) - (b.inventory_position ?? 0));
        if (items.length === 0) return '';
        return `
        <div style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:0.75rem 1rem; background:var(--color-gray); border-radius:12px; margin-bottom:0.25rem;"
                 onclick="toggleEmpInventurSupplier('${s.id}')">
                <div style="font-size:0.85rem; font-weight:700; color:var(--color-primary); letter-spacing:0.05em;">${s.name.toUpperCase()}</div>
                <span id="emp-inventur-supplier-toggle-${s.id}" style="color:var(--color-text-light);">▶</span>
            </div>
            <div id="emp-inventur-supplier-body-${s.id}" style="display:none;">
                <div class="card" style="padding:0;">
                    <div style="display:grid; grid-template-columns:1fr 5rem 5rem 5rem; gap:0.5rem; padding:0.5rem 0.75rem; border-bottom:2px solid var(--color-border);">
                        <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light);">WARE</div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); text-align:center;">SOLL</div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); text-align:center;">IST</div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--color-text-light); text-align:center;">BESTELL</div>
                    </div>
                    ${items.map(item => {
                        const entry  = (entries || []).find(e => e.item_id === item.id);
                        const actual = entry ? entry.actual_amount : '';
                        const order  = actual !== '' ? Math.max(0, item.target_amount - parseFloat(actual)) : '';
                        return `
                        <div style="display:grid; grid-template-columns:1fr 5rem 5rem 5rem; gap:0.5rem; padding:0.5rem 0.75rem; border-bottom:1px solid var(--color-border); align-items:center;">
                            <div>
                                <div style="font-size:0.9rem; font-weight:600;">${item.name}</div>
                                <div style="font-size:0.75rem; color:var(--color-text-light);">${item.unit}</div>
                            </div>
                            <div style="text-align:center; font-size:0.9rem;">${item.target_amount}</div>
                            <input type="number" value="${actual}" min="0" step="0.1"
                                data-item-id="${item.id}"
                                data-target="${item.target_amount}"
                                onchange="updateEmpOrderValue(this)"
                                style="text-align:center; padding:0.3rem; border-radius:6px; border:1px solid var(--color-border); font-size:0.85rem; width:100%;">
                            <div id="emp-order-${item.id}"
                                 style="text-align:center; font-size:0.9rem; font-weight:600; color:${order > 0 ? 'var(--color-red)' : 'var(--color-green)'};">
                                ${order !== '' ? order : '–'}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleEmpInventurSupplier(supplierId) {
    const body   = document.getElementById(`emp-inventur-supplier-body-${supplierId}`);
    const toggle = document.getElementById(`emp-inventur-supplier-toggle-${supplierId}`);
    const isOpen = body.style.display === 'block';
    body.style.display  = isOpen ? 'none' : 'block';
    toggle.textContent  = isOpen ? '▶' : '▼';
}

function updateEmpOrderValue(input) {
    const actual   = parseFloat(input.value) || 0;
    const target   = parseFloat(input.dataset.target) || 0;
    const order    = Math.max(0, target - actual);
    const orderDiv = document.getElementById(`emp-order-${input.dataset.itemId}`);
    if (orderDiv) {
        orderDiv.textContent  = order;
        orderDiv.style.color  = order > 0 ? 'var(--color-red)' : 'var(--color-green)';
    }
}

async function saveEmpInventur() {
    const date   = empInventurDate.toISOString().split('T')[0];
    const inputs = document.querySelectorAll('#emp-inventur-list input[data-item-id]');
    for (const input of inputs) {
        const actual = parseFloat(input.value);
        if (isNaN(actual)) continue;
        await db.from('planit_inventory_entries').upsert({
            user_id:       currentEmployee.user_id,
            item_id:       input.dataset.itemId,
            entry_date:    date,
            actual_amount: actual
        }, { onConflict: 'user_id,item_id,entry_date' });
    }
}

// Alias
const saveEmpInventurEntry = saveEmpInventur;

async function submitEmpInventur() {
    await saveEmpInventur();
    const date = empInventurDate.toISOString().split('T')[0];
    await db.from('planit_inventory_submissions').insert({
        user_id:         currentEmployee.user_id,
        employee_id:     currentEmployee.id,
        submission_date: date,
        submitted_at:    new Date().toISOString()
    });
    alert('Inventur wurde abgeschlossen und gespeichert!');
}
