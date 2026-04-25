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
                <div style="font-size:0.85rem;font-weight:600;margin-bottom:0.3rem;color:${outOfRange ? '#E57373' : 'var(--color-text)'};">
                    ${dev.name}${rangeHint}
                </div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <input type="number" step="0.1"
                        id="temp-input-${dev.id}-${dateStr}"
                        value="${temp}"
                        placeholder="°C"
                        style="width:90px;padding:0.4rem 0.6rem;border:1.5px solid ${outOfRange ? '#E57373' : 'var(--color-border)'};border-radius:8px;font-size:0.9rem;background:${outOfRange ? '#FFF0F0' : 'white'};"
                        onchange="saveTemperatureLog('${dev.id}','${dateStr}',this.value,document.getElementById('temp-note-${dev.id}-${dateStr}').value,'${logId}')">
                    <input type="text"
                        id="temp-note-${dev.id}-${dateStr}"
                        value="${note}"
                        placeholder="Notiz (optional)"
                        style="flex:1;padding:0.4rem 0.6rem;border:1.5px solid var(--color-border);border-radius:8px;font-size:0.9rem;"
                        onchange="saveTemperatureLog('${dev.id}','${dateStr}',document.getElementById('temp-input-${dev.id}-${dateStr}').value,this.value,'${logId}')">
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

async function saveTemperatureLog(deviceId, dateStr, tempValue, noteValue, logId) {
    const temp = tempValue !== '' && tempValue !== null ? parseFloat(tempValue) : null;
    const note = noteValue || null;

    if (logId) {
        await db.from('temperature_logs').update({ temperature: temp, note }).eq('id', logId);
    } else {
        const { data } = await db.from('temperature_logs').insert({
            user_id:   adminSession.user.id,
            device_id: deviceId,
            log_date:  dateStr,
            temperature: temp,
            note,
        }).select().maybeSingle();
        if (data) {
            const inputEl = document.getElementById(`temp-input-${deviceId}-${dateStr}`);
            const noteEl  = document.getElementById(`temp-note-${deviceId}-${dateStr}`);
            if (inputEl) inputEl.setAttribute('onchange', `saveTemperatureLog('${deviceId}','${dateStr}',this.value,document.getElementById('temp-note-${deviceId}-${dateStr}').value,'${data.id}')`);
            if (noteEl)  noteEl.setAttribute('onchange',  `saveTemperatureLog('${deviceId}','${dateStr}',document.getElementById('temp-input-${deviceId}-${dateStr}').value,this.value,'${data.id}')`);
        }
    }

    const dev = temperatureDevices.find(d => d.id === deviceId);
    if (dev && temp !== null) {
        const outOfRange = (dev.temp_min !== null && temp < dev.temp_min) ||
                           (dev.temp_max !== null && temp > dev.temp_max);
        const inputEl = document.getElementById(`temp-input-${deviceId}-${dateStr}`);
        if (inputEl) {
            inputEl.style.borderColor = outOfRange ? '#E57373' : 'var(--color-border)';
            inputEl.style.background  = outOfRange ? '#FFF0F0' : 'white';
        }
    }
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
    const firstDay  = document.getElementById('temperature-pdf-from')?.value;
    const lastDay   = document.getElementById('temperature-pdf-to')?.value;
    if (!firstDay || !lastDay || firstDay > lastDay) { alert('Bitte gültigen Zeitraum auswählen.'); return; }

    const rangeLabel = `${new Date(firstDay + 'T12:00:00').toLocaleDateString('de-DE')} – ${new Date(lastDay + 'T12:00:00').toLocaleDateString('de-DE')}`;

    const [{ data: devices }, { data: logs }] = await Promise.all([
        db.from('temperature_devices').select('*').eq('user_id', adminSession.user.id).order('created_at', { ascending: true }),
        db.from('temperature_logs').select('*').eq('user_id', adminSession.user.id).gte('log_date', firstDay).lte('log_date', lastDay),
    ]);

    if (!devices || devices.length === 0) { alert('Keine Geräte konfiguriert.'); return; }

    // Build list of all dates in range
    const allDates = [];
    for (let d = new Date(firstDay + 'T12:00:00'); d.toISOString().split('T')[0] <= lastDay; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Temperaturkontrolle', 15, 20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(rangeLabel, 190, 20, { align: 'right' });

    let y = 35;

    for (const dev of devices) {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const rangeStr = (dev.temp_min !== null || dev.temp_max !== null)
            ? ` (Soll: ${dev.temp_min ?? '–'}°C – ${dev.temp_max ?? '–'}°C)` : '';
        doc.text(`${dev.name}${rangeStr}`, 15, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        for (const dateStr of allDates) {
            const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
            const log = (logs || []).find(l => l.device_id === dev.id && l.log_date === dateStr);
            const tempStr = log?.temperature !== null && log?.temperature !== undefined ? `${log.temperature}°C` : '–';
            const noteStr = log?.note ? `  (${log.note})` : '';
            const outOfRange = log && log.temperature !== null && (
                (dev.temp_min !== null && log.temperature < dev.temp_min) ||
                (dev.temp_max !== null && log.temperature > dev.temp_max)
            );
            if (outOfRange) doc.setTextColor(200, 50, 50);
            doc.text(`${dateLabel}   ${tempStr}${noteStr}`, 20, y);
            if (outOfRange) doc.setTextColor(0, 0, 0);
            y += 5;
            if (y > 275) { doc.addPage(); y = 20; }
        }
        y += 5;
    }

    doc.save(`Temperaturkontrolle_${firstDay}_${lastDay}.pdf`);
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
                    <div style="font-size:0.8rem;color:var(--color-text-light);margin-top:0.2rem;">Soll: ${rangeStr}</div>
                </div>
                <div style="display:flex;gap:0.4rem;">
                    <button class="btn-small btn-pdf-view btn-icon" onclick="openEditTemperatureDeviceModal('${d.id}','${d.name.replace(/'/g,"\\'")}',${d.temp_min ?? ''},${d.temp_max ?? ''})" title="Bearbeiten">
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

function openEditTemperatureDeviceModal(id, name, min, max) {
    document.getElementById('edit-device-id').value   = id;
    document.getElementById('edit-device-name').value = name;
    document.getElementById('edit-device-min').value  = min !== undefined && min !== '' ? min : '';
    document.getElementById('edit-device-max').value  = max !== undefined && max !== '' ? max : '';
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
    await db.from('temperature_devices').update({
        name,
        temp_min: minVal !== '' ? parseFloat(minVal) : null,
        temp_max: maxVal !== '' ? parseFloat(maxVal) : null,
    }).eq('id', id);
    closeEditTemperatureDeviceModal();
    loadTemperatureConfig();
}

async function addTemperatureDevice() {
    const nameInput = document.getElementById('new-device-name');
    const minInput  = document.getElementById('new-device-min');
    const maxInput  = document.getElementById('new-device-max');
    const name = nameInput?.value.trim();
    if (!name) { alert('Bitte Gerätename eingeben.'); return; }

    await db.from('temperature_devices').insert({
        user_id:  adminSession.user.id,
        name,
        temp_min: minInput?.value !== '' ? parseFloat(minInput.value) : null,
        temp_max: maxInput?.value !== '' ? parseFloat(maxInput.value) : null,
    });

    if (nameInput) nameInput.value = '';
    if (minInput)  minInput.value  = '';
    if (maxInput)  maxInput.value  = '';
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
