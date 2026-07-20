# VoxelForge · 程序化体素世界

> 基于 Three.js 的无限体素世界：FBM 地形、生物群系、程序化树木、3D 噪声洞穴、第一人称行走碰撞、昼夜循环，全部程序化生成、浏览器内可玩。

![tech](https://img.shields.io/badge/Three.js-Voxel-8ec07c) ![module](https://img.shields.io/badge/ESM-modules-yellow) ![license](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 特性

- **FBM 噪声地形**：多倍频值噪声生成起伏地表，振幅可调。
- **生物群系 + 水位**：按高度/水位配雪顶、草坡、沙岸；低于水位生成半透明水面 mesh。
- **程序化树木**：在地表随机生成树干 + 树冠。
- **3D 噪声洞穴**：石层中用 3D fbm 噪声雕刻连通空洞（可开关，阈值校准 ~8.5% 石层被雕）。
- **无限区块流式加载**：按相机位置按需生成区块、远离回收，每区块独立 `InstancedMesh`。
- **第一人称行走**：重力下落、逐轴方块碰撞（遇墙不前进）、空格跳跃（onGround 判定）。
- **射线拾取**：加减方块，按区块 `rebuildChunk` 增量更新。
- **方块拾取与移动**：「拾取并移动」模式，点击选中（黄色高亮框）再点目标面即把方块搬过去（原位置挖空），点原块取消。
- **水体流动（元胞流体）**：列状态表面均衡 CA，仅向更低处流动、体积严格守恒，定时步进重绘受影响区块。
- **昼夜循环**：太阳绕天运动 + 天空 ShaderMaterial 球壳着色过渡 + 平行光/半球光随时段变化。
- **世界保存 / 加载**：localStorage 持久化振幅/洞穴开关/编辑记录，可还原。
- **远处区块 LOD**：距离 > 2 的区块跳过树木/水生成，降低开销 → **效率提升**。

## 🧱 技术栈

`Three.js`（CDN ESM 引入） · 原生 ES Modules · 无构建工具 · `InstancedMesh` 批量渲染

## 🚀 运行

需 HTTP（ESM 模块要求），不能 `file://`。

```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080/index.html
```

## 🎮 操作

| 按键 | 功能 |
|------|------|
| `W A S D` | 行走移动 |
| `空格` | 跳跃 |
| 鼠标 | 视角 / 射线拾取方块 |
| UI 控件 | 振幅、洞穴开关、保存/读取世界 |

## 🏗 架构

```
main.js (ESM)
 ├─ Three.js 场景 / 相机 / 渲染循环
 ├─ hash3 / vnoise3 / fbm3 —— 噪声原语
 ├─ voxelColor(x,y,z) —— 体素类型判定（地形/洞穴/水/树）
 ├─ buildChunk(cx,cz,lod) —— 区块 mesh 构建（远处 LOD 精简）
 ├─ ensureChunks() —— 相机周围按需生成 + 远离回收
 ├─ moveStep / solidAt —— 行走 + 逐轴碰撞 + 跳跃
 ├─ pickCoord / movePick —— 射线拾取选中 + 搬移（destFromFace/commitMove 纯函数）
 ├─ stepWater / simulateWater —— 水体 CA 流动（体积守恒）
 └─ localStorage 存档 —— amp/cavesOn/edits 读写
```

## 🧪 测试

纯 Node 抽取真实源码执行的参考测试（无需浏览器/WebGL）：

```bash
npm test
# 语法：node --check main.js (ESM，经 .mjs 临时副本)
# _water_test.js   (8/8)  水体 CA：封闭盆地体积守恒 / 顺坡下流 / 平地收敛
# _move_test.js    (9/9)  拾取移动：destFromFace 面法线映射 / 非空实心块数守恒 / null 哨兵语义
```

## 📄 许可

MIT © hzzqq
