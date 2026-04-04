// ===================== PDF MERGE SUB-SYSTEM =====================
// מאחד PDF – ניהול הגדרות ואיחוד קבצים בדפדפן
// עצמאי ממערכת המשימות – שמור תחת מפתח pdf_merge_settings

'use strict';

const PDF_SETTINGS_KEY = 'pdf_merge_settings';
let _pdfFiles   = [];   // [{ file: File, name: string, size: number, modified: number }]
let _pdfLibReady = false;

// ── Settings ────────────────────────────────────────────
function getPdfMergeSettings() {
  try { return JSON.parse(localStorage.getItem(PDF_SETTINGS_KEY)) || _defaultPdfSettings(); }
  catch(e) { return _defaultPdfSettings(); }
}
function _defaultPdfSettings() {
  return { triggerWord: 'סריקה', subjectPrefix: '[קובץ סרוק]',
           recipientsTo: '', recipientsCC: '', recipientsBCC: '' };
}
function _savePdfMergeSettings(s) {
  localStorage.setItem(PDF_SETTINGS_KEY, JSON.stringify(s));
  if (typeof cloudSaveDebounced === 'function') cloudSaveDebounced();
}

// ── Page Render ──────────────────────────────────────────
function renderPdfMergerPage() {
  if (typeof closeSidebar === 'function') closeSidebar();
  _pdfFiles = [];
  const main = document.getElementById('content');
  main.innerHTML = `
    <div class="screen-header">
      <h2 class="screen-title">📄 מאחד PDF</h2>
    </div>

    <div class="pdf-tabs-bar">
      <button class="pdf-tab active" id="tab-btn-merge"    onclick="pdfSwitchTab('merge',    this)">✂️ איחוד ידני</button>
      <button class="pdf-tab"        id="tab-btn-settings" onclick="pdfSwitchTab('settings', this)">⚙️ הגדרות אוטומציה</button>
    </div>

    <div id="pdf-pane-merge"    class="pdf-pane">${_buildMergePaneHtml()}</div>
    <div id="pdf-pane-settings" class="pdf-pane hidden">${_buildSettingsPaneHtml()}</div>
  `;
  _setupDropZone();
}

function pdfSwitchTab(tab, btn) {
  document.querySelectorAll('.pdf-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('pdf-pane-merge').classList.toggle('hidden', tab !== 'merge');
  document.getElementById('pdf-pane-settings').classList.toggle('hidden', tab !== 'settings');
  if (tab === 'merge') _setupDropZone();
}

// ── Manual Merge Pane ────────────────────────────────────
function _buildMergePaneHtml() {
  return `
    <div class="pdf-merge-wrap">
      <div class="pdf-drop-zone" id="pdf-drop-zone" onclick="document.getElementById('pdf-file-input').click()">
        <div class="pdf-drop-icon">📁</div>
        <p class="pdf-drop-title">גרור קבצי PDF לכאן</p>
        <p class="pdf-drop-sub">או לחץ לבחירת קבצים</p>
        <input type="file" id="pdf-file-input" multiple accept="application/pdf,.pdf"
               style="display:none" onchange="pdfHandleFiles(this.files)">
      </div>

      <div id="pdf-file-list" class="pdf-file-list"></div>

      <div id="pdf-actions" class="pdf-actions hidden">
        <button class="btn btn-primary"  onclick="pdfStartMerge()">⬇ איחוד והורדה</button>
        <button class="btn btn-outline"  onclick="pdfClearAll()">🗑 נקה הכל</button>
      </div>
      <div id="pdf-status" class="pdf-status"></div>
    </div>`;
}

// ── Settings Pane ────────────────────────────────────────
function _buildSettingsPaneHtml() {
  const s = getPdfMergeSettings();
  const e = v => (v || '').replace(/"/g, '&quot;');
  return `
    <div class="pdf-settings-wrap">
      <div class="settings-card">
        <h3 class="settings-card-title">🔔 טריגר מייל נכנס</h3>

        <div class="field-group">
          <label>מילת טריגר בנושא המייל</label>
          <input type="text" id="ps-trigger" value="${e(s.triggerWord)}" placeholder="סריקה">
          <span class="field-hint">מייל שנושאו מכיל מילה זו → יעובד אוטומטית; שאר המיילים לא ייגעו</span>
        </div>

        <div class="field-group">
          <label>קידומת לנושא המייל היוצא</label>
          <input type="text" id="ps-prefix" value="${e(s.subjectPrefix)}" placeholder="[קובץ סרוק]">
          <span class="field-hint">לדוגמה: <strong>[קובץ סרוק] סריקה דני 12.02.26</strong></span>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-card-title">📨 נמענים</h3>

        <div class="field-group">
          <label>נמענים ראשיים (To) – ברירת מחדל</label>
          <input type="text" id="ps-to"  value="${e(s.recipientsTo)}"  placeholder="a@example.com, b@example.com">
          <span class="field-hint">כתובת אחת או יותר, מופרדות בפסיקים</span>
        </div>
        <div class="field-group">
          <label>עותק גלוי (CC)</label>
          <input type="text" id="ps-cc"  value="${e(s.recipientsCC)}"  placeholder="c@example.com">
        </div>
        <div class="field-group">
          <label>עותק מוסתר (BCC)</label>
          <input type="text" id="ps-bcc" value="${e(s.recipientsBCC)}" placeholder="d@example.com">
        </div>

        <div class="pdf-override-note">
          <span class="override-note-icon">💡</span>
          <div>
            <strong>שליחה לנמען ייעודי (עוקף ברירת מחדל)</strong><br>
            ניתן לציין נמען שונה לכל מייל בודד על-ידי הוספת השורה הבאה
            לגוף המייל השולח את קבצי ה-PDF:<br>
            <code>send to: recipient@example.com</code><br>
            <span class="override-note-sub">
              כאשר שורה זו קיימת בגוף המייל, המערכת תשלח את הקובץ המאוחד
              לכתובת זו בלבד — במקום לנמענים המוגדרים כברירת מחדל לעיל.<br>
              עותקי CC ו-BCC מההגדרות יישמרו גם במקרה זה.
            </span>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" onclick="pdfSaveSettings()">💾 שמור הגדרות</button>
    </div>`;
}

function pdfSaveSettings() {
  const settings = {
    triggerWord:   (document.getElementById('ps-trigger').value.trim() || 'סריקה'),
    subjectPrefix: (document.getElementById('ps-prefix').value.trim()  || '[קובץ סרוק]'),
    recipientsTo:  document.getElementById('ps-to').value.trim(),
    recipientsCC:  document.getElementById('ps-cc').value.trim(),
    recipientsBCC: document.getElementById('ps-bcc').value.trim()
  };
  _savePdfMergeSettings(settings);
  if (typeof showToast === 'function') showToast('הגדרות PDF נשמרו ✓');
}

// ── File Handling ────────────────────────────────────────
function pdfHandleFiles(fileList) {
  const newFiles = Array.from(fileList).filter(f =>
    f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
  if (!newFiles.length) return;

  newFiles.forEach(f => {
    const exists = _pdfFiles.some(p => p.file.name === f.name && p.file.size === f.size);
    if (!exists) _pdfFiles.push({ file: f });
  });

  // מיין לפי זמן שינוי אחרון (קרוב לזמן יצירה)
  _pdfFiles.sort((a, b) => (a.file.lastModified || 0) - (b.file.lastModified || 0));

  _renderFileList();
  // reset input so same file can be re-added after removal
  const inp = document.getElementById('pdf-file-input');
  if (inp) inp.value = '';
}

function _renderFileList() {
  const list    = document.getElementById('pdf-file-list');
  const actions = document.getElementById('pdf-actions');
  if (!list) return;

  if (_pdfFiles.length === 0) {
    list.innerHTML = '';
    actions && actions.classList.add('hidden');
    return;
  }

  list.innerHTML = _pdfFiles.map((p, i) => `
    <div class="pdf-file-row">
      <span class="pdf-row-num">${i + 1}</span>
      <span class="pdf-row-icon">📄</span>
      <span class="pdf-row-name" title="${p.file.name}">${p.file.name}</span>
      <span class="pdf-row-size">${_fmtSize(p.file.size)}</span>
      <div class="pdf-row-btns">
        ${i > 0
          ? `<button class="icon-btn" onclick="pdfMoveFile(${i},-1)" title="הזז למעלה">↑</button>`
          : `<span class="icon-btn-placeholder"></span>`}
        ${i < _pdfFiles.length - 1
          ? `<button class="icon-btn" onclick="pdfMoveFile(${i},1)"  title="הזז למטה">↓</button>`
          : `<span class="icon-btn-placeholder"></span>`}
        <button class="icon-btn danger" onclick="pdfRemoveFile(${i})" title="הסר">✕</button>
      </div>
    </div>`
  ).join('');

  actions && actions.classList.remove('hidden');
}

function pdfMoveFile(idx, dir) {
  const ni = idx + dir;
  if (ni < 0 || ni >= _pdfFiles.length) return;
  [_pdfFiles[idx], _pdfFiles[ni]] = [_pdfFiles[ni], _pdfFiles[idx]];
  _renderFileList();
}

function pdfRemoveFile(idx) {
  _pdfFiles.splice(idx, 1);
  _renderFileList();
}

function pdfClearAll() {
  _pdfFiles = [];
  _renderFileList();
  const s = document.getElementById('pdf-status');
  if (s) s.innerHTML = '';
}

function _fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

// ── Merge (browser, pdf-lib CDN) ────────────────────────
async function pdfStartMerge() {
  if (!_pdfFiles.length) return;
  const status = document.getElementById('pdf-status');

  try {
    status.innerHTML = '<span class="pdf-status-loading">⏳ מאחד קבצים…</span>';

    if (_pdfFiles.length === 1) {
      // קובץ יחיד – הורד ישירות
      _downloadBlob(_pdfFiles[0].file, _pdfFiles[0].file.name);
      status.innerHTML = '<span class="pdf-status-ok">✅ הקובץ הורד בהצלחה</span>';
      return;
    }

    // טען pdf-lib
    await _loadPdfLib();

    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();

    for (const entry of _pdfFiles) {
      const buf = await entry.file.arrayBuffer();
      const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }

    const bytes = await merged.save();
    const blob  = new Blob([bytes], { type: 'application/pdf' });
    const date  = new Date().toLocaleDateString('he-IL').replace(/\//g, '-');
    _downloadBlob(blob, `מאוחד_${date}.pdf`);

    status.innerHTML = `<span class="pdf-status-ok">✅ ${_pdfFiles.length} קבצים אוחדו בהצלחה</span>`;

  } catch(err) {
    console.error('[PDF-MERGE]', err);
    status.innerHTML = `<span class="pdf-status-err">❌ שגיאה: ${err.message}</span>`;
  }
}

function _downloadBlob(blobOrFile, name) {
  const url = URL.createObjectURL(blobOrFile);
  const a   = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function _loadPdfLib() {
  if (_pdfLibReady || typeof PDFLib !== 'undefined') { _pdfLibReady = true; return; }
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.onload  = () => { _pdfLibReady = true; res(); };
    s.onerror = () => rej(new Error('טעינת pdf-lib נכשלה – בדוק חיבור אינטרנט'));
    document.head.appendChild(s);
  });
}

// ── Drop Zone ────────────────────────────────────────────
function _setupDropZone() {
  const zone = document.getElementById('pdf-drop-zone');
  if (!zone || zone._hasDropEvents) return;
  zone._hasDropEvents = true;

  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
  zone.addEventListener('drop',      e  => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    pdfHandleFiles(e.dataTransfer.files);
  });
}
