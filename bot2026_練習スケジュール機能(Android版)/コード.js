// ▼GoogleカレンダーIDを設定▼
const CALENDAR_ID = 'rensyubu7294351@gmail.com';

function doGet(e) {
  // Android版はHTMLを返すだけ
  const template = HtmlService.createTemplateFromFile('index');
  template.deployUrl = ScriptApp.getService().getUrl(); 
  
  return template.evaluate()
    .setTitle('練習スケジュール(Android)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ■画面表示用データ取得
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

// ■Android用：ICSのテキストデータを生成して返す関数
// ※ファイルそのものは渡さず、文字だけ渡す
function getIcsContent(targetMonth, type) {
  return generateIcsString(targetMonth, type);
}

// ■共通：APIからデータ取得
function fetchEventsFromApi() {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), 0, 1).toISOString();
  const timeMax = new Date(now.getFullYear() + 1, 11, 31).toISOString();
  let items = [];
  try {
    const response = Calendar.Events.list(CALENDAR_ID, {
      timeMin: timeMin, timeMax: timeMax, singleEvents: true, orderBy: 'startTime', showDeleted: false 
    });
    items = response.items;
  } catch (e) {
    throw new Error("APIエラー：サービスを追加してください");
  }
  return items.filter(item => {
    if (!item || !item.start) return false;
    if (item.status !== 'confirmed' && item.status !== 'tentative') return false;
    if (item.visibility === 'private') return false;
    if (item.colorId !== '5' && item.colorId !== '6') return false;
    return true;
  });
}

// ■ICSデータ生成ロジック
function generateIcsString(targetMonth, type) {
  const allEvents = fetchEventsFromApi();
  let events = [];

  // フィルタリング処理
  if (type === 'practice') {
    events = allEvents.filter(item => {
      const m = parseInt(Utilities.formatDate(new Date(item.start.dateTime || item.start.date), 'Asia/Tokyo', 'M'));
      return item.colorId === '5' && m === targetMonth;
    });
  } else if (type === 'festival_yearly') {
    events = allEvents.filter(item => {
      const m = parseInt(Utilities.formatDate(new Date(item.start.dateTime || item.start.date), 'Asia/Tokyo', 'M'));
      return item.colorId === '6' && m >= 2 && m <= 12;
    });
  } else if (type === 'festival_monthly') {
    events = allEvents.filter(item => {
      const m = parseInt(Utilities.formatDate(new Date(item.start.dateTime || item.start.date), 'Asia/Tokyo', 'M'));
      return item.colorId === '6' && m === targetMonth;
    });
  }

  let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MyScheduleBot//JP\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n";
  
  const escapeText = (text) => (text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const formatIcsDate = (dateStr, isDateOnly) => {
    const d = new Date(dateStr);
    return isDateOnly ? Utilities.formatDate(d, 'Asia/Tokyo', "yyyyMMdd") : Utilities.formatDate(d, 'Asia/Tokyo', "yyyyMMdd'T'HHmm'00'");
  };

  events.forEach(e => {
    const isAllDay = !!e.start.date;
    const startVal = e.start.dateTime || e.start.date;
    const endVal = e.end.dateTime || e.end.date;
    const nowStamp = Utilities.formatDate(new Date(), 'GMT', "yyyyMMdd'T'HHmmss'Z'");
    const lastMod = e.updated ? Utilities.formatDate(new Date(e.updated), 'GMT', "yyyyMMdd'T'HHmmss'Z'") : nowStamp;

    icsContent += "BEGIN:VEVENT\n";
    icsContent += "UID:" + e.id + "@rensyu-bot\n"; 
    icsContent += "DTSTAMP:" + nowStamp + "\n";
    icsContent += "LAST-MODIFIED:" + lastMod + "\n";
    icsContent += "SUMMARY:" + escapeText(e.summary || "予定") + "\n";
    
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
  return icsContent;
}