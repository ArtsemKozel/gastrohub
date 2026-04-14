// ── TRINKGELD (MITARBEITER) ───────────────────────────────
function changeEmpTrinkgeldMonth(dir) {
    empTrinkgeldDate.setMonth(empTrinkgeldDate.getMonth() + dir);
    loadEmpTrinkgeld();
}

async function loadEmpTrinkgeld() {
    const year     = empTrinkgeldDate.getFullYear();
    const month    = empTrinkgeldDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const label    = empTrinkgeldDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.getElementById('emp-trinkgeld-month-label').textContent = label;

    const container = document.getElementById('emp-trinkgeld-content');

    const { data: result } = await db
        .from('tip_results')
        .select('*')
        .eq('user_id', currentEmployee.user_id)
        .eq('employee_id', currentEmployee.id)
        .eq('month', monthStr)
        .maybeSingle();

    if (!result) {
        container.innerHTML = '<div class="empty-state"><p>Keine Daten vorhanden.</p></div>';
        return;
    }

    const total = parseFloat(result.amount_card) + parseFloat(result.amount_cash);
    container.innerHTML = `
        <div class="card" style="margin-bottom:1rem;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">KARTE</div>
                    <div style="font-weight:600;">${parseFloat(result.amount_card).toFixed(2)} €</div>
                </div>
                <div>
                    <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">BAR</div>
                    <div style="font-weight:600;">${parseFloat(result.amount_cash).toFixed(2)} €</div>
                </div>
            </div>
            <div style="border-top:1px solid var(--color-border); padding-top:0.75rem;">
                <div style="font-size:0.75rem; color:var(--color-text-light); margin-bottom:0.25rem;">GESAMT</div>
                <div style="font-weight:700; font-size:1.3rem; color:var(--color-primary);">${total.toFixed(2)} €</div>
            </div>
        </div>`;
}
