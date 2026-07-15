/**
 * 使用者研究後端 — 將每一組的作答結果寫入 Google 試算表
 *
 * 部署方式請看同資料夾內的 README.md
 */

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const data = JSON.parse(e.postData.contents);

    if (data.record_type === "profile") {
      writeProfileRow(data);
    } else {
      writeAnswerRow(data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function writeAnswerRow(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Responses")
    || createResponsesSheet();

  ensureAnswerHeader(sheet);

  // 新版 payload 每次只會有一題答案(Part 1 / Part 2 各自一題),
  // 用 phase + question_id 明確記錄是哪個階段、哪一題,而不是把題目動態展開成欄位,
  // 這樣以後題目內容或數量再變動也不會讓表格欄位對不齊。
  const answers = data.answers || {};
  const questionId = Object.keys(answers)[0] || "";
  const answerMethod = answers[questionId] || "";

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.session_id || "",
    data.phase || "",
    data.group_id || "",
    data.sequence_position || "",
    data.display_order || "",
    questionId,
    answerMethod,
  ]);
}

function ensureAnswerHeader(sheet) {
  const firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell === "timestamp") return; // 表頭已存在

  const header = [
    "timestamp",
    "session_id",
    "phase",
    "group_id",
    "sequence_position",
    "display_order",
    "question_id",
    "answer_method",
  ];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.setFrozenRows(1);
}

function writeProfileRow(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Profiles")
    || createProfilesSheet();

  ensureProfileHeader(sheet);

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.session_id || "",
    data.name || "",
    data.gender || "",
    data.age_range || "",
  ]);
}

function createProfilesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet("Profiles");
  return sheet;
}

function ensureProfileHeader(sheet) {
  const firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell === "timestamp") return; // 表頭已存在

  const header = ["timestamp", "session_id", "name", "gender", "age_range"];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.setFrozenRows(1);
}

function createResponsesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.insertSheet("Responses");
  return sheet;
}

// 方便部署後直接用瀏覽器測試網址是否正常(GET 請求)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "Apps Script is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}