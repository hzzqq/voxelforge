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
- **方块统计（blockStats）**：纯函数 `blockStats(edits,PALETTE,waterCol,lavaCol)` 统计各类型方块数量、实心总数、挖空数，UI 顶部实时显示。
- **撤销 / 重做（undo / redo）**：`snapshotEdits` + `undoStack`/`redoStack`（上限 64），每次落笔 / 批量操作前快照、操作后入栈；Ctrl+Z 撤销、Ctrl+Y / Ctrl+Shift+Z 重做，跨端一致。
- **对称镜像笔刷（mirrorEdits）**：纯函数 `mirrorEdits(edits,axis,center,key)` 沿 X/Y/Z 轴以 `center` 为镜面反射每次落笔（原块 + 镜像块），UI 镜像开关 + 轴选择 + 镜面坐标输入，跨区块时整世界重建。
- **球形笔刷（sphereBrush）**：纯函数 `applySphereBrush` / `eraseSphereBrush` 以落点为中心、按半径在球形邻域放置/擦除方块（返回新 Map、不改原 Map），新增 🔮 球形笔刷模式 + 半径滑块（ci106）。
- **OBJ 网格导出（exportOBJ）**：纯函数 `exportOBJ(edits, PALETTE)` 把当前编辑表导出为 Wavefront `.obj`（每个实心方块转 6 面 12 三角形、带法线），UI 一键导出当前世界（ci110）。
- **选区复制 / 粘贴（copy / paste）**：纯函数 `copySelection` 把框选子立方体提取为相对坐标数组、`pasteSelection` 按偏移放回（返回新 Map），UI 复制/粘贴按钮 + 锚点记录，跨区块重建（ci114）。
- **区域填充（fillBox）**：纯函数 `fillBox` 以两点对角确定一个 AABB 区域、一次性填充为当前笔刷类型（返回新 Map），🟦 区域填充按钮（首次点击设锚点、第二次填充）（ci118）。
- **3D 连线笔刷（lineFill）**：纯函数 `lineFill` 在两点间生成参数化 3D 体素直线（步数 = 最大轴向跨度，等价 Bresenham），填充当前笔刷类型，〰️ 连线笔刷按钮（ci122）。

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
# _blockstat_test.js (17/17) 方块统计：各类型计数/实心总数/挖空数/不改入参
# _undo_test.js    (31/31) 撤销重做：快照/往返/容量上限/多步/不改原快照
# _mirror_test.js  (21/21) 对称镜像：X/Y/Z 反射/镜面自身不重复/不改入参/接线
# _sphere_test.js (16/16) 球形笔刷：中心/近邻/球界/球外保留/原Map不变/体积守恒
# _exportobj_test.js (11/11) OBJ 导出：6 面/12 三角/法线/偏移/顶点计数
# _copy_test.js   (12/12) 复制粘贴：子立方体提取/相对坐标/偏移放回/不改原图
# _fillbox_test.js (17/17) 区域填充：AABB 对角/类型填充/null 清空格/体积守恒
# _linefill_test.js (19/19) 3D 连线：参数化直线/步数/端点/对角/体积守恒
# 合计 39 套、609 项全通过
```

## 📄 许可

MIT © hzzqq
