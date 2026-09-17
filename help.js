/* VoxelForge 使用说明面板
 * 自包含组件：只注入自己的 DOM 与样式，不读写任何业务变量、不改动渲染逻辑。
 * 打开：右下角「?」按钮 / 键盘 ? / F1        关闭：Esc / 点遮罩 / 右上角 ×
 * 首次访问自动展开一次（localStorage 记住，之后不再自动弹）。
 */
(function () {
  'use strict';

  var STORE_KEY = 'voxelforge.help.seen.v1';
  var TITLE = 'VoxelForge 使用说明';
  var SUBTITLE = 'Three.js 体素世界引擎';

  var SECTIONS = [
    {
      h: '这是什么',
      p: '一个跑在浏览器里的<b>无限体素世界</b>：用 Three.js 渲染，世界按区块<b>流式加载</b>——只渲染视野内的区块，远离就回收，所以理论上可以一直往前走、一直盖。',
      list: [
        '左栏是画笔与工具，右侧大画布就是你的世界。',
        '顶部 HUD 实时显示<b>方块数</b>、当前<b>模式</b>与漫游提示。'
      ]
    },
    {
      h: '画面与漫游',
      table: [
        ['拖拽', '旋转视角'],
        ['滚轮', '推近 / 拉远'],
        ['WASD', '在地面上漫游，区块随相机无限生成'],
        ['空格', '跳跃（需先开启「行走模式」）'],
        ['行走模式', '受重力下落、停在地形上、撞墙被挡，第一人称行走']
      ]
    },
    {
      h: '编辑方块',
      p: '默认是「添加」模式，<b>左键点哪盖哪</b>。',
      table: [
        ['添加方块（左键）', '默认工具，点击放置当前笔刷'],
        ['删除方块（右键）', '先切到「删除方块」模式，再右键点方块删'],
        ['拾取并移动', '点选一块（黄框高亮），再点目标面把该块移到新位置，原位挖空'],
        ['爆破挖掘', '球形炸开一片，可调爆破半径'],
        ['填充 / 区域填充', '洪泛同色区；或两点对角框出一块区域一次性填满'],
        ['连线笔刷 / 掏空', '3D 体素直线；掏空外壳留下两层之间的空腔']
      ],
      p2: '右键删不掉时，多半还在「添加」模式——先点「删除方块」按钮再删。'
    },
    {
      h: '笔刷',
      table: [
        ['笔刷颜色', '10 种预设：草绿/泥土/岩石/沙/砾石/水/熔岩/木/叶/发光石'],
        ['笔刷尺寸', '1×1×1 / 2×2×2 / 3×3×3'],
        ['笔刷形状', '60+ 种：立方体、球形、金字塔、齿轮、心形、莫比乌斯环、DNA 双螺旋、树木…随你挑'],
        ['散布密度', '仅「散布」形状生效，控制落子稀疏程度'],
        ['镜像笔刷', '沿 X / Y / Z 轴对称落笔，方便做对称建筑']
      ]
    },
    {
      h: '世界生成与导出',
      table: [
        ['重新生成世界', '用当前「地形起伏 / 世界范围」重铺地形'],
        ['生成程序化地形', '单独触发一次 FBM 噪声地形'],
        ['导出 OBJ / PLY', '把当前世界导出成 3D 模型文件，进 Blender 等'],
        ['保存 / 读取世界', '把整个世界存到浏览器本地，下次读回'],
        ['导出 / 导入 JSON', '用文本文件备份或分享你的世界'],
        ['复制 / 粘贴', '复制选中的一块，粘贴到 +1,+1,+1 位置做堆叠'],
        ['查询包围盒 / 方块统计', '看看世界占了多大、各材质有多少块'],
        ['批量替换 / 矿脉富集', '把一类方块全换成另一类；石头邻矿自动富集出铁/金/钻石/煤']
      ]
    },
    {
      h: '物理与生态',
      table: [
        ['掉落物理', '用沙黄 / 砾石灰笔刷放的方块若悬空会下落（可关）'],
        ['岩浆模拟', '熔岩红笔刷放出的岩浆会流动、遇水冷却成石、点燃树木（可关）'],
        ['洞穴生成', '用 3D 噪声在地下雕刻洞穴（可关）'],
        ['昼夜循环', '太阳绕天运动，天空与光照随时段变化']
      ]
    },
    {
      h: '快捷键',
      table: [
        ['Ctrl + Z', '撤销上一步编辑'],
        ['Ctrl + Y / Ctrl + Shift + Z', '重做']
      ]
    },
    {
      h: '遇到问题',
      table: [
        ['双击 html 打不开 / 白屏', '本项目用了 ES Module，必须经 HTTP 打开。双击 <code>start.bat</code>，浏览器访问 <code>localhost:18082</code>'],
        ['右键删不掉', '先切到「删除方块」模式'],
        ['画布一片黑', '浏览器需支持 WebGL（现代 Chrome / Edge 都行）']
      ]
    }
  ];

  /* ---------------- 以下为通用渲染逻辑（与各应用一致） ---------------- */

  function css() {
    return [
      '.wbh-fab{position:fixed;right:18px;bottom:18px;width:42px;height:42px;border-radius:50%;',
      'background:rgba(20,26,34,.92);color:#7ee787;border:1px solid #2b3742;font:600 19px/1 ui-monospace,Menlo,Consolas,monospace;',
      'cursor:pointer;z-index:99998;display:flex;align-items:center;justify-content:center;',
      'box-shadow:0 6px 20px rgba(0,0,0,.45);transition:.16s;}',
      '.wbh-fab:hover{background:#16202b;color:#a6f0a0;transform:translateY(-2px);border-color:#7ee787;}',
      '.wbh-mask{position:fixed;inset:0;background:rgba(4,7,11,.72);backdrop-filter:blur(3px);',
      'z-index:99999;display:none;align-items:center;justify-content:center;padding:26px;}',
      '.wbh-mask.on{display:flex;}',
      '.wbh-box{background:#11151c;border:1px solid #263140;border-radius:14px;max-width:760px;width:100%;',
      'max-height:84vh;overflow:auto;color:#cdd6e0;font:13.5px/1.72 ui-sans-serif,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;',
      'box-shadow:0 24px 70px rgba(0,0,0,.6);position:relative;}',
      '.wbh-hd{position:sticky;top:0;background:linear-gradient(180deg,#141a23,#11151c);padding:18px 22px 13px;',
      'border-bottom:1px solid #202a36;display:flex;align-items:baseline;gap:10px;}',
      '.wbh-hd h2{margin:0;font-size:18px;color:#eaf2f8;letter-spacing:.5px;}',
      '.wbh-hd .sub{font-size:12px;color:#6d7d8d;}',
      '.wbh-x{position:absolute;right:14px;top:13px;width:28px;height:28px;border-radius:7px;background:transparent;',
      'border:1px solid #2b3742;color:#8b9aa8;cursor:pointer;font-size:15px;line-height:1;}',
      '.wbh-x:hover{background:#1b2530;color:#e6f2f8;}',
      '.wbh-bd{padding:6px 22px 22px;}',
      '.wbh-sec{margin-top:19px;}',
      '.wbh-sec h3{margin:0 0 7px;font-size:13.5px;color:#7ee787;letter-spacing:.6px;',
      'display:flex;align-items:center;gap:8px;}',
      '.wbh-sec h3::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,#22303c,transparent);}',
      '.wbh-sec p{margin:0 0 8px;color:#a9b8c6;}',
      '.wbh-sec ul{margin:0;padding-left:19px;color:#a9b8c6;}',
      '.wbh-sec li{margin:4px 0;}',
      '.wbh-sec b{color:#dce8f2;font-weight:600;}',
      '.wbh-t{width:100%;border-collapse:collapse;margin:2px 0 4px;}',
      '.wbh-t td{padding:6px 10px;border-bottom:1px solid #1c2530;vertical-align:top;color:#a9b8c6;}',
      '.wbh-t tr:last-child td{border-bottom:none;}',
      '.wbh-t td:first-child{width:34%;color:#dce8f2;font-weight:600;white-space:nowrap;}',
      '.wbh-bd code{background:#0b0f14;border:1px solid #1f2a35;border-radius:4px;padding:1px 6px;',
      'font:12px ui-monospace,Menlo,Consolas,monospace;color:#7ee787;}',
      '.wbh-ft{margin-top:22px;padding-top:13px;border-top:1px solid #1c2530;color:#5f6f7e;font-size:12px;}',
      '@media(max-width:640px){.wbh-t td:first-child{width:42%;white-space:normal;}}',
      /* 首次访问的「非阻塞」提示条：仅占底部一小条，绝不覆盖画布/侧栏/聊天，永不锁死应用 */
      '.wbh-hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99997;',
      'display:flex;align-items:center;gap:10px;background:rgba(17,21,28,.96);color:#cdd6e0;',
      'border:1px solid #2b3742;border-radius:10px;padding:10px 14px;',
      'font:13px ui-sans-serif,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;',
      'box-shadow:0 8px 28px rgba(0,0,0,.5);max-width:min(90vw,640px);}',
      '.wbh-hint b{color:#7ee787;}',
      '.wbh-hint-open{background:#7ee78722;border:1px solid #7ee787;color:#7ee787;border-radius:8px;',
      'padding:5px 12px;cursor:pointer;font-size:12px;flex:none;}',
      '.wbh-hint-open:hover{background:#7ee78733;}',
      '.wbh-hint-x{background:transparent;border:1px solid #2b3742;color:#8b9aa8;border-radius:6px;',
      'width:26px;height:26px;cursor:pointer;font-size:14px;line-height:1;flex:none;}',
      '.wbh-hint-x:hover{background:#1b2530;color:#e6f2f8;}'
    ].join('');
  }

  function esc(s) { return String(s); }

  function build() {
    var st = document.createElement('style');
    st.textContent = css();
    document.head.appendChild(st);

    var html = '<div class="wbh-box" role="dialog" aria-modal="true" aria-label="' + TITLE + '">' +
      '<div class="wbh-hd"><h2>' + TITLE + '</h2><span class="sub">' + SUBTITLE + '</span></div>' +
      '<button class="wbh-x" title="关闭 (Esc)">&times;</button><div class="wbh-bd">';

    SECTIONS.forEach(function (s) {
      html += '<div class="wbh-sec"><h3>' + esc(s.h) + '</h3>';
      if (s.p) html += '<p>' + s.p + '</p>';
      if (s.list) {
        html += '<ul>';
        s.list.forEach(function (li) { html += '<li>' + li + '</li>'; });
        html += '</ul>';
      }
      if (s.table) {
        html += '<table class="wbh-t"><tbody>';
        s.table.forEach(function (r) { html += '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; });
        html += '</tbody></table>';
      }
      if (s.p2) html += '<p>' + s.p2 + '</p>';
      html += '</div>';
    });

    html += '<div class="wbh-ft">随时按 <code>?</code> 或 <code>F1</code> 再次打开本说明 · <code>Esc</code> 关闭</div>';
    html += '</div></div>';

    var mask = document.createElement('div');
    mask.className = 'wbh-mask';
    mask.innerHTML = html;
    document.body.appendChild(mask);

    var fab = document.createElement('button');
    fab.className = 'wbh-fab';
    fab.textContent = '?';
    fab.title = '使用说明 (? 或 F1)';
    document.body.appendChild(fab);

    function open() { mask.classList.add('on'); }
    function close() { mask.classList.remove('on'); }
    function toggle() { mask.classList.contains('on') ? close() : open(); }

    fab.addEventListener('click', open);
    mask.querySelector('.wbh-x').addEventListener('click', close);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });

    document.addEventListener('keydown', function (e) {
      var t = e.target, tag = t && t.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
      if (e.key === 'Escape' && mask.classList.contains('on')) { close(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?' || e.key === 'F1') { e.preventDefault(); toggle(); }
    });

    try {
      if (!localStorage.getItem(STORE_KEY)) { firstVisitHint(); localStorage.setItem(STORE_KEY, '1'); }
    } catch (_) { /* 隐私模式下 localStorage 不可用，忽略 */ }

    // 首次访问提示：非阻塞小条，绝不弹出全屏遮罩锁死应用；点击可主动打开完整说明。
    function firstVisitHint() {
      var bar = document.createElement('div');
      bar.className = 'wbh-hint';
      bar.innerHTML = '<span>📖 首次使用 VoxelForge？点击右下角 <b>?</b> 随时查看完整使用说明</span>' +
        '<button class="wbh-hint-open" type="button">查看说明</button>' +
        '<button class="wbh-hint-x" type="button" title="不再提示">&times;</button>';
      document.body.appendChild(bar);
      var openBtn = bar.querySelector('.wbh-hint-open');
      var closeBtn = bar.querySelector('.wbh-hint-x');
      if (openBtn) openBtn.addEventListener('click', function () { open(); if (bar.parentNode) bar.parentNode.removeChild(bar); });
      if (closeBtn) closeBtn.addEventListener('click', function () { if (bar.parentNode) bar.parentNode.removeChild(bar); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
