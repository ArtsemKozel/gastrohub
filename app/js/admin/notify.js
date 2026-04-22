window.sendPushNotification = function(title, message) {
    fetch('https://gastrohub-notify.artsem86.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
    }).catch(() => {});
};

setTimeout(function() {
    const _original = window.submitShift;
    if (!_original) return;
    window.submitShift = async function() {
        const isNew  = !window.editShiftId;
        const isOpen = document.getElementById('shift-is-open')?.checked;
        await _original.apply(this, arguments);
        if (isNew && isOpen) {
            sendPushNotification('Offene Schicht', 'Eine neue offene Schicht ist verfügbar — schau in den Schichtplan!');
        }
    };
}, 500);
