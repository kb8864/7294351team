// ▼GoogleカレンダーIDを設定▼
const CALENDAR_ID = 'rensyubu7294351@gmail.com';

function doGet(e) {
  // パラメータ type を受け取る
  if (e.parameter.month) {
    return createIcsFile(parseInt(e.parameter.month), e.parameter.type);
  }

  const template = HtmlService.createTemplateFromFile('index');
  template.deployUrl = ScriptApp.getService().getUrl(); 
  
  return template.evaluate()
    .setTitle('練習スケジュール')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ■画面表示用データ取得（API版）
function getCalendarEvents() {
  const events = fetchEventsFromApi(); 
  
  const eventList = events.map(event => {
    const startObj = event.start;
    const endObj = event.end;
    if (!startObj) return null;

    const startStrVal = startObj.dateTime || startObj.date;
    const endStrVal = endObj.dateTime || endObj.date;
    const isAllDay = !startObj.dateTime;

    const start = new Date(startStrVal);
    const end = new Date(endStrVal);
    
    const startFmt = Utilities.formatDate(start, 'Asia/Tokyo', 'HH:mm');
    const endFmt = Utilities.formatDate(end, 'Asia/Tokyo', 'HH:mm');
    
    let timeStr = isAllDay ? '終日' : `${startFmt}-${endFmt}`; 
    
    // 更新ロジック削除済み（タイトルそのまま）
    let title = event.summary || "予定";

    return {
      id: event.id,
      title: title,
      description: event.description || "",
      location: event.location || "",
      startTime: start.getTime(),
      month: parseInt(Utilities.formatDate(start, 'Asia/Tokyo', 'M')),
      day: parseInt(Utilities.formatDate(start, 'Asia/Tokyo', 'd')),
      time: timeStr,
      colorId: event.colorId 
    };
  }).filter(e => e !== null); 

  return { events: eventList };
}

// ■ICSファイル作成用（API版）
// ★元の「ファイルを生成してダウンロードさせる」方式に戻しました
function createIcsFile(targetMonth, type) {
  const allEvents = fetchEventsFromApi();
  let events = [];
  let fileName = "";

  // ★3つのパターンで分岐
  if (type === 'practice') {
    // 【緑：練習日登録】バナナ(5) のみ
    events = allEvents.filter(item => {
      if (item.colorId !== '5') return false; 
      const startObj = item.start;
      if (!startObj) return false;
      const dateStr = startObj.dateTime || startObj.date;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      const m = parseInt(Utilities.formatDate(date, 'Asia/Tokyo', 'M'));
      return m === targetMonth;
    });
    fileName = `schedule_practice_${targetMonth}.ics`;

  } else if (type === 'festival_yearly') {
    // 【青：1年間の祭り登録】2〜12月の ミカン(6) のみ
    events = allEvents.filter(item => {
      if (item.colorId !== '6') return false; 
      const startObj = item.start;
      if (!startObj) return false;
      const dateStr = startObj.dateTime || startObj.date;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      const m = parseInt(Utilities.formatDate(date, 'Asia/Tokyo', 'M'));
      return m >= 2 && m <= 12; 
    });
    fileName = "schedule_festival_yearly.ics";

  } else if (type === 'festival_monthly') {
    // 【オレンジ：月の祭り登録】指定月の ミカン(6) のみ
    events = allEvents.filter(item => {
      if (item.colorId !== '6') return false; 
      const startObj = item.start;
      if (!startObj) return false;
      const dateStr = startObj.dateTime || startObj.date;
      if (!dateStr) return false;
      const date = new Date(dateStr);
      const m = parseInt(Utilities.formatDate(date, 'Asia/Tokyo', 'M'));
      return m === targetMonth;
    });
    fileName = `schedule_festival_${targetMonth}.ics`;
  }

  let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MyScheduleBot//JP\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n";
  
  const escapeText = (text) => {
    if (!text) return "";
    return text.replace(/\\/g, "\\\\")
               .replace(/;/g, "\\;")
               .replace(/,/g, "\\,")
               .replace(/\n/g, "\\n");
  };

  const formatIcsDate = (dateStr, isDateOnly) => {
    const d = new Date(dateStr);
    if (isDateOnly) {
      return Utilities.formatDate(d, 'Asia/Tokyo', "yyyyMMdd");
    } else {
      return Utilities.formatDate(d, 'Asia/Tokyo', "yyyyMMdd'T'HHmm'00'");
    }
  };

  events.forEach(e => {
    const isAllDay = !!e.start.date;
    const startVal = e.start.dateTime || e.start.date;
    const endVal = e.end.dateTime || e.end.date;
    const nowStamp = Utilities.formatDate(new Date(), 'GMT', "yyyyMMdd'T'HHmmss'Z'");
    const lastModDate = new Date(e.updated);
    const lastModStr = Utilities.formatDate(lastModDate, 'GMT', "yyyyMMdd'T'HHmmss'Z'");

    let summary = e.summary || "予定";
    
    icsContent += "BEGIN:VEVENT\n";
    icsContent += "UID:" + e.id + "@rensyu-bot\n"; 
    icsContent += "DTSTAMP:" + nowStamp + "\n";
    
    if (typeof e.sequence !== 'undefined') {
      icsContent += "SEQUENCE:" + e.sequence + "\n";
    }
    icsContent += "LAST-MODIFIED:" + lastModStr + "\n";
    
    icsContent += "SUMMARY:" + escapeText(summary) + "\n";
    
    if (isAllDay) {
      icsContent += "DTSTART;VALUE=DATE:" + formatIcsDate(startVal, true) + "\n";
      icsContent += "DTEND;VALUE=DATE:" + formatIcsDate(endVal, true) + "\n";
    } else {
      icsContent += "DTSTART:" + formatIcsDate(startVal, false) + "\n";
      icsContent += "DTEND:" + formatIcsDate(endVal, false) + "\n";
    }

    if (e.location) icsContent += "LOCATION:" + escapeText(e.location) + "\n";
    if (e.description) icsContent += "DESCRIPTION:" + escapeText(e.description) + "\n";
    icsContent += "END:VEVENT\n";
  });

  icsContent += "END:VCALENDAR";

  // ：ファイルとしてダウンロードさせる
  return ContentService.createTextOutput(icsContent)
    .setMimeType(ContentService.MimeType.ICAL)
    .downloadAsFile(fileName);
}

// ■共通データ取得関数
function fetchEventsFromApi() {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), 0, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();

  let items = [];
  try {
    const response = Calendar.Events.list(CALENDAR_ID, {
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true, 
      orderBy: 'startTime',
      showDeleted: false 
    });
    items = response.items;
  } catch (e) {
    throw new Error("左側の「サービス」から「Google Calendar API」を追加してください。");
  }

  return items.filter(item => {
    if (!item || !item.start) return false;
    if (item.status !== 'confirmed' && item.status !== 'tentative') return false;
    if (item.visibility === 'private') return false;
    if (item.colorId !== '5' && item.colorId !== '6') return false;
    
    return true;
  });
}