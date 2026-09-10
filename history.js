const $ = (id) => document.getElementById(id);

let allHistory = [];
let displayedCount = 0;
const PAGE_SIZE = 20;

async function load() {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  allHistory = history;
  displayedCount = 0;

  if (allHistory.length === 0) {
    $("emptyHint").style.display = "block";
    $("historyList").style.display = "none";
  } else {
    $("emptyHint").style.display = "none";
    $("historyList").style.display = "flex";
    $("historyList").innerHTML = "";
    loadMore();
  }
}

function loadMore() {
  const start = displayedCount;
  const end = Math.min(displayedCount + PAGE_SIZE, allHistory.length);
  const chunk = allHistory.slice(start, end);

  renderHistory(chunk);
  displayedCount = end;

  if (displayedCount >= allHistory.length) {
    removeScrollListener();
  }
}

function renderHistory(history) {
  const list = $("historyList");

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
        <button class="history-btn" data-action="continue" data-id="${record.id}">继续提问</button>
        <button class="history-btn delete" data-action="delete" data-id="${record.id}">删除</button>
      </div>
      ${record.conversations && record.conversations.length > 0 ? renderConversations(record.conversations) : ""}
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

  list.querySelectorAll('[data-action="continue"]').forEach(btn => {
    btn.addEventListener("click", () => showContinueDialog(btn.dataset.id));
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
  allHistory = allHistory.filter(r => r.id !== id);
  await chrome.storage.local.set({ history: allHistory });
  setStatus("已删除", true);

  const item = document.querySelector(`.history-item[data-id="${id}"]`);
  if (item) item.remove();

  if (allHistory.length === 0) {
    $("emptyHint").style.display = "block";
    $("historyList").style.display = "none";
  }
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

function renderConversations(conversations) {
  return `
    <div class="conversation-list">
      ${conversations.map(conv => `
        <div class="conversation-item">
          <div class="conversation-q"><strong>追问：</strong>${escapeHtml(conv.question)}</div>
          <div class="conversation-a">${escapeHtml(conv.answer)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function showContinueDialog(recordId) {
  const existing = document.querySelector('.continue-dialog');
  if (existing) existing.remove();

  const dialog = document.createElement('div');
  dialog.className = 'continue-dialog';
  dialog.innerHTML = `
    <div class="continue-dialog-content">
      <div class="continue-dialog-header">
        <span>继续提问</span>
        <button class="continue-close">✕</button>
      </div>
      <textarea class="continue-input" placeholder="输入你的问题..." rows="3"></textarea>
      <div class="continue-status"></div>
      <div class="continue-actions">
        <button class="continue-cancel">取消</button>
        <button class="continue-submit">发送</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector('.continue-input');
  const status = dialog.querySelector('.continue-status');
  const submitBtn = dialog.querySelector('.continue-submit');

  dialog.querySelector('.continue-close').addEventListener('click', () => dialog.remove());
  dialog.querySelector('.continue-cancel').addEventListener('click', () => dialog.remove());

  submitBtn.addEventListener('click', async () => {
    const question = input.value.trim();
    if (!question) return;

    submitBtn.disabled = true;
    input.disabled = true;
    status.textContent = '正在思考...';
    status.className = 'continue-status active';

    try {
      chrome.runtime.sendMessage({
        type: 'CONTINUE_CONVERSATION',
        recordId: recordId,
        question: question
      }, (response) => {
        if (response && response.success) {
          status.textContent = '完成';
          status.className = 'continue-status success';
          setTimeout(() => {
            dialog.remove();
            load();
          }, 800);
        } else {
          status.textContent = '错误：' + (response?.error || '未知错误');
          status.className = 'continue-status error';
          submitBtn.disabled = false;
          input.disabled = false;
        }
      });
    } catch (err) {
      status.textContent = '发送失败：' + err.message;
      status.className = 'continue-status error';
      submitBtn.disabled = false;
      input.disabled = false;
    }
  });

  input.focus();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setupScrollListener() {
  window.addEventListener("scroll", handleScroll);
}

function removeScrollListener() {
  window.removeEventListener("scroll", handleScroll);
}

function handleScroll() {
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
    if (displayedCount < allHistory.length) {
      loadMore();
    }
  }
}

$("backBtn").addEventListener("click", () => {
  window.location.href = "popup.html";
});

$("clearAllBtn").addEventListener("click", clearAll);

load();
setupScrollListener();
