async function loadEmpAufgaben() {
    const container = document.getElementById('aufgaben-emp-list');
    if (!container) return;

    const [{ data: generalTasks }, { data: assignments }] = await Promise.all([
        db.from('tasks')
            .select('*')
            .eq('user_id', currentEmployee.user_id)
            .eq('type', 'general')
            .eq('is_archived', false),
        db.from('task_assignments')
            .select('task_id')
            .eq('employee_id', currentEmployee.id),
    ]);

    let personalTasks = [];
    const taskIds = (assignments || []).map(a => a.task_id);
    if (taskIds.length) {
        const { data } = await db.from('tasks')
            .select('*')
            .in('id', taskIds)
            .eq('is_archived', false);
        personalTasks = data || [];
    }

    const all = [
        ...(generalTasks || []).map(t => ({ ...t, _badge: 'Allgemein' })),
        ...personalTasks.map(t => ({ ...t, _badge: 'Persönlich' })),
    ].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
    });

    if (!all.length) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light); padding:0.5rem 0;">Keine Aufgaben vorhanden.</div>';
        return;
    }

    const repeatLabel = r => ({ daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' }[r] || null);

    container.innerHTML = all.map(t => {
        const dateStr = t.due_date
            ? new Date(t.due_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
            : null;
        const repeat = t.repeat_interval === 'custom' && t.repeat_every
            ? `Alle ${t.repeat_every} Tage`
            : repeatLabel(t.repeat_interval);
        const badgeColor = t._badge === 'Persönlich' ? 'var(--color-primary)' : '#6B8E6B';
        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                <div style="font-weight:700; font-size:0.95rem; flex:1;">${t.title}</div>
                <span style="font-size:0.7rem; font-weight:600; color:white; background:${badgeColor}; padding:0.15rem 0.5rem; border-radius:6px; flex-shrink:0;">${t._badge}</span>
            </div>
            ${t.description ? `<div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.25rem;">${t.description}</div>` : ''}
            ${dateStr ? `<div style="font-size:0.8rem; color:var(--color-text-light);">Fällig: ${dateStr}</div>` : ''}
            ${repeat ? `<div style="font-size:0.8rem; color:var(--color-text-light);">${repeat}</div>` : ''}
        </div>`;
    }).join('');
}
