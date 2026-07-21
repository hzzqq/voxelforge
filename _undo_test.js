// VoxelForge 撤销/重做（快照式，作用于 edits Map）单元测试：忠实移植 main.js 的纯逻辑
//   snapshotEdits/new Map、editsEqual、recordUndo、undoEdit、redoEdit、UNDO_CAP=64
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

// ---- 忠实移植 main.js 快照式撤销/重做 ----
function cloneMap(m){ return new Map(m); }
function editsEqual(a, b){
  if(a.size !== b.size) return false;
  for(const [k, v] of a){ if(b.get(k) !== v) return false; }
  return true;
}
function makeStacks(){ return { undo: [], redo: [] }; }
function recordUndo(st, edits, prev){
  if(prev && !editsEqual(prev, edits)){
    st.undo.push(prev);
    if(st.undo.length > 64) st.undo.shift();
    st.redo.length = 0;
  }
}
function undoEdit(st, edits){
  if(st.undo.length === 0) return { edits, changed: false };
  const prev = st.undo.pop();
  st.redo.push(cloneMap(edits));
  return { edits: cloneMap(prev), changed: true };
}
function redoEdit(st, edits){
  if(st.redo.length === 0) return { edits, changed: false };
  const next = st.redo.pop();
  st.undo.push(cloneMap(edits));
  return { edits: cloneMap(next), changed: true };
}

// 1) editsEqual：同内容 true、不同 false
{
  const a = new Map([['1,2,3', 0xff0000], ['4,5,6', null]]);
  const b = new Map([['1,2,3', 0xff0000], ['4,5,6', null]]);
  const c = new Map([['1,2,3', 0xff0000]]);
  ok('editsEqual 同内容 true', editsEqual(a, b));
  ok('editsEqual 大小不同 false', !editsEqual(a, c));
  ok('editsEqual null 与 缺失 不同', !editsEqual(a, new Map([['1,2,3', 0xff0000]])));
  ok('editsEqual 值不同 false', !editsEqual(new Map([['x',1]]), new Map([['x',2]])));
}

// 2) 一次编辑 → 撤销 → 重做 还原
{
  const st = makeStacks();
  const E0 = new Map([['a', 1]]);
  const E1 = new Map([['a', 1], ['b', 2]]);
  recordUndo(st, E1, E0);                 // 编辑前快照 E0，编辑后 E1
  ok('记录后撤销栈长度为 1', st.undo.length === 1);
  const u = undoEdit(st, E1);
  ok('undo 改变状态', u.changed === true);
  ok('undo 还原到 E0', editsEqual(u.edits, E0));
  ok('undo 后重做栈长度为 1', st.redo.length === 1);
  const r = redoEdit(st, u.edits);
  ok('redo 改变状态', r.changed === true);
  ok('redo 还原到 E1', editsEqual(r.edits, E1));
}

// 3) 无变化不记录
{
  const st = makeStacks();
  const E0 = new Map([['a', 1]]);
  recordUndo(st, E0, E0);                 // prev===edits（不变）
  ok('无变化不压入撤销栈', st.undo.length === 0);
}

// 4) 空栈 undo/redo 安全
{
  const st = makeStacks();
  const E0 = new Map([['a',1]]);
  const u = undoEdit(st, E0);
  ok('空撤销栈 undo 不变', u.changed === false && editsEqual(u.edits, E0));
  const r = redoEdit(st, E0);
  ok('空重做栈 redo 不变', r.changed === false && editsEqual(r.edits, E0));
}

// 5) 限长 64：超过丢弃最旧
{
  const st = makeStacks();
  let cur = new Map();
  for(let i=0;i<80;i++){
    const prev = cloneMap(cur);
    cur = new Map(prev); cur.set('k'+i, i);
    recordUndo(st, cur, prev);
  }
  ok('撤销栈限长 64', st.undo.length === 64);
}

// 6) 多步往返：E0→E1→E2，连续撤销再连续重做
{
  const st = makeStacks();
  let cur = new Map();
  let prev0 = cloneMap(cur);
  cur = new Map([['a',1]]); recordUndo(st, cur, prev0);          // step1
  const prev1 = cloneMap(cur);
  cur = new Map([['a',1],['b',2]]); recordUndo(st, cur, prev1);  // step2
  const u1 = undoEdit(st, cur);    // -> E1
  ok('第一次撤销回到 E1', editsEqual(u1.edits, new Map([['a',1]])));
  const u2 = undoEdit(st, u1.edits); // -> E0
  ok('第二次撤销回到 E0', editsEqual(u2.edits, new Map()));
  const r1 = redoEdit(st, u2.edits); // -> E1
  ok('第一次重做回到 E1', editsEqual(r1.edits, new Map([['a',1]])));
  const r2 = redoEdit(st, r1.edits); // -> E2
  ok('第二次重做回到 E2', editsEqual(r2.edits, new Map([['a',1],['b',2]])));
}

// 7) 撤销后新编辑清空重做栈
{
  const st = makeStacks();
  const E0 = new Map([['a',1]]);
  const E1 = new Map([['a',1],['b',2]]);
  recordUndo(st, E1, E0);
  undoEdit(st, E1);                    // 此刻 redo 含 E1
  ok('撤销后重做栈非空', st.redo.length === 1);
  const E2 = new Map([['a',1],['c',3]]);
  recordUndo(st, E2, new Map([['a',1],['b',2]])); // 新编辑
  ok('新编辑清空重做栈', st.redo.length === 0);
}

// 8) 快照独立性：撤销返回 clone，修改不污染源栈
{
  const st = makeStacks();
  const E0 = new Map([['a',1]]);
  const E1 = new Map([['a',1],['b',2]]);
  recordUndo(st, E1, E0);
  const u = undoEdit(st, E1);          // pops E0，返回 clone
  u.edits.set('z', 99);                // 修改返回结果（不应影响栈内 E1）
  const r = redoEdit(st, u.edits);     // 重做应回到 E1（st.redo[0]=E1，未被改动）
  ok('撤销返回 clone 且重做仍还原 E1', editsEqual(r.edits, E1));
}

// ---- 源码接线 ----
ok('main.js 声明 undoStack', /let undoStack = \[\]/.test(src));
ok('main.js 声明 redoStack', /redoStack = \[\];/.test(src));
ok('main.js 含 recordUndo', /function recordUndo\(prev\)/.test(src));
ok('main.js 含 undoEdit', /function undoEdit\(\)/.test(src));
ok('main.js 含 redoEdit', /function redoEdit\(\)/.test(src));
ok('main.js 含 rebuildAll', /function rebuildAll\(\)/.test(src));
ok('pointerdown 调用 snapshotEdits', /const prev = snapshotEdits\(\);[\s\S]*recordUndo\(prev\)/.test(src));
ok('撤销按钮接线 undoBtn', /\$\('undoBtn'\)\.onclick/.test(src));
ok('重做按钮接线 redoBtn', /\$\('redoBtn'\)\.onclick/.test(src));
ok('快捷键 Ctrl+Z 撤销', /k === 'z' && !e\.shiftKey/.test(src));

console.log(`[Voxel undo] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
