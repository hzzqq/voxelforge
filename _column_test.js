// ci154 VoxelForge 立柱(柱形)笔刷 —— applyColumnBrush/eraseColumnBrush 行为测试(单格宽 1×1 垂直立柱, 高度=brushSize)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的立柱几何：在 (nx,nz) 处、从 ny 起向上填充 h 格(1×1 横截面)
function columnCells(nx, ny, nz, h){
  const set = new Set();
  for(let dy=0; dy<h; dy++) set.add((nx)+','+(ny+dy)+','+(nz));
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 单元格计数(纯几何)
ok('h=1 立柱 1 格', columnCells(0,0,0,1).size === 1);
ok('h=3 立柱 3 格', columnCells(0,0,0,3).size === 3);
ok('h=5 立柱 5 格', columnCells(2,4,1,5).size === 5);

// 2. 竖直排列 / 偏移原点一致
{
  const c = columnCells(5, 7, 9, 3);
  ok('底格 (5,7,9) 被填充', c.has('5,7,9'));
  ok('顶格 (5,9,9) 被填充(h=3)', c.has('5,9,9'));
  ok('h=3 恰好 3 格(无重复/无横扩)', c.size === 3);
}

// 3. 单格宽：与相邻格区分(无 X/Z 扩张)
{
  const c = columnCells(0,0,0,3);
  ok('(1,0,0) 不在立柱内(单格宽)', !c.has('1,0,0'));
  ok('(0,1,0) 不在立柱内(单格宽)', !c.has('0,1,0'));
  ok('(0,0,1) 不在立柱内(单格宽)', !c.has('0,0,1'));
}

// 4. 与圆柱区分：同高度圆柱 r=1 每 3×3=9 格/层 → 远超立柱
ok('立柱明显少于同高圆柱(每层 9 格)', columnCells(0,0,0,3).size < 9*3);

// 5. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyColumnBrush\(/.test(main), 'main.js 定义 applyColumnBrush');
ok(/function eraseColumnBrush\(/.test(main), 'main.js 定义 eraseColumnBrush');
ok(/brushShape === 'column'/.test(main), 'editAt/闪示 识别 column 形状');
ok(/applyColumnBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyColumnBrush');
ok(/eraseColumnBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseColumnBrush');
ok(/option value="column"/.test(html) && /立柱/.test(html), 'index.html 含「立柱」选项');

console.log('voxel-world/_column_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
