// ===================== INSTRUCTIONS PAGE =====================

function renderInstructions() {
  const content = document.getElementById('content');
  content.innerHTML = `
<div class="screen-wrap" style="max-width:780px;margin:0 auto">

  <h2 style="margin-bottom:24px">📖 הוראות שימוש</h2>

  <!-- ══════════════ 1. פתיחת משימה במייל ══════════════ -->
  <div class="settings-card" style="margin-bottom:20px">
    <h3 style="margin:0 0 16px">📬 פתיחת משימה באמצעות מייל</h3>
    <p style="color:#4b5563;margin-bottom:16px">
      ניתן לפתוח משימה חדשה במערכת על ידי שליחת מייל לכתובת המייל המקושרת ל-Apps Script.
      הסקריפט סורק תיבת הדואר כל מספר דקות ויוצר משימות אוטומטית.
    </p>

    <div class="pdf-override-note" style="margin-bottom:20px">
      <strong>📋 פורמט נושא המייל (Subject):</strong><br>
      <code style="font-size:1.05em;display:block;margin:8px 0;direction:ltr;text-align:left">
        משימה, שם-עובד, קטגוריה
      </code>
      <strong>גוף המייל</strong> = תיאור המשימה (חופשי)
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:0.93em">
      <thead>
        <tr style="background:#eff6ff;color:#1e40af">
          <th style="padding:8px 12px;border:1px solid #bfdbfe;text-align:right">שדה</th>
          <th style="padding:8px 12px;border:1px solid #bfdbfe;text-align:right">פירוט</th>
          <th style="padding:8px 12px;border:1px solid #bfdbfe;text-align:right">דוגמה</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">מילת פתיחה</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">חייבת להיות <strong>משימה</strong> (ניתן להגדרה)</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;direction:ltr;text-align:left">משימה</td>
        </tr>
        <tr style="background:#f9fafb">
          <td style="padding:8px 12px;border:1px solid #e5e7eb">שם עובד</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">שם מתוך רשימת העובדים במערכת (מופרד בפסיק)</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">ישראל ישראלי</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">קטגוריה</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">שם קטגוריה מתוך ההגדרות (מופרד בפסיק)</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">ביטוח חיים</td>
        </tr>
        <tr style="background:#f9fafb">
          <td style="padding:8px 12px;border:1px solid #e5e7eb">גוף המייל</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">תיאור המשימה המלא</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb">לקוח ביקש חידוש פוליסה...</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:14px;padding:12px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
      <strong>דוגמה מלאה:</strong><br>
      <span style="color:#6b7280;font-size:0.9em">נושא:</span>
      <code style="display:block;margin:4px 0;direction:ltr;text-align:left">משימה, דוד כהן, ביטוח רכב</code>
      <span style="color:#6b7280;font-size:0.9em">גוף:</span>
      <code style="display:block;margin:4px 0;direction:ltr;text-align:left">הלקוח ביקש עדכון פרטי רכב – מספר רישוי 12-345-67</code>
    </div>
  </div>

  <!-- ══════════════ 2. החלפת כתובת מייל ══════════════ -->
  <div class="settings-card" style="margin-bottom:20px">
    <h3 style="margin:0 0 16px">🔄 כיצד להחליף את כתובת המייל של המערכת</h3>
    <p style="color:#4b5563;margin-bottom:14px">
      המערכת פועלת עם <strong>שני סוגי מיילים</strong> – ניהולם שונה:
    </p>

    <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:16px">
      <div style="background:#eff6ff;padding:10px 16px;font-weight:600;color:#1e40af;border-bottom:1px solid #bfdbfe">
        1️⃣ מייל קליטת המשימות (Gmail שקושר ל-Apps Script)
      </div>
      <div style="padding:14px 16px;font-size:0.93em;line-height:1.8">
        <p style="margin:0 0 10px">זהו חשבון Gmail שבו הסקריפט רץ ומאזין לנכנסים.</p>
        <strong>להחלפה:</strong>
        <ol style="margin:8px 0 0;padding-right:20px">
          <li>פתח את Apps Script (<a href="https://script.google.com" target="_blank" style="color:#2563eb">script.google.com</a>)</li>
          <li>לחץ על תמונת הפרופיל (פינה ימנית עליונה) → <strong>החלף חשבון</strong></li>
          <li>היכנס עם חשבון Gmail החדש</li>
          <li>העתק את קוד הסקריפט מהפרויקט הישן לפרויקט חדש בחשבון החדש</li>
          <li>הרץ שוב <code>createPdfTrigger()</code> ו-<code>createTaskTrigger()</code> (אם קיים)</li>
          <li>פרסם מחדש כ-Web App וקבל URL חדש</li>
          <li>עדכן את ה-URL במסך <strong>מאחד PDF ← הגדרות</strong> (שדה Web App URL)</li>
        </ol>
      </div>
    </div>

    <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <div style="background:#fef3c7;padding:10px 16px;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a">
        2️⃣ מייל יוצא לדוחות (EmailJS)
      </div>
      <div style="padding:14px 16px;font-size:0.93em;line-height:1.8">
        <p style="margin:0 0 10px">דוחות אוטומטיים נשלחים דרך שירות EmailJS.</p>
        <strong>להחלפה:</strong>
        <ol style="margin:8px 0 0;padding-right:20px">
          <li>היכנס ל-<a href="https://www.emailjs.com" target="_blank" style="color:#2563eb">emailjs.com</a> → Account → Email Services</li>
          <li>צור Service חדש עם חשבון Gmail החדש (או ערוך קיים)</li>
          <li>עדכן את ה-Service ID בהגדרות המערכת: <strong>⚙️ הגדרות ← דוחות</strong></li>
        </ol>
      </div>
    </div>
  </div>

  <!-- ══════════════ 3. מאחד PDF ══════════════ -->
  <div class="settings-card" style="margin-bottom:20px">
    <h3 style="margin:0 0 16px">📄 מאחד PDF אוטומטי</h3>
    <p style="color:#4b5563;margin-bottom:14px">
      המערכת מזהה מיילים עם קבצי PDF מצורפים, מאחדת אותם ושולחת למוגדרים.
    </p>

    <div class="pdf-override-note" style="margin-bottom:16px">
      <strong>תנאים לעיבוד מייל:</strong>
      <ul style="margin:8px 0 0;padding-right:20px;line-height:1.9">
        <li>נושא המייל מכיל את <strong>מילת הטריגר</strong> (ברירת מחדל: <code>סריקה</code>)</li>
        <li>המייל מכיל לפחות קובץ PDF אחד מצורף</li>
        <li>המייל טרם עובד (אין תווית <code>PDF-עובד</code>)</li>
        <li>המייל אינו ממני (לא נשלח מהחשבון עצמו)</li>
      </ul>
    </div>

    <div style="padding:12px 14px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:12px">
      <strong>שליחה לנמען שונה (Override):</strong><br>
      <span style="font-size:0.9em;color:#374151">
        כדי לשלוח את הקובץ המאוחד לכתובת שונה מברירת המחדל, הוסף שורה זו בגוף המייל:
      </span>
      <code style="display:block;margin:6px 0;direction:ltr;text-align:left">send to: someone@example.com</code>
      <span style="font-size:0.85em;color:#6b7280">לא תלוי רישיות – Send To, SEND TO וכו' – כולם מקובלים</span>
    </div>

    <div style="padding:12px 14px;background:#fefce8;border-radius:8px;border:1px solid #fef08a">
      <strong>סדר הקבצים המאוחדים:</strong><br>
      <span style="font-size:0.9em;color:#374151">
        הקבצים ממוינים לפי חותמת הזמן המוטמעת בשם הקובץ
        (פורמט סורקים נפוץ: <code>scan_20260404_143022.pdf</code>).
        אם אין חותמת – נשמר סדר הצירוף במייל.
      </span>
    </div>
  </div>

  <!-- ══════════════ 4. Apps Script – הגדרה ראשונית ══════════════ -->
  <div class="settings-card">
    <h3 style="margin:0 0 16px">⚙️ הגדרה ראשונית של Apps Script</h3>
    <ol style="padding-right:20px;line-height:2;color:#374151;font-size:0.93em">
      <li>פתח <a href="https://script.google.com" target="_blank" style="color:#2563eb">script.google.com</a> → פרויקט חדש</li>
      <li>הדבק את קוד הסקריפט מהקובץ <code>pdf-processor-appscript.gs</code></li>
      <li>עדכן את <code>appsscript.json</code> עם הסקופים הנדרשים (כפי שמופיע בתחילת הקובץ)</li>
      <li>הרץ <code>createPdfTrigger()</code> פעם אחת בלבד → מגדיר טריגר כל 5 דקות</li>
      <li>פרסם: <strong>Deploy → New deployment → Web App</strong><br>
          Execute as: <em>Me</em> | Who has access: <em>Anyone</em></li>
      <li>העתק את ה-URL שהתקבל</li>
      <li>עבור למסך <strong>📄 מאחד PDF ← הגדרות אוטומציה</strong> והגדר:
        <ul style="margin-top:4px">
          <li>נמענים, מילת טריגר, קידומת נושא</li>
          <li>לחץ <strong>שמור ועדכן Firebase</strong> (חובה לפני הפעלה ראשונה)</li>
        </ul>
      </li>
    </ol>
  </div>

</div>`;
}
