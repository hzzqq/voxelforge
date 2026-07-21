// ci138 VoxelForge 散布形笔刷 —— 忠实移植 applyScatterBrush 的「球内 + 密度阈值」确定性几何 + 源码接线检查
// 关键：用 hash01(x,y,z) 映射 [0,1)，仅当 hash01 < density 才落块 → 同坐标同结果(可复现，无需外部 RNG)
'use strict';
const fs = require('fs');
const path = require('path');

// 与 main.js 完全一致的确定性伪随机
function hash01(x, y, z){
  let h = (Math.imul(x|0, 374761393) ^ Math.imul(y|0, 668265263) ^ Math.imul(z|0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

// 忠实移植 applyScatterBrush：返回被放置的 (x,y,z) 键集合(相对中心 nx,ny,nz)
function scatterCells(nx, ny, nz, radius, density){
  const r = Math.max(1, radius|0);
  const d = (density == null) ? 0.35 : Math.max(0, Math.min(1, density));
  const set = new Set();
  for(let dx=-r+1; dx<r; dx++) for(let dy=-r+1; dy<r; dy++) for(let dz=-r+1; dz<r; dz++){
    if(dx*dx + dy*dy + dz*dz > r*r) continue;        // 球外剔除
    if(hash01(nx+dx, ny+dy, nz+dz) >= d) continue;   // 低于密度阈值跳过
    set.add(`${nx+dx},${ny+dy},${nz+dz}`);
  }
  return set;
}

// 球内总格数(用于「密度=1 必填满整球」断言)
function sphereTotal(r){ const rr=Math.max(1,r|0); let t=0; for(let dx=-rr+1;dx<rr;dx++)for(let dy=-rr+1;dy<rr;dy++)for(let dz=-rr+1;dz<rr;dz++){ if(dx*dx+dy*dy+dz*dz<=rr*rr)t++; } return t; }

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 密度 = 1.0 → 球内全部填满(确定性上界)
{
  const c = scatterCells(0,0,0,2,1.0);
  ok(c.size === sphereTotal(2), 'scatter density=1 fills whole sphere r2 (27 cells), got ' + c.size);
  const c3 = scatterCells(0,0,0,3,1.0);
  ok(c3.size === sphereTotal(3), 'scatter density=1 fills whole sphere r3 (117 cells), got ' + c3.size);
}

// 2. 密度 = 0.0 → 一格不落(确定性下界)
{
  const c = scatterCells(0,0,0,3,0.0);
  ok(c.size === 0, 'scatter density=0 places nothing, got ' + c.size);
}

// 3. 默认密度 0.35 的精确计数(确定性回归值)
{
  const c2 = scatterCells(0,0,0,2,0.35);
  ok(c2.size === 9, 'scatter r2 d0.35 = 9 of 27, got ' + c2.size);
  const c3 = scatterCells(0,0,0,3,0.35);
  ok(c3.size === 30, 'scatter r3 d0.35 = 30 of 117, got ' + c3.size);
  ok(c2.size < sphereTotal(2) && c3.size < sphereTotal(3), 'mid density places fewer than full sphere');
}

// 4. 半径下限 1：球退化为单格，密度 0.5 下确定性(该格 hash01(5,5,5)<0.5 为真)
{
  const c = scatterCells(5,5,5,1,0.5);
  ok(c.size === 1 && c.has('5,5,5'), 'scatter r=1 single cell placed (hash01(5,5,5)<0.5), got ' + c.size);
}

// 5. 几何边界：任何被落块格都在球内(无超球格)
{
  const c = scatterCells(10,20,30,3,0.8);
  let outside = 0;
  for(const k of c){ const [x,y,z]=k.split(',').map(Number); const dx=x-10,dy=y-20,dz=z-30; if(dx*dx+dy*dy+dz*dz>9) outside++; }
  ok(outside === 0, 'scatter never places outside sphere');
}

// 6. 确定性：同输入同输出(可复现)
{
  const a = scatterCells(7,7,7,3,0.35), b = scatterCells(7,7,7,3,0.35);
  ok(a.size === b.size && [...a].every(k=>b.has(k)), 'scatter is deterministic for same inputs');
}

// 7. 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyScatterBrush\(/.test(main), 'main.js defines applyScatterBrush');
ok(/function eraseScatterBrush\(/.test(main), 'main.js defines eraseScatterBrush');
ok(/brushShape === 'scatter'\) applyScatterBrush\(/.test(main), 'editAt apply path dispatches scatter');
ok(/brushShape === 'scatter'\) eraseScatterBrush\(/.test(main), 'editAt erase path dispatches scatter');
ok(/hash01\(nx\+dx, ny\+dy, nz\+dz\) >= d/.test(main), 'applyScatterBrush uses hash01 density gate');
ok(/let mode = 'add', brush = 'grass', brushSize = 1, boomR = 3, brushShape = 'box', scatterDensity = 0\.35;/.test(main), 'scatterDensity global default 0.35 declared');
ok(/<option value="scatter">/.test(html), 'index.html brushShape has scatter option');
ok(/id="scatterD"/.test(html) && /id="scatterDVal"/.test(html), 'index.html has scatter density slider');
ok(/\$\('scatterD'\)\.oninput/.test(main), 'main.js binds scatter density slider');
ok(/brushShape === 'scatter' \? '笔刷形状：散布形'/.test(main), 'brushShape label includes 散布形');

console.log('voxel-world/_scatter_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
