// ci170 VoxelForge 三棱柱(prism)笔刷 —— applyPrismBrush/erasePrismBrush 行为测试(等边三角形截面竖向塔)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的三棱柱几何：以 r 为外接半径的等边三角形(顶点朝上)截面，沿 y 填充 height(=r) 格。
function prismCells(nx, ny, nz, r){
  const set = new Set(); const R = Math.max(1, r|0);
  const ax = 0, az = R, bx = -R * Math.sqrt(3) / 2, bz = -R / 2, cx = R * Math.sqrt(3) / 2, cz = -R / 2;
  const sign = (px, pz, qx, qz, rx, rz)=> (px - rx) * (qz - rz) - (qx - rx) * (pz - rz);
  for(let dy = 0; dy < R; dy++){
    const y = ny + dy;
    for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
      const d1 = sign(dx, dz, ax, az, bx, bz), d2 = sign(dx, dz, bx, bz, cx, cz), d3 = sign(dx, dz, cx, cz, ax, az);
      if((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
      set.add((nx + dx) + ',' + y + ',' + (nz + dz));
    }
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 基本性质：顶点(0, ny+R, 0)与底面中心(0,ny,0)在三角形内；四角(±R,ny,±R)在三角形外
{
  const c = prismCells(0, 0, 0, 3);
  ok('顶点 (0,3,0) 在三角形内', c.has('0,3,0'));
  ok('底心 (0,0,0) 在三角形内', c.has('0,0,0'));
  ok('外角 (3,0,3) 不在三角形内', !c.has('3,0,3'));
  ok('外角 (-3,0,3) 不在三角形内', !c.has('-3,0,3'));
  ok('外角 (3,0,-3) 不在三角形内', !c.has('3,0,-3'));
}
// 2. 高度：r=3 从 ny=0 到 ny=2(高度 r=3 => dy<3 => 0..2)，每列高度 3
{
  const c = prismCells(0, 0, 0, 3);
  ok('(0,0,0) 存在', c.has('0,0,0'));
  ok('(0,2,0) 存在(最高层 dy=2)', c.has('0,2,0'));
  ok('(0,3,0) 不存在(dy<r=3，最高 dy=2)', !c.has('0,3,0'));
}
// 3. 偏移原点一致
{
  const c = prismCells(4, 6, 2, 2);
  ok('偏移顶点 (4,8,2) 存在', c.has('4,8,2'));
  ok('偏移底心 (4,6,2) 存在', c.has('4,6,2'));
}
// 4. 对称性：关于 x=0 轴对称(左右点数相同)
{
  const c = prismCells(0, 0, 0, 4);
  let left = 0, right = 0;
  for(const cell of c){ const [x] = cell.split(',').map(Number); if(x < 0) left++; else if(x > 0) right++; }
  ok('左右半平面对称', left === right);
}
// 5. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyPrismBrush\(/.test(main), 'main.js 定义 applyPrismBrush');
ok(/function erasePrismBrush\(/.test(main), 'main.js 定义 erasePrismBrush');
ok(/brushShape === 'prism'/.test(main), 'editAt/闪示 识别 prism 形状');
ok(/applyPrismBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyPrismBrush');
ok(/erasePrismBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 erasePrismBrush');
ok(/option value="prism"/.test(html) && /三棱柱/.test(html), 'index.html 含「三棱柱」选项');

console.log('voxel-world/_prism_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
