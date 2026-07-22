// ci150 VoxelForge 菱形(八面体)笔刷 —— applyDiamondBrush/eraseDiamondBrush 行为测试(曼哈顿距离 |dx|+|dy|+|dz|<=r)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的菱形几何：以 (nx,ny,nz) 为中心，曼哈顿距离 <= r 的体素
function diamondCells(nx, ny, nz, r){
  const set = new Set();
  for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > r) continue;
    set.add((nx+dx)+','+(ny+dy)+','+(nz+dz));
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 单元格计数(纯几何，八面体 L1 球)
ok('r=1 菱形 = 7 格(1 中心 + 6 轴向)', diamondCells(0,0,0,1).size === 7);
ok('r=2 菱形 = 25 格', diamondCells(0,0,0,2).size === 25);
ok('r=3 菱形 = 63 格', diamondCells(0,0,0,3).size === 63);

// 2. 中心实心 / 偏移原点一致
{
  const c = diamondCells(5, 7, 9, 2);
  ok('中心格 (5,7,9) 被填充', c.has('5,7,9'));
  ok('r=2 恰好 25 格(无重复)', c.size === 25);
}

// 3. 轴向邻居在范围内、对角越界：L1 距离判定
{
  const c = diamondCells(0,0,0,2);
  ok('轴向 (2,0,0) L1=2 在内', c.has('2,0,0'));
  ok('轴向 (-2,0,0) 在内', c.has('-2,0,0'));
  ok('轴向 (0,0,2) 在内', c.has('0,0,2'));
  ok('(1,1,1) L1=3 越界(不在 r=2)', !c.has('1,1,1'));
  ok('(2,1,0) L1=3 越界', !c.has('2,1,0'));
  ok('(0,0,3) L1=3 越界', !c.has('0,0,3'));
}

// 4. 与球形/立方体区分：菱形 r=2=25，球形笔刷 r=2 用 [-1,1]³ 欧氏 ≤4 全含 = 27，立方体 r=2 = 125
ok('菱形 r=2 (25) 少于同半径立方体 (125)', diamondCells(0,0,0,2).size < 125);

// 5. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyDiamondBrush\(/.test(main), 'main.js 定义 applyDiamondBrush');
ok(/function eraseDiamondBrush\(/.test(main), 'main.js 定义 eraseDiamondBrush');
ok(/brushShape === 'diamond'/.test(main), 'editAt/闪示 识别 diamond 形状');
ok(/applyDiamondBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyDiamondBrush');
ok(/eraseDiamondBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseDiamondBrush');
ok(/option value="diamond"/.test(html) && /菱形/.test(html), 'index.html 含「菱形(八面体)」选项');

console.log('voxel-world/_diamond_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
