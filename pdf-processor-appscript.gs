// ===================== EMAIL PROCESSOR – APPS SCRIPT =====================
// מעבד שני סוגי מיילים:
//   1. משימות  – נושא: "משימה, עובד, קטגוריה" → יוצר משימה ב-Firebase + תווית "משימה-עודכנה"
//   2. סריקות  – נושא מכיל מילת טריגר + קבצי PDF → מאחד ושולח + תווית "PDF-עובד"
//
// ─── appsscript.json ───────────────────────────────────────────────────
// {
//   "timeZone": "Asia/Jerusalem",
//   "dependencies": {},
//   "exceptionLogging": "STACKDRIVER",
//   "runtimeVersion": "V8",
//   "oauthScopes": [
//     "https://www.googleapis.com/auth/gmail.modify",
//     "https://www.googleapis.com/auth/gmail.send",
//     "https://www.googleapis.com/auth/drive",
//     "https://www.googleapis.com/auth/script.external_request",
//     "https://www.googleapis.com/auth/script.scriptapp"
//   ]
// }
// ───────────────────────────────────────────────────────────────────────

const FIREBASE_URL     = 'https://task-manager-ac919-default-rtdb.europe-west1.firebasedatabase.app';
const PROCESSED_LABEL  = 'PDF-עובד';       // מייל PDF שטופל
const TASK_LABEL       = 'משימה-עודכנה';   // מייל שממנו נוצרה משימה
const REPLY_LABEL      = 'תגובה-עודכנה';   // תגובה למייל אישור שטופלה

// ══════════════════════════════════════════════════════════════
//  WEB APP ENDPOINT
//  mode=tasks  → סנכרון משימות ממייל בלבד
//  mode=pdf    → עיבוד PDF בלבד
//  (ברירת מחדל = שניהם)
// ══════════════════════════════════════════════════════════════
async function doGet(e) {
  try {
    const mode = (e && e.parameter && e.parameter.mode) || 'all';
    Logger.log(`▶ doGet הופעל | mode=${mode}`);

    if (mode === 'tasks' || mode === 'all') await checkEmailsAndCreateTasks();
    if (mode === 'tasks' || mode === 'all') checkTaskReplies();
    if (mode === 'pdf'   || mode === 'all') await processPdfEmails();

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, message: 'עיבוד הושלם בהצלחה' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    Logger.log(`❌ doGet שגיאה: ${err.message}`);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ══════════════════════════════════════════════════════════════
//  TRIGGER SETUP  (הרץ כל פונקציה פעם אחת בלבד)
// ══════════════════════════════════════════════════════════════

// טריגר לסנכרון משימות ממייל (כל 5 דקות)
function createTaskTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkEmailsAndCreateTasks')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('checkEmailsAndCreateTasks')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ טריגר משימות נוצר – יפעל כל 5 דקות');
}

// טריגר לעיבוד PDF (כל 5 דקות)
function createPdfTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'processPdfEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('processPdfEmails')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ טריגר PDF נוצר – יפעל כל 5 דקות');
}

// טריגר לעיבוד תגובות למיילי אישור (כל 5 דקות)
function createReplyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkTaskReplies')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('checkTaskReplies')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('✅ טריגר תגובות נוצר – יפעל כל 5 דקות');
}

// הרץ פעם אחת בלבד ליצירת כל הטריגרים
function createAllTriggers() {
  createTaskTrigger();
  createPdfTrigger();
  createReplyTrigger();
}

// ══════════════════════════════════════════════════════════════
//  PART 1 – TASK EMAIL PROCESSING
// ══════════════════════════════════════════════════════════════

async function checkEmailsAndCreateTasks() {
  // -subject:"[ID:" מסנן תגובות למיילי אישור שנשלחו מהמערכת
  const query = `subject:משימה is:unread -from:me -label:${TASK_LABEL} -subject:"[ID:"`;
  const threads = GmailApp.search(query, 0, 20);
  Logger.log(`📬 נמצאו ${threads.length} מיילים לפתיחת משימות`);

  for (const thread of threads) {
    try {
      await _processTaskThread(thread);
    } catch(e) {
      Logger.log(`❌ שגיאה בפתיחת משימה: ${e.message}`);
      try { thread.markRead(); } catch(ex) {}
    }
  }
}

async function _processTaskThread(thread) {
  const msg     = thread.getMessages()[0];
  const subject = msg.getSubject();
  const body    = (msg.getPlainBody() || msg.getBody() || '').trim();

  Logger.log(`📩 מעבד מייל משימה: "${subject}"`);

  const parsed = _parseTaskSubject(subject);
  if (!parsed) {
    Logger.log(`⚠️ נושא לא תואם פורמט "משימה, עובד, קטגוריה": "${subject}" – מסומן ומדולג`);
    _markLabelAndRead(thread, TASK_LABEL);
    return;
  }

  Logger.log(`👤 עובד: ${parsed.employee} | 🏷️ קטגוריה: ${parsed.category} | 🏢 לקוח: ${parsed.client || '—'}`);

  const taskId = _createTaskInFirebase({
    assignedTo:  parsed.employee,
    category:    parsed.category,
    client:      parsed.client,
    description: body,
    status:      'open'
  });

  if (taskId) {
    _markLabelAndRead(thread, TASK_LABEL);

    // שלח אישור לשולח עם מזהה המשימה
    GmailApp.sendEmail(
      msg.getFrom(),
      `משימה נפתחה ✓ [ID: ${taskId}]`,
      `המשימה נפתחה במערכת.\n\n` +
      `מזהה משימה: ${taskId}\n` +
      `עובד: ${parsed.employee}\n` +
      `קטגוריה: ${parsed.category}\n` +
      (parsed.client ? `לקוח: ${parsed.client}\n` : '') +
      `\n──────────────────────────────────\n` +
      `לעדכון סטטוס השב למייל זה:\n` +
      `  • השב "הושלמה"  ← לסגירת המשימה\n` +
      `  • השב "מחיקה"   ← למחיקת המשימה\n` +
      `  • ריק / כל תגובה אחרת ← הושלמה`
    );

    Logger.log(`✅ משימה ${taskId} נוצרה ומייל אישור נשלח`);
  } else {
    thread.markRead();
    Logger.log(`⛔ שמירת משימה נכשלה – לא הוסף תווית (ניתן לנסות שוב)`);
  }
}

// מנתח נושא בפורמטים:
//   "משימה תמיר, חידושים"               → employee=תמיר  category=חידושים  client=''
//   "משימה תמיר, חידושים, מגמה ירוקה"  → employee=תמיר  category=חידושים  client=מגמה ירוקה
//   "משימה, תמיר, חידושים"              → employee=תמיר  category=חידושים  client=''
//   "משימה, תמיר, חידושים, מגמה ירוקה" → employee=תמיר  category=חידושים  client=מגמה ירוקה
// פורמטים נתמכים:
//   "משימה תמיר חידושים"               → עובד=תמיר  קטגוריה=חידושים  (רווח, ללא פסיק)
//   "משימה תמיר, חידושים"              → עובד=תמיר  קטגוריה=חידושים
//   "משימה תמיר, חידושים, מגמה ירוקה" → עובד=תמיר  קטגוריה=חידושים  לקוח=מגמה ירוקה
//   "משימה, תמיר, חידושים"             → עובד=תמיר  קטגוריה=חידושים
function _parseTaskSubject(subject) {
  const idx = subject.indexOf('משימה');
  if (idx === -1) return null;

  const afterKeyword = subject.substring(idx + 'משימה'.length).replace(/^[,\s]+/, '').trim();
  if (!afterKeyword) return null;

  // אם יש פסיק – פיצול לפי פסיקים (תומך גם בלקוח כשדה שלישי)
  // אם אין פסיק כלל – פיצול לפי רווח ראשון בלבד (שם עובד = מילה ראשונה, קטגוריה = שאר)
  let parts;
  if (afterKeyword.includes(',')) {
    parts = afterKeyword.split(',').map(p => p.trim()).filter(Boolean);
  } else {
    const spaceIdx = afterKeyword.indexOf(' ');
    if (spaceIdx === -1) return null;  // רק מילה אחת – אין קטגוריה
    parts = [
      afterKeyword.substring(0, spaceIdx).trim(),
      afterKeyword.substring(spaceIdx + 1).trim()
    ].filter(Boolean);
  }

  if (parts.length < 2) return null;

  return {
    employee: parts[0],
    category: parts[1],
    client:   parts[2] || ''
  };
}

// שומר משימה חדשה ב-Firebase תחת /appdata/tasks
function _createTaskInFirebase(data) {
  try {
    const tasksUrl = `${FIREBASE_URL}/appdata/tasks.json`;

    // קרא רשימת משימות קיימות
    const res = UrlFetchApp.fetch(tasksUrl, { muteHttpExceptions: true });
    let tasks = [];
    if (res.getResponseCode() === 200) {
      const parsed = JSON.parse(res.getContentText());
      tasks = Array.isArray(parsed) ? parsed : [];
    }

    const now  = new Date().toISOString();
    const task = {
      id:             _generateId(tasks),
      createdAt:      now,
      lastModifiedAt: now,
      assignedTo:     data.assignedTo  || '',
      category:       data.category    || '',
      client:         data.client      || '',
      policyNumber:   '',
      idNumber:       '',
      description:    data.description || '',
      importance:     null,
      status:         'open',
      completedAt:    null,
      deletedAt:      null,
      restoredAt:     null
    };

    tasks.push(task);

    const saveRes = UrlFetchApp.fetch(tasksUrl, {
      method:      'put',
      contentType: 'application/json',
      payload:     JSON.stringify(tasks),
      muteHttpExceptions: true
    });

    if (saveRes.getResponseCode() !== 200) {
      Logger.log(`❌ Firebase החזיר HTTP ${saveRes.getResponseCode()}: ${saveRes.getContentText()}`);
      return false;
    }

    Logger.log(`✅ משימה נשמרה – ${task.assignedTo} / ${task.category} (id: ${task.id})`);
    return task.id;   // מחזיר ID על הצלחה, null על כשל
  } catch(e) {
    Logger.log(`❌ _createTaskInFirebase: ${e.message}`);
    return null;
  }
}

// מוסיף תווית + מסמן כנקרא
function _markLabelAndRead(thread, labelName) {
  try {
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      label = GmailApp.createLabel(labelName);
      Logger.log(`תווית "${labelName}" נוצרה`);
    }
    thread.addLabel(label);
    thread.markRead();
  } catch(e) {
    Logger.log(`⚠️ לא ניתן להוסיף תווית "${labelName}": ${e.message}`);
  }
}

// מזהה משימה – 7 ספרות בלבד (1000000–9999999), ייחודי ביחס לרשימה קיימת
function _generateId(existingTasks) {
  var existing = new Set((existingTasks || []).map(function(t) { return String(t.id); }));
  var id;
  do {
    id = String(Math.floor(1000000 + Math.random() * 9000000));
  } while (existing.has(id));
  return id;
}

// ══════════════════════════════════════════════════════════════
//  PART 1b – TASK REPLY PROCESSING
//  מחפש תגובות למיילי אישור ומעדכן סטטוס ב-Firebase
// ══════════════════════════════════════════════════════════════

function checkTaskReplies() {
  // חיפוש לפי הנושא הקבוע של מיילי אישור (ללא סוגריים מרובעים שעלולים לשבש חיפוש Gmail)
  var threads = GmailApp.search(
    'subject:"משימה נפתחה" is:unread -from:me -label:' + REPLY_LABEL,
    0, 20
  );
  Logger.log('📬 תגובות למשימות שנמצאו: ' + threads.length);

  for (var i = 0; i < threads.length; i++) {
    try {
      _processTaskReply(threads[i]);
    } catch(e) {
      Logger.log('❌ שגיאה בעיבוד תגובה: ' + e.message);
      try { threads[i].markRead(); } catch(ex) {}
    }
  }
}

function _processTaskReply(thread) {
  var msgs = thread.getMessages();

  // מצא את ההודעה הלא-נקראת האחרונה
  var replyMsg = null;
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].isUnread()) { replyMsg = msgs[i]; break; }
  }
  if (!replyMsg) { _markLabelAndRead(thread, REPLY_LABEL); return; }

  // חלץ taskId מהנושא: [ID: 1234567]
  var subject = replyMsg.getSubject();
  var idMatch = subject.match(/\[ID:\s*(\d+)\]/i);
  if (!idMatch) {
    Logger.log('⚠️ לא נמצא ID בנושא: ' + subject);
    _markLabelAndRead(thread, REPLY_LABEL);
    return;
  }
  var taskId = idMatch[1].trim();

  // קרא שורה ראשונה שאינה ציטוט
  var body = (replyMsg.getPlainBody() || '').trim();
  var firstLine = '';
  var lines = body.split('\n');
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j].trim();
    if (line && !line.startsWith('>')) { firstLine = line; break; }
  }

  // קבע פעולה
  var deleteWords = ['מחיקה', 'נמחקה', 'למחוק'];
  var action = deleteWords.some(function(w) { return firstLine.includes(w); }) ? 'delete' : 'complete';

  Logger.log('📋 מעדכן משימה ' + taskId + ' → ' + action + ' (תגובה: "' + firstLine + '")');

  _updateTaskById(taskId, action);
  _markLabelAndRead(thread, REPLY_LABEL);
}

function _updateTaskById(taskId, action) {
  try {
    var tasksUrl = FIREBASE_URL + '/appdata/tasks.json';
    var res = UrlFetchApp.fetch(tasksUrl, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      Logger.log('❌ Firebase לא נגיש: ' + res.getResponseCode());
      return false;
    }

    var tasks = JSON.parse(res.getContentText());
    if (!Array.isArray(tasks)) {
      Logger.log('❌ רשימת משימות לא תקינה');
      return false;
    }

    var idx = -1;
    for (var i = 0; i < tasks.length; i++) {
      if (String(tasks[i].id) === String(taskId)) { idx = i; break; }
    }
    if (idx === -1) {
      Logger.log('⚠️ משימה ' + taskId + ' לא נמצאה ב-Firebase');
      return false;
    }

    var now = new Date().toISOString();
    if (action === 'delete') {
      tasks[idx].status    = 'deleted';
      tasks[idx].deletedAt = now;
    } else {
      tasks[idx].status      = 'completed';
      tasks[idx].completedAt = now;
    }
    tasks[idx].lastModifiedAt = now;

    var saveRes = UrlFetchApp.fetch(tasksUrl, {
      method:      'put',
      contentType: 'application/json',
      payload:     JSON.stringify(tasks),
      muteHttpExceptions: true
    });

    if (saveRes.getResponseCode() !== 200) {
      Logger.log('❌ שמירה ב-Firebase נכשלה: HTTP ' + saveRes.getResponseCode());
      return false;
    }

    Logger.log('✅ משימה ' + taskId + ' עודכנה בהצלחה → ' + action);
    return true;
  } catch(e) {
    Logger.log('❌ _updateTaskById: ' + e.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  PART 2 – PDF EMAIL PROCESSING
// ══════════════════════════════════════════════════════════════

async function processPdfEmails() {
  const settings = _loadPdfSettings();
  if (!settings) { Logger.log('⚠️ הגדרות PDF לא נמצאו ב-Firebase'); return; }

  const trigger = (settings.triggerWord || 'סריקה').trim();
  if (!trigger) { Logger.log('⚠️ מילת טריגר ריקה'); return; }

  const query   = `subject:${trigger} is:unread -from:me -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 10);
  Logger.log(`📎 נמצאו ${threads.length} מיילים לעיבוד PDF`);

  for (const thread of threads) {
    try {
      await _processPdfThread(thread, settings);
    } catch(e) {
      Logger.log(`❌ שגיאה בעיבוד PDF: ${e.message}`);
      try { thread.markRead(); } catch(ex) {}
    }
  }
}

function _loadPdfSettings() {
  try {
    const url = `${FIREBASE_URL}/appdata/pdf_merge_settings.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const data = JSON.parse(res.getContentText());
    return data && data !== 'null' ? data : null;
  } catch(e) {
    Logger.log(`שגיאה בטעינת הגדרות PDF: ${e.message}`);
    return null;
  }
}

async function _processPdfThread(thread, settings) {
  const msg  = thread.getMessages()[0];
  const subj = msg.getSubject();
  Logger.log(`מעבד PDF: "${subj}"`);

  const pdfAttachments = msg.getAttachments().filter(att =>
    att.getContentType() === 'application/pdf' ||
    att.getName().toLowerCase().endsWith('.pdf')
  );

  if (pdfAttachments.length === 0) {
    Logger.log(`אין PDF ב-"${subj}" – מסומן ומדולג`);
    _markLabelAndRead(thread, PROCESSED_LABEL);
    return;
  }

  Logger.log(`נמצאו ${pdfAttachments.length} קבצי PDF`);

  const overrideEmail = _extractSendTo(msg.getPlainBody() || msg.getBody() || '');
  if (overrideEmail) Logger.log(`📧 נמען override: ${overrideEmail}`);

  const sorted = _sortByFilename(pdfAttachments);

  let finalBlob;
  if (sorted.length === 1) {
    finalBlob = sorted[0].copyBlob().setName('document.pdf');
    Logger.log('קובץ יחיד – שולח ישירות');
  } else {
    Logger.log('מאחד קבצים (pdf-lib)…');
    finalBlob = await _mergePdfsDirectly(sorted);
    if (!finalBlob) {
      Logger.log('⚠️ איחוד נכשל – שולח קבצים בנפרד');
      const fbSent = _sendEmail(settings, subj, sorted.map(a => a.copyBlob()), overrideEmail);
      if (fbSent) { _markLabelAndRead(thread, PROCESSED_LABEL); Logger.log(`✅ קבצים נשלחו בנפרד: "${subj}"`); }
      else        { thread.markRead(); Logger.log(`⛔ לא נשלח (אין נמענים): "${subj}"`); }
      return;
    }
  }

  const sent = _sendEmail(settings, subj, [finalBlob], overrideEmail);
  if (sent) {
    _markLabelAndRead(thread, PROCESSED_LABEL);
    Logger.log(`✅ מייל PDF נשלח ומסומן: "${subj}"`);
  } else {
    thread.markRead();
    Logger.log(`⛔ לא נשלח (אין נמענים): "${subj}"`);
  }
}

function _extractSendTo(body) {
  const match = body.match(/send\s+to\s*:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  return match ? match[1].trim().toLowerCase() : null;
}

function _sortByFilename(attachments) {
  function extractTs(name) {
    const m = name.match(/(\d{8})[_\-]?(\d{6})?/);
    if (m) return parseInt((m[1] + (m[2] || '000000')), 10);
    return 0;
  }
  return attachments
    .map(a => ({ att: a, ts: extractTs(a.getName()) }))
    .sort((a, b) => a.ts - b.ts)
    .map(x => x.att);
}

async function _mergePdfsDirectly(pdfAttachments) {
  try {
    if (typeof setTimeout  === 'undefined') globalThis.setTimeout  = (fn) => { fn(); };
    if (typeof clearTimeout === 'undefined') globalThis.clearTimeout = () => {};
    if (typeof TextEncoder === 'undefined') {
      globalThis.TextEncoder = class {
        encode(str) {
          const bytes = [];
          for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 0x80)   bytes.push(code);
            else if (code < 0x800) { bytes.push(0xC0|(code>>6), 0x80|(code&0x3F)); }
            else { bytes.push(0xE0|(code>>12), 0x80|((code>>6)&0x3F), 0x80|(code&0x3F)); }
          }
          return new Uint8Array(bytes);
        }
      };
    }
    if (typeof TextDecoder === 'undefined') {
      globalThis.TextDecoder = class { decode(bytes) { return String.fromCharCode(...bytes); } };
    }

    Logger.log('טוען pdf-lib…');
    const libRes = UrlFetchApp.fetch(
      'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
      { muteHttpExceptions: true }
    );
    if (libRes.getResponseCode() !== 200) throw new Error('לא ניתן לטעון pdf-lib');
    eval(libRes.getContentText());
    Logger.log('pdf-lib נטען');

    const mergedDoc = await PDFLib.PDFDocument.create();
    for (let i = 0; i < pdfAttachments.length; i++) {
      const uint8  = new Uint8Array(pdfAttachments[i].copyBlob().getBytes());
      const srcDoc = await PDFLib.PDFDocument.load(uint8, { ignoreEncryption: true });
      const copied = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
      copied.forEach(page => mergedDoc.addPage(page));
      Logger.log(`✅ קובץ ${i + 1}: ${srcDoc.getPageCount()} עמודים`);
    }

    const mergedBytes = await mergedDoc.save({ useObjectStreams: false });
    Logger.log(`✅ PDF מאוחד: ${mergedBytes.length} bytes`);
    return Utilities.newBlob(Array.from(mergedBytes), 'application/pdf', 'merged_scan.pdf');
  } catch(e) {
    Logger.log(`שגיאה באיחוד PDF: ${e.message}`);
    return null;
  }
}

function _sendEmail(settings, originalSubject, blobs, overrideEmail) {
  const prefix  = (settings.subjectPrefix || '[קובץ סרוק]').trim();
  const ccList  = (settings.recipientsCC  || '').split(',').map(s => s.trim()).filter(Boolean);
  const bccList = (settings.recipientsBCC || '').split(',').map(s => s.trim()).filter(Boolean);

  const toList = overrideEmail
    ? [overrideEmail]
    : (settings.recipientsTo || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!toList.length) {
    Logger.log('⚠️ אין נמענים – בדוק הגדרות PDF ושמור ל-Firebase');
    return false;
  }

  GmailApp.sendEmail(toList.join(','), `${prefix} ${originalSubject}`.trim(), '', {
    cc:          ccList.length  ? ccList.join(',')  : undefined,
    bcc:         bccList.length ? bccList.join(',') : undefined,
    attachments: blobs,
    noReply:     true
  });

  Logger.log(`📧 נשלח אל: ${toList.join(', ')}`);
  return true;
}
