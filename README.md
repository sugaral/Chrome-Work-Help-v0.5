# 屏幕识别作答助手

一个强大的 Chrome 浏览器扩展，框选屏幕任意区域，调用视觉大模型 API 识别内容并智能作答。

## 功能特性

### 核心功能
- 📸 **灵活截图**：框选任意区域或识别整个页面
- 🤖 **AI 识别作答**：支持所有兼容 OpenAI Chat Completions 格式的视觉模型
- 💬 **多轮对话**：基于历史记录继续提问，支持上下文对话
- 📝 **历史记录**：自动保存所有识别记录，可查看、复制、删除
- ⚡ **快捷键支持**：默认 Alt+Q 快速启动（可自定义）

### 性能优化
- 🗜️ **智能压缩**：自动压缩图片，减少 70% 存储空间
- 📊 **增量加载**：历史记录分页加载，提升响应速度
- 🔄 **流式输出**：实时显示 AI 回复，无需等待

## 安装方法

### 1. 下载扩展
```bash
git clone https://github.com/sugaral/Chrome-Work-Help-v0.5.git
```

### 2. 加载到 Chrome
1. 打开 Chrome 浏览器，进入 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目文件夹

### 3. 配置 API
点击扩展图标 → "⚙️ 软件设置" → 填写配置信息

## API 配置说明

### API 地址格式

**重要**：API 地址必须是**完整的 chat/completions 端点 URL**，不能只填域名。

✅ 正确格式：
```
https://your-api-domain.com/v1/chat/completions
```

❌ 错误示例：
```
https://api.openai.com
https://api.openai.com/v1
```

### 支持的 API 服务

#### OpenAI 官方
```
API 地址: https://api.openai.com/v1/chat/completions
模型名称: gpt-4o, gpt-4-turbo, gpt-4o-mini
```

#### Azure OpenAI
```
API 地址: https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-15-preview
模型名称: 你的部署名称
```

#### 国内中转服务
```
API 地址: https://api.your-proxy.com/v1/chat/completions
模型名称: gpt-4o（根据中转服务支持的模型填写）
```

#### DeepSeek
```
API 地址: https://api.deepseek.com/v1/chat/completions
模型名称: deepseek-chat
```

#### 其他兼容服务
只要支持 OpenAI Chat Completions 格式并且**模型支持视觉输入（vision）**，都可以使用。

### 配置示例

| 配置项 | 说明 | 示例 |
|--------|------|------|
| API 地址 | 完整的 chat/completions 端点 URL | `https://api.openai.com/v1/chat/completions` |
| API Key | 你的 API 密钥 | `sk-proj-...` |
| 模型名称 | 支持视觉输入的模型 | `gpt-4o` |
| 作答指令 | 自定义 AI 的回答风格 | 默认值即可，可根据需求调整 |
| 历史记录保留天数 | 自动清理过期记录 | 默认 7 天，可设置 1-365 天 |

### 注意事项

⚠️ **重要提示**：
- API 地址必须包含完整路径 `/v1/chat/completions`
- 模型必须支持视觉输入（vision），纯文本模型无法使用
- API Key 仅保存在本地浏览器，不会上传
- 使用第三方中转服务时，请确认服务可靠性

## 使用方法

### 方式一：快捷键（推荐）
1. 按下 `Alt+Q`（默认快捷键）
2. 鼠标拖拽框选需要识别的区域
3. 等待 AI 识别并作答

### 方式二：点击扩展图标
1. 点击浏览器工具栏的扩展图标
2. 选择"框选区域作答"或"识别整个页面"
3. 按提示操作

### 查看历史记录
1. 点击扩展图标 → "📜 历史记录"
2. 可查看、复制、删除历史记录
3. 支持滚动加载更多记录

### 多轮对话
1. 在历史记录中找到想要追问的记录
2. 点击"继续提问"按钮
3. 输入你的问题
4. AI 会基于原始截图和之前的回答进行回复

### 自定义快捷键
1. 进入 `chrome://extensions/shortcuts`
2. 找到"屏幕识别作答助手"
3. 修改快捷键

## 历史记录管理

### 自动清理
- 默认保留 7 天内的记录
- 在设置中可调整保留天数（1-365 天）
- 最多保存 100 条记录
- 超出限制自动删除最旧的记录

### 手动管理
- 单条删除：在历史记录中点击"删除"按钮
- 清空全部：点击历史记录页面的"清空全部"按钮

## 技术架构

### 文件结构
```
├── manifest.json       # 扩展配置文件
├── background.js       # 后台服务（API 调用、历史记录管理）
├── content.js          # 内容脚本（截图框选、结果展示）
├── content.css         # 内容脚本样式
├── popup.html/js/css   # 主界面
├── settings.html/js/css # 设置页面
├── history.html/js/css  # 历史记录页面
└── icons/              # 图标资源
```

### 核心技术
- **Chrome Extensions API**：扩展基础能力
- **Canvas API**：截图裁剪与压缩
- **Fetch API + SSE**：流式 API 调用
- **Chrome Storage API**：本地数据存储

## 隐私说明

- ✅ 所有数据存储在本地浏览器，不上传任何服务器
- ✅ API Key 仅用于调用你配置的 API 服务
- ✅ 截图和历史记录仅保存在你的设备上
- ✅ 可随时删除历史记录或卸载扩展

## 常见问题

### Q: 为什么提示"无法截取此页面"？
A: Chrome 内置页面（`chrome://`、`edge://`）和扩展商店页面无法截图，这是浏览器安全限制。

### Q: 支持哪些大模型？
A: 支持所有兼容 OpenAI Chat Completions 格式且支持视觉输入的模型，包括 OpenAI GPT-4o、Azure OpenAI、DeepSeek Chat 等。

### Q: 历史记录保存在哪里？
A: 使用 Chrome 的 `storage.local` API，数据存储在本地浏览器配置文件中，不会同步到云端。

### Q: API 调用失败怎么办？
A: 请检查：
1. API 地址格式是否正确（必须包含完整路径）
2. API Key 是否有效
3. 模型名称是否正确
4. 网络连接是否正常
5. API 服务是否支持视觉输入

## 开发计划

- [ ] 导出历史记录为 PDF/Word
- [ ] 支持批量截图识别
- [ ] OCR 优化（数学公式、表格识别）
- [ ] 智能分类和标签
- [ ] 云端同步（可选）

## 开源协议

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 更新日志

### v0.5.0 (2026-09-11)
- ✨ 新增多轮对话功能
- ⚡ 优化图片压缩，减少存储空间
- ⚡ 历史记录增量加载
- 🐛 修复若干已知问题

### v0.4.0 (2026-09-10)
- ✨ 新增历史记录功能
- ⚙️ 新增自动清理配置
- 🎨 优化界面样式

### v0.1.0 (2026-09-08)
- 🎉 首次发布
- 📸 支持框选区域识别
- 🤖 AI 智能作答

---

**Made with ❤️ by Ws.Claude**
