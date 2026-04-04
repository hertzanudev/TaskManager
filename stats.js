// ===================== STATISTICS SCREEN =====================
// מסך סטטיסטיקה עם Chart.js

let chartBar  = null;
let chartLine = null;

// ── SCREEN 6: Statistics ───────────────────────────────
function renderStats() {
  const content  = document.getElementById('content');
  const today    = getTodayKey();
  // ברירת מחדל: 30 ימים אחורה
  const dateFrom = new Date(Date.now() - 29 * 86400000).toISOString().split('T')[0];

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">📊 סטטיסטיקה</h1>
      </div>

      <div class="stats-controls">
        <span class="filter-label">תקופה:</span>
        <span class="filter-label">מ:</span>
        <input type="date" class="date-input" id="stats-from" value="${dateFrom}">
        <span class="filter-label">עד:</span>
        <input type="date" class="date-input" id="stats-to"   value="${today}">
        <button class="btn btn-primary btn-sm" onclick="loadStats()">הצג</button>
      </div>

      <div class="charts-grid">
        <div class="chart-card">
          <h3>משימות לפי עובד (נפתחו vs. הושלמו)</h3>
          <div class="chart-wrapper"><canvas id="chart-bar"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>מגמת משימות יומית</h3>
          <div class="chart-wrapper"><canvas id="chart-line"></canvas></div>
        </div>
      </div>

      <div class="summary-table-wrap">
        <table class="summary-table" id="summary-table">
          <thead>
            <tr>
              <th>עובד</th>
              <th>נפתחו</th>
              <th>הושלמו</th>
              <th>ממוצע זמן השלמה (שעות)</th>
              <th>ממוצע יומי (הושלמו)</th>
            </tr>
          </thead>
          <tbody id="summary-tbody"><tr><td colspan="5" class="text-muted" style="text-align:center;padding:16px">לחץ "הצג" לטעינת נתונים</td></tr></tbody>
        </table>
      </div>
    </div>`;

  loadStats();
}

function loadStats() {
  const fromInput = document.getElementById('stats-from');
  const toInput   = document.getElementById('stats-to');
  if (!fromInput || !toInput) return;

  const dateFrom = fromInput.value;
  const dateTo   = toInput.value;
  if (!dateFrom || !dateTo) return;

  const settings  = getSettings();
  const tasks     = getTasks();
  const employees = settings.employees;

  // משימות שהושלמו בטווח
  const completed = tasks.filter(t =>
    t.status === 'completed' &&
    t.completedAt &&
    toDateKey(t.completedAt) >= dateFrom &&
    toDateKey(t.completedAt) <= dateTo
  );

  // משימות שנפתחו בטווח (לפי createdAt), לא טיוטות
  const opened = tasks.filter(t =>
    t.status !== 'draft' &&
    t.createdAt &&
    toDateKey(t.createdAt) >= dateFrom &&
    toDateKey(t.createdAt) <= dateTo
  );

  // ── נתונים לגרף עמודות (לפי עובד) ─────────────────
  const empOpened    = {};
  const empCompleted = {};
  const empAvgTime   = {}; // מערך שעות
  employees.forEach(e => { empOpened[e] = 0; empCompleted[e] = 0; empAvgTime[e] = []; });

  opened.forEach(t => {
    if (empOpened[t.assignedTo] !== undefined) empOpened[t.assignedTo]++;
    else empOpened[t.assignedTo] = 1;
  });

  completed.forEach(t => {
    if (empCompleted[t.assignedTo] !== undefined) empCompleted[t.assignedTo]++;
    else empCompleted[t.assignedTo] = 1;

    // זמן השלמה בשעות
    if (t.createdAt && t.completedAt) {
      const hours = (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000;
      if (!empAvgTime[t.assignedTo]) empAvgTime[t.assignedTo] = [];
      empAvgTime[t.assignedTo].push(hours);
    }
  });

  // ── נתונים לגרף קווי (לפי ימים) ───────────────────
  const days    = getDaysRange(dateFrom, dateTo);
  const dayOpen = {};
  const dayComp = {};
  days.forEach(d => { dayOpen[d] = 0; dayComp[d] = 0; });

  opened.forEach(t => {
    const d = toDateKey(t.createdAt);
    if (dayOpen[d] !== undefined) dayOpen[d]++;
  });

  completed.forEach(t => {
    const d = toDateKey(t.completedAt);
    if (dayComp[d] !== undefined) dayComp[d]++;
  });

  // ── ימים בטווח לחישוב ממוצע יומי ──────────────────
  const numDays = Math.max(1, days.length);

  // ── ציור גרפים ─────────────────────────────────────
  drawBarChart(employees.length > 0 ? employees : Object.keys(empOpened), empOpened, empCompleted);
  drawLineChart(days, dayOpen, dayComp);

  // ── טבלת סיכום ─────────────────────────────────────
  const allEmployees = [...new Set([...employees, ...Object.keys(empOpened), ...Object.keys(empCompleted)])];
  const tbody = document.getElementById('summary-tbody');

  if (allEmployees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted" style="text-align:center;padding:16px">אין נתונים לתקופה זו</td></tr>`;
    return;
  }

  tbody.innerHTML = allEmployees.map(emp => {
    const opened_n   = empOpened[emp]    || 0;
    const comp_n     = empCompleted[emp] || 0;
    const times      = empAvgTime[emp]   || [];
    const avgTime    = times.length > 0 ? (times.reduce((a,b)=>a+b,0) / times.length).toFixed(1) : '—';
    const dailyAvg   = (comp_n / numDays).toFixed(2);
    return `<tr>
      <td><strong>${esc(emp)}</strong></td>
      <td>${opened_n}</td>
      <td>${comp_n}</td>
      <td>${avgTime !== '—' ? avgTime + ' שע\'' : '—'}</td>
      <td>${dailyAvg}</td>
    </tr>`;
  }).join('');
}

function drawBarChart(labels, openedMap, completedMap) {
  const ctx = document.getElementById('chart-bar');
  if (!ctx) return;

  if (chartBar) { chartBar.destroy(); chartBar = null; }

  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'נפתחו',
          data: labels.map(e => openedMap[e] || 0),
          backgroundColor: 'rgba(43,108,176,0.75)',
          borderRadius: 4
        },
        {
          label: 'הושלמו',
          data: labels.map(e => completedMap[e] || 0),
          backgroundColor: 'rgba(47,133,90,0.75)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', rtl: true, labels: { font: { family: 'Segoe UI, Arial Hebrew, Arial' } } }
      },
      scales: {
        x: { ticks: { font: { family: 'Segoe UI, Arial Hebrew, Arial' } } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Segoe UI, Arial Hebrew, Arial' } } }
      }
    }
  });
}

function drawLineChart(days, openMap, compMap) {
  const ctx = document.getElementById('chart-line');
  if (!ctx) return;

  if (chartLine) { chartLine.destroy(); chartLine = null; }

  // הצג תאריכים מקוצרים
  const shortDays = days.map(d => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
  });

  chartLine = new Chart(ctx, {
    type: 'line',
    data: {
      labels: shortDays,
      datasets: [
        {
          label: 'נפתחו',
          data: days.map(d => openMap[d] || 0),
          borderColor: 'rgba(43,108,176,1)',
          backgroundColor: 'rgba(43,108,176,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: days.length > 30 ? 0 : 3
        },
        {
          label: 'הושלמו',
          data: days.map(d => compMap[d] || 0),
          borderColor: 'rgba(47,133,90,1)',
          backgroundColor: 'rgba(47,133,90,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: days.length > 30 ? 0 : 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', rtl: true, labels: { font: { family: 'Segoe UI, Arial Hebrew, Arial' } } }
      },
      scales: {
        x: {
          ticks: {
            font: { family: 'Segoe UI, Arial Hebrew, Arial' },
            maxTicksLimit: 15,
            maxRotation: 45
          }
        },
        y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Segoe UI, Arial Hebrew, Arial' } } }
      }
    }
  });
}

// החזר מערך של תאריכי YYYY-MM-DD בין שני תאריכים
function getDaysRange(from, to) {
  const days = [];
  let cur    = new Date(from + 'T00:00:00');
  const end  = new Date(to   + 'T00:00:00');
  while (cur <= end) {
    days.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
