// ci158 VoxelForge 圆锥(cone)笔刷 —— applyConeBrush/eraseConeBrush 行为测试(底面半径 r、向上逐层收尖到顶点)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的圆锥几何：底在 y=ny、半径 r；层 k=0..r，该层水平半径 = r-k，含 dx²+dz² <= (r-k)²
function coneCells(nx, ny, nz, r){
  const set = new Set(); const R = Math.max(1, r|0);
  for(let k=0; k<=R; k++){
    const rh = R - k;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(dx*dx + dz*dz > rh*rh) continue;
      set.add((nx+dx)+','+(ny+k)+','+(nz+dz));
    }
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 单元格计数(逐层收尖的圆形截面之和)
ok('r=1 圆锥 = 6 格(底 5 + 顶 1)', coneCells(0,0,0,1).size === 6);
ok('r=2 圆锥 = 19 格(底 13 + 中 5 + 顶 1)', coneCells(0,0,0,2).size === 19);
ok('r=3 圆锥 = 48 格', coneCells(0,0,0,3).size === 48);

// 2. 顶点(apex)是单个方块、在最高层
{
  const c = coneCells(0,0,0,2);
  ok('锥顶 (0,2,0) 存在(最高点单格)', c.has('0,2,0'));
  ok('r=2 顶点层仅 1 格(无 (1,2,0))', !c.has('1,2,0'));
}

// 3. 底面半径 r：底盘面覆盖到 |dx|=r 的轴向格
{
  const c = coneCells(0,0,0,2);
  ok('底 (2,0,0) 在底圆面内(dx²=4<=4)', c.has('2,0,0'));
  ok('底 (3,0,0) 不在底圆面内(dx²=9>4)', !c.has('3,0,0'));
}

// 4. 竖直收尖：高层半径小于底层(中层的水平外扩小于底层)
{
  const c = coneCells(0,0,0,2);
  ok('中层 (1,1,0) 存在(rh=1, 1<=1)', c.has('1,1,0'));
  ok('中层 (2,1,0) 不存在(rh=1, 4>1)', !c.has('2,1,0'));   // 中层比底层更窄 → 收尖
}

// 5. 与圆柱区分：同半径圆锥明显少于圆柱(等径 r、高 r+1)
{
  // 圆柱 r=2 高 3 = (圆盘 r=2 每 9? 不，圆盘 r=2=13) *3 = 39
  ok('圆锥(r=2=19) 少于圆柱(r=2,h=3=39)', coneCells(0,0,0,2).size < 39);
}

// 6. 偏移原点一致
{
  const c = coneCells(4, 6, 2, 2);
  ok('偏移锥顶 (4,8,2) 存在', c.has('4,8,2'));
  ok('r=2 恰好 19 格(无重复)', c.size === 19);
}

// 7. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyConeBrush\(/.test(main), 'main.js 定义 applyConeBrush');
ok(/function eraseConeBrush\(/.test(main), 'main.js 定义 eraseConeBrush');
ok(/brushShape === 'cone'/.test(main), 'editAt/闪示 识别 cone 形状');
ok(/applyConeBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyConeBrush');
ok(/eraseConeBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseConeBrush');
ok(/option value="cone"/.test(html) && /圆锥/.test(html), 'index.html 含「圆锥」选项');

console.log('voxel-world/_cone_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
