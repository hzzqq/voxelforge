// VoxelForge 世界存读档测试：抽取真实 serializeWorld/deserializeWorld（纯函数，不依赖 THREE），验证往返保真。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
function extract(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n}\\n');
  const m = src.match(re);
  if(!m) throw new Error('无法抽取函数 ' + name);
  return m[0];
}
const code = extract('serializeWorld') + '\n' + extract('deserializeWorld') + '\nreturn { serializeWorld, deserializeWorld };';
const { serializeWorld, deserializeWorld } = new Function(code)();

let pass = 0, fail = 0;
function ok(name, cond){ if(cond) pass++; else { fail++; console.log('  FAIL', name); } }

// 构造带颜色值/水体/岩浆的状态
const edits = new Map([['1,2,3', 0xe2cf8a], ['4,5,6', 0x9c6b3f], ['-1,-1,-1', null]]);
const waterCol = new Map([['10,10', 4], ['11,10', 5]]);
const lavaCol = new Map([['20,20', 3]]);

const data = serializeWorld(edits, waterCol, lavaCol);
ok('序列化含版本号', data.v === 1);
ok('序列化 edits 条数', data.edits.length === 3);
ok('序列化 water 条数', data.water.length === 2);
ok('序列化 lava 条数', data.lava.length === 1);
ok('序列化是纯 JSON（可 JSON.stringify/parse）', JSON.stringify(data) === JSON.stringify(JSON.parse(JSON.stringify(data))));

// 反序列化往返
const w = deserializeWorld(data);
ok('反序列化 edits 相等', w.edits.get('1,2,3') === 0xe2cf8a && w.edits.get('4,5,6') === 0x9c6b3f && w.edits.get('-1,-1,-1') === null);
ok('反序列化 water 相等', w.waterCol.get('10,10') === 4 && w.waterCol.get('11,10') === 5);
ok('反序列化 lava 相等', w.lavaCol.get('20,20') === 3);
ok('反序列化是独立新 Map（不共享引用）', w.edits !== edits && w.waterCol !== waterCol);
ok('反序列化且原 Map 未被改', edits.size === 3);

// 空/损坏输入健壮
const empty = deserializeWorld(undefined);
ok('undefined 输入 → 空世界', empty.edits.size === 0 && empty.waterCol.size === 0 && empty.lavaCol.size === 0);
const bad = deserializeWorld({ foo: 1 });
ok('无 edits 字段 → 空世界', bad.edits.size === 0);
const partial = deserializeWorld({ edits: [['7,8,9', 0x333333]], water: [['1,2', 3]] });
ok('仅 edits/water 也能还原（lava 空）', partial.edits.get('7,8,9') === 0x333333 && partial.waterCol.get('1,2') === 3 && partial.lavaCol.size === 0);

// 大状态往返保真
const big = new Map(); for(let i=0;i<500;i++) big.set(i+',0,0', i);
const bigBack = deserializeWorld(serializeWorld(big, new Map(), new Map())).edits;
ok('500 条 edits 往返无损', bigBack.size === 500 && bigBack.get('499,0,0') === 499);

console.log(`\n[VoxelForge world-io] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
