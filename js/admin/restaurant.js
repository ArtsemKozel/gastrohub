// ── RESTAURANT-INFO ───────────────────────────────────────

async function loadRestaurantInfo() {
    const { data } = await db.from('planit_restaurants').select('*').eq('user_id', adminSession.user.id).maybeSingle();
    document.getElementById('restaurant-name').value   = data?.name   || '';
    document.getElementById('restaurant-street').value = data?.street || '';
    document.getElementById('restaurant-zip').value    = data?.zip    || '';
    document.getElementById('restaurant-city').value   = data?.city   || '';
}

async function saveRestaurantInfo() {
    const errorDiv = document.getElementById('restaurant-info-error');
    errorDiv.style.display = 'none';
    const payload = {
        user_id: adminSession.user.id,
        name:    document.getElementById('restaurant-name').value.trim(),
        street:  document.getElementById('restaurant-street').value.trim(),
        zip:     document.getElementById('restaurant-zip').value.trim(),
        city:    document.getElementById('restaurant-city').value.trim(),
    };
    const { data: existing } = await db.from('planit_restaurants').select('id').eq('user_id', adminSession.user.id).maybeSingle();
    const { error } = existing
        ? await db.from('planit_restaurants').update(payload).eq('user_id', adminSession.user.id)
        : await db.from('planit_restaurants').insert(payload);
    if (error) {
        errorDiv.textContent = 'Fehler beim Speichern.';
        errorDiv.style.display = 'block';
        return;
    }
    const btn = document.querySelector('[onclick="saveRestaurantInfo()"]');
    const orig = btn.textContent;
    btn.textContent = 'Gespeichert ✓';
    setTimeout(() => { btn.textContent = orig; }, 2000);
}
