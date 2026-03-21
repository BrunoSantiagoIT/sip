let globalData = {};
let chartsInstances = {};

// Загрузка данных с GitHub
async function loadData() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/BrunoSantiagoIT/sip/main/data.json');
        if (!response.ok) throw new Error('Network response was not ok');
        globalData = await response.json();
        updateDashboard();
        updateLastUpdate();
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        document.getElementById('syncStatus').textContent = '❌ Ошибка синхронизации';
    }
}

// Обновление времени последней синхронизации
function updateLastUpdate() {
    const meta = globalData._meta;
    if (meta && meta.updated_at) {
        document.getElementById('lastUpdate').textContent = `Последнее обновление: ${meta.updated_at}`;
        document.getElementById('syncStatus').textContent = '✅ Синхронизировано';
    }
}

// Основная функция обновления дашборда
function updateDashboard() {
    updateOverview();
    updateSipsList();
    updateNotesList();
    updateProblemsList();
    updateSuppliersList();
}

// ════════════════════════════════════════ OVERVIEW ════════════════════════════════════════
function updateOverview() {
    const sips = globalData.sips || {};
    const suppliers = globalData.suppliers || {};
    const problems = globalData.problems || {};
    const ratings = globalData.ratings || [];
    const users = globalData.users || [];
    const notes = globalData.notes || {};

    // Подсчеты
    const totalSips = Object.keys(sips).length;
    const freeSips = Object.values(sips).filter(s => !s.assigned_to && !s.multisip).length;
    const busySips = Object.values(sips).filter(s => s.assigned_to && !s.multisip).length;
    const multiSips = Object.values(suppliers).filter(s => s.multisip).length;

    const totalProblems = Object.keys(problems).length;
    const openProblems = Object.values(problems).filter(p => p.status === 'open').length;
    const closedProblems = Object.values(problems).filter(p => p.status === 'closed').length;
    const closeRate = totalProblems > 0 ? Math.round((closedProblems / totalProblems) * 100) : 0;

    const avgRating = ratings.length > 0 
        ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1) 
        : '—';

    // Обновление статистики
    document.getElementById('totalSips').textContent = totalSips;
    document.getElementById('freeSips').textContent = freeSips;
    document.getElementById('busySips').textContent = busySips;
    document.getElementById('multiSips').textContent = multiSips;
    document.getElementById('totalProblems').textContent = totalProblems;
    document.getElementById('openProblems').textContent = openProblems;
    document.getElementById('closedProblems').textContent = closedProblems;
    document.getElementById('closeRate').textContent = closeRate + '%';
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('avgRating').textContent = avgRating + ' ⭐';
    document.getElementById('totalRatings').textContent = ratings.length;
    document.getElementById('totalSuppliers').textContent = Object.keys(suppliers).length;

    // Графики
    updateCharts();
}

// Графики
function updateCharts() {
    const problems = globalData.problems || {};
    const suppliers = globalData.suppliers || {};

    // График проблем по поставщикам
    const suppliersData = {};
    Object.values(problems).forEach(p => {
        const name = p.supplier_name || '?';
        suppliersData[name] = (suppliersData[name] || 0) + 1;
    });

    const suppliersCtx = document.getElementById('suppliersChart').getContext('2d');
    if (chartsInstances.suppliers) chartsInstances.suppliers.destroy();
    chartsInstances.suppliers = new Chart(suppliersCtx, {
        type: 'bar',
        data: {
            labels: Object.keys(suppliersData),
            datasets: [{
                label: 'Количество проблем',
                data: Object.values(suppliersData),
                backgroundColor: 'rgba(244, 67, 54, 0.7)',
                borderColor: 'rgba(244, 67, 54, 1)',
                borderWidth: 1,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });

    // График SIP
    const sipStats = {
        '🟢 Свободные': Object.values(globalData.sips || {}).filter(s => !s.assigned_to).length,
        '🔴 Занятые': Object.values(globalData.sips || {}).filter(s => s.assigned_to && !s.multisip).length,
        '🔀 Мультисип': Object.values(suppliers).filter(s => s.multisip).length,
    };

    const sipCtx = document.getElementById('sipChart').getContext('2d');
    if (chartsInstances.sip) chartsInstances.sip.destroy();
    chartsInstances.sip = new Chart(sipCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(sipStats),
            datasets: [{
                data: Object.values(sipStats),
                backgroundColor: ['#4CAF50', '#F44336', '#FF9800'],
                borderColor: '#fff',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 15, font: { size: 12 } } }
            }
        }
    });
}

// ════════════════════════════════════════ SIPS ════════════════════════════════════════
function updateSipsList() {
    const sips = globalData.sips || {};
    const suppliers = globalData.suppliers || {};
    let html = '';

    Object.values(sips).forEach(sip => {
        const sup = suppliers[sip.supplier_id] || {};
        const status = !sip.assigned_to ? 'free' : (sip.multisip ? 'multi' : 'busy');
        const statusLabel = !sip.assigned_to ? '🟢 Свободен' : (sip.multisip ? '🔀 Мультисип' : `🔴 ${sip.assigned_to}`);
        const statusClass = `status-${status}`;

        html += `
            <div class="sip-card" data-status="${status}">
                <div class="sip-header">
                    <span class="sip-number">${sip.number}</span>
                    <span class="sip-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="sip-info">
                    <div><span class="info-label">Поставщик:</span> ${sup.name || '?'}</div>
                    <div><span class="info-label">Категория:</span> ${sip.category || 'холодка'}</div>
                </div>
            </div>
        `;
    });

    document.getElementById('sipsList').innerHTML = html;

    // Фильтры
    document.getElementById('sipFilter').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const status = document.getElementById('sipStatusFilter').value;
        filterSips(query, status);
    });

    document.getElementById('sipStatusFilter').addEventListener('change', (e) => {
        const query = document.getElementById('sipFilter').value.toLowerCase();
        filterSips(query, e.target.value);
    });
}

function filterSips(query, status) {
    document.querySelectorAll('.sip-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        const cardStatus = card.getAttribute('data-status');
        const matches = text.includes(query) && (status === 'all' || cardStatus === status);
        card.style.display = matches ? 'block' : 'none';
    });
}

// ════════════════════════════════════════ NOTES/TEAM ════════════════════════════════════════
function updateNotesList() {
    const notes = globalData.notes || {};
    const sips = globalData.sips || {};
    const suppliers = globalData.suppliers || {};
    let html = '';

    Object.entries(notes).forEach(([key, note]) => {
        // Текущие активные SIP
        const currentSips = note.sip_ids.filter(sid => {
            const sip = sips[sid];
            return sip && sip.assigned_to && sip.assigned_to.toLowerCase() === note.display.toLowerCase();
        }).map(sid => {
            const sip = sips[sid];
            const sup = suppliers[sip.supplier_id] || {};
            return `<span class="sip-tag">${sip.number}</span>`;
        }).join('');

        // Время последней активности
        const lastActive = new Date(note.last_active * 1000).toLocaleString('ru-RU');

        html += `
            <div class="note-card" data-name="${note.display.toLowerCase()}">
                <div class="note-header">
                    <span class="note-name">👤 ${note.display}</span>
                    <span class="note-updated">🕐 ${lastActive}</span>
                </div>
                <div class="note-stats">
                    <div class="note-stat">
                        <div class="note-stat-value">${note.problems_total}</div>
                        <div class="note-stat-label">Всего проблем</div>
                    </div>
                    <div class="note-stat">
                        <div class="note-stat-value">${note.problems_today}</div>
                        <div class="note-stat-label">Сегодня</div>
                    </div>
                </div>
                ${currentSips ? `<div class="note-sips"><div class="note-sips-label">📱 Текущие SIP:</div>${currentSips}</div>` : ''}
            </div>
        `;
    });

    document.getElementById('notesList').innerHTML = html || '<p style="padding: 20px; text-align: center; color: #999;">📝 Нет данных о работниках</p>';

    // Фильтры
    document.getElementById('notesFilter').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterNotes(query);
    });
}

function filterNotes(query) {
    document.querySelectorAll('.note-card').forEach(card => {
        const name = card.getAttribute('data-name');
        const matches = name.includes(query);
        card.style.display = matches ? 'block' : 'none';
    });
}

// ════════════════════════════════════════ PROBLEMS ════════════════════════════════════════
function updateProblemsList() {
    const problems = globalData.problems || {};
    let html = '';

    Object.entries(problems).reverse().forEach(([id, problem]) => {
        const statusLabel = problem.status === 'open' ? '🔴 Открыта' : '✅ Закрыта';
        const statusClass = `status-${problem.status}`;

        html += `
            <div class="problem-item" data-status="${problem.status}">
                <div class="problem-info">
                    <h3>#${id} — ${problem.user_name}</h3>
                    <div class="problem-meta">
                        <div>📞 ${problem.sip_number} | ${problem.supplier_name}</div>
                        <div>📝 ${problem.text.substring(0, 100)}${problem.text.length > 100 ? '...' : ''}</div>
                    </div>
                </div>
                <span class="problem-status ${statusClass}">${statusLabel}</span>
            </div>
        `;
    });

    document.getElementById('problemsList').innerHTML = html;

    // Фильтры
    document.getElementById('problemFilter').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const status = document.getElementById('problemStatusFilter').value;
        filterProblems(query, status);
    });

    document.getElementById('problemStatusFilter').addEventListener('change', (e) => {
        const query = document.getElementById('problemFilter').value.toLowerCase();
        filterProblems(query, e.target.value);
    });
}

function filterProblems(query, status) {
    document.querySelectorAll('.problem-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        const itemStatus = item.getAttribute('data-status');
        const matches = text.includes(query) && (status === 'all' || itemStatus === status);
        item.style.display = matches ? 'block' : 'none';
    });
}

// ════════════════════════════════════════ SUPPLIERS ════════════════════════════════════════
function updateSuppliersList() {
    const suppliers = globalData.suppliers || {};
    const sips = globalData.sips || {};
    const problems = globalData.problems || {};

    let html = '';
    Object.values(suppliers).forEach(supplier => {
        const sipCount = Object.values(sips).filter(s => s.supplier_id === supplier.id).length;
        const problemCount = Object.values(problems).filter(p => p.supplier_name === supplier.name).length;
        const healthIndex = sipCount > 0 ? (problemCount / sipCount).toFixed(2) : 0;

        html += `
            <div class="supplier-card" data-name="${supplier.name.toLowerCase()}">
                <div class="supplier-name">🏢 ${supplier.name}</div>
                <div class="supplier-stats">
                    <div class="supplier-stat">
                        <div class="supplier-stat-value">${sipCount}</div>
                        <div class="supplier-stat-label">SIP</div>
                    </div>
                    <div class="supplier-stat">
                        <div class="supplier-stat-value">${problemCount}</div>
                        <div class="supplier-stat-label">Проблем</div>
                    </div>
                    <div class="supplier-stat" style="grid-column: 1/-1;">
                        <div class="supplier-stat-value">${healthIndex}</div>
                        <div class="supplier-stat-label">Индекс (проблем/SIP)</div>
                    </div>
                </div>
            </div>
        `;
    });

    document.getElementById('suppliersList').innerHTML = html;

    document.getElementById('supplierFilter').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.supplier-card').forEach(card => {
            const name = card.getAttribute('data-name');
            card.style.display = name.includes(query) ? 'block' : 'none';
        });
    });
}

// ════════════════════════════════════════ TABS ════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Первоначальная загрузка
window.addEventListener('load', () => {
    loadData();
    // Автообновление каждые 30 секунд
    setInterval(loadData, 30000);
});