# FawnTavern 酒馆助手

独立的 FawnTavern 插件，提供 HTML 前端渲染、本地库环境、角色脚本入口和 MVU 变量面板兼容。

## 安装

在配套新版 App 的“扩展 → 从 GitHub 安装”中输入：

```text
https://github.com/weiruchenai1/fawntavern-frontend-renderer
```

也可以导入 `npm run package` 生成的 ZIP。启用插件后，按需授予 `variables.read` 和 `variables.write`；运行角色脚本还需授予 `character.read` 并打开“运行角色脚本”。

插件 ID 为 `me.rerere.fawntavern.frontend`。仓库根目录的 `manifest.json`、`index.js` 和 `assets/` 是可直接安装的内容。

## 功能

- 正则展开后的 HTML 片段与正文共享同一 WebView；完整前端代码块使用页面内 iframe。
- 本地提供 jQuery/UI、Touch Punch、Vue/Router、Lodash、YAML、Zod、Showdown、Toastr、Tailwind 和 Font Awesome。
- `setInputText()` 及 `send_textarea` 的赋值、`input` 事件可回填原生输入框。
- `getAllVariables()` 合并全局、角色、会话、前序消息和当前回复版本变量。
- 支持变量读取、更新、合并、删除，以及 YAML `<initvar>`、`_.set/insert/delete/add/move` 和 JSONPatch。
- MVU 面板可使用 `waitGlobalInitialized('Mvu')`、`getMvuData()`、`replaceMvuData()`、`parseMessage()` 与更新事件。
- 消息变量按回复版本保存，并拒绝旧页面覆盖新版本；同一回复不会重复累加变量更新。

当前同步变量快照只支持本楼层；角色变量只读，其他楼层、预设和脚本变量尚未开放。完整 MVU 框架的世界书自动初始化、额外模型分析与第三方脚本框架尚未实现。

## 角色脚本

启用的角色脚本在隐藏 iframe 中运行，外层只显示可见按钮。发生异常时显示带脚本名的折叠详情，展开可查看完整堆栈。脚本按钮总开关和单个按钮的可见性共同决定是否显示按钮。

提供 `getScriptId()`、`getScriptName()`、`getScriptInfo()`、`replaceScriptInfo()`，以及按钮读取、替换、同步或异步更新、按名称追加去重接口。作者备注和按钮修改仅保存在本次运行的内存中，页面重建后重新读取角色卡，不回写角色卡。

全局函数、`TavernHelper` 和 `TavernScript` 使用同一套接口和事件分发；监听在 iframe 卸载时清理。`errorCatched()` 将同步及异步异常写入详情并继续抛出。会话脚本只读取宿主上下文并设置输入框，不能调用插件宿主 RPC。

## App 要求

需使用包含以下宿主能力的新版 FawnTavern：

- `message-renderer`、`session-frontend`、`generation-lifecycle`。
- 渲染计划 `head` 和 HTML 区段 `isolated`，长消息文件描述符传输。
- `FTCardHost`、`FTCardInput`、同源 iframe 响应及变量变更通知。
- `variables.snapshot`、`variables.message.replace`、`variables.get/replace` 和 `character.extensions.get`。

仅安装插件不能为旧 App 增加原生接口。该项目可独立构建与测试，不需要检出 Android 工程。

后台脚本的最小占位高度由 App 管理；包含紧凑会话前端支持的新版 App 可避免为后台脚本预留消息正文的加载空间。

## 开发

需要 Node.js 22+；浏览器测试使用 Chrome、Chromium 或 Edge，可通过 `FRONTEND_TEST_BROWSER` 指定路径。

```text
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

`src/` 是唯一实现源码，`scripts/` 负责构建和打包，`tests/` 验证渲染、变量、浏览器交互及安装包。构建输出 `index.js` 和 `assets/` 随仓库提交，供 GitHub 安装器读取；ZIP 和 SHA-256 写入被忽略的 `dist/`。

CI 会重建并核对安装资源、运行测试和上传插件包。库版本锁定在 `package-lock.json`，完整来源及许可见 [依赖说明](DEPENDENCIES.md)。

## 许可证

[AGPL-3.0](LICENSE)。第三方库许可证位于 `assets/vendor/licenses/`。
