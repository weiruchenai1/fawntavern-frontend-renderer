# 前端依赖契约

核对来源为本地 JS-Slash-Runner 4.11.0 的 `src/iframe/third_party_message.html`、`third_party_script.html`、`predefine.js`、`parent_jquery.js`、`src/third_party_object.ts` 与 `vite.config.ts`。

本项目的库依赖由根目录 `package.json` 与 `package-lock.json` 固定版本，`scripts/build.cjs` 生成插件本地资源和许可证。消息页列出的通用库、父页提供的 Lodash/YAML/Zod/Showdown/Toastr 均由本地资源加载。MVU 和宿主对象的兼容范围见 [README](README.md)。

## 消息页面

| 依赖 | 上游加载方式 | 用途 |
| --- | --- | --- |
| Font Awesome Free | CSS 与字体资源 | 图标 |
| Tailwind CSS Browser | 本地 `lib/tailwindcss.min.js`，文件头标记 4.1.12 | 运行时生成工具类样式 |
| jQuery | CDN 脚本 | `$`、`jQuery`、DOM 与事件 |
| jQuery UI | CDN 脚本及主题 CSS | 控件、拖动等交互 |
| jQuery UI Touch Punch | CDN 脚本 | jQuery UI 触摸适配 |
| Vue Runtime Global | CDN 脚本 | `Vue` 组件运行时 |
| Vue Router Global | CDN 脚本 | `VueRouter` 路由 |

消息页面上的 CDN 地址未固定版本；本地 Tailwind Browser 版本与插件构建时使用的 Tailwind 版本属于不同职责。

## 父页面提供的全局对象

| 对象 | 来源与约束 |
| --- | --- |
| `_` | 父页面 Lodash，包含链式调用，不只是 `get()` |
| `YAML` | 插件的 `yaml` 包，由 `third_party_object.ts` 注册；不是 `js-yaml` |
| `z` | 插件的 Zod 包，由 `third_party_object.ts` 注册 |
| `showdown` | 酒馆宿主的 Markdown 转换库 |
| `toastr` | 酒馆宿主的通知库及样式 |
| `TavernHelper` | 酒馆助手宿主 API，部分方法需要绑定 iframe 上下文 |
| `SillyTavern` | 酒馆上下文与宿主服务，不是通用 JavaScript 库 |
| `EjsTemplate` | 提示词模板扩展，存在时继承 |
| `Mvu` | 独立 MVU 脚本，存在并初始化后继承 |

脚本页面直接加载 Vue 与 Vue Router，jQuery 从父页面继承，再注入上述全局对象。消息页面的 jQuery 使用自己的文档，不能把这两种行为混为一谈。

## 构建依赖与宿主依赖

`package.json` 中的 Pinia、VueUse、弹窗、编辑器和构建工具用于酒馆助手自身实现，不会自动成为消息页面的全局库。`vite.config.ts` 另外把 jQuery、Lodash、Showdown、Toastr、Highlight.js、Popper 标记为外部宿主依赖；其中 Highlight.js 与 Popper 没有被 `predefine.js` 直接复制到消息 iframe。

## 变量及输入框

`send_textarea` 是酒馆父页面的真实输入框 DOM。Android 兼容层需要将赋值与 `input` 事件连接到原生输入框。

`getAllVariables()` 合并全局、角色、会话和当前楼层之前各消息版本的变量。`waitGlobalInitialized('Mvu')` 等待独立 MVU 实例与变量初始化，`Mvu.events.VARIABLE_UPDATE_ENDED` 来自真实变量更新。加载通用库、创建同名空对象或仅显示 `<initvar>` 文本都不能替代这些行为。
