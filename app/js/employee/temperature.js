// ── TEMPERATURKONTROLLE (Mitarbeiter) ─────────────────────

async function loadEmployeeTemperature() {
    const today   = new Date().toISOString().split('T')[0];
    const dateEl  = document.getElementById('emp-temperature-date');
    if (dateEl && !dateEl.value) dateEl.value = today;
    const dateStr = dateEl?.value || today;

    const [{ data: devices }, { data: logs }] = await Promise.all([
        db.from('temperature_devices').select('*').eq('user_id', currentEmployee.user_id).order('name'),
        db.from('temperature_logs').select('*').eq('user_id', currentEmployee.user_id).eq('log_date', dateStr),
    ]);

    const container = document.getElementById('emp-temperature-list');
    if (!devices || devices.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Keine Geräte konfiguriert.</p></div>';
        return;
    }

    container.innerHTML = devices.map(dev => {
        const log        = (logs || []).find(l => l.device_id === dev.id);
        const temp       = log?.temperature ?? '';
        const note       = log?.note ?? '';
        const logId      = log?.id ?? '';
        const outOfRange = log && log.temperature !== null && (
            (dev.temp_min !== null && log.temperature < dev.temp_min) ||
            (dev.temp_max !== null && log.temperature > dev.temp_max)
        );
        const rangeHint = (dev.temp_min !== null || dev.temp_max !== null)
            ? `<span style="font-size:0.75rem;color:var(--color-text-light);margin-left:0.5rem;">(Soll: ${dev.temp_min ?? '–'}°C – ${dev.temp_max ?? '–'}°C)</span>`
            : '';

        return `
        <div class="card" style="margin-bottom:0.75rem;">
            <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.5rem;color:${outOfRange ? '#E57373' : 'var(--color-text)'};">
                ${dev.name}${rangeHint}
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;">
                <input type="number" step="0.1"
                    id="emp-temp-input-${dev.id}"
                    value="${temp}"
                    placeholder="°C"
                    style="width:90px;padding:0.4rem 0.6rem;border:1.5px solid ${outOfRange ? '#E57373' : 'var(--color-border)'};border-radius:8px;font-size:0.9rem;background:${outOfRange ? '#FFF0F0' : 'white'};"
                    onchange="saveEmpTemperatureLog('${dev.id}','${dateStr}',this.value,document.getElementById('emp-temp-note-${dev.id}').value,'${logId}')">
                <input type="text"
                    id="emp-temp-note-${dev.id}"
                    value="${note}"
                    placeholder="Notiz (optional)"
                    style="flex:1;padding:0.4rem 0.6rem;border:1.5px solid var(--color-border);border-radius:8px;font-size:0.9rem;"
                    onchange="saveEmpTemperatureLog('${dev.id}','${dateStr}',document.getElementById('emp-temp-input-${dev.id}').value,this.value,'${logId}')">
            </div>
        </div>`;
    }).join('');
}

async function saveEmpTemperatureLog(deviceId, dateStr, tempValue, noteValue, logId) {
    const temp = tempValue !== '' && tempValue !== null ? parseFloat(tempValue) : null;
    const note = noteValue || null;

    if (logId) {
        await db.from('temperature_logs').update({ temperature: temp, note }).eq('id', logId);
    } else {
        const { data } = await db.from('temperature_logs').insert({
            user_id:     currentEmployee.user_id,
            device_id:   deviceId,
            log_date:    dateStr,
            temperature: temp,
            note,
        }).select().maybeSingle();
        if (data) {
            const inputEl = document.getElementById(`emp-temp-input-${deviceId}`);
            const noteEl  = document.getElementById(`emp-temp-note-${deviceId}`);
            if (inputEl) inputEl.setAttribute('onchange', `saveEmpTemperatureLog('${deviceId}','${dateStr}',this.value,document.getElementById('emp-temp-note-${deviceId}').value,'${data.id}')`);
            if (noteEl)  noteEl.setAttribute('onchange',  `saveEmpTemperatureLog('${deviceId}','${dateStr}',document.getElementById('emp-temp-input-${deviceId}').value,this.value,'${data.id}')`);
        }
    }

    const inputEl = document.getElementById(`emp-temp-input-${deviceId}`);
    if (inputEl && temp !== null) {
        const { data: dev } = await db.from('temperature_devices').select('temp_min,temp_max').eq('id', deviceId).maybeSingle();
        if (dev) {
            const outOfRange = (dev.temp_min !== null && temp < dev.temp_min) ||
                               (dev.temp_max !== null && temp > dev.temp_max);
            inputEl.style.borderColor = outOfRange ? '#E57373' : 'var(--color-border)';
            inputEl.style.background  = outOfRange ? '#FFF0F0' : 'white';
        }
    }
}

function onEmpTemperatureDateChange() {
    loadEmployeeTemperature();
}
