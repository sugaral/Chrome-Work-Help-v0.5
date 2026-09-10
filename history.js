const $ = (id) => document.getElementById(id);

async function load() {
  const { history = [] } = await chrome.storage.local.get({ history: [] });

  if (history.length === 0) {
    $("emptyHint").style.display = "block";
    $("historyList").style.display = "none";
  } else {
    $("emptyHint").style.display = "none";
    $("historyList").style.display = "flex";
    renderHistory(history);
  }
}

function renderHistory(history) {
  const list = $("historyList");
  list.innerHTML = "";

  history.forEach((record) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.dataset.id = record.id;

    const time = new Date(record.timestamp).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const preview = record.answer.substring(0, 100);
    const needsExpand = record.answer.length > 100;

    item.innerHTML = `
      <div class="history-header">
        <img class="history-thumbnail" src="data:image/png;base64,${record.image}" alt="截图">
        <div class="history-info">
          <div class="history-time">${time}</div>
          <span class="history-model">${record.model}</span>
        </div>
      </div>
      <div class="history-preview" data-id="${record.id}">
        ${escapeHtml(preview)}${needsExpand ? "..." : ""}
      </div>
      <div class="history-detail" data-id="${record.id}">
        ${escapeHtml(record.answer)}
      </div>
      <div class="history-actions">
        ${needsExpand ? `<button class="history-btn" data-action="toggle" data-id="${record.id}">展开全文</button>` : ""}
        <button class="history-btn" data-action="copy" data-id="${record.id}">复制答案</button>
        <button class="history-btn delete" data-action="delete" data-id="${record.id}">删除</button>
      </div>
    `;

    list.appendChild(item);
  });

  // 绑定事件
  list.querySelectorAll('[data-action="toggle"]').forEach(btn => {
    btn.addEventListener("click", () => toggleDetail(btn.dataset.id));
  });

  list.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener("click", () => {
      const record = history.find(r => r.id === btn.dataset.id);
      if (record) copyAnswer(record.answer, btn);
    });
  });

  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", () => deleteRecord(btn.dataset.id));
  });

  // 点击预览展开
  list.querySelectorAll('.history-preview').forEach(preview => {
    preview.addEventListener("click", () => toggleDetail(preview.dataset.id));
  });

  // 点击缩略图放大
  list.querySelectorAll('.history-thumbnail').forEach(img => {
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      const newWindow = window.open("", "_blank");
      newWindow.document.write(`<img src="${img.src}" style="max-width:100%;height:auto;">`);
    });
  });
}

function toggleDetail(id) {
  const detail = document.querySelector(`.history-detail[data-id="${id}"]`);
  const btn = document.querySelector(`[data-action="toggle"][data-id="${id}"]`);

  if (detail.classList.contains("expanded")) {
    detail.classList.remove("expanded");
    if (btn) btn.textContent = "展开全文";
  } else {
    detail.classList.add("expanded");
    if (btn) btn.textContent = "收起";
  }
}

async function copyAnswer(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }

  const originalText = btn.textContent;
  btn.textContent = "已复制";
  setTimeout(() => (btn.textContent = originalText), 1200);
}

async function deleteRecord(id) {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  const filtered = history.filter(r => r.id !== id);
  await chrome.storage.local.set({ history: filtered });
  setStatus("已删除", true);
  load();
}

async function clearAll() {
  if (!confirm("确定要清空所有历史记录吗？此操作不可恢复。")) {
    return;
  }
  await chrome.storage.local.set({ history: [] });
  setStatus("已清空所有历史记录", true);
  load();
}

function setStatus(text, ok = true) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
  setTimeout(() => (el.textContent = ""), 2500);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

$("backBtn").addEventListener("click", () => {
  window.location.href = "popup.html";
});

$("clearAllBtn").addEventListener("click", clearAll);

load();
