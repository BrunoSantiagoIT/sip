let globalData = {};
let chartsInstances = {};
let supplierChartMode = 'all';

// ════════════════════════════════════════ TIME UTILS (UTC+3) ════════════════════════════════════════

function getTodayStartTs() {
    const offsetMs = 3 * 60 * 60 * 1000;
    const kyivMs = Date.now() + offsetMs;
    const startOfDayKyivMs = kyivMs - (kyivMs % 86400000);
    return Math.floor((startOfDayKyivMs - offsetMs) / 1000);
}

function getYesterdayStartTs() { return getTodayStartTs() - 86400; }

function getWeekStartTs() {
    const today = getTodayStartTs();
    const dayDate = new Date((today + 3 * 3600) * 1000);
    const jsDay = dayDate.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
    const daysSinceMonday = (jsDay + 6) % 7;
    return today - daysSinceMonday * 86400;
}

function formatKyivDateTime(ts) {
    if (!ts) return null;
    const d = new Date((ts + 3 * 3600) * 1000);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const mon = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yr = d.getUTCFullYear();
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day}.${mon}.${yr} ${h}:${m}`;
}

function formatKyivDateShort(ts) {
    if (!ts) return null;
    const d = new Date((ts + 3 * 3600) * 1000);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const mon = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yr = d.getUTCFullYear();
    return `${day}.${mon}.${yr}`;
}

// ════════════════════════════════════════ DATA LOAD ════════════════════════════════════════

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

function updateLastUpdate() {
    const meta = globalData._meta;
    if (meta && meta.updated_at) {
        document.getElementById('lastUpdate').textContent = `Последнее обновление: ${meta.updated_at}`;
        document.getElementById('syncStatus').textContent = '✅ Синхронизировано';
    }
}

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
    const notesStats = globalData.notes_stats || [];

    // SIP подсчёты
    const totalSips = Object.keys(sips).length;
    const freeSips = Object.values(sips).filter(s => !s.assigned_to && !s.multisip).length;
    const busySips = Object.values(sips).filter(s => s.assigned_to && !s.multisip).length;
    const multiSips = Object.values(suppliers).filter(s => s.multisip).length;

    // Проблемы — базовые
    const totalProblems = Object.keys(problems).length;
    const openProblems = Object.values(problems).filter(p => p.status === 'open').length;

    // Временные границы UTC+3
    const todayStart = getTodayStartTs();
    const yesterdayStart = getYesterdayStartTs();
    const weekStart = getWeekStartTs();

    const todayProblems = Object.values(problems)
        .filter(p => (p.created_at || 0) >= todayStart).length;

    const yesterdayProblems = Object.values(problems)
        .filter(p => { const ts = p.created_at || 0; return ts >= yesterdayStart && ts < todayStart; }).length;

    const weekProblems = Object.values(problems)
        .filter(p => (p.created_at || 0) >= weekStart).length;

    // Оценки
    const avgRating = ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
        : '—';

    // Подписи периодов
    const yesterdayDate = formatKyivDateShort(yesterdayStart + 43200);
    const weekStartDate = formatKyivDateShort(weekStart + 43200);

    // Обновление DOM
    document.getElementById('totalSips').textContent = totalSips;
    document.getElementById('freeSips').textContent = freeSips;
    document.getElementById('busySips').textContent = busySips;
    document.getElementById('multiSips').textContent = multiSips;

    document.getElementById('totalProblems').textContent = totalProblems;
    document.getElementById('todayProblems').textContent = todayProblems;
    document.getElementById('openProblems').textContent = openProblems;
    document.getElementById('yesterdayProblems').textContent = yesterdayProblems;
    document.getElementById('weekProblems').textContent = weekProblems;

    document.getElementById('totalUsers').textContent = notesStats.length;
    document.getElementById('avgRating').textContent = avgRating + ' ⭐';
    document.getElementById('totalRatings').textContent = ratings.length;
    document.getElementById('totalSuppliers').textContent = Object.keys(suppliers).length;

    // Динамические подписи периодов
    const ylEl = document.getElementById('yesterdayLabel');
    if (ylEl) ylEl.textContent = yesterdayDate || '—';
    const wlEl = document.getElementById('weekLabel');
    if (wlEl) wlEl.textContent = weekStartDate ? `с ${weekStartDate}` : '—';

    updateCharts();
    updateCategoryStats();
}

// ════════════════════════════════════════ CHARTS ════════════════════════════════════════

function updateCharts() {
    buildSuppliersChart(supplierChartMode);

    const suppliers = globalData.suppliers || {};
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

function buildSuppliersChart(mode) {
    const problems = globalData.problems || {};
    const suppliersData = {};
    const todayStart = getTodayStartTs();

    Object.values(problems).forEach(p => {
        if (mode === 'day' && (p.created_at || 0) < todayStart) return;
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
}

// ════════════════════════════════════════ CATEGORY STATS ════════════════════════════════════════

function updateCategoryStats() {
    const sips = globalData.sips || {};
    const stats = {
        '📞 Холодка': Object.values(sips).filter(s => !s.category || s.category === 'холодка').length,
        '🏛 Госы': Object.values(sips).filter(s => s.category === 'госы').length,
        '📥 Входяшка': Object.values(sips).filter(s => s.category === 'входяшка').length,
    };

    let html = '';
    for (const [label, count] of Object.entries(stats)) {
        const total = Object.keys(sips).length || 1;
        const pct = Math.round((count / total) * 100);
        html += `
            <div class="category-stat">
                <div class="category-label">${label}</div>
                <div class="category-value">${count}</div>
                <div class="category-bar">
                    <div class="category-bar-fill" style="width: ${pct}%; background: ${
                        label.includes('Холодка') ? '#FF9800' :
                        label.includes('Госы') ? '#673AB7' : '#00BCD4'
                    }"></div>
                </div>
                <div class="category-pct">${pct}%</div>
            </div>
        `;
    }

    document.getElementById('categoryStats').innerHTML = html;
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
        const category = sip.category || 'холодка';

        html += `
            <div class="sip-card" data-status="${status}" data-category="${category}">
                <div class="sip-header">
                    <span class="sip-number">${sip.number}</span>
                    <span class="sip-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="sip-info">
                    <div><span class="info-label">Поставщик:</span> ${sup.name || '?'}</div>
                    <div><span class="info-label">Категория:</span> ${getCategoryIcon(category)} ${category}</div>
                </div>
            </div>
        `;
    });

    document.getElementById('sipsList').innerHTML = html;

    document.getElementById('sipFilter').addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase();
        const status = document.getElementById('sipStatusFilter').value;
        const category = document.getElementById('sipCategoryFilter').value;
        filterSips(query, status, category);
    }, 300));

    document.getElementById('sipStatusFilter').addEventListener('change', (e) => {
        const query = document.getElementById('sipFilter').value.toLowerCase();
        const category = document.getElementById('sipCategoryFilter').value;
        filterSips(query, e.target.value, category);
    });

    document.getElementById('sipCategoryFilter').addEventListener('change', (e) => {
        const query = document.getElementById('sipFilter').value.toLowerCase();
        const status = document.getElementById('sipStatusFilter').value;
        filterSips(query, status, e.target.value);
    });
}

function filterSips(query, status, category) {
    document.querySelectorAll('.sip-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        const cardStatus = card.getAttribute('data-status');
        const cardCategory = card.getAttribute('data-category');

        const matchesText = text.includes(query);
        const matchesStatus = status === 'all' || cardStatus === status;
        const matchesCategory = category === 'all' || cardCategory === category;

        card.style.display = (matchesText && matchesStatus && matchesCategory) ? 'block' : 'none';
    });
}

function getCategoryIcon(category) {
    const icons = {
        'холодка': '📞',
        'госы': '🏛',
        'входяшка': '📥'
    };
    return icons[category] || '📞';
}

// ════════════════════════════════════════ NOTES/TEAM ════════════════════════════════════════

function updateNotesList() {
    const notesList = globalData.notes_stats || [];
    const sips = globalData.sips || {};
    const suppliers = globalData.suppliers || {};
    let html = '';

    notesList.forEach((note) => {
        if (!note || !note.display) return;

        const lastActive = note.last_active
            ? new Date(note.last_active * 1000).toLocaleString('ru-RU')
            : 'никогда';

        const displayLower = (note.display || '').toLowerCase();
        const currentSips = Object.entries(sips).filter(([sid, sip]) => {
            return sip && sip.assigned_to && sip.assigned_to.toLowerCase() === displayLower;
        }).map(([sid, sip]) => {
            const sup = suppliers[sip.supplier_id] || {};
            const catIcon = getCategoryIcon(sip.category || 'холодка');
            return `<span class="sip-tag" title="${sup.name}">${sip.number} ${catIcon}</span>`;
        }).join('');

        html += `
            <div class="note-card" data-name="${note.display.toLowerCase()}">
                <div class="note-header">
                    <span class="note-name">👤 ${note.display}</span>
                    <span class="note-updated" title="Время последней активности">🕐 ${lastActive}</span>
                </div>
                <div class="note-stats">
                    <div class="note-stat">
                        <div class="note-stat-value">${note.problems_total || 0}</div>
                        <div class="note-stat-label">Всего проблем</div>
                    </div>
                    <div class="note-stat">
                        <div class="note-stat-value">${note.problems_today || 0}</div>
                        <div class="note-stat-label">Сегодня</div>
                    </div>
                </div>
                ${currentSips ? `<div class="note-sips"><div class="note-sips-label">📱 Текущие SIP:</div>${currentSips}</div>` : '<div class="note-sips-empty">📱 Нет текущих SIP</div>'}
            </div>
        `;
    });

    document.getElementById('notesList').innerHTML = html || '<p style="padding: 20px; text-align: center; color: #999;">📝 Нет данных о работниках</p>';

    document.getElementById('notesFilter').addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase();
        filterNotes(query);
    }, 300));
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
        if (!problem) return;

        const statusLabel = problem.status === 'open' ? '🔴 Открыта' : '✅ Закрыта';
        const statusClass = `status-${problem.status}`;
        const createdDate = problem.created_at ? formatKyivDateTime(problem.created_at) : null;
        const displayName = problem.display_name || problem.user_name || '?';

        html += `
            <div class="problem-item" data-status="${problem.status}">
                <div class="problem-info">
                    <h3>#${id} — ${displayName}</h3>
                    <div class="problem-meta">
                        <div>📞 ${problem.sip_number || '—'} | ${problem.supplier_name || '—'}</div>
                        <div>📝 ${(problem.text || '').substring(0, 100)}${(problem.text || '').length > 100 ? '...' : ''}</div>
                        ${createdDate ? `<div class="problem-date">🕐 Создана: ${createdDate}</div>` : ''}
                    </div>
                </div>
                <span class="problem-status ${statusClass}">${statusLabel}</span>
            </div>
        `;
    });

    document.getElementById('problemsList').innerHTML = html;

    document.getElementById('problemFilter').addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase();
        const status = document.getElementById('problemStatusFilter').value;
        filterProblems(query, status);
    }, 300));

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
        if (!supplier) return;

        const sipCount = Object.values(sips).filter(s => s.supplier_id === supplier.id).length;
        const problemCount = Object.values(problems).filter(p => p.supplier_name === supplier.name).length;
        const healthIndex = sipCount > 0 ? (problemCount / sipCount).toFixed(2) : 0;

        let healthColor = healthIndex < 0.8 ? '#4CAF50' : (healthIndex <= 1.2 ? '#FF9800' : '#F44336');

        html += `
            <div class="supplier-card" data-name="${(supplier.name || '').toLowerCase()}">
                <div class="supplier-name">🏢 ${supplier.name || '?'}</div>
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
                        <div class="supplier-stat-value" style="color: ${healthColor};">${healthIndex}</div>
                        <div class="supplier-stat-label">Индекс (п/S) — за всё время</div>
                    </div>
                </div>
            </div>
        `;
    });

    document.getElementById('suppliersList').innerHTML = html;

    document.getElementById('supplierFilter').addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.supplier-card').forEach(card => {
            const name = card.getAttribute('data-name');
            card.style.display = name.includes(query) ? 'block' : 'none';
        });
    }, 300));
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

// ════════════════════════════════════════ DEBOUNCE ════════════════════════════════════════

function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// ════════════════════════════════════════ INIT ════════════════════════════════════════

window.addEventListener('load', () => {
    loadData();
    setInterval(loadData, 15000);

    document.getElementById('supplierChartAllBtn').addEventListener('click', () => {
        supplierChartMode = 'all';
        document.getElementById('supplierChartAllBtn').classList.add('active');
        document.getElementById('supplierChartDayBtn').classList.remove('active');
        buildSuppliersChart('all');
    });

    document.getElementById('supplierChartDayBtn').addEventListener('click', () => {
        supplierChartMode = 'day';
        document.getElementById('supplierChartDayBtn').classList.add('active');
        document.getElementById('supplierChartAllBtn').classList.remove('active');
        buildSuppliersChart('day');
    });
});
