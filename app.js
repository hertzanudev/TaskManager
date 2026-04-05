// ===================== MAIN APPLICATION =====================
// Router, מסכים, אירועים, popup, toast

// ── State ──────────────────────────────────────────────
let editingTaskId    = null;  // null = משימה חדשה
let longPressTimer   = null;
let longPressTarget  = null;

// Filter state per screen
const filterState = {
  main:      { employees: [], categories: [] },
  completed: { employees: [], categories: [], dateFrom: '', dateTo: '' },
  deleted:   { employees: [], categories: [], dateFrom: '', dateTo: '' }
};

// ── Init ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // הצג סטטוס טעינה גלוי
  const loginErr = document.getElementById('login-error');
  if (loginErr) { loginErr.style.color = '#2563eb'; loginErr.textContent = '☁️ מתחבר לענן…'; }

  try {
    const url = getCloudUrl();
    console.log('[CLOUD] URL בשימוש:', url || '(ריק)');
    if (loginErr) loginErr.textContent = url ? `☁️ טוען מ-Firebase…` : '⚠️ Firebase URL לא מוגדר';

    const loaded = await cloudLoad();
    console.log('[CLOUD] cloudLoad הצליח:', loaded);
    if (loginErr) loginErr.textContent = loaded ? '✅ נטען מהענן' : '⚠️ הענן ריק – נטען מקומי';
  } catch (e) {
    console.warn('[CLOUD] cloudLoad נכשל:', e);
    if (loginErr) loginErr.textContent = '❌ שגיאת ענן: ' + e.message;
  }

  setTimeout(() => { if (loginErr) loginErr.textContent = ''; }, 3000);
  try {
    await initAuth();
  } catch (e) {
    logError('AUTH', 'initAuth נכשל עם חריגה בלתי צפויה', {
      error:   e?.message || String(e),
      stack:   e?.stack   || '—',
      cryptoAvailable: !!(window.crypto && window.crypto.subtle)
    });
    // הצג מסך כניסה בכל מקרה
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app').style.visibility = 'hidden';
    document.getElementById('login-error').textContent =
      'שגיאת אתחול – בדוק את קובץ הלוג';
  }
  window.addEventListener('hashchange', router);
  if (isAuthenticated()) router();

  // סנכרון אוטומטי כל 5 דקות – פעיל בין 05:00 ל-22:00 בלבד
  setInterval(async () => {
    if (!isAuthenticated()) return;
    const hour = new Date().getHours();
    if (hour < 5 || hour >= 22) {
      logDebug('CLOUD', `סנכרון אוטומטי דולג – שעה ${hour}:xx (מחוץ לשעות פעילות)`);
      return;
    }
    const loaded = await cloudLoad();
    if (loaded) {
      router();
      logDebug('CLOUD', 'סנכרון אוטומטי הושלם (כל 5 דקות)');
    }
  }, 5 * 60 * 1000);
});

// ── Router ─────────────────────────────────────────────
function router() {
  if (!isAuthenticated()) { showLoginScreen(); return; }

  const hash   = window.location.hash || '#main';
  const screen = hash.replace('#', '');

  // עדכן קישור פעיל בסיידבר
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.screen === screen || (screen === '' && a.dataset.screen === 'main'));
  });

  switch (screen) {
    case 'main':      renderMain();      break;
    case 'completed': renderCompleted(); break;
    case 'deleted':   renderDeleted();   break;
    case 'stats':     renderStats();     break;
    case 'search':    renderSearch();    break;
    case 'settings':  renderSettings();     break;
    case 'task-form': renderTaskForm();    break;
    case 'pdf-merge':    renderPdfMergerPage();  break;
    case 'instructions': renderInstructions();   break;
    default:             renderMain();           break;
  }
}

// ── Toast ──────────────────────────────────────────────
let toastTimeout = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.classList.remove('show'); }, 3000);
}

// ── Confirm Dialog ─────────────────────────────────────
function showConfirm(msg, onYes) {
  const overlay = document.getElementById('confirm-overlay');
  const dialog  = document.getElementById('confirm-dialog');
  overlay.classList.add('visible');
  dialog.classList.add('visible');
  dialog.innerHTML = `
    <h2>אישור פעולה</h2>
    <p class="confirm-text">${msg}</p>
    <div class="modal-actions">
      <button class="btn btn-danger" id="confirm-yes">אישור</button>
      <button class="btn btn-outline" id="confirm-no">ביטול</button>
    </div>`;
  document.getElementById('confirm-yes').onclick = () => { closeConfirm(); onYes(); };
  document.getElementById('confirm-no').onclick  = closeConfirm;
  overlay.onclick = closeConfirm;
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('visible');
  document.getElementById('confirm-dialog').classList.remove('visible');
}

// ── Popup (לחיצה ארוכה) ───────────────────────────────
function openPopup(taskId) {
  const task     = getTaskById(taskId);
  if (!task) return;
  const settings    = getSettings();
  const importanceBadge = getImportanceBadge(task.importance, settings) || '<span class="text-muted">—</span>';

  const statusMap = { open: 'פתוחה', completed: 'הושלמה', deleted: 'נמחקה', draft: 'טיוטה' };

  document.getElementById('popup').innerHTML = `
    <button class="popup-close" onclick="closePopup()" title="סגור">✕</button>
    <div class="popup-title">פרטי משימה</div>
    <div class="popup-field">
      <div class="popup-field-label">תאריך יצירה</div>
      <div class="popup-field-value">${formatDate(task.createdAt)}</div>
    </div>
    <div class="popup-field">
      <div class="popup-field-label">עובד</div>
      <div class="popup-field-value">${esc(task.assignedTo)}</div>
    </div>
    <div class="popup-field">
      <div class="popup-field-label">קטגוריה</div>
      <div class="popup-field-value">${esc(task.category)}</div>
    </div>
    <div class="popup-field">
      <div class="popup-field-label">לקוח</div>
      <div class="popup-field-value">${esc(task.client)}</div>
    </div>
    ${task.policyNumber ? `<div class="popup-field"><div class="popup-field-label">מספר פוליסה</div><div class="popup-field-value" dir="ltr">${esc(task.policyNumber)}</div></div>` : ''}
    ${task.idNumber     ? `<div class="popup-field"><div class="popup-field-label">ח.פ. / ת.ז</div><div class="popup-field-value" dir="ltr">${esc(task.idNumber)}</div></div>`     : ''}
    <div class="popup-field">
      <div class="popup-field-label">תיאור</div>
      <div class="popup-field-value">${esc(task.description || '—')}</div>
    </div>
    <div class="popup-field">
      <div class="popup-field-label">חשיבות</div>
      <div class="popup-field-value">${importanceBadge}</div>
    </div>
    <div class="popup-field">
      <div class="popup-field-label">סטטוס</div>
      <div class="popup-field-value">${statusMap[task.status] || task.status}</div>
    </div>
    ${task.completedAt ? `<div class="popup-field"><div class="popup-field-label">הושלם בתאריך</div><div class="popup-field-value">${formatDate(task.completedAt)}</div></div>` : ''}
    ${task.deletedAt   ? `<div class="popup-field"><div class="popup-field-label">נמחק בתאריך</div><div class="popup-field-value">${formatDate(task.deletedAt)}</div></div>` : ''}`;

  document.getElementById('popup-overlay').classList.add('visible');
  document.getElementById('popup').classList.add('visible');
}

function closePopup() {
  document.getElementById('popup-overlay').classList.remove('visible');
  document.getElementById('popup').classList.remove('visible');
}

// ── Long Press Detection ───────────────────────────────
function attachLongPress(row, taskId) {
  const start = (e) => {
    // אל תפעיל על כפתורי פעולה
    if (e.target.closest('.row-actions')) return;
    longPressTimer = setTimeout(() => { openPopup(taskId); }, 500);
  };
  const cancel = () => { clearTimeout(longPressTimer); };

  row.addEventListener('mousedown',  start);
  row.addEventListener('mouseup',    cancel);
  row.addEventListener('mouseleave', cancel);
  row.addEventListener('touchstart', start, { passive: true });
  row.addEventListener('touchend',   cancel);
  row.addEventListener('touchcancel',cancel);
}

// ── Helpers ────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function getImportanceBadge(importance, settings) {
  if (!importance) return '';
  const level = (settings.importanceLevels || []).find(l => l.key === importance);
  const color = level ? level.color : '#888';
  const label = level ? level.label : importance;
  return `<span class="importance-badge" style="background:${color}22;color:${color}">${esc(label)}</span>`;
}

// מחזיר { color, label } לרמת חשיבות נתונה
function getImportanceLevel(importance, settings) {
  if (!importance) return null;
  return (settings.importanceLevels || []).find(l => l.key === importance) || null;
}

// ── Multiselect Component ──────────────────────────────
function buildMultiselect(id, options, selected, placeholder, onChange) {
  const selectedSet = new Set(selected);
  const label = selectedSet.size === 0
    ? placeholder
    : selectedSet.size === options.length
      ? 'הכל'
      : [...selectedSet].join(', ');

  const badgeHtml = selectedSet.size > 0 && selectedSet.size < options.length
    ? `<span class="multiselect-badge">${selectedSet.size}</span>`
    : '';

  const optionsHtml = options.map(opt => `
    <label class="multiselect-option">
      <input type="checkbox" value="${esc(opt)}" ${selectedSet.has(opt) ? 'checked' : ''}>
      ${esc(opt)}
    </label>`).join('');

  return `
    <div class="multiselect-wrapper" id="ms-wrap-${id}">
      <div class="multiselect-trigger" id="ms-trigger-${id}">
        <span id="ms-label-${id}">${esc(label)}</span>
        ${badgeHtml ? `<span id="ms-badge-${id}">${badgeHtml}</span>` : `<span id="ms-badge-${id}"></span>`}
        <span class="multiselect-arrow">▼</span>
      </div>
      <div class="multiselect-dropdown" id="ms-drop-${id}">${optionsHtml}</div>
    </div>`;
}

function initMultiselect(id, options, placeholder, onChange) {
  const trigger  = document.getElementById(`ms-trigger-${id}`);
  const dropdown = document.getElementById(`ms-drop-${id}`);
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle('open');
    trigger.classList.toggle('open', isOpen);
  });

  dropdown.addEventListener('change', () => {
    const checks = dropdown.querySelectorAll('input[type="checkbox"]');
    const selected = [...checks].filter(c => c.checked).map(c => c.value);
    const label = document.getElementById(`ms-label-${id}`);
    const badge = document.getElementById(`ms-badge-${id}`);

    if (selected.length === 0 || selected.length === options.length) {
      label.textContent = selected.length === 0 ? placeholder : 'הכל';
      badge.innerHTML = '';
    } else {
      label.textContent = selected.join(', ');
      badge.innerHTML = `<span class="multiselect-badge">${selected.length}</span>`;
    }

    onChange(selected);
  });

  // סגור בלחיצה מחוץ
  document.addEventListener('click', (e) => {
    if (!document.getElementById(`ms-wrap-${id}`)?.contains(e.target)) {
      dropdown.classList.remove('open');
      trigger.classList.remove('open');
    }
  }, { capture: true });
}

// ── SCREEN 1: Main ─────────────────────────────────────
function renderMain() {
  const settings = getSettings();
  const tasks    = getTasks();
  const content  = document.getElementById('content');
  const fs       = filterState.main;

  const hasSetup = settings.employees.length > 0 && settings.categories.length > 0;

  // פילוג משימות
  let openTasks       = tasks.filter(t => t.status === 'open' || t.status === 'draft');
  let completedToday  = tasks.filter(t => t.status === 'completed' && isToday(t.completedAt));

  // סינון
  if (fs.employees.length > 0)   openTasks = openTasks.filter(t => fs.employees.includes(t.assignedTo));
  if (fs.categories.length > 0)  openTasks = openTasks.filter(t => fs.categories.includes(t.category));

  // מיון: דחוף ראשון, אח"כ לפי תאריך יצירה (ישן ראשון)
  const importanceOrder = { urgent: 0, daily: 1, flexible: 2, null: 3 };
  openTasks.sort((a, b) => {
    const ia = importanceOrder[a.importance] ?? 3;
    const ib = importanceOrder[b.importance] ?? 3;
    if (ia !== ib) return ia - ib;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  const filterHtml = hasSetup ? `
    <div class="filter-bar">
      <span class="filter-label">סינון:</span>
      ${buildMultiselect('main-emp',  settings.employees,  fs.employees,  'עובד – הכל',     v => { filterState.main.employees  = v; renderMain(); })}
      ${buildMultiselect('main-cat',  settings.categories, fs.categories, 'קטגוריה – הכל',  v => { filterState.main.categories = v; renderMain(); })}
      <button class="btn btn-sm btn-outline" onclick="clearMainFilters()">נקה סינונים</button>
    </div>` : '';

  const welcomeBanner = !hasSetup ? `
    <div class="welcome-banner">
      <div class="welcome-banner-icon">👋</div>
      <div class="welcome-banner-text">
        <h2>ברוך הבא! אנא הוסף עובדים וקטגוריות כדי להתחיל</h2>
        <p>לחץ על <strong>⚙️ הגדרות</strong> בתפריט כדי להגדיר את המערכת.</p>
      </div>
    </div>` : '';

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">ניהול משימות</h1>
        <div class="btn-header-actions">
          <button class="btn btn-outline" onclick="syncNow()" title="טען נתונים עדכניים מהענן">🔄 סנכרון</button>
          <button class="btn btn-outline" onclick="openExportDialog()">📥 יצוא לאקסל</button>
          <button class="btn btn-primary" onclick="startNewTask()">+ משימה חדשה</button>
        </div>
      </div>

      ${welcomeBanner}
      ${filterHtml}

      <!-- רשימת משימות פתוחות -->
      ${renderTaskTable(openTasks, 'main', settings)}

      <!-- משימות שהושלמו היום -->
      <div class="section-collapsible">
        <button class="section-toggle" id="today-toggle" onclick="toggleSection('today-body','today-toggle')">
          ✅ הושלמו היום
          <span class="badge-count">${completedToday.length}</span>
          <span class="toggle-arrow">▼</span>
        </button>
        <div class="section-body" id="today-body" style="display:none">
          ${renderTaskTable(completedToday, 'today', settings)}
        </div>
      </div>
    </div>`;

  // אתחול multiselects
  if (hasSetup) {
    initMultiselect('main-emp',  settings.employees,  'עובד – הכל',    v => { filterState.main.employees  = v; renderMain(); });
    initMultiselect('main-cat',  settings.categories, 'קטגוריה – הכל', v => { filterState.main.categories = v; renderMain(); });
  }

  attachTableEvents();
}

async function syncNow() {
  showToast('מסנכרן עם הענן…', 'info');
  const loaded = await cloudLoad();
  if (loaded) {
    showToast('סנכרון הושלם ✓');
    router();
  } else {
    showToast('לא ניתן להתחבר לענן', 'error');
  }
}

function clearMainFilters() {
  filterState.main.employees  = [];
  filterState.main.categories = [];
  renderMain();
}

function toggleSection(bodyId, toggleId) {
  const body   = document.getElementById(bodyId);
  const toggle = document.getElementById(toggleId);
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  toggle.classList.toggle('open', !isOpen);
}

// ── SCREEN 2: Completed ────────────────────────────────
function renderCompleted() {
  const settings = getSettings();
  const tasks    = getTasks();
  const fs       = filterState.completed;
  const content  = document.getElementById('content');

  let filtered = tasks.filter(t => t.status === 'completed' && !isToday(t.completedAt));

  if (fs.employees.length > 0) filtered = filtered.filter(t => fs.employees.includes(t.assignedTo));
  if (fs.categories.length > 0) filtered = filtered.filter(t => fs.categories.includes(t.category));
  if (fs.dateFrom) filtered = filtered.filter(t => toDateKey(t.completedAt) >= fs.dateFrom);
  if (fs.dateTo)   filtered = filtered.filter(t => toDateKey(t.completedAt) <= fs.dateTo);

  filtered.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">✅ משימות שהושלמו</h1>
      </div>
      <div class="filter-bar">
        <span class="filter-label">סינון:</span>
        ${buildMultiselect('comp-emp', settings.employees,  fs.employees,  'עובד – הכל',    v => { filterState.completed.employees  = v; renderCompleted(); })}
        ${buildMultiselect('comp-cat', settings.categories, fs.categories, 'קטגוריה – הכל', v => { filterState.completed.categories = v; renderCompleted(); })}
        <span class="filter-label">מ:</span>
        <input type="date" class="date-input" id="comp-from" value="${fs.dateFrom}" onchange="filterState.completed.dateFrom=this.value;renderCompleted()">
        <span class="filter-label">עד:</span>
        <input type="date" class="date-input" id="comp-to"   value="${fs.dateTo}"   onchange="filterState.completed.dateTo=this.value;renderCompleted()">
        <button class="btn btn-sm btn-outline" onclick="clearArchiveFilters('completed')">נקה סינונים</button>
      </div>
      ${renderTaskTable(filtered, 'completed', settings)}
    </div>`;

  initMultiselect('comp-emp', settings.employees,  'עובד – הכל',    v => { filterState.completed.employees  = v; renderCompleted(); });
  initMultiselect('comp-cat', settings.categories, 'קטגוריה – הכל', v => { filterState.completed.categories = v; renderCompleted(); });
  attachTableEvents();
}

// ── SCREEN 3: Deleted ──────────────────────────────────
function renderDeleted() {
  const settings = getSettings();
  const tasks    = getTasks();
  const fs       = filterState.deleted;
  const content  = document.getElementById('content');

  let filtered = tasks.filter(t => t.status === 'deleted');
  if (fs.employees.length > 0)  filtered = filtered.filter(t => fs.employees.includes(t.assignedTo));
  if (fs.categories.length > 0) filtered = filtered.filter(t => fs.categories.includes(t.category));
  if (fs.dateFrom) filtered = filtered.filter(t => toDateKey(t.deletedAt) >= fs.dateFrom);
  if (fs.dateTo)   filtered = filtered.filter(t => toDateKey(t.deletedAt) <= fs.dateTo);
  filtered.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">🗑 משימות שנמחקו</h1>
      </div>
      <div class="filter-bar">
        <span class="filter-label">סינון:</span>
        ${buildMultiselect('del-emp', settings.employees,  fs.employees,  'עובד – הכל',    v => { filterState.deleted.employees  = v; renderDeleted(); })}
        ${buildMultiselect('del-cat', settings.categories, fs.categories, 'קטגוריה – הכל', v => { filterState.deleted.categories = v; renderDeleted(); })}
        <span class="filter-label">מ:</span>
        <input type="date" class="date-input" id="del-from" value="${fs.dateFrom}" onchange="filterState.deleted.dateFrom=this.value;renderDeleted()">
        <span class="filter-label">עד:</span>
        <input type="date" class="date-input" id="del-to"   value="${fs.dateTo}"   onchange="filterState.deleted.dateTo=this.value;renderDeleted()">
        <button class="btn btn-sm btn-outline" onclick="clearArchiveFilters('deleted')">נקה סינונים</button>
      </div>
      ${renderTaskTable(filtered, 'deleted', settings)}
    </div>`;

  initMultiselect('del-emp', settings.employees,  'עובד – הכל',    v => { filterState.deleted.employees  = v; renderDeleted(); });
  initMultiselect('del-cat', settings.categories, 'קטגוריה – הכל', v => { filterState.deleted.categories = v; renderDeleted(); });
  attachTableEvents();
}

function clearArchiveFilters(screen) {
  filterState[screen].employees  = [];
  filterState[screen].categories = [];
  filterState[screen].dateFrom   = '';
  filterState[screen].dateTo     = '';
  if (screen === 'completed') renderCompleted();
  else renderDeleted();
}

// ── SCREEN: Search ────────────────────────────────────
let _searchQuery = '';

function renderSearch() {
  const content  = document.getElementById('content');
  const tasks    = getTasks();
  const settings = getSettings();
  const q        = _searchQuery.trim().toLowerCase();

  const statusLabel = { open: 'פתוחה', draft: 'טיוטה', completed: 'הושלמה', deleted: 'נמחקה' };
  const statusColor = { open: '#2563eb', draft: '#9ca3af', completed: '#059669', deleted: '#dc2626' };

  const matched = !q ? [] : tasks.filter(t => {
    return [t.client, t.assignedTo, t.category, t.description, t.policyNumber, t.idNumber]
      .some(v => (v || '').toLowerCase().includes(q));
  });

  const rows = matched.map(task => {
    const badge = getImportanceBadge(task.importance, settings);
    const status = task.status;
    const color  = statusColor[status] || '#888';
    const label  = statusLabel[status] || status;
    return `<tr data-id="${task.id}" data-action-row="true">
      <td><span style="background:${color}22;color:${color};padding:2px 8px;border-radius:12px;font-size:12px;white-space:nowrap">${label}</span></td>
      <td>${esc(task.assignedTo)}</td>
      <td>${esc(task.client)}
        ${task.policyNumber ? `<br><span class="cell-sub">פוליסה: ${esc(task.policyNumber)}</span>` : ''}
        ${task.idNumber     ? `<br><span class="cell-sub">ח.פ: ${esc(task.idNumber)}</span>`       : ''}
      </td>
      <td>${esc(task.category)}</td>
      <td class="task-desc-cell" title="${esc(task.description)}">${esc(truncate(task.description))}</td>
      <td>${badge}</td>
      <td>${formatDateOnly(task.createdAt)}</td>
    </tr>`;
  }).join('');

  const resultsHtml = !q
    ? `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">הזן טקסט לחיפוש</div></div>`
    : matched.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-title">לא נמצאו תוצאות עבור "${esc(q)}"</div></div>`
      : `<div class="task-table-wrap">
           <div style="font-size:13px;color:#6b7280;margin-bottom:8px">נמצאו ${matched.length} תוצאות</div>
           <table class="task-table">
             <thead><tr>
               <th>סטטוס</th><th>עובד</th><th>לקוח</th>
               <th>קטגוריה</th><th>תיאור</th><th>חשיבות</th><th>תאריך יצירה</th>
             </tr></thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`;

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">🔍 חיפוש משימות</h1>
      </div>
      <div style="max-width:520px;margin-bottom:20px">
        <input type="text" class="form-control" id="search-input"
               value="${esc(_searchQuery)}"
               placeholder="חפש לפי לקוח, עובד, קטגוריה, תיאור, פוליסה, ח.פ..."
               oninput="_searchQuery=this.value;renderSearch()"
               autofocus>
        <div style="font-size:12px;color:#9ca3af;margin-top:6px">מחפש בכל המשימות: פתוחות, הושלמו ונמחקו</div>
      </div>
      ${resultsHtml}
    </div>`;

  attachTableEvents();
  // שמור פוקוס בשדה החיפוש
  const inp = document.getElementById('search-input');
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}

// ── Table Renderer ─────────────────────────────────────
function renderTaskTable(tasks, mode, settings) {
  if (!tasks || tasks.length === 0) {
    return `<div class="task-table-wrap"><div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <div class="empty-state-title">אין משימות להצגה</div>
      <div class="empty-state-desc">${mode === 'main' ? 'לחץ "+ משימה חדשה" כדי להתחיל' : 'אין נתונים בטווח זה'}</div>
    </div></div>`;
  }

  const showComplete       = mode === 'main';
  const showDelete         = mode === 'main';
  const showRestore        = mode === 'completed' || mode === 'deleted';
  const showEdit           = mode === 'main' || mode === 'completed';
  const showPermDelete     = mode === 'deleted' || mode === 'completed';

  const dateCol = mode === 'completed' ? 'תאריך השלמה'
                : mode === 'deleted'   ? 'תאריך מחיקה'
                : 'תאריך יצירה';

  const rows = tasks.map(task => {
    const isDraft = task.status === 'draft';
    const dateVal = mode === 'completed' ? formatDateOnly(task.completedAt)
                  : mode === 'deleted'   ? formatDateOnly(task.deletedAt)
                  : formatDateOnly(task.createdAt);

    const importanceBadge = getImportanceBadge(task.importance, settings);

    const actions = `
      <div class="row-actions">
        ${showComplete && !isDraft ? `<button class="row-btn complete-btn" data-action="complete" data-id="${task.id}" title="סמן כהושלם">✓</button>` : ''}
        ${showDelete              ? `<button class="row-btn delete-btn"   data-action="delete"   data-id="${task.id}" title="מחק">🗑</button>` : ''}
        ${showEdit                ? `<button class="row-btn edit-btn"     data-action="edit"     data-id="${task.id}" title="ערוך">✏</button>` : ''}
        ${showRestore             ? `<button class="row-btn restore-btn"   data-action="restore"      data-id="${task.id}" title="שחזר">↩ שחזר</button>` : ''}
        ${showPermDelete          ? `<button class="row-btn perm-del-btn" data-action="perm-delete" data-id="${task.id}" title="מחק לצמיתות">🗑 מחק לצמיתות</button>` : ''}
      </div>`;

    return `<tr class="${isDraft ? 'draft-row' : ''}"
               data-id="${task.id}"
               data-action-row="true">
      <td data-label="תאריך">${dateVal}</td>
      <td data-label="עובד">${isDraft ? '<span class="draft-label">טיוטה</span>' : ''}${esc(task.assignedTo)}</td>
      <td data-label="קטגוריה">${esc(task.category)}</td>
      <td data-label="לקוח">
        ${esc(task.client)}
        ${task.policyNumber ? `<br><span class="cell-sub">פוליסה: ${esc(task.policyNumber)}</span>` : ''}
        ${task.idNumber     ? `<br><span class="cell-sub">ח.פ: ${esc(task.idNumber)}</span>`       : ''}
      </td>
      <td data-label="תיאור" class="task-desc-cell" title="${esc(task.description)}">${esc(truncate(task.description))}</td>
      <td data-label="חשיבות">${importanceBadge}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  return `
    <div class="task-table-wrap">
      <table class="task-table">
        <thead>
          <tr>
            <th>${dateCol}</th>
            <th>עובד</th>
            <th>קטגוריה</th>
            <th>לקוח</th>
            <th>תיאור</th>
            <th>חשיבות</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Table Event Delegation ─────────────────────────────
function attachTableEvents() {
  document.querySelectorAll('tbody tr[data-action-row]').forEach(row => {
    const taskId = row.dataset.id;

    // לחיצה כפולה → עריכה
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('.row-actions')) return;
      startEditTask(taskId);
    });

    // לחיצה ארוכה → popup
    attachLongPress(row, taskId);

    // כפתורי פעולה בשורה
    row.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRowAction(btn.dataset.action, taskId);
      });
    });
  });
}

function handleRowAction(action, taskId) {
  const task = getTaskById(taskId);
  const ctx  = { taskId, client: task?.client, employee: task?.assignedTo };
  switch (action) {
    case 'complete':
      showConfirm('לסמן את המשימה כהושלמה?', () => {
        completeTask(taskId);
        logInfo('TASK', 'משימה סומנה כהושלמה', ctx);
        showToast('המשימה סומנה כהושלמה ✓');
        router();
      });
      break;
    case 'delete':
      showConfirm('למחוק את המשימה?', () => {
        deleteTask(taskId);
        logInfo('TASK', 'משימה נמחקה (לסל)', ctx);
        showToast('המשימה נמחקה', 'info');
        router();
      });
      break;
    case 'edit':
      logDebug('TASK', 'פתיחת עריכת משימה', ctx);
      startEditTask(taskId);
      break;
    case 'restore':
      restoreTask(taskId);
      logInfo('TASK', 'משימה שוחזרה', ctx);
      showToast('המשימה שוחזרה ✓');
      router();
      break;
    case 'perm-delete':
      showConfirm(
        '⚠️ מחיקה לצמיתות – פעולה זו אינה הפיכה!\n\nהמשימה תימחק לצמיתות ממאגר הנתונים ולא ניתן יהיה לשחזר אותה. להמשיך?',
        () => {
          permanentlyDeleteTask(taskId);
          logWarn('TASK', 'משימה נמחקה לצמיתות', ctx);
          showToast('המשימה נמחקה לצמיתות', 'error');
          router();
        }
      );
      break;
  }
}

// ── SCREEN 4: Task Form ────────────────────────────────
function startNewTask() {
  editingTaskId = null;
  window.location.hash = '#task-form';
}

function startEditTask(id) {
  editingTaskId = id;
  window.location.hash = '#task-form';
}

function renderTaskForm() {
  const settings = getSettings();
  const content  = document.getElementById('content');
  const isEdit   = editingTaskId !== null;
  const task     = isEdit ? getTaskById(editingTaskId) : null;

  if (!settings.employees.length || !settings.categories.length) {
    content.innerHTML = `
      <div class="screen">
        <div class="screen-header"><h1 class="screen-title">${isEdit ? 'עריכת משימה' : 'משימה חדשה'}</h1></div>
        <div class="welcome-banner">
          <div class="welcome-banner-icon">⚙️</div>
          <div class="welcome-banner-text">
            <h2>נדרשת הגדרה ראשונית</h2>
            <p>לפני יצירת משימה, יש להוסיף עובדים וקטגוריות ב<a href="#settings">הגדרות</a>.</p>
          </div>
        </div>
      </div>`;
    return;
  }

  const emphOpts = `<option value="">ללא חשיבות</option>` +
    (settings.importanceLevels || []).map(l =>
      `<option value="${esc(l.key)}" style="color:${l.color}" ${task?.importance === l.key ? 'selected' : ''}>${esc(l.label)}</option>`
    ).join('');

  const empOpts     = settings.employees.map(e =>
    `<option value="${esc(e)}" ${task?.assignedTo === e ? 'selected' : ''}>${esc(e)}</option>`).join('');
  const catOpts     = settings.categories.map(c =>
    `<option value="${esc(c)}" ${task?.category  === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

  const statusOpen  = (!task || task.status === 'open')  ? 'checked' : '';
  const statusDraft = (task?.status === 'draft')         ? 'checked' : '';

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">${isEdit ? 'עריכת משימה' : '+ משימה חדשה'}</h1>
      </div>
      <div class="form-card">
        <form id="task-form-el" onsubmit="submitTaskForm(event)" novalidate>
          <div class="form-row">
            <div class="form-group">
              <label>שם עובד <span class="required">*</span></label>
              <select class="form-control" id="f-employee" required>
                <option value="">-- בחר עובד --</option>
                ${empOpts}
              </select>
              <div class="error-msg" id="err-employee"></div>
            </div>
            <div class="form-group">
              <label>קטגוריה <span class="required">*</span></label>
              <select class="form-control" id="f-category" required>
                <option value="">-- בחר קטגוריה --</option>
                ${catOpts}
              </select>
              <div class="error-msg" id="err-category"></div>
            </div>
          </div>

          <div class="form-group">
            <label>לקוח <span class="required">*</span></label>
            <input type="text" class="form-control" id="f-client" value="${esc(task?.client || '')}" placeholder="שם לקוח" required>
            <div class="error-msg" id="err-client"></div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>מספר פוליסה <span class="text-muted text-sm">(רשות)</span></label>
              <input type="text" class="form-control" id="f-policy" value="${esc(task?.policyNumber || '')}" placeholder="מספר פוליסה" dir="ltr">
            </div>
            <div class="form-group">
              <label>ח.פ. / ת.ז <span class="text-muted text-sm">(רשות)</span></label>
              <input type="text" class="form-control" id="f-idnum" value="${esc(task?.idNumber || '')}" placeholder="מספר ח.פ. או ת.ז" dir="ltr">
            </div>
          </div>

          <div class="form-group">
            <label>אפיון משימה</label>
            <textarea class="form-control" id="f-description" rows="4" placeholder="תיאור חופשי...">${esc(task?.description || '')}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>חשיבות</label>
              <select class="form-control" id="f-importance">${emphOpts}</select>
            </div>
            <div class="form-group">
              <label>סטטוס <span class="required">*</span></label>
              <div class="radio-group" style="margin-top:8px">
                <label class="radio-label">
                  <input type="radio" name="status" value="open" ${statusOpen}>
                  פתוחה
                </label>
                <label class="radio-label">
                  <input type="radio" name="status" value="draft" ${statusDraft}>
                  טיוטה
                </label>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">💾 שמור</button>
            <button type="button" class="btn btn-outline" onclick="cancelForm()">ביטול</button>
          </div>
        </form>
      </div>
    </div>`;
}

function submitTaskForm(e) {
  e.preventDefault();
  const settings = getSettings();

  const employee    = document.getElementById('f-employee').value.trim();
  const category    = document.getElementById('f-category').value.trim();
  const client      = document.getElementById('f-client').value.trim();
  const policyNumber = document.getElementById('f-policy')?.value.trim() || '';
  const idNumber     = document.getElementById('f-idnum')?.value.trim()  || '';
  const description = document.getElementById('f-description').value.trim();
  const importance  = document.getElementById('f-importance').value || null;
  const statusEl    = document.querySelector('input[name="status"]:checked');
  const status      = statusEl ? statusEl.value : 'open';

  // וולידציה
  let valid = true;
  const setErr = (id, msg) => {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  };
  const clearErrs = () => ['err-employee','err-category','err-client'].forEach(id => setErr(id,''));

  clearErrs();
  if (!employee) { setErr('err-employee', 'שדה חובה'); document.getElementById('f-employee').classList.add('error'); valid = false; }
  if (!category) { setErr('err-category', 'שדה חובה'); document.getElementById('f-category').classList.add('error'); valid = false; }
  if (!client)   { setErr('err-client',   'שדה חובה'); document.getElementById('f-client').classList.add('error');   valid = false; }
  if (!valid) { showToast('שגיאה: שדות חובה חסרים', 'error'); return; }

  if (editingTaskId) {
    // עריכה
    const oldTask = getTaskById(editingTaskId);
    const employeeChanged = oldTask && oldTask.assignedTo !== employee;

    if (employeeChanged) {
      showConfirm('שינוי עובד ייצור רשומת שינוי. להמשיך?', () => {
        changeTaskEmployee(editingTaskId, employee);
        updateTask(editingTaskId, { category, client, policyNumber, idNumber, description, importance, status });
        logInfo('TASK', 'משימה עודכנה + שינוי עובד', { id: editingTaskId, from: oldTask.assignedTo, to: employee, client });
        showToast('המשימה עודכנה בהצלחה');
        editingTaskId = null;
        window.location.hash = '#main';
      });
    } else {
      updateTask(editingTaskId, { assignedTo: employee, category, client, policyNumber, idNumber, description, importance, status });
      logInfo('TASK', 'משימה עודכנה', { id: editingTaskId, employee, client, status });
      showToast('המשימה עודכנה בהצלחה');
      editingTaskId = null;
      window.location.hash = '#main';
    }
  } else {
    // יצירה
    const t = createTask({ assignedTo: employee, category, client, policyNumber, idNumber, description, importance, status });
    logInfo('TASK', 'משימה חדשה נוצרה', { id: t.id, employee, client, category, status });
    showToast('המשימה נשמרה בהצלחה');
    window.location.hash = '#main';
  }
}

function cancelForm() {
  editingTaskId = null;
  history.back();
}

// ── SCREEN 5: Settings ─────────────────────────────────
function renderSettings() {
  const settings = getSettings();
  const auditLog = getAuditLog();
  const content  = document.getElementById('content');

  const empTags = settings.employees.map((e, i) => `
    <span class="tag-item">
      ${esc(e)}
      <button class="tag-remove" onclick="removeEmployee(${i})" title="הסר">✕</button>
    </span>`).join('');

  const catTags = settings.categories.map((c, i) => `
    <span class="tag-item">
      ${esc(c)}
      <button class="tag-remove" onclick="removeCategory(${i})" title="הסר">✕</button>
    </span>`).join('');

  const isAdmin   = !!getCurrentUser()?.isAdmin;
  const auditRows = auditLog.length === 0
    ? `<tr><td colspan="${isAdmin ? 5 : 4}" class="text-muted" style="text-align:center;padding:16px">אין רשומות</td></tr>`
    : auditLog.map(r => `
        <tr>
          <td>${formatDate(r.timestamp)}</td>
          <td class="task-desc-cell" title="${esc(r.taskDescription)}">${esc(truncate(r.taskDescription, 40))}</td>
          <td>${esc(r.previousEmployee)}</td>
          <td>${esc(r.newEmployee)}</td>
          ${isAdmin ? `<td><button class="btn-icon-sm btn-danger-ghost" onclick="deleteAuditEntry('${r.id}')" title="מחק שורה">🗑</button></td>` : ''}
        </tr>`).join('');

  content.innerHTML = `
    <div class="screen">
      <div class="screen-header">
        <h1 class="screen-title">⚙️ הגדרות</h1>
      </div>

      <!-- עובדים -->
      <div class="settings-section">
        <div class="settings-section-title">👤 עובדים</div>
        <div class="tag-list" id="emp-list">${empTags || '<span class="text-muted text-sm">אין עובדים</span>'}</div>
        <div class="add-row">
          <input type="text" class="form-control" id="new-emp-input" placeholder="שם עובד חדש" onkeydown="if(event.key==='Enter'){event.preventDefault();addEmployee()}">
          <button class="btn btn-primary btn-sm" onclick="addEmployee()">הוסף</button>
        </div>
      </div>

      <!-- קטגוריות -->
      <div class="settings-section">
        <div class="settings-section-title">🏷️ קטגוריות</div>
        <div class="tag-list" id="cat-list">${catTags || '<span class="text-muted text-sm">אין קטגוריות</span>'}</div>
        <div class="add-row">
          <input type="text" class="form-control" id="new-cat-input" placeholder="קטגוריה חדשה" onkeydown="if(event.key==='Enter'){event.preventDefault();addCategory()}">
          <button class="btn btn-primary btn-sm" onclick="addCategory()">הוסף</button>
        </div>
      </div>

      <!-- רמות חשיבות דינמיות -->
      <div class="settings-section">
        <div class="settings-section-title">🎨 רמות חשיבות</div>
        <div id="importance-levels-list">
          ${buildImportanceLevelsList(settings.importanceLevels)}
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gray-100)">
          <div class="settings-section-subtitle">הוספת רמה חדשה</div>
          <div class="add-importance-row">
            <input type="text"  class="form-control" id="new-imp-label" placeholder="שם הרמה (לדוג׳: קריטי)" style="max-width:180px">
            <input type="color" class="color-input"  id="new-imp-color" value="#7c3aed" title="בחר צבע">
            <span id="new-imp-preview" class="importance-badge" style="background:#7c3aed22;color:#7c3aed">תצוגה מקדימה</span>
            <button class="btn btn-primary btn-sm" onclick="addImportanceLevel()">הוסף רמה</button>
          </div>
        </div>
      </div>

      <!-- סנכרון ענן -->
      <div class="settings-section">
        <div class="settings-section-title">☁️ סנכרון ענן (Firebase)</div>
        <p class="text-muted text-sm" style="margin-bottom:14px">
          שמור נתונים ב-Firebase Realtime Database – כך כל דפדפן ומכשיר יראה את אותם הנתונים.
        </p>

        <div style="background:#f0fff4;border:1px solid #9ae6b4;border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#276749">
          <strong>הוראות הגדרה:</strong>
          <ol style="margin:6px 0 0 16px;padding:0;line-height:2">
            <li>כנס ל-<strong>console.firebase.google.com</strong> וצור פרויקט חדש</li>
            <li>Build → <strong>Realtime Database</strong> → Create Database (בחר אירופה)</li>
            <li>בכרטיסיית <strong>Rules</strong> הדבק:<br>
              <code style="background:#e6ffed;padding:2px 6px;border-radius:3px">{ "rules": { ".read": true, ".write": true } }</code>
              ולחץ Publish
            </li>
            <li>העתק את ה-URL מלמעלה (מתחיל ב-<code>https://</code> ומסתיים ב-<code>.firebaseio.com</code>)</li>
          </ol>
        </div>

        <div class="form-group" style="max-width:500px">
          <label>Firebase Database URL</label>
          <input type="url" class="form-control" id="cloud-db-url"
                 value="${esc(getCloudUrl())}"
                 placeholder="https://my-project-default-rtdb.firebaseio.com"
                 dir="ltr">
        </div>

        <div class="form-actions" style="flex-wrap:wrap;gap:8px">
          <button class="btn btn-primary" onclick="saveCloudSettings()">💾 שמור URL</button>
          <button class="btn btn-secondary" onclick="testCloudSettings()">🔗 בדוק חיבור</button>
          <button class="btn btn-success" onclick="cloudMergeAndSave().then(()=>{showToast('מוזג ונשמר לענן ✓');router();})">☁️ סנכרן ושמור לענן</button>
          <button class="btn btn-secondary" onclick="cloudLoad().then(()=>{showToast('נטען מהענן ✓');router();})">⬇️ טען מהענן עכשיו</button>
        </div>

        <div id="cloud-status-indicator" style="margin-top:10px;font-size:13px"></div>
      </div>

      <!-- הגדרות דוח אוטומטי -->
      ${buildReportSettingsHtml(settings.reportSettings)}

      <!-- שינוי סיסמא -->
      <div class="settings-section">
        <div class="settings-section-title">🔐 שינוי סיסמא</div>
        <div style="max-width:340px">
          <div class="form-group">
            <label>סיסמא נוכחית</label>
            <input type="password" class="form-control" id="cp-current" autocomplete="current-password" dir="ltr">
          </div>
          <div class="form-group">
            <label>סיסמא חדשה <span class="text-muted text-sm">(לפחות 4 תווים, אותיות אנגלית וספרות בלבד)</span></label>
            <input type="password" class="form-control" id="cp-new" autocomplete="new-password" dir="ltr">
          </div>
          <div class="form-group">
            <label>אימות סיסמא חדשה</label>
            <input type="password" class="form-control" id="cp-confirm" autocomplete="new-password" dir="ltr">
          </div>
          <div class="error-msg" id="cp-error" style="margin-bottom:10px"></div>
          <button class="btn btn-primary btn-sm" onclick="submitChangePassword()">עדכן סיסמא</button>
        </div>
      </div>

      <!-- Audit Log -->
      <div class="settings-section">
        <div class="settings-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <span>📋 יומן שינויים (Audit Log)</span>
          ${isAdmin && auditLog.length > 0 ? `<button class="btn btn-danger btn-sm" onclick="clearAuditLog()">🗑 מחק הכל</button>` : ''}
        </div>
        <div style="overflow-x:auto">
          <table class="audit-table">
            <thead>
              <tr>
                <th>תאריך שינוי</th>
                <th>תיאור משימה</th>
                <th>עובד קודם</th>
                <th>עובד חדש</th>
                ${isAdmin ? '<th style="width:40px"></th>' : ''}
              </tr>
            </thead>
            <tbody>${auditRows}</tbody>
          </table>
        </div>
      </div>

      <!-- לוג מערכת -->
      <div class="settings-section">
        <div class="settings-section-title">📋 לוג מערכת</div>
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="downloadLogs()">⬇️ הורד קובץ לוג (.txt)</button>
          <button class="btn btn-outline btn-sm" onclick="if(confirm('לנקות את הלוג?')){clearLogs();renderSettings();}">🗑 נקה לוג</button>
          <span class="text-muted text-sm" style="align-self:center" id="log-count"></span>
        </div>
        <div id="log-viewer">${renderLogViewer()}</div>
      </div>
    </div>`;

  // עדכן ספירת רשומות
  const logCountEl = document.getElementById('log-count');
  if (logCountEl) logCountEl.textContent = `${getLogs().length} רשומות`;

  // תצוגה מקדימה בזמן אמת לרמה החדשה
  const newColorInput = document.getElementById('new-imp-color');
  const newLabelInput = document.getElementById('new-imp-label');
  const newPreview    = document.getElementById('new-imp-preview');
  if (newColorInput) {
    const updatePreview = () => {
      const c = newColorInput.value;
      const l = newLabelInput.value.trim() || 'תצוגה מקדימה';
      newPreview.style.color      = c;
      newPreview.style.background = c + '22';
      newPreview.textContent      = l;
    };
    newColorInput.addEventListener('input', updatePreview);
    newLabelInput.addEventListener('input', updatePreview);
  }

  // תצוגה מקדימה בזמן אמת לרמות קיימות
  initImportanceLevelsPreview();

  // הצגת/הסתרת שדות תזמון
  updateScheduleFieldsVisibility();
}

function buildImportanceLevelsList(levels) {
  if (!levels || levels.length === 0) return '<span class="text-muted text-sm">אין רמות</span>';
  return levels.map((l, i) => `
    <div class="importance-level-row" id="imp-row-${i}">
      <input type="color" class="color-input imp-color-input" value="${l.color}" data-idx="${i}" title="שנה צבע">
      <input type="text"  class="form-control imp-label-input" value="${esc(l.label)}" data-idx="${i}" placeholder="שם רמה" style="max-width:150px">
      <span class="importance-badge imp-preview-badge" id="imp-preview-${i}" style="background:${l.color}22;color:${l.color}">${esc(l.label)}</span>
      <button class="btn btn-sm btn-outline" onclick="saveImportanceLevel(${i})" style="margin-right:4px">✓ שמור</button>
      <button class="row-btn delete-btn" onclick="removeImportanceLevel(${i})" title="הסר רמה" style="font-size:14px">🗑</button>
    </div>`).join('');
}

function initImportanceLevelsPreview() {
  document.querySelectorAll('.imp-color-input, .imp-label-input').forEach(input => {
    input.addEventListener('input', () => {
      const idx     = input.dataset.idx;
      const row     = document.getElementById(`imp-row-${idx}`);
      if (!row) return;
      const color   = row.querySelector('.imp-color-input').value;
      const label   = row.querySelector('.imp-label-input').value.trim();
      const preview = document.getElementById(`imp-preview-${idx}`);
      if (preview) {
        preview.style.color      = color;
        preview.style.background = color + '22';
        preview.textContent      = label || '—';
      }
    });
  });
}

function buildReportSettingsHtml(rs) {
  const schedOpts = [
    { val: 'manual',  label: 'ידני בלבד (שלח עכשיו)' },
    { val: 'daily',   label: 'כל יום' },
    { val: 'weekly',  label: 'כל שבוע' },
    { val: 'monthly', label: 'כל חודש' }
  ].map(o => `<option value="${o.val}" ${rs.schedule === o.val ? 'selected' : ''}>${o.label}</option>`).join('');

  const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const dayOpts = days.map((d,i) => `<option value="${i}" ${rs.scheduleDayOfWeek == i ? 'selected' : ''}>${d}</option>`).join('');

  const lastSent = rs.lastSentAt ? formatDate(rs.lastSentAt) : 'טרם נשלח';

  return `
  <div class="settings-section">
    <div class="settings-section-title">📧 דוח אוטומטי – EmailJS</div>

    <div style="background:var(--primary-light);border:1px solid #c3dafe;border-radius:6px;padding:12px 16px;margin-bottom:18px;font-size:13px;color:var(--gray-700)">
      <strong>הגדרה ראשונית:</strong>
      <ol style="margin:6px 0 0 16px;padding:0;line-height:1.8">
        <li>צור חשבון חינמי ב-<strong>emailjs.com</strong></li>
        <li>הוסף שירות Gmail → קבל <strong>Service ID</strong></li>
        <li>צור תבנית עם משתנה <code>{{message}}</code> ו-<code>{{subject}}</code> → קבל <strong>Template ID</strong></li>
        <li>העתק את <strong>Public Key</strong> מ-Account → API Keys</li>
      </ol>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Service ID</label>
        <input type="text" class="form-control" id="rs-service-id" value="${esc(rs.emailjsServiceId)}" placeholder="service_xxxxxxx">
      </div>
      <div class="form-group">
        <label>Template ID</label>
        <input type="text" class="form-control" id="rs-template-id" value="${esc(rs.emailjsTemplateId)}" placeholder="template_xxxxxxx">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Public Key</label>
        <input type="text" class="form-control" id="rs-public-key" value="${esc(rs.emailjsPublicKey)}" placeholder="xxxxxxxxxxxxxxxxx">
      </div>
      <div class="form-group">
        <label>Gmail שולח</label>
        <input type="email" class="form-control" id="rs-sender" value="${esc(rs.senderEmail)}" placeholder="your@gmail.com">
      </div>
    </div>
    <div class="form-group">
      <label>מייל נמען (ישלח אליו הדוח)</label>
      <input type="email" class="form-control" id="rs-recipient" value="${esc(rs.recipientEmail)}" placeholder="manager@example.com" style="max-width:320px">
    </div>

    <div style="height:1px;background:var(--gray-200);margin:18px 0"></div>

    <div class="form-row">
      <div class="form-group">
        <label>תזמון שליחה</label>
        <select class="form-control" id="rs-schedule" onchange="updateScheduleFieldsVisibility()">${schedOpts}</select>
      </div>
      <div class="form-group">
        <label>שעת שליחה</label>
        <input type="time" class="form-control" id="rs-time" value="${esc(rs.scheduleTime)}">
      </div>
    </div>

    <div id="rs-weekly-fields" style="display:none">
      <div class="form-group">
        <label>יום בשבוע</label>
        <select class="form-control" id="rs-dow" style="max-width:160px">${dayOpts}</select>
      </div>
    </div>

    <div id="rs-monthly-fields" style="display:none">
      <div class="form-group">
        <label>יום בחודש</label>
        <input type="number" class="form-control" id="rs-dom" min="1" max="28" value="${rs.scheduleDayOfMonth}" style="max-width:100px">
      </div>
    </div>

    <div class="form-actions" style="margin-top:16px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="saveReportSettings()">💾 שמור הגדרות דוח</button>
      <button class="btn btn-success" onclick="sendReportNow()">📤 שלח דוח עכשיו</button>
      <span class="text-muted text-sm" style="align-self:center">נשלח לאחרונה: ${lastSent}</span>
    </div>
  </div>`;
}

// ── Audit Log Actions ──────────────────────────────────
function deleteAuditEntry(id) {
  showConfirm('למחוק שורה זו מיומן השינויים?', () => {
    const updated = getAuditLog().filter(r => r.id !== id);
    saveAuditLog(updated);
    cloudSaveDebounced();
    renderSettings();
    showToast('שורה נמחקה');
  });
}

function clearAuditLog() {
  showConfirm('למחוק את כל יומן השינויים? פעולה זו אינה הפיכה.', () => {
    saveAuditLog([]);
    cloudSaveDebounced();
    renderSettings();
    showToast('יומן השינויים נוקה');
  });
}

function addEmployee() {
  const input = document.getElementById('new-emp-input');
  const name  = input.value.trim();
  if (!name) return;
  const s = getSettings();
  if (s.employees.includes(name)) { showToast('עובד זה כבר קיים', 'error'); return; }
  s.employees.push(name);
  saveSettings(s);
  showToast(`"${name}" נוסף לרשימת העובדים`);
  renderSettings();
}

function removeEmployee(idx) {
  const s = getSettings();
  const name = s.employees[idx];
  showConfirm(`להסיר את "${name}" מרשימת העובדים?`, () => {
    s.employees.splice(idx, 1);
    saveSettings(s);
    showToast(`"${name}" הוסר`);
    renderSettings();
  });
}

function addCategory() {
  const input = document.getElementById('new-cat-input');
  const name  = input.value.trim();
  if (!name) return;
  const s = getSettings();
  if (s.categories.includes(name)) { showToast('קטגוריה זו כבר קיימת', 'error'); return; }
  s.categories.push(name);
  saveSettings(s);
  showToast(`"${name}" נוספה לקטגוריות`);
  renderSettings();
}

function removeCategory(idx) {
  const s = getSettings();
  const name = s.categories[idx];
  showConfirm(`להסיר את קטגוריה "${name}"?`, () => {
    s.categories.splice(idx, 1);
    saveSettings(s);
    showToast(`"${name}" הוסרה`);
    renderSettings();
  });
}

// ── Importance Levels ──────────────────────────────────
function addImportanceLevel() {
  const label = document.getElementById('new-imp-label').value.trim();
  const color = document.getElementById('new-imp-color').value;
  if (!label) { showToast('יש להזין שם לרמה', 'error'); return; }
  const s   = getSettings();
  const key = 'lvl_' + generateId();
  s.importanceLevels.push({ key, label, color });
  saveSettings(s);
  showToast(`רמת חשיבות "${label}" נוספה`);
  renderSettings();
}

function saveImportanceLevel(idx) {
  const row   = document.getElementById(`imp-row-${idx}`);
  if (!row) return;
  const color = row.querySelector('.imp-color-input').value;
  const label = row.querySelector('.imp-label-input').value.trim();
  if (!label) { showToast('שם הרמה לא יכול להיות ריק', 'error'); return; }
  const s = getSettings();
  s.importanceLevels[idx] = { ...s.importanceLevels[idx], label, color };
  saveSettings(s);
  showToast(`"${label}" עודכנה`);
  renderSettings();
}

function removeImportanceLevel(idx) {
  const s    = getSettings();
  const name = s.importanceLevels[idx]?.label;
  showConfirm(`להסיר את רמת החשיבות "${name}"?\nמשימות קיימות עם רמה זו ישמרו עם ערך פנימי.`, () => {
    s.importanceLevels.splice(idx, 1);
    saveSettings(s);
    showToast(`"${name}" הוסרה`);
    renderSettings();
  });
}

// ── Cloud Sync Settings ────────────────────────────────
function saveCloudSettings() {
  const url = document.getElementById('cloud-db-url')?.value.trim() || '';
  setCloudUrl(url);
  showToast('כתובת Firebase נשמרה – טוען נתונים מהענן…', 'info');
  if (!url) return;

  // קודם טוען מהענן – רק אם הענן ריק, שומר את הנתונים המקומיים
  cloudLoad().then(loaded => {
    if (loaded) {
      showToast('נתונים נטענו מהענן בהצלחה ✓');
      router(); // רענן את המסך הנוכחי עם הנתונים שנטענו
    } else {
      // הענן ריק – שמור את הנתונים המקומיים אליו
      cloudSaveNow().then(() => showToast('הענן ריק – נתונים מקומיים נשמרו לענן ✓'));
    }
  });
}

async function testCloudSettings() {
  const url = document.getElementById('cloud-db-url')?.value.trim() || '';
  if (!url) { showToast('יש להזין כתובת Firebase', 'error'); return; }
  showToast('בודק חיבור…', 'info');
  const ok = await testCloudConnection(url);
  showToast(
    ok ? '✓ חיבור תקין! ניתן לשמור' : '❌ חיבור נכשל – בדוק URL וכללי אבטחה (Rules)',
    ok ? 'success' : 'error'
  );
}

// ── Schedule fields visibility ─────────────────────────
function updateScheduleFieldsVisibility() {
  const sel     = document.getElementById('rs-schedule');
  const weekly  = document.getElementById('rs-weekly-fields');
  const monthly = document.getElementById('rs-monthly-fields');
  if (!sel) return;
  if (weekly)  weekly.style.display  = sel.value === 'weekly'  ? 'block' : 'none';
  if (monthly) monthly.style.display = sel.value === 'monthly' ? 'block' : 'none';
}

// ── Report Settings Save ───────────────────────────────
function saveReportSettings() {
  const s  = getSettings();
  const rs = s.reportSettings;
  rs.emailjsServiceId   = document.getElementById('rs-service-id')?.value.trim()  || '';
  rs.emailjsTemplateId  = document.getElementById('rs-template-id')?.value.trim() || '';
  rs.emailjsPublicKey   = document.getElementById('rs-public-key')?.value.trim()  || '';
  rs.senderEmail        = document.getElementById('rs-sender')?.value.trim()      || '';
  rs.recipientEmail     = document.getElementById('rs-recipient')?.value.trim()   || '';
  rs.schedule           = document.getElementById('rs-schedule')?.value           || 'manual';
  rs.scheduleTime       = document.getElementById('rs-time')?.value               || '08:00';
  rs.scheduleDayOfWeek  = parseInt(document.getElementById('rs-dow')?.value)      || 0;
  rs.scheduleDayOfMonth = parseInt(document.getElementById('rs-dom')?.value)      || 1;
  saveSettings(s);
  // אתחל EmailJS מחדש עם המפתח החדש
  initEmailJS();
  showToast('הגדרות הדוח נשמרו');
}

// ── Change Password ────────────────────────────────────
async function submitChangePassword() {
  const current  = document.getElementById('cp-current')?.value  || '';
  const newPwd   = document.getElementById('cp-new')?.value      || '';
  const confirm  = document.getElementById('cp-confirm')?.value  || '';
  const errEl    = document.getElementById('cp-error');

  errEl.textContent = '';
  errEl.style.color = 'var(--danger)';

  if (!current || !newPwd || !confirm) {
    errEl.textContent = 'יש למלא את כל השדות';
    return;
  }
  if (newPwd !== confirm) {
    errEl.textContent = 'הסיסמאות החדשות אינן תואמות';
    return;
  }

  const result = await changePassword(current, newPwd);
  if (result.ok) {
    errEl.style.color  = 'var(--success)';
    errEl.textContent  = '✓ הסיסמא עודכנה בהצלחה';
    document.getElementById('cp-current').value = '';
    document.getElementById('cp-new').value     = '';
    document.getElementById('cp-confirm').value = '';
    showToast('הסיסמא עודכנה בהצלחה 🔐');
  } else {
    errEl.textContent = result.msg;
  }
}
