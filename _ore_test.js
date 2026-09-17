// VoxelForge 矿脉富集单元测试：从 main.js 抽取真实 enrichOre 纯函数，
// 在隔离环境中求值并断言不变量。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
// brace 计数抽取（CRLF 免疫）：main.js 为 CRLF 时，基于 \n\}\n 的正则会抽取失败，改用逐字符括号配对（同 ci458 _brush_test.js）。
function extractFn(name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('找不到函数 ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for(; i < src.length; i++){
    const c = src[i];
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(start, i+1); }
  }
  throw new Error('函数 ' + name + ' 括号不匹配');
}
const enrichOre = eval('(' + extractFn('enrichOre') + ')');

// 与真实环境一致的最小调色板（值用自然数便于断言）
const PALETTE = { grass:1, dirt:2, stone:3, sand:4, gravel:5, wood:8, leaf:9, iron:11, gold:12, diamond:13, coal:14 };
const key = (x,y,z)=> x+','+y+','+z;

// 构造：iron 在 (5,5,5)，其 6 邻域均为石头，外加远处一块不相干的石头
function build(){
  const m = new Map();
  m.set(key(5,5,5), PALETTE.iron);
  // 6 邻域
  m.set(key(6,5,5), PALETTE.stone);
  m.set(key(4,5,5), PALETTE.stone);
  m.set(key(5,6,5), PALETTE.stone);
  m.set(key(5,4,5), PALETTE.stone);
  m.set(key(5,5,6), PALETTE.stone);
  m.set(key(5,5,4), PALETTE.stone);
  // 远处不相邻的石头与草（不应变化）
  m.set(key(0,0,0), PALETTE.stone);
  m.set(key(1,1,1), PALETTE.grass);
  return m;
}

// 1. 邻域石头被富集为 iron
{
  const e = build();
  const n = enrichOre(e, 'iron', key, PALETTE);
  ok('相邻石头(6,5,5)→iron', n.get(key(6,5,5)) === PALETTE.iron);
  ok('相邻石头(4,5,5)→iron', n.get(key(4,5,5)) === PALETTE.iron);
  ok('相邻石头(5,6,5)→iron', n.get(key(5,6,5)) === PALETTE.iron);
  ok('相邻石头(5,4,5)→iron', n.get(key(5,4,5)) === PALETTE.iron);
  ok('相邻石头(5,5,6)→iron', n.get(key(5,5,6)) === PALETTE.iron);
  ok('相邻石头(5,5,4)→iron', n.get(key(5,5,4)) === PALETTE.iron);
}
// 2. 原矿与远处块不变
{
  const e = build();
  const n = enrichOre(e, 'iron', key, PALETTE);
  ok('原 iron 仍在', n.get(key(5,5,5)) === PALETTE.iron);
  ok('远处石头(0,0,0)不变', n.get(key(0,0,0)) === PALETTE.stone);
  ok('远处草(1,1,1)不变', n.get(key(1,1,1)) === PALETTE.grass);
}
// 3. 富集数量正确（6 个邻域石头变矿）
{
  const e = build();
  const n = enrichOre(e, 'iron', key, PALETTE);
  let ironCount = 0; for(const v of n.values()) if(v === PALETTE.iron) ironCount++;
  ok('iron 总数=7(原1+邻6)', ironCount === 7);
}
// 4. 不修改原 Map（返回新 Map）
{
  const e = build();
  const before = JSON.stringify([...e.entries()].sort());
  const n = enrichOre(e, 'iron', key, PALETTE);
  ok('原 Map 未修改', JSON.stringify([...e.entries()].sort()) === before);
  ok('返回新 Map 实例', n !== e);
}
// 5. 选 gold 仅富集 gold 邻域（iron 邻域不响应）
{
  const e = build();
  const n = enrichOre(e, 'gold', key, PALETTE);
  ok('iron 邻域未被 gold 富集', n.get(key(6,5,5)) === PALETTE.stone);
  ok('iron 本身保持 iron', n.get(key(5,5,5)) === PALETTE.iron);
}
// 6. 无矿时富集无副作用
{
  const e = new Map([[key(0,0,0), PALETTE.stone], [key(1,1,1), PALETTE.grass]]);
  const n = enrichOre(e, 'iron', key, PALETTE);
  ok('无矿时石头不变', n.get(key(0,0,0)) === PALETTE.stone);
  ok('无矿时草不变', n.get(key(1,1,1)) === PALETTE.grass);
}

console.log(`[VoxelForge enrichOre] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
