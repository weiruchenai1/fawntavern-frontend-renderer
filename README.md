# FawnTavern 前端渲染器

FawnTavern 官方聊天前端插件。启用后，助手消息中的 HTML 前端内容会显示为可交互的前端卡，普通文字仍使用原生 Markdown。

## 安装

在支持 `message-renderer` 能力的 FawnTavern 版本中，打开“设置 → 扩展 → 安装 → 从 GitHub 安装”，输入：

```text
https://github.com/weiruchenai1/fawntavern-frontend-renderer
```

安装后手动启用“FawnTavern 前端渲染器”。默认按内容自动调整卡片高度；设置页也可以指定高度（单位 dp，填 0 恢复自动），以及选择是否渲染独立 HTML 消息。长前端卡由聊天列表滚动。

## 支持范围

- 支持 `html`、`htm`、`frontend`、`web`、`xml`、`vue` 和无语言标记的 HTML 围栏；完整 HTML 文档也可放在其他语言的围栏内。
- 支持反引号或波浪线围栏、未闭合的最后一个 HTML 围栏，以及相邻的 `css`、`js`、`javascript` 围栏。
- 夹在 HTML 前后的普通文字和其他语言代码块继续走原生 Markdown；相邻 HTML、CSS、JavaScript 合成同一前端文档。
- 支持独立的裸 HTML 文档或常见容器标签开头的 HTML 片段。
- 支持内联 HTML、CSS 和 JavaScript、`srcdoc` 内嵌页面，以及插件包内 `assets/`、`ui/` 下的静态资源；按钮、局部状态和纯前端交互可以运行。
- 对 HTML 中的同步 EJS 显示模板提供条件、循环、`print` 和 `<%=` 输出；模板异常时保留原文。
- 提供 `TavernHelper.setInputText`、`getCurrentMessageId` 和 `getLastMessageId` 的受限兼容入口。
- 按旧版渲染链路处理卡片高度、列表回收、输入焦点和 `vh` 高度单位；前端卡不能加载任意网络或设备文件。完整 Tavern Helper、MVU、世界书与聊天写入接口目前不兼容。
- 插件关闭或未匹配到 HTML 时，消息继续由 FawnTavern 原生 Markdown 渲染。

插件包根目录包含 `manifest.json` 和单文件 `index.js`，可直接供 FawnTavern 的 GitHub 安装器读取。

## 许可证

AGPL-3.0，见 [LICENSE](LICENSE)。
