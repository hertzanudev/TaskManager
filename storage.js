// ===================== STORAGE LAYER =====================
// כל הגישה ל-localStorage מרוכזת כאן

const KEYS = {
  TASKS:       'tasks',
  SETTINGS:    'settings',
  AUDIT_LOG:   'auditLog',
  DAILY_STATS: 'dailyStats'
};

const DEFAULT_SETTINGS = {
  employees:  [],
  categories: [],
  emailWebappUrl: '',   // כתובת ה-Web App של Apps Script לסנכרון מיילים
  // רמות חשיבות דינמיות – ניתן להוסיף/להסיר
  importanceLevels: [
    { key: 'urgent',   label: 'דחוף',   color: '#e53e3e' },
    { key: 'daily',    label: 'יומי',    color: '#dd6b20' },
    { key: 'flexible', label: 'יש זמן', color: '#2f855a' }
  ],
  // הגדרות דוח אוטומטי
  reportSettings: {
    recipientEmail:     '',
    senderEmail:        '',
    emailjsServiceId:   '',
    emailjsTemplateId:  '',
    emailjsPublicKey:   '',
    schedule:           'manual', // manual | daily | weekly | monthly
    scheduleTime:       '08:00',
    scheduleDayOfWeek:  0,  // 0=ראשון, 1=שני ...
    scheduleDayOfMonth: 1,
    lastSentAt:         null
  }
};

// ── Utils ──────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// מזהה משימה – 7 ספרות בלבד (1000000–9999999)
function generateTaskId() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function formatDateOnly(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isToday(isoString) {
  if (!isoString) return false;
  return new Date(isoString).toDateString() === new Date().toDateString();
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function toDateKey(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toISOString().split('T')[0];
}

// ── Tasks ──────────────────────────────────────────────
function getTasks() {
  return JSON.parse(localStorage.getItem(KEYS.TASKS) || '[]');
}

function saveTasks(tasks) {
  localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
  if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
}

function getTaskById(id) {
  return getTasks().find(t => t.id === id) || null;
}

function createTask(data) {
  const tasks = getTasks();
  const now   = new Date().toISOString();
  const task  = {
    id:             generateTaskId(),
    createdAt:      now,
    assignedTo:     data.assignedTo,
    category:       data.category,
    client:         data.client,
    policyNumber:   data.policyNumber || '',
    idNumber:       data.idNumber     || '',
    description:    data.description  || '',
    importance:     data.importance   || null,
    status:         data.status       || 'open',
    completedAt:    null,
    deletedAt:      null,
    restoredAt:     null,
    lastModifiedAt: now
  };
  tasks.push(task);
  saveTasks(tasks);

  // סטטיסטיקה – רק למשימות פתוחות (לא טיוטות)
  if (task.status === 'open') {
    updateDailyStats('opened', task.assignedTo);
  }

  return task;
}

function updateTask(id, updates) {
  const tasks = getTasks();
  const idx   = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const oldTask  = { ...tasks[idx] };
  tasks[idx]     = { ...tasks[idx], ...updates, lastModifiedAt: new Date().toISOString() };
  saveTasks(tasks);

  return { old: oldTask, new: tasks[idx] };
}

function completeTask(id) {
  const now    = new Date().toISOString();
  const result = updateTask(id, { status: 'completed', completedAt: now });
  if (result) updateDailyStats('completed', result.new.assignedTo);
  return result;
}

function deleteTask(id) {
  const now = new Date().toISOString();
  return updateTask(id, { status: 'deleted', deletedAt: now });
}

function restoreTask(id) {
  const now = new Date().toISOString();
  return updateTask(id, { status: 'open', completedAt: null, deletedAt: null, restoredAt: now });
}

// מחיקה לצמיתות מה-localStorage – אין דרך חזרה
function permanentlyDeleteTask(id) {
  // שמור ב-localStorage ישירות (ללא cloudSaveDebounced – נשמור לענן מיידית בסוף)
  const filtered = getTasks().filter(t => t.id !== id);
  localStorage.setItem(KEYS.TASKS, JSON.stringify(filtered));

  // הוסף ל-tm_perm_deleted
  const ids = getPermanentlyDeletedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(PERM_DEL_KEY, JSON.stringify(ids));
  }

  // שמירה לענן מיידית (ללא debounce) – כדי שדפדפנים אחרים יקבלו את המחיקה מיד
  if (typeof cloudMergeAndSave === 'function') cloudMergeAndSave();
  else if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
}

// ── Permanently Deleted IDs ────────────────────────────
const PERM_DEL_KEY = 'tm_perm_deleted';

function getPermanentlyDeletedIds() {
  try { return JSON.parse(localStorage.getItem(PERM_DEL_KEY) || '[]'); } catch (e) { return []; }
}

function addPermanentlyDeletedId(id) {
  const ids = getPermanentlyDeletedIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(PERM_DEL_KEY, JSON.stringify(ids));
    if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
  }
}

// שינוי עובד – עם audit log ועדכון תיאור
function changeTaskEmployee(taskId, newEmployee) {
  const task = getTaskById(taskId);
  if (!task) return null;

  const previousEmployee = task.assignedTo;
  const changeDate       = formatDate(new Date().toISOString());
  const appendText       = `\n[שינוי עובד: ${changeDate} – היה: ${previousEmployee}]`;
  const newDescription   = (task.description || '') + appendText;

  addAuditEntry({
    taskId,
    changeType:        'employee_changed',
    previousEmployee,
    newEmployee,
    previousCreatedAt: task.createdAt,
    taskDescription:   task.description
  });

  return updateTask(taskId, { assignedTo: newEmployee, description: newDescription });
}

// ── Settings ───────────────────────────────────────────
function getSettings() {
  const stored = localStorage.getItem(KEYS.SETTINGS);
  if (!stored) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const s = JSON.parse(stored);
  if (!Array.isArray(s.employees))  s.employees  = [];
  if (!Array.isArray(s.categories)) s.categories = [];

  // מיגרציה: המרה מפורמט ישן (importanceColors + importanceLabels) לחדש (importanceLevels)
  if (!Array.isArray(s.importanceLevels)) {
    const oldColors = s.importanceColors || {};
    const oldLabels = s.importanceLabels || {};
    s.importanceLevels = DEFAULT_SETTINGS.importanceLevels.map(def => ({
      key:   def.key,
      label: oldLabels[def.key] || def.label,
      color: oldColors[def.key] || def.color
    }));
  }

  // emailWebappUrl – מיגרציה
  if (s.emailWebappUrl === undefined) s.emailWebappUrl = '';

  // הגדרות דוח – ודא שקיימות
  if (!s.reportSettings) {
    s.reportSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.reportSettings));
  } else {
    // מלא שדות חסרים
    const def = DEFAULT_SETTINGS.reportSettings;
    for (const k of Object.keys(def)) {
      if (s.reportSettings[k] === undefined) s.reportSettings[k] = def[k];
    }
  }
  return s;
}

function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
}

// ── Audit Log ──────────────────────────────────────────
function getAuditLog() {
  return JSON.parse(localStorage.getItem(KEYS.AUDIT_LOG) || '[]');
}

function saveAuditLog(log) {
  localStorage.setItem(KEYS.AUDIT_LOG, JSON.stringify(log));
  if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
}

function addAuditEntry(entry) {
  const log = getAuditLog();
  log.unshift({ id: generateId(), timestamp: new Date().toISOString(), ...entry });
  saveAuditLog(log);
}

// ── Daily Stats ────────────────────────────────────────
function getDailyStats() {
  return JSON.parse(localStorage.getItem(KEYS.DAILY_STATS) || '{}');
}

function saveDailyStats(stats) {
  localStorage.setItem(KEYS.DAILY_STATS, JSON.stringify(stats));
  if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
}

function updateDailyStats(type, employee) {
  if (!employee) return;
  const stats = getDailyStats();
  const today  = getTodayKey();
  if (!stats[today])            stats[today]            = {};
  if (!stats[today][employee])  stats[today][employee]  = { opened: 0, completed: 0 };
  stats[today][employee][type] = (stats[today][employee][type] || 0) + 1;
  saveDailyStats(stats);
}
