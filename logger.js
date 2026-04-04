// ===================== ACTIVITY LOGGER =====================
// רושם פעילות מערכת ב-localStorage וניתן להורדה כקובץ טקסט

const LOG_STORE_KEY = 'tm_activity_log';
const LOG_MAX       = 1000; // מקסימום רשומות

// ── Core ───────────────────────────────────────────────
function _writeLog(level, category, message, details) {
  const entry = {
    t: new Date().toISOString(),
    l: level,
    c: category,
    m: message,
    d: details || null
  };

  let logs = _readLogs();
  logs.push(entry);
  if (logs.length > LOG_MAX) logs.splice(0, logs.length - LOG_MAX);

  try {
    localStorage.setItem(LOG_STORE_KEY, JSON.stringify(logs));
  } catch (e) {
    // localStorage מלא – נמחק חצי
    logs.splice(0, Math.floor(logs.length / 2));
    localStorage.setItem(LOG_STORE_KEY, JSON.stringify(logs));
  }

  // גם ל-DevTools Console
  const fn = level === 'ERROR' ? console.error
           : level === 'WARN'  ? console.warn
           : level === 'DEBUG' ? console.debug
           : console.log;
  fn(`[${level}][${category}] ${message}`, details !== undefined ? details : '');
}

function _readLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOG_STORE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────
const logDebug = (cat, msg, d) => _writeLog('DEBUG', cat, msg, d);
const logInfo  = (cat, msg, d) => _writeLog('INFO',  cat, msg, d);
const logWarn  = (cat, msg, d) => _writeLog('WARN',  cat, msg, d);
const logError = (cat, msg, d) => _writeLog('ERROR', cat, msg, d);

function getLogs() { return _readLogs(); }
function clearLogs() {
  localStorage.removeItem(LOG_STORE_KEY);
  logInfo('SYSTEM', 'הלוג נוקה');
}

// ── Download as .txt ───────────────────────────────────
function downloadLogs() {
  const logs  = _readLogs();
  const lines = logs.map(e => {
    const d   = e.d ? '\n    ' + JSON.stringify(e.d, null, 2).replace(/\n/g, '\n    ') : '';
    return `[${e.t}] [${e.l.padEnd(5)}] [${e.c.padEnd(8)}] ${e.m}${d}`;
  });

  const header = [
    '╔══════════════════════════════════════╗',
    '║   לוג מערכת ניהול משימות            ║',
    '╚══════════════════════════════════════╝',
    `הופק:      ${new Date().toLocaleString('he-IL')}`,
    `כמות רשומות: ${logs.length}`,
    `User Agent: ${navigator.userAgent}`,
    '─'.repeat(60),
    ''
  ].join('\n');

  const blob = new Blob([header + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `task-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Render Log Viewer (for settings page) ─────────────
function renderLogViewer() {
  const logs    = _readLogs().slice().reverse(); // חדש ראשון
  const levelColors = {
    ERROR: '#c53030', WARN: '#c05621', INFO: '#276749', DEBUG: '#4a5568'
  };

  if (logs.length === 0) {
    return `<div class="empty-state" style="padding:24px">
      <div class="empty-state-icon">📋</div>
      <div class="empty-state-title">אין רשומות בלוג</div>
    </div>`;
  }

  const rows = logs.slice(0, 200).map(e => {
    const color   = levelColors[e.l] || '#4a5568';
    const details = e.d ? `<div style="font-size:11px;color:var(--gray-500);margin-top:3px;font-family:monospace;white-space:pre-wrap">${escLog(JSON.stringify(e.d, null, 2))}</div>` : '';
    const time    = new Date(e.t).toLocaleString('he-IL');
    return `<tr>
      <td style="white-space:nowrap;font-size:12px;color:var(--gray-500)">${time}</td>
      <td><span style="font-size:11px;font-weight:700;color:${color};background:${color}18;padding:1px 6px;border-radius:4px">${e.l}</span></td>
      <td style="font-size:12px;color:var(--gray-500)">${e.c}</td>
      <td style="font-size:13px">${escLog(e.m)}${details}</td>
    </tr>`;
  }).join('');

  return `
    <div style="overflow-x:auto;max-height:400px;overflow-y:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead style="position:sticky;top:0;background:#fff;z-index:1">
          <tr>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">זמן</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">רמה</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">קטגוריה</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:var(--gray-500);border-bottom:1px solid var(--gray-200)">הודעה</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function escLog(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// רשום אתחול מערכת
logInfo('SYSTEM', 'מערכת אותחלה', { url: location.href, time: new Date().toISOString() });
