// ci146 VoxelForge 墙壁笔刷 —— applyWallBrush/eraseWallBrush 行为测试(竖直薄板: XY 平面 (2r+1)², Z 仅一层)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的墙壁几何：以 (nx,ny,nz) 为墙心，XY 平面填充 dx,dy∈[-r,r]，z 固定 nz(厚 1)
function wallCells(nx, ny, nz, r){
  const set = new Set();
  for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++){
    set.add((nx+dx)+','+(ny+dy)+','+nz);
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 单元格计数(纯几何)
ok('r=1 墙壁 3×3×1 = 9 格', wallCells(0,0,0,1).size === 9);
ok('r=2 墙壁 5×5×1 = 25 格', wallCells(0,0,0,2).size === 25);
ok('r=3 墙壁 7×7×1 = 49 格', wallCells(0,0,0,3).size === 49);

// 2. 中心实心 / 偏移原点一致
{
  const c = wallCells(5, 7, 9, 2);
  ok('中心格 (5,7,9) 被填充', c.has('5,7,9'));
  ok('r=2 恰好 25 格(无重复)', c.size === 25);
}

// 3. Z 向仅一层：Z 偏移的格必须为空(与立方体区分)
{
  const c = wallCells(0,0,0,2);
  ok('Z+1 偏移格 (0,0,1) 为空(墙体单层)', !c.has('0,0,1'));
  ok('Z-1 偏移格 (0,0,-1) 为空', !c.has('0,0,-1'));
  ok('XY 平面内 (1,1,0) 填充', c.has('1,1,0'));
  ok('XY 平面内 (-2,0,0) 填充(边界)', c.has('-2,0,0'));
  ok('XY 平面外 (3,0,0) 为空(越界)', !c.has('3,0,0'));
}

// 4. 与立方体区分：立方体 r=2 是 5³=125，墙壁是 25
ok('墙壁明显少于同半径立方体(125)', wallCells(0,0,0,2).size < 125);

// 5. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyWallBrush\(/.test(main), 'main.js 定义 applyWallBrush');
ok(/function eraseWallBrush\(/.test(main), 'main.js 定义 eraseWallBrush');
ok(/brushShape === 'wall'/.test(main), 'editAt/闪示 识别 wall 形状');
ok(/applyWallBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyWallBrush');
ok(/eraseWallBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseWallBrush');
ok(/option value="wall"/.test(html) && /墙壁/.test(html), 'index.html 含「墙壁」选项');

console.log('voxel-world/_wall_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
