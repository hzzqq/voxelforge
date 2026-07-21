// ci134 VoxelForge 金字塔形笔刷 —— 忠实移植 applyPyramidBrush 的逐层收缩几何 + 源码接线检查
// GLSL 等价逻辑(JS):
//   for dy in [0,h): lim = max(0, r-dy); keep |dx|+|dz| <= lim
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植：返回被金字塔覆盖的 (x,y,z) 键集合(相对中心 nx,ny,nz)
// 源循环 dx=-r+1..r-1、dz 同，故曼哈顿半径 lim 在轴上最大触及 r-1
function pyramidCells(nx, ny, nz, radius, height){
  const r = Math.max(1, radius|0);
  const h = Math.min((height == null) ? r : Math.max(1, height|0), r);
  const set = new Set();
  for(let dy=0; dy<h; dy++){
    const lim = Math.max(0, r - dy);
    for(let dx=-r+1; dx<r; dx++) for(let dz=-r+1; dz<r; dz++){
      if(Math.abs(dx) + Math.abs(dz) > lim) continue;
      set.add(`${nx+dx},${ny+dy},${nz+dz}`);
    }
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 底半径 2 高 2 的金字塔：底层菱形(曼哈顿半径=底半径-1，因循环 dx∈[-r+1,r-1])，顶层收缩
{
  const c = pyramidCells(0,0,0,2,2);
  ok(c.has('0,0,0'), 'pyramid base includes center');
  // 循环边界使轴上最大偏移 = r-1 = 1
  ok(c.has('1,0,0') && !c.has('2,0,0'), 'pyramid axis reach = r-1 (dx max 1)');
  ok(c.has('1,1,0'), 'pyramid base corner (manhattan=2) included');
  ok(!c.has('2,0,2'), 'pyramid base excludes out-of-loop corner');
  // 顶层(dy=1) lim=1 → 中心 + 四邻(十字)
  ok(c.has('0,1,0'), 'pyramid top layer keeps center');
  ok(c.has('1,1,0') && !c.has('2,1,0'), 'pyramid top layer shrinks (no radius-2 cell)');
  ok(!c.has('0,2,0'), 'pyramid stops at height');
  ok(c.size === 14, 'pyramid total cells = 9(base) + 5(top) = 14, got ' + c.size);
}

// 2. 半径3高3：三层菱形 21+13+5 = 39 (轴上最大偏移=2)
{
  const c = pyramidCells(0,0,0,3,3);
  ok(c.size === 39, 'pyramid r3h3 = 21+13+5 = 39, got ' + c.size);
  ok(c.has('2,0,0') && !c.has('3,0,0'), 'pyramid axis reach = r-1 (dx max 2)');
  ok(!c.has('3,1,0') && !c.has('3,2,0'), 'pyramid upper layers never reach radius 3');
}

// 3. 高度 > 半径：高度被钳到半径，干净收顶(无中心柱)
{
  const c = pyramidCells(0,0,0,2,5);
  ok(c.size === 14, 'pyramid h>r capped to r (14 cells, no pillar), got ' + c.size);
  ok(!c.has('0,4,0'), 'pyramid h>r does not extend a central pillar');
}

// 4. 半径下限 1
{
  const c = pyramidCells(5,5,5,0,0);
  ok(c.size === 1 && c.has('5,5,5'), 'pyramid r=0 → single cell at center');
}

// 5. 偏移中心：几何随中心平移
{
  const c = pyramidCells(10,20,30,1,1);
  ok(c.size === 1 && c.has('10,20,30'), 'pyramid offset center single cell');
}

// 6. 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyPyramidBrush\(/.test(main), 'main.js defines applyPyramidBrush');
ok(/function erasePyramidBrush\(/.test(main), 'main.js defines erasePyramidBrush');
ok(/brushShape === 'pyramid'\) applyPyramidBrush\(/.test(main), 'editAt apply path dispatches pyramid');
ok(/brushShape === 'pyramid'\) erasePyramidBrush\(/.test(main), 'editAt erase path dispatches pyramid');
ok(/Math\.abs\(dx\) \+ Math\.abs\(dz\) > lim/.test(main), 'pyramid uses manhattan diamond test');
ok(/<option value="pyramid">/.test(html), 'index.html brushShape has pyramid option');

console.log('voxel-world/_pyramid_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
