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
    screenStudy: document.getElementById("screen-study"),
    screenDone: document.getElementById("screen-done"),
    btnStart: document.getElementById("btn-start"),
    btnNext: document.getElementById("btn-next"),
    introTotalGroups: document.getElementById("intro-total-groups"),
    groupCurrent: document.getElementById("group-current"),
    groupTotal: document.getElementById("group-total"),
    progressFill: document.getElementById("progress-fill"),
    originalVideo: document.getElementById("original-video"),
    refFront: document.getElementById("ref-front"),
    refBack: document.getElementById("ref-back"),
    videosGrid: document.getElementById("videos-grid"),
    btnPlayPause: document.getElementById("btn-playpause"),
    scrubber: document.getElementById("scrubber"),
    timeLabel: document.getElementById("time-label"),
    questionsPanel: document.getElementById("questions-panel"),
    submitStatus: document.getElementById("submit-status"),
    zoomModal: document.getElementById("zoom-modal"),
    zoomContent: document.getElementById("zoom-content"),
    zoomClose: document.getElementById("zoom-close"),
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
    document.querySelectorAll(".reference-panel .zoom-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openZoomFrame(btn.closest(".ref-media-frame"));
      });
    });
  }

  function showScreen(name) {
    el.screenIntro.classList.add("hidden");
    el.screenStudy.classList.add("hidden");
    el.screenDone.classList.add("hidden");
    if (name === "intro") el.screenIntro.classList.remove("hidden");
    if (name === "study") el.screenStudy.classList.remove("hidden");
    if (name === "done") el.screenDone.classList.remove("hidden");
  }

  function renderGroup() {
    closeZoom(); // 避免切換到下一組時,放大中的影片節點還卡在 modal 裡
    const gId = groupId(currentGroupNumber());
    const methodKeys = CONFIG.METHODS.map((m) => m.key);
    state.currentOrder = shuffle(methodKeys);
    state.answers = {};

    // header / progress
    el.groupCurrent.textContent = pad2(state.groupIndex);
    el.groupTotal.textContent = pad2(state.sessionGroupCount);
    el.progressFill.style.width =
      ((state.groupIndex - 1) / state.sessionGroupCount) * 100 + "%";

    // 固定顯示的參考素材:原始影片 + 衣物正反面(不隨機、不盲測)
    el.originalVideo.src = fillTemplate(CONFIG.ORIGINAL_VIDEO_PATH_TEMPLATE, gId);
    el.refFront.src = fillTemplate(CONFIG.REF_FRONT_PATH_TEMPLATE, gId);
    el.refBack.src = fillTemplate(CONFIG.REF_BACK_PATH_TEMPLATE, gId);

    // videos grid
    el.videosGrid.innerHTML = "";
    const gridVideos = [];
    state.currentOrder.forEach((methodKey, i) => {
      const letter = LETTERS[i];
      const card = document.createElement("div");
      card.className = "video-card fade-enter";

      const tag = document.createElement("div");
      tag.className = "swatch-tag";
      tag.textContent = letter;
      card.appendChild(tag);

      const video = document.createElement("video");
      video.src = fillTemplate(CONFIG.VIDEO_PATH_TEMPLATE, gId, methodKey);
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      card.appendChild(video);
      gridVideos.push(video);

      const zoomBtn = document.createElement("button");
      zoomBtn.type = "button";
      zoomBtn.className = "zoom-btn";
      zoomBtn.setAttribute("aria-label", `放大檢視 ${letter}`);
      zoomBtn.textContent = "⛶";
      zoomBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openZoomFrame(card);
      });
      card.appendChild(zoomBtn);

      el.videosGrid.appendChild(card);
    });

    // questions(優先渲染,確保就算下面播放列出問題,題目一定看得到)
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

    // 這一組所有要同步播放的影片:原始影片放第一個當作「主控」時間軸
    // 包在 try/catch:就算播放列這段出錯,也不會擋到上面題目的顯示
    try {
      state.allVideos = [el.originalVideo, ...gridVideos];
      state.isPlaying = true;
      state.isScrubbing = false;
      el.btnPlayPause.textContent = "⏸";
      el.scrubber.value = 0;
      el.timeLabel.textContent = "0:00 / 0:00";
      // 注意:總長度不再用 loadedmetadata 事件快取,改成每次要用時直接即時讀取
      // el.originalVideo.duration,避免影片載入太快、事件被錯過導致長度永遠抓不到 0 的問題
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
    el.submitStatus.textContent = "傳送中…";
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
    el.submitStatus.textContent = "傳送中…";
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

  // ---------------- init ----------------
  const displayCount =
    CONFIG.GROUPS_PER_SESSION && CONFIG.GROUPS_PER_SESSION < CONFIG.TOTAL_GROUPS
      ? CONFIG.GROUPS_PER_SESSION
      : CONFIG.TOTAL_GROUPS;
  el.introTotalGroups.textContent = displayCount;
  el.groupTotal.textContent = pad2(displayCount);

  el.btnStart.addEventListener("click", () => {
    state.sessionId = genSessionId();
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