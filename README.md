# 小地球 · Pixel Earth

一个可以旋转、缩放的小地球，逐步制作精细像素纹理、自由造景与摄像头手势交互。

[打开网页](https://pixel-earth-foundation-cyou1314.jaycyou.chatgpt.site) · [基础版对照](https://pixel-earth-foundation-cyou1314.jaycyou.chatgpt.site/foundation/)

## 当前阶段：v0.4.1 基础打磨

在 v0.4 海陆模型上打磨基础体验：横竖屏按短边取景，保留标题与操作区的空间；增加加载、失败重试、缩放比例与边界反馈。常用按钮为 44px 触控区域，光照面板文字和滑块更易操作。

陆地增加跟随球体的低对比细节，海面降低细波幅度、按像素大小过滤远处波纹，并调整 PBR 粗糙度。保留全部陆海布局、工程与历史基础版，没有新增依赖。

当前仍是可交互的三维视觉基础，还不是自由造景或生态游戏。详细检查、GitHub 与站点差异及后续顺序见 [本轮评估](docs/REVIEW-v0.4.1.md)。

### 已有的 v0.4 海陆基础

继续使用免费的 Babylon.js 和 Blender。根据“质感粗糙、陆地太少、海洋不明显”的反馈，重做大陆布局与较细的岸线，将全局陆地覆盖从约 12% 调整到约 48%，压低鼓包式地形，保留开阔海湾。海洋具有深浅层次、天空反射和细微移动波光；不再使用会产生纬线条纹的重复法线。

右上角太阳按钮打开光照面板；支持晴日、暖阳、侧光与五项光照参数。拖动旋转，滚轮或双指缩放，视角和光照分别复位。光照面板底部可以切换到 v0.2 基础版。

河流、植物、建筑、生态、精细像素纹理、摄像头手势和存档继续分阶段制作。

## 使用源码

```bash
npm ci
npm run build
npm run check
```

构建后的 dist/ 可以由普通静态服务器托管。引擎、模型与环境贴图均在站点本地，不使用第三方运行 CDN。

## 导入提供的 v0.5 单文件页面

仓库已加入所提供的 HTML 拆分流程。当前尚未提供完整的 `pixel-earth.html`，因此实际网页仍为 v0.4.1；打包脚本本身不包含立方球地形、河流、云层或摄像头手势的实现。

将完整页面放到仓库根目录的 `pixel-earth.html` 后运行：

```bash
npm run build
npm run check
```

也可从指定路径导入，脚本会将该页面保留为仓库根目录的制作源文件：

```bash
npm run import:standalone -- /绝对路径/pixel-earth.html
npm run check
```

导入会生成 `dist/index.html`、`style.css`、`app.js`、`world.js`、`boot.js` 和 `build.json`，同步根目录版本为 0.5.0，并让 Git 跟踪 `dist/app.js`。写入前检查原文件、页面结构和 JavaScript 语法；这些检查失败时保留现有页面。`.openai/hosting.json` 与历史资产继续保留。

后续构建会继续从完整 HTML 生成页面，避免旧 Babylon 构建覆盖新版本。如果已有 v0.5 产物却缺少原始 HTML，构建会报错。v0.5 的 `npm run check` 只验证语法与导入一致性，不代表 WebGL、河流、云层或真人手势已验收。

## 可编辑工程

- authoring/pixel-earth-v0.4.blend：当前 Blender 源工程，包含相机、太阳、环境、陆地和海洋。
- dist/assets/planet-v0.4.glb：网页实际加载的模型，也可导入 Babylon.js Editor。
- dist/assets/coastal-sky-v0.4.hdr：优化后的免费 Poly Haven CC0 天空环境。
- src/：网页交互、灯光和引擎场景。
- [免费工具与编辑步骤](docs/TOOLS.md)：打开、修改、导出与验收流程。
- [资产来源](docs/ASSETS.md)：天空作者、许可、处理方式和复现步骤。

编辑源工程时另存新文件。`npm run export:scene -- /绝对路径/新工程.blend` 会导出到新的时间戳目录，保留原始工程和资产。

## 验证与边界

Blender 实际生成工程、导出 GLB 并完成默认与旋转视角参考渲染。打包后的 Babylon.js 用 NullEngine 检查实际 GLB、网格法线、海陆比例、PBR 水面插件、动画参数更新、HDR 解码、阴影关系、光照预设和相机边界。

静止视角下水波以约 30fps 更新；切到后台时停止绘制，系统要求减少动态效果时水波静止。依然没有摄像头权限或手势识别。

v0.4.1 另外使用 Babylon 实际投影矩阵检查六种横竖屏尺寸，复现旧版竖屏裁切并确认新构图完整。陆海实际 PBR 着色器在 EGL / desktop OpenGL 中编译和链接通过。

NullEngine 不渲染最终像素，Blender 参考图也不代表网页画面。浏览器控件、WebGL 实际效果、CSS 布局和用户设备性能尚未验收。

记录见 [方向与验收](docs/DIRECTION.md) 和 docs/previews/polish-v0.4.1/。v0.3、v0.4 工程、资产和记录均保留。

## 同步与依赖

专用仓库：[cyou1314/pixel-earth](https://github.com/cyou1314/pixel-earth)。每个稳定阶段同步源码、制作资产与验收记录并核对远端；没有配置后台自动同步。

Babylon.js 与 glTF loader 使用 Apache-2.0，许可随网页放在 dist/licenses/。天空使用 Poly Haven CC0 资产；没有付费订阅、付费素材或外部生成任务。原创制作资产与源码的公开可见性不自动改变其授权条款。
