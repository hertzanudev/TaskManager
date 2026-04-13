// ===================== REPORT & SCHEDULER =====================
// שליחת דוחות אוטומטיים ב-EmailJS

let schedulerInterval = null;

// ── Init ───────────────────────────────────────────────
function initEmailJS() {
  const rs = getSettings().reportSettings;
  if (rs.emailjsPublicKey && typeof emailjs !== 'undefined') {
    emailjs.init(rs.emailjsPublicKey);
  }
}

function initScheduler() {
  initEmailJS();
  checkSchedule();
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = setInterval(checkSchedule, 60000); // בדיקה כל דקה
}

// ── Scheduler ──────────────────────────────────────────
function checkSchedule() {
  const s  = getSettings();
  const rs = s.reportSettings;
  if (rs.schedule === 'manual') return;
  if (!rs.recipientEmail || !rs.emailjsServiceId) return;

  const now       = new Date();
  const nowHHMM   = now.toTimeString().slice(0, 5); // "HH:MM"
  const lastSent  = rs.lastSentAt ? new Date(rs.lastSentAt) : null;

  // בדוק אם הגיע הזמן לשלוח
  let shouldSend = false;

  if (rs.schedule === 'daily') {
    // שלח אם השעה מתאימה ועדיין לא נשלח היום
    const sentToday = lastSent && toDateKey(lastSent.toISOString()) === toDateKey(now.toISOString());
    shouldSend = nowHHMM >= rs.scheduleTime && !sentToday;
  }
  else if (rs.schedule === 'weekly') {
    const todayDOW   = now.getDay();
    const sentThisWk = lastSent && getWeekKey(lastSent) === getWeekKey(now);
    shouldSend = todayDOW == rs.scheduleDayOfWeek && nowHHMM >= rs.scheduleTime && !sentThisWk;
  }
  else if (rs.schedule === 'monthly') {
    const todayDOM   = now.getDate();
    const sentThisMo = lastSent &&
      lastSent.getMonth()    === now.getMonth() &&
      lastSent.getFullYear() === now.getFullYear();
    shouldSend = todayDOM == rs.scheduleDayOfMonth && nowHHMM >= rs.scheduleTime && !sentThisMo;
  }

  if (shouldSend) {
    const periodType = rs.schedule === 'daily' ? 'today'
                     : rs.schedule === 'weekly'  ? 'week'
                     : 'month';
    sendEmailReport(periodType).then(() => {
      markReportSent();
    }).catch(err => console.warn('שגיאה בשליחת דוח אוטומטי:', err));
  }
}

function getWeekKey(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay()); // תחילת שבוע
  return d.toISOString().split('T')[0];
}

function markReportSent() {
  const s = getSettings();
  s.reportSettings.lastSentAt = new Date().toISOString();
  saveSettings(s);
}

// ── Send Filtered List (כפתור "שלח הרשימה" במסך הראשי) ──
// פותח חלונית עם פרטי מייל לעריכה לפני שליחה
function sendFilteredListEmail() {
  const rs = getSettings().reportSettings;

  if (!rs.emailjsServiceId || !rs.emailjsTemplateId || !rs.emailjsPublicKey) {
    showToast('יש להגדיר תחילה פרטי EmailJS בהגדרות', 'error');
    return;
  }

  const tasks = (typeof _lastFilteredTasks !== 'undefined') ? _lastFilteredTasks : [];
  if (tasks.length === 0) {
    showToast('אין משימות ברשימה הנוכחית לשליחה', 'error');
    return;
  }

  const now            = new Date();
  const defaultSubject = `רשימת משימות – ${formatDate(now.toISOString())} (${tasks.length} משימות)`;
  const defaultTo      = rs.recipientEmail || '';

  const overlay = document.getElementById('export-overlay');
  const dialog  = document.getElementById('export-dialog');
  overlay.classList.add('visible');
  dialog.classList.add('visible');

  dialog.innerHTML = `
    <h2>📧 שלח הרשימה במייל</h2>
    <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">${tasks.length} משימות ברשימה המסוננת</p>
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">כתובת מייל נמען</label>
      <input type="email" id="send-list-to" class="form-control" value="${esc(defaultTo)}" placeholder="example@email.com" dir="ltr">
    </div>
    <div class="form-group" style="margin-bottom:16px">
      <label class="form-label">נושא המייל</label>
      <input type="text" id="send-list-subject" class="form-control" value="${esc(defaultSubject)}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="doSendFilteredEmail()">שלח</button>
      <button class="btn btn-outline" onclick="closeExportDialog()">ביטול</button>
    </div>`;
}

// מבצע את השליחה בפועל לאחר אישור בחלונית
function doSendFilteredEmail() {
  const toEmail = (document.getElementById('send-list-to')?.value || '').trim();
  const subject = (document.getElementById('send-list-subject')?.value || '').trim();

  if (!toEmail) {
    showToast('יש להזין כתובת מייל', 'error');
    return;
  }

  const rs    = getSettings().reportSettings;
  const tasks = (typeof _lastFilteredTasks !== 'undefined') ? _lastFilteredTasks : [];
  const now   = new Date();

  const taskRows = tasks.map(t => {
    const ageHours = t.createdAt ? ((Date.now() - new Date(t.createdAt)) / 3600000).toFixed(1) : '—';
    const ageStyle = ageHours >= 48 ? 'color:#dc2626;font-weight:700'
                   : ageHours >= 24 ? 'font-weight:700'
                   : '';
    return `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:8px 12px;${ageStyle}">${esc(t.id)}</td>
      <td style="padding:8px 12px;${ageStyle}">${esc(t.assignedTo)}</td>
      <td style="padding:8px 12px;${ageStyle}">${esc(t.category)}</td>
      <td style="padding:8px 12px;${ageStyle}">${esc(t.client || '—')}</td>
      <td style="padding:8px 12px;${ageStyle}">${esc(t.policyNumber || '—')}</td>
      <td style="padding:8px 12px;font-size:13px;${ageStyle}">${esc(truncate(t.description, 60))}</td>
      <td style="padding:8px 12px;text-align:center;${ageStyle}">${ageHours !== '—' ? ageHours + ' שע\'' : '—'}</td>
    </tr>`;
  }).join('');

  const bodyHtml = `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;color:#1f2937">
  <div style="background:#2b6cb0;color:#fff;padding:20px 28px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">📋 ${esc(subject)}</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:14px">נוצר ב-${formatDate(now.toISOString())}</p>
  </div>
  <div style="background:#fff;padding:20px 28px;border:1px solid #e5e7eb">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">מזהה</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">עובד</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">קטגוריה</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">לקוח</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">פוליסה</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280">תיאור</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280">גיל (שע')</th>
        </tr>
      </thead>
      <tbody>${taskRows}</tbody>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af">
      🔴 אדום/בולד = מעל 48 שעות &nbsp;|&nbsp; <strong>בולד</strong> = מעל 24 שעות
    </p>
  </div>
  <div style="background:#f9fafb;padding:12px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af;text-align:center">
    נשלח ממערכת ניהול משימות
  </div>
</div>`;

  closeExportDialog();
  showToast('שולח…', 'info', 60000);

  emailjs.send(rs.emailjsServiceId, rs.emailjsTemplateId, {
    to_email:  toEmail,
    from_name: 'מערכת ניהול משימות',
    subject,
    message:   bodyHtml
  })
  .then(() => showToast(`המייל נשלח בהצלחה ✉️`, 'success', 2000))
  .catch(err => {
    console.error('שגיאה בשליחת רשימה:', err);
    showToast('שגיאה בשליחה – בדוק פרטי EmailJS', 'error', 2000);
  });
}

// ── Send Now (כפתור ידני) ──────────────────────────────
function sendReportNow() {
  const rs = getSettings().reportSettings;

  if (!rs.emailjsServiceId || !rs.emailjsTemplateId || !rs.emailjsPublicKey) {
    showToast('יש להגדיר תחילה את פרטי EmailJS ולשמור', 'error');
    return;
  }
  if (!rs.recipientEmail) {
    showToast('יש להזין כתובת מייל נמען', 'error');
    return;
  }

  const periodType = rs.schedule === 'monthly' ? 'month'
                   : rs.schedule === 'weekly'  ? 'week'
                   : 'today';

  showToast('שולח דוח…', 'info');

  sendEmailReport(periodType)
    .then(() => {
      markReportSent();
      showToast('הדוח נשלח בהצלחה! ✉️');
      // רענן הגדרות כדי לעדכן "נשלח לאחרונה"
      renderSettings();
    })
    .catch(err => {
      console.error('שגיאה:', err);
      showToast('שגיאה בשליחה – בדוק פרטי EmailJS', 'error');
    });
}

// ── Report Generation ──────────────────────────────────
function sendEmailReport(periodType) {
  const s           = getSettings();
  const rs          = s.reportSettings;
  const { subject, bodyText, bodyHtml } = generateReportContent(periodType, s);

  return emailjs.send(
    rs.emailjsServiceId,
    rs.emailjsTemplateId,
    {
      to_email:  rs.recipientEmail,
      from_name: 'מערכת ניהול משימות',
      subject,
      message:   bodyHtml   // {{message}} בתבנית – HTML מלא
    }
  );
}

function generateReportContent(periodType, settings) {
  const tasks    = getTasks();
  const now      = new Date();
  const today    = toDateKey(now.toISOString());

  // חישוב גבול תקופה
  let periodStart, periodLabel;
  if (periodType === 'today') {
    periodStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    periodLabel  = 'היום (' + formatDateOnly(now.toISOString()) + ')';
  } else if (periodType === 'week') {
    const dayOfWeek = now.getDay();
    periodStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    periodLabel  = 'השבוע (מ-' + formatDateOnly(periodStart.toISOString()) + ')';
  } else {
    periodStart  = new Date(now.getFullYear(), now.getMonth(), 1);
    periodLabel  = 'החודש (' + now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }) + ')';
  }

  const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'draft');
  const completedInPeriod = tasks.filter(t =>
    t.status === 'completed' &&
    t.completedAt &&
    new Date(t.completedAt) >= periodStart
  );

  const employees = settings.employees.length > 0
    ? settings.employees
    : [...new Set([...openTasks, ...completedInPeriod].map(t => t.assignedTo))];

  const subject = `דוח משימות – ${periodLabel}`;

  // ── HTML ───────────────────────────────────────────
  const openByEmp = groupByEmployee(openTasks, employees);
  const compByEmp = groupByEmployee(completedInPeriod, employees);

  const openRows = employees.map(emp => {
    const empTasks = openByEmp[emp] || [];
    const taskList = empTasks.map(t =>
      `• ${esc(t.client)} – ${esc(truncate(t.description, 50))} [${importanceLabelFor(t.importance, settings)}]`
    ).join('\n');
    return `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:10px 14px;font-weight:600">${esc(emp)}</td>
      <td style="padding:10px 14px;text-align:center">${empTasks.length}</td>
      <td style="padding:10px 14px;font-size:13px;white-space:pre-line">${taskList || '—'}</td>
    </tr>`;
  }).join('');

  const compRows = employees.map(emp => {
    const empTasks = compByEmp[emp] || [];
    const avgHours = calcAvgHours(empTasks);
    return `<tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:10px 14px;font-weight:600">${esc(emp)}</td>
      <td style="padding:10px 14px;text-align:center">${empTasks.length}</td>
      <td style="padding:10px 14px;text-align:center">${avgHours !== null ? avgHours + ' שע\'' : '—'}</td>
    </tr>`;
  }).join('');

  const totalOpen = openTasks.length;
  const totalComp = completedInPeriod.length;

  const bodyHtml = `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#1f2937">
  <div style="background:#2b6cb0;color:#fff;padding:20px 28px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">📋 ${subject}</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:14px">נוצר ב-${formatDate(now.toISOString())}</p>
  </div>

  <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb">
    <div style="display:flex;gap:24px;margin-bottom:24px">
      <div style="background:#ebf4ff;border-radius:8px;padding:14px 20px;flex:1;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#2b6cb0">${totalOpen}</div>
        <div style="font-size:13px;color:#6b7280">משימות פתוחות</div>
      </div>
      <div style="background:#f0fff4;border-radius:8px;padding:14px 20px;flex:1;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#2f855a">${totalComp}</div>
        <div style="font-size:13px;color:#6b7280">הושלמו ${periodLabel}</div>
      </div>
    </div>

    <h2 style="font-size:16px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px">משימות פתוחות לפי עובד</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 14px;text-align:right;font-size:12px;color:#6b7280">עובד</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280">כמות</th>
          <th style="padding:10px 14px;text-align:right;font-size:12px;color:#6b7280">משימות</th>
        </tr>
      </thead>
      <tbody>${openRows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af">אין משימות פתוחות</td></tr>'}</tbody>
    </table>

    <h2 style="font-size:16px;color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px">סטטיסטיקת הושלמו – ${periodLabel}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:10px 14px;text-align:right;font-size:12px;color:#6b7280">עובד</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280">הושלמו</th>
          <th style="padding:10px 14px;text-align:center;font-size:12px;color:#6b7280">ממוצע זמן</th>
        </tr>
      </thead>
      <tbody>${compRows || '<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af">אין נתונים לתקופה</td></tr>'}</tbody>
    </table>
  </div>

  <div style="background:#f9fafb;padding:12px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af;text-align:center">
    נשלח ממערכת ניהול משימות
  </div>
</div>`;

  // ── Plain text ────────────────────────────────────────
  const openText = employees.map(emp => {
    const empTasks = openByEmp[emp] || [];
    return `${emp}: ${empTasks.length} משימות פתוחות`;
  }).join('\n');

  const compText = employees.map(emp => {
    const empTasks = compByEmp[emp] || [];
    const avg = calcAvgHours(empTasks);
    return `${emp}: ${empTasks.length} הושלמו${avg !== null ? ', ממוצע ' + avg + ' שעות' : ''}`;
  }).join('\n');

  const bodyText = `${subject}\nנוצר: ${formatDate(now.toISOString())}\n\n`
    + `סה"כ פתוחות: ${totalOpen} | הושלמו ${periodLabel}: ${totalComp}\n\n`
    + `--- משימות פתוחות ---\n${openText}\n\n`
    + `--- סטטיסטיקת הושלמו ---\n${compText}`;

  return { subject, bodyHtml, bodyText };
}

// ── Helpers ────────────────────────────────────────────
function groupByEmployee(tasks, employees) {
  const map = {};
  employees.forEach(e => { map[e] = []; });
  tasks.forEach(t => {
    if (!map[t.assignedTo]) map[t.assignedTo] = [];
    map[t.assignedTo].push(t);
  });
  return map;
}

function calcAvgHours(tasks) {
  const withTimes = tasks.filter(t => t.createdAt && t.completedAt);
  if (withTimes.length === 0) return null;
  const total = withTimes.reduce((sum, t) =>
    sum + (new Date(t.completedAt) - new Date(t.createdAt)) / 3600000, 0);
  return (total / withTimes.length).toFixed(1);
}

function importanceLabelFor(key, settings) {
  if (!key) return 'ללא';
  const level = (settings.importanceLevels || []).find(l => l.key === key);
  return level ? level.label : key;
}

// ── Start scheduler on load ────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // קצת עיכוב כדי שה-DOM יהיה מוכן
  setTimeout(initScheduler, 1500);
});
