# FawnTavern 前端渲染器

FawnTavern 官方聊天前端插件。启用后，助手消息中的完整 `html` 代码围栏会显示为可交互的前端卡；以 HTML 文档或常见容器标签开头的独立消息也可以渲染。

## 安装

在支持 `message-renderer` 能力的 FawnTavern 版本中，打开“设置 → 扩展 → 安装 → 从 GitHub 安装”，输入：

```text
https://github.com/weiruchenai1/fawntavern-frontend-renderer
```

安装后手动启用“FawnTavern 前端渲染器”。设置页可以调整卡片高度，以及是否渲染独立 HTML 消息。

## 支持范围

- 支持多段 `html` 代码围栏，并保留围栏之外的文字。
- 支持内联 HTML、CSS 和 JavaScript；按钮、局部状态和纯前端交互可以运行。
- 前端卡不能访问 FawnTavern 宿主接口，也不能加载网络、文件或内容 URI。需要聊天、变量、世界书等宿主 API 的 Tavern Helper 脚本目前不兼容。
- 插件关闭或未匹配到 HTML 时，消息继续由 FawnTavern 原生 Markdown 渲染。

插件包根目录包含 `manifest.json` 和单文件 `index.js`，可直接供 FawnTavern 的 GitHub 安装器读取。

## 许可证

AGPL-3.0，见 [LICENSE](LICENSE)。
