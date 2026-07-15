// ============================================================
// 設定檔 — 這是你唯一需要常常修改的檔案
// ============================================================

const CONFIG = {
  // 你的 Google Apps Script 部署網址(第一次架設完成後貼在這裡)
  // 部署步驟請看 apps-script/README.md
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwG1Awun_hDoP7t9PbNFTkjqXYUQcGFmq18vz6eD0H9TXxoA0PmJatglBl7MIzuA2Tg/exec",

  // 你實際準備了幾組素材(素材庫的總量)
  TOTAL_GROUPS: 30,

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

  // 影片截圖長圖檔名樣板 (對應 ./long 資料夾) — Part 1 用
  LONG_IMAGE_PATH_TEMPLATE: "long/{group}_{method}.png",

  // 短版旋轉影片檔名樣板 — Part 2 用
  // 如果你還沒剪短版影片,直接指向跟 VIDEO_PATH_TEMPLATE 一樣的完整影片就好,
  // 程式會用下面 CLIP_TRIM_START_SECONDS / CLIP_TRIM_END_SECONDS 這兩個設定,
  // 自動只播放中間那一段、播到底就跳回開頭重播,不需要另外準備短版檔案。
  // 等你之後真的剪好短版影片,把這裡改回專屬資料夾路徑即可(例如 "videos_rotation_clip/{group}_{method}.mp4")。
  CLIP_VIDEO_PATH_TEMPLATE: "videos/{group}_{method}.mp4",

  // 只播放影片的第幾秒到第幾秒(單位:秒)。設 0 / 不設 END 就代表從頭播到尾,不裁切。
  // 例如原本 20 秒的旋轉影片,只想看「側面→背面→側面」這段落在第 8~15 秒,就設 8 和 15。
  CLIP_TRIM_START_SECONDS: 0,
  CLIP_TRIM_END_SECONDS: 6.3,

  // Part 2 影片預設播放速度(使用者可在畫面上切換 1x / 2x)
  CLIP_DEFAULT_SPEED: 2,

  // 要換上的衣物正面/背面照片樣板(固定顯示,會標註「衣服正面/背面」,只在 Part 1 顯示)
  REF_FRONT_PATH_TEMPLATE: "images/{group}_front.png",
  REF_BACK_PATH_TEMPLATE: "images/{group}_back.png",

  // Part 1 題目:只看服裝花紋／版型是否與參考服裝一致(顯示長條截圖)
  PART1_QUESTION: {
    id: "clothing_consistency",
    text: "哪一個方法的服裝花紋／版型與參考服裝圖片最一致?",
  },

  // Part 2 題目:先不管花紋對不對,只看3D呈現的瑕疵(顯示短版旋轉影片)
  PART2_QUESTION: {
    id: "rotation_artifacts",
    text: "哪一個方法在旋轉過程中,浮空雜訊(floater)、閃爍、變形最少?",
  },

  // 不好範例圖庫(對應 ./images 資料夾),PART1_INTRO / PART2_INTRO 用 key 從這裡挑要顯示哪幾張
  // 每一項預設是圖片;如果要放影片示範(例如Part2的floater/閃爍這種動態瑕疵比較適合用影片講清楚),
  // 加一個 type: "video",src 換成影片路徑即可,會自動變成自動播放、靜音、循環播放的預覽影片。
  EXAMPLES: {
    example1: {
      src: "images/example1.png",
      alt: "範例一:與參考服裝圖案不一致",
      caption: "圖案／花紋與參考服裝不一致",
    },
    example2: {
      src: "images/example2.png",
      alt: "範例二:花紋沉到衣服內部",
      caption: "在側面視角看到花紋沉到衣服內部",
    },
    example3: {
      src: "images/example3.png",
      alt: "範例三:圖案重影",
      caption: "圖案出現重影",
    },
    example4: {
      type: "video",
      src: "images/example4.mp4",
      alt: "範例四:浮空雜訊floater",
      caption: "出現黑色浮空雜訊(floater)",
    },
    // 範例:用影片示範(把 src 換成你自己的檔案路徑,再到 PART2_INTRO.examples 裡加上 "example5" 就會顯示):
    example5: {
      type: "video",
      src: "images/example5.mp4",
      caption: "旋轉時衣物版型變換",
    },
    example6: {
      type: "video",
      src: "images/example6.mp4",
      caption: "旋轉時衣物閃爍",
    },
  },

  // Part 1 說明頁(在使用者開始 Part 1 之前顯示一次)
  PART1_INTRO: {
    eyebrow: "PART 1 / 2",
    title: "服裝一致性評比",
    // 每一段會變成一個 <p class="intro-text">,可以用 <strong> 加粗
    paragraphs: [
      "這部分只會看到<strong>參考服裝正反面照片</strong>與 <strong>4張多視角長條截圖</strong>,直接點選你覺得花紋／版型最一致的那一張圖片即可。",
      "請注意衣服的圖案、花紋、顏色、版型等細節,判斷是否與參考服裝一致。",
    ],
    examples: ["example1","example2", "example3"],
  },

  // Part 2 說明頁(在 Part 1 全部完成、進入 Part 2 之前顯示一次)
  PART2_INTRO: {
    eyebrow: "PART 2 / 2",
    title: "3D呈現瑕疵評比",
    paragraphs: [
      "這部分只會看到<strong>4段旋轉影片</strong>,直接點選瑕疵最少的那一段影片即可,四段影片會並排顯示,方便一次比較。",
      "看旋轉過程中是否出現浮空雜訊(floater)、閃爍、變形,影片可以放大、暫停、調整撥放進度、切換 1x / 2x 速度後再作答。",
    ],
    examples: ["example4", "example5", "example6"],
  },
};