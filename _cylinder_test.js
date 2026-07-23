// ci126 VoxelForge 圆柱形笔刷测试：从 main.js 抽取真实 applyCylinderBrush / eraseCylinderBrush 纯函数，
// 在隔离环境中求值并断言不变量（XZ 整数圆盘几何、流体列/掉落集语义、擦除清流体列）。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
function extractFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n\\}\\r?\\n');
  const m = src.match(re);
  if(!m) throw new Error('找不到函数 ' + name);
  return m[0];
}
const applyCylinderBrush = eval('(' + extractFn('applyCylinderBrush') + ')');
const eraseCylinderBrush = eval('(' + extractFn('eraseCylinderBrush') + ')');
const cylinderPoints = eval('(' + extractFn('cylinderPoints') + ')');
const cylinderInside = eval('(' + extractFn('cylinderInside') + ')');
const writeVoxel = eval('(' + extractFn('writeVoxel') + ')');
const clearVoxel = eval('(' + extractFn('clearVoxel') + ')');

// ---- 依赖（与真实环境一致的最小集）----
const key = (x,y,z)=> x+','+y+','+z;
const wkey = (x,z)=> x+','+z;
const FALL = new Set(['sand','gravel']);
const PALETTE = { grass:1, dirt:2, stone:3, sand:4, gravel:5, water:6, lava:7, wood:8, leaf:9, snow:10 };

// ---- 放置：实心 半径1 高1 => 单格 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'grass', 1, 1, FALL, key, wkey, PALETTE);
  ok('r1h1 单格写入 edits', edits.get('0,0,0') === 1);
  ok('r1h1 共 1 格', edits.size === 1);
  ok('r1h1 不触碰流体列', waterCol.size===0 && lavaCol.size===0);
  ok('r1h1 不入掉落集', !falling.has('0,0,0'));
}
// ---- 半径2 高1 => 3x3=9 格（圆盘几何 dx²+dz²<=4）----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'grass', 2, 1, FALL, key, wkey, PALETTE);
  ok('r2h1 共 9 格', edits.size === 9);
  ok('r2h1 角点(1,1)在内', edits.has('1,0,1'));
  ok('r2h1 边界(2,0)不在环内', !edits.has('2,0,0'));
}
// ---- 半径2 高3 => 9*3=27 格 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'grass', 2, 3, FALL, key, wkey, PALETTE);
  ok('r2h3 共 27 格', edits.size === 27);
  ok('r2h3 顶层 y=2 存在', edits.has('0,2,0'));
  ok('r2h3 底层 y=0 存在', edits.has('0,0,0'));
}
// ---- water 笔刷 r1 h2：液面 top = ny+h = 2 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'water', 1, 2, FALL, key, wkey, PALETTE);
  ok('water r1h2 液面 top=2', waterCol.get('0,0') === 2);
  ok('water r1h2 不写 edits', edits.size === 0);
}
// ---- water 笔刷 r2 h1：9 列，top=ny+1 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,5,0, 'water', 2, 1, FALL, key, wkey, PALETTE);
  ok('water r2h1 列数=9', waterCol.size === 9);
  ok('water r2h1 top=6', waterCol.get('0,0') === 6 && waterCol.get('1,1') === 6);
}
// ---- lava 笔刷 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'lava', 1, 1, FALL, key, wkey, PALETTE);
  ok('lava r1h1 进入 lavaCol 列', lavaCol.get('0,0') === 1);
}
// ---- 沙(掉落物) r2 h1：9 格全入掉落集 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'sand', 2, 1, FALL, key, wkey, PALETTE);
  ok('sand r2h1 写 9 格', edits.size === 9);
  ok('sand r2h1 全入掉落集', falling.size === 9);
}
// ---- 擦除：清空圆柱内全部方块为 null ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'grass', 2, 1, FALL, key, wkey, PALETTE);
  eraseCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 2, 1, key, wkey);
  ok('erase r2h1 全部置空', edits.size === 9 && [...edits.values()].every(v=> v===null));
  ok('erase r2h1 清空掉落集', falling.size === 0);
}
// ---- 擦除：清除命中的流体列（顶面 y+1 匹配）----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  waterCol.set('0,0', 2);                 // 液面在 y=1（ny=0,h=2 => top=2）
  eraseCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 1, 2, key, wkey);
  ok('erase 清除命中的水列', !waterCol.has('0,0'));
}
// ---- 半径3：圆盘外角点(2,2)在内(2²+2²=8<=9) ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyCylinderBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'grass', 3, 1, FALL, key, wkey, PALETTE);
  ok('r3h1 角点(2,2)在内', edits.has('2,0,2'));
  ok('r3h1 共 25 格(5x5 全在 r²=9 内)', edits.size === 25);
}
// ---- 源码接线 ----
ok('editAt 分发 brushShape=cylinder(放置)', /brushShape === 'cylinder'\) applyCylinderBrush/.test(src));
ok('editAt 分发 brushShape=cylinder(擦除)', /brushShape === 'cylinder'\) eraseCylinderBrush/.test(src));

console.log(`[VoxelForge cylinder] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
