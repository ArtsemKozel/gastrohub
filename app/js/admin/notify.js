window.sendPushNotification = function(title, message) {
    fetch('https://gastrohub-notify.artsem86.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
    }).catch(() => {});
};

document.addEventListener('click', function(e) {
    if (e.target.closest('#shift-modal .btn-primary') && !window.editShiftId && document.getElementById('shift-is-open')?.checked) {
        sendPushNotification('Offene Schicht', 'Eine neue offene Schicht ist verfügbar — schau in den Schichtplan!');
    }
});
