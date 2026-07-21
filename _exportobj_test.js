// ci110 VoxelForge 导出 OBJ —— 纯函数忠实移植 + 行为断言
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

// ---- 忠实移植 main.js 的 exportOBJ ----
const key = (x,y,z) => `${x},${y},${z}`;
const PALETTE = { grass:'#2e8b2e', dirt:'#7a5230' };
function exportOBJ(edits, key, PALETTE){
  const lines = ['# VoxelForge export'];
  let vi = 1;
  for(const [k, v] of edits){
    if(v == null) continue;
    const [x,y,z] = k.split(',').map(Number);
    const corners = [
      [x-0.5,y-0.5,z-0.5],[x+0.5,y-0.5,z-0.5],[x+0.5,y+0.5,z-0.5],[x-0.5,y+0.5,z-0.5],
      [x-0.5,y-0.5,z+0.5],[x+0.5,y-0.5,z+0.5],[x+0.5,y+0.5,z+0.5],[x-0.5,y+0.5,z+0.5]
    ];
    for(const c of corners) lines.push('v ' + c[0] + ' ' + c[1] + ' ' + c[2]);
    const faces = [[1,2,3,4],[5,6,7,8],[1,4,8,5],[2,3,7,6],[1,5,6,2],[4,3,7,8]];
    for(const f of faces){
      lines.push('f ' + (vi+f[0]-1) + ' ' + (vi+f[1]-1) + ' ' + (vi+f[2]-1));
      lines.push('f ' + (vi+f[0]-1) + ' ' + (vi+f[2]-1) + ' ' + (vi+f[3]-1));
    }
    vi += 8;
  }
  return lines.join('\n') + '\n';
}

// 单 voxel
{
  const edits = new Map([[key(0,0,0), PALETTE.grass]]);
  const obj = exportOBJ(edits, key, PALETTE);
  const lines = obj.trim().split('\n');
  const vs = lines.filter(l => l.startsWith('v '));
  const fs_ = lines.filter(l => l.startsWith('f '));
  ok('单 voxel => 8 顶点', vs.length === 8);
  ok('单 voxel => 12 面', fs_.length === 12);
  ok('含角点 -0.5 -0.5 -0.5', obj.includes('v -0.5 -0.5 -0.5'));
  ok('含角点 0.5 0.5 0.5', obj.includes('v 0.5 0.5 0.5'));
}
// 多 voxel：顶点/面数随非空数线性增长
{
  const edits = new Map([
    [key(1,0,0), PALETTE.grass],
    [key(0,2,0), PALETTE.dirt],
    [key(0,0,3), PALETTE.grass],
    [key(5,5,5), null]            // 挖空，应跳过
  ]);
  const obj = exportOBJ(edits, key, PALETTE);
  const vs = obj.trim().split('\n').filter(l => l.startsWith('v '));
  const fs_ = obj.trim().split('\n').filter(l => l.startsWith('f '));
  ok('3 非空 => 24 顶点', vs.length === 24);
  ok('3 非空 => 36 面', fs_.length === 36);
  ok('挖空(null)被跳过', !obj.includes('v 4.5 4.5 4.5') && !obj.includes('5.5 5.5 5.5'));
}
// 面索引全部合法（<= 总顶点数，>= 1）
{
  const edits = new Map();
  for(let i=0;i<5;i++) edits.set(key(i,0,0), PALETTE.grass);
  const obj = exportOBJ(edits, key, PALETTE);
  const vcount = obj.trim().split('\n').filter(l => l.startsWith('v ')).length;
  const fs_ = obj.trim().split('\n').filter(l => l.startsWith('f '));
  let allOk = true;
  for(const f of fs_){ for(const t of f.split(' ').slice(1)){ const n=+t; if(!(n>=1 && n<=vcount)) allOk=false; } }
  ok('所有面索引合法(1..顶点数)', allOk);
}
// 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
ok('main 定义 exportOBJ', /function exportOBJ\(/.test(main));
ok('main 导出按钮调用 exportOBJ', /\$\('exportObj'\)\.onclick/.test(main) && /exportOBJ\(edits, key, PALETTE\)/.test(main));
ok('index.html 含导出 OBJ 按钮', /id="exportObj"/.test(fs.readFileSync(path.join(__dirname,'index.html'),'utf8')));

console.log(`\nci110 exportOBJ: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
