const DEFAULTS = {
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o",
  instruction:
    "你是答题助手。请识别图片中的内容并作答：若图片包含题目，直接给出答案并附简要解析；若是一般文本或图表，请准确提炼其中关键信息。请使用中文回答。",
  stream: true,
  historyRetentionDays: 7,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_REGION" && sender.tab) {
    handleCapture(sender.tab, msg.region, msg.dpr || 1, msg.jobId);
  } else if (msg.type === "CONTINUE_CONVERSATION") {
    handleContinueConversation(msg.recordId, msg.question, sendResponse);
    return true;
  }
});

async function handleCapture(tab, region, dpr, jobId) {
  const send = (m) =>
    chrome.tabs.sendMessage(tab.id, { ...m, jobId }).catch(() => {});
  try {
    const cfg = await chrome.storage.local.get(DEFAULTS);
    if (!cfg.apiKey) {
      throw new Error("请先在插件设置中填写 API Key");
    }
    // 等待一帧，确保框选 overlay 已从页面中移除，避免被截进图里
    await new Promise((r) => setTimeout(r, 150));
    const base64 = await captureAndCrop(tab, region, dpr);
    send({ type: "ANSWER_START" });
    let fullAnswer = "";
    await callVisionAPI(cfg, base64, (chunk) => {
      fullAnswer += chunk;
      send({ type: "ANSWER_CHUNK", text: chunk });
    });
    send({ type: "ANSWER_DONE" });
    if (fullAnswer) {
      await saveHistory(base64, fullAnswer, cfg);
    }
  } catch (err) {
    send({ type: "ANSWER_ERROR", message: err.message || String(err) });
  }
}

// ============ 截图 + 按区域裁剪 ============
async function captureAndCrop(tab, region, dpr) {
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
  } catch {
    throw new Error("无法截取此页面（浏览器内置页面或权限受限）");
  }
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  let sx = Math.max(0, Math.round(region.x * dpr));
  let sy = Math.max(0, Math.round(region.y * dpr));
  let sw = Math.round(region.width * dpr);
  let sh = Math.round(region.height * dpr);
  sw = Math.min(sw, bitmap.width - sx);
  sh = Math.min(sh, bitmap.height - sy);
  if (sw <= 0 || sh <= 0) {
    bitmap.close();
    throw new Error("截图区域超出可视范围");
  }

  // 压缩图片：如果宽度或高度超过 800px，等比缩放
  const MAX_SIZE = 800;
  let targetW = sw;
  let targetH = sh;
  if (sw > MAX_SIZE || sh > MAX_SIZE) {
    const scale = Math.min(MAX_SIZE / sw, MAX_SIZE / sh);
    targetW = Math.round(sw * scale);
    targetH = Math.round(sh * scale);
  }

  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.85
  });
  return blobToBase64(outBlob);
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * ================= API 接入点 =================
 * 默认按 OpenAI Chat Completions 兼容格式调用（支持 SSE 流式）。
 * 如果你的 API 格式不同（如 Anthropic Claude），只需修改本函数：
 *   - config：popup 中保存的设置 { apiUrl, apiKey, model, instruction, stream }
 *   - imageBase64：裁剪后的 PNG 图片（不含 data: 前缀）
 *   - onChunk(text)：每收到一段回答时调用
 * =============================================
 */
async function callConversationAPI(config, record, question, onChunk) {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: config.instruction },
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64," + record.image },
        },
      ],
    },
    {
      role: "assistant",
      content: record.answer
    }
  ];

  if (record.conversations && record.conversations.length > 0) {
    record.conversations.forEach(conv => {
      messages.push({ role: "user", content: conv.question });
      messages.push({ role: "assistant", content: conv.answer });
    });
  }

  messages.push({ role: "user", content: question });

  const body = {
    model: config.model,
    stream: !!config.stream,
    messages: messages
  };

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `API 请求失败 (HTTP ${res.status})${text ? "：" + text.slice(0, 300) : ""}`
    );
  }

  if (body.stream) {
    await readSSE(res, onChunk);
  } else {
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    if (content) onChunk(content);
  }
}

async function callVisionAPI(config, imageBase64, onChunk) {
  const body = {
    model: config.model,
    stream: !!config.stream,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: config.instruction },
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64," + imageBase64 },
          },
        ],
      },
    ],
  };

  // 调试输出：帮助定位 API 配置问题
  console.log("[屏幕识别作答] API 请求信息：", {
    url: config.apiUrl,
    model: config.model,
    stream: config.stream,
    imageSize: Math.round(imageBase64.length / 1024) + "KB",
  });

  const res = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + config.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[屏幕识别作答] API 错误响应：", {
      status: res.status,
      statusText: res.statusText,
      body: text.slice(0, 500),
    });
    throw new Error(
      `API 请求失败 (HTTP ${res.status})${text ? "：" + text.slice(0, 300) : ""}`
    );
  }

  if (body.stream) {
    await readSSE(res, onChunk);
  } else {
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    if (content) onChunk(content);
  }
}

async function readSSE(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // 忽略无法解析的行
      }
    }
  }
}

// ============ 快捷键 ============
// ============ 历史记录管理 ============
async function saveHistory(base64Image, answer, config, parentId = null) {
  const { history = [] } = await chrome.storage.local.get({ history: [] });
  const record = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    image: base64Image,
    answer: answer,
    model: config.model,
    parentId: parentId,
    conversations: []
  };
  history.unshift(record);
  if (history.length > 100) {
    history.length = 100;
  }
  await chrome.storage.local.set({ history });
  return record.id;
}

async function handleContinueConversation(recordId, question, sendResponse) {
  try {
    const { history = [] } = await chrome.storage.local.get({ history: [] });
    const record = history.find(r => r.id === recordId);

    if (!record) {
      sendResponse({ success: false, error: "历史记录不存在" });
      return;
    }

    const cfg = await chrome.storage.local.get(DEFAULTS);
    if (!cfg.apiKey) {
      sendResponse({ success: false, error: "请先在插件设置中填写 API Key" });
      return;
    }

    let fullAnswer = "";

    await callConversationAPI(cfg, record, question, (chunk) => {
      fullAnswer += chunk;
    });

    if (!record.conversations) {
      record.conversations = [];
    }
    record.conversations.push({
      question: question,
      answer: fullAnswer,
      timestamp: Date.now()
    });

    await chrome.storage.local.set({ history });
    sendResponse({ success: true, answer: fullAnswer });
  } catch (err) {
    sendResponse({ success: false, error: err.message || String(err) });
  }
}

async function cleanExpiredHistory() {
  const { history = [], historyRetentionDays = 7 } =
    await chrome.storage.local.get(['history', 'historyRetentionDays']);

  const cutoffTime = Date.now() - (historyRetentionDays * 24 * 60 * 60 * 1000);
  const filtered = history.filter(record => record.timestamp > cutoffTime);

  if (filtered.length < history.length) {
    await chrome.storage.local.set({ history: filtered });
  }
}

cleanExpiredHistory();
setInterval(cleanExpiredHistory, 60 * 60 * 1000);

// ============ 快捷键 ============
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-answer") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // 检查是否是受限页面
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:") || tab.url.startsWith("chrome-extension://")) {
    return;
  }

  // 尝试注入 content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (error) {
    console.log("[background] Content script 可能已存在:", error);
  }

  // 注入 CSS
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });
  } catch (error) {
    console.log("[background] CSS 可能已存在:", error);
  }

  // 发送启动消息
  setTimeout(() => {
    chrome.tabs.sendMessage(tab.id, { type: "START_SELECTION" }).catch(() => {});
  }, 300);
});
