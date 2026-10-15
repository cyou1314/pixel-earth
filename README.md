# 小地球 · Pixel Earth

一个可以旋转、缩放的小地球，逐步制作精细像素纹理、自由造景与摄像头手势交互。

[打开网页](https://pixel-earth-foundation-cyou1314.jaycyou.chatgpt.site) · [基础版对照](https://pixel-earth-foundation-cyou1314.jaycyou.chatgpt.site/foundation/)

## 当前阶段：v0.3 引擎样片

使用免费的 Babylon.js 和 Blender 建立可编辑的制作流程。保留已确认的球体、陆海分布和简洁界面，加入浅地形起伏、独立陆海 PBR 材质、水面法线、HDR 环境反射及真实阴影。

右上角太阳按钮打开光照面板；支持晴日、暖阳、侧光与五项光照参数。拖动旋转，滚轮或双指缩放，视角和光照分别复位。光照面板底部可以切换到 v0.2 基础版。

河流、植物、建筑、生态、精细像素纹理、摄像头手势和存档继续分阶段制作。

## 使用源码

```bash
npm ci
npm run build
npm run check
```

构建后的 dist/ 可以由普通静态服务器托管。引擎、模型与环境贴图均在站点本地，不使用第三方运行 CDN。

## 可编辑工程

- authoring/pixel-earth-v0.3.blend：Blender 源工程，包含相机、太阳、环境、陆地和海洋。
- dist/assets/planet.glb：网页实际加载的模型，也可导入 Babylon.js Editor。
- dist/assets/afternoon-sky.hdr：原创天空环境光。
- src/：网页交互、灯光和引擎场景。
- [免费工具与编辑步骤](docs/TOOLS.md)：打开、修改、导出与验收流程。

编辑源工程时另存新文件。`npm run export:scene -- /绝对路径/新工程.blend` 会导出到新的时间戳目录，保留原始工程和资产。

## 验证与边界

Blender 已完成实际工程生成和 GLB 导出，并生成参考渲染。打包后的 Babylon.js 通过 NullEngine 场景检查：实际导入 GLB、网格与法线、材质、HDR 解码、阴影关系、光照预设和相机边界。

NullEngine 不渲染最终像素，Blender 参考图也不代表网页画面。浏览器控件、WebGL 实际效果、响应式布局和用户设备性能尚未验收。

记录见 [方向与验收](docs/DIRECTION.md) 和 docs/previews/engine-v0.3/validation.json。

## 同步与依赖

专用仓库：[cyou1314/pixel-earth](https://github.com/cyou1314/pixel-earth)。每个稳定阶段同步源码、制作资产与验收记录并核对远端；没有配置后台自动同步。

Babylon.js 与 glTF loader 使用 Apache-2.0，许可随网页放在 dist/licenses/。本轮没有付费订阅、付费素材或外部生成任务；原创制作资产与源码的公开可见性不自动改变其授权条款。
