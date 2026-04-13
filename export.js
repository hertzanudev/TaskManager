// ===================== EXCEL EXPORT (SheetJS) =====================

function openExportDialog() {
  const overlay    = document.getElementById('export-overlay');
  const dialog     = document.getElementById('export-dialog');
  const defaultTo  = (getSettings().reportSettings || {}).recipientEmail || '';
  overlay.classList.add('visible');
  dialog.classList.add('visible');

  dialog.innerHTML = `
    <h2>📥 יצוא לאקסל</h2>
    <p style="font-size:13.5px;color:var(--gray-600);margin-bottom:14px">בחר את סוגי המשימות לייצוא:</p>
    <div class="export-options">
      <label class="export-option">
        <input type="checkbox" id="exp-open"      checked> משימות פתוחות
      </label>
      <label class="export-option">
        <input type="checkbox" id="exp-draft"     checked> טיוטות
      </label>
      <label class="export-option">
        <input type="checkbox" id="exp-completed"> הושלמו
      </label>
      <label class="export-option">
        <input type="checkbox" id="exp-deleted"> נמחקו
      </label>
    </div>
    <div class="form-group" style="margin-top:16px">
      <label class="form-label">שלח גם למייל (אופציונלי)</label>
      <input type="email" id="exp-email" class="form-control" value="${defaultTo}" placeholder="השאר ריק לדילוג" dir="ltr">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="runExport()">יצא</button>
      <button class="btn btn-outline" onclick="closeExportDialog()">ביטול</button>
    </div>`;
}

function closeExportDialog() {
  document.getElementById('export-overlay').classList.remove('visible');
  document.getElementById('export-dialog').classList.remove('visible');
}

function runExport() {
  const includeOpen      = document.getElementById('exp-open')?.checked;
  const includeDraft     = document.getElementById('exp-draft')?.checked;
  const includeCompleted = document.getElementById('exp-completed')?.checked;
  const includeDeleted   = document.getElementById('exp-deleted')?.checked;
  const emailTo          = (document.getElementById('exp-email')?.value || '').trim();

  const statusesToInclude = [];
  if (includeOpen)      statusesToInclude.push('open');
  if (includeDraft)     statusesToInclude.push('draft');
  if (includeCompleted) statusesToInclude.push('completed');
  if (includeDeleted)   statusesToInclude.push('deleted');

  if (statusesToInclude.length === 0) {
    showToast('יש לבחור לפחות סוג אחד', 'error');
    return;
  }

  const tasks    = getTasks().filter(t => statusesToInclude.includes(t.status));
  const settings = getSettings();
  const labels   = settings.importanceLabels;
  const statusMap = { open: 'פתוחה', completed: 'הושלמה', deleted: 'נמחקה', draft: 'טיוטה' };

  // כותרות עמודות
  const headers = [
    'מזהה',
    'תאריך יצירה',
    'עובד',
    'קטגוריה',
    'לקוח',
    'תיאור',
    'חשיבות',
    'סטטוס',
    'תאריך השלמה',
    'תאריך מחיקה'
  ];

  const rows = tasks.map(t => [
    t.id,
    formatDate(t.createdAt),
    t.assignedTo,
    t.category,
    t.client,
    t.description || '',
    t.importance ? (labels[t.importance] || t.importance) : '',
    statusMap[t.status] || t.status,
    t.completedAt ? formatDate(t.completedAt) : '',
    t.deletedAt   ? formatDate(t.deletedAt)   : ''
  ]);

  // בנה worksheet
  const wsData = [headers, ...rows];
  const ws     = XLSX.utils.aoa_to_sheet(wsData);

  // RTL
  if (!ws['!dir']) ws['!dir'] = 'rtl';

  // רוחב עמודות
  ws['!cols'] = [
    { wch: 18 }, // מזהה
    { wch: 18 }, // תאריך יצירה
    { wch: 16 }, // עובד
    { wch: 14 }, // קטגוריה
    { wch: 16 }, // לקוח
    { wch: 40 }, // תיאור
    { wch: 10 }, // חשיבות
    { wch: 10 }, // סטטוס
    { wch: 18 }, // תאריך השלמה
    { wch: 18 }  // תאריך מחיקה
  ];

  // בנה workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'משימות');

  // שם קובץ
  const today    = new Date().toISOString().split('T')[0];
  const fileName = `משימות-${today}.xlsx`;

  XLSX.writeFile(wb, fileName);
  closeExportDialog();

  if (emailTo) {
    // שלח את הרשימה גם במייל אם הוזנה כתובת
    const rs = (getSettings().reportSettings || {});
    if (rs.emailjsServiceId && rs.emailjsTemplateId && rs.emailjsPublicKey) {
      const now     = new Date();
      const subject = `יצוא משימות – ${now.toISOString().split('T')[0]} (${tasks.length} משימות)`;
      const rowsHtml = tasks.map(t => {
        const statusMap = { open: 'פתוחה', completed: 'הושלמה', deleted: 'נמחקה', draft: 'טיוטה' };
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:7px 10px">${esc(String(t.id))}</td>
          <td style="padding:7px 10px">${esc(t.assignedTo)}</td>
          <td style="padding:7px 10px">${esc(t.category)}</td>
          <td style="padding:7px 10px">${esc(t.client || '')}</td>
          <td style="padding:7px 10px">${esc(t.policyNumber || '')}</td>
          <td style="padding:7px 10px;font-size:12px">${esc(truncate(t.description, 50))}</td>
          <td style="padding:7px 10px">${statusMap[t.status] || t.status}</td>
        </tr>`;
      }).join('');
      const bodyHtml = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;color:#1f2937">
  <div style="background:#2b6cb0;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:18px">📥 ${esc(subject)}</h1>
  </div>
  <div style="background:#fff;padding:18px 24px;border:1px solid #e5e7eb">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f9fafb">
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">מזהה</th>
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">עובד</th>
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">קטגוריה</th>
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">לקוח</th>
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">פוליסה</th>
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">תיאור</th>
        <th style="padding:7px 10px;text-align:right;font-size:11px;color:#6b7280">סטטוס</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
  <div style="background:#f9fafb;padding:10px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;font-size:12px;color:#9ca3af;text-align:center">נשלח ממערכת ניהול משימות</div>
</div>`;
      showToast('שולח מייל…', 'info', 60000);
      emailjs.send(rs.emailjsServiceId, rs.emailjsTemplateId, {
        to_email: emailTo, from_name: 'מערכת ניהול משימות', subject, message: bodyHtml
      })
      .then(() => showToast('המייל נשלח בהצלחה ✉️', 'success', 2000))
      .catch(() => showToast('שגיאה בשליחת מייל', 'error', 2000));
    } else {
      showToast(`הקובץ "${fileName}" יוצא בהצלחה`, 'success', 2000);
    }
  } else {
    showToast(`הקובץ "${fileName}" יוצא בהצלחה`, 'success', 2000);
  }
}
