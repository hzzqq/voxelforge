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
- **笔刷尺寸 + 流体笔刷修正**：新增 1 / 2 / 3 立方笔刷尺寸 UI 与落点填充（纯函数 applyBrush / eraseBrush）；修正隐性 bug——water 笔刷此前误走实心分支生成蓝块（现独立为流体列）、擦除时仅清命中流体列表面（不误删无关列）。
- **水体流动（元胞流体）**：列状态表面均衡 CA，仅向更低处流动、体积严格守恒，定时步进重绘受影响区块。
- **落石流体（元胞自动机）**：悬空方块在重力下逐格下落、堆叠成丘、最终静止，独立于水/岩浆的轻量 CA。
- **岩浆流体**：黏滞流动（比水更慢、只流有限距离）+ 边缘冷却凝结成石 + 点燃相邻可燃物，三种行为耦合的 CA。
- **昼夜循环**：太阳绕天运动 + 天空 ShaderMaterial 球壳着色过渡 + 平行光/半球光随时段变化。
- **世界保存 / 加载 + 文件导入导出**：localStorage 持久化振幅/洞穴开关/编辑记录 **并补齐水/岩浆 Map**，可还原；另支持导出 / 导入 JSON 世界文件。
- **远处区块 LOD**：距离 > 2 的区块跳过树木/水生成，降低开销 → **效率提升**。
- **批量换方块（replaceType）**：纯函数 `replaceType(edits,fromType,toType,PALETTE)` 遍历编辑表把某类方块整体替换为另一类（返回新 Map、不改原 Map），UI 两个下拉（从 / 到）+「全部替换」一键重生成所有区块。
- **矿脉富集（enrichOre）**：纯函数 `enrichOre(edits,oreType,key,PALETTE)` 扫描矿物细胞 6 邻域、把石头就地富集为矿物（返回新 Map），UI 矿种下拉 +「富集」按钮，重建区块。
- **球形挖掘（爆破）boom/explode**：纯函数 `explode(edits,cx,cy,cz,radius)` 用欧氏半径删除范围内方块（返回新 Map、不改原 Map），新增 boom 模式 + 爆破半径滑块（2~6），仅重建受影响区块。
- **洪泛填充（油漆桶）floodFill**：纯函数 `floodFill(edits,sx,sy,sz,newType,key,PALETTE)` 6 连通 BFS 把与种子同色的相连方块替换为当前笔刷类型（返回新 Map、不改原 Map），新增 fill 模式 + 🪣 填充按钮，跨区块重建。

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
 ├─ replaceType / enrichOre —— 纯函数批量换方块 / 矿脉富集（返回新 Map）
 └─ localStorage 存档 —— amp/cavesOn/edits 读写
```

## 🧪 测试

纯 Node 抽取真实源码执行的参考测试（无需浏览器/WebGL）：

```bash
npm test
# 语法：node --check main.js (ESM，经 .mjs 临时副本)
# _water_test.js   (8/8)   水体 CA：封闭盆地体积守恒 / 顺坡下流 / 平地收敛
# _move_test.js    (9/9)   拾取移动：destFromFace 面法线映射 / 非空实心块数守恒 / null 哨兵语义
# _fall_test.js    (11/11) 落石 CA：悬空块下落 / 堆叠成丘 / 收敛静止
# _lava_test.js    (12/12) 岩浆：黏滞流动 / 冷却成石 / 点燃相邻
# _worldio_test.js (14/14) 世界存读档：水/岩浆 Map 全量往返 / 部分字段健壮
# _brush_test.js   (16/16) 笔刷尺寸 + 流体笔刷修正：草/沙/岩浆/水体行为 / size=2 覆盖 / 擦除清列
# _replace_test.js (12/12) 批量换方块：from→to 全部替换 / 返回新 Map / 不改原 Map / 体积守恒
# _ore_test.js     (16/16) 矿脉富集：6 邻域扫描 / 石头→矿物 / 返回新 Map / 不重复富集
# _explode_test.js (14/14) 球形挖掘：中心/近邻/球界/球外保留/原Map不变/体积守恒
# _fill_test.js    (15/15) 洪泛填充：连通替换/边界/空种子/6 连通/不改原图/体积守恒
# 合计 10 套、127 项全通过
```

## 📄 许可

MIT © hzzqq
