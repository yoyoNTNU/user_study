(function () {
  "use strict";

  // ---------------- state ----------------
  const state = {
    groupIndex: 1, // 1-based,代表「目前是第幾個進度」(不是真實group編號)
    groupOrder: [], // 這次session抽到並洗牌後的真實 group 編號順序,例如 [7, 42, 1, 63, ...]
    sessionGroupCount: 0, // 這次session實際要作答幾組(可能小於 TOTAL_GROUPS)
    currentOrder: [], // 這一組目前畫面上 A/B/C/D 對應到哪個真實方法, e.g. ["GSVTON","FLUX","Ours","VTON360"]
    answers: {}, // { questionId: "A" | "B" | "C" | "D" }
    sessionId: null,
    pendingRetryPayload: null,
    allVideos: [], // 這一組所有需要同步播放的video元素(原始影片 + 4部方法影片)
    isPlaying: true,
    isScrubbing: false,
    zoomPlaceholder: null,
  };

  const LETTERS = ["A", "B", "C", "D"];

  // ---------------- helpers ----------------
  function genSessionId() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }

  function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function groupId(index) {
    return `group${pad2(index)}`;
  }

  function currentGroupNumber() {
    return state.groupOrder[state.groupIndex - 1];
  }

  function fillTemplate(template, groupIdStr, methodKey) {
    return template
      .replace("{group}", groupIdStr)
      .replace("{method}", methodKey || "");
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ---------------- 放大檢視 (zoom) ----------------
  // 把使用者點擊的那個 <video> 或 <img> 節點「移動」進 modal 裡放大顯示,
  // 關閉時再移回原本位置(用一個 comment placeholder 記住原本插入點)。
  // 影片節點本身沒有被重建,所以播放進度、同步邏輯完全不受影響。
  function openZoomFrame(frameEl) {
    const mediaEl = frameEl && frameEl.querySelector("video, img");
    if (!mediaEl) return;
    closeZoom();
    const placeholder = document.createComment("zoom-placeholder");
    mediaEl.parentNode.insertBefore(placeholder, mediaEl);
    state.zoomPlaceholder = placeholder;
    el.zoomContent.innerHTML = "";
    mediaEl.classList.add("zoomed-media");
    el.zoomContent.appendChild(mediaEl);
    el.zoomModal.classList.remove("hidden");
  }

  function closeZoom() {
    const mediaEl = el.zoomContent.querySelector("video, img");
    if (mediaEl && state.zoomPlaceholder) {
      mediaEl.classList.remove("zoomed-media");
      state.zoomPlaceholder.parentNode.insertBefore(mediaEl, state.zoomPlaceholder);
      state.zoomPlaceholder.remove();
    }
    state.zoomPlaceholder = null;
    el.zoomModal.classList.add("hidden");
  }

  // ---------------- rendering ----------------
  const el = {
    screenIntro: document.getElementById("screen-intro"),
    screenProfile: document.getElementById("screen-profile"),
    screenStudy: document.getElementById("screen-study"),
    screenDone: document.getElementById("screen-done"),
    btnIntroNext: document.getElementById("btn-intro-next"),
    btnStart: document.getElementById("btn-start"),
    btnNext: document.getElementById("btn-next"),
    introTotalGroups: document.getElementById("intro-total-groups"),
    groupCurrent: document.getElementById("group-current"),
    groupTotal: document.getElementById("group-total"),
    progressFill: document.getElementById("progress-fill"),
    refFront: document.getElementById("ref-front"),
    refBack: document.getElementById("ref-back"),
    methodsList: document.getElementById("methods-list"),
    videosGrid: document.getElementById("videos-grid"),
    btnPlayPause: document.getElementById("btn-playpause"),
    scrubber: document.getElementById("scrubber"),
    timeLabel: document.getElementById("time-label"),
    questionsPanel: document.getElementById("questions-panel"),
    submitStatus: document.getElementById("submit-status"),
    zoomModal: document.getElementById("zoom-modal"),
    zoomContent: document.getElementById("zoom-content"),
    zoomClose: document.getElementById("zoom-close"),
    profileName: document.getElementById("profile-name"),
  };

  if (el.zoomModal && el.zoomClose && el.zoomContent) {
    el.zoomClose.addEventListener("click", closeZoom);
    el.zoomModal.addEventListener("click", (e) => {
      // 點擊背景(不是放大的影片/圖片本身)時關閉
      if (e.target === el.zoomModal) closeZoom();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeZoom();
    });

    // 固定顯示的參考素材(原始影片 / 衣服正反面)只會建立一次,init 時直接綁定
    document.querySelectorAll(".reference-top-panel .zoom-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openZoomFrame(btn.closest(".ref-media-frame"));
      });
    });
  }

  function showScreen(name) {
    el.screenIntro.classList.add("hidden");
    el.screenProfile.classList.add("hidden");
    el.screenStudy.classList.add("hidden");
    el.screenDone.classList.add("hidden");
    if (name === "intro") el.screenIntro.classList.remove("hidden");
    if (name === "profile") el.screenProfile.classList.remove("hidden");
    if (name === "study") el.screenStudy.classList.remove("hidden");
    if (name === "done") el.screenDone.classList.remove("hidden");
  }

  function renderGroup() {
    closeZoom(); 
    const gId = groupId(currentGroupNumber());
    const methodKeys = CONFIG.METHODS.map((m) => m.key);
    state.currentOrder = shuffle(methodKeys);
    state.answers = {};

    el.groupCurrent.textContent = pad2(state.groupIndex);
    el.groupTotal.textContent = pad2(state.sessionGroupCount);
    el.progressFill.style.width = ((state.groupIndex - 1) / state.sessionGroupCount) * 100 + "%";

    // 載入上方衣服參考圖
    el.refFront.src = fillTemplate(CONFIG.REF_FRONT_PATH_TEMPLATE, gId);
    el.refBack.src = fillTemplate(CONFIG.REF_BACK_PATH_TEMPLATE, gId);

    // 清空並產生直列方法
    el.methodsList.innerHTML = "";
    const gridVideos = [];
    
    state.currentOrder.forEach((methodKey, i) => {
      const letter = LETTERS[i];
      const row = document.createElement("div");
      row.className = "method-row fade-enter";

      // 左上角 A/B/C/D 標籤
      const tag = document.createElement("div");
      tag.className = "swatch-tag";
      tag.textContent = letter;
      row.appendChild(tag);

      // --- 左側：影片區塊 ---
      const videoCol = document.createElement("div");
      videoCol.className = "method-video-col";
      const video = document.createElement("video");
      video.src = fillTemplate(CONFIG.VIDEO_PATH_TEMPLATE, gId, methodKey);
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      videoCol.appendChild(video);
      gridVideos.push(video);

      const zoomBtnV = document.createElement("button");
      zoomBtnV.type = "button";
      zoomBtnV.className = "zoom-btn";
      zoomBtnV.textContent = "⛶";
      zoomBtnV.addEventListener("click", (e) => { e.stopPropagation(); openZoomFrame(videoCol); });
      videoCol.appendChild(zoomBtnV);
      row.appendChild(videoCol);

      // --- 右側：橫向長圖區塊 ---
      // --- 右側：橫向長圖區塊 ---
      const imgCol = document.createElement("div");
      imgCol.className = "long-image-container";
      
      const img = document.createElement("img");
      img.src = fillTemplate(CONFIG.LONG_IMAGE_PATH_TEMPLATE, gId, methodKey);
      imgCol.appendChild(img);

      // --- 這裡開始是新增的：滑鼠拖曳滾動 (Drag to Scroll) 邏輯 ---
      let isDown = false;
      let startX;
      let scrollLeft;

      imgCol.addEventListener('mousedown', (e) => {
        isDown = true;
        imgCol.classList.add('active');
        // 記錄按下去的起始位置與目前的滾動距離
        startX = e.pageX - imgCol.offsetLeft;
        scrollLeft = imgCol.scrollLeft;
      });

      imgCol.addEventListener('mouseleave', () => {
        isDown = false;
        imgCol.classList.remove('active');
      });

      imgCol.addEventListener('mouseup', () => {
        isDown = false;
        imgCol.classList.remove('active');
      });

      imgCol.addEventListener('mousemove', (e) => {
        if (!isDown) return; // 如果沒有按住就什麼都不做
        e.preventDefault();  // 避免反白到圖片或其他元素
        const x = e.pageX - imgCol.offsetLeft;
        const walk = (x - startX) * 1.5; // 乘以 1.5 是滾動速度，可以自己微調
        imgCol.scrollLeft = scrollLeft - walk;
      });
      // --- 拖曳邏輯結束 ---

      const zoomBtnI = document.createElement("button");
      zoomBtnI.type = "button";
      zoomBtnI.className = "zoom-btn";
      zoomBtnI.textContent = "⛶";
      zoomBtnI.addEventListener("click", (e) => { e.stopPropagation(); openZoomFrame(imgCol); });
      imgCol.appendChild(zoomBtnI);
      row.appendChild(imgCol);

      el.methodsList.appendChild(row);
    });

    // 渲染題目 (維持原邏輯)
    el.questionsPanel.innerHTML = "";
    CONFIG.QUESTIONS.forEach((q) => {
      const row = document.createElement("div");
      row.className = "question-row fade-enter";
      const text = document.createElement("p");
      text.className = "question-text";
      text.textContent = q.text;
      row.appendChild(text);

      const group = document.createElement("div");
      group.className = "choice-group";
      LETTERS.forEach((letter) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = letter;
        btn.addEventListener("click", () => selectAnswer(q.id, letter, group));
        group.appendChild(btn);
      });
      row.appendChild(group);
      el.questionsPanel.appendChild(row);
    });

    el.submitStatus.textContent = "";
    updateNextButton();

    try {
      // 由於沒有了原始影片，播放進度的主控改為陣列中的第一支 3DGS 影片
      state.allVideos = [...gridVideos]; 
      state.isPlaying = true;
      state.isScrubbing = false;
      el.btnPlayPause.textContent = "⏸";
      el.scrubber.value = 0;
      el.timeLabel.textContent = "0:00 / 0:00";
    } catch (err) {
      console.error("播放列初始化失敗:", err);
    }
  }

  // 即時讀取目前的主控影片長度(不依賴事件快取,隨時查詢都準)
  function getMasterDuration() {
    const master = state.allVideos[0];
    if (!master || !isFinite(master.duration) || master.duration <= 0) return 0;
    return master.duration;
  }

  function selectAnswer(questionId, letter, groupEl) {
    state.answers[questionId] = letter;
    Array.from(groupEl.children).forEach((btn) => {
      btn.classList.toggle("selected", btn.textContent === letter);
    });
    updateNextButton();
  }

  function updateNextButton() {
    const allAnswered = CONFIG.QUESTIONS.every((q) => state.answers[q.id]);
    el.btnNext.disabled = !allAnswered;
  }

  // ---------------- submission ----------------
  function buildPayload() {
    const gId = groupId(currentGroupNumber());
    const answerMethods = {};
    CONFIG.QUESTIONS.forEach((q) => {
      const letter = state.answers[q.id];
      const slotIndex = LETTERS.indexOf(letter);
      answerMethods[q.id] = state.currentOrder[slotIndex]; // 還原成真實方法名稱
    });

    return {
      record_type: "answer",
      timestamp: new Date().toISOString(),
      session_id: state.sessionId,
      group_id: gId,
      sequence_position: state.groupIndex, // 這組是這位使用者看到的第幾組(因為group順序有打亂)
      display_order: state.currentOrder.join(","), // 供稽核用:A,B,C,D 分別對應到的真實方法
      answers: answerMethods,
    };
  }

  function submitCurrentGroup() {
    const payload = buildPayload();
    el.submitStatus.textContent = "載入下一題中...";
    el.btnNext.disabled = true;

    fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    })
      .then(() => {
        el.submitStatus.textContent = "已送出";
        state.pendingRetryPayload = null;
        advance();
      })
      .catch(() => {
        el.submitStatus.textContent = "送出失敗,請檢查網路後按「重新送出」";
        state.pendingRetryPayload = payload;
        el.btnNext.textContent = "重新送出";
        el.btnNext.disabled = false;
      });
  }

  function retrySubmit() {
    el.submitStatus.textContent = "載入下一題中...";
    el.btnNext.disabled = true;
    fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(state.pendingRetryPayload),
    })
      .then(() => {
        el.submitStatus.textContent = "已送出";
        state.pendingRetryPayload = null;
        el.btnNext.textContent = "下一組";
        advance();
      })
      .catch(() => {
        el.submitStatus.textContent = "送出失敗,請檢查網路後按「重新送出」";
        el.btnNext.disabled = false;
      });
  }

  function advance() {
    if (state.groupIndex >= state.sessionGroupCount) {
      el.progressFill.style.width = "100%";
      showScreen("done");
      return;
    }
    state.groupIndex += 1;
    renderGroup();
  }

  // ---------------- 基本資料 (profile) ----------------
  function getSelectedRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  }

  function isProfileValid() {
    return Boolean(getSelectedRadioValue("profile-gender")) && Boolean(getSelectedRadioValue("profile-age"));
  }

  function updateStartButton() {
    if (el.btnStart) el.btnStart.disabled = !isProfileValid();
  }

  function buildProfilePayload() {
    return {
      record_type: "profile",
      timestamp: new Date().toISOString(),
      session_id: state.sessionId,
      name: el.profileName ? el.profileName.value.trim() : "",
      gender: getSelectedRadioValue("profile-gender"),
      age_range: getSelectedRadioValue("profile-age"),
    };
  }

  function submitProfile(payload) {
    // 基本資料只送一次,採 fire-and-forget:失敗也不擋使用者開始作答,
    // 只在 console 留紀錄方便之後排查。
    fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error("基本資料送出失敗:", err);
    });
  }

  document
    .querySelectorAll('input[name="profile-gender"], input[name="profile-age"]')
    .forEach((input) => input.addEventListener("change", updateStartButton));
  updateStartButton();

  // ---------------- init ----------------
  const displayCount =
    CONFIG.GROUPS_PER_SESSION && CONFIG.GROUPS_PER_SESSION < CONFIG.TOTAL_GROUPS
      ? CONFIG.GROUPS_PER_SESSION
      : CONFIG.TOTAL_GROUPS;
  el.introTotalGroups.textContent = displayCount;
  el.groupTotal.textContent = pad2(displayCount);

  el.btnIntroNext.addEventListener("click", () => {
    showScreen("profile");
  });

  el.btnStart.addEventListener("click", () => {
    if (!isProfileValid()) return; // 保險起見:必填未完成就不繼續(按鈕理論上也是disabled)
    state.sessionId = genSessionId();
    submitProfile(buildProfilePayload());
    state.groupIndex = 1;
    const allGroupNumbers = Array.from(
      { length: CONFIG.TOTAL_GROUPS },
      (_, i) => i + 1
    );
    const sampleSize =
      CONFIG.GROUPS_PER_SESSION && CONFIG.GROUPS_PER_SESSION < CONFIG.TOTAL_GROUPS
        ? CONFIG.GROUPS_PER_SESSION
        : CONFIG.TOTAL_GROUPS;
    state.groupOrder = shuffle(allGroupNumbers).slice(0, sampleSize);
    state.sessionGroupCount = sampleSize;
    el.groupTotal.textContent = pad2(sampleSize);
    showScreen("study");
    renderGroup();
  });

  el.btnNext.addEventListener("click", () => {
    if (state.pendingRetryPayload) {
      retrySubmit();
    } else {
      submitCurrentGroup();
    }
  });

  // ---------------- 共用播放列:同步控制所有影片 ----------------
  if (el.btnPlayPause && el.scrubber && el.timeLabel) {
    el.btnPlayPause.addEventListener("click", () => {
      state.isPlaying = !state.isPlaying;
      el.btnPlayPause.textContent = state.isPlaying ? "⏸" : "▶";
      state.allVideos.forEach((v) => {
        if (state.isPlaying) v.play().catch(() => {});
        else v.pause();
      });
    });

    const seekAllTo = (time) => {
      state.allVideos.forEach((v) => {
        try {
          v.currentTime = time;
        } catch (err) {
          /* 影片還沒load好時先忽略 */
        }
      });
    };

    el.scrubber.addEventListener("input", () => {
      if (!state.isScrubbing) {
        // 剛開始拖動:先暫停,避免播放中的影片跟拖動互相干擾
        state.wasPlayingBeforeScrub = state.isPlaying;
        state.allVideos.forEach((v) => v.pause());
      }
      state.isScrubbing = true;
      const duration = getMasterDuration();
      if (!duration) return;
      const target = (el.scrubber.value / 1000) * duration;
      el.timeLabel.textContent = `${formatTime(target)} / ${formatTime(duration)}`;
      seekAllTo(target);
    });
    ["change", "mouseup", "touchend"].forEach((evt) => {
      el.scrubber.addEventListener(evt, () => {
        state.isScrubbing = false;
        if (state.wasPlayingBeforeScrub) {
          state.allVideos.forEach((v) => v.play().catch(() => {}));
        }
      });
    });

    // 每 250ms 校正一次:把所有影片時間拉回跟「原始影片」一致,
    // 並且如果有影片因為被瀏覽器暫停(例如捲動離開畫面)也會自動接回播放
    setInterval(() => {
      if (state.isScrubbing) return; // 使用者正在拖動時,心跳機制完全不介入

      const master = state.allVideos[0];
      if (!master) return;

      if (state.isPlaying) {
        state.allVideos.forEach((v) => {
          if (v.paused) v.play().catch(() => {});
        });
      }

      const masterTime = master.currentTime;
      state.allVideos.forEach((v, i) => {
        if (i === 0) return;
        if (Math.abs(v.currentTime - masterTime) > 0.25) {
          try {
            v.currentTime = masterTime;
          } catch (err) {}
        }
      });

      const duration = getMasterDuration();
      if (!state.isScrubbing && duration) {
        el.scrubber.value = Math.min(1000, (masterTime / duration) * 1000);
        el.timeLabel.textContent = `${formatTime(masterTime)} / ${formatTime(duration)}`;
      }
    }, 250);
  } else {
    console.warn("播放列元素找不到(btn-playpause / scrubber / time-label),請確認 index.html 是最新版本。");
  }
})();
