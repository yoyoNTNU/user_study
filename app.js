(function () {
  "use strict";

  // ---------------- state ----------------
  const state = {
    groupIndex: 1, // 1-based,代表「目前是第幾個進度」(不是真實group編號)
    groupOrder: [], // 洗牌後的真實 group 編號順序,例如 [7, 42, 1, 63, ...]
    currentOrder: [], // 這一組目前畫面上 A/B/C/D 對應到哪個真實方法, e.g. ["GSVTON","FLUX","Ours","VTON360"]
    answers: {}, // { questionId: "A" | "B" | "C" | "D" }
    sessionId: null,
    pendingRetryPayload: null,
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
    questionsPanel: document.getElementById("questions-panel"),
    submitStatus: document.getElementById("submit-status"),
  };

  function showScreen(name) {
    el.screenIntro.classList.add("hidden");
    el.screenStudy.classList.add("hidden");
    el.screenDone.classList.add("hidden");
    if (name === "intro") el.screenIntro.classList.remove("hidden");
    if (name === "study") el.screenStudy.classList.remove("hidden");
    if (name === "done") el.screenDone.classList.remove("hidden");
  }

  function renderGroup() {
    const gId = groupId(currentGroupNumber());
    const methodKeys = CONFIG.METHODS.map((m) => m.key);
    state.currentOrder = shuffle(methodKeys);
    state.answers = {};

    // header / progress
    el.groupCurrent.textContent = pad2(state.groupIndex);
    el.groupTotal.textContent = CONFIG.TOTAL_GROUPS;
    el.progressFill.style.width =
      ((state.groupIndex - 1) / CONFIG.TOTAL_GROUPS) * 100 + "%";

    // 固定顯示的參考素材:原始影片 + 衣物正反面(不隨機、不盲測)
    el.originalVideo.src = fillTemplate(CONFIG.ORIGINAL_VIDEO_PATH_TEMPLATE, gId);
    el.refFront.src = fillTemplate(CONFIG.REF_FRONT_PATH_TEMPLATE, gId);
    el.refBack.src = fillTemplate(CONFIG.REF_BACK_PATH_TEMPLATE, gId);

    // videos grid
    el.videosGrid.innerHTML = "";
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
      video.controls = true;
      card.appendChild(video);

      el.videosGrid.appendChild(card);
    });

    // questions
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
    if (state.groupIndex >= CONFIG.TOTAL_GROUPS) {
      el.progressFill.style.width = "100%";
      showScreen("done");
      return;
    }
    state.groupIndex += 1;
    renderGroup();
  }

  // ---------------- init ----------------
  el.introTotalGroups.textContent = CONFIG.TOTAL_GROUPS;
  el.groupTotal.textContent = CONFIG.TOTAL_GROUPS;

  el.btnStart.addEventListener("click", () => {
    state.sessionId = genSessionId();
    state.groupIndex = 1;
    const allGroupNumbers = Array.from(
      { length: CONFIG.TOTAL_GROUPS },
      (_, i) => i + 1
    );
    state.groupOrder = shuffle(allGroupNumbers);
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
})();
