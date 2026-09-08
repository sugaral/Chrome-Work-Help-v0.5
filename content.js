(() => {
  "use strict";

  // 调试日志：确认 content script 已加载
  console.log("[屏幕识别作答] Content script 已加载");

  const MIN_SIZE = 8;
  let overlay = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let panel = null;
  let answerText = "";
  let currentJobId = null;

  // ============ 区域选择 overlay ============
  function startSelection() {
    if (overlay) return;
    hidePanel();
    overlay = document.createElement("div");
    overlay.id = "sa-selection-overlay";
    overlay.innerHTML = `
      <div class="sa-hint">按住鼠标左键拖拽框选需要作答的区域 · Esc 取消</div>
      <div class="sa-select-rect"></div>
      <div class="sa-size-label"></div>
    `;
    document.documentElement.appendChild(overlay);
    const rect = overlay.querySelector(".sa-select-rect");
    const sizeLabel = overlay.querySelector(".sa-size-label");

    const updateRect = (e) => {
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      rect.style.left = x + "px";
      rect.style.top = y + "px";
      rect.style.width = w + "px";
      rect.style.height = h + "px";
      sizeLabel.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      sizeLabel.style.left = x + "px";
      sizeLabel.style.top = Math.max(0, y - 24) + "px";
    };
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      rect.style.display = "block";
      updateRect(e);
    };
    const onMouseMove = (e) => {
      if (!dragging) return;
      updateRect(e);
    };
    const onMouseUp = (e) => {
      if (!dragging) return;
      dragging = false;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      cleanup();
      if (w < MIN_SIZE || h < MIN_SIZE) {
        showPanel("区域太小，请重新框选", true);
        return;
      }
      capture({ x, y, width: w, height: h });
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") cleanup();
    };
    const cleanup = () => {
      overlay.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      overlay = null;
    };

    overlay.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    overlay.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("keydown", onKeyDown, true);
  }

  function capture(region) {
    const jobId = Date.now();
    currentJobId = jobId;
    chrome.runtime
      .sendMessage({
        type: "CAPTURE_REGION",
        region,
        dpr: window.devicePixelRatio || 1,
        jobId,
      })
      .catch(() => showPanel("发送截图请求失败，请刷新页面后重试", true));
  }

  // ============ 作答悬浮面板 ============
  function getPanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "sa-answer-panel";
    panel.innerHTML = `
      <div class="sa-panel-header">
        <span class="sa-panel-title">AI 作答结果</span>
        <span class="sa-panel-btns">
          <button class="sa-btn" data-act="copy">复制</button>
          <button class="sa-btn" data-act="close">✕</button>
        </span>
      </div>
      <div class="sa-panel-body"></div>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector('[data-act="copy"]').addEventListener("click", copyAnswer);
    panel.querySelector('[data-act="close"]').addEventListener("click", () => {
      panel.remove();
      panel = null;
      answerText = "";
    });
    makeDraggable(panel, panel.querySelector(".sa-panel-header"));
    return panel;
  }

  function makeDraggable(el, handle) {
    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      const onMove = (ev) => {
        el.style.left =
          Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 40) + "px";
        el.style.top =
          Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40) + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function hidePanel() {
    if (panel) panel.style.display = "none";
  }

  function showPanel(text, isError) {
    const p = getPanel();
    answerText = text;
    const body = p.querySelector(".sa-panel-body");
    body.className = "sa-panel-body" + (isError ? " sa-error" : "");
    body.innerHTML = isError ? escapeHtml(text) : mdToHtml(text);
    p.style.display = "block";
  }

  function showLoading() {
    const p = getPanel();
    answerText = "";
    const body = p.querySelector(".sa-panel-body");
    body.className = "sa-panel-body";
    body.innerHTML =
      '<div class="sa-loading"><span class="sa-spinner"></span>正在识别截屏内容…</div>';
    p.style.display = "block";
  }

  function appendChunk(text) {
    const p = getPanel();
    answerText += text;
    p.querySelector(".sa-panel-body").innerHTML = mdToHtml(answerText);
    p.querySelector(".sa-panel-body").scrollTop =
      p.querySelector(".sa-panel-body").scrollHeight;
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answerText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = answerText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = panel.querySelector('[data-act="copy"]');
    btn.textContent = "已复制";
    setTimeout(() => (btn.textContent = "复制"), 1200);
  }

  // ============ 消息处理 ============
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "PING") {
      // Popup 用来测试 content script 是否可用
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "START_SELECTION") {
      startSelection();
    } else if (msg.type === "CAPTURE_FULL") {
      hidePanel();
      capture({
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      });
    } else if (msg.jobId == null || msg.jobId === currentJobId) {
      if (msg.type === "ANSWER_START") showLoading();
      else if (msg.type === "ANSWER_CHUNK") appendChunk(msg.text);
      else if (msg.type === "ANSWER_DONE") {
        if (!answerText) showPanel("（模型未返回内容）", true);
      } else if (msg.type === "ANSWER_ERROR") {
        showPanel("识别失败：" + msg.message, true);
      }
    }
  });

  // ============ 工具函数 ============
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function mdToHtml(text) {
    const lines = escapeHtml(text).split("\n");
    let html = "";
    let inCode = false;
    for (const raw of lines) {
      if (/^```/.test(raw)) {
        inCode = !inCode;
        html += inCode ? '<pre class="sa-code">' : "</pre>";
        continue;
      }
      if (inCode) {
        html += raw + "\n";
        continue;
      }
      let line = raw
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`]+)`/g, '<code class="sa-inline-code">$1</code>');
      if (/^#{1,4}\s+/.test(line)) {
        line = '<div class="sa-md-h">' + line.replace(/^#{1,4}\s+/, "") + "</div>";
      } else if (/^\s*[-*•]\s+/.test(line)) {
        line = '<div class="sa-md-li">' + line.replace(/^\s*[-*•]\s+/, "") + "</div>";
      } else if (/^\s*\d+[.、)]\s*/.test(line)) {
        line = '<div class="sa-md-li">' + line.replace(/^\s*\d+[.、)]\s*/, "") + "</div>";
      }
      html += line + "<br>";
    }
    if (inCode) html += "</pre>";
    return html;
  }
})();
