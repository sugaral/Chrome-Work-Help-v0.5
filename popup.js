const DEFAULTS = {
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o",
  instruction:
    "你是答题助手。请识别图片中的内容并作答：若图片包含题目，直接给出答案并附简要解析；若是一般文本或图表，请准确提炼其中关键信息。请使用中文回答。",
  stream: true,
};

const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await chrome.storage.local.get(DEFAULTS);

  // 显示配置来源提示
  const statusEl = $("configStatus");
  if (cfg.apiKey) {
    statusEl.textContent = "✓ 已加载本地配置";
    statusEl.className = "config-status loaded";
  } else {
    statusEl.textContent = "⚠ 请先在软件设置中填写 API Key";
    statusEl.className = "config-status default";
  }
}

function setStatus(text, ok = true) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
  setTimeout(() => (el.textContent = ""), 2500);
}

$("captureBtn").addEventListener("click", () => launch({ type: "START_SELECTION" }));
$("fullBtn").addEventListener("click", () => launch({ type: "CAPTURE_FULL" }));

$("settingsBtn").addEventListener("click", () => {
  window.location.href = "settings.html";
});

// 快捷键设置链接
$("shortcutLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

async function launch(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  console.log("[popup] 尝试连接 tab:", tab.id, tab.url);

  // 检查是否是受限页面
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) {
    setStatus("系统页面不支持此功能", false);
    return;
  }

  // 尝试注入 content script（如果尚未注入）
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    console.log("[popup] Content script 注入成功");
  } catch (error) {
    console.log("[popup] Content script 可能已存在:", error);
  }

  // 注入 CSS
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
    console.log("[popup] CSS 注入成功");
  } catch (error) {
    console.log("[popup] CSS 可能已存在:", error);
  }

  // 延迟 300ms 让脚本完成注入
  await new Promise((r) => setTimeout(r, 300));

  // 发送启动消息
  console.log("[popup] 发送启动消息:", message.type);
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    window.close();
  } catch (err) {
    console.error("[popup] 启动消息发送失败:", err);
    setStatus("页面未响应，请重试", false);
  }
}

load();
