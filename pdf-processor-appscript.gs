// ===================== PDF PROCESSOR – APPS SCRIPT =====================
// מעבד מיילים נכנסים, מאחד PDF ושולח לנמענים
//
// הגדרת שירות:
//   1. פתח את הסקריפט ב-script.google.com
//   2. Extensions → Advanced Services → הפעל "Drive API" (v2) ו-"Slides API"
//   3. הרץ את createPdfTrigger() פעם אחת בלבד להגדרת טריגר אוטומטי
// =====================================================================

const PDF_FIREBASE_URL = 'https://task-manager-ac919-default-rtdb.europe-west1.firebasedatabase.app';

// ── Trigger Setup (הרץ פעם אחת בלבד) ──────────────────
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

// שם התווית שמסמנת מייל שכבר עובד – מונע עיבוד כפול
const PROCESSED_LABEL = 'PDF-עובד';

// ── Main Function (נקרא ע"י הטריגר) ─────────────────────
function processPdfEmails() {
  const settings = _loadPdfSettings();
  if (!settings) { Logger.log('⚠️ הגדרות PDF לא נמצאו ב-Firebase'); return; }

  const trigger = (settings.triggerWord || 'סריקה').trim();
  if (!trigger) { Logger.log('⚠️ מילת טריגר ריקה'); return; }

  // חיפוש: נושא מכיל טריגר + לא נקרא + עדיין לא עובד (אין תווית PDF-עובד)
  const query = `subject:${trigger} is:unread -from:me -label:${PROCESSED_LABEL}`;
  const threads = GmailApp.search(query, 0, 10);
  Logger.log(`נמצאו ${threads.length} מיילים חדשים לעיבוד`);

  threads.forEach(thread => {
    try {
      _processThread(thread, settings);
    } catch(e) {
      Logger.log(`❌ שגיאה בעיבוד מייל: ${e.message}`);
      // גם במקרה של שגיאה – סמן כמעובד כדי למנוע לולאה אינסופית
      _markProcessed(thread);
    }
  });
}

// ── Load Settings from Firebase ─────────────────────────
function _loadPdfSettings() {
  try {
    const url = `${PDF_FIREBASE_URL}/appdata/pdf_merge_settings.json`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const data = JSON.parse(res.getContentText());
    return data && data !== 'null' ? data : null;
  } catch(e) {
    Logger.log(`שגיאה בטעינת הגדרות: ${e.message}`);
    return null;
  }
}

// ── Process Single Thread ────────────────────────────────
function _processThread(thread, settings) {
  const msg  = thread.getMessages()[0];
  const subj = msg.getSubject();
  Logger.log(`מעבד: "${subj}"`);

  // סנן רק קבצי PDF
  const pdfAttachments = msg.getAttachments().filter(att =>
    att.getContentType() === 'application/pdf' ||
    att.getName().toLowerCase().endsWith('.pdf')
  );

  if (pdfAttachments.length === 0) {
    Logger.log(`אין PDF במייל "${subj}" – מסומן כמעובד ומדולג`);
    _markProcessed(thread);
    return;
  }

  Logger.log(`נמצאו ${pdfAttachments.length} קבצי PDF`);

  // בדוק האם גוף המייל מכיל "send to: <email>" – עוקף נמענים ברירת מחדל
  const overrideEmail = _extractSendTo(msg.getPlainBody() || msg.getBody() || '');
  if (overrideEmail) {
    Logger.log(`📧 נמען ייעודי זוהה בגוף המייל: ${overrideEmail}`);
  }

  // מיין לפי זמן מוטמע בשם הקובץ, אחרת לפי סדר במייל
  const sorted = _sortByFilename(pdfAttachments);

  let finalBlob;
  if (sorted.length === 1) {
    finalBlob = sorted[0].copyBlob().setName('document.pdf');
    Logger.log('קובץ יחיד – שולח ישירות');
  } else {
    Logger.log('מאחד קבצים דרך Google Slides…');
    finalBlob = _mergePdfsViaSlides(sorted);
    if (!finalBlob) {
      // fallback – שלח קבצים בנפרד
      Logger.log('⚠️ איחוד נכשל – שולח קבצים בנפרד');
      _sendEmail(settings, subj, sorted.map(a => a.copyBlob()), overrideEmail);
      _markProcessed(thread);
      return;
    }
  }

  _sendEmail(settings, subj, [finalBlob], overrideEmail);
  _markProcessed(thread);
  Logger.log(`✅ מייל נשלח ומסומן כמעובד: "${subj}"`);
}

// ── Mark Thread as Processed (מניעת עיבוד כפול) ─────────
// מוסיף תווית "PDF-עובד" + מסמן כנקרא
// גם אם המייל יסומן ידנית כ"לא נקרא" בעתיד – התווית תמנע עיבוד חוזר
function _markProcessed(thread) {
  try {
    let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
    if (!label) {
      label = GmailApp.createLabel(PROCESSED_LABEL);
      Logger.log(`תווית "${PROCESSED_LABEL}" נוצרה`);
    }
    thread.addLabel(label);
    thread.markRead();
  } catch(e) {
    Logger.log(`⚠️ לא ניתן לסמן כמעובד: ${e.message}`);
  }
}

// ── Extract Override Recipient from Email Body ───────────
// מחפש שורה בפורמט:  send to: someone@example.com
// (לא תלוי רישיות, מקבל רווחים גמישים לפני/אחרי הנקודתיים)
function _extractSendTo(body) {
  const match = body.match(/send\s+to\s*:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  return match ? match[1].trim().toLowerCase() : null;
}

// ── Sort Attachments by Embedded Timestamp in Filename ──
function _sortByFilename(attachments) {
  // מנסה לחלץ תאריך/שעה משם קובץ (פורמטים נפוצים של סורקים ומצלמות)
  // לדוגמה: scan_20260404_143022.pdf  |  IMG_20260404-143022.pdf
  function extractTs(name) {
    const m = name.match(/(\d{8})[_\-]?(\d{6})?/);
    if (m) return parseInt((m[1] + (m[2] || '000000')), 10);
    return 0;
  }
  const withTs = attachments.map(a => ({ att: a, ts: extractTs(a.getName()) }));
  withTs.sort((a, b) => a.ts - b.ts);
  return withTs.map(x => x.att);
}

// ── Merge PDFs via Google Slides (no external API needed) ──
function _mergePdfsViaSlides(pdfAttachments) {
  const tempIds = [];
  try {
    // שלב 1 – העלה כל PDF כ-Google Slides
    const presIds = pdfAttachments.map((att, i) => {
      const blob = att.copyBlob().setContentType('application/pdf');
      const file = Drive.Files.insert(
        { title: `_pdfmerge_tmp_${Date.now()}_${i}`,
          mimeType: 'application/vnd.google-apps.presentation' },
        blob,
        { convert: true }
      );
      tempIds.push(file.id);
      Utilities.sleep(1500); // המתן להמרה
      return file.id;
    });

    if (presIds.length === 0) return null;

    // אם יש רק מצגת אחת – ייצא ישירות
    if (presIds.length === 1) {
      const single = DriveApp.getFileById(presIds[0]).getAs('application/pdf');
      single.setName('merged.pdf');
      return single;
    }

    const targetId = presIds[0];

    // שלב 2 – העתק שקפים ממצגות 2..N למצגת הראשונה
    for (let i = 1; i < presIds.length; i++) {
      const sourcePres = Slides.Presentations.get(presIds[i]);
      if (!sourcePres.slides || sourcePres.slides.length === 0) continue;

      const currentTarget = Slides.Presentations.get(targetId);
      const insertAt = (currentTarget.slides || []).length;
      const slideIds = sourcePres.slides.map(s => s.objectId);

      Slides.Presentations.batchUpdate({
        requests: [{
          insertSlides: {
            insertionIndex:     insertAt,
            sourcePresentationId: presIds[i],
            sourceRevisionId:   sourcePres.revisionId,
            slideObjectIds:     slideIds
          }
        }]
      }, targetId);

      Utilities.sleep(800);
    }

    // שלב 3 – ייצא כ-PDF
    Utilities.sleep(1500);
    const mergedBlob = DriveApp.getFileById(targetId).getAs('application/pdf');
    mergedBlob.setName('merged_scan.pdf');
    return mergedBlob;

  } catch(e) {
    Logger.log(`שגיאה באיחוד PDF: ${e.message}`);
    return null;
  } finally {
    // ניקוי קבצים זמניים
    tempIds.forEach(id => {
      try { Drive.Files.remove(id); } catch(ex) {}
    });
  }
}

// ── Send Email ───────────────────────────────────────────
// overrideEmail (אופציונלי) – אם סופק, מחליף את רשימת ה-To של ברירת המחדל
// ה-CC וה-BCC מההגדרות נשמרים גם במקרה של override
function _sendEmail(settings, originalSubject, blobs, overrideEmail) {
  const prefix  = (settings.subjectPrefix || '[קובץ סרוק]').trim();
  const ccList  = (settings.recipientsCC  || '').split(',').map(s => s.trim()).filter(Boolean);
  const bccList = (settings.recipientsBCC || '').split(',').map(s => s.trim()).filter(Boolean);

  // קבע נמענים: override מהגוף גובר על ברירת המחדל מההגדרות
  let toList;
  if (overrideEmail) {
    toList = [overrideEmail];
    Logger.log(`📤 שולח ל-override: ${overrideEmail} (ברירת המחדל בוטלה)`);
  } else {
    toList = (settings.recipientsTo || '').split(',').map(s => s.trim()).filter(Boolean);
  }

  if (!toList.length) {
    Logger.log('⚠️ אין נמענים מוגדרים – מייל לא נשלח');
    return;
  }

  const outSubject = `${prefix} ${originalSubject}`.trim();

  GmailApp.sendEmail(
    toList.join(','),
    outSubject,
    '',                   // גוף ריק – לפי הדרישה
    {
      cc:          ccList.join(',')  || undefined,
      bcc:         bccList.join(',') || undefined,
      attachments: blobs,
      noReply:     true
    }
  );
}
