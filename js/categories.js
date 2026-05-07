// Categories
function updateCategorySelects() {
    const selects = [
        document.getElementById('category'),
        document.getElementById('editCategory'),
        document.getElementById('fixedCategory'),
        document.getElementById('quickCategory')
    ];
    
    selects.forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = categories.map(cat =>
            `<option value="${cat.id}">${localizedCategoryName(cat)}</option>`
        ).join('');
        if (currentValue) select.value = currentValue;
    });
}

function renderCategoriesList() {
    const container = document.getElementById('categoriesList');
    container.innerHTML = categories.map(cat => {
        const locked = !!defaultCategories.find(d => d.id === cat.id);
        const essentialPill = cat.essential
            ? `<span class="cat-essential-pill" data-i18n-title="categories.essentialHelp" title="Excluded from the daily budget streak math">${t('categories.essentialBadge')}</span>`
            : '';
        const deleteBtn = locked
            ? `<span class="cat-locked" data-i18n-title="categories.lockedHelp" title="Built-in category — can't be deleted">🔒</span>`
            : `<button class="delete-btn" onclick="event.stopPropagation(); deleteCategory('${cat.id}')">×</button>`;
        return `
            <div class="category-item" onclick="openEditCategoryModal('${cat.id}')">
                <div style="display: flex; align-items: center;">
                    <div class="category-badge" style="background: ${cat.color};"></div>
                    <div>
                        <strong>${localizedCategoryName(cat)}</strong>${essentialPill}<br>
                        <small style="color: var(--text-light);">${t('categories.keywordCount', { n: cat.keywords.length })}</small>
                    </div>
                </div>
                ${deleteBtn}
            </div>
        `;
    }).join('');
}

function addCategory(e) {
    e.preventDefault();
    const name = document.getElementById('newCategoryName').value;
    const color = document.getElementById('newCategoryColor').value;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    if (categories.find(c => c.id === id)) {
        alert(t('categories.exists'));
        return;
    }
    
    db.run('INSERT INTO categories (id, name, color, keywords, essential) VALUES (?, ?, ?, ?, ?)',
        [id, name, color, '[]', 0]);
    saveDatabase();
    
    categories.push({ id, name, color, keywords: [] });
    
    document.getElementById('addCategoryForm').reset();
    updateCategorySelects();
    renderCategoriesList();
    updateCharts();
}

function deleteCategory(id) {
    if (defaultCategories.find(c => c.id === id)) {
        alert(t('categories.cantDeleteDefault'));
        return;
    }
    const cat = categories.find(c => c.id === id);
    if (cat && cat.essential) {
        alert(t('categories.cantDeleteDefault'));
        return;
    }

    if (!confirm(t('categories.confirmDelete'))) return;
    
    db.run('UPDATE expenses SET category = ? WHERE category = ?', ['other', id]);
    db.run('UPDATE fixed_expenses SET category = ? WHERE category = ?', ['other', id]);
    db.run('DELETE FROM categories WHERE id = ?', [id]);
    saveDatabase();
    
    categories = categories.filter(c => c.id !== id);
    loadDataFromDB();
    
    updateCategorySelects();
    renderCategoriesList();
    updateDashboard();
    updateCharts();
}

function openEditCategoryModal(id) {
    currentEditingCategory = id;
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    
    document.getElementById('editCatName').value = cat.name;
    document.getElementById('editCatColor').value = cat.color;
    renderKeywordsList(cat.keywords);
    document.getElementById('editCategoryModal').classList.add('active');
}

function closeEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('active');
    document.getElementById('newKeyword').value = '';
    currentEditingCategory = null;
}

function renderKeywordsList(keywords) {
    const container = document.getElementById('keywordsList');
    if (keywords.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">' + t('categories.noKeywords') + '</p>';
        return;
    }
    container.innerHTML = keywords.map((kw, idx) => `
        <div class="keyword-tag">
            <span>${kw}</span>
            <button onclick="removeKeyword(${idx})">×</button>
        </div>
    `).join('');
}

function addKeyword() {
    const cat = categories.find(c => c.id === currentEditingCategory);
    if (!cat) return;
    
    const keyword = document.getElementById('newKeyword').value.toLowerCase().trim();
    if (!keyword) return;
    
    if (cat.keywords.includes(keyword)) {
        alert(t('categories.keywordExists'));
        return;
    }
    
    cat.keywords.push(keyword);
    db.run('UPDATE categories SET keywords = ? WHERE id = ?', 
        [JSON.stringify(cat.keywords), currentEditingCategory]);
    saveDatabase();
    
    renderKeywordsList(cat.keywords);
    document.getElementById('newKeyword').value = '';
}

function removeKeyword(idx) {
    const cat = categories.find(c => c.id === currentEditingCategory);
    if (!cat) return;
    
    cat.keywords.splice(idx, 1);
    db.run('UPDATE categories SET keywords = ? WHERE id = ?', 
        [JSON.stringify(cat.keywords), currentEditingCategory]);
    saveDatabase();
    
    renderKeywordsList(cat.keywords);
}

function saveCategoryEdit() {
    const cat = categories.find(c => c.id === currentEditingCategory);
    if (!cat) return;
    
    cat.name = document.getElementById('editCatName').value;
    cat.color = document.getElementById('editCatColor').value;
    
    db.run('UPDATE categories SET name = ?, color = ? WHERE id = ?', 
        [cat.name, cat.color, currentEditingCategory]);
    saveDatabase();
    
    closeEditCategoryModal();
    updateCategorySelects();
    renderCategoriesList();
    updateDashboard();
    updateCharts();
}

function guessCategory(desc) {
    if (!desc) return 'other';
    const d = desc.toLowerCase();
    
    for (const cat of categories) {
        for (const keyword of cat.keywords) {
            if (d.includes(keyword)) {
                return cat.id;
            }
        }
    }
    
    return 'other';
}

function getCategoryColor(id) {
    const cat = categories.find(c => c.id === id);
    return cat ? cat.color : '#64748b';
}

// For default categories we translate the name even if the DB row was seeded in another language.
function localizedCategoryName(cat) {
    if (!cat) return '';
    const seed = defaultCategories.find(d => d.id === cat.id);
    return seed ? t('defaultCategories.' + cat.id) : cat.name;
}

function getCategoryName(id) {
    const cat = categories.find(c => c.id === id);
    return cat ? localizedCategoryName(cat) : id;
}
