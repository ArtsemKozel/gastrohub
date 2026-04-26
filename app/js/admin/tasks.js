// ── AUFGABEN ──────────────────────────────────────────────

let editTemplateId   = null;
let editTemplateSteps = [];
let editNoteId       = null;
let newTemplateSteps = [];

// ── TASKS LADEN ───────────────────────────────────────────

async function loadTasks() {
    const archiveContainerCleanup = document.getElementById('tasks-archive');
    if (archiveContainerCleanup) archiveContainerCleanup.innerHTML = '';
    await loadTaskTemplates();
    const { data: tasks } = await db
        .from('tasks')
        .select('*, task_steps(*)')
        .eq('user_id', adminSession.user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

    const { data: archivedTasks } = await db
        .from('tasks')
        .select('*, task_steps(*)')
        .eq('user_id', adminSession.user.id)
        .eq('is_archived', true)
        .order('created_at', { ascending: false });

    const container = document.getElementById('tasks-list');
    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Aufgaben vorhanden.</p></div>';
        return;
    }

    container.innerHTML = tasks.map(t => {
        const steps = t.task_steps || [];
        const done = steps.filter(s => s.is_done).length;
        const total = steps.length;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;

        return `
            <div style="background:var(--color-gray); border-radius:14px; margin-bottom:1rem; overflow:hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.25rem; cursor:pointer;" onclick="toggleTask('${t.id}')">
                    <div>
                        <div style="font-weight:700; font-size:1rem;">${t.title}</div>
                        <div style="font-size:0.8rem; color:var(--color-text-light); margin-top:0.2rem;">${done}/${total} Schritte erledigt</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="font-weight:700; color:${progress === 100 ? 'var(--color-green)' : 'var(--color-primary)'};">${progress}%</div>
                        <span id="task-toggle-${t.id}" style="color:var(--color-text-light);">▶</span>
                    </div>
                </div>
                <div id="task-body-${t.id}" style="display:none; padding:0 1.25rem 1rem; background:white; border-top:1px solid var(--color-border);" onclick="event.stopPropagation()">
                    <div id="task-steps-${t.id}" style="margin-top:0.75rem;">
                        ${steps.sort((a,b) => a.position - b.position).map((s, idx) => `
                            <div style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
                                <div style="display:flex; flex-direction:column; gap:0.2rem;">
                                    ${idx > 0 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="moveStep('${s.id}', '${t.id}', -1)">
                                        <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
                                    </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                                    ${idx < steps.length - 1 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="moveStep('${s.id}', '${t.id}', 1)">
                                        <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                                </div>
                                <input type="checkbox" ${s.is_done ? 'checked' : ''} onchange="toggleStep('${s.id}', this.checked, '${t.id}')" onclick="event.stopPropagation()" style="width:auto; cursor:pointer;">
                                <span style="flex:1; min-width:0; word-break:break-word; ${s.is_done ? 'text-decoration:line-through; color:var(--color-text-light);' : ''}">${s.title}</span>
                                <button class="btn-small btn-pdf-view btn-icon" onclick="editStep('${s.id}', \`${s.title.replace(/`/g, '\\`')}\`, '${t.id}')" style="width:2rem; height:2rem; flex-shrink:0;">
                                    <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button class="btn-small btn-pdf-view btn-icon" onclick="deleteStep('${s.id}', '${t.id}')" style="width:2rem; height:2rem; flex-shrink:0;">
                                    <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                        <input type="text" id="new-step-${t.id}" placeholder="Neuer Schritt..." style="flex:1; padding:0.5rem; border-radius:8px; border:1px solid var(--color-border); font-size:0.85rem;">
                        <button class="btn-small btn-pdf-view btn-icon" onclick="addStep('${t.id}')">
                            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                    </div>
                    <button onclick="archiveTask('${t.id}')" style="margin-top:0.75rem; background:none; border:none; color:var(--color-primary); font-size:0.85rem; cursor:pointer; font-weight:600;">✓ Archivieren</button>
                    <button onclick="deleteTask('${t.id}')" style="margin-top:0.5rem; margin-left:1rem; background:none; border:none; color:var(--color-text-light); font-size:0.8rem; cursor:pointer;">🗑 Aufgabe löschen</button>
                </div>
            </div>`;
    }).join('');

    // Archiv
    const archiveHtml = (archivedTasks || []).map(t => {
        const steps = t.task_steps || [];
        const done = steps.filter(s => s.is_done).length;
        const total = steps.length;
        return `
        <div style="background:var(--color-gray); border-radius:14px; margin-bottom:0.75rem; overflow:hidden; opacity:0.7;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.25rem; cursor:pointer;" onclick="toggleTask('${t.id}')">
                <div>
                    <div style="font-weight:700; font-size:1rem;">${t.title}</div>
                    <div style="font-size:0.8rem; color:var(--color-text-light); margin-top:0.2rem;">${done}/${total} Schritte erledigt</div>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                    <span style="font-size:0.75rem; color:var(--color-text-light);">Archiviert</span>
                    <span id="task-toggle-${t.id}" style="color:var(--color-text-light);">▶</span>
                </div>
            </div>
            <div id="task-body-${t.id}" style="display:none; padding:0 1.25rem 1rem; background:white; border-top:1px solid var(--color-border);">
                <div style="margin-top:0.75rem;">
                    ${steps.sort((a,b) => a.position - b.position).map(s => `
                        <div style="display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
                            <input type="checkbox" ${s.is_done ? 'checked' : ''} disabled style="width:auto;">
                            <span style="${s.is_done ? 'text-decoration:line-through; color:var(--color-text-light);' : ''}">${s.title}</span>
                        </div>
                    `).join('')}
                </div>
                <button onclick="unarchiveTask('${t.id}')" style="margin-top:0.75rem; background:none; border:none; color:var(--color-primary); font-size:0.85rem; cursor:pointer; font-weight:600;">↩ Wiederherstellen</button>
                <button onclick="deleteTask('${t.id}')" style="margin-top:0.5rem; margin-left:1rem; background:none; border:none; color:var(--color-text-light); font-size:0.8rem; cursor:pointer;">🗑 Löschen</button>
            </div>
        </div>`;
    }).join('');

    const archiveContainer = document.getElementById('tasks-archive');
    if (archiveContainer) {
        archiveContainer.innerHTML = '';
        if (archivedTasks && archivedTasks.length > 0) {
            archiveContainer.innerHTML = `
        <div>
            <div style="font-size:0.85rem; font-weight:700; color:var(--color-text-light); letter-spacing:0.05em; margin-bottom:0.75rem; cursor:pointer; display:flex; justify-content:space-between;" onclick="toggleArchive()">
                <span>ARCHIV (${archivedTasks.length})</span>
                <span id="tasks-archive-toggle">▶</span>
            </div>
            <div id="tasks-archive-list" style="display:none;">${archiveHtml}</div>
        </div>`;
        }
    }

    // Offene Tasks wiederherstellen
    openTaskIds.forEach(taskId => {
        const body = document.getElementById(`task-body-${taskId}`);
        const toggle = document.getElementById(`task-toggle-${taskId}`);
        if (body) {
            body.style.display = 'block';
            toggle.textContent = '▼';
        }
    });
}

async function archiveTask(taskId) {
    await db.from('tasks').update({ is_archived: true }).eq('id', taskId);
    openTaskIds.delete(taskId);
    await loadTasks();
}

async function unarchiveTask(taskId) {
    await db.from('tasks').update({ is_archived: false }).eq('id', taskId);
    await loadTasks();
}

function toggleArchive() {
    const list = document.getElementById('tasks-archive-list');
    const toggle = document.getElementById('tasks-archive-toggle');
    const isOpen = list.style.display === 'block';
    list.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

async function moveStep(stepId, taskId, direction) {
    const { data: steps } = await db.from('task_steps').select('id, position').eq('task_id', taskId).order('position', { ascending: true });
    if (!steps) return;

    const idx = steps.findIndex(s => s.id === stepId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= steps.length) return;

    const posA = steps[idx].position;
    const posB = steps[swapIdx].position;

    await db.from('task_steps').update({ position: posB }).eq('id', steps[idx].id);
    await db.from('task_steps').update({ position: posA }).eq('id', steps[swapIdx].id);

    await loadTasks();
}

async function deleteStep(stepId, taskId) {
    if (!confirm('Schritt löschen?')) return;
    await db.from('task_steps').delete().eq('id', stepId);
    await loadTasks();
}

async function editStep(stepId, currentTitle, taskId) {
    const newTitle = prompt('Schritt bearbeiten:', currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) return;
    await db.from('task_steps').update({ title: newTitle.trim() }).eq('id', stepId);
    await loadTasks();
}

async function insertStepAfter(taskId, afterPosition) {
    const title = prompt('Neuer Schritt:');
    if (!title || !title.trim()) return;

    const { data: steps } = await db.from('task_steps').select('id, position').eq('task_id', taskId).gt('position', afterPosition);
    for (const s of steps || []) {
        await db.from('task_steps').update({ position: s.position + 1 }).eq('id', s.id);
    }
    await db.from('task_steps').insert({
        user_id: adminSession.user.id,
        task_id: taskId,
        title: title.trim(),
        position: afterPosition + 1
    });
    await loadTasks();
}

function toggleTask(taskId) {
    const body = document.getElementById(`task-body-${taskId}`);
    const toggle = document.getElementById(`task-toggle-${taskId}`);
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
    if (isOpen) {
        openTaskIds.delete(taskId);
    } else {
        openTaskIds.add(taskId);
    }
}

async function toggleStep(stepId, isDone, taskId) {
    await db.from('task_steps').update({ is_done: isDone }).eq('id', stepId);
    await loadTasks();
    const body = document.getElementById(`task-body-${taskId}`);
    const toggle = document.getElementById(`task-toggle-${taskId}`);
    if (body) { body.style.display = 'block'; toggle.textContent = '▼'; }
}

async function addStep(taskId) {
    const input = document.getElementById(`new-step-${taskId}`);
    const title = input.value.trim();
    if (!title) return;

    const { data: steps } = await db.from('task_steps').select('position').eq('task_id', taskId).order('position', { ascending: false }).limit(1);
    const nextPos = steps && steps.length > 0 ? steps[0].position + 1 : 0;

    await db.from('task_steps').insert({
        user_id: adminSession.user.id,
        task_id: taskId,
        title,
        position: nextPos
    });
    await loadTasks();
}

async function deleteTask(taskId) {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    await db.from('tasks').delete().eq('id', taskId);
    await loadTasks();
}

async function openNewTaskModal() {
    document.getElementById('new-task-title').value = '';
    document.getElementById('new-task-error').style.display = 'none';

    const { data: templates } = await db
        .from('task_templates')
        .select('id, title')
        .eq('user_id', adminSession.user.id)
        .order('title');

    const select = document.getElementById('new-task-template-id');
    select.innerHTML = '<option value="">— Keine Vorlage —</option>';
    if (templates) {
        select.innerHTML += templates.map(t =>
            `<option value="${t.id}">${t.title}</option>`
        ).join('');
    }

    document.getElementById('new-task-modal').classList.add('active');
}

function closeNewTaskModal() {
    document.getElementById('new-task-modal').classList.remove('active');
}

async function submitNewTask() {
    const title = document.getElementById('new-task-title').value.trim();
    const templateId = document.getElementById('new-task-template-id').value;
    const errorDiv = document.getElementById('new-task-error');
    errorDiv.style.display = 'none';

    if (!title) {
        errorDiv.textContent = 'Bitte Titel eingeben.';
        errorDiv.style.display = 'block';
        return;
    }

    const { data: task, error } = await db.from('tasks').insert({
        user_id: adminSession.user.id,
        title
    }).select().maybeSingle();

    if (error || !task) return;

    if (templateId) {
        const { data: templateSteps } = await db
            .from('task_template_steps')
            .select('*')
            .eq('template_id', templateId)
            .order('position');

        if (templateSteps && templateSteps.length > 0) {
            await db.from('task_steps').insert(
                templateSteps.map(s => ({
                    user_id: adminSession.user.id,
                    task_id: task.id,
                    title: s.title,
                    position: s.position
                }))
            );
        }
    }

    closeNewTaskModal();
    await loadTasks();
}

// ── VORLAGEN ──────────────────────────────────────────────

function openNewTemplateModal() {
    document.getElementById('new-template-title').value = '';
    document.getElementById('new-template-error').style.display = 'none';
    newTemplateSteps = [];
    renderTemplateSteps();
    document.getElementById('new-template-modal').classList.add('active');
}

function closeNewTemplateModal() {
    document.getElementById('new-template-modal').classList.remove('active');
}

function addTemplateStep() {
    const input = document.getElementById('new-template-step-input');
    const title = input.value.trim();
    if (!title) return;
    newTemplateSteps.push(title);
    input.value = '';
    renderTemplateSteps();
}

function removeTemplateStep(index) {
    newTemplateSteps.splice(index, 1);
    renderTemplateSteps();
}

function renderTemplateSteps() {
    const container = document.getElementById('template-steps-list');
    if (newTemplateSteps.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light);">Noch keine Schritte.</div>';
        return;
    }
    container.innerHTML = newTemplateSteps.map((s, i) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--color-border); font-size:0.85rem;">
            <span>${i + 1}. ${s}</span>
            <button onclick="removeTemplateStep(${i})" style="background:none; border:none; color:var(--color-text-light); cursor:pointer;">✕</button>
        </div>
    `).join('');
}

async function submitNewTemplate() {
    const title = document.getElementById('new-template-title').value.trim();
    const errorDiv = document.getElementById('new-template-error');
    errorDiv.style.display = 'none';

    if (!title) {
        errorDiv.textContent = 'Bitte Name eingeben.';
        errorDiv.style.display = 'block';
        return;
    }

    if (newTemplateSteps.length === 0) {
        errorDiv.textContent = 'Bitte mindestens einen Schritt hinzufügen.';
        errorDiv.style.display = 'block';
        return;
    }

    const { data: template, error } = await db.from('task_templates').insert({
        user_id: adminSession.user.id,
        title
    }).select().maybeSingle();

    if (error || !template) return;

    await db.from('task_template_steps').insert(
        newTemplateSteps.map((s, i) => ({
            user_id: adminSession.user.id,
            template_id: template.id,
            title: s,
            position: i
        }))
    );

    closeNewTemplateModal();
    await loadTasks();
}

async function loadTaskTemplates() {
    const { data: templates } = await db
        .from('task_templates')
        .select('*, task_template_steps(*)')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: false });

    const container = document.getElementById('templates-list');
    if (!templates || templates.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Vorlagen vorhanden.</p></div>';
        return;
    }

    container.innerHTML = templates.map(t => {
        const steps = (t.task_template_steps || []).sort((a, b) => a.position - b.position);
        return `
            <div style="background:var(--color-gray); border-radius:12px; padding:1rem 1.25rem; margin-bottom:0.75rem; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:700;">${t.title}</div>
                    <div style="font-size:0.8rem; color:var(--color-text-light);">${steps.length} Schritte</div>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-small btn-pdf-view btn-icon" onclick="editTaskTemplate('${t.id}')">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-small btn-delete btn-icon" onclick="deleteTemplate('${t.id}')">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </div>`;
    }).join('');
}

async function deleteTemplate(templateId) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    await db.from('task_templates').delete().eq('id', templateId);
    await loadTasks();
}

function useTemplate(templateId, templateTitle) {
    document.getElementById('new-task-title').value = templateTitle;
    document.getElementById('new-task-template-id').value = templateId;
    document.getElementById('new-task-error').style.display = 'none';
    document.getElementById('new-task-modal').classList.add('active');
}

async function editTaskTemplate(templateId) {
    editTemplateId = templateId;
    const { data: template } = await db
        .from('task_templates')
        .select('*, task_template_steps(*)')
        .eq('id', templateId)
        .maybeSingle();

    if (!template) return;

    document.getElementById('edit-template-title').value = template.title;
    editTemplateSteps = (template.task_template_steps || [])
        .sort((a, b) => a.position - b.position)
        .map(s => ({ id: s.id, title: s.title }));
    renderEditTemplateSteps();
    document.getElementById('edit-task-template-modal').classList.add('active');
}

function closeEditTaskTemplateModal() {
    document.getElementById('edit-task-template-modal').classList.remove('active');
}

function renderEditTemplateSteps() {
    const container = document.getElementById('edit-template-steps-list');
    if (editTemplateSteps.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.5rem;">Noch keine Schritte.</div>';
        return;
    }
    container.innerHTML = editTemplateSteps.map((s, i) => `
        <div style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid var(--color-border);">
            <div style="display:flex; flex-direction:column; gap:0.2rem;">
                ${i > 0 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="moveTemplateStep(${i}, -1)">
                    <svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
                </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
                ${i < editTemplateSteps.length - 1 ? `<button class="btn-small btn-pdf-view btn-icon" style="width:1.8rem; height:1.8rem;" onclick="moveTemplateStep(${i}, 1)">
                    <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>` : `<div style="width:1.8rem; height:1.8rem;"></div>`}
            </div>
            <span style="flex:1; font-size:0.85rem; word-break:break-word;">${s.title}</span>
            <button class="btn-small btn-pdf-view btn-icon" style="width:2rem; height:2rem; flex-shrink:0;" onclick="editTemplateStep(${i})">
                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-small btn-pdf-view btn-icon" style="width:2rem; height:2rem; flex-shrink:0;" onclick="removeEditTemplateStep(${i})">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
        </div>
    `).join('');
}

function moveTemplateStep(index, direction) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= editTemplateSteps.length) return;
    const temp = editTemplateSteps[index];
    editTemplateSteps[index] = editTemplateSteps[swapIndex];
    editTemplateSteps[swapIndex] = temp;
    renderEditTemplateSteps();
}

function editTemplateStep(index) {
    const newTitle = prompt('Schritt bearbeiten:', editTemplateSteps[index].title);
    if (!newTitle || !newTitle.trim()) return;
    editTemplateSteps[index].title = newTitle.trim();
    renderEditTemplateSteps();
}

function addEditTemplateStep() {
    const input = document.getElementById('edit-template-step-input');
    const title = input.value.trim();
    if (!title) return;
    editTemplateSteps.push({ id: null, title });
    input.value = '';
    renderEditTemplateSteps();
}

function removeEditTemplateStep(index) {
    editTemplateSteps.splice(index, 1);
    renderEditTemplateSteps();
}

async function submitEditTaskTemplate() {
    const title = document.getElementById('edit-template-title').value.trim();
    if (!title) return;

    await db.from('task_templates').update({ title }).eq('id', editTemplateId);

    await db.from('task_template_steps').delete().eq('template_id', editTemplateId);
    if (editTemplateSteps.length > 0) {
        await db.from('task_template_steps').insert(
            editTemplateSteps.map((s, i) => ({
                user_id: adminSession.user.id,
                template_id: editTemplateId,
                title: s.title,
                position: i
            }))
        );
    }

    closeEditTaskTemplateModal();
    await loadTasks();
}

function updateEditTemplateStep(index, value) {
    editTemplateSteps[index].title = value;
}

// ── NOTIZEN ───────────────────────────────────────────────

async function loadNotes() {
    const { data: notes } = await db
        .from('notes')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .order('updated_at', { ascending: false });

    const container = document.getElementById('notes-list');
    if (!notes || notes.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Notizen vorhanden.</p></div>';
        return;
    }

    container.innerHTML = notes.map(n => `
        <div style="background:var(--color-gray); border-radius:12px; padding:1rem 1.25rem; margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                <div style="font-weight:700; font-size:1rem;">${n.title}</div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn-small btn-pdf-view btn-icon" onclick="openEditNoteModal('${n.id}', \`${n.title.replace(/`/g, '\\`')}\`, \`${(n.content || '').replace(/`/g, '\\`')}\`)">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-small btn-delete btn-icon" onclick="deleteNote('${n.id}')">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </div>
            <div style="font-size:0.85rem; color:var(--color-text-light); white-space:pre-wrap;">${n.content || ''}</div>
            <div style="font-size:0.75rem; color:var(--color-text-light); margin-top:0.5rem;">${new Date(n.updated_at).toLocaleDateString('de-DE')}</div>
        </div>
    `).join('');
}

function openNewNoteModal() {
    editNoteId = null;
    document.getElementById('note-modal-title').textContent = 'Neue Notiz';
    document.getElementById('note-title').value = '';
    document.getElementById('note-content').value = '';
    document.getElementById('note-error').style.display = 'none';
    document.getElementById('note-modal').classList.add('active');
}

function openEditNoteModal(id, title, content) {
    editNoteId = id;
    document.getElementById('note-modal-title').textContent = 'Notiz bearbeiten';
    document.getElementById('note-title').value = title;
    document.getElementById('note-content').value = content;
    document.getElementById('note-error').style.display = 'none';
    document.getElementById('note-modal').classList.add('active');
}

function closeNoteModal() {
    document.getElementById('note-modal').classList.remove('active');
}

async function submitNote() {
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-content').value.trim();
    const errorDiv = document.getElementById('note-error');
    errorDiv.style.display = 'none';

    if (!title) {
        errorDiv.textContent = 'Bitte Titel eingeben.';
        errorDiv.style.display = 'block';
        return;
    }

    if (editNoteId) {
        await db.from('notes').update({
            title, content,
            updated_at: new Date().toISOString()
        }).eq('id', editNoteId);
    } else {
        await db.from('notes').insert({
            user_id: adminSession.user.id,
            title, content
        });
    }

    closeNoteModal();
    await loadNotes();
}

async function deleteNote(id) {
    if (!confirm('Notiz wirklich löschen?')) return;
    await db.from('notes').delete().eq('id', id);
    await loadNotes();
}

// ── TEAM-AUFGABEN ─────────────────────────────────────────

let editTeamTaskId = null;
let teamTaskMode   = 'general';

async function openTeamTaskModal(task, mode) {
    editTeamTaskId = task ? task.id : null;
    teamTaskMode   = mode === 'personal' ? 'personal' : 'general';

    document.getElementById('team-task-title').value        = task?.title           || '';
    document.getElementById('team-task-description').value  = task?.description     || '';
    document.getElementById('team-task-due-date').value     = task?.due_date        || '';
    document.getElementById('team-task-repeat').value       = task?.repeat_interval || '';
    document.getElementById('team-task-repeat-every').value = task?.repeat_every    || '';
    document.getElementById('team-task-repeat-every-group').style.display =
        task?.repeat_interval === 'custom' ? 'block' : 'none';

    const empGroup = document.getElementById('team-task-employees-group');
    const empList  = document.getElementById('team-task-employees-list');
    if (teamTaskMode === 'personal') {
        const [{ data: emps }, { data: assignments }] = await Promise.all([
            db.from('employees_planit').select('id, name').eq('user_id', adminSession.user.id).eq('is_active', true).order('name'),
            editTeamTaskId
                ? db.from('task_assignments').select('employee_id').eq('task_id', editTeamTaskId)
                : Promise.resolve({ data: [] }),
        ]);
        const assignedIds = new Set((assignments || []).map(a => a.employee_id));
        empList.innerHTML = (emps || []).map(e => `
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.9rem; cursor:pointer; padding:0.3rem 0;">
                <input type="checkbox" value="${e.id}"${assignedIds.has(e.id) ? ' checked' : ''} style="width:16px; height:16px; cursor:pointer;">
                ${e.name}
            </label>`).join('');
        empGroup.style.display = 'block';
    } else {
        empList.innerHTML = '';
        empGroup.style.display = 'none';
    }

    document.getElementById('team-task-modal').classList.add('active');
}

async function submitTeamTask() {
    const title          = document.getElementById('team-task-title').value.trim();
    const description    = document.getElementById('team-task-description').value.trim();
    const dueDate        = document.getElementById('team-task-due-date').value || null;
    const repeatInterval = document.getElementById('team-task-repeat').value || null;
    const repeatEveryRaw = document.getElementById('team-task-repeat-every').value;
    const repeatEvery    = repeatInterval === 'custom' ? (parseInt(repeatEveryRaw) || null) : null;

    if (!title) { alert('Bitte einen Titel eingeben.'); return; }

    const payload = {
        title,
        description:     description || null,
        due_date:        dueDate,
        repeat_interval: repeatInterval,
        repeat_every:    repeatEvery,
    };

    let taskId = editTeamTaskId;
    let error;
    if (editTeamTaskId) {
        ({ error } = await db.from('tasks').update(payload).eq('id', editTeamTaskId));
    } else {
        const { data: inserted, error: insertError } = await db
            .from('tasks')
            .insert({ ...payload, user_id: adminSession.user.id, type: teamTaskMode })
            .select('id')
            .single();
        error = insertError;
        if (!error) taskId = inserted.id;
    }

    if (error) { alert('Fehler beim Speichern: ' + error.message); return; }

    if (teamTaskMode === 'personal' && taskId) {
        const checked = [...document.querySelectorAll('#team-task-employees-list input[type=checkbox]:checked')]
            .map(cb => ({ task_id: taskId, employee_id: cb.value }));
        await db.from('task_assignments').delete().eq('task_id', taskId);
        if (checked.length) await db.from('task_assignments').insert(checked);
    }

    editTeamTaskId = null;
    document.getElementById('team-task-modal').classList.remove('active');
    document.getElementById('team-task-title').value = '';
    document.getElementById('team-task-description').value = '';
    document.getElementById('team-task-due-date').value = '';
    document.getElementById('team-task-repeat').value = '';
    document.getElementById('team-task-repeat-every').value = '';
    document.getElementById('team-task-repeat-every-group').style.display = 'none';
    document.getElementById('team-task-employees-list').innerHTML = '';
    document.getElementById('team-task-employees-group').style.display = 'none';

    loadTeamTasks();
}

async function archiveTeamTask(id) {
    await db.from('tasks').update({ is_archived: true }).eq('id', id);
    loadTeamTasks();
}

async function deleteTeamTask(id) {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    await db.from('tasks').delete().eq('id', id);
    loadTeamTasks();
}

async function loadTeamTasks() {
    const [
        { data: generalTasks },
        { data: personalTasks },
        { data: emps },
        { data: allAssignments },
    ] = await Promise.all([
        db.from('tasks').select('*').eq('user_id', adminSession.user.id).eq('type', 'general').eq('is_archived', false).order('created_at', { ascending: false }),
        db.from('tasks').select('*').eq('user_id', adminSession.user.id).eq('type', 'personal').eq('is_archived', false).order('created_at', { ascending: false }),
        db.from('employees_planit').select('id, name').eq('user_id', adminSession.user.id).eq('is_active', true),
        db.from('task_assignments').select('task_id, employee_id'),
    ]);

    const empMap = Object.fromEntries((emps || []).map(e => [e.id, e.name]));
    const assignMap = {};
    for (const a of (allAssignments || [])) {
        if (!assignMap[a.task_id]) assignMap[a.task_id] = [];
        assignMap[a.task_id].push(empMap[a.employee_id] || 'Unbekannt');
    }

    const repeatLabel = r => ({ daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' }[r] || null);

    const renderTaskCard = (t, mode) => {
        const dateStr = t.due_date
            ? new Date(t.due_date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
            : null;
        const repeat = t.repeat_interval === 'custom' && t.repeat_every
            ? `Alle ${t.repeat_every} Tage`
            : repeatLabel(t.repeat_interval);
        const taskJson = JSON.stringify(t).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        const assignedNames = mode === 'personal' ? (assignMap[t.id] || []) : [];
        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.25rem;">
                <div style="font-weight:700; font-size:0.95rem;">${t.title}</div>
                <div style="display:flex; gap:0.5rem; flex-shrink:0; margin-left:0.5rem;">
                    <button class="btn-small btn-pdf-view btn-icon" onclick='openTeamTaskModal(${taskJson}, "${mode}")'>
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-small btn-pdf-view btn-icon" onclick="archiveTeamTask('${t.id}')">
                        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <button class="btn-small btn-delete btn-icon" onclick="deleteTeamTask('${t.id}')">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </div>
            ${assignedNames.length ? `<div style="font-size:0.8rem; color:var(--color-primary); font-weight:600; margin-bottom:0.2rem;">Zugewiesen an: ${assignedNames.join(', ')}</div>` : ''}
            ${t.description ? `<div style="font-size:0.85rem; color:var(--color-text-light); margin-bottom:0.25rem;">${t.description}</div>` : ''}
            ${dateStr ? `<div style="font-size:0.8rem; color:var(--color-text-light);">Fällig: ${dateStr}</div>` : ''}
            ${repeat ? `<div style="font-size:0.8rem; color:var(--color-text-light);">${repeat}</div>` : ''}
        </div>`;
    };

    const generalContainer = document.getElementById('general-tasks-list');
    if (generalContainer) {
        generalContainer.innerHTML = (generalTasks && generalTasks.length > 0)
            ? generalTasks.map(t => renderTaskCard(t, 'general')).join('')
            : '<div style="font-size:0.85rem; color:var(--color-text-light); padding:0.5rem 0;">Keine allgemeinen Aufgaben vorhanden.</div>';
    }

    const personalContainer = document.getElementById('personal-tasks-list');
    if (personalContainer) {
        personalContainer.innerHTML = (personalTasks && personalTasks.length > 0)
            ? personalTasks.map(t => renderTaskCard(t, 'personal')).join('')
            : '<div style="font-size:0.85rem; color:var(--color-text-light); padding:0.5rem 0;">Keine persönlichen Aufgaben vorhanden.</div>';
    }
}
