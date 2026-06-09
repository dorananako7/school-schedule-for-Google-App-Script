const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const SEARCH_MAILADRESS = 'from:cpsmaster@kochi-tech.ac.jp is:unread';


function main() {
  //threads<thread<massage=subject
  //threadsは条件を満たすメール(やり取り、会話)のグループを保持。→メッセージではない。
  let threads = GmailApp.search(SEARCH_MAILADRESS, 0, 5);
  if (threads.length == 0) {
    console.log("未読メールはありませんでした");
    return;
  }
  for (let i = 0; i < threads.length; i++) {
    let messages = threads[i].getMessages();
    let lastMessage = messages[messages.length - 1]; //最新のメールを保持
    let subject = lastMessage.getSubject();
    let sendPerson = lastMessage.getFrom();
    let MessageText = lastMessage.getPlainBody();

    console.log("メッセージを検知しました！" + subject + sendPerson + MessageText);
    let jsonString = askGemini(subject, sendPerson, MessageText);

    console.log("jsonstring=" + jsonString);

    try {
      let cleanjson = jsonString.replace(/```json|```/g, "").trim();
      let info = JSON.parse(cleanjson);
      addToCalender(info);
      threads[i].markRead();
      console.log((i + 1) + "番目の処理を終了します");
    } catch (e) {
      console.log("jsonの読み取りエラー:" + e.message);
      console.log("geminiの返答:" + jsonString);
    }

    Utilities.sleep(10000);

  }
}

function askGemini(subject, sendPerson, MassageText) {
  let now = new Date();
  let todayStr = Utilities.formatDate(now, "JST", "yyyy年M月d日");

  let prompt = `
   以下のメールからスケジュール情報を抽出し、指定されたJSON形式（項目名を変えないこと）のみを出力してください。
   
   【基準日時】
   今日は ${todayStr} です。
   メール内の日付が「2月3日」のような表記の場合、今日の日付を基準に適切な年（2025年や2026年など）を補完してください。
   
   【重要度の判断基準】
   ユーザは高知工科大学の学生です。講義、テスト、奨学金、提出物などは「重要(true)」とします。
   
   【出力JSONフォーマット】
   {
     "isRelevant": true または false,
     "eventInfo": {
       "title": "イベント名",
       "startTime": "YYYY-MM-DDTHH:mm:00",
       "endTime": "YYYY-MM-DDTHH:mm:00",
       "description": "内容の要約"
     }
   }
   ※時間は24時間表記。終了時間が不明な場合は開始の1時間後としてください。また、基本的には、締切の日にスケジュール登録するようにしてください。
   
   メール件名: ${subject}
   メール本文: ${MassageText}
 `;

  //geminiにプロンプトを送るフォーマット
  let payload = {
    "contents": [
      {
        "parts": [
          {
            "text": prompt
          }
        ]
      }
    ]
  };

  let response = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      "method": "post",
      "contentType": "application/json", //送るファイルはJSONというラベル
      "payload": JSON.stringify(payload) //JSON形式に送る内容をオブジェクトから文字列(json)に変換
    }
  );

  let data = JSON.parse(response.getContentText());
  //geminiの回答だけを切り抜き返す。
  return data.candidates[0].content.parts[0].text;
};


function addToCalender(info) {
  if (!info) {
    console.log("infoに値がありません");
    return;
  }
  if (info.isRelevant === true) {

    // カレンダーを操作する機能を使います
    const calendar = CalendarApp.getDefaultCalendar();

    // 文字列の日時を、Dateオブジェクトに変換
    const startTime = new Date(info.eventInfo.startTime);
    const endTime = new Date(info.eventInfo.endTime);
    
    let existingEvents = calendar.getEvents(startTime, endTime);

    for (let i = 0; i < existingEvents.length; i++) {
	let e = existingEvents[i];

	if(e.getTitle() === info.eventInfo.title) {
	   console.log("すでに同じ予定が存在するため、追加をスキップしました" + info.event.title);
	   return ; //強制終了//強制終了
	}
    }    

    // 予定を作成
    let event = calendar.createEvent(
      info.eventInfo.title, // タイトル
      startTime,            // 開始時間
      endTime,              // 終了時間
      { description: info.eventInfo.description } // カレンダーのメモ欄
    );

    event.addPopupReminder(24 * 60);
    event.addPopupReminder(72 * 60);
    event.addPopupReminder(168 * 60);

    console.log("カレンダーに追加しました！");
  } else {
    console.log("カレンダーには追加されませんでした");
  }
}
