// ── MARGINCALC ────────────────────────────────────────────
// Ported from GastroHub/MarginCalc/js/app.js + ui.js
// supabaseClient → db, currentUserId → adminSession.user.id

const MarginCalcApp = {
    state: {
        activeTab: 'dishes',
        dishName: '',
        ingredients: [],
        foodCostPercentage: 25,
        results: null,

        categories: [],
        dishes: [],
        ingredientsDB: [],
        filteredIngredientsDB: [],
        filteredDishes: [],
        suppliers: [],

        ingredientSearchQuery: '',
        dishSearchQuery: '',
        dishSortOrder: 'name_asc',
        ingredientSupplierFilter: ''
    },

    async init() {
        if (!adminSession) {
            console.error('adminSession nicht gefunden');
            return;
        }
        await this.loadIngredients();
        await this.loadCategories();
        await this.loadSuppliers();
        await this.loadDishes();
        MarginCalcUI.render();
    },

    addIngredient() {
        const ingredient = {
            id: Date.now() + Math.random(),
            name: '',
            amount: 0,
            unit: 'g',
            pricePerUnit: 0
        };
        this.state.ingredients.push(ingredient);
    },

    removeIngredient(id) {
        this.state.ingredients = this.state.ingredients.filter(ing => ing.id !== id);
        MarginCalcUI.render();
    },

    updateIngredient(id, field, value) {
        const ingredient = this.state.ingredients.find(ing => ing.id === id);
        if (ingredient) {
            if (field === 'amount' || field === 'pricePerUnit') {
                ingredient[field] = parseFloat(value) || 0;
            } else {
                ingredient[field] = value;
            }
        }
    },

    calculate() {
        if (!this.state.dishName.trim()) {
            alert('Bitte Gericht-Namen eingeben');
            return;
        }
        if (this.state.ingredients.length === 0) {
            alert('Bitte mindestens eine Zutat hinzufügen');
            return;
        }
        const hasValidIngredient = this.state.ingredients.some(ing =>
            ing.name.trim() && ing.amount > 0 && ing.pricePerUnit > 0
        );
        if (!hasValidIngredient) {
            alert('Bitte mindestens eine Zutat mit Werten ausfüllen');
            return;
        }
        const foodCost = this.state.ingredients.reduce((sum, ing) => {
            return sum + (ing.amount * ing.pricePerUnit);
        }, 0);
        const percentage = this.state.foodCostPercentage / 100;
        const suggestedPrice = foodCost / percentage;
        const margin = suggestedPrice - foodCost;
        const marginPercentage = ((margin / suggestedPrice) * 100);
        this.state.results = { foodCost, suggestedPrice, margin, marginPercentage, foodCostPercentage: this.state.foodCostPercentage };
        MarginCalcUI.renderResults();
    },

    formatCurrency(value) {
        return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
    },

    formatPercentage(value) {
        return new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 100);
    },

    async loadIngredients() {
        const { data, error } = await db
            .from('ingredients')
            .select('*')
            .eq('user_id', adminSession.user.id)
            .order('name', { ascending: true });
        if (error) { console.error('Fehler beim Laden:', error); return; }
        this.state.ingredientsDB = data || [];
        this.state.filteredIngredientsDB = this.state.ingredientsDB;
    },

    showAddIngredientModal() {
        this.addIngredient();
    },

    showIngredientModal(title, ingredient) {
        return new Promise((resolve) => {
            const modal = document.getElementById('ingredientModal');
            const modalTitle = document.getElementById('ingredientModalTitle');
            const nameInput = document.getElementById('ingredientName');
            const unitSelect = document.getElementById('ingredientUnit');
            const submitBtn = document.getElementById('ingredientSubmit');
            const cancelBtn = document.getElementById('ingredientCancel');
            const totalPriceInput = document.getElementById('ingredientTotalPrice');
            const totalAmountInput = document.getElementById('ingredientTotalAmount');
            const calculatedPriceSpan = document.getElementById('calculatedPrice');
            const calculatedUnitSpan = document.getElementById('calculatedUnit');
            const supplierSelect = document.getElementById('ingredientSupplier');

            function calculatePrice() {
                const totalPrice = parseFloat(totalPriceInput.value) || 0;
                const totalAmount = parseFloat(totalAmountInput.value) || 1;
                const unit = unitSelect.value;
                calculatedPriceSpan.textContent = (totalPrice / totalAmount).toFixed(4);
                calculatedUnitSpan.textContent = unit;
            }

            totalPriceInput.addEventListener('input', calculatePrice);
            totalAmountInput.addEventListener('input', calculatePrice);
            unitSelect.addEventListener('change', calculatePrice);

            modalTitle.textContent = title;

            supplierSelect.innerHTML = '<option value="">-- Kein Lieferant --</option>' +
                this.state.suppliers.map(sup => `<option value="${sup.id}">${sup.name}</option>`).join('');

            if (ingredient) {
                nameInput.value = ingredient.name;
                unitSelect.value = ingredient.unit;
                totalPriceInput.value = ingredient.price_per_unit;
                totalAmountInput.value = 1;
                supplierSelect.value = ingredient.supplier_id || '';
            } else {
                nameInput.value = '';
                totalPriceInput.value = '';
                totalAmountInput.value = '';
                unitSelect.value = 'g';
            }

            calculatePrice();
            modal.classList.add('active');
            nameInput.focus();

            function submit() {
                const totalPrice = parseFloat(totalPriceInput.value) || 0;
                const totalAmount = parseFloat(totalAmountInput.value) || 1;
                const data = {
                    name: nameInput.value.trim(),
                    price_per_unit: totalPrice / totalAmount,
                    unit: unitSelect.value,
                    supplier_id: supplierSelect.value || null
                };
                if (!data.name || !data.price_per_unit) { alert('Bitte alle Felder ausfüllen'); return; }
                modal.classList.remove('active');
                cleanup();
                resolve(data);
            }

            function cancel() {
                modal.classList.remove('active');
                cleanup();
                resolve(null);
            }

            function cleanup() {
                submitBtn.removeEventListener('click', submit);
                cancelBtn.removeEventListener('click', cancel);
            }

            submitBtn.addEventListener('click', submit);
            cancelBtn.addEventListener('click', cancel);
        });
    },

    async addIngredientDB() {
        const data = await this.showIngredientModal('Neue Zutat', null);
        if (!data) return;
        const { data: ingredient, error } = await db
            .from('ingredients')
            .insert({ user_id: adminSession.user.id, name: data.name, price_per_unit: data.price_per_unit, unit: data.unit, supplier_id: data.supplier_id })
            .select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        this.state.ingredientsDB.push(ingredient);
        this.state.filteredIngredientsDB = this.state.ingredientsDB;
        MarginCalcUI.render();
    },

    async editIngredient(id) {
        const ingredient = this.state.ingredientsDB.find(i => i.id == id);
        if (!ingredient) return;
        const data = await this.showIngredientModal('Zutat bearbeiten', ingredient);
        if (!data) return;
        const { data: updated, error } = await db
            .from('ingredients')
            .update({ name: data.name, price_per_unit: data.price_per_unit, unit: data.unit, supplier_id: data.supplier_id })
            .eq('id', id).select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        const index = this.state.ingredientsDB.findIndex(i => i.id == id);
        this.state.ingredientsDB[index] = updated;
        this.state.filteredIngredientsDB = this.state.ingredientsDB;
        MarginCalcUI.render();
    },

    async deleteIngredient(id) {
        if (!confirm('Zutat wirklich löschen?')) return;
        const { error } = await db.from('ingredients').delete().eq('id', id);
        if (error) { alert('Fehler beim Löschen'); console.error(error); return; }
        this.state.ingredientsDB = this.state.ingredientsDB.filter(i => i.id != id);
        this.state.filteredIngredientsDB = this.state.ingredientsDB;
        MarginCalcUI.render();
    },

    searchIngredients(query) {
        this.state.ingredientSearchQuery = query;
        const searchTerm = query.toLowerCase().trim();
        const supplierId = this.state.ingredientSupplierFilter;
        let filtered = this.state.ingredientsDB;
        if (searchTerm) filtered = filtered.filter(ing => ing.name.toLowerCase().includes(searchTerm));
        if (supplierId) filtered = filtered.filter(ing => ing.supplier_id == supplierId);
        this.state.filteredIngredientsDB = filtered;
        MarginCalcUI.updateIngredientsList();
    },

    filterIngredientsBySupplier(supplierId) {
        const searchTerm = this.state.ingredientSearchQuery.toLowerCase().trim();
        let filtered = this.state.ingredientsDB;
        if (searchTerm) filtered = filtered.filter(ing => ing.name.toLowerCase().includes(searchTerm));
        if (supplierId) filtered = filtered.filter(ing => ing.supplier_id == supplierId);
        this.state.filteredIngredientsDB = filtered;
        MarginCalcUI.updateIngredientsList();
    },

    async loadDishes() {
        const { data, error } = await db
            .from('dishes')
            .select(`*, dish_ingredients(amount, ingredient:ingredients(id, name, price_per_unit, unit))`)
            .eq('user_id', adminSession.user.id)
            .order('name', { ascending: true });
        if (error) { console.error('Fehler beim Laden:', error); return; }
        this.state.dishes = (data || []).map(dish => {
            const foodCost = this.calculateFoodCost(dish);
            const suggestedPrice = this.calculateSuggestedPrice(foodCost, dish.food_cost_percentage);
            return { ...dish, calculated_food_cost: foodCost, calculated_price: suggestedPrice };
        });
        this.state.filteredDishes = this.state.dishes;
        this.sortDishes(this.state.dishSortOrder);
    },

    async loadCategories() {
        const { data, error } = await db
            .from('categories')
            .select('*')
            .eq('user_id', adminSession.user.id)
            .order('sort_order', { ascending: true });
        if (error) { console.error('Fehler beim Laden:', error); return; }
        this.state.categories = data || [];
    },

    async loadSuppliers() {
        const { data, error } = await db
            .from('suppliers')
            .select('*')
            .eq('user_id', adminSession.user.id)
            .order('name', { ascending: true });
        if (error) { console.error('Fehler beim Laden:', error); return; }
        this.state.suppliers = data || [];
    },

    calculateFoodCost(dish) {
        if (!dish.dish_ingredients || dish.dish_ingredients.length === 0) return 0;
        return dish.dish_ingredients.reduce((sum, di) => {
            if (di.ingredient) return sum + (di.amount * di.ingredient.price_per_unit);
            return sum;
        }, 0);
    },

    calculateSuggestedPrice(foodCost, foodCostPercentage) {
        if (foodCost === 0) return 0;
        return foodCost / (foodCostPercentage / 100);
    },

    showAddDishModal() {
        this.addDish();
    },

    showDishModal(title, dish) {
        return new Promise((resolve) => {
            const modal = document.getElementById('dishModal');
            const modalTitle = document.getElementById('dishModalTitle');
            const nameInput = document.getElementById('dishName');
            const foodCostInput = document.getElementById('dishFoodCost');
            const ingredientsList = document.getElementById('dishIngredientsList');
            const categorySelect = document.getElementById('dishCategory');
            const addIngredientBtn = document.getElementById('addDishIngredientBtn');
            const submitBtn = document.getElementById('dishSubmit');
            const cancelBtn = document.getElementById('dishCancel');

            let dishIngredients = [];

            modalTitle.textContent = title;

            categorySelect.innerHTML = '<option value="">-- Keine Kategorie --</option>' +
                this.state.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');

            if (dish) {
                nameInput.value = dish.name;
                foodCostInput.value = dish.food_cost_percentage;
                categorySelect.value = dish.category_id || '';
                if (dish.dish_ingredients) {
                    dishIngredients = dish.dish_ingredients.map(di => ({
                        ingredient_id: di.ingredient.id,
                        ingredientName: di.ingredient.name,
                        amount: di.amount,
                        unit: di.ingredient.unit,
                        price_per_unit: di.ingredient.price_per_unit
                    }));
                }
            } else {
                nameInput.value = '';
                foodCostInput.value = 25;
                dishIngredients = [];
            }

            renderDishIngredients();
            modal.classList.add('active');
            nameInput.focus();

            function renderDishIngredients() {
                if (dishIngredients.length === 0) {
                    ingredientsList.innerHTML = '<p style="color:#999; font-size:0.875rem;">Noch keine Zutaten</p>';
                    return;
                }
                ingredientsList.innerHTML = dishIngredients.map((ing, index) => `
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem; padding:0.75rem; background:#F5F5F5; border-radius:6px; cursor:pointer;" data-index="${index}" class="dish-ingredient-item">
                        <span style="flex:1;">${ing.ingredientName}</span>
                        <span>${ing.amount} ${ing.unit}</span>
                        <button type="button" class="btn-icon" data-action="delete" data-index="${index}">✕</button>
                    </div>
                `).join('');

                ingredientsList.querySelectorAll('.dish-ingredient-item').forEach(item => {
                    item.addEventListener('click', async (e) => {
                        if (e.target.dataset.action === 'delete') return;
                        const index = parseInt(item.dataset.index);
                        const ing = dishIngredients[index];
                        const newAmount = await MarginCalcApp.showEditAmountModal(ing.ingredientName, ing.amount, ing.unit);
                        if (newAmount) { dishIngredients[index].amount = newAmount; renderDishIngredients(); }
                    });
                });

                ingredientsList.querySelectorAll('[data-action="delete"]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        dishIngredients.splice(parseInt(e.target.dataset.index), 1);
                        renderDishIngredients();
                    });
                });
            }

            addIngredientBtn.addEventListener('click', async () => {
                const ingredient = await MarginCalcApp.selectIngredient();
                if (!ingredient) return;
                dishIngredients.push(ingredient);
                renderDishIngredients();
            });

            function submit() {
                const data = {
                    name: nameInput.value.trim(),
                    food_cost_percentage: parseFloat(foodCostInput.value),
                    category_id: categorySelect.value || null,
                    ingredients: dishIngredients
                };
                if (!data.name) { alert('Bitte Gericht-Namen eingeben'); return; }
                modal.classList.remove('active');
                cleanup();
                resolve(data);
            }

            function cancel() {
                modal.classList.remove('active');
                cleanup();
                resolve(null);
            }

            function cleanup() {
                submitBtn.removeEventListener('click', submit);
                cancelBtn.removeEventListener('click', cancel);
            }

            submitBtn.addEventListener('click', submit);
            cancelBtn.addEventListener('click', cancel);
        });
    },

    async selectIngredient() {
        return new Promise((resolve) => {
            const modal = document.getElementById('selectIngredientModal');
            const dropdown = document.getElementById('selectIngredientDropdown');
            const amountInput = document.getElementById('selectIngredientAmount');
            const unitSpan = document.getElementById('selectIngredientUnit');
            const submitBtn = document.getElementById('selectIngredientSubmit');
            const cancelBtn = document.getElementById('selectIngredientCancel');

            dropdown.innerHTML = '<option value="">-- Zutat wählen --</option>' +
                this.state.ingredientsDB.map(ing =>
                    `<option value="${ing.id}">${ing.name} (${ing.price_per_unit.toFixed(4)}€/${ing.unit})</option>`
                ).join('');

            amountInput.value = '';
            unitSpan.textContent = '';

            dropdown.addEventListener('change', () => {
                const ingredient = this.state.ingredientsDB.find(i => i.id == dropdown.value);
                unitSpan.textContent = ingredient ? ingredient.unit : '';
            });

            modal.classList.add('active');
            dropdown.focus();

            function submit() {
                const ingredientId = dropdown.value;
                const amount = parseFloat(amountInput.value);
                if (!ingredientId || !amount) { alert('Bitte Zutat und Menge eingeben'); return; }
                const ingredient = MarginCalcApp.state.ingredientsDB.find(i => i.id == ingredientId);
                const data = { ingredient_id: ingredient.id, ingredientName: ingredient.name, amount, unit: ingredient.unit, price_per_unit: ingredient.price_per_unit };
                modal.classList.remove('active');
                cleanup();
                resolve(data);
            }

            function cancel() {
                modal.classList.remove('active');
                cleanup();
                resolve(null);
            }

            function cleanup() {
                submitBtn.removeEventListener('click', submit);
                cancelBtn.removeEventListener('click', cancel);
            }

            submitBtn.addEventListener('click', submit);
            cancelBtn.addEventListener('click', cancel);
        });
    },

    showEditAmountModal(ingredientName, currentAmount, unit) {
        return new Promise((resolve) => {
            const modal = document.getElementById('editAmountModal');
            const ingredientText = document.getElementById('editAmountIngredient');
            const amountInput = document.getElementById('editAmountInput');
            const unitSpan = document.getElementById('editAmountUnit');
            const submitBtn = document.getElementById('editAmountSubmit');
            const cancelBtn = document.getElementById('editAmountCancel');

            ingredientText.textContent = ingredientName;
            amountInput.value = currentAmount;
            unitSpan.textContent = unit;
            modal.classList.add('active');
            amountInput.focus();
            amountInput.select();

            function submit() {
                const newAmount = parseFloat(amountInput.value);
                if (!newAmount || newAmount <= 0) { alert('Bitte gültige Menge eingeben'); return; }
                modal.classList.remove('active');
                cleanup();
                resolve(newAmount);
            }

            function cancel() {
                modal.classList.remove('active');
                cleanup();
                resolve(null);
            }

            function handleEnter(e) { if (e.key === 'Enter') submit(); }

            function cleanup() {
                submitBtn.removeEventListener('click', submit);
                cancelBtn.removeEventListener('click', cancel);
                amountInput.removeEventListener('keypress', handleEnter);
            }

            submitBtn.addEventListener('click', submit);
            cancelBtn.addEventListener('click', cancel);
            amountInput.addEventListener('keypress', handleEnter);
        });
    },

    async addDish() {
        const data = await this.showDishModal('Neues Gericht', null);
        if (!data) return;
        const { data: dish, error } = await db
            .from('dishes')
            .insert({ user_id: adminSession.user.id, name: data.name, food_cost_percentage: data.food_cost_percentage, category_id: data.category_id })
            .select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        if (data.ingredients.length > 0) {
            await db.from('dish_ingredients').insert(data.ingredients.map(ing => ({ dish_id: dish.id, ingredient_id: ing.ingredient_id, amount: ing.amount })));
        }
        await this.loadDishes();
        MarginCalcUI.render();
    },

    async editDish(id) {
        const dish = this.state.dishes.find(d => d.id == id);
        if (!dish) return;
        const data = await this.showDishModal('Gericht bearbeiten', dish);
        if (!data) return;
        const { error } = await db.from('dishes').update({ name: data.name, food_cost_percentage: data.food_cost_percentage, category_id: data.category_id }).eq('id', id);
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        await db.from('dish_ingredients').delete().eq('dish_id', id);
        if (data.ingredients.length > 0) {
            await db.from('dish_ingredients').insert(data.ingredients.map(ing => ({ dish_id: id, ingredient_id: ing.ingredient_id, amount: ing.amount })));
        }
        await this.loadDishes();
        MarginCalcUI.render();
    },

    async deleteDish(id) {
        if (!confirm('Gericht wirklich löschen?')) return;
        const { error } = await db.from('dishes').delete().eq('id', id);
        if (error) { alert('Fehler beim Löschen'); console.error(error); return; }
        this.state.dishes = this.state.dishes.filter(d => d.id != id);
        this.state.filteredDishes = this.state.filteredDishes.filter(d => d.id != id);
        MarginCalcUI.render();
    },

    showDishDetails(id) {
        const dish = this.state.dishes.find(d => d.id == id);
        if (!dish) return;
        const modal = document.getElementById('dishDetailsModal');
        const title = document.getElementById('dishDetailsTitle');
        const ingredientsDiv = document.getElementById('dishDetailsIngredients');
        const calculationDiv = document.getElementById('dishDetailsCalculation');
        const closeBtn = document.getElementById('dishDetailsClose');

        title.textContent = dish.name;

        if (dish.dish_ingredients && dish.dish_ingredients.length > 0) {
            ingredientsDiv.innerHTML = dish.dish_ingredients.map(di => `
                <div class="details-ingredient">
                    <span>${di.ingredient.name}</span>
                    <span>${di.amount} ${di.ingredient.unit}</span>
                </div>
            `).join('');
        } else {
            ingredientsDiv.innerHTML = '<p style="color:#999;">Keine Zutaten</p>';
        }

        const foodCost = dish.calculated_food_cost || 0;
        const price = dish.calculated_price || 0;
        const marginEuro = price - foodCost;
        const marginPercent = price > 0 ? (marginEuro / price * 100) : 0;

        calculationDiv.innerHTML = `
            <div class="calculation-row"><span class="calculation-label">Food-Cost:</span><span class="calculation-value">${this.formatCurrency(foodCost)}</span></div>
            <div class="calculation-row"><span class="calculation-label">Food-Cost %:</span><span class="calculation-value">${dish.food_cost_percentage}%</span></div>
            <div class="calculation-row"><span class="calculation-label">Verkaufspreis:</span><span class="calculation-value">${this.formatCurrency(price)}</span></div>
            <div class="calculation-row"><span class="calculation-label">Marge €:</span><span class="calculation-value">${this.formatCurrency(marginEuro)}</span></div>
            <div class="calculation-row"><span class="calculation-label">Marge %:</span><span class="calculation-value">${marginPercent.toFixed(1)}%</span></div>
        `;

        modal.classList.add('active');
        const closeHandler = () => { modal.classList.remove('active'); closeBtn.removeEventListener('click', closeHandler); };
        closeBtn.addEventListener('click', closeHandler);
    },

    searchDishes(query) {
        const searchTerm = query.toLowerCase().trim();
        this.state.filteredDishes = searchTerm
            ? this.state.dishes.filter(dish => dish.name.toLowerCase().includes(searchTerm))
            : this.state.dishes;
        MarginCalcUI.updateDishesList();
    },

    sortDishes(sortOrder) {
        const parts = sortOrder.split('_');
        const ascending = parts[parts.length - 1] === 'asc';

        this.state.filteredDishes.sort((a, b) => {
            let valueA, valueB;
            if (sortOrder.startsWith('name')) {
                valueA = a.name.toLowerCase(); valueB = b.name.toLowerCase();
            } else if (sortOrder.startsWith('price')) {
                valueA = a.calculated_price || 0; valueB = b.calculated_price || 0;
            } else if (sortOrder.includes('margin_euro')) {
                valueA = (a.calculated_price || 0) - (a.calculated_food_cost || 0);
                valueB = (b.calculated_price || 0) - (b.calculated_food_cost || 0);
            } else if (sortOrder.includes('margin_percent')) {
                const pA = a.calculated_price || 0, pB = b.calculated_price || 0;
                valueA = pA > 0 ? ((pA - (a.calculated_food_cost || 0)) / pA * 100) : 0;
                valueB = pB > 0 ? ((pB - (b.calculated_food_cost || 0)) / pB * 100) : 0;
            } else if (sortOrder.startsWith('foodcost')) {
                valueA = a.food_cost_percentage || 0; valueB = b.food_cost_percentage || 0;
            } else {
                valueA = a.name.toLowerCase(); valueB = b.name.toLowerCase();
            }
            if (valueA < valueB) return ascending ? -1 : 1;
            if (valueA > valueB) return ascending ? 1 : -1;
            return 0;
        });
        MarginCalcUI.updateDishesList();
    },

    showAddCategoryModal() { this.addCategory(); },

    showCategoryModal(title, category) {
        return new Promise((resolve) => {
            const modal = document.getElementById('categoryModal');
            const modalTitle = document.getElementById('categoryModalTitle');
            const nameInput = document.getElementById('categoryName');
            const submitBtn = document.getElementById('categorySubmit');
            const cancelBtn = document.getElementById('categoryCancel');
            modalTitle.textContent = title;
            nameInput.value = category ? category.name : '';
            modal.classList.add('active');
            nameInput.focus();

            function submit() {
                const name = nameInput.value.trim();
                if (!name) { alert('Bitte Namen eingeben'); return; }
                modal.classList.remove('active'); cleanup(); resolve(name);
            }
            function cancel() { modal.classList.remove('active'); cleanup(); resolve(null); }
            function cleanup() { submitBtn.removeEventListener('click', submit); cancelBtn.removeEventListener('click', cancel); }
            submitBtn.addEventListener('click', submit);
            cancelBtn.addEventListener('click', cancel);
        });
    },

    async addCategory() {
        const name = await this.showCategoryModal('Neue Kategorie', null);
        if (!name) return;
        const { data, error } = await db.from('categories').insert({ user_id: adminSession.user.id, name, sort_order: this.state.categories.length }).select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        this.state.categories.push(data);
        MarginCalcUI.render();
    },

    async editCategory(id) {
        const category = this.state.categories.find(c => c.id == id);
        if (!category) return;
        const name = await this.showCategoryModal('Kategorie bearbeiten', category);
        if (!name) return;
        const { data, error } = await db.from('categories').update({ name }).eq('id', id).select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        const index = this.state.categories.findIndex(c => c.id == id);
        this.state.categories[index] = data;
        MarginCalcUI.render();
    },

    async deleteCategory(id) {
        if (!confirm('Kategorie wirklich löschen? Gerichte behalten ihre Zuordnung.')) return;
        const { error } = await db.from('categories').delete().eq('id', id);
        if (error) { alert('Fehler beim Löschen'); console.error(error); return; }
        this.state.categories = this.state.categories.filter(c => c.id != id);
        MarginCalcUI.render();
    },

    showAddSupplierModal() { this.addSupplierDB(); },

    showSupplierModal(title, supplier) {
        return new Promise((resolve) => {
            const modal = document.getElementById('supplierModal');
            const modalTitle = document.getElementById('supplierModalTitle');
            const nameInput = document.getElementById('supplierName');
            const submitBtn = document.getElementById('supplierSubmit');
            const cancelBtn = document.getElementById('supplierCancel');
            modalTitle.textContent = title;
            nameInput.value = supplier ? supplier.name : '';
            modal.classList.add('active');
            nameInput.focus();

            function submit() {
                const name = nameInput.value.trim();
                if (!name) { alert('Bitte Namen eingeben'); return; }
                modal.classList.remove('active'); cleanup(); resolve(name);
            }
            function cancel() { modal.classList.remove('active'); cleanup(); resolve(null); }
            function cleanup() { submitBtn.removeEventListener('click', submit); cancelBtn.removeEventListener('click', cancel); }
            submitBtn.addEventListener('click', submit);
            cancelBtn.addEventListener('click', cancel);
        });
    },

    async addSupplierDB() {
        const name = await this.showSupplierModal('Neuer Lieferant', null);
        if (!name) return;
        const { data, error } = await db.from('suppliers').insert({ user_id: adminSession.user.id, name }).select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        this.state.suppliers.push(data);
        MarginCalcUI.render();
    },

    async editSupplier(id) {
        const supplier = this.state.suppliers.find(s => s.id == id);
        if (!supplier) return;
        const name = await this.showSupplierModal('Lieferant bearbeiten', supplier);
        if (!name) return;
        const { data, error } = await db.from('suppliers').update({ name }).eq('id', id).select().single();
        if (error) { alert('Fehler beim Speichern'); console.error(error); return; }
        const index = this.state.suppliers.findIndex(s => s.id == id);
        this.state.suppliers[index] = data;
        MarginCalcUI.render();
    },

    async deleteSupplier(id) {
        if (!confirm('Lieferant wirklich löschen? Zutaten behalten ihre Zuordnung.')) return;
        const { error } = await db.from('suppliers').delete().eq('id', id);
        if (error) { alert('Fehler beim Löschen'); console.error(error); return; }
        this.state.suppliers = this.state.suppliers.filter(s => s.id != id);
        MarginCalcUI.render();
    },
};

// ── MARGINCALC UI ─────────────────────────────────────────
// Ported from GastroHub/MarginCalc/js/ui.js

const MarginCalcUI = {
    render() {
        const app = document.getElementById('margincalc-app');
        if (!app) return;
        app.innerHTML = `${this.renderTabs()}${this.renderTabContent()}`;
        this.attachAllListeners();
    },

    attachAllListeners() {
        this.attachTabListeners();
        this.attachSearchListeners();
        this.attachButtonListeners();
        this.attachActionListeners();
    },

    attachSearchListeners() {
        const ingredientSearch = document.getElementById('ingredientSearch');
        if (ingredientSearch) {
            if (MarginCalcApp.state.ingredientSearchQuery) ingredientSearch.value = MarginCalcApp.state.ingredientSearchQuery;
            ingredientSearch.addEventListener('input', (e) => { MarginCalcApp.state.ingredientSearchQuery = e.target.value; MarginCalcApp.searchIngredients(e.target.value); });
        }
        const dishSearch = document.getElementById('dishSearch');
        if (dishSearch) {
            if (MarginCalcApp.state.dishSearchQuery) dishSearch.value = MarginCalcApp.state.dishSearchQuery;
            dishSearch.addEventListener('input', (e) => { MarginCalcApp.state.dishSearchQuery = e.target.value; MarginCalcApp.searchDishes(e.target.value); });
        }
        const dishSort = document.getElementById('dishSort');
        if (dishSort) {
            if (MarginCalcApp.state.dishSortOrder) dishSort.value = MarginCalcApp.state.dishSortOrder;
            dishSort.addEventListener('change', (e) => { MarginCalcApp.state.dishSortOrder = e.target.value; MarginCalcApp.sortDishes(e.target.value); });
        }
        const ingredientSupplierFilter = document.getElementById('ingredientSupplierFilter');
        if (ingredientSupplierFilter) {
            ingredientSupplierFilter.innerHTML = '<option value="">Alle Lieferanten</option>' +
                MarginCalcApp.state.suppliers.map(sup => `<option value="${sup.id}">${sup.name}</option>`).join('');
            if (MarginCalcApp.state.ingredientSupplierFilter) ingredientSupplierFilter.value = MarginCalcApp.state.ingredientSupplierFilter;
            ingredientSupplierFilter.addEventListener('change', (e) => { MarginCalcApp.state.ingredientSupplierFilter = e.target.value; MarginCalcApp.filterIngredientsBySupplier(e.target.value); });
        }
    },

    attachButtonListeners() {
        const addIngredientBtn = document.getElementById('addIngredientBtn');
        if (addIngredientBtn) addIngredientBtn.addEventListener('click', () => MarginCalcApp.addIngredientDB());
        const addDishBtn = document.getElementById('addDishBtn');
        if (addDishBtn) addDishBtn.addEventListener('click', () => MarginCalcApp.showAddDishModal());
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) addCategoryBtn.addEventListener('click', () => MarginCalcApp.showAddCategoryModal());
        const addSupplierBtn = document.getElementById('addSupplierBtn');
        if (addSupplierBtn) addSupplierBtn.addEventListener('click', () => MarginCalcApp.showAddSupplierModal());
    },

    attachActionListeners() {
        document.querySelectorAll('.ingredient-card .btn-icon').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const id = e.currentTarget.dataset.id;
                if (action === 'edit') MarginCalcApp.editIngredient(id);
                else if (action === 'delete') MarginCalcApp.deleteIngredient(id);
            });
        });
        document.querySelectorAll('.dish-card .btn-icon').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const id = e.currentTarget.dataset.id;
                if (action === 'edit') MarginCalcApp.editDish(id);
                else if (action === 'delete') MarginCalcApp.deleteDish(id);
            });
        });
        document.querySelectorAll('.category-card .btn-icon').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const id = e.currentTarget.dataset.id;
                if (action === 'edit') MarginCalcApp.editCategory(id);
                else if (action === 'delete') MarginCalcApp.deleteCategory(id);
            });
        });
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', () => header.parentElement.classList.toggle('collapsed'));
        });
        document.querySelectorAll('.dish-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-icon')) return;
                MarginCalcApp.showDishDetails(card.dataset.dishId);
            });
        });
        document.querySelectorAll('.supplier-card .btn-icon').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                const id = e.currentTarget.dataset.id;
                if (action === 'edit') MarginCalcApp.editSupplier(id);
                else if (action === 'delete') MarginCalcApp.deleteSupplier(id);
            });
        });
        document.querySelectorAll('.supplier-header').forEach(header => {
            header.addEventListener('click', () => header.parentElement.classList.toggle('collapsed'));
        });
    },

    attachTabListeners() {
        document.querySelectorAll('.margincalc-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                if (MarginCalcApp.state.activeTab === tabName) return;
                MarginCalcApp.state.activeTab = tabName;
                this.render();
            });
        });
    },

    renderTabs() {
        const tabs = [
            { key: 'dishes', label: 'Gerichte' },
            { key: 'ingredients', label: 'Zutaten' },
            { key: 'categories', label: 'Kategorien' },
            { key: 'suppliers', label: 'Lieferanten' },
        ];
        return `<div class="margincalc-tabs" style="display:flex; gap:0.5rem; margin-bottom:1rem;">
            ${tabs.map(t => `<button class="margincalc-tab${MarginCalcApp.state.activeTab === t.key ? ' active' : ''}" data-tab="${t.key}" style="padding:0.5rem 1rem; border-radius:8px; border:none; background:${MarginCalcApp.state.activeTab === t.key ? 'var(--color-primary)' : 'var(--color-gray)'}; color:${MarginCalcApp.state.activeTab === t.key ? 'white' : 'var(--color-text)'}; font-weight:600; cursor:pointer; font-family:inherit;">${t.label}</button>`).join('')}
        </div>`;
    },

    renderTabContent() {
        if (MarginCalcApp.state.activeTab === 'dishes') return this.renderDishesTab();
        if (MarginCalcApp.state.activeTab === 'ingredients') return this.renderIngredientsTab();
        if (MarginCalcApp.state.activeTab === 'categories') return this.renderCategoriesTab();
        if (MarginCalcApp.state.activeTab === 'suppliers') return this.renderSuppliersTab();
        return '';
    },

    renderDishesTab() {
        return `<div>
            <button class="btn-primary" id="addDishBtn" style="margin-bottom:1rem; padding:0.5rem 1rem; border-radius:8px; border:none; background:var(--color-primary); color:white; font-weight:600; cursor:pointer; font-family:inherit;">+ Neues Gericht</button>
            <input type="text" id="dishSearch" placeholder="Gericht suchen..." style="width:100%; padding:0.65rem; border:1px solid var(--color-border); border-radius:8px; font-size:0.9rem; margin-bottom:0.75rem; font-family:inherit;">
            <select id="dishSort" style="padding:0.5rem; border:1px solid var(--color-border); border-radius:8px; font-size:0.85rem; margin-bottom:1rem; font-family:inherit;">
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="price_asc">Preis (niedrig → hoch)</option>
                <option value="price_desc">Preis (hoch → niedrig)</option>
                <option value="margin_euro_asc">Marge € (niedrig → hoch)</option>
                <option value="margin_euro_desc">Marge € (hoch → niedrig)</option>
                <option value="margin_percent_asc">Marge % (niedrig → hoch)</option>
                <option value="margin_percent_desc">Marge % (hoch → niedrig)</option>
                <option value="foodcost_asc">Food-Cost % (niedrig → hoch)</option>
                <option value="foodcost_desc">Food-Cost % (hoch → niedrig)</option>
            </select>
            ${this.renderDishesList()}
        </div>`;
    },

    renderDishesList() {
        const dishes = MarginCalcApp.state.filteredDishes;
        if (dishes.length === 0) {
            return `<div class="empty-state"><p>${MarginCalcApp.state.dishSearchQuery ? 'Keine Gerichte gefunden' : 'Noch keine Gerichte hinzugefügt'}</p></div>`;
        }
        const grouped = this.groupDishesByCategory(dishes);
        return `<div class="dishes-list">
            ${Object.keys(grouped).map(key => `
                <div class="category-group collapsed" style="margin-bottom:0.75rem;">
                    <div class="category-header" style="display:flex; align-items:center; gap:0.5rem; padding:0.65rem 0.85rem; background:var(--color-gray); border-radius:10px; cursor:pointer; margin-bottom:0.25rem;">
                        <span class="category-toggle" style="font-size:0.75rem; color:var(--color-text-light);">▼</span>
                        <span style="font-weight:700; font-size:0.85rem; color:var(--color-primary); letter-spacing:0.05em;">${grouped[key].name.toUpperCase()}</span>
                        <span style="font-size:0.75rem; color:var(--color-text-light);">(${grouped[key].dishes.length})</span>
                    </div>
                    <div class="category-dishes">
                        ${grouped[key].dishes.map(dish => `
                            <div class="dish-card card" data-dish-id="${dish.id}" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; padding:0.6rem 0.85rem; cursor:pointer;">
                                <div>
                                    <div style="font-weight:600; font-size:0.9rem;">${dish.name}</div>
                                    <div style="font-size:0.75rem; color:var(--color-text-light);">VK: ${MarginCalcApp.formatCurrency(dish.calculated_price || 0)}</div>
                                </div>
                                <div style="display:flex; gap:0.4rem;">
                                    <button class="btn-small btn-pdf-view btn-icon" data-action="edit" data-id="${dish.id}"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                                    <button class="btn-small btn-delete btn-icon" data-action="delete" data-id="${dish.id}"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>`;
    },

    groupDishesByCategory(dishes) {
        const grouped = {};
        dishes.forEach(dish => {
            let key, name;
            if (dish.category_id) {
                const category = MarginCalcApp.state.categories.find(c => c.id == dish.category_id);
                key = category ? `cat_${category.id}` : 'uncategorized';
                name = category ? category.name : 'Ohne Kategorie';
            } else { key = 'uncategorized'; name = 'Ohne Kategorie'; }
            if (!grouped[key]) grouped[key] = { name, dishes: [] };
            grouped[key].dishes.push(dish);
        });
        return grouped;
    },

    groupIngredientsBySupplier(ingredients) {
        const grouped = {};
        ingredients.forEach(ing => {
            let key, name;
            if (ing.supplier_id) {
                const supplier = MarginCalcApp.state.suppliers.find(s => s.id == ing.supplier_id);
                key = supplier ? `sup_${supplier.id}` : 'no_supplier';
                name = supplier ? supplier.name : 'Ohne Lieferant';
            } else { key = 'no_supplier'; name = 'Ohne Lieferant'; }
            if (!grouped[key]) grouped[key] = { name, ingredients: [] };
            grouped[key].ingredients.push(ing);
        });
        return grouped;
    },

    renderIngredientsTab() {
        return `<div>
            <button class="btn-primary" id="addIngredientBtn" style="margin-bottom:1rem; padding:0.5rem 1rem; border-radius:8px; border:none; background:var(--color-primary); color:white; font-weight:600; cursor:pointer; font-family:inherit;">+ Neue Zutat</button>
            <input type="text" id="ingredientSearch" placeholder="Zutat suchen..." style="width:100%; padding:0.65rem; border:1px solid var(--color-border); border-radius:8px; font-size:0.9rem; margin-bottom:0.75rem; font-family:inherit;">
            <select id="ingredientSupplierFilter" style="padding:0.5rem; border:1px solid var(--color-border); border-radius:8px; font-size:0.85rem; margin-bottom:1rem; font-family:inherit;">
                <option value="">Alle Lieferanten</option>
            </select>
            ${this.renderIngredientsList()}
        </div>`;
    },

    renderIngredientsList() {
        const ingredients = MarginCalcApp.state.filteredIngredientsDB;
        if (ingredients.length === 0) {
            return `<div class="empty-state"><p>${MarginCalcApp.state.ingredientSearchQuery ? 'Keine Zutaten gefunden' : 'Noch keine Zutaten hinzugefügt'}</p></div>`;
        }
        const grouped = this.groupIngredientsBySupplier(ingredients);
        return `<div class="ingredients-list">
            ${Object.keys(grouped).map(key => `
                <div class="supplier-group collapsed" style="margin-bottom:0.75rem;">
                    <div class="supplier-header" style="display:flex; align-items:center; gap:0.5rem; padding:0.65rem 0.85rem; background:var(--color-gray); border-radius:10px; cursor:pointer; margin-bottom:0.25rem;">
                        <span class="supplier-toggle" style="font-size:0.75rem; color:var(--color-text-light);">▼</span>
                        <span style="font-weight:700; font-size:0.85rem; color:var(--color-primary); letter-spacing:0.05em;">${grouped[key].name.toUpperCase()}</span>
                        <span style="font-size:0.75rem; color:var(--color-text-light);">(${grouped[key].ingredients.length})</span>
                    </div>
                    <div class="supplier-ingredients">
                        ${grouped[key].ingredients.map(ing => `
                            <div class="ingredient-card card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; padding:0.6rem 0.85rem;">
                                <div>
                                    <div style="font-weight:600; font-size:0.9rem;">${ing.name}</div>
                                    <div style="font-size:0.75rem; color:var(--color-text-light);">${ing.price_per_unit.toFixed(4)} €/${ing.unit}</div>
                                </div>
                                <div style="display:flex; gap:0.4rem;">
                                    <button class="btn-small btn-pdf-view btn-icon" data-action="edit" data-id="${ing.id}"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                                    <button class="btn-small btn-delete btn-icon" data-action="delete" data-id="${ing.id}"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>`;
    },

    renderCategoriesTab() {
        const categories = MarginCalcApp.state.categories;
        return `<div>
            <button class="btn-primary" id="addCategoryBtn" style="margin-bottom:1rem; padding:0.5rem 1rem; border-radius:8px; border:none; background:var(--color-primary); color:white; font-weight:600; cursor:pointer; font-family:inherit;">+ Neue Kategorie</button>
            ${categories.length === 0
                ? '<div class="empty-state"><p>Noch keine Kategorien hinzugefügt</p></div>'
                : `<div>${categories.map(cat => `
                    <div class="category-card card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; padding:0.6rem 0.85rem;">
                        <div style="font-weight:600; font-size:0.9rem;">${cat.name}</div>
                        <div style="display:flex; gap:0.4rem;">
                            <button class="btn-small btn-pdf-view btn-icon" data-action="edit" data-id="${cat.id}"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="btn-small btn-delete btn-icon" data-action="delete" data-id="${cat.id}"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                        </div>
                    </div>
                `).join('')}</div>`
            }
        </div>`;
    },

    renderSuppliersTab() {
        const suppliers = MarginCalcApp.state.suppliers;
        return `<div>
            <button class="btn-primary" id="addSupplierBtn" style="margin-bottom:1rem; padding:0.5rem 1rem; border-radius:8px; border:none; background:var(--color-primary); color:white; font-weight:600; cursor:pointer; font-family:inherit;">+ Neuer Lieferant</button>
            ${suppliers.length === 0
                ? '<div class="empty-state"><p>Noch keine Lieferanten hinzugefügt</p></div>'
                : `<div>${suppliers.map(sup => `
                    <div class="supplier-card card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; padding:0.6rem 0.85rem;">
                        <div style="font-weight:600; font-size:0.9rem;">${sup.name}</div>
                        <div style="display:flex; gap:0.4rem;">
                            <button class="btn-small btn-pdf-view btn-icon" data-action="edit" data-id="${sup.id}"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                            <button class="btn-small btn-delete btn-icon" data-action="delete" data-id="${sup.id}"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                        </div>
                    </div>
                `).join('')}</div>`
            }
        </div>`;
    },

    updateIngredientsList() {
        const list = document.querySelector('.ingredients-list');
        const empty = document.querySelector('#margincalc-app .empty-state');
        if (list) list.outerHTML = this.renderIngredientsList();
        else if (empty) empty.outerHTML = this.renderIngredientsList();
        this.attachActionListeners();
    },

    updateDishesList() {
        const list = document.querySelector('.dishes-list');
        const empty = document.querySelector('#margincalc-app .empty-state');
        if (list) list.outerHTML = this.renderDishesList();
        else if (empty) empty.outerHTML = this.renderDishesList();
        this.attachActionListeners();
    },

    renderResults() {
        const resultsSection = document.getElementById('resultsSection');
        if (!resultsSection) return;
        const results = MarginCalcApp.state.results;
        resultsSection.className = `results-section ${!results ? 'results-hidden' : ''}`;
        if (results) {
            resultsSection.innerHTML = `
                <div style="font-weight:700; margin-bottom:0.75rem;">Ergebnis</div>
                <div style="display:flex; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--color-border);"><span>Food-Cost:</span><span>${MarginCalcApp.formatCurrency(results.foodCost)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--color-border);"><span>Food-Cost Anteil:</span><span>${MarginCalcApp.formatPercentage(results.foodCostPercentage)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--color-border);"><span>Empfohlener VK:</span><span style="font-weight:700; color:var(--color-primary);">${MarginCalcApp.formatCurrency(results.suggestedPrice)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:0.3rem 0; border-bottom:1px solid var(--color-border);"><span>Marge:</span><span>${MarginCalcApp.formatCurrency(results.margin)}</span></div>
                <div style="display:flex; justify-content:space-between; padding:0.3rem 0;"><span>Marge %:</span><span>${MarginCalcApp.formatPercentage(results.marginPercentage)}</span></div>
            `;
        }
    },
};

async function loadMarginCalc() {
    await MarginCalcApp.init();
}
