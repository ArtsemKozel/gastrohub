// ── PROFIL ────────────────────────────────────────────────
function loadProfil() {
    document.getElementById('profil-name').textContent   = currentEmployee.name;
    document.getElementById('profil-number').textContent = currentEmployee.employee_number;
}

async function changePassword() {
    const newPass     = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const errorDiv    = document.getElementById('profil-error');
    const successDiv  = document.getElementById('profil-success');

    errorDiv.style.display   = 'none';
    successDiv.style.display = 'none';

    if (!newPass || !confirmPass) {
        errorDiv.textContent   = 'Bitte beide Felder ausfüllen.';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPass !== confirmPass) {
        errorDiv.textContent   = 'Passwörter stimmen nicht überein.';
        errorDiv.style.display = 'block';
        return;
    }
    if (newPass.length < 4) {
        errorDiv.textContent   = 'Passwort muss mindestens 4 Zeichen haben.';
        errorDiv.style.display = 'block';
        return;
    }

    const { error } = await db
        .from('employees_planit')
        .update({ password_hash: newPass })
        .eq('id', currentEmployee.id);

    if (error) {
        errorDiv.textContent   = 'Fehler beim Speichern.';
        errorDiv.style.display = 'block';
        return;
    }

    successDiv.textContent   = 'Passwort erfolgreich geändert! ✅';
    successDiv.style.display = 'block';
    document.getElementById('new-password').value    = '';
    document.getElementById('confirm-password').value = '';
}

// ── KÜNDIGUNG ─────────────────────────────────────────────
function initTerminationSignaturePad() {
    const canvas = document.getElementById('termination-signature-canvas');
    const ctx    = canvas.getContext('2d');
    canvas.width  = canvas.offsetWidth;
    canvas.height = 120;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Alte Listener entfernen via Clone
    const fresh = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(fresh, canvas);
    const ctx2 = fresh.getContext('2d');
    let drawing = false;
    fresh.addEventListener('pointerdown', e => { drawing = true; ctx2.beginPath(); ctx2.moveTo(e.offsetX, e.offsetY); });
    fresh.addEventListener('pointermove', e => { if (!drawing) return; ctx2.lineTo(e.offsetX, e.offsetY); ctx2.stroke(); });
    fresh.addEventListener('pointerup',    () => drawing = false);
    fresh.addEventListener('pointerleave', () => drawing = false);
}

function clearTerminationSignature() {
    const canvas = document.getElementById('termination-signature-canvas');
    const ctx    = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function openTerminationModal() {
    document.getElementById('termination-modal').classList.add('active');
    document.getElementById('termination-notice').style.display = 'none';
    document.getElementById('termination-error').style.display  = 'none';
    setTimeout(initTerminationSignaturePad, 50);

    const today     = new Date();
    const day       = today.getDate();
    const nextMonth = today.getMonth() + 1; // 0-based → nächster Monat
    const year      = today.getFullYear();
    const monthNames = ['Januar','Februar','März','April','Mai','Juni',
                        'Juli','August','September','Oktober','November','Dezember'];

    // Frühestmöglicher Termin: bis 15. → 15. nächsten Monat; ab 16. → letzter Tag nächsten Monat
    const minDate = day <= 15
        ? new Date(year, nextMonth, 15)
        : new Date(year, nextMonth + 1, 0);

    const label  = `${minDate.getDate()}. ${monthNames[minDate.getMonth()]} ${minDate.getFullYear()}`;
    const notice = document.getElementById('termination-notice');
    notice.textContent   = `Frühestmöglicher letzter Arbeitstag: ${label}`;
    notice.style.display = 'block';
}

function closeTerminationModal() {
    document.getElementById('termination-modal').classList.remove('active');
}

async function previewTermination() {
    const street   = document.getElementById('termination-street').value.trim();
    const zip      = document.getElementById('termination-zip').value.trim();
    const city     = document.getElementById('termination-city').value.trim();
    const date     = document.getElementById('termination-date').value;
    const reason   = document.getElementById('termination-reason').value.trim();
    const errorDiv = document.getElementById('termination-error');
    errorDiv.style.display = 'none';

    if (!street || !zip || !city || !date) {
        errorDiv.textContent   = 'Bitte Straße, PLZ, Ort und Datum ausfüllen.';
        errorDiv.style.display = 'block';
        return;
    }

    const [{ data: restaurant }, { data: emp }] = await Promise.all([
        db.from('planit_restaurants').select('*').eq('user_id', currentEmployee.user_id).maybeSingle(),
        db.from('employees_planit').select('name').eq('id', currentEmployee.id).maybeSingle(),
    ]);

    const empName    = emp?.name || currentEmployee.name || '';
    const restName   = restaurant?.name   || '[Restaurant-Name]';
    const restStreet = restaurant?.street || '';
    const restZip    = restaurant?.zip    || '';
    const restCity   = restaurant?.city   || '';
    const restAddress = [restStreet, `${restZip} ${restCity}`.trim()].filter(Boolean).join('\n');

    const lastDay  = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
    const todayStr = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

    const textBefore = [
        empName,
        street,
        `${zip} ${city}`,
        ``,
        restName,
        restAddress,
        ``,
        ``,
        `${city}, ${todayStr}`,
        ``,
        `Betreff: Kündigung meines Arbeitsverhältnisses`,
        ``,
        `Sehr geehrte Damen und Herren,`,
        ``,
        `hiermit kündige ich mein Arbeitsverhältnis mit ${restName} fristgemäß zum ${lastDay}.`,
        reason ? `\nGrund: ${reason}` : '',
        ``,
        `Ich bitte um eine schriftliche Bestätigung des Kündigungseingangs sowie des letzten Arbeitstages.`,
        ``,
        `Mit freundlichen Grüßen`,
    ].filter(l => l !== undefined).join('\n');

    const textAfter = `\n_________________________\n${empName}`;

    // Unterschrift auslesen
    const sigCanvas = document.getElementById('termination-signature-canvas');
    let sigDataUrl = null;
    try {
        const dataUrl = sigCanvas.toDataURL('image/png');
        const blank   = document.createElement('canvas');
        blank.width   = sigCanvas.width;
        blank.height  = sigCanvas.height;
        if (dataUrl !== blank.toDataURL('image/png')) sigDataUrl = dataUrl;
    } catch(e) {}

    const body = document.getElementById('termination-preview-body');
    const esc  = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    body.innerHTML =
        `<span style="white-space:pre-wrap;">${esc(textBefore)}</span>` +
        (sigDataUrl ? `<br><img src="${sigDataUrl}" style="max-width:180px; display:block; margin:2rem 0 0;">` : ``) +
        `<span style="white-space:pre-wrap;">${esc(textAfter)}</span>`;

    document.getElementById('termination-preview-signature').style.display = 'none';
    document.getElementById('termination-preview-modal').classList.add('active');
}

async function submitTermination() {
    const street   = document.getElementById('termination-street').value.trim();
    const zip      = document.getElementById('termination-zip').value.trim();
    const city     = document.getElementById('termination-city').value.trim();
    const date     = document.getElementById('termination-date').value;
    const reason   = document.getElementById('termination-reason').value.trim();
    const errorDiv = document.getElementById('termination-error');
    errorDiv.style.display = 'none';

    if (!street || !zip || !city || !date) {
        errorDiv.textContent   = 'Bitte Straße, PLZ, Ort und Datum ausfüllen.';
        errorDiv.style.display = 'block';
        return;
    }

    // Mindesttermin prüfen (nicht blockierend — Hinweis, kein Hard-Stop)
    const today     = new Date();
    const day       = today.getDate();
    const nextMonth = today.getMonth() + 1;
    const minDate   = day <= 15
        ? new Date(today.getFullYear(), nextMonth, 15)
        : new Date(today.getFullYear(), nextMonth + 1, 0);
    const minDateStr = minDate.toISOString().split('T')[0];

    if (date < minDateStr) {
        const { data: empData } = await db
            .from('employees_planit')
            .select('notice_period_weeks')
            .eq('id', currentEmployee.id)
            .maybeSingle();
        const weeks      = empData?.notice_period_weeks || 4;
        const monthNames = ['Januar','Februar','März','April','Mai','Juni',
                            'Juli','August','September','Oktober','November','Dezember'];
        errorDiv.textContent = `Hinweis: Das gewählte Datum liegt vor dem frühestmöglichen Termin (${minDate.getDate()}. ${monthNames[minDate.getMonth()]} ${minDate.getFullYear()}). Kündigungsfrist laut Vertrag: ${weeks} Wochen. Der Antrag wird trotzdem eingereicht.`;
        errorDiv.style.display = 'block';
    }

    const { data: inserted, error } = await db
        .from('planit_terminations')
        .insert({
            user_id:        currentEmployee.user_id,
            employee_id:    currentEmployee.id,
            street,
            zip,
            city,
            requested_date: date,
            reason:         reason || null,
            status:         'pending',
        })
        .select('id')
        .single();

    if (error) {
        errorDiv.textContent   = 'Fehler beim Speichern. Bitte erneut versuchen.';
        errorDiv.style.display = 'block';
        return;
    }

    // PDF generieren und hochladen
    try {
        const [{ data: restaurant }, { data: emp }] = await Promise.all([
            db.from('planit_restaurants').select('*').eq('user_id', currentEmployee.user_id).maybeSingle(),
            db.from('employees_planit').select('name').eq('id', currentEmployee.id).maybeSingle(),
        ]);

        const empName     = emp?.name || currentEmployee.name || '';
        const restName    = restaurant?.name   || '[Restaurant-Name]';
        const restStreet  = restaurant?.street || '';
        const restZip     = restaurant?.zip    || '';
        const restCity    = restaurant?.city   || '';
        const restAddress = [restStreet, `${restZip} ${restCity}`.trim()].filter(Boolean).join('\n');
        const lastDay     = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
        const todayStr    = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

        const textBefore = [
            empName,
            street,
            `${zip} ${city}`,
            ``,
            restName,
            restAddress,
            ``,
            ``,
            `${city}, ${todayStr}`,
            ``,
            `Betreff: Kündigung meines Arbeitsverhältnisses`,
            ``,
            `Sehr geehrte Damen und Herren,`,
            ``,
            `hiermit kündige ich mein Arbeitsverhältnis mit ${restName} fristgemäß zum ${lastDay}.`,
            reason ? `\nGrund: ${reason}` : '',
            ``,
            `Ich bitte um eine schriftliche Bestätigung des Kündigungseingangs sowie des letzten Arbeitstages.`,
            ``,
            `Mit freundlichen Grüßen`,
        ].filter(l => l !== undefined).join('\n');
        const textAfter = `\n_________________________\n${empName}`;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const lh = 5;
        let y    = 20;

        const linesBefore = doc.splitTextToSize(textBefore, 170);
        doc.text(linesBefore, 20, y);
        y += linesBefore.length * lh + 4;

        // Unterschrift einbetten
        const sigCanvas = document.getElementById('termination-signature-canvas');
        if (sigCanvas) {
            try {
                const dataUrl = sigCanvas.toDataURL('image/png');
                const blank   = document.createElement('canvas');
                blank.width   = sigCanvas.width;
                blank.height  = sigCanvas.height;
                if (dataUrl !== blank.toDataURL('image/png')) {
                    doc.addImage(dataUrl, 'PNG', 20, y, 60, 25);
                    y += 28;
                }
            } catch(e) {}
        }

        if (textAfter) {
            const linesAfter = doc.splitTextToSize(textAfter, 170);
            doc.text(linesAfter, 20, y);
        }

        const pdfBlob  = doc.output('blob');
        const fileName = `${currentEmployee.user_id}/${currentEmployee.id}_${date}.pdf`;
        const { error: uploadError } = await db.storage
            .from('termination-pdfs')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf' });

        if (!uploadError && inserted?.id) {
            await db.from('planit_terminations').update({ pdf_url: fileName }).eq('id', inserted.id);
        }
    } catch(pdfErr) {
        console.error('PDF-Generierung fehlgeschlagen:', pdfErr);
    }

    document.getElementById('termination-preview-modal').classList.remove('active');
    document.getElementById('termination-modal').classList.remove('active');
    alert('Deine Kündigung wurde eingereicht. Die Verwaltung wird sich bei dir melden.');
}
