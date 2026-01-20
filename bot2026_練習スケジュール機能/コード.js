// ▼GoogleカレンダーIDを設定▼
const CALENDAR_ID = 'rensyubu7294351@gmail.com';

function doGet(e) {
  // パラメータに type (normal か festival) を追加
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
    
    // 更新マーク判定
    let title = event.summary || "予定";
    if (event.updated && event.created) {
      const updatedDate = new Date(event.updated);
      const createdDate = new Date(event.created);
      const diffHours = (new Date() - updatedDate) / (1000 * 60 * 60);
      const timeSinceCreation = (updatedDate - createdDate) / (1000 * 60);

      if (diffHours < 170 && timeSinceCreation > 5) {
        if (!title.startsWith("【更新済み】")) {
          title = "【更新済み】" + title;
        }
      }
    }

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
function createIcsFile(targetMonth, type) {
  const allEvents = fetchEventsFromApi();
  let events = [];
  let fileName = "";

  // ★分岐：祭りモードなら「2月〜12月」を全取得、通常なら「指定月」のみ
  if (type === 'festival') {
    // 【祭りモード】
    // 1. ミカン色(6)のみ抽出
    // 2. 2月〜12月の範囲のみ抽出
    events = allEvents.filter(item => {
      if (item.colorId !== '6') return false;
      
      const startObj = item.start;
      if (!startObj) return false;
      const dateStr = startObj.dateTime || startObj.date;
      if (!dateStr) return false;
      
      const date = new Date(dateStr);
      const m = parseInt(Utilities.formatDate(date, 'Asia/Tokyo', 'M'));
      
      return m >= 2 && m <= 12; // 2月から12月まで
    });
    
    fileName = "schedule_festival_yearly.ics"; // ファイル名も変更
    
  } else {
    // 【通常モード】
    // 1. 指定された月のみ抽出
    // 2. バナナ(5) または ミカン(6) を許可
    events = allEvents.filter(item => {
      // 色チェック
      if (item.colorId !== '5' && item.colorId !== '6') return false;

      const startObj = item.start;
      if (!startObj) return false;
      const dateStr = startObj.dateTime || startObj.date;
      if (!dateStr) return false;

      const date = new Date(dateStr);
      const m = parseInt(Utilities.formatDate(date, 'Asia/Tokyo', 'M'));
      
      return m === targetMonth;
    });

    fileName = `schedule_month_${targetMonth}.ics`;
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
    
    if (e.updated && e.created) {
      const updatedDate = new Date(e.updated);
      const createdDate = new Date(e.created);
      const diffHours = (new Date() - updatedDate) / (1000 * 60 * 60);
      const timeSinceCreation = (updatedDate - createdDate) / (1000 * 60);

      if (diffHours < 170 && timeSinceCreation > 5) {
        if (!summary.startsWith("【更新済み】")) {
          summary = "【更新済み】" + summary;
        }
      }
    }

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

    // バナナ(5) か ミカン(6) のみを許可
    if (item.colorId !== '5' && item.colorId !== '6') return false;
    
    return true;
  });
}