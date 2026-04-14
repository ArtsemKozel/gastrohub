// ── FEIERTAGE (Baden-Württemberg) ─────────────────────────
function getBWHolidays(year) {
    return [
        `${year}-01-01`, // Neujahr
        `${year}-01-06`, // Heilige Drei Könige
        // Ostern dynamisch berechnen
        ...getEasterDates(year),
        `${year}-05-01`, // Tag der Arbeit
        `${year}-10-03`, // Tag der Deutschen Einheit
        `${year}-11-01`, // Allerheiligen
        `${year}-12-25`, // 1. Weihnachtstag
        `${year}-12-26`, // 2. Weihnachtstag
    ];
}

function getEasterDates(year) {
    // Gaußsche Osterformel
    const a = year % 19, b = Math.floor(year/100), c = year % 100;
    const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
    const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
    const i = Math.floor(c/4), k = c % 4;
    const l = (32+2*e+2*i-h-k) % 7;
    const m = Math.floor((a+11*h+22*l)/451);
    const month = Math.floor((h+l-7*m+114)/31);
    const day = ((h+l-7*m+114) % 31) + 1;
    const easter = new Date(year, month-1, day);

    const addDays = (d, n) => {
        const r = new Date(d);
        r.setDate(r.getDate()+n);
        return `${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,'0')}-${String(r.getDate()).padStart(2,'0')}`;
    };
    return [
        addDays(easter, -2), // Karfreitag
        addDays(easter, 0),  // Ostersonntag
        addDays(easter, 1),  // Ostermontag
        addDays(easter, 39), // Christi Himmelfahrt
        addDays(easter, 49), // Pfingstsonntag
        addDays(easter, 50), // Pfingstmontag
        addDays(easter, 60), // Fronleichnam
    ];
}

// ── MITARBEITER-ABTEILUNGEN ────────────────────────────────
function getEmpDepartments(emp) {
    const fromDepts = (emp.departments || '').split(',').map(s => s.trim()).filter(Boolean);
    if (fromDepts.length > 0) return fromDepts;
    return [emp.department || 'Allgemein'];
}

// ── GOLD-GRADIENT ─────────────────────────────────────────
function goldGradient(n) {
    const shades = ['#C9A24D','#B8913C','#DAB35E','#A8803B','#EBC46F','#987030','#F0C47A'];
    if (n === 1) return shades[0];
    const stops = [];
    for (let i = 0; i < n; i++) {
        const pct1 = (i / n * 100).toFixed(2);
        const pct2 = ((i + 1) / n * 100).toFixed(2);
        const c = shades[i % shades.length];
        stops.push(`${c} ${pct1}%`, `${c} ${pct2}%`);
    }
    return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

// ── DATUMSFORMATIERUNG ────────────────────────────────────
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('de-DE', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}
