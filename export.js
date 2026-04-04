// ===================== EXCEL EXPORT (SheetJS) =====================

function openExportDialog() {
  const overlay = document.getElementById('export-overlay');
  const dialog  = document.getElementById('export-dialog');
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
  showToast(`הקובץ "${fileName}" יוצא בהצלחה`);
}
