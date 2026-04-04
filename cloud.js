// ===================== CLOUD SYNC =====================
// סנכרון נתונים עם Firebase Realtime Database (REST API)
// אין צורך ב-SDK – משתמשים ב-fetch בלבד

const CLOUD_URL_KEY  = 'tm_cloud_url';
const CLOUD_SYNC_KEYS = ['tasks', 'settings', 'auditLog', 'dailyStats', 'tm_users', 'tm_perm_deleted', 'pdf_merge_settings'];

// ← הכנס כאן את ה-URL של Firebase שלך (יטען אוטומטית בכל דפדפן/אינקוגניטו)
const DEFAULT_CLOUD_URL = 'https://task-manager-ac919-default-rtdb.europe-west1.firebasedatabase.app';

let _cloudSaveTimer = null;
let _cloudStatus    = 'idle'; // idle | syncing | ok | error

// ── URL ────────────────────────────────────────────────
function getCloudUrl() {
  return (localStorage.getItem(CLOUD_URL_KEY) || DEFAULT_CLOUD_URL).trim().replace(/\/$/, '');
}

function setCloudUrl(url) {
  localStorage.setItem(CLOUD_URL_KEY, (url || '').trim().replace(/\/$/, ''));
}

// ── Load from Cloud ────────────────────────────────────
async function cloudLoad() {
  const url = getCloudUrl();
  if (!url) return false;

  try {
    logInfo('CLOUD', 'טוען נתונים מהענן…');
    const res = await fetch(`${url}/appdata.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data) {
      logInfo('CLOUD', 'ענן ריק – משתמש בנתונים מקומיים');
      return false;
    }

    CLOUD_SYNC_KEYS.forEach(key => {
      if (data[key] !== undefined && data[key] !== null) {
        localStorage.setItem(key, JSON.stringify(data[key]));
      }
    });

    logInfo('CLOUD', 'נתונים נטענו מהענן בהצלחה');
    _cloudStatus = 'ok';
    updateCloudIndicator();
    return true;
  } catch (e) {
    logWarn('CLOUD', 'טעינה מהענן נכשלה – ממשיך עם נתונים מקומיים', { error: e.message });
    _cloudStatus = 'error';
    updateCloudIndicator();
    return false;
  }
}

// ── Merge Logic ────────────────────────────────────────
function mergeCloudData(local, cloud) {
  const merged = {};

  // איחוד רשימת IDs שנמחקו לצמיתות
  const permDelSet = new Set([
    ...(cloud.tm_perm_deleted || []),
    ...(local.tm_perm_deleted || [])
  ]);
  merged.tm_perm_deleted = [...permDelSet];

  // tasks: מיזוג לפי ID – שומר את הגרסה העדכנית ביותר (lastModifiedAt)
  // ומסנן IDs שנמחקו לצמיתות
  const taskMap = {};
  [...(cloud.tasks || []), ...(local.tasks || [])].forEach(t => {
    if (permDelSet.has(t.id)) return; // לעולם לא תחזור
    const ex = taskMap[t.id];
    if (!ex || new Date(t.lastModifiedAt) >= new Date(ex.lastModifiedAt)) {
      taskMap[t.id] = t;
    }
  });
  merged.tasks = Object.values(taskMap);

  // settings: מיזוג מערכים (employees, categories, importanceLevels) + העדפת מקומי לשאר
  const ls = local.settings   || {};
  const cs = cloud.settings   || {};
  merged.settings = { ...cs, ...ls };

  const mergeArr = (a, b) => [...new Set([...(b || []), ...(a || [])])];
  merged.settings.employees       = mergeArr(ls.employees,       cs.employees);
  merged.settings.categories      = mergeArr(ls.categories,      cs.categories);

  const levelsMap = {};
  [...(cs.importanceLevels || []), ...(ls.importanceLevels || [])].forEach(l => { levelsMap[l.key] = l; });
  merged.settings.importanceLevels = Object.values(levelsMap);

  // tm_users: מיזוג לפי username – מקומי גובר (שינוי סיסמא)
  const userMap = {};
  [...(cloud.tm_users || []), ...(local.tm_users || [])].forEach(u => { userMap[u.username] = u; });
  merged.tm_users = Object.values(userMap);

  // auditLog: מיזוג לפי ID, ממוין מהחדש לישן
  const logMap = {};
  [...(cloud.auditLog || []), ...(local.auditLog || [])].forEach(e => { logMap[e.id] = e; });
  merged.auditLog = Object.values(logMap).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // dailyStats: מיזוג לפי תאריך + עובד, לוקח את המקסימום
  const mergedStats = { ...(cloud.dailyStats || {}) };
  Object.entries(local.dailyStats || {}).forEach(([date, emps]) => {
    if (!mergedStats[date]) { mergedStats[date] = emps; return; }
    Object.entries(emps).forEach(([emp, vals]) => {
      if (!mergedStats[date][emp]) { mergedStats[date][emp] = vals; return; }
      mergedStats[date][emp] = {
        opened:    Math.max(vals.opened    || 0, mergedStats[date][emp].opened    || 0),
        completed: Math.max(vals.completed || 0, mergedStats[date][emp].completed || 0)
      };
    });
  });
  merged.dailyStats = mergedStats;

  return merged;
}

// ── Merge & Save (הפעולה הסטנדרטית) ──────────────────
// טוען מהענן → ממזג עם מקומי → שומר מוזג לענן ול-localStorage
async function cloudMergeAndSave() {
  const url = getCloudUrl();
  if (!url) return;

  try {
    _cloudStatus = 'syncing';
    updateCloudIndicator();

    // 1. טען מהענן
    const res = await fetch(`${url}/appdata.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cloudData = (await res.json()) || {};

    // 2. קרא נתונים מקומיים
    const localData = {};
    CLOUD_SYNC_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { localData[key] = JSON.parse(raw); } catch (e) { localData[key] = raw; }
      }
    });

    // 3. מזג
    const merged = mergeCloudData(localData, cloudData);

    // 4. שמור מוזג ב-localStorage
    CLOUD_SYNC_KEYS.forEach(key => {
      if (merged[key] !== undefined) {
        localStorage.setItem(key, JSON.stringify(merged[key]));
      }
    });

    // 5. שמור מוזג בענן
    const saveRes = await fetch(`${url}/appdata.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(merged)
    });
    if (!saveRes.ok) throw new Error(`HTTP ${saveRes.status}`);

    logInfo('CLOUD', 'מיזוג ושמירה הושלמו בהצלחה');
    _cloudStatus = 'ok';
  } catch (e) {
    logWarn('CLOUD', 'מיזוג ושמירה נכשלו', { error: e.message });
    _cloudStatus = 'error';
  }
  updateCloudIndicator();
}

// ── Save to Cloud – debounced (קורא למיזוג) ───────────
function cloudSaveDebounced() {
  if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(cloudMergeAndSave, 2000);
}

// ── Save Now (ללא מיזוג – לשימוש ב-saveCloudSettings בלבד) ──
async function cloudSaveNow() {
  const url = getCloudUrl();
  if (!url) return;

  const data = {};
  CLOUD_SYNC_KEYS.forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try { data[key] = JSON.parse(raw); } catch (e) { data[key] = raw; }
    }
  });

  try {
    _cloudStatus = 'syncing';
    updateCloudIndicator();
    const res = await fetch(`${url}/appdata.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    logDebug('CLOUD', 'נתונים נשמרו לענן (ללא מיזוג)');
    _cloudStatus = 'ok';
  } catch (e) {
    logWarn('CLOUD', 'שמירה לענן נכשלה', { error: e.message });
    _cloudStatus = 'error';
  }
  updateCloudIndicator();
}

// ── Test Connection ────────────────────────────────────
async function testCloudConnection(url) {
  try {
    const clean = (url || '').trim().replace(/\/$/, '');
    const res = await fetch(`${clean}/appdata/ping.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ok: true, ts: Date.now() })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// ── Status Indicator ───────────────────────────────────
function updateCloudIndicator() {
  const el = document.getElementById('cloud-status-indicator');
  if (!el) return;
  const map = {
    idle:    { icon: '☁️',  text: 'ענן לא מוגדר',  color: '#9ca3af' },
    syncing: { icon: '🔄', text: 'מסנכרן…',        color: '#d97706' },
    ok:      { icon: '✅', text: 'מסונכרן',         color: '#059669' },
    error:   { icon: '❌', text: 'שגיאת סנכרון',   color: '#dc2626' }
  };
  const s = map[_cloudStatus] || map.idle;
  el.innerHTML = `<span style="color:${s.color}">${s.icon} ${s.text}</span>`;
}
