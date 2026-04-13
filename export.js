// ===================== EXCEL EXPORT (SheetJS) =====================

function openExportDialog() {
  const overlay = document.getElementById('export-overlay');
  const dialog  = document.getElementById('export-dialog');
  overlay.classList.add('visible');
  dialog.classList.add('visible');

  let defaultTo = '';
  try { defaultTo = (getSettings().reportSettings || {}).recipientEmail || ''; } catch(e) {}

  dialog.innerHTML = `
    <h2>📥 יצוא לאקסל</h2>
    <p style="font-size:13.5px;color:var(--gray-600);margin-bottom:14px">בחר את סוגי המשימות:</p>
    <div class="export-options">
      <label class="export-option"><input type="checkbox" id="exp-open"      checked> משימות פתוחות</label>
      <label class="export-option"><input type="checkbox" id="exp-draft"     checked> טיוטות</label>
      <label class="export-option"><input type="checkbox" id="exp-completed"> הושלמו</label>
      <label class="export-option"><input type="checkbox" id="exp-deleted">   נמחקו</label>
    </div>
    <div class="form-group" style="margin-top:16px">
      <label class="form-label">כתובת מייל לשליחה (עבור כפתור "שלח")</label>
      <input type="email" id="exp-email" class="form-control" placeholder="example@email.com" dir="ltr">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary"  onclick="runDownload()">⬇ הורד</button>
      <button class="btn btn-secondary" onclick="runEmailExport()">📧 שלח</button>
      <button class="btn btn-outline"  onclick="closeExportDialog()">ביטול</button>
    </div>`;

  if (defaultTo) {
    const emailInput = document.getElementById('exp-email');
    if (emailInput) emailInput.value = defaultTo;
  }
}

function closeExportDialog() {
  document.getElementById('export-overlay').classList.remove('visible');
  document.getElementById('export-dialog').classList.remove('visible');
}

// ── הורד לאקסל מקומית ──────────────────────────────────
function runDownload() {
  try {
    const { wb, fileName } = _buildWorkbook();
    if (!wb) return;
    XLSX.writeFile(wb, fileName);
    closeExportDialog();
    showToast(`הקובץ "${fileName}" יוצא בהצלחה`, 'success', 2000);
  } catch(err) {
    console.error('[EXPORT] שגיאה:', err);
    showToast('שגיאה בייצוא: ' + err.message, 'error', 5000);
  }
}

// ── שלח דוח במייל (HTML – ללא קובץ מצורף) ─────────────
function runEmailExport() {
  const emailTo = (document.getElementById('exp-email')?.value || '').trim();
  if (!emailTo) {
    showToast('יש להזין כתובת מייל לשליחה', 'error');
    return;
  }

  let rs = {};
  try { rs = getSettings().reportSettings || {}; } catch(e) {}
  if (!rs.emailjsServiceId || !rs.emailjsTemplateId || !rs.emailjsPublicKey) {
    showToast('יש להגדיר פרטי EmailJS בהגדרות לפני שליחה', 'error');
    return;
  }

  try {
    const { tasks, fileName } = _buildWorkbook();  // בנה גם את רשימת המשימות
    if (!tasks || tasks.length === 0) {
      showToast('אין משימות לשליחה', 'error');
      return;
    }

    const settings  = getSettings();
    const statusMap = { open: 'פתוחה', completed: 'הושלמה', deleted: 'נמחקה', draft: 'טיוטה' };
    const now       = new Date();
    const subject   = `יצוא משימות – ${now.toISOString().split('T')[0]} (${tasks.length} משימות)`;

    const importanceLabel = (key) => {
      if (!key) return '';
      const level = (settings.importanceLevels || []).find(l => l.key === key);
      return level ? level.label : key;
    };

    const rowsHtml = tasks.map(t => {
      const safeDate = (v) => { try { return v ? formatDate(v) : ''; } catch(e) { return ''; } };
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:7px 10px">${esc(String(t.id || ''))}</td>
        <td style="padding:7px 10px">${safeDate(t.createdAt)}</td>
        <td style="padding:7px 10px">${esc(t.assignedTo || '')}</td>
        <td style="padding:7px 10px">${esc(t.category || '')}</td>
        <td style="padding:7px 10px">${esc(t.client || '')}</td>
        <td style="padding:7px 10px">${esc(t.policyNumber || '')}</td>
        <td style="padding:7px 10px;font-size:12px;max-width:200px">${esc((t.description || '').substring(0, 80))}</td>
        <td style="padding:7px 10px">${importanceLabel(t.importance)}</td>
        <td style="padding:7px 10px">${statusMap[t.status] || t.status}</td>
        <td style="padding:7px 10px">${safeDate(t.completedAt)}</td>
        <td style="padding:7px 10px">${safeDate(t.deletedAt)}</td>
      </tr>`;
    }).join('');

    const bodyHtml = `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;color:#1f2937">
  <div style="background:#2b6cb0;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:18px">📥 ${esc(subject)}</h1>
    <p style="margin:5px 0 0;opacity:.8;font-size:13px">נוצר ב-${formatDate(now.toISOString())}</p>
  </div>
  <div style="background:#fff;padding:16px 20px;border:1px solid #e5e7eb;overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:700px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">מזהה</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">תאריך יצירה</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">עובד</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">קטגוריה</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">לקוח</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">פוליסה</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">תיאור</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">חשיבות</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">סטטוס</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">תאריך השלמה</th>
          <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb">תאריך מחיקה</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <div style="background:#f9fafb;padding:10px 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af;text-align:center">
    נשלח ממערכת ניהול משימות
  </div>
</div>`;

    closeExportDialog();
    showToast('שולח…', 'info', 60000);

    emailjs.send(rs.emailjsServiceId, rs.emailjsTemplateId, {
      to_email:  emailTo,
      from_name: 'מערכת ניהול משימות',
      subject,
      message:   bodyHtml
    })
    .then(() => showToast('המייל נשלח בהצלחה ✉️', 'success', 2000))
    .catch(err => {
      console.error('[EMAIL EXPORT]', err);
      showToast('שגיאה בשליחת מייל', 'error', 2000);
    });

  } catch(err) {
    console.error('[EMAIL EXPORT] שגיאה:', err);
    showToast('שגיאה: ' + err.message, 'error', 5000);
  }
}

// ── בנה Workbook + מחזיר גם את רשימת המשימות ───────────
function _buildWorkbook() {
  const includeOpen      = document.getElementById('exp-open')?.checked;
  const includeDraft     = document.getElementById('exp-draft')?.checked;
  const includeCompleted = document.getElementById('exp-completed')?.checked;
  const includeDeleted   = document.getElementById('exp-deleted')?.checked;

  const statusesToInclude = [];
  if (includeOpen)      statusesToInclude.push('open');
  if (includeDraft)     statusesToInclude.push('draft');
  if (includeCompleted) statusesToInclude.push('completed');
  if (includeDeleted)   statusesToInclude.push('deleted');

  if (statusesToInclude.length === 0) {
    showToast('יש לבחור לפחות סוג אחד', 'error');
    return { wb: null, tasks: [] };
  }

  const tasks    = getTasks().filter(t => statusesToInclude.includes(t.status));
  const settings = getSettings();
  const statusMap = { open: 'פתוחה', completed: 'הושלמה', deleted: 'נמחקה', draft: 'טיוטה' };
  const safeDate  = (v) => { try { return v ? formatDate(v) : ''; } catch(e) { return ''; } };

  const importanceLabel = (key) => {
    if (!key) return '';
    const level = (settings.importanceLevels || []).find(l => l.key === key);
    return level ? level.label : key;
  };

  const headers = [
    'מזהה', 'תאריך יצירה', 'עובד', 'קטגוריה', 'לקוח', 'פוליסה',
    'תיאור', 'חשיבות', 'סטטוס', 'תאריך השלמה', 'תאריך מחיקה'
  ];

  const rows = tasks.map(t => [
    String(t.id || ''),
    safeDate(t.createdAt),
    t.assignedTo   || '',
    t.category     || '',
    t.client       || '',
    t.policyNumber || '',
    t.description  || '',
    importanceLabel(t.importance),
    statusMap[t.status] || t.status,
    safeDate(t.completedAt),
    safeDate(t.deletedAt)
  ]);

  const wsData = [headers, ...rows];
  const ws     = XLSX.utils.aoa_to_sheet(wsData);
  if (!ws['!dir']) ws['!dir'] = 'rtl';
  ws['!cols'] = [
    { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }
  ];

  const wb       = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'משימות');
  const fileName = `משימות-${new Date().toISOString().split('T')[0]}.xlsx`;

  return { wb, tasks, fileName };
}
