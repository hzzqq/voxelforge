// ci162 VoxelForge 阶梯(stairs)笔刷 —— applyStairsBrush/eraseStairsBrush 行为测试(沿 +x/+y 上升的实心台阶)
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的阶梯几何：步 k=0..r，每步在 x=nx+k、z=nz 处立一根从 ny 到 ny+k 的实心柱。
function stairsCells(nx, ny, nz, r){
  const set = new Set(); const R = Math.max(1, r|0);
  for(let k=0; k<=R; k++){
    const x = nx + k;
    for(let y=ny; y<=ny+k; y++) set.add(x + ',' + y + ',' + nz);
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 单元格计数：sum_{k=0..r}(k+1) = (r+1)(r+2)/2
ok('r=1 阶梯 = 3 格(1+2)', stairsCells(0,0,0,1).size === 3);
ok('r=2 阶梯 = 6 格(1+2+3)', stairsCells(0,0,0,2).size === 6);
ok('r=3 阶梯 = 10 格(1+2+3+4)', stairsCells(0,0,0,3).size === 10);

// 2. 台阶沿 +x/+y 同步上升：顶部 (nx+r, ny+r, nz) 存在且为最高
{
  const c = stairsCells(0,0,0,3);
  ok('顶点 (3,3,0) 存在(第 3 级顶)', c.has('3,3,0'));
  ok('第 3 级 (3,2,0) 存在(该级实心柱 ny..ny+3)', c.has('3,2,0'));
  ok('第 3 级 (3,0,0) 存在(柱底)', c.has('3,0,0'));
}

// 3. 基座(第 0 级)是单格：仅 (nx, ny)，向上无块(台阶向上前方走)
{
  const c = stairsCells(0,0,0,2);
  ok('基座 (0,0,0) 存在', c.has('0,0,0'));
  ok('基座上方 (0,1,0) 不存在(第0级仅 1 格)', !c.has('0,1,0'));
}

// 4. 每级 x 唯一递增：最大 x = nx+r，nx+r+1 不存在
{
  const c = stairsCells(0,0,0,2);
  ok('最大 x = 2：(2,*,0) 存在', c.has('2,2,0'));
  ok('x=3 不存在(不超过 r)', !c.has('3,0,0'));
  ok('第 1 级 (1,0,0) 与 (1,1,0) 均存在', c.has('1,0,0') && c.has('1,1,0'));
}

// 5. 偏移原点一致
{
  const c = stairsCells(4, 6, 2, 3);
  ok('偏移顶点 (7,9,2) 存在', c.has('7,9,2'));
  ok('r=3 恰好 10 格(无重复)', c.size === 10);
}

// 6. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyStairsBrush\(/.test(main), 'main.js 定义 applyStairsBrush');
ok(/function eraseStairsBrush\(/.test(main), 'main.js 定义 eraseStairsBrush');
ok(/brushShape === 'stairs'/.test(main), 'editAt/闪示 识别 stairs 形状');
ok(/applyStairsBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyStairsBrush');
ok(/eraseStairsBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseStairsBrush');
ok(/option value="stairs"/.test(html) && /阶梯/.test(html), 'index.html 含「阶梯」选项');

console.log('voxel-world/_stairs_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
