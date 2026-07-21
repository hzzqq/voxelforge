// VoxelForge 笔刷单元测试：从 main.js 抽取真实 applyBrush / eraseBrush 纯函数，
// 在隔离环境中求值并断言不变量（含修复的 water 流体 bug 与擦除清流体列）。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
function extractFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}\\n');
  const m = src.match(re);
  if(!m) throw new Error('找不到函数 ' + name);
  return m[0];
}
const applyBrush = eval('(' + extractFn('applyBrush') + ')');
const eraseBrush = eval('(' + extractFn('eraseBrush') + ')');

// ---- 依赖（与真实环境一致的最小集）----
const key = (x,y,z)=> x+','+y+','+z;
const wkey = (x,z)=> x+','+z;
const FALL = new Set(['sand','gravel']);
const PALETTE = { grass:1, dirt:2, stone:3, sand:4, gravel:5, water:6, lava:7, wood:8, leaf:9, snow:10 };

// ---- 放置：实心 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'grass', 1, FALL, key, wkey, PALETTE);
  ok('grass 单格写入 edits', edits.get('0,0,0') === 1);
  ok('grass 不触碰流体列', waterCol.size===0 && lavaCol.size===0);
  ok('grass 不入掉落集', !falling.has('0,0,0'));
}
// ---- 修复：water 笔刷应生成流体列，而非实心蓝块 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyBrush(edits, waterCol, lavaCol, falling, 0,5,0, 'water', 1, FALL, key, wkey, PALETTE);
  ok('water 进入 waterCol 列', waterCol.get('0,0') === 6);       // top = ny+size = 5+1
  ok('water 不写 edits(非实心)', !edits.has('0,0,0'));             // 修复点
  ok('water 不写 lavaCol', lavaCol.size === 0);
}
// ---- water 笔刷 size=2：2x2 列、top=ny+2 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyBrush(edits, waterCol, lavaCol, falling, 0,5,0, 'water', 2, FALL, key, wkey, PALETTE);
  ok('water size2 列数=4', waterCol.size === 4);
  ok('water size2 top=7', waterCol.get('0,0') === 7 && waterCol.get('1,1') === 7);
  ok('water size2 仍不写 edits', edits.size === 0);
}
// ---- lava 笔刷 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyBrush(edits, waterCol, lavaCol, falling, 0,5,0, 'lava', 1, FALL, key, wkey, PALETTE);
  ok('lava 进入 lavaCol 列', lavaCol.get('0,0') === 6);
}
// ---- 沙(掉落物) size=2：8 格 + 掉落集 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  applyBrush(edits, waterCol, lavaCol, falling, 0,0,0, 'sand', 2, FALL, key, wkey, PALETTE);
  ok('sand size2 写 8 格', edits.size === 8);
  ok('sand size2 全入掉落集', falling.size === 8);
}
// ---- 擦除：清除命中的流体列 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  waterCol.set('0,0', 1);                 // 表面在 y=0
  edits.set('0,0,0', 99);
  eraseBrush(edits, waterCol, lavaCol, falling, 0,0,0, 1, key, wkey);
  ok('erase 清除命中的水列', !waterCol.has('0,0'));   // 修复点
  ok('erase 置空 edits', edits.get('0,0,0') === null);
}
// ---- 擦除：不误删无关流体列（不同高度）----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  waterCol.set('0,0', 1);                 // 表面 y=0
  eraseBrush(edits, waterCol, lavaCol, falling, 0,5,0, 1, key, wkey);  // 擦 y=5
  ok('erase 不误删不同高度水列', waterCol.has('0,0'));
}
// ---- 擦除 size=2 覆盖两层水表面 ----
{
  const edits=new Map(), waterCol=new Map(), lavaCol=new Map(), falling=new Set();
  waterCol.set('0,0', 1); waterCol.set('0,0', 2);  // 两层
  eraseBrush(edits, waterCol, lavaCol, falling, 0,0,0, 2, key, wkey);
  ok('erase size2 清掉两层水列', !waterCol.has('0,0'));
}

console.log(`[VoxelForge brush] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
