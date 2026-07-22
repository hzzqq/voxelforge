// 忠实移植 voxel-world/main.js 的 exportPLY(及 voxelCube 共享原语) 并验证 PLY(ascii 1.0) 输出与接线。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

const key = (x,y,z) => `${x},${y},${z}`;
const PALETTE = { grass:0x6ab04c, dirt:0x8a5a2b };

function voxelCube(){
  const corners = [
    [-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5],
    [-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]
  ];
  const faces = [[1,2,3,4],[5,6,7,8],[1,4,8,5],[2,3,7,6],[1,5,6,2],[4,3,7,8]];
  return { corners, faces };
}
function exportPLY(edits, key, PALETTE){
  const { corners, faces } = voxelCube();
  const verts = [], tris = [];
  let vi = 0;
  for(const [k, v] of edits){
    if(v == null) continue;
    const col = v >>> 0, r = (col>>16)&255, g = (col>>8)&255, b = col&255;
    const [x,y,z] = k.split(',').map(Number);
    for(const c of corners) verts.push((x+c[0]) + ' ' + (y+c[1]) + ' ' + (z+c[2]) + ' ' + r + ' ' + g + ' ' + b);
    for(const f of faces){
      tris.push('3 ' + (vi+f[0]-1) + ' ' + (vi+f[1]-1) + ' ' + (vi+f[2]-1));
      tris.push('3 ' + (vi+f[0]-1) + ' ' + (vi+f[2]-1) + ' ' + (vi+f[3]-1));
    }
    vi += 8;
  }
  const head = [
    'ply','format ascii 1.0',
    'element vertex ' + verts.length,
    'property float x','property float y','property float z',
    'property uchar red','property uchar green','property uchar blue',
    'element face ' + tris.length,
    'property list uchar int vertex_indices',
    'end_header'
  ];
  return head.concat(verts, tris).join('\n') + '\n';
}

// 单 voxel
{
  const edits = new Map([[key(0,0,0), PALETTE.grass]]);
  const ply = exportPLY(edits, key, PALETTE);
  const lines = ply.trim().split('\n');
  const vs = lines.filter(l => l.match(/^-?[\d.]+ -?[\d.]+ -?[\d.]+ \d+ \d+ \d+$/));
  const ts = lines.filter(l => l.startsWith('3 '));
  ok('单 voxel => 8 顶点', vs.length === 8);
  ok('单 voxel => 12 三角面', ts.length === 12);
  ok('头部含 ply', ply.includes('ply'));
  ok('头部含 format ascii 1.0', ply.includes('format ascii 1.0'));
  ok('头部 element vertex 8', ply.includes('element vertex 8'));
  ok('头部 element face 12', ply.includes('element face 12'));
  ok('顶点含角点 -0.5 -0.5 -0.5', ply.includes('-0.5 -0.5 -0.5'));
  ok('顶点含 grass 颜色 106 176 76', ply.includes('106 176 76'));
}
// 多 voxel：顶点/面数随非空数线性，挖空跳过
{
  const edits = new Map([
    [key(1,0,0), PALETTE.grass],
    [key(0,2,0), PALETTE.dirt],
    [key(0,0,3), PALETTE.grass],
    [key(5,5,5), null]
  ]);
  const ply = exportPLY(edits, key, PALETTE);
  const vs = ply.trim().split('\n').filter(l => l.match(/^-?[\d.]+ -?[\d.]+ -?[\d.]+ \d+ \d+ \d+$/));
  const ts = ply.trim().split('\n').filter(l => l.startsWith('3 '));
  ok('3 非空 => 24 顶点', vs.length === 24);
  ok('3 非空 => 36 三角面', ts.length === 36);
  ok('挖空(null)被跳过', !ply.includes('4.5 4.5 4.5'));
}
// 面索引全部合法(<= 总顶点数, >=0)
{
  const edits = new Map();
  for(let i=0;i<5;i++) edits.set(key(i,0,0), PALETTE.grass);
  const ply = exportPLY(edits, key, PALETTE);
  const vcount = ply.trim().split('\n').filter(l => l.match(/^-?[\d.]+ -?[\d.]+ -?[\d.]+ \d+ \d+ \d+$/)).length;
  const ts = ply.trim().split('\n').filter(l => l.startsWith('3 '));
  let allOk = true;
  for(const t of ts){ for(const n of t.split(' ').slice(1)){ if(!(+n>=0 && +n<vcount)) allOk=false; } }
  ok('所有面索引合法(0..顶点数-1)', allOk);
}
// 空世界：合法 0 顶点 PLY(边界：避免崩溃)
{
  const ply = exportPLY(new Map(), key, PALETTE);
  ok('空世界导出 element vertex 0', ply.includes('element vertex 0'));
  ok('空世界导出 element face 0', ply.includes('element face 0'));
  ok('空世界以 end_header 结束头部', ply.includes('end_header'));
}

// ---- 接线检查 ----
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('main.js 定义 voxelCube 共享原语', /function voxelCube\(/.test(main));
ok('main.js 定义 exportPLY', /function exportPLY\(/.test(main));
ok('main.js exportPLY 复用 voxelCube', /exportPLY\([\s\S]*?voxelCube\(\)/.test(main));
ok('main.js 导出按钮调用 exportPLY', /\$\('exportPly'\)\.onclick/.test(main) && /exportPLY\(edits, key, PALETTE\)/.test(main));
ok('index.html 含导出 PLY 按钮', /id="exportPly"/.test(html));

console.log(`\nexportPLY: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
