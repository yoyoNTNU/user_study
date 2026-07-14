// ============================================================
// 設定檔 — 這是你唯一需要常常修改的檔案
// ============================================================

const CONFIG = {
  // 你的 Google Apps Script 部署網址(第一次架設完成後貼在這裡)
  // 部署步驟請看 apps-script/README.md
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwG1Awun_hDoP7t9PbNFTkjqXYUQcGFmq18vz6eD0H9TXxoA0PmJatglBl7MIzuA2Tg/exec",

  // 你實際準備了幾組素材(素材庫的總量)
  TOTAL_GROUPS: 38,

  // 每位使用者實際要作答幾組(從 TOTAL_GROUPS 裡隨機抽樣,不重複)
  // 如果想要每個人都做完全部組別,把這個設成跟 TOTAL_GROUPS 一樣即可
  GROUPS_PER_SESSION: 30,

  // 4 種方法的「真實名稱」與「對應的影片檔名關鍵字」
  // 影片檔名規則: videos/group{編號}_{KEY}.mp4
  // 例如: videos/group01_FLUX.mp4
  METHODS: [
    { key: "FLUX", label: "FLUX" },
    { key: "GSVTON", label: "GS-VTON" },
    { key: "VTON360", label: "VTON360" },
    { key: "Ours", label: "Ours" },
  ],

  // 4部方法結果影片檔名樣板(會隨機排序、盲測),{group} 換成 group01...,{method} 換成上面 METHODS 的 key
  VIDEO_PATH_TEMPLATE: "videos/{group}_{method}.mp4",

  // 換裝前的原始影片樣板(固定顯示,不隨機、不盲測,會標註「原始影片」)
  ORIGINAL_VIDEO_PATH_TEMPLATE: "videos/{group}_ORIGINAL.mp4",

  // 要換上的衣物正面/背面照片樣板(固定顯示,會標註「衣服正面/背面」)
  REF_FRONT_PATH_TEMPLATE: "images/{group}_front.png",
  REF_BACK_PATH_TEMPLATE: "images/{group}_back.png",

  // 每組要問的題目。type 固定是 "pick_best"(在 4 部影片中選一個)
  QUESTIONS: [
    {
      id: "clothing_consistency",
      text: "哪一個影片的服裝花紋／版型與參考服裝圖片最一致?",
    },
    {
      id: "multiview_consistency",
      text: "哪一個影片在旋轉呈現時最穩定、瑕疵最少?",
    },
    {
      id: "overall_preference",
      text: "綜合來看,認為整體表現最好的結果?",
    },
  ],
};
