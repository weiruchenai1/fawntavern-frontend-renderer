# FawnTavern 前端渲染器

FawnTavern 官方聊天前端插件。启用后，助手消息中的 HTML 前端内容会显示为可交互的前端卡，普通文字仍使用原生 Markdown。

## 安装

在支持 `message-renderer` 能力的 FawnTavern 版本中，打开“设置 → 扩展 → 安装 → 从 GitHub 安装”，输入：

```text
https://github.com/weiruchenai1/fawntavern-frontend-renderer
```

安装后手动启用“FawnTavern 前端渲染器”。卡片始终按内容自动调整高度，长前端卡由聊天列表统一滚动；设置页可以选择是否渲染独立 HTML 消息。旧版本保存的卡片高度配置不再使用。

0.1.5 使用 App 提供的卡片宿主桥接读取会话上下文。楼层号来自完整会话时间线；新增消息时旧卡片可读取最新末楼层号，而原有 HTML 文档继续运行。App 负责全文占位、折叠展开、图片加载及 `srcdoc` 内嵌页面的高度更新，实际 WebView 的绘制范围随聊天可见区域调整。

## 支持范围

- 支持 `html`、`htm`、`frontend`、`web`、`xml`、`vue` 和无语言标记的 HTML 围栏；完整 HTML 文档也可放在其他语言的围栏内。
- 支持反引号或波浪线围栏，以及未闭合的最后一个 HTML 围栏。同一条消息中的每个前端代码块独立显示。
- HTML 代码块外的普通文字和其他语言代码块继续走原生 Markdown。CSS 和 JavaScript 需要写在同一个 HTML 文档中，才会作用于该卡片。
- 支持独立的裸 HTML 文档或常见容器标签开头的 HTML 片段。
- 支持内联 HTML、CSS 和 JavaScript、`srcdoc` 内嵌页面，以及插件包内 `assets/`、`ui/` 下的静态资源；按钮、局部状态和纯前端交互可以运行。HTTPS 图片、样式、脚本、字体和请求可用，远程 iframe 不开放宿主桥接。
- 对 HTML 中的同步 EJS 显示模板提供条件、循环、`print` 和 `<%=` 输出；模板异常时保留原文。
- 默认从插件加载 jQuery、jQuery UI、Vue、Vue Router、Lodash、Zod、Tailwind、Showdown、Toastr、js-yaml 和 Font Awesome；可在插件设置中关闭。
- 提供动态 `TavernHelper.getCurrentMessageId()`、`getLastMessageId()`、`setInputText()`，以及返回 Promise 的 `getChatMessagesPage()` 和 `generate()`；`FawnTavern.call()` 可调用 App 已开放的宿主方法。读取聊天需要授予 `chat.read`，调用模型需要授予 `model.generate`。
- 聊天和全局宏变量通过 `getVariablesAsync()`、`replaceVariables()` 读写，值以字符串存储；`getVariables()` 返回当前卡片的缓存，首次读取时会异步加载。变量读写分别需要授予 `variables.read` 和 `variables.write`。
- `SillyTavern.getContext()` 提供会话编号、角色名、用户名和楼层号。事件监听在当前卡片文档内有效。
- 保留 `vh` 高度单位兼容，其换算值随聊天可见区域变化；卡片高度、列表回收和输入焦点由 App 管理。
- 插件关闭或未匹配到 HTML 时，消息继续由 FawnTavern 原生 Markdown 渲染。

插件包根目录包含 `manifest.json` 和单文件 `index.js`，可直接供 FawnTavern 的 GitHub 安装器读取。

## 许可证

AGPL-3.0，见 [LICENSE](LICENSE)。
