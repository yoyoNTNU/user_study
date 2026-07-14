# 虛擬換裝方法評比 User Study

靜態網站,7 步驟就能上線。比較 4 種方法:`FLUX` / `GSVTON` / `VTON360` / `Ours`,
共 70 組,每組 4 部影片 + 1 張參考服裝圖片,3 題盲測(使用者只看到 A/B/C/D,看不到方法名稱)。

## 檔案結構

```
user-study/
├── index.html          網站主頁面(開場說明 / 作答畫面 / 結束畫面)
├── style.css            樣式
├── app.js               主要邏輯(隨機排序、渲染、送出資料)
├── config.js            ★ 你主要會改的檔案(組數、方法、題目、Apps Script網址)
├── videos/              70組 ×(1原始+4方法)= 350 部影片放這裡
├── images/              70組 × 2張(正/背面)= 140 張衣服照片放這裡
└── apps-script/
    ├── Code.gs           貼到 Google Apps Script 的程式碼
    └── README.md         Apps Script 部署步驟(第一次設定用)
```

## 影片與圖片命名規則

每一組總共需要 **5 部影片 + 2 張照片**:
- 1 部「換裝前」原始影片(固定顯示,不隨機、不盲測,畫面上會標註「原始」)
- 4 部「換裝後」方法結果影片(隨機排序、盲測,畫面上只顯示 A/B/C/D)
- 2 張要換上的衣服正面/背面照片(固定顯示,不隨機、不盲測,畫面上會標註「正面/背面」)

**影片**(放進 `videos/` 資料夾):

```
group01_ORIGINAL.mp4      ← 換裝前原始影片
group01_FLUX.mp4
group01_GSVTON.mp4
group01_VTON360.mp4
group01_Ours.mp4
group02_ORIGINAL.mp4
...
group70_Ours.mp4
```

編號固定 2 位數(`group01` ~ `group70`),方法關鍵字必須跟 `config.js` 裡 `METHODS` 的 `key` 完全一致
(區分大小寫):`FLUX`、`GSVTON`、`VTON360`、`Ours`。`ORIGINAL` 這個檔名固定,不需要跟 METHODS 對應。

**衣服正反面照片**(放進 `images/` 資料夾):

```
group01_front.jpg
group01_back.jpg
group02_front.jpg
group02_back.jpg
...
group70_back.jpg
```

> 如果你的圖片是 `.png`,把 `config.js` 裡 `REF_FRONT_PATH_TEMPLATE` / `REF_BACK_PATH_TEMPLATE` 的副檔名從 `.jpg` 改成 `.png` 即可。

## 上線步驟

### 1. 先設定 Google Apps Script(接收回覆用)
照 `apps-script/README.md` 的步驟做一次,拿到一個網址,貼進 `config.js` 的 `SCRIPT_URL`。

### 2. 放入影片與圖片
把你的 350 部影片(70組 ×(1原始+4方法))丟進 `videos/`,140 張衣服正反面照片丟進 `images/`,檔名照上面規則命名。

影片檔案都很小(每部 600~800KB),全部加起來大約 250~300MB,再加上照片,
仍遠低於 GitHub 對單一 repo 的建議上限(1GB),可以直接放進同一個 repo,不需要 Git LFS。

### 3. 建一個 GitHub repo 並上傳
```bash
cd user-study
git init
git add .
git commit -m "init user study"
git branch -M main
git remote add origin https://github.com/你的帳號/你的repo名稱.git
git push -u origin main
```

### 4. 開啟 GitHub Pages
1. 到 repo 頁面 → **Settings → Pages**
2. Source 選 **Deploy from a branch**,Branch 選 **main / (root)**
3. 存檔後等 1-2 分鐘,會拿到一個網址,例如:
   `https://你的帳號.github.io/你的repo名稱/`

把這個網址分享給參與者即可開始收資料。

## 資料會怎麼被記錄

每完成一組(不是全部 70 組填完才送),就會即時送出一列資料到 Google 試算表的 `Responses` 分頁:

| 欄位 | 說明 |
|---|---|
| timestamp | 送出時間 |
| session_id | 這個使用者這次作答的隨機識別碼(同一人 70 組會共用同一個) |
| group_id | 例如 `group07`(真實組別編號) |
| sequence_position | 這一組是這位使用者**第幾個看到的**(1~70)。因為每個使用者70組出現的順序都會重新洗牌,這欄可以讓你分析順序/疲勞效應 |
| display_order | 這一組畫面上 A/B/C/D 實際對應的方法,例如 `GSVTON,FLUX,Ours,VTON360`(供稽核用) |
| clothing_consistency | 這一題選出的**真實方法名稱**(已還原,不是A/B/C/D) |
| multiview_consistency | 同上 |
| overall_preference | 同上 |

> 每組隨機排序、每題答案都已經自動把 A/B/C/D 換算回真實方法名稱,你不需要自己再對照。
> group出現的**順序**也會針對每個使用者重新洗牌(不是固定group01→group70),避免所有人看到的組別順序都一樣。

## 想調整題目或方法名稱

打開 `config.js`:
- 改 `QUESTIONS` 陣列可以增減/修改題目文字(目前 3 題)
- 改 `METHODS` 可以調整方法名稱或 key(要跟影片檔名對上)
- 改 `TOTAL_GROUPS` 調整你實際準備了幾組素材
- 改 `GROUPS_PER_SESSION` 調整每位使用者實際要作答幾組(從 `TOTAL_GROUPS` 裡隨機抽樣、不重複)。
  例如你準備了 40 組素材,但只想讓每個人回答其中隨機的 30 組,就設定:
  ```js
  TOTAL_GROUPS: 40,
  GROUPS_PER_SESSION: 30,
  ```
  如果想讓每個人都做完全部組別,把 `GROUPS_PER_SESSION` 設成跟 `TOTAL_GROUPS` 一樣(或乾脆刪掉這行)即可。

## 本機測試(上傳GitHub前先預覽)

因為瀏覽器安全限制,不能直接雙擊打開 `index.html`(影片會抓不到)。
在專案資料夾內開一個本機伺服器:

```bash
cd user-study
python3 -m http.server 8000
```

然後瀏覽器開 `http://localhost:8000`。
