// ── TEMPERATURKONTROLLE ───────────────────────────────────

let temperatureDate    = new Date();
let temperatureDevices = [];

function changeTemperatureMonth(dir) {
    temperatureDate.setMonth(temperatureDate.getMonth() + dir);
    loadTemperature();
}

async function loadTemperature() {
    const year     = temperatureDate.getFullYear();
    const month    = temperatureDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const firstDay = `${monthStr}-01`;
    const lastDay  = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const label    = temperatureDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    document.getElementById('temperature-month-label').textContent = label;

    const [{ data: devices }, { data: logs }] = await Promise.all([
        db.from('temperature_devices').select('*').eq('user_id', adminSession.user.id).order('created_at', { ascending: true }),
        db.from('temperature_logs').select('*').eq('user_id', adminSession.user.id).gte('log_date', firstDay).lte('log_date', lastDay),
    ]);

    temperatureDevices = devices || [];

    const container = document.getElementById('temperature-days-list');
    if (temperatureDevices.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Geräte konfiguriert. Bitte zuerst Geräte anlegen.</p></div>';
        return;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const allDates    = [];
    for (let d = 1; d <= daysInMonth; d++) {
        allDates.push(`${monthStr}-${String(d).padStart(2, '0')}`);
    }

    container.innerHTML = allDates.map(dateStr => {
        const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
        const dayLogs   = (logs || []).filter(l => l.log_date === dateStr);
        const allFilled = temperatureDevices.every(dev => dayLogs.some(l => l.device_id === dev.id && l.temperature !== null));
        const anyWarn   = dayLogs.some(l => {
            const dev = temperatureDevices.find(d => d.id === l.device_id);
            if (!dev || l.temperature === null) return false;
            return (dev.temp_min !== null && l.temperature < dev.temp_min) ||
                   (dev.temp_max !== null && l.temperature > dev.temp_max);
        });

        const statusDot = anyWarn
            ? `<span style="width:8px;height:8px;border-radius:50%;background:#E57373;display:inline-block;margin-right:0.4rem;"></span>`
            : allFilled
                ? `<span style="width:8px;height:8px;border-radius:50%;background:#6B8E6F;display:inline-block;margin-right:0.4rem;"></span>`
                : '';

        const deviceRows = temperatureDevices.map(dev => {
            const log     = dayLogs.find(l => l.device_id === dev.id);
            const temp    = log?.temperature ?? '';
            const note    = log?.note ?? '';
            const logId   = log?.id ?? '';
            const outOfRange = log && log.temperature !== null && (
                (dev.temp_min !== null && log.temperature < dev.temp_min) ||
                (dev.temp_max !== null && log.temperature > dev.temp_max)
            );
            const rangeHint = (dev.temp_min !== null || dev.temp_max !== null)
                ? `<span style="font-size:0.75rem;color:var(--color-text-light);margin-left:0.5rem;">(Soll: ${dev.temp_min ?? '–'}°C – ${dev.temp_max ?? '–'}°C)</span>`
                : '';

            return `
            <div style="margin-bottom:0.75rem;">
                <div style="margin-bottom:0.3rem;">
                    <span style="font-size:0.85rem;font-weight:600;color:${outOfRange ? '#E57373' : 'var(--color-text)'};">${dev.name}</span>${rangeHint}
                    ${dev.description ? `<div style="font-size:0.75rem;color:#888;">${dev.description}</div>` : ''}
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <input type="number" step="0.1"
                        id="temp-input-${dev.id}-${dateStr}"
                        value="${temp}"
                        placeholder="°C"
                        data-log-id="${logId}"
                        style="width:90px;padding:0.4rem 0.6rem;border:1.5px solid ${outOfRange ? '#E57373' : 'var(--color-border)'};border-radius:8px;font-size:0.9rem;background:${outOfRange ? '#FFF0F0' : 'white'};">
                    <input type="text"
                        id="temp-note-${dev.id}-${dateStr}"
                        value="${note}"
                        placeholder="Notiz (optional)"
                        style="flex:1;padding:0.4rem 0.6rem;border:1.5px solid var(--color-border);border-radius:8px;font-size:0.9rem;">
                </div>
            </div>`;
        }).join('');

        return `
        <div style="background:var(--color-gray);border-radius:12px;margin-bottom:0.75rem;overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;cursor:pointer;" onclick="toggleTemperatureDay('${dateStr}')">
                <div style="font-weight:600;">${statusDot}${dateLabel}</div>
                <span id="temperature-day-toggle-${dateStr}" style="color:var(--color-text-light);">▶</span>
            </div>
            <div id="temperature-day-body-${dateStr}" style="display:none;padding:0.75rem 1rem 1rem;background:white;border-top:1px solid var(--color-border);">
                ${deviceRows}
                <div style="display:flex;justify-content:center;margin-top:0.5rem;">
                    <button onclick="saveDayTemperatureLogs('${dateStr}')" style="width:40px;height:40px;border-radius:50%;border:none;background:#B28A6E;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleTemperatureDay(dateStr) {
    const body   = document.getElementById(`temperature-day-body-${dateStr}`);
    const toggle = document.getElementById(`temperature-day-toggle-${dateStr}`);
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

async function saveDayTemperatureLogs(dateStr) {
    for (const dev of temperatureDevices) {
        const inputEl = document.getElementById(`temp-input-${dev.id}-${dateStr}`);
        const noteEl  = document.getElementById(`temp-note-${dev.id}-${dateStr}`);
        if (!inputEl) continue;

        const tempValue = inputEl.value;
        const temp = tempValue !== '' ? parseFloat(tempValue) : null;
        const note = noteEl?.value || null;
        const logId = inputEl.dataset.logId;

        if (logId) {
            await db.from('temperature_logs').update({ temperature: temp, note }).eq('id', logId);
        } else {
            const { data } = await db.from('temperature_logs').insert({
                user_id:     adminSession.user.id,
                device_id:   dev.id,
                log_date:    dateStr,
                temperature: temp,
                note,
            }).select().maybeSingle();
            if (data) inputEl.dataset.logId = data.id;
        }

        if (temp !== null) {
            const outOfRange = (dev.temp_min !== null && temp < dev.temp_min) ||
                               (dev.temp_max !== null && temp > dev.temp_max);
            inputEl.style.borderColor = outOfRange ? '#E57373' : 'var(--color-border)';
            inputEl.style.background  = outOfRange ? '#FFF0F0' : 'white';
        }
    }
    showAdminToast('Gespeichert');
}

// ── PDF EXPORT ────────────────────────────────────────────

function openTemperaturePdfModal() {
    const year     = temperatureDate.getFullYear();
    const month    = temperatureDate.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const lastDay  = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const fromEl   = document.getElementById('temperature-pdf-from');
    const toEl     = document.getElementById('temperature-pdf-to');
    if (fromEl) fromEl.value = `${monthStr}-01`;
    if (toEl)   toEl.value   = lastDay;
    document.getElementById('temperature-pdf-modal').classList.add('open');
}

function closeTemperaturePdfModal() {
    document.getElementById('temperature-pdf-modal').classList.remove('open');
}

async function downloadTemperaturePdf() {
    const firstDay = document.getElementById('temperature-pdf-from')?.value;
    const lastDay  = document.getElementById('temperature-pdf-to')?.value;
    if (!firstDay || !lastDay || firstDay > lastDay) { alert('Bitte gültigen Zeitraum auswählen.'); return; }

    const dateObj     = new Date(firstDay + 'T12:00:00');
    const year        = dateObj.getFullYear();
    const month       = dateObj.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthLabel  = dateObj.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    const [{ data: devices }, { data: logs }] = await Promise.all([
        db.from('temperature_devices').select('*').eq('user_id', adminSession.user.id).order('created_at', { ascending: true }),
        db.from('temperature_logs').select('*').eq('user_id', adminSession.user.id).gte('log_date', firstDay).lte('log_date', lastDay),
    ]);

    if (!devices || devices.length === 0) { alert('Keine Geräte konfiguriert.'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const marginL = 10;
    const tableW  = 190;
    const dayColW = 10;
    const devColW = (tableW - dayColW) / devices.length;
    const fontSize = devColW >= 30 ? 9 : devColW >= 20 ? 8 : devColW >= 14 ? 7 : 6;
    const smallFs  = Math.max(fontSize - 1, 6);

    const tableY  = 26;
    const hRow1   = 6.5;
    const hRow2   = 4.5;
    const hRow3   = 4.5;
    const headerH = hRow1 + hRow2 + hRow3;
    const rowH    = (283 - tableY - headerH) / 31;

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Temperaturprotokoll', marginL, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(monthLabel, 200, 18, { align: 'right' });

    const tx = marginL;
    const ty = tableY;

    // Day column header (spans all 3 header rows)
    doc.rect(tx, ty, dayColW, headerH);
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'bold');
    doc.text('Tag', tx + dayColW / 2, ty + headerH / 2 + fontSize * 0.175, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    for (let i = 0; i < devices.length; i++) {
        const dev = devices[i];
        const cx  = tx + dayColW + i * devColW;

        doc.rect(cx, ty, devColW, hRow1);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', 'bold');
        const nameLine = doc.splitTextToSize(dev.name, devColW - 1.5)[0] || '';
        doc.text(nameLine, cx + devColW / 2, ty + hRow1 / 2 + fontSize * 0.175, { align: 'center' });
        doc.setFont('helvetica', 'normal');

        doc.rect(cx, ty + hRow1, devColW, hRow2);
        if (dev.description) {
            doc.setFontSize(smallFs);
            const descLine = doc.splitTextToSize(dev.description, devColW - 1.5)[0] || '';
            doc.text(descLine, cx + devColW / 2, ty + hRow1 + hRow2 / 2 + smallFs * 0.175, { align: 'center' });
        }

        doc.rect(cx, ty + hRow1 + hRow2, devColW, hRow3);
        const maxStr = (dev.temp_max !== null && dev.temp_max !== undefined)
            ? (dev.temp_max >= 0 ? '+' : '') + dev.temp_max + '°C'
            : '–';
        doc.setFontSize(smallFs);
        doc.text(maxStr, cx + devColW / 2, ty + hRow1 + hRow2 + hRow3 / 2 + smallFs * 0.175, { align: 'center' });
    }

    for (let day = 1; day <= 31; day++) {
        const ry      = ty + headerH + (day - 1) * rowH;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isValid = day <= daysInMonth;

        if (!isValid) {
            doc.setFillColor(245, 245, 245);
            doc.rect(tx, ry, tableW, rowH, 'F');
        }

        doc.rect(tx, ry, dayColW, rowH);
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isValid ? 'bold' : 'normal');
        doc.setTextColor(isValid ? 0 : 190, isValid ? 0 : 190, isValid ? 0 : 190);
        doc.text(String(day), tx + dayColW / 2, ry + rowH / 2 + fontSize * 0.175, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        for (let i = 0; i < devices.length; i++) {
            const dev = devices[i];
            const cx  = tx + dayColW + i * devColW;
            doc.rect(cx, ry, devColW, rowH);
            if (!isValid) continue;

            const log = (logs || []).find(l => l.device_id === dev.id && l.log_date === dateStr);
            if (!log || log.temperature === null || log.temperature === undefined) continue;

            const outOfRange = (
                (dev.temp_min !== null && dev.temp_min !== undefined && log.temperature < dev.temp_min) ||
                (dev.temp_max !== null && dev.temp_max !== undefined && log.temperature > dev.temp_max)
            );
            doc.setFontSize(fontSize);
            doc.setFont('helvetica', outOfRange ? 'bold' : 'normal');
            if (outOfRange) doc.setTextColor(200, 50, 50);
            doc.text(log.temperature + '°C', cx + devColW / 2, ry + rowH / 2 + fontSize * 0.175, { align: 'center' });
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
        }
    }

    const fileMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    doc.save(`Temperaturprotokoll_${fileMonth}.pdf`);
    closeTemperaturePdfModal();
}

// ── KONFIGURATION ─────────────────────────────────────────

async function loadTemperatureConfig() {
    const { data: devices } = await db
        .from('temperature_devices')
        .select('*')
        .eq('user_id', adminSession.user.id)
        .order('created_at', { ascending: true });

    renderTemperatureDevices(devices || []);
    loadTemperatureDelegation();
}

function renderTemperatureDevices(devices) {
    const container = document.getElementById('temperature-devices-list');
    if (devices.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Geräte vorhanden.</p></div>';
        return;
    }
    container.innerHTML = devices.map(d => {
        const rangeStr = (d.temp_min !== null || d.temp_max !== null)
            ? `${d.temp_min ?? '–'}°C – ${d.temp_max ?? '–'}°C`
            : '—';
        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-weight:600;">${d.name}</div>
                    ${d.description ? `<div style="font-size:0.8rem;color:#888;margin-top:0.1rem;">${d.description}</div>` : ''}
                    <div style="font-size:0.8rem;color:var(--color-text-light);margin-top:0.2rem;">Soll: ${rangeStr}</div>
                </div>
                <div style="display:flex;gap:0.4rem;">
                    <button class="btn-small btn-pdf-view btn-icon" onclick="openEditTemperatureDeviceModal('${d.id}','${d.name.replace(/'/g,"\\'")}',${d.temp_min ?? ''},${d.temp_max ?? ''},'${(d.description||'').replace(/'/g,"\\'")}')" title="Bearbeiten">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-small btn-pdf-view btn-icon" onclick="deleteTemperatureDevice('${d.id}')" title="Löschen">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function openEditTemperatureDeviceModal(id, name, min, max, description) {
    document.getElementById('edit-device-id').value          = id;
    document.getElementById('edit-device-name').value        = name;
    document.getElementById('edit-device-min').value         = min !== undefined && min !== '' ? min : '';
    document.getElementById('edit-device-max').value         = max !== undefined && max !== '' ? max : '';
    document.getElementById('edit-device-description').value = description || '';
    document.getElementById('temperature-device-modal').classList.add('open');
}

function closeEditTemperatureDeviceModal() {
    document.getElementById('temperature-device-modal').classList.remove('open');
}

async function saveEditTemperatureDevice() {
    const id   = document.getElementById('edit-device-id').value;
    const name = document.getElementById('edit-device-name').value.trim();
    if (!name) { alert('Bitte Gerätename eingeben.'); return; }
    const minVal = document.getElementById('edit-device-min').value;
    const maxVal = document.getElementById('edit-device-max').value;
    const desc   = document.getElementById('edit-device-description').value.trim();
    await db.from('temperature_devices').update({
        name,
        temp_min:    minVal !== '' ? parseFloat(minVal) : null,
        temp_max:    maxVal !== '' ? parseFloat(maxVal) : null,
        description: desc || null,
    }).eq('id', id);
    closeEditTemperatureDeviceModal();
    loadTemperatureConfig();
}

async function addTemperatureDevice() {
    const nameInput = document.getElementById('new-device-name');
    const minInput  = document.getElementById('new-device-min');
    const maxInput  = document.getElementById('new-device-max');
    const descInput = document.getElementById('new-device-description');
    const name = nameInput?.value.trim();
    if (!name) { alert('Bitte Gerätename eingeben.'); return; }

    await db.from('temperature_devices').insert({
        user_id:     adminSession.user.id,
        name,
        temp_min:    minInput?.value !== '' ? parseFloat(minInput.value) : null,
        temp_max:    maxInput?.value !== '' ? parseFloat(maxInput.value) : null,
        description: descInput?.value.trim() || null,
    });

    if (nameInput) nameInput.value = '';
    if (minInput)  minInput.value  = '';
    if (maxInput)  maxInput.value  = '';
    if (descInput) descInput.value = '';
    loadTemperatureConfig();
}

async function deleteTemperatureDevice(id) {
    if (!confirm('Gerät löschen? Alle gespeicherten Logs für dieses Gerät bleiben erhalten.')) return;
    await db.from('temperature_devices').delete().eq('id', id);
    loadTemperatureConfig();
}

async function updateTemperatureDevice(id, field, value) {
    await db.from('temperature_devices').update({
        [field]: value !== '' ? parseFloat(value) : null,
    }).eq('id', id);
}

// ── DELEGATION ────────────────────────────────────────────

function toggleTemperatureDelegation() {
    const body   = document.getElementById('temperature-delegation-body');
    const toggle = document.getElementById('temperature-delegation-toggle');
    const isOpen = body.style.display === 'block';
    body.style.display = isOpen ? 'none' : 'block';
    toggle.textContent = isOpen ? '▶' : '▼';
}

async function loadTemperatureDelegation() {
    const { data: employees } = await db
        .from('employees_planit')
        .select('id, name, can_do_temperature')
        .eq('user_id', adminSession.user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

    const container = document.getElementById('temperature-delegation-list');
    if (!employees || employees.length === 0) {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--color-text-light);">Keine Mitarbeiter vorhanden.</div>';
        return;
    }

    container.innerHTML = employees.map(e => `
        <label style="display:flex; align-items:center; gap:0.75rem; padding:0.4rem 0; border-bottom:1px solid var(--color-border); cursor:pointer;">
            <input type="checkbox" data-emp-id="${e.id}" ${e.can_do_temperature ? 'checked' : ''} style="width:1.1rem; height:1.1rem; accent-color:var(--color-primary); cursor:pointer;">
            <span style="font-size:0.9rem;">${e.name}</span>
        </label>
    `).join('');
}

async function saveTemperatureDelegation() {
    const checkboxes = document.querySelectorAll('#temperature-delegation-list input[data-emp-id]');
    for (const cb of checkboxes) {
        await db.from('employees_planit')
            .update({ can_do_temperature: cb.checked })
            .eq('id', cb.dataset.empId);
    }
    alert('Gespeichert!');
}
