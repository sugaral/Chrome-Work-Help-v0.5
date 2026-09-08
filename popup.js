const DEFAULTS = {
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o",
  instruction:
    "你是答题助手。请识别图片中的内容并作答：若图片包含题目，直接给出答案并附简要解析；若是一般文本或图表，请准确提炼其中关键信息。请使用中文回答。",
  stream: true,
};

const $ = (id) => document.getElementById(id);
let hasUnsavedChanges = false;

async function load() {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  $("apiUrl").value = cfg.apiUrl;
  $("apiKey").value = cfg.apiKey;
  $("model").value = cfg.model;
  $("instruction").value = cfg.instruction;

  // 显示配置来源提示
  const statusEl = $("configStatus");
  if (cfg.apiKey) {
    statusEl.textContent = "✓ 已加载本地配置";
    statusEl.className = "config-status loaded";
  } else {
    statusEl.textContent = "使用默认配置（请填写 API Key）";
    statusEl.className = "config-status default";
  }

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
    stream: true, // 始终启用流式输出
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

$("captureBtn").addEventListener("click", () => launch({ type: "START_SELECTION" }));
$("fullBtn").addEventListener("click", () => launch({ type: "CAPTURE_FULL" }));

// 快捷键设置链接
$("shortcutLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

async function launch(message) {
  // 先测试 content script 是否可用
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  console.log("[popup] 尝试连接 tab:", tab.id, tab.url);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "PING" });
    console.log("[popup] PING 成功:", response);
  } catch (error) {
    console.error("[popup] PING 失败:", error);
    setStatus("此页面无法使用，请刷新页面后重试", false);
    return;
  }

  // 可用则保存配置并发送消息
  await chrome.storage.local.set(collect());
  hasUnsavedChanges = false;
  updateUnsavedHint();
  setStatus("已自动保存配置", true);

  // 延迟 400ms 让用户看到反馈
  await new Promise((r) => setTimeout(r, 400));

  // 发送真正的启动消息
  console.log("[popup] 发送启动消息:", message.type);
  chrome.tabs.sendMessage(tab.id, message).catch((err) => {
    console.error("[popup] 启动消息发送失败:", err);
  });
  window.close();
}

// 监听所有表单字段变化
window.addEventListener("DOMContentLoaded", () => {
  $("apiUrl").addEventListener("input", markUnsaved);
  $("apiKey").addEventListener("input", markUnsaved);
  $("model").addEventListener("input", markUnsaved);
  $("instruction").addEventListener("input", markUnsaved);
});

load();
