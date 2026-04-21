// ── GLOBALER STATE ────────────────────────────────────────
let currentEmployee = null;
let calendarDate    = new Date();
let availDate       = new Date();
let myShifts        = [];
let selectedSwapShift  = null;
let selectedAvailDays  = {};
let overviewDate       = new Date();
let empTrinkgeldDate   = new Date();

// ── TAB WECHSEL ───────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    const navBtn = document.getElementById('nav-' + tab);
    if (navBtn) navBtn.classList.add('active');

    if (tab === 'schichtplan')  { loadWeekGrid(); loadMyRequests(); }
    if (tab === 'urlaub')       { loadVacations(); loadVacationAccount(); }
    if (tab === 'profil')       loadProfil();
    if (tab === 'stunden')      loadMeineStunden();
    if (tab === 'trinkgeld')    loadEmpTrinkgeld();
    if (tab === 'inventur-emp') loadEmpInventur();
    if (tab === 'mehr') {
        document.getElementById('trinkgeld-menu-item').style.display = 'none';
        const invItem = document.getElementById('inventur-emp-menu-item');
        if (invItem) invItem.style.display = 'none';
        Promise.all([checkTrinkgeldVisibility(), checkInventurVisibility()]);
    }

    localStorage.setItem('planit_emp_tab', tab);
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    currentEmployee = requireEmployeeSession();
    if (!currentEmployee) return;

    document.getElementById('employee-name').textContent = currentEmployee.name;

    const savedTab = localStorage.getItem('planit_emp_tab');
    if (savedTab) switchTab(savedTab);

    await Promise.all([
        loadWeekGrid(),
        loadVacations(),
        loadAvailability(),
        loadPayroll(),
        loadSwaps(),
        loadOverview(),
        loadVacationCalendar(),
        checkTrinkgeldVisibility(),
        checkInventurVisibility(),
    ]);
});
