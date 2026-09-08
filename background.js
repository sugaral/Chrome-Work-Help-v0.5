const DEFAULTS = {
  apiUrl: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o",
  instruction:
    "你是答题助手。请识别图片中的内容并作答：若图片包含题目，直接给出答案并附简要解析；若是一般文本或图表，请准确提炼其中关键信息。请使用中文回答。",
  stream: true,
};

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "CAPTURE_REGION" && sender.tab) {
    handleCapture(sender.tab, msg.region, msg.dpr || 1, msg.jobId);
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
    await callVisionAPI(cfg, base64, (chunk) =>
      send({ type: "ANSWER_CHUNK", text: chunk })
    );
    send({ type: "ANSWER_DONE" });
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

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: "image/png" });
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
            image_url: { url: "data:image/png;base64," + imageBase64 },
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
