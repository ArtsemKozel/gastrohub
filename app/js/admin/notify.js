window.sendPushNotification = function(title, message) {
    fetch('https://gastrohub-notify.artsem86.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
    }).catch(() => {});
};

document.addEventListener('click', function(e) {
    const isOpenShiftBtn  = !!e.target.closest('[onclick*="submitOpenShift"]');
    const isShiftModalBtn = !!e.target.closest('#shift-modal .btn-primary') &&
        (!document.getElementById('shift-employee')?.value || document.getElementById('shift-is-open')?.checked);

    if ((isOpenShiftBtn || isShiftModalBtn) && !window.editShiftId) {
        sendPushNotification('Offene Schicht', 'Eine neue offene Schicht ist verfügbar — schau in den Schichtplan!');
    }
});
