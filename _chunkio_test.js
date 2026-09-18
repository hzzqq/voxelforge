// VoxelForge 区块化持久化测试：抽取真实 splitChunks / serializeChunk / deserializeChunk / mergeChunks。
// 覆盖：正负坐标 floor 分桶、边界含头不含尾、3D/2D 键分流、坏键跳过、
// serializeChunk 结构、deserializeChunk 校验（chunk 名/跨区块键/坏键/坏值）、
// mergeChunks 合并与覆盖语义、切分→序列化→反序列化→合并的往返保真、UI 静态接线。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const NODE = process.execPath;
const dir = __dirname;
let pass = 0, fail = 0;
const ok = (n, c)=> c ? pass++ : (fail++, console.log('  FAIL', n));

const src = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

// 0) ESM 语法检查（房屋惯例：voxel main.js 为 ESM，stdin 重定向）
try {
  execSync(`"${NODE}" --check --input-type=module < "${path.join(dir, 'main.js')}"`, { shell: true });
  ok('main.js ESM 语法 OK', true);
} catch(e){ ok('main.js ESM 语法 OK', false); console.log(e.stderr?.toString()); }

// brace 计数抽取（CRLF 免疫）
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

// ---- 烘焙四个纯函数（splitChunks 引用全局 ckey，注入同名形参）----
let mod = null;
try {
  const bake = new Function('ckey',
    extractFn('splitChunks') + '\n' + extractFn('serializeChunk') + '\n' +
    extractFn('deserializeChunk') + '\n' + extractFn('mergeChunks') +
    '\nreturn { splitChunks, serializeChunk, deserializeChunk, mergeChunks };');
  mod = bake((cx, cz)=> cx + ',' + cz);
  ok('四个函数抽取烘焙成功', !!mod && typeof mod.splitChunks === 'function');
} catch(e){ ok('四个函数抽取烘焙成功', false); console.log('  ', e.message); }

if(mod){
  const { splitChunks, serializeChunk, deserializeChunk, mergeChunks } = mod;
  const S = 16;   // 与 main.js CHUNK=16 一致
  const mapOf = pairs => new Map(pairs);

  // ---- splitChunks 分桶 ----
  const edits = mapOf([
    ['5,10,7', 1],      // chunk 0,0
    ['15,10,15', 2],    // chunk 0,0（含头不含尾：15 < 16）
    ['16,10,0', 3],     // chunk 1,0（16 归下一块）
    ['20,10,3', 4],     // chunk 1,0
    ['-1,10,-1', 5],    // chunk -1,-1（floor 负坐标）
    ['-16,10,0', 6],    // chunk -1,0
    ['-17,10,0', 7],    // chunk -2,0
    ['1.5,10,0', 8],    // 非整数 x → 跳过
    ['9,9', 9],         // 2 段键混入 edits → 跳过
    [null, 10]          // 非字符串键 → 跳过（split 前置崩溃风险）
  ]);
  const water = mapOf([['5,7', 12], ['40,3', 13]]);    // chunk 0,0 / chunk 2,0
  const lava  = mapOf([['-1,-1', 14]]);                // chunk -1,-1
  let groups = null;
  try { groups = splitChunks(edits, water, lava, S); ok('splitChunks 执行成功', groups instanceof Map); }
  catch(e){ ok('splitChunks 执行成功', false); console.log('  ', e.message); }

  if(groups){
    const g00 = groups.get('0,0'), g10 = groups.get('1,0'), gnx = groups.get('-1,-1');
    ok('正坐标分桶 0,0 含 (5,15) 两编辑', g00 && g00.edits.size === 2 && g00.edits.get('5,10,7') === 1);
    ok('边界 x=15 归本块 x=16 归下块', g00.edits.has('15,10,15') && g10 && g10.edits.has('16,10,0'));
    ok('同区块 x=20 汇入 1,0', g10.edits.get('20,10,3') === 4);
    ok('负坐标 floor 分桶 -1,-1', gnx && gnx.edits.get('-1,10,-1') === 5 && gnx.lava.get('-1,-1') === 14);
    ok('x=-16 归 -1,0 / x=-17 归 -2,0', groups.get('-1,0')?.edits.get('-16,10,0') === 6 && groups.get('-2,0')?.edits.get('-17,10,0') === 7);
    ok('非整数/段数不符键被跳过', ![...edits.keys()].length || (!g00.edits.has('1.5,10,0') && !g00.edits.has('9,9')));
    ok('2D 键分流到 water/lava 槽', g00.water.get('5,7') === 12 && groups.get('2,0').water.get('40,3') === 13);
    ok('三槽互不串桶', g00.lava.size === 0 && gnx.water.size === 0 && g10.lava.size === 0);
    ok('空输入得空分组', splitChunks(new Map(), new Map(), new Map(), S).size === 0);
  }

  // ---- serializeChunk / deserializeChunk ----
  if(groups && groups.get('0,0')){
    const data = serializeChunk('0,0', groups.get('0,0'));
    ok('serializeChunk 结构 v/chunk/数组化', data.v === 1 && data.chunk === '0,0' &&
      Array.isArray(data.edits) && Array.isArray(data.water) && Array.isArray(data.lava));
    const back = deserializeChunk(data, S);
    ok('单区块往返还原', back && back.name === '0,0' && back.edits.size === 2 &&
      back.edits.get('5,10,7') === 1 && back.water.get('5,7') === 12);
  }
  ok('缺 chunk 字段拒绝', deserializeChunk({ v:1, edits:[] }, S) === null);
  ok('chunk 名非两段整数拒绝', deserializeChunk({ chunk:'a,b' }, S) === null &&
    deserializeChunk({ chunk:'1,2,3' }, S) === null && deserializeChunk({ chunk:'1.5,0' }, S) === null);
  ok('非对象/无名输入拒绝', deserializeChunk(null, S) === null && deserializeChunk(42, S) === null);
  const cross = deserializeChunk({ chunk:'0,0', edits:[['20,10,0', 9], ['5,10,5', 1]] }, S);
  ok('跨区块键被过滤（防污染）', cross && cross.edits.size === 1 && cross.edits.get('5,10,5') === 1 && !cross.edits.has('20,10,0'));
  const bad = deserializeChunk({ chunk:'0,0', edits:[['x,y,z', 1], ['1,1,1', NaN], ['2,2,2', null]] }, S);
  ok('坏键/NaN 值过滤，null 保留（挖空占位）', bad && bad.edits.size === 1 && bad.edits.has('2,2,2') && bad.edits.get('2,2,2') === null);
  const nonarr = deserializeChunk({ chunk:'0,0', edits:'oops', water:{}, lava:3 }, S);
  ok('非数组字段不炸返回空 Map', nonarr && nonarr.edits.size === 0 && nonarr.water.size === 0 && nonarr.lava.size === 0);

  // ---- mergeChunks 合并语义 ----
  const mA = mergeChunks([{ name:'0,0', edits: mapOf([['1,1,1', 5]]), water: mapOf([['1,1', 3]]), lava: new Map() }]);
  ok('mergeChunks 单块合并', mA.edits.get('1,1,1') === 5 && mA.waterCol.get('1,1') === 3);
  const mB = mergeChunks([
    { name:'0,0', edits: mapOf([['1,1,1', 5], ['2,2,2', 6]]), water: new Map(), lava: new Map() },
    { name:'1,0', edits: mapOf([['1,1,1', 99]]), water: new Map(), lava: new Map() }
  ]);
  ok('同键后者覆盖（增量补丁语义）', mB.edits.get('1,1,1') === 99 && mB.edits.get('2,2,2') === 6);
  const mE = mergeChunks([]);
  ok('空列表得三张空 Map', mE.edits.size === 0 && mE.waterCol.size === 0 && mE.lavaCol.size === 0);
  ok('null 列表安全', (()=>{ const r = mergeChunks(null); return r && r.edits.size === 0; })());

  // ---- 往返保真：全局三张 Map → 切分 → 序列化 → 反序列化 → 合并 === 原始 ----
  const srcEdits = mapOf([['5,10,7',1], ['-1,10,-1',null], ['33,10,33',2], ['16,10,16',3]]);
  const srcWater = mapOf([['5,7',12], ['-20,3',4]]);
  const srcLava  = mapOf([['-1,-1',14], ['17,0',1]]);
  const gs = splitChunks(srcEdits, srcWater, srcLava, S);
  const round = mergeChunks([...gs.entries()].map(([name, g]) => deserializeChunk(serializeChunk(name, g), S)));
  ok('往返保真 edits（含 null 值）', round.edits.size === srcEdits.size &&
    [...srcEdits].every(([k,v]) => round.edits.get(k) === v));
  ok('往返保真 water/lava', round.waterCol.size === srcWater.size &&
    [...srcWater].every(([k,v]) => round.waterCol.get(k) === v) &&
    round.lavaCol.size === srcLava.size && [...srcLava].every(([k,v]) => round.lavaCol.get(k) === v));
  ok('切分无遗漏（组数与归属正确）', gs.size === 6 &&
    ['0,0','-1,-1','2,2','1,1','-2,0','1,0'].every(n => gs.has(n)));
}

// ---- 静态接线守卫 ----
ok('exportChunk 按钮已绑定 handler', src.includes("$('exportChunk').onclick"));
ok('导出走 splitChunks+serializeChunk（视线中心区块）',
  src.includes('splitChunks(edits, waterCol, lavaCol, CHUNK)') && src.includes('serializeChunk(name, g)'));
ok('导入分流：带 chunk 字段走合并', /typeof d\.chunk === 'string'[\s\S]{0,120}deserializeChunk\(d, CHUNK\)/.test(src));
ok('区块合并入撤销栈（recordUndo）', /deserializeChunk\(d, CHUNK\)[\s\S]{0,400}recordUndo\(prevEdits\)/.test(src));
ok('index.html 已加导出区块按钮', html.includes('id="exportChunk"'));
ok('按钮 title 说明增量语义', /id="exportChunk"[^>]*title="[^"]*合并/.test(html));

console.log(`[VoxelForge chunkIO] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
