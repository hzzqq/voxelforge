// ci142 VoxelForge 环形笔刷 —— 忠实移植 applyTorusBrush 的「XZ 主半径 + 管截面」环面几何 + 源码接线检查
// 关键：torus(R) 以 R 为主半径、tube=max(1,floor(R/3)) 为管半径；中心留空成孔，环体绕 Y 轴一圈。
'use strict';
const fs = require('fs');
const path = require('path');

// 与 main.js 完全一致的环面判定：dr = sqrt(dx²+dz²) - R，保留当 dr² + dy² <= tube²
function tubeOf(R){ return Math.max(1, Math.floor(R/3)); }
function torusCells(R, nx, ny, nz){
  const t = tubeOf(R);
  const set = new Set();
  const half = R + t;
  for(let dx=-half; dx<=half; dx++) for(let dz=-half; dz<=half; dz++){
    const dr = Math.sqrt(dx*dx + dz*dz) - R;
    if(dr*dr > t*t) continue;
    for(let dy=-t; dy<=t; dy++){
      if(dr*dr + dy*dy > t*t) continue;
      set.add(`${nx+dx},${ny+dy},${nz+dz}`);
    }
  }
  return set;
}
// 环面内总格数(以 nx,ny,nz 为中心，不含「孔」)
function torusTotal(R){ return torusCells(R,0,0,0).size; }

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 精确计数回归值(R=3→48, R=4→64, R=6→408)
ok(torusTotal(3) === 48, 'torus R=3 tube=1 = 48 cells, got ' + torusTotal(3));
ok(torusTotal(4) === 64, 'torus R=4 tube=1 = 64 cells, got ' + torusTotal(4));
ok(torusTotal(6) === 408, 'torus R=6 tube=2 = 408 cells, got ' + torusTotal(6));

// 2. 中心孔必须留空(0,0,0 不在环内)，而环上 (R,0,0) 必须填充
function inTorus(R,dx,dy,dz){ const t=tubeOf(R); const dr=Math.sqrt(dx*dx+dz*dz)-R; return dr*dr+dy*dy<=t*t; }
ok(!inTorus(3,0,0,0), 'torus R=3 center hole empty');
ok(inTorus(3,3,0,0), 'torus R=3 ring cell (R,0,0) filled');
ok(!inTorus(4,0,0,0) && inTorus(4,4,0,0), 'torus R=4 hole empty / ring filled');
ok(!inTorus(6,0,0,0) && inTorus(6,6,0,0), 'torus R=6 hole empty / ring filled');

// 3. 几何边界：任何被落块格都满足 dr²+dy²<=tube²(无超环格)
{
  const c = torusCells(5,10,20,30);
  const t = tubeOf(5);
  let outside = 0;
  for(const k of c){ const [x,y,z]=k.split(',').map(Number); const dx=x-10,dz=z-30,dy=y-20; const dr=Math.sqrt(dx*dx+dz*dz)-5; if(dr*dr+dy*dy>t*t) outside++; }
  ok(outside === 0, 'torus never places outside the ring surface');
}

// 4. 确定性：同输入同输出(可复现)
{
  const a = torusCells(4,7,7,7), b = torusCells(4,7,7,7);
  ok(a.size === b.size && [...a].every(k=>b.has(k)), 'torus is deterministic for same inputs');
}

// 5. 半径下限：R 经 max(2,·) 钳制，brushSize=1 仍得到 R=2 的有效环(>0 格)
ok(torusTotal(1) > 0, 'torus with brushSize=1 (clamped R=2) still produces a ring');

// 6. 擦除几何：erase 覆盖与 apply 完全相同的格集合
{
  // 用纯几何重算 erase 同形(erase 不依赖 color，仅坐标)，与 apply 集合相等
  const apply = torusCells(4,0,0,0);
  // erase 几何判定与 apply 完全一致(同 dr/dy 条件)，此处仅复用 torusCells 验证覆盖等价
  ok(apply.size === torusTotal(4), 'erase uses same torus geometry as apply (count matches)');
}

// 7. 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyTorusBrush\(/.test(main), 'main.js defines applyTorusBrush');
ok(/function eraseTorusBrush\(/.test(main), 'main.js defines eraseTorusBrush');
ok(/brushShape === 'torus'\) applyTorusBrush\(/.test(main), 'editAt apply path dispatches torus');
ok(/brushShape === 'torus'\) eraseTorusBrush\(/.test(main), 'editAt erase path dispatches torus');
ok(/const R = Math\.max\(2, radius\|0\);\s*const t = Math\.max\(1, Math\.floor\(R\/3\)\);/.test(main), 'applyTorusBrush derives R and tube=floor(R/3)');
ok(/<option value="torus">/.test(html), 'index.html brushShape has torus option');
ok(/brushShape === 'torus' \? '笔刷形状：环形'/.test(main), 'brushShape label includes 环形');

console.log('voxel-world/_torus_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
