# 免费制作工具与资产流程

本阶段选择 Babylon.js 9.30.0、Blender 和 Babylon.js Editor。没有订阅、付费素材或外部生成任务。

## 各自的工作

| 工具 | 工作 | 本轮实际状态 |
| --- | --- | --- |
| Babylon.js | 浏览器实时渲染、PBR 材质、环境反射、灯光与阴影 | 已接入网页，引擎随网页本地打包 |
| Blender | 地形、模型、材质和三维资产制作 | 实际重做 v0.4 海陆模型、优化天空 HDR，保存独立源工程 |
| Babylon.js Editor | 可视化场景组装、调整灯光和物体属性 | 已准备可导入的 GLB；尚未安装到用户电脑或进行编辑器 GUI 验收 |
| Poly Haven | 免费的 CC0 天空环境光 | 实际使用 Kloofendal 天空，优化后本地托管；来源见 ASSETS.md |
| MediaPipe | 后续摄像头手势识别 | 本轮未接入 |

官方网站：

- https://www.babylonjs.com/
- https://editor.babylonjs.com/
- https://www.blender.org/
- https://polyhaven.com/
- https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

## 打开并编辑

1. 在 Blender 中打开 `authoring/pixel-earth-v0.4.blend`。相机、太阳、环境和陆海模型已准备好。
2. 在物体列表选择 `Land` 调整地形，选择 `Ocean` 调整水材质；`Planet` 管理整个球体。
3. 改动保存为新的 .blend 文件，保留原始工程。
4. 运行 `npm run export:scene -- /绝对路径/你的新工程.blend`。脚本将 GLB 输出到 `authoring/exports/时间戳/`，不覆盖工程或原始模型。
5. 对照检查新模型，再将选定导出文件用于 `dist/assets/planet-v0.4.glb`，运行 `npm run build` 与 `npm run check` 后发布。

Mac 可以指定 Blender 可执行文件：

```bash
BLENDER_BIN=/Applications/Blender.app/Contents/MacOS/Blender npm run export:scene
```

在 Babylon.js Editor 中新建本地项目，将 `dist/assets/planet-v0.4.glb` 导入资源区，再拖进场景。GLB 保留陆海网格、顶点颜色和 PBR 材质；网页的动态水面插件、大气效果、灯光滑块与交互逻辑由网页维护，不会自动变成编辑器功能。Blender 的程序水纹仅作为静态制作参考，不会随 GLB 自动导出。

## 资产边界

- `.blend` 是制作源文件；`.glb` 是网页实际加载的几何与材质资产。修改模型不必重新编写球体着色器。
- 太阳和填充光不烘焙进颜色纹理，方便之后换时间、换光线。
- 当前只提供浅地形起伏和陆海材质。像素纹理、河流、植被、建筑和手势继续分阶段制作。
- Blender 的参考渲染与网页的实时渲染有差别，最终视觉以网页及用户设备验收为准。
- 工具免费不代表无需编写逻辑；生态、手势映射与保存功能仍需逐步开发。

## 验证记录

详见 `docs/previews/surface-v0.4/validation.json` 与 `docs/DIRECTION.md`。本轮环境没有 Sites 指定的浏览器控制技能，不进行替代浏览器测试；NullEngine 检查不验证最终像素、浏览器控件或设备性能。

支持 surfaceless EGL 与桌面 OpenGL 的 Linux 环境，可在 `npm run check` 后运行 `python scripts/check-shaders.py`，编译实际提取的 PBR 着色器。GLSL 适配范围记录在 shader-validation.json；此检查不渲染网页像素。
