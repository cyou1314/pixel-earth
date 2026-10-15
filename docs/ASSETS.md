# 资产来源与制作

## v0.4 天空环境

- 素材：Kloofendal 48d Partly Cloudy (Pure Sky)，Poly Haven。
- 来源：https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky
- 作者：Greg Zaal（原始拍摄）、Jarod Guest（天空编辑）。
- 许可：CC0，https://polyhaven.com/license 。允许使用和再分发；无付费订阅。
- 官方文件清单：https://api.polyhaven.com/files/kloofendal_48d_partly_cloudy_puresky
- 下载：官方 1K HDR，1,435,119 字节；MD5 `c69498687e876bf68d2a8b8a62234eb9`，已核对。
- 项目衍生：`dist/assets/coastal-sky-v0.4.hdr`。使用 Blender 调整为 1024×512，将单像素最大通道限制为 18，减少极亮太阳斑与可调方向光叠加的影响。保留云层、天空色差和 HDR 反射。
- 衍生环境已打包进 `.blend` 并随网页托管，网页不请求 Poly Haven API 或第三方 CDN。

## 原创几何与材质

`scripts/terrain-surface.py` 生成球面大陆、海湾、浅滩、低起伏地形与顶点色。`scripts/blender-surface.py` 在 Blender 中生成可编辑源工程并导出网站使用的 GLB。

```bash
blender --background --python scripts/blender-surface.py -- --sky /绝对路径/官方1K环境.hdr
```

脚本默认拒绝覆盖已生成的 v0.4 文件。编辑时另存 .blend，使用 `npm run export:scene -- /绝对路径/新工程.blend` 导出到新的时间戳目录。

网页水面由 `src/ocean.js` 扰动 Babylon PBR 表面法线，使用无 UV 接缝的球面三维细波；不使用旧版重复水面法线。Blender 工程提供原生程序纹理作为静态水面参考，二者并非完全相同的渲染实现。

## 历史保留

v0.3 的 `.blend`、`planet.glb`、`afternoon-sky.hdr`、`water-normal.png` 及原始生成脚本均保留。当前网页使用带 v0.4 后缀的新资产。各阶段参考图与验证记录也保留在仓库。

`.blend` 是编辑源文件，Blender 参考渲染不是网页截图；最终网页质感还需在用户设备确认。
