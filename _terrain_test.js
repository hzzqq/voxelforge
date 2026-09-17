// VoxelForge 地形噪声单元测试：从 main.js 抽取【真实生产函数】hash/hash3/hash3u/
// vnoise/vnoise3/fbm/fbm3/caveAt/heightAt（既往 _genterrain_test 测的是移植副本，
// 生产噪声栈本身零守护），断言确定性、值域、连续性、晶格精确性与边界。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
// brace 计数抽取（CRLF 免疫，同 _brush_test.js 方法）
function extractFn(name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('找不到函数 ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for(; i < src.length; i++){
    const c = src[i];
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(start, i+1); }
  }
  throw new Error('函数 ' + name + ' 括号不匹配');
}
function extractConstArrow(name){
  const m = src.match(new RegExp('const ' + name + ' = [^;]+;'));
  if(!m) throw new Error('找不到常量 ' + name);
  return m[0];
}
// 生产默认 amp（main.js: let amp = 12），heightAt 闭包引用
let amp = 12;
const code = [
  extractConstArrow('smooth'),
  extractConstArrow('lerp'),
  extractFn('hash'), extractFn('hash3'), extractFn('hash3u'),
  extractFn('vnoise'), extractFn('vnoise3'), extractFn('fbm'), extractFn('fbm3'),
  extractFn('caveAt'), extractFn('heightAt')
].join('\n');
const bake = new Function('amp', code + '\nreturn { hash, hash3, hash3u, vnoise, vnoise3, fbm, fbm3, caveAt, heightAt };');
const { hash, hash3u, vnoise, vnoise3, fbm, fbm3, caveAt, heightAt } = bake(amp);

// ---- 1) hash：确定性 + 值域 ----
ok('hash 确定性', hash(5, 9) === hash(5, 9) && hash(100, -3) === hash(100, -3));
ok('hash 值域 [0,1)', hash(0,0) >= 0 && hash(0,0) < 1 && hash(7,7) >= 0 && hash(7,7) < 1);

// ---- 2) hash3u：确定性 + 值域 + 负数安全 ----
ok('hash3u 确定性', hash3u(1,2,3) === hash3u(1,2,3));
ok('hash3u 值域 [0,1)', hash3u(0,0,0) >= 0 && hash3u(0,0,0) < 1 && hash3u(99,99,99) < 1);
ok('hash3u 负数输入不越界', hash3u(-5,-7,-9) >= 0 && hash3u(-5,-7,-9) < 1);

// ---- 3) vnoise：确定性 + 值域 + 晶格精确 + 连续性 ----
ok('vnoise 确定性', vnoise(3.7, 8.2) === vnoise(3.7, 8.2));
ok('vnoise 值域 [0,1]', (()=>{ let mn = 1, mx = 0; for(let i = 0; i < 500; i++){ const v = vnoise(i * 0.731, i * 1.279); if(v < mn) mn = v; if(v > mx) mx = v; } return mn >= 0 && mx <= 1; })());
ok('vnoise 晶格角点精确 = hash(0,0)', vnoise(0, 0) === hash(0, 0));
ok('vnoise 晶格角点精确 = hash(2,3)', vnoise(2, 3) === hash(2, 3));
ok('vnoise 同晶格内连续（步长 0.0001 变化 < 0.001）', Math.abs(vnoise(5.0001, 3.0001) - vnoise(5, 3)) < 0.001);

// ---- 4) vnoise3：确定性 + 值域 ----
ok('vnoise3 确定性', vnoise3(1.5, 2.5, 3.5) === vnoise3(1.5, 2.5, 3.5));
ok('vnoise3 值域 [0,1]', (()=>{ for(let i = 0; i < 200; i++){ const v = vnoise3(i * 0.617, i * 0.413, i * 0.829); if(v < 0 || v > 1) return false; } return true; })());

// ---- 5) fbm（4 八度）：确定性 + 值域上界 0.9375 ----
ok('fbm 确定性', fbm(11.7, 4.3) === fbm(11.7, 4.3));
ok('fbm 值域 [0, 0.9375]（0.5+0.25+0.125+0.0625）', (()=>{ let mx = 0; for(let i = 0; i < 500; i++){ const v = fbm(i * 0.731, i * 1.279); if(v > mx) mx = v; if(v < 0) return false; } return mx <= 0.9375; })());

// ---- 6) fbm3（3 八度）：确定性 + 值域上界 0.875 ----
ok('fbm3 确定性', fbm3(1.1, 2.2, 3.3) === fbm3(1.1, 2.2, 3.3));
ok('fbm3 值域 [0, 0.875]（0.5+0.25+0.125）', (()=>{ for(let i = 0; i < 200; i++){ const v = fbm3(i * 0.617, i * 0.413, i * 0.829); if(v < 0 || v > 0.875) return false; } return true; })());

// ---- 7) caveAt：确定性 + 布尔 ----
ok('caveAt 确定性', caveAt(3, -5, 7) === caveAt(3, -5, 7));
ok('caveAt 返回布尔', typeof caveAt(0, -1, 0) === 'boolean');

// ---- 8) heightAt：整数 + 确定性 + 边界 [4, amp+4] ----
{
  const h = heightAt(5, 9);
  ok('heightAt 整数', Number.isInteger(h));
  ok('heightAt 确定性', h === heightAt(5, 9));
  let mn = Infinity, mx = -Infinity;
  for(let x = -20; x < 20; x++) for(let z = -20; z < 20; z++){
    const v = heightAt(x, z);
    if(!Number.isInteger(v)) { ok('heightAt 全网格整数', false); mn = NaN; break; }
    if(v < mn) mn = v; if(v > mx) mx = v;
  }
  if(!Number.isNaN(mn)){
    ok('heightAt 全网格整数', true);
    ok('heightAt 下界 >= 4', mn >= 4);
    ok('heightAt 上界 <= amp+4', mx <= amp + 4);
    ok('地形有起伏（min < max，非平地）', mn < mx);
  }
}

// ---- 9) amp 耦合：起伏放大 → 网格最高不减（floor(fbm*amp) 对 amp 单调不减）----
{
  const bake2 = new Function('amp', code + '\nreturn { heightAt };');
  const h24 = bake2(24);
  let mx12 = -Infinity, mx24 = -Infinity;
  for(let x = -20; x < 20; x++) for(let z = -20; z < 20; z++){
    const v1 = heightAt(x, z), v2 = h24.heightAt(x, z);
    if(v1 > mx12) mx12 = v1; if(v2 > mx24) mx24 = v2;
  }
  ok('amp 增大时网格最高点不减（单调耦合）', mx24 >= mx12);
}

// ---- 10) 洞穴与地形耦合：caveAt 不依赖 heightAt（可独立于地表存在）----
ok('caveAt 在深部与浅部均可求值', typeof caveAt(0, 3, 0) === 'boolean' && typeof caveAt(0, -30, 0) === 'boolean');

console.log(`[VoxelForge terrain] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
