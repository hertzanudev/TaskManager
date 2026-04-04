// ===================== AUTHENTICATION =====================
// שכבת אימות – SHA-256 + sessionStorage

const AUTH_SESSION_KEY   = 'tm_session';
const USERS_STORE_KEY    = 'tm_users';
const DEFAULT_ADMIN_USER = 'Tamir';
const DEFAULT_ADMIN_PASS = 'Ben2407';
// SHA-256 של DEFAULT_ADMIN_PASS – מחושב מראש, ללא תלות ב-crypto.subtle
const DEFAULT_ADMIN_HASH = 'f35308e5f81d80ba5ac652fbe530ec4b627adf662aa79ca3e09f30bc86a97c0e';

// ── Password Validation ────────────────────────────────
function validatePassword(password) {
  if (!password || password.length < 4) {
    return { ok: false, msg: 'הסיסמא חייבת להכיל לפחות 4 תווים' };
  }
  if (!/^[A-Za-z0-9]+$/.test(password)) {
    return { ok: false, msg: 'הסיסמא יכולה להכיל רק אותיות באנגלית וספרות' };
  }
  return { ok: true };
}

// ── Password Hashing (Web Crypto API) ─────────────────
async function hashPassword(password) {
  const enc    = new TextEncoder();
  const data   = enc.encode(password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Users Store ────────────────────────────────────────
function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_STORE_KEY) || '[]');
  } catch (e) {
    logError('AUTH', 'שגיאה בקריאת משתמשים מ-localStorage', { error: e.message });
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORE_KEY, JSON.stringify(users));
}

// אתחל/עדכן משתמש אדמין ברירת מחדל
// מאפס את hash של Tamir אם הסיסמא ברירת המחדל השתנתה
async function initDefaultUsers() {
  logDebug('AUTH', 'initDefaultUsers – מתחיל');

  const users     = getUsers();
  const adminHash = await hashPassword(DEFAULT_ADMIN_PASS);

  logDebug('AUTH', `כמות משתמשים ב-localStorage: ${users.length}`,
    { usernames: users.map(u => u.username) });

  const tamir = users.find(u => u.username === DEFAULT_ADMIN_USER);

  if (!tamir) {
    // משתמש לא קיים – יוצר חדש
    logInfo('AUTH', `משתמש "${DEFAULT_ADMIN_USER}" לא נמצא – יוצר חדש`);
    saveUsers([...users, { username: DEFAULT_ADMIN_USER, passwordHash: adminHash, isAdmin: true }]);
    logInfo('AUTH', `משתמש "${DEFAULT_ADMIN_USER}" נוצר בהצלחה`);
  } else if (tamir.passwordHash !== adminHash) {
    // המשתמש קיים אבל ה-hash שונה מברירת המחדל הנוכחית –
    // ייתכן שהסיסמא שונתה ידנית, או שהגדרנו סיסמא חדשה.
    // כאן: איפוס לסיסמא ברירת המחדל הנוכחית (Ben2407).
    logWarn('AUTH',
      `hash של "${DEFAULT_ADMIN_USER}" שונה מברירת המחדל הנוכחית – מאפס`,
      { storedHashPrefix: tamir.passwordHash.slice(0, 12) + '…',
        defaultHashPrefix: adminHash.slice(0, 12) + '…' });
    const updated = users.map(u =>
      u.username === DEFAULT_ADMIN_USER ? { ...u, passwordHash: adminHash } : u
    );
    saveUsers(updated);
    logInfo('AUTH', `סיסמא של "${DEFAULT_ADMIN_USER}" אופסה לברירת המחדל`);
  } else {
    logDebug('AUTH', `משתמש "${DEFAULT_ADMIN_USER}" קיים עם hash תואם`);
  }
}

// ── Session ────────────────────────────────────────────
function isAuthenticated() {
  return !!sessionStorage.getItem(AUTH_SESSION_KEY);
}

function getCurrentUser() {
  const d = sessionStorage.getItem(AUTH_SESSION_KEY);
  return d ? JSON.parse(d) : null;
}

// ── Login ──────────────────────────────────────────────
async function login(username, password) {
  logInfo('AUTH', `ניסיון כניסה`, { username });

  const users = getUsers();
  logDebug('AUTH', `משתמשים ב-storage: ${users.length}`,
    { usernames: users.map(u => u.username) });

  const enteredHash = await hashPassword(password);
  logDebug('AUTH', `hash סיסמא שהוזנה (12 תווים ראשונים): ${enteredHash.slice(0,12)}…`);

  let matchByName = users.find(u =>
    u.username.toLowerCase() === username.toLowerCase()
  );

  // ── Fallback: משתמש ברירת מחדל לא נמצא ב-storage ──
  // משתמש ב-hash קשיח – ללא תלות ב-crypto.subtle ולא ב-initDefaultUsers
  if (!matchByName && username.toLowerCase() === DEFAULT_ADMIN_USER.toLowerCase()) {
    logDebug('AUTH', `"${DEFAULT_ADMIN_USER}" לא ב-storage – בודק מול hash קשיח`);
    // מקבל גם hash תואם וגם סיסמא טקסט ישיר (גיבוי לכשל crypto)
    const isCorrect = (enteredHash === DEFAULT_ADMIN_HASH) || (password === DEFAULT_ADMIN_PASS);
    logDebug('AUTH', `hashMatch=${enteredHash === DEFAULT_ADMIN_HASH}, plainMatch=${password === DEFAULT_ADMIN_PASS}`);
    if (isCorrect) {
      logInfo('AUTH', `סיסמת ברירת מחדל נכונה – יוצר משתמש on-the-fly ומתחבר`);
      const newUser = { username: DEFAULT_ADMIN_USER, passwordHash: DEFAULT_ADMIN_HASH, isAdmin: true };
      saveUsers([...users, newUser]);
      sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
        username: DEFAULT_ADMIN_USER,
        isAdmin:  true
      }));
      logInfo('AUTH', `כניסה מוצלחת (fallback): "${DEFAULT_ADMIN_USER}"`);
      return true;
    } else {
      logWarn('AUTH', `סיסמא שגויה עבור משתמש ברירת מחדל "${DEFAULT_ADMIN_USER}"`,
        { enteredHashPrefix: enteredHash.slice(0,12) + '…', expectedPrefix: DEFAULT_ADMIN_HASH.slice(0,12) + '…' });
      return false;
    }
  }

  if (!matchByName) {
    logWarn('AUTH', `שם משתמש לא נמצא: "${username}"`,
      { existingUsers: users.map(u => u.username) });
    return false;
  }

  logDebug('AUTH', `שם משתמש נמצא: "${matchByName.username}"`,
    { storedHashPrefix:  matchByName.passwordHash.slice(0, 12) + '…',
      enteredHashPrefix: enteredHash.slice(0, 12) + '…',
      hashesMatch:       matchByName.passwordHash === enteredHash });

  if (matchByName.passwordHash !== enteredHash) {
    logWarn('AUTH', `סיסמא שגויה עבור "${username}"`,
      { storedHashPrefix:  matchByName.passwordHash.slice(0, 12) + '…',
        enteredHashPrefix: enteredHash.slice(0, 12) + '…' });
    return false;
  }

  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: matchByName.username,
    isAdmin:  !!matchByName.isAdmin
  }));
  logInfo('AUTH', `כניסה מוצלחת: "${matchByName.username}"`);
  return true;
}

// ── Logout ─────────────────────────────────────────────
function logout() {
  const user = getCurrentUser();
  logInfo('AUTH', `התנתקות: "${user?.username}"`);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  showLoginScreen();
}

// ── Change Password ────────────────────────────────────
async function changePassword(currentPassword, newPassword) {
  const currentUser = getCurrentUser();
  if (!currentUser) return { ok: false, msg: 'לא מחובר' };

  logInfo('AUTH', `ניסיון שינוי סיסמא: "${currentUser.username}"`);

  const validation = validatePassword(newPassword);
  if (!validation.ok) {
    logWarn('AUTH', `שינוי סיסמא נדחה – וולידציה`, { reason: validation.msg });
    return validation;
  }

  const users       = getUsers();
  const currentHash = await hashPassword(currentPassword);
  const idx         = users.findIndex(u =>
    u.username === currentUser.username && u.passwordHash === currentHash
  );

  if (idx === -1) {
    logWarn('AUTH', `שינוי סיסמא נדחה – סיסמא נוכחית שגויה`,
      { username: currentUser.username });
    return { ok: false, msg: 'הסיסמא הנוכחית שגויה' };
  }

  users[idx].passwordHash = await hashPassword(newPassword);
  saveUsers(users);
  logInfo('AUTH', `סיסמא שונתה בהצלחה: "${currentUser.username}"`);
  return { ok: true };
}

// ── Login Screen UI ────────────────────────────────────
function showLoginScreen() {
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('app').style.visibility = 'hidden';
  document.getElementById('login-username').value    = '';
  document.getElementById('login-password').value    = '';
  document.getElementById('login-error').textContent = '';
  setTimeout(() => document.getElementById('login-username')?.focus(), 80);
}

function hideLoginScreen() {
  document.getElementById('login-overlay').classList.add('hidden');
  document.getElementById('app').style.visibility = '';
}

function updateNavUser() {
  const user = getCurrentUser();
  const el   = document.getElementById('nav-username');
  if (el && user) el.textContent = user.username;
}

// ── Form Submit ────────────────────────────────────────
async function submitLogin(e) {
  e && e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btnEl    = document.getElementById('login-btn');

  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = 'יש למלא שם משתמש וסיסמא';
    logWarn('AUTH', 'ניסיון כניסה עם שדות ריקים');
    return;
  }

  btnEl.disabled    = true;
  btnEl.textContent = 'מתחבר…';

  // גיבוי: ודא שמשתמש ברירת מחדל קיים לפני ניסיון הכניסה
  try { await initDefaultUsers(); } catch (e) { /* ממשיך גם אם נכשל */ }

  const ok = await login(username, password);

  btnEl.disabled    = false;
  btnEl.textContent = 'התחבר';

  if (ok) {
    hideLoginScreen();
    updateNavUser();
    router();
  } else {
    errEl.textContent = 'שם משתמש או סיסמא שגויים';
    document.getElementById('login-password').value = '';
    document.getElementById('login-password').focus();
  }
}

function loginKeydown(e) {
  if (e.key === 'Enter') submitLogin(e);
}

// ── Init ───────────────────────────────────────────────
async function initAuth() {
  logInfo('AUTH', 'initAuth – מתחיל');
  await initDefaultUsers();
  if (!isAuthenticated()) {
    logInfo('AUTH', 'משתמש לא מחובר – מציג מסך כניסה');
    showLoginScreen();
  } else {
    logInfo('AUTH', `משתמש כבר מחובר: "${getCurrentUser()?.username}"`);
    updateNavUser();
  }
}

// ── Auto-init on script load (independent of app.js) ──
// מפעיל initDefaultUsers מיד בטעינת auth.js – ללא תלות ב-app.js
(async () => {
  try {
    logDebug('AUTH', 'auto-init IIFE – מתחיל');
    await initDefaultUsers();
    logDebug('AUTH', 'auto-init IIFE – הסתיים בהצלחה');
  } catch (e) {
    console.error('[AUTH] auto-init IIFE נכשל:', e);
  }
})();
