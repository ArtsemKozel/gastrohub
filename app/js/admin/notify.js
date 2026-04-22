window.sendPushNotification = function(title, message) {
    fetch('https://gastrohub-notify.artsem86.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message }),
    }).catch(() => {});
};
