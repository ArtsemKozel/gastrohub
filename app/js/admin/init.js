// ── GLOBALER STATE ────────────────────────────────────────
let adminSession          = null;
let employees             = [];
let departmentNames       = [];

// Schichtplan
let weekDate              = new Date();
let editShiftId           = null;
let _shiftModalScrollY    = 0;
let planningMode          = false;
let availabilityCache     = {};
let currentShiftEmployeeId = null;
let currentShiftDateStr    = null;
let _deptActionMenu       = null; // { el, dept }
let _selectionDept        = null;
let _selectedShiftIds     = new Set();

// Urlaubsverwaltung
let adminAvailDate        = new Date();
let urlaubYear            = new Date().getFullYear();
let vacationExplainData   = {};
let _terminationDates     = {}; // { employee_id: requested_date }
let editVacationApproveAfter = false;

// Aufgaben & Trinkgeld
let openTaskIds           = new Set();
let trinkgeldDate         = new Date();

// ── TAB WECHSEL ───────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    const navBtn = document.getElementById('nav-' + tab);
    if (navBtn) navBtn.classList.add('active');

    if (tab === 'stunden')           loadAdminStunden();
    if (tab === 'requests')          { loadRequests(); loadRequestsStats(); }
    if (tab === 'urlaubsverwaltung') loadUrlaubsverwaltung();
    if (tab === 'tasks')             loadTasks();
    if (tab === 'team-tasks')        loadTeamTasks();
    if (tab === 'notes')             loadNotes();
    if (tab === 'trinkgeld')         loadTrinkgeld();
    if (tab === 'trinkgeld-config')  loadTrinkgeldConfig();
    if (tab === 'inventur')          { loadInventur(); loadInventurSubmissions(); }
    if (tab === 'inventur-config')   { loadInventurConfig(); loadInventurDelegation(); }
    if (tab === 'restaurant-info')   loadRestaurantInfo();
    if (tab === 'terminations')      loadTerminations();
    if (tab === 'hygiene')           loadHygiene();
    if (tab === 'temperature')       loadTemperature();
    if (tab === 'temperature-config') loadTemperatureConfig();
    if (tab === 'margincalc')        MarginCalcApp.init();
    if (tab === 'payroll')           loadPayroll();
    if (tab === 'statistiken')       { loadFehlzeiten(); loadFehlzeitenJahr(); loadKrankheitsverlauf(); loadTrinkgeldVerlauf(); }
    if (tab === 'berichte')          loadBerichteFilters();

    localStorage.setItem('planit_admin_tab', tab);
}

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    adminSession = await requireAdminSession();
    if (!adminSession) return;

    const savedTab = localStorage.getItem('planit_admin_tab');
    if (savedTab) switchTab(savedTab);

    await loadEmployees();
    populateAvailEmployeeSelect();

    await Promise.all([
        loadDepartmentNames(),
        loadWeekGrid(),
        loadAdminVacations(),
        loadAdminSwaps(),
        loadTeam(),
        loadDepartments(),
        loadAdminAvailability(),
        loadAdminVacationCalendar(),
        loadArchiveBadge(),
        loadSickLeaves(),
        loadRequestsBadge(),
        loadTerminationBadge(),
        loadInventurBadge(),
        loadUrlaubBadge(),
        loadHygieneBadge(),
        loadMehrBadge(),
    ]);
});
