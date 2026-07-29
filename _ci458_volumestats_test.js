// ci458 验收：从 main.js 抽取 volumeStats 纯函数并断言体素统计正确性（CRLF 免疫 brace-count 抽取）。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2/node.exe';
const mainPath = path.join(__dirname, 'main.js');
const src = fs.readFileSync(mainPath, 'utf8');

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
const volumeStats = eval('(' + extractFn('volumeStats') + ')');

let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };
const mapOf = (obj)=>{ const m = new Map(); for(const k in obj) m.set(k, obj[k]); return m; };

// 空 edits
{
  const s = volumeStats(new Map());
  ok('空 edits 标记 empty', s.empty === true);
  ok('空 edits count=0', s.count === 0);
  ok('空 edits 体积=0', s.volume === 0 && s.width === 0 && s.height === 0 && s.depth === 0);
}
// 单格
{
  const s = volumeStats(mapOf({ '0,0,0': 1 }));
  ok('单格 count=1', s.count === 1);
  ok('单格 包围盒 0..0', s.minX===0&&s.maxX===0&&s.minY===0&&s.maxY===0&&s.minZ===0&&s.maxZ===0);
  ok('单格 尺寸 1x1x1 体积1', s.width===1&&s.height===1&&s.depth===1&&s.volume===1);
}
// 2x2x2 实心
{
  const m = new Map();
  for(let x=0;x<2;x++) for(let y=0;y<2;y++) for(let z=0;z<2;z++) m.set(`${x},${y},${z}`, 1);
  const s = volumeStats(m);
  ok('2x2x2 count=8', s.count === 8);
  ok('2x2x2 尺寸 2x2x2', s.width===2&&s.height===2&&s.depth===2);
  ok('2x2x2 体积=8', s.volume === 8);
}
// 擦除占位(null)不计入
{
  const s = volumeStats(mapOf({ '0,0,0': 1, '1,1,1': null, '2,2,2': null }));
  ok('含 null 占位只数实体', s.count === 1);
}
// 平移包围盒 + 扁平尺寸
{
  const s = volumeStats(mapOf({ '5,5,5': 1, '6,5,5': 1 }));
  ok('平移 minX=5 maxX=6', s.minX===5 && s.maxX===6);
  ok('平移 width=2 体积=2', s.width===2 && s.height===1 && s.depth===1 && s.volume===2);
}
// 坏键容错
{
  const s = volumeStats(mapOf({ 'badkey': 1, '0,0,0': 1 }));
  ok('坏键被跳过，只数合法键', s.count === 1);
}

try { execSync(`"${NODE}" --check "${mainPath}"`, { stdio:'pipe' }); }
catch(e){ fail++; console.log('  FAIL node --check main.js: ' + (e.stderr?e.stderr.toString():e.message)); }

console.log(`[VoxelForge volumeStats] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
