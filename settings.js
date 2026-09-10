const DEFAULTS = {
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o",
  instruction:
    "你是答题助手。请识别图片中的内容并作答：若图片包含题目，直接给出答案并附简要解析；若是一般文本或图表，请准确提炼其中关键信息。请使用中文回答。",
  stream: true,
  historyRetentionDays: 7,
};

const $ = (id) => document.getElementById(id);
let hasUnsavedChanges = false;

async function load() {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  $("apiUrl").value = cfg.apiUrl;
  $("apiKey").value = cfg.apiKey;
  $("model").value = cfg.model;
  $("instruction").value = cfg.instruction;
  $("historyRetentionDays").value = cfg.historyRetentionDays;

  hasUnsavedChanges = false;
  updateUnsavedHint();
}

function updateUnsavedHint() {
  const hint = $("unsavedHint");
  if (hint) hint.style.display = hasUnsavedChanges ? "inline" : "none";
}

function markUnsaved() {
  hasUnsavedChanges = true;
  updateUnsavedHint();
}

function collect() {
  return {
    apiUrl: $("apiUrl").value.trim() || DEFAULTS.apiUrl,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim() || DEFAULTS.model,
    instruction: $("instruction").value.trim() || DEFAULTS.instruction,
    stream: true,
    historyRetentionDays: parseInt($("historyRetentionDays").value) || 7,
  };
}

function setStatus(text, ok = true) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
  setTimeout(() => (el.textContent = ""), 2500);
}

$("saveBtn").addEventListener("click", async () => {
  await chrome.storage.local.set(collect());
  hasUnsavedChanges = false;
  updateUnsavedHint();
  setStatus("已保存");
});

$("backBtn").addEventListener("click", () => {
  window.location.href = "popup.html";
});

// 监听所有表单字段变化
window.addEventListener("DOMContentLoaded", () => {
  $("apiUrl").addEventListener("input", markUnsaved);
  $("apiKey").addEventListener("input", markUnsaved);
  $("model").addEventListener("input", markUnsaved);
  $("instruction").addEventListener("input", markUnsaved);
  $("historyRetentionDays").addEventListener("input", markUnsaved);
});

load();
