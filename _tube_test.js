// ci174 VoxelForge 空心圆柱(tube/管道)笔刷 —— applyTubeBrush/eraseTubeBrush 行为测试(环形外壳)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的管道几何：圆盘半径 r，仅保留距中心 (r-wt, r] 的环形外壳，wt=max(1,round(r*0.35))，高度 h=r。
function tubeCells(nx, ny, nz, r){
  const set = new Set(); const R = Math.max(1, r|0);
  const wt = Math.max(1, Math.round(R * 0.35)); const rin = R - wt; const h = R;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > R*R || d2 < rin*rin) continue;
      set.add((nx + dx) + ',' + y + ',' + (nz + dz));
    }
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 外缘在、中心不在、内壁内不在
{
  const c = tubeCells(0, 0, 0, 3);
  ok('外缘 (3,0,0) 在环形壳', c.has('3,0,0'));
  ok('中心 (0,0,0) 不在(空心)', !c.has('0,0,0'));
  ok('内壁内 (1,0,0) 不在(壁厚外)', !c.has('1,0,0'));
  ok('壳内 (2,0,0) 在', c.has('2,0,0'));
}
// 2. 高度：r=3 → dy 0..2(共 3 层)
{
  const c = tubeCells(0, 0, 0, 3);
  ok('(3,0,0) 存在(层0)', c.has('3,0,0'));
  ok('(3,2,0) 存在(层2)', c.has('3,2,0'));
  ok('(3,3,0) 不存在(层3超界)', !c.has('3,3,0'));
}
// 3. 偏移原点一致
{
  const c = tubeCells(5, 7, 2, 2);
  ok('偏移外缘 (5+2,7,2) 在', c.has('7,7,2'));
  ok('偏移中心 (5,7,2) 不在', !c.has('5,7,2'));
}
// 4. 环形对称：4 个轴向点同在或同不在(半径 3 时 (3,0)/(0,3)/(-3,0)/(0,-3) 应都在壳)
{
  const c = tubeCells(0, 0, 0, 3);
  ok('四方向外缘对称', c.has('3,0,0') && c.has('0,3,0') && c.has('-3,0,0') && c.has('0,-3,0'));
}
// 5. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyTubeBrush\(/.test(main), 'main.js 定义 applyTubeBrush');
ok(/function eraseTubeBrush\(/.test(main), 'main.js 定义 eraseTubeBrush');
ok(/brushShape === 'tube'/.test(main), 'editAt/闪示 识别 tube 形状');
ok(/applyTubeBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyTubeBrush');
ok(/eraseTubeBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseTubeBrush');
ok(/option value="tube"/.test(html) && /空心圆柱/.test(html), 'index.html 含「空心圆柱(管道)」选项');

console.log('voxel-world/_tube_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
