/* ════════════════════════════════════════════
   FLOWBUDGET — app.js (Universal Version)
   ════════════════════════════════════════════ */

// ── CONFIG & STATE ────────────────────────────
const STORAGE_URL_KEY  = 'flowbudget_gas_url';
const STORAGE_USER_KEY = 'flowbudget_user';

let GAS_URL = localStorage.getItem(STORAGE_URL_KEY) || '';
let currentUser = localStorage.getItem(STORAGE_USER_KEY) || '';

let currentMonth = new Date().getMonth() + 1;
let currentYear  = new Date().getFullYear();

let lineChart  = null;
let donutChart = null;
let barChart   = null;

const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

const CAT_COLORS = [
  '#4af0a8','#4a8fff','#ff5f7e','#ffb84a','#a78bfa','#34d399',
  '#f472b6','#38bdf8','#fb923c','#a3e635','#e879f9','#22d3ee'
];

// ── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  document.getElementById('exp-date').value  = today.toISOString().split('T')[0];
  document.getElementById('inc-month').value = today.getMonth() + 1;
  document.getElementById('inc-year').value  = today.getFullYear();

  if (GAS_URL && currentUser) {
    startApp();
  } else {
    document.getElementById('login-overlay').style.display = 'flex';
  }

  updateMonthDisplay();
  Charts.initEmpty();
});

// ── API — SOLO GET ────────────────────────────
async function api(params = {}) {
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow'
  });

  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  const json = JSON.parse(text);
  if (json.error) throw new Error(json.error);
  return json;
}

// ── AUTH Y CONEXIÓN ───────────────────────────
async function connectDatabase() {
  const name = document.getElementById('user-name-input').value.trim();
  const url = document.getElementById('user-url-input').value.trim();
  
  if (!name) return toast('Ingresa tu nombre', 'error');
  if (!url.includes('script.google.com')) return toast('Ingresa una URL válida de Apps Script', 'error');

  const btn = document.querySelector('#login-overlay .btn-primary');
  btn.textContent = 'Verificando...';
  
  try {
    const testUrl = new URL(url);
    testUrl.searchParams.set('action', 'ping');
    const res = await fetch(testUrl.toString(), { method: 'GET', redirect: 'follow' });
    const json = await res.json();
    
    if (json.ok) {
      currentUser = name;
      GAS_URL = url;
      localStorage.setItem(STORAGE_USER_KEY, name);
      localStorage.setItem(STORAGE_URL_KEY, url);
      toast('¡Conexión exitosa!', 'success');
      startApp();
    } else {
      toast('La URL no devolvió la respuesta correcta', 'error');
    }
  } catch (error) {
    toast('Error conectando. Revisa el enlace.', 'error');
  } finally {
    btn.textContent = 'Conectar Sistema →';
  }
}

function startApp() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const initials = currentUser.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('top-avatar').textContent = initials;
  document.getElementById('top-username').textContent = currentUser.split(' ')[0];
  document.getElementById('sidebar-user').textContent = currentUser;
  
  document.getElementById('gas-url').value = GAS_URL;
  document.getElementById('settings-user-info').textContent = 'Conectado a la BD de: ' + currentUser;

  refreshDashboard();
  loadIncomeHistory();
}

function logoutUser() {
  localStorage.removeItem(STORAGE_USER_KEY);
  localStorage.removeItem(STORAGE_URL_KEY);
  location.reload();
}

// ── NAVIGATION ────────────────────────────────
const PAGE_TITLES = {
  'dashboard':   '📊 Dashboard',
  'add-expense': '➕ Agregar Gasto',
  'expenses':    '📋 Mis Gastos',
  'income':      '💰 Ingreso Mensual',
  'settings':    '⚙️ Configuración'
};

function toggleMenu() {
  document.getElementById('sidebar').classList.toggle('open');
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.classList.toggle('show');
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[id] || id;

  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.trim().includes((PAGE_TITLES[id] || '').slice(2))) {
      n.classList.add('active');
    }
  });

  // Cerrar menú en móviles al seleccionar una opción
  if (window.innerWidth <= 900) {
    document.getElementById('sidebar').classList.remove('open');
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  if (id === 'expenses') loadExpenses();
  if (id === 'income')   loadIncomeHistory();
}

function changeMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 12) { currentMonth = 1;  currentYear++; }
  if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
  updateMonthDisplay();
  refreshDashboard();
}

function updateMonthDisplay() {
  const label = MONTHS_ES[currentMonth - 1] + ' ' + currentYear;
  document.getElementById('month-display').textContent = label;
  const m2 = document.getElementById('month-display-2');
  if (m2) m2.textContent = label;
}

// ── DASHBOARD ─────────────────────────────────
async function refreshDashboard() {
  if (!currentUser) return;
  showLoader('Actualizando dashboard…');
  try {
    const data = await api({ action: 'getDashboard', month: currentMonth, year: currentYear });
    renderDashboard(data);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

function renderDashboard(d) {
  const income  = d.income     || 0;
  const spent   = d.totalSpent || 0;
  const balance = income - spent;
  const pct     = income > 0 ? Math.round(spent / income * 100) : 0;
  const count   = d.expenses   ? d.expenses.length : 0;

  document.getElementById('dash-income').textContent     = fmt(income);
  document.getElementById('dash-spent').textContent      = fmt(spent);
  document.getElementById('dash-balance').textContent    = fmt(balance);
  document.getElementById('dash-daily').textContent      = fmt(d.dailyAvg || 0);
  document.getElementById('dash-pct-badge').textContent  = pct + '% del ingreso';
  document.getElementById('dash-days-badge').textContent = count + ' gastos';

  const daysLeft = daysInMonth(currentMonth, currentYear) - new Date().getDate();
  document.getElementById('dash-balance-badge').textContent =
    daysLeft >= 0 ? daysLeft + ' días restantes' : 'Mes pasado';

  const balBadge = document.getElementById('dash-balance-badge');
  balBadge.style.cssText = balance < 0
    ? 'background:rgba(255,95,126,.15);color:#ff5f7e'
    : 'background:rgba(74,143,255,.15);color:var(--accent2)';

  Charts.renderLine(d.dailyData   || [], income, currentMonth, currentYear);
  Charts.renderDonut(d.byCategory || {});
  Charts.renderBar(d.dailyData    || []);
  renderBudgetBars(d.byCategory   || {});
  renderTopExpenses(d.topExpenses || []);
}

function renderBudgetBars(byCat) {
  const wrap = document.getElementById('budget-bars');
  if (!Object.keys(byCat).length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px 0;"><div class="empty-sub">Sin datos este mes</div></div>';
    return;
  }
  const total  = Object.values(byCat).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  wrap.innerHTML = sorted.map(([cat, val]) => {
    const pct   = total > 0 ? Math.min(100, Math.round(val / total * 100)) : 0;
    const color = pct > 70 ? 'var(--danger)' : pct > 45 ? 'var(--warn)' : 'var(--accent)';
    return `
      <div class="budget-bar-wrap">
        <div class="budget-bar-label">
          <span>${cat}</span><span>${fmt(val)} (${pct}%)</span>
        </div>
        <div class="budget-bar">
          <div class="budget-bar-fill" style="width:${pct}%;background:${color};"></div>
        </div>
      </div>`;
  }).join('');
}

function renderTopExpenses(topList) {
  const wrap = document.getElementById('top-expenses-list');
  if (!topList.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:20px 0;"><div class="empty-sub">Sin gastos mayores</div></div>';
    return;
  }
  
  wrap.innerHTML = topList.map(e => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border);">
      <div style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-weight:600; font-size:.9rem; color:var(--text);">${e.description || 'Sin descripción'}</span>
        <span class="cat-tag" style="width:fit-content; font-size:.7rem;">${e.category}</span>
      </div>
      <span style="font-family:var(--font-head); font-weight:700; color:var(--danger);">${fmt(e.amount)}</span>
    </div>
  `).join('');
}

// ── GASTOS ────────────────────────────────────
async function addExpense() {
  const date   = document.getElementById('exp-date').value;
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const cat    = document.getElementById('exp-category').value;
  const desc   = document.getElementById('exp-desc').value.trim();

  if (!date)              return toast('Selecciona una fecha', 'error');
  if (!amount || amount <= 0) return toast('Ingresa un monto válido', 'error');
  if (!cat)               return toast('Selecciona una categoría', 'error');

  showLoader('Guardando gasto…');
  try {
    await api({
      action:      'addExpense',
      date,
      amount,
      category:    cat,
      description: desc
    });
    toast('✅ Gasto registrado: ' + fmt(amount), 'success');
    document.getElementById('exp-amount').value   = '';
    document.getElementById('exp-desc').value     = '';
    document.getElementById('exp-category').value = '';
    refreshDashboard();
    showPage('dashboard');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function loadExpenses() {
  if (!currentUser) return;
  showLoader('Cargando gastos…');
  try {
    const data = await api({ action: 'getExpenses', month: currentMonth, year: currentYear });
    renderExpensesTable(data.expenses || []);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expenses-tbody');
  document.getElementById('exp-count-label').textContent = expenses.length + ' registros';

  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="4">
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">Sin gastos este mes</div>
        <div class="empty-sub">Agrega tu primer gasto</div>
      </div>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td style="color:var(--muted);font-size:.82rem;">${fmtDate(e.date)}</td>
      <td>${e.description || '—'}</td>
      <td><span class="cat-tag">${e.category}</span></td>
      <td style="text-align:right;font-family:var(--font-head);font-weight:700;color:var(--danger);">${fmt(e.amount)}</td>
    </tr>
  `).join('');
}

// ── INGRESOS ──────────────────────────────────
async function saveIncome() {
  const month  = document.getElementById('inc-month').value;
  const year   = document.getElementById('inc-year').value;
  const amount = parseFloat(document.getElementById('inc-amount').value);
  const source = document.getElementById('inc-source').value.trim();

  if (!amount || amount <= 0) return toast('Ingresa un monto válido', 'error');

  showLoader('Sumando ingreso al mes…');
  try {
    await api({ action: 'addIncome', month, year, amount, source });
    toast('✅ Ingreso sumado: ' + fmt(amount), 'success');
    loadIncomeHistory();
    refreshDashboard();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    hideLoader();
  }
}

async function loadIncomeHistory() {
  if (!currentUser) return;
  const wrap = document.getElementById('income-history');
  try {
    const data = await api({ action: 'getIncomes' });
    if (data.incomes && data.incomes.length) {
      wrap.innerHTML = data.incomes.map(i => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 0;border-bottom:1px solid var(--border);">
          <span>${MONTHS_ES[i.month - 1]} ${i.year}${i.source ? ' · ' + i.source : ''}</span>
          <span style="font-family:var(--font-head);font-weight:700;color:var(--accent);">${fmt(i.amount)}</span>
        </div>
      `).join('');
    } else {
      wrap.innerHTML = 'Aún no tienes ingresos registrados.';
    }
  } catch (e) {
    wrap.innerHTML = 'No se pudo cargar.';
  }
}

// ── SETTINGS ─────────────────────────────────
function saveGasUrl() {
  const url = document.getElementById('gas-url').value.trim();
  if (!url) return toast('Ingresa una URL válida', 'error');
  GAS_URL = url;
  localStorage.setItem(STORAGE_URL_KEY, url);
  toast('URL guardada', 'success');
}

async function testConnection() {
  saveGasUrl();
  const status = document.getElementById('conn-status');
  status.textContent = 'Probando…';
  try {
    const data = await api({ action: 'ping' });
    status.textContent = '✅ Conexión exitosa — ' + (data.message || 'OK');
    status.style.color = 'var(--accent)';
  } catch (e) {
    status.textContent = '❌ Error: ' + e.message;
    status.style.color = 'var(--danger)';
  }
}

// ── CHARTS ────────────────────────────────────
const Charts = {
  initEmpty() {
    this.renderLine([], 0, currentMonth, currentYear);
    this.renderDonut({});
    this.renderBar([]);
  },

  renderLine(dailyData, income, month, year) {
    if (lineChart) lineChart.destroy();
    const days        = daysInMonth(month, year);
    const labels      = Array.from({ length: days }, (_, i) => i + 1);
    const dailyBudget = income > 0 ? income / days : 0;

    const actMap = {};
    (dailyData || []).forEach(d => {
      const day = new Date(d.date).getDate();
      actMap[day] = (actMap[day] || 0) + d.amount;
    });

    let cum = 0;
    const today       = new Date();
    const isThisMonth = month === today.getMonth() + 1 && year === today.getFullYear();
    const cumActual   = labels.map(d => {
      if (actMap[d]) cum += actMap[d];
      return (!isThisMonth || d <= today.getDate()) ? cum : null;
    });
    const cumBudget = labels.map(d => +(dailyBudget * d).toFixed(2));

    lineChart = new Chart(
      document.getElementById('lineChart').getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Gasto Acumulado',
              data: cumActual,
              borderColor: '#ff5f7e',
              backgroundColor: 'rgba(255,95,126,.08)',
              fill: true, tension: .4, pointRadius: 0,
              pointHoverRadius: 5, borderWidth: 2,
            },
            {
              label: 'Presupuesto Ideal',
              data: cumBudget,
              borderColor: '#4af0a8',
              borderDash: [6, 3], fill: false,
              pointRadius: 0, borderWidth: 1.5,
            }
          ]
        },
        options: chartOpts({ currency: true })
      }
    );
  },

  renderDonut(byCat) {
    if (donutChart) donutChart.destroy();
    const labels = Object.keys(byCat);
    const values = Object.values(byCat);
    const ctx    = document.getElementById('donutChart').getContext('2d');

    if (!labels.length) {
      donutChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ['Sin datos'], datasets: [{ data: [1], backgroundColor: ['#242e3e'], borderWidth: 0 }] },
        options: { ...chartOpts(), cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
      });
      return;
    }
    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: CAT_COLORS.slice(0, labels.length), borderWidth: 0, hoverOffset: 6 }]
      },
      options: {
        ...chartOpts({ currency: true }),
        cutout: '68%',
        plugins: {
          legend: {
            display: true, position: 'right',
            labels: { color: '#6b7a90', font: { family: 'DM Sans', size: 11 }, boxWidth: 10, padding: 10 }
          }
        }
      }
    });
  },

  renderBar(dailyData) {
    if (barChart) barChart.destroy();
    const dayMap = {};
    (dailyData || []).forEach(d => {
      const day = new Date(d.date).getDate();
      dayMap[day] = (dayMap[day] || 0) + d.amount;
    });
    const labels = Object.keys(dayMap).map(Number).sort((a, b) => a - b);
    const values = labels.map(d => dayMap[d]);

    barChart = new Chart(
      document.getElementById('barChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Gasto del día',
            data: values,
            backgroundColor: values.map(v => v > 200 ? 'rgba(255,95,126,.7)' : 'rgba(74,143,255,.6)'),
            borderRadius: 4, borderSkipped: false,
          }]
        },
        options: chartOpts({ currency: true })
      }
    );
  }
};

function chartOpts({ currency = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#6b7a90', font: { family: 'DM Sans', size: 11 } } },
      tooltip: {
        backgroundColor: '#1a2130', borderColor: '#242e3e', borderWidth: 1,
        titleColor: '#e8edf5', bodyColor: '#6b7a90',
        callbacks: currency ? { label: ctx => ' S/ ' + fmt2(ctx.parsed.y ?? ctx.parsed) } : {}
      }
    },
    scales: {
      x: { grid: { color: '#1a2130' }, ticks: { color: '#6b7a90', font: { family: 'DM Sans' } } },
      y: {
        grid: { color: 'rgba(36,46,62,.5)' },
        ticks: { color: '#6b7a90', font: { family: 'DM Sans' }, callback: v => currency ? 'S/' + fmt2(v) : v }
      }
    }
  };
}

// ── HELPERS ───────────────────────────────────
function fmt(n)  { return 'S/ ' + (n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmt2(n) { return (n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysInMonth(m, y) { return new Date(y, m, 0).getDate(); }

function showLoader(msg) {
  document.getElementById('loader-msg').textContent = msg || 'Cargando…';
  document.getElementById('loader').classList.add('show');
}
function hideLoader() {
  document.getElementById('loader').classList.remove('show');
}

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast');
  const el   = document.createElement('div');
  el.className = 'toast-item ' + type;
  const icons  = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || '💬'}</span> ${msg}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}