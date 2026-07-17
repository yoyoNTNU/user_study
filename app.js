(function () {
  "use strict";

  // ---------------- state ----------------
  const state = {
    phase: 1, // 1 = 服裝一致性(長條截圖), 2 = 3D呈現瑕疵(短版影片)
    groupIndex: 1, // 1-based,代表這個phase「目前是第幾個進度」
    groupOrder: [], // 這個phase抽到並洗牌後的真實 group 編號順序
    sessionGroupCount: 0, // 每個phase實際要作答幾組
    currentOrder: [], // 這一組目前畫面上 A/B/C/D 對應到哪個真實方法
    answer: null, // 這一組目前選了哪個字母(A/B/C/D),每個phase只有一題
    sessionId: null,
    pendingRetryPayload: null,
    allVideos: [], // Part 2 用:這一組所有需要同步播放的video元素
    isPlaying: true,
    isScrubbing: false,
    wasPlayingBeforeScrub: false,
    zoomPlaceholder: null,
    playbackRate: 1, // 實際預設值在下面 init 階段會用 CONFIG.CLIP_DEFAULT_SPEED 覆蓋
  };

  const LETTERS = ["A", "B", "C", "D"];

  // ---------------- helpers ----------------
  function genSessionId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
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
    return template.replace("{group}", groupIdStr).replace("{method}", methodKey || "");
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function getCurrentQuestion() {
    return state.phase === 1 ? CONFIG.PART1_QUESTION : CONFIG.PART2_QUESTION;
  }

  // ---------------- Part 2 影片裁切區間(不用剪檔,直接用完整影片播放指定的一段) ----------------
  function getClipStart() {
    return CONFIG.CLIP_TRIM_START_SECONDS > 0 ? CONFIG.CLIP_TRIM_START_SECONDS : 0;
  }

  // 傳入影片實際長度,算出「結束秒數」——如果設定值不合理(沒設 / 超過片長 / 比開始還早)就直接用片尾
  function getClipEnd(duration) {
    const end = CONFIG.CLIP_TRIM_END_SECONDS;
    if (end > 0 && end > getClipStart() && end <= duration) return end;
    return duration;
  }

  // 幫單一 video 元素掛上「只播放 start~end 這段、播到底自動跳回開頭」的邏輯
  function applyClipTrim(video) {
    const start = getClipStart();
    if (!start && !CONFIG.CLIP_TRIM_END_SECONDS) return; // 沒設定裁切區間,完整播放就好

    video.addEventListener("loadedmetadata", () => {
      try {
        video.currentTime = start;
      } catch (err) {}
    });
    video.addEventListener("timeupdate", () => {
      const end = getClipEnd(video.duration);
      if (video.currentTime >= end) {
        try {
          video.currentTime = start;
        } catch (err) {}
      }
    });
  }

  // ---------------- 放大檢視 (zoom) ----------------
  function openZoomFrame(frameEl) {
    const mediaEl = frameEl && frameEl.querySelector("video, img");
    if (!mediaEl) return;
    closeZoom();
    const placeholder = document.createComment("zoom-placeholder");
    mediaEl.parentNode.insertBefore(placeholder, mediaEl);
    state.zoomPlaceholder = placeholder;
    el.zoomContent.innerHTML = "";

    const isPannable = frameEl.classList.contains("long-image-container");
    el.zoomContent.classList.toggle("zoom-pan-mode", isPannable);
    mediaEl.classList.add(isPannable ? "zoomed-media-pan" : "zoomed-media");
    el.zoomContent.appendChild(mediaEl);
    el.zoomModal.classList.remove("hidden");
  }

  function closeZoom() {
    const mediaEl = el.zoomContent.querySelector("video, img");
    if (mediaEl && state.zoomPlaceholder) {
      mediaEl.classList.remove("zoomed-media", "zoomed-media-pan");
      state.zoomPlaceholder.parentNode.insertBefore(mediaEl, state.zoomPlaceholder);
      state.zoomPlaceholder.remove();
    }
    state.zoomPlaceholder = null;
    el.zoomContent.classList.remove("zoom-pan-mode", "panning");
    el.zoomModal.classList.add("hidden");
  }

  // 長條截圖放大後:滑鼠拖曳兩軸平移(原生捲軸也同時可用,觸控裝置直接滑動即可)
  // 長條截圖放大後:滑鼠拖曳兩軸平移(修正版:關閉原生圖片拖曳殘影、
  // mousemove/mouseup 綁在 window 上不怕滑太快衝出容器、用 requestAnimationFrame 讓捲動更滑順)
  function setupZoomPanDrag(container) {
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let scrollLeftStart = 0;
    let scrollTopStart = 0;
    let pendingDX = 0;
    let pendingDY = 0;
    let rafId = null;

    function applyScroll() {
      container.scrollLeft = scrollLeftStart - pendingDX;
      container.scrollTop = scrollTopStart - pendingDY;
      rafId = null;
    }

    container.addEventListener("mousedown", (e) => {
      if (!container.classList.contains("zoom-pan-mode")) return;
      e.preventDefault(); // 避免觸發瀏覽器原生的圖片拖曳殘影
      isDown = true;
      container.classList.add("panning");
      startX = e.clientX;
      startY = e.clientY;
      scrollLeftStart = container.scrollLeft;
      scrollTopStart = container.scrollTop;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      pendingDX = e.clientX - startX;
      pendingDY = e.clientY - startY;
      if (rafId === null) rafId = requestAnimationFrame(applyScroll);
    });

    window.addEventListener("mouseup", () => {
      if (!isDown) return;
      isDown = false;
      container.classList.remove("panning");
    });

    // 保險:徹底擋掉瀏覽器原生的圖片拖曳行為
    container.addEventListener("dragstart", (e) => e.preventDefault());
  }

  // ---------------- DOM refs ----------------
  const el = {
    screenIntro: document.getElementById("screen-intro"),
    screenProfile: document.getElementById("screen-profile"),
    screenPhaseIntro: document.getElementById("screen-phase-intro"),
    screenStudy: document.getElementById("screen-study"),
    screenDone: document.getElementById("screen-done"),
    btnIntroNext: document.getElementById("btn-intro-next"),
    btnStart: document.getElementById("btn-start"),
    btnDebugPart2: document.getElementById("btn-debug-part2"),
    phaseIntroEyebrow: document.getElementById("phase-intro-eyebrow"),
    phaseIntroTitle: document.getElementById("phase-intro-title"),
    phaseIntroText: document.getElementById("phase-intro-text"),
    phaseIntroExampleGrid: document.getElementById("phase-intro-example-grid"),
    btnPhaseIntroStart: document.getElementById("btn-phase-intro-start"),
    btnNext: document.getElementById("btn-next"),
    introTotalGroups: document.getElementById("intro-total-groups"),
    introTotalGroups2: document.getElementById("intro-total-groups-2"),
    groupCurrent: document.getElementById("group-current"),
    groupTotal: document.getElementById("group-total"),
    progressFill: document.getElementById("progress-fill"),
    phaseNumber: document.getElementById("phase-number"),
    phaseQuestionText: document.getElementById("phase-question-text"),
    garmentRefSection: document.getElementById("garment-ref-section"),
    refFront: document.getElementById("ref-front"),
    refBack: document.getElementById("ref-back"),
    methodsList: document.getElementById("methods-list"),
    playbackBar: document.getElementById("playback-bar"),
    btnPlayPause: document.getElementById("btn-playpause"),
    scrubber: document.getElementById("scrubber"),
    timeLabel: document.getElementById("time-label"),
    btnSpeed: document.getElementById("btn-speed"),
    submitStatus: document.getElementById("submit-status"),
    zoomModal: document.getElementById("zoom-modal"),
    zoomContent: document.getElementById("zoom-content"),
    zoomClose: document.getElementById("zoom-close"),
    profileName: document.getElementById("profile-name"),
  };

  if (el.zoomModal && el.zoomClose && el.zoomContent) {
    el.zoomClose.addEventListener("click", closeZoom);
    el.zoomModal.addEventListener("click", (e) => {
      if (e.target === el.zoomModal) closeZoom();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeZoom();
    });
    setupZoomPanDrag(el.zoomContent);

    // 固定顯示的參考素材(衣服正反面)只會建立一次,init 時直接綁定
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
    el.screenPhaseIntro.classList.add("hidden");
    el.screenStudy.classList.add("hidden");
    el.screenDone.classList.add("hidden");
    if (name === "intro") el.screenIntro.classList.remove("hidden");
    if (name === "profile") el.screenProfile.classList.remove("hidden");
    if (name === "phase-intro") el.screenPhaseIntro.classList.remove("hidden");
    if (name === "study") el.screenStudy.classList.remove("hidden");
    if (name === "done") el.screenDone.classList.remove("hidden");
  }

  // 填入 Part 1 / Part 2 各自的說明內容,並顯示說明頁
  function showPhaseIntroScreen(phaseNum) {
    const info = phaseNum === 1 ? CONFIG.PART1_INTRO : CONFIG.PART2_INTRO;
    el.phaseIntroEyebrow.textContent = info.eyebrow;
    el.phaseIntroTitle.textContent = info.title;
    el.phaseIntroText.innerHTML = (info.paragraphs || [])
      .map((p) => `<p class="intro-text">${p}</p>`)
      .join("");

    el.phaseIntroExampleGrid.innerHTML = "";
    (info.examples || []).forEach((key) => {
      const ex = CONFIG.EXAMPLES && CONFIG.EXAMPLES[key];
      if (!ex) return;
      const fig = document.createElement("figure");
      fig.className = "example-item";

      let media;
      if (ex.type === "video") {
        media = document.createElement("video");
        media.src = ex.src;
        media.autoplay = true;
        media.loop = true;
        media.muted = true;
        media.playsInline = true;
      } else {
        media = document.createElement("img");
        media.src = ex.src;
        media.alt = ex.alt || "";
      }
      fig.appendChild(media);

      const caption = document.createElement("figcaption");
      caption.textContent = ex.caption || "";
      fig.appendChild(caption);
      el.phaseIntroExampleGrid.appendChild(fig);
    });

    showScreen("phase-intro");
  }

  function selectAnswer(letter, cardEl) {
    state.answer = letter;
    Array.from(el.methodsList.children).forEach((card) => {
      card.classList.toggle("selected", card === cardEl);
    });
    updateNextButton();
  }

  function updateNextButton() {
    el.btnNext.disabled = !state.answer;
  }

  // ---------------- rendering ----------------
  function renderGroup() {
    closeZoom();
    const gId = groupId(currentGroupNumber());
    const methodKeys = CONFIG.METHODS.map((m) => m.key);
    state.currentOrder = shuffle(methodKeys);
    state.answer = null;

    // header / progress
    el.groupCurrent.textContent = pad2(state.groupIndex);
    el.groupTotal.textContent = pad2(state.sessionGroupCount);
    el.progressFill.style.width = ((state.groupIndex - 1) / state.sessionGroupCount) * 100 + "%";

    // phase 題目區
    const question = getCurrentQuestion();
    el.phaseNumber.textContent = state.phase;
    el.phaseQuestionText.textContent = question.text;

    // 兩個 phase 都顯示衣服參考圖(Part 2 雖然不用管花紋對不對,但留著方便使用者對照)
    el.refFront.src = fillTemplate(CONFIG.REF_FRONT_PATH_TEMPLATE, gId);
    el.refBack.src = fillTemplate(CONFIG.REF_BACK_PATH_TEMPLATE, gId);

    // 只有 Part 2 顯示播放列(Part 1 是靜態長圖,不需要)
    el.playbackBar.classList.toggle("hidden", state.phase !== 2);

    // 清空並依 phase 重新產生
    el.methodsList.innerHTML = "";
    el.methodsList.classList.toggle("phase-1-layout", state.phase === 1);
    el.methodsList.classList.toggle("phase-2-layout", state.phase === 2);

    const gridVideos = [];

    state.currentOrder.forEach((methodKey, i) => {
      const letter = LETTERS[i];

      if (state.phase === 1) {
        // ---------- Part 1:長條截圖,點圖片直接選答案 ----------
        const card = document.createElement("div");
        card.className = "long-image-container selectable fade-enter";

        const tag = document.createElement("div");
        tag.className = "swatch-tag";
        tag.textContent = letter;
        card.appendChild(tag);

        const img = document.createElement("img");
        img.src = fillTemplate(CONFIG.LONG_IMAGE_PATH_TEMPLATE, gId, methodKey);
        img.alt = `${letter} 多視角截圖`;
        card.appendChild(img);

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

        // 現在是完整顯示的一般圖片(不用左右拖曳),點擊卡片任意處即可選擇這個方法
        card.addEventListener("click", () => {
          selectAnswer(letter, card);
        });

        el.methodsList.appendChild(card);
      } else {
        // ---------- Part 2:短版旋轉影片,點影片直接選答案 ----------
        const card = document.createElement("div");
        card.className = "method-video-col standalone selectable fade-enter";

        const tag = document.createElement("div");
        tag.className = "swatch-tag";
        tag.textContent = letter;
        card.appendChild(tag);

        const video = document.createElement("video");
        video.src = fillTemplate(CONFIG.CLIP_VIDEO_PATH_TEMPLATE, gId, methodKey);
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.playbackRate = state.playbackRate;
        applyClipTrim(video);
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

        card.addEventListener("click", (e) => {
          if (e.target === zoomBtn) return;
          selectAnswer(letter, card);
        });

        el.methodsList.appendChild(card);
      }
    });

    el.submitStatus.textContent = "";
    updateNextButton();

    // Part 2 播放列同步:包 try/catch,就算這段出錯也不擋作答
    try {
      state.allVideos = state.phase === 2 ? gridVideos : [];
      state.isPlaying = true;
      state.isScrubbing = false;
      if (el.btnPlayPause) el.btnPlayPause.textContent = "⏸";
      if (el.scrubber) el.scrubber.value = 0;
      if (el.timeLabel) el.timeLabel.textContent = "0:00 / 0:00";
      if (el.btnSpeed) el.btnSpeed.textContent = `${state.playbackRate}x`;
    } catch (err) {
      console.error("播放列初始化失敗:", err);
    }
  }

  function getMasterDuration() {
    const master = state.allVideos[0];
    if (!master || !isFinite(master.duration) || master.duration <= 0) return 0;
    return getClipEnd(master.duration) - getClipStart();
  }

  // ---------------- submission ----------------
  function buildPayload() {
    const gId = groupId(currentGroupNumber());
    const question = getCurrentQuestion();
    const slotIndex = LETTERS.indexOf(state.answer);
    const answerMethod = state.currentOrder[slotIndex];

    return {
      record_type: "answer",
      timestamp: new Date().toISOString(),
      session_id: state.sessionId,
      phase: state.phase,
      group_id: gId,
      sequence_position: state.groupIndex,
      display_order: state.currentOrder.join(","),
      answers: { [question.id]: answerMethod },
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

  function startNewPhaseSample() {
    const allGroupNumbers = Array.from({ length: CONFIG.TOTAL_GROUPS }, (_, i) => i + 1);
    const sampleSize =
      CONFIG.GROUPS_PER_SESSION && CONFIG.GROUPS_PER_SESSION < CONFIG.TOTAL_GROUPS
        ? CONFIG.GROUPS_PER_SESSION
        : CONFIG.TOTAL_GROUPS;
    state.groupOrder = shuffle(allGroupNumbers).slice(0, sampleSize);
    state.sessionGroupCount = sampleSize;
    state.groupIndex = 1;
  }

  function advance() {
    if (state.groupIndex >= state.sessionGroupCount) {
      if (state.phase === 1) {
        // Part 1 全部完成 → 進入 Part 2(重新抽樣、重新洗牌,跟Part1彼此獨立)
        // 先顯示 Part 2 的說明頁,使用者按「開始作答」才真正進入 Part 2 的作答畫面
        state.phase = 2;
        startNewPhaseSample();
        el.groupTotal.textContent = pad2(state.sessionGroupCount);
        showPhaseIntroScreen(2);
        return;
      }
      // Part 2 也完成了 → 結束
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
  if (el.introTotalGroups2) el.introTotalGroups2.textContent = displayCount;
  el.groupTotal.textContent = pad2(displayCount);
  state.playbackRate = CONFIG.CLIP_DEFAULT_SPEED || 1;

  el.btnIntroNext.addEventListener("click", () => {
    showScreen("profile");
  });

  el.btnStart.addEventListener("click", () => {
    if (!isProfileValid()) return;
    state.sessionId = genSessionId();
    submitProfile(buildProfilePayload());
    state.phase = 1;
    startNewPhaseSample();
    el.groupTotal.textContent = pad2(state.sessionGroupCount);
    showPhaseIntroScreen(1);
  });

  // 說明頁(Part 1 或 Part 2)按下「開始作答」才真正進入作答畫面
  if (el.btnPhaseIntroStart) {
    el.btnPhaseIntroStart.addEventListener("click", () => {
      showScreen("study");
      renderGroup();
    });
  }

  // 除錯用:略過 Part 1,直接以目前(可能還沒填完)的基本資料跳到 Part 2 說明頁
  if (el.btnDebugPart2) {
    el.btnDebugPart2.addEventListener("click", () => {
      if (!state.sessionId) state.sessionId = genSessionId();
      submitProfile(buildProfilePayload());
      state.phase = 2;
      startNewPhaseSample();
      el.groupTotal.textContent = pad2(state.sessionGroupCount);
      showPhaseIntroScreen(2);
    });
  }

  el.btnNext.addEventListener("click", () => {
    if (state.pendingRetryPayload) {
      retrySubmit();
    } else {
      submitCurrentGroup();
    }
  });

  // ---------------- Part 2 播放速度切換(1x / 2x) ----------------
  if (el.btnSpeed) {
    el.btnSpeed.addEventListener("click", () => {
      state.playbackRate = state.playbackRate >= 2 ? 1 : 2;
      el.btnSpeed.textContent = `${state.playbackRate}x`;
      state.allVideos.forEach((v) => {
        v.playbackRate = state.playbackRate;
      });
    });
  }

  // ---------------- 共用播放列:同步控制 Part 2 的所有影片 ----------------
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
        } catch (err) {}
      });
    };

    el.scrubber.addEventListener("input", () => {
      if (!state.isScrubbing) {
        state.wasPlayingBeforeScrub = state.isPlaying;
        state.allVideos.forEach((v) => v.pause());
      }
      state.isScrubbing = true;
      const duration = getMasterDuration();
      if (!duration) return;
      const relativeTarget = (el.scrubber.value / 1000) * duration;
      const target = getClipStart() + relativeTarget; // 換算成影片實際的絕對秒數
      el.timeLabel.textContent = `${formatTime(relativeTarget)} / ${formatTime(duration)}`;
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

    setInterval(() => {
      if (state.isScrubbing) return;
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
        const relativeTime = Math.max(0, Math.min(duration, masterTime - getClipStart()));
        el.scrubber.value = Math.min(1000, (relativeTime / duration) * 1000);
        el.timeLabel.textContent = `${formatTime(relativeTime)} / ${formatTime(duration)}`;
      }
    }, 250);
  } else {
    console.warn("播放列元素找不到,請確認 index.html 是最新版本。");
  }
})();