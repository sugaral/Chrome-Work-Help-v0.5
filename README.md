# 屏幕识别作答助手（Chrome 扩展）

框选浏览器屏幕任意区域，自动截图并调用视觉大模型 API 识别内容、回答问题。

## 功能

- 鼠标拖拽框选任意屏幕区域，松开即识别作答
- 一键识别整个页面可见区域
- 调用 OpenAI 兼容格式的视觉大模型 API（OpenAI / DeepSeek / 通义千问 / Kimi / GLM 等均可）
- SSE 流式输出，答案实时显示在页面右下角悬浮面板
- 面板可拖动、结果可一键复制
- 快捷键 Alt+Q 随时框选

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本文件夹
4. 建议点击工具栏拼图图标，将本插件固定到工具栏

## 配置 API

点击插件图标，填写：

| 配置项 | 说明 | 示例 |
| --- | --- | --- |
| API 地址 | 完整的 chat/completions 地址 | `https://api.openai.com/v1/chat/completions`、`https://api.deepseek.com/chat/completions` |
| API Key | 你的密钥（仅保存在本机） | `sk-...` |
| 模型名称 | 需支持视觉输入 | `gpt-4o`、`qwen-vl-max`、`glm-4v`、`moonshot-v1-8k-vision-preview` |
| 作答指令 | 可自定义提示词 | 见默认值 |
| 流式输出 | 是否实时显示回答 | 默认开启 |

## 自定义 API 接入

如果 API 不是 OpenAI 兼容格式（如 Anthropic Claude），只需修改 `background.js` 中的 `callVisionAPI()` 函数——它是唯一的 API 接入点，请求构造与响应解析都集中在这里：

- `config`：popup 中保存的设置 `{ apiUrl, apiKey, model, instruction, stream }`
- `imageBase64`：裁剪后的 PNG 图片 base64（不含 `data:` 前缀）
- `onChunk(text)`：每收到一段回答时回调

## 使用

1. 点击工具栏图标 → 「框选区域作答」，或直接按 `Alt+Q`
2. 按住鼠标左键拖拽框选题目/内容区域（Esc 取消）
3. 答案流式显示在右下角面板，可复制、可拖动

## 已知限制

- 只能截取浏览器当前可见区域（不支持滚动截长图）
- `chrome://` 等浏览器内置页面无法使用
- 安装前已打开的页面需刷新一次
- API Key 明文保存在本机 chrome.storage 中，仅建议个人使用
