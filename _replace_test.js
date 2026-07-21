// VoxelForge 批量换方块单元测试：从 main.js 抽取真实 replaceType 纯函数，
// 在隔离环境中求值并断言不变量。
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
const replaceType = eval('(' + extractFn('replaceType') + ')');

// 与真实环境一致的最小调色板（值用自然数便于断言）
const PALETTE = { grass:1, dirt:2, stone:3, sand:4, gravel:5, wood:8, leaf:9, iron:11, gold:12, diamond:13, coal:14 };

// 构造一份 edits：含 grass×2 / stone×1 / 空值×1 / 其他×1
function buildEdits(){
  const m = new Map();
  m.set('0,0,0', PALETTE.grass);
  m.set('1,0,0', PALETTE.grass);
  m.set('0,1,0', PALETTE.stone);
  m.set('0,0,1', null);
  m.set('2,0,0', PALETTE.dirt);
  return m;
}

// 1. 所有 fromType 被替换
{
  const e = buildEdits();
  const n = replaceType(e, 'grass', 'stone', PALETTE);
  ok('grass→stone 命中两格', n.get('0,0,0') === PALETTE.stone && n.get('1,0,0') === PALETTE.stone);
  ok('原 stone 保持不变', n.get('0,1,0') === PALETTE.stone);
}
// 2. 非匹配颜色与空值原样保留
{
  const e = buildEdits();
  const n = replaceType(e, 'grass', 'stone', PALETTE);
  ok('空值(null)保留', n.get('0,0,1') === null);
  ok('其他颜色(dirt)保留', n.get('2,0,0') === PALETTE.dirt);
  ok('未替换项数量正确(5格)', n.size === 5);
}
// 3. 替换数量正确
{
  const e = buildEdits();
  const n = replaceType(e, 'grass', 'stone', PALETTE);
  let stoneCount = 0; for(const v of n.values()) if(v === PALETTE.stone) stoneCount++;
  ok('stone 总数=3(原1+替换2)', stoneCount === 3);
}
// 4. 不修改原 Map（返回新 Map）
{
  const e = buildEdits();
  const before = JSON.stringify([...e.entries()]);
  const n = replaceType(e, 'grass', 'stone', PALETTE);
  ok('原 Map 未被修改', JSON.stringify([...e.entries()]) === before);
  ok('返回新 Map 实例', n !== e);
}
// 5. from 不在 edits 中 → 原样返回（无副作用）
{
  const e = buildEdits();
  const n = replaceType(e, 'wood', 'leaf', PALETTE);
  ok('无匹配时全部保留', n.get('0,0,0') === PALETTE.grass && n.get('2,0,0') === PALETTE.dirt && n.size === 5);
}
// 6. 空 edits → 空结果
{
  const e = new Map();
  const n = replaceType(e, 'grass', 'stone', PALETTE);
  ok('空输入→空输出', n.size === 0);
}
// 7. 反向替换亦可（stone→grass）
{
  const e = buildEdits();
  const n = replaceType(e, 'stone', 'grass', PALETTE);
  ok('stone→grass 命中', n.get('0,1,0') === PALETTE.grass);
  ok('grass 仍为 grass', n.get('0,0,0') === PALETTE.grass);
}

console.log(`[VoxelForge replaceType] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
