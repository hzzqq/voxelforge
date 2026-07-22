// ci166 VoxelForge 半球/穹顶(dome)笔刷 —— applyDomeBrush/eraseDomeBrush 行为测试(圆顶高度剖面 h=round(sqrt(r²-dx²-dz²)))
'use strict';
const fs = require('fs');
const path = require('path');

// 忠实移植 main.js 的圆顶几何：半径 r 圆盘内，按距中心距离给出圆顶高度 h，向上实心填充 ny..ny+h。
function domeCells(nx, ny, nz, r){
  const set = new Set(); const R = Math.max(1, r|0);
  for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
    const d2 = dx*dx + dz*dz;
    if(d2 > R*R) continue;                       // 圆盘外剔除
    const h = Math.round(Math.sqrt(R*R - d2));   // 0..R 的圆顶高度
    for(let y=ny; y<=ny+h; y++) set.add((nx+dx) + ',' + y + ',' + (nz+dz));
  }
  return set;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if (cond) pass++; else { fail++; console.error('FAIL: ' + msg); } }

// 1. 单元格计数（圆盘内每点填 h+1 格，h=round(sqrt(r²-d²))）
ok('r=1 穹顶 = 6 格', domeCells(0,0,0,1).size === 6);
ok('r=2 穹顶 = 27 格', domeCells(0,0,0,2).size === 27);
ok('r=3 穹顶 = 84 格', domeCells(0,0,0,3).size === 84);

// 2. 圆顶剖面：中心最高、边缘最低
{
  const c = domeCells(0,0,0,3);
  ok('顶点柱 (0,3,0) 存在(最高峰)', c.has('0,3,0'));
  ok('中心全柱 (0,0,0)(0,1,0)(0,2,0)(0,3,0) 均存在', c.has('0,0,0') && c.has('0,1,0') && c.has('0,2,0') && c.has('0,3,0'));
  ok('边缘 (r,0,0) 仅 1 格：(3,0,0) 存在、(3,1,0) 不存在', c.has('3,0,0') && !c.has('3,1,0'));
  ok('对角边缘 (2,2,0) 仅 2 格：(2,2,0)(2,2,1) 存在、(2,2,2) 不存在', c.has('2,2,0') && c.has('2,2,1') && !c.has('2,2,2'));
}

// 3. 圆盘边界：半径外不生成（dx²+dz²>r²）
{
  const c = domeCells(0,0,0,2);
  ok('x=3 不存在(超出半径)', !c.has('3,0,0'));
  ok('角点 (2,2,0) 不存在(d²=8>r²=4)', !c.has('2,2,0'));
}

// 4. 偏移原点一致
{
  const c = domeCells(4, 6, 2, 2);
  ok('偏移顶点 (4,8,2) 存在', c.has('4,8,2'));
  ok('r=2 恰好 27 格(无重复)', c.size === 27);
}

// 5. 接线检查
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/function applyDomeBrush\(/.test(main), 'main.js 定义 applyDomeBrush');
ok(/function eraseDomeBrush\(/.test(main), 'main.js 定义 eraseDomeBrush');
ok(/brushShape === 'dome'/.test(main), 'editAt/闪示 识别 dome 形状');
ok(/applyDomeBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize/.test(main), 'editAt 应用分支调用 applyDomeBrush');
ok(/eraseDomeBrush\(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize/.test(main), 'editAt 擦除分支调用 eraseDomeBrush');
ok(/option value="dome"/.test(html) && /半球/.test(html), 'index.html 含「半球(穹顶)」选项');

console.log('voxel-world/_dome_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
