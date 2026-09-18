// VoxelForge 洞穴连通性测试：从 main.js 抽取真实 caveStats / carveLinks / bakeCaveLinks。
// 覆盖：N6 flood fill 分量统计（对角不连通）、孤岛占比 minComp 语义、窗口边界、
// 隧道 carve 形状（中心+头顶+水平四邻，dy=-1 不挖保地板、单格孤岛跳过）、
// bakeCaveLinks 编排（isAir 谓词合成、cavesOn 开关、结果写入生成期修正层）。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
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
const key = (x,y,z)=> x + ',' + y + ',' + z;
const N6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

let caveStats, carveLinks, bakeCaveLinks;
try {
  const bake = new Function('key','N6',
    extractFn('caveStats') + '\n' + extractFn('carveLinks') +
    '\nreturn { caveStats, carveLinks };');
  ({ caveStats, carveLinks } = bake(key, N6));
  ok('caveStats/carveLinks 抽取成功', true);
} catch(e){ ok('caveStats/carveLinks 抽取成功', false); console.log('  ', e.message); }

if(caveStats){
  // L 形连通 → 单分量
  const air1 = new Set([key(0,0,0), key(1,0,0), key(1,0,1)]);
  const s1 = caveStats((x,y,z)=> air1.has(key(x,y,z)), -2,2, -1,1, -2,2, 1);
  ok('L 形连通为单分量', s1.components === 1 && s1.largest === 3 && s1.totalAir === 3);
  ok('单分量孤岛占比 0', s1.islands === 0 && s1.islandRatio === 0);
  // 对角接触不连通（N6 面相邻）
  const air2 = new Set([key(0,0,0), key(1,0,1)]);
  const s2 = caveStats((x,y,z)=> air2.has(key(x,y,z)), -2,2, -1,1, -2,2, 1);
  ok('对角接触算两个分量', s2.components === 2 && s2.totalAir === 2);
  ok('minComp=1 时单格孤岛计入', s2.islands === 1 && Math.abs(s2.islandRatio - 0.5) < 1e-9);
  // 主分量 + 大小孤岛，minComp=2 只计大孤岛
  const air3 = new Set([key(0,0,0), key(1,0,0), key(2,0,0), key(10,0,0), key(10,0,1), key(20,0,0)]);
  const s3 = caveStats((x,y,z)=> air3.has(key(x,y,z)), -2,22, -1,1, -2,2, 2);
  ok('三分量统计', s3.components === 3 && s3.largest === 3 && s3.totalAir === 6);
  ok('minComp=2 滤掉单格孤岛', s3.islands === 2 && Math.abs(s3.islandRatio - 2/6) < 1e-9);
  ok('质心计算', Math.abs(s3.comps[0].cx - 1) < 1e-9 && Math.abs(s3.comps[0].cz) < 1e-9);
  // 空窗口
  const s4 = caveStats(()=> false, 0,3, 0,3, 0,3, 1);
  ok('空窗口全零', s4.components === 0 && s4.totalAir === 0 && s4.islandRatio === 0);
  // 窗口边界截断：相邻空气越界不算同分量
  const air5 = new Set([key(0,0,0), key(1,0,0)]);
  const s5 = caveStats((x,y,z)=> air5.has(key(x,y,z)), 0,0, -1,1, -1,1, 1);
  ok('窗口边界截断连通', s5.components === 1 && s5.largest === 1);
}

if(carveLinks){
  const carved = new Set();
  const carve = (x,y,z)=> carved.add(key(x,y,z));
  // 单分量直接返回 0
  const only = { comps: [{ size: 5, cx: 0, cy: 0, cz: 0 }] };
  ok('单分量不打通', carveLinks(only, carve) === 0 && carved.size === 0);
  // 主 + 大孤岛 + 单格孤岛
  carved.clear();
  const st = { comps: [
    { size: 10, cx: 0, cy: 0, cz: 0 },
    { size: 5, cx: 10, cy: 0, cz: 0 },
    { size: 1, cx: 20, cy: 0, cz: 0 }
  ] };
  const linked = carveLinks(st, carve);
  ok('打通大孤岛跳过单格孤岛', linked === 1);
  ok('隧道端点（孤岛质心）已挖', carved.has(key(10,0,0)));
  ok('隧道终点（主质心）已挖', carved.has(key(0,0,0)));
  ok('直线走廊连续（x=5 中点）', carved.has(key(5,0,0)));
  ok('头顶让位（2 格高可通行）', carved.has(key(10,1,0)));
  ok('水平加粗（拐角不卡身位）', carved.has(key(11,0,0)));
  ok('地板保留（dy=-1 不挖）', !carved.has(key(10,-1,0)));
  // 走廊连续性：x 0..10 每个 y=0,z=0 点都被覆盖
  let gap = 0;
  for(let x = 0; x <= 10; x++){ if(!carved.has(key(x,0,0))) gap++; }
  ok('走廊无断点', gap === 0);
}

// ---- bakeCaveLinks 编排（fake 地形栈验证 isAir 合成与开关语义） ----
try {
  const bake2 = new Function('key','N6','caveStats','carveLinks','heightAt','caveAt','cavesOn','CAVE_SCAN_R','caveLinks',
    extractFn('bakeCaveLinks') + '\nreturn bakeCaveLinks;');
  const H = 10;   // heightAt 恒 10 → 地下空气 = y < 8 且 caveAt
  // 大空腔 (0..5, 5..7, 0..5) + 远处小空腔 (20..22, 5..7, 20..22) → 两分量
  const fakeCave = (x,y,z)=> (x>=0&&x<=5&&y>=5&&y<=7&&z>=0&&z<=5) || (x>=20&&x<=22&&y>=5&&y<=7&&z>=20&&z<=22);
  const bakeIt = (caveFn, on)=> bake2(key, N6, caveStats, carveLinks, ()=>H, caveFn, on, 40, new Map())();
  const map1 = bakeIt(fakeCave, true);
  ok('孤岛场景 bake 出隧道层', map1.size > 0);
  ok('隧道穿过两质心中途', map1.has(key(12,6,12)) || map1.has(key(13,6,13)) || map1.has(key(12,7,12)));
  const map2 = bakeIt(fakeCave, true);
  ok('bake 幂等（重算不累积）', map2.size === map1.size);
  const map3 = bakeIt(fakeCave, false);
  ok('cavesOn=false 返回空层', map3.size === 0);
  // 单分量场景（全程连通）→ 空
  const allCave = (x,y,z)=> x>=0&&x<=30&&y>=5&&y<=7&&z>=0&&z<=30;
  const map4 = bakeIt(allCave, true);
  ok('连通场景 bake 空层', map4.size === 0);
} catch(e){ ok('bakeCaveLinks 编排', false); console.log('  ', e.message); }

console.log(`[VoxelForge caveLink] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
