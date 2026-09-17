/* VoxelForge 设置面板
 * 自包含组件：只注入自己的 DOM/样式，不读写业务变量、不改动渲染逻辑。
 * 打开：右下角「⚙」按钮    关闭：Esc / 点遮罩 / 右上角 ×
 * 设置项：全屏模式、界面缩放、减少动画、重置新手引导、恢复默认。
 */
(function () {
  'use strict';

  var APP = 'voxelforge';
  var TITLE = 'VoxelForge 设置';
  var ACCENT = '#7ee787';
  var STORE_KEY = APP + '.settings.v1';
  var HELP_SEEN_RE = /\.help\.seen\./;

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      // 必须是普通对象：存进来的若是字符串/数字/数组，调用方的 s.xxx = 赋值
      // 会在严格模式下抛 TypeError，导致整个开关失灵
      return (s && typeof s === 'object' && !Array.isArray(s)) ? s : {};
    } catch (e) { return {}; }
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  var RM_ID = 'wbs-rm-' + APP;
  function applyReduceMotion(on) {
    var tag = document.getElementById(RM_ID);
    if (on) {
      if (!tag) {
        tag = document.createElement('style');
        tag.id = RM_ID;
        tag.textContent = '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-iteration-count:1!important}';
        document.head.appendChild(tag);
      }
    } else if (tag) {
      tag.parentNode.removeChild(tag);
    }
    var s = load(); s.reduceMotion = !!on; save(s);
    var cb = document.getElementById('wbs-reduce');
    if (cb) cb.checked = !!on;
  }

  var BF_ID = 'wbs-bf-' + APP;
  function applyBigFont(on) {
    var tag = document.getElementById(BF_ID);
    if (on) {
      if (!tag) {
        tag = document.createElement('style');
        tag.id = BF_ID;
        tag.textContent = 'html{font-size:118%!important;}';
        document.head.appendChild(tag);
      }
    } else if (tag) {
      tag.parentNode.removeChild(tag);
    }
    var s = load(); s.bigFont = !!on; save(s);
    var cb = document.getElementById('wbs-bigfont');
    if (cb) cb.checked = !!on;
  }

  var HC_ID = 'wbs-hc-' + APP;
  function applyHighContrast(on) {
    var tag = document.getElementById(HC_ID);
    if (on) {
      if (!tag) {
        tag = document.createElement('style');
        tag.id = HC_ID;
        tag.textContent = 'html.wbs-hc body{filter:contrast(1.18) brightness(0.94) saturate(1.05);} html.wbs-hc{color-scheme:dark;}';
        document.head.appendChild(tag);
        document.documentElement.classList.add('wbs-hc');
      }
    } else if (tag) {
      tag.parentNode.removeChild(tag);
      document.documentElement.classList.remove('wbs-hc');
    }
    var s = load(); s.highContrast = !!on; save(s);
    var cb = document.getElementById('wbs-hc');
    if (cb) cb.checked = !!on;
  }

  function applyZoom(v) {
    v = Math.max(40, Math.min(200, v | 0));
    document.body.style.zoom = v + '%';
    var s = load(); s.zoom = v; save(s);
    var sl = document.getElementById('wbs-zoom');
    if (sl) sl.value = v;
    var out = document.getElementById('wbs-zoomval');
    if (out) out.textContent = v + '%';
  }

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function toggleFs() {
    var d = document, el = d.documentElement;
    if (!fsEl()) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } else {
      if (d.exitFullscreen) d.exitFullscreen();
      else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
    }
  }
  function syncFs() {
    var on = !!fsEl();
    var btn = document.getElementById('wbs-fs');
    if (btn) btn.textContent = (on ? '退出全屏' : '进入全屏') + '  (F)';
    var s = load(); s.fullscreen = on; save(s);
  }

  function resetTutorial() {
    Object.keys(localStorage).forEach(function (k) {
      if (HELP_SEEN_RE.test(k)) localStorage.removeItem(k);
    });
    location.reload();
  }
  function resetAll() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    Object.keys(localStorage).forEach(function (k) {
      if (HELP_SEEN_RE.test(k)) localStorage.removeItem(k);
    });
    location.reload();
  }

  function css() {
    return [
      '.wbs-fab{position:fixed;right:18px;bottom:70px;width:42px;height:42px;border-radius:50%;',
      'background:rgba(20,26,34,.92);color:' + ACCENT + ';border:1px solid #2b3742;',
      'font:600 19px/1 ui-monospace,Menlo,Consolas,monospace;cursor:pointer;z-index:99998;',
      'display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.45);transition:.16s;}',
      '.wbs-fab:hover{background:#16202b;transform:translateY(-2px);border-color:' + ACCENT + ';}',
      '.wbs-mask{position:fixed;inset:0;background:rgba(4,7,11,.72);backdrop-filter:blur(3px);',
      'z-index:99999;display:none;align-items:center;justify-content:center;padding:26px;}',
      '.wbs-mask.on{display:flex;}',
      '.wbs-box{background:#11151c;border:1px solid #263140;border-radius:14px;max-width:520px;width:100%;',
      'max-height:84vh;overflow:auto;color:#cdd6e0;font:13.5px/1.72 ui-sans-serif,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;',
      'box-shadow:0 24px 70px rgba(0,0,0,.6);position:relative;}',
      '.wbs-hd{position:sticky;top:0;background:linear-gradient(180deg,#141a23,#11151c);padding:18px 22px 13px;',
      'border-bottom:1px solid #202a36;display:flex;align-items:baseline;gap:10px;}',
      '.wbs-hd h2{margin:0;font-size:18px;color:#eaf2f8;letter-spacing:.5px;}',
      '.wbs-x{position:absolute;right:14px;top:13px;width:28px;height:28px;border-radius:7px;background:transparent;',
      'border:1px solid #2b3742;color:#8b9aa8;cursor:pointer;font-size:15px;line-height:1;}',
      '.wbs-x:hover{background:#1b2530;color:#e6f2f8;}',
      '.wbs-bd{padding:8px 22px 22px;}',
      '.wbs-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 2px;',
      'border-bottom:1px solid #1c2530;}',
      '.wbs-row:last-child{border-bottom:none;}',
      '.wbs-row .lab{color:#dce8f2;font-weight:600;}',
      '.wbs-row .desc{color:#8b9aa8;font-size:12px;margin-top:2px;}',
      '.wbs-btn{background:#1b2530;color:#dce8f2;border:1px solid #2b3742;border-radius:8px;',
      'padding:8px 14px;cursor:pointer;font-size:13px;min-width:118px;text-align:center;transition:.15s;}',
      '.wbs-btn:hover{background:#243140;border-color:' + ACCENT + ';color:#fff;}',
      '.wbs-btn.primary{background:' + ACCENT + '22;border-color:' + ACCENT + ';color:' + ACCENT + ';}',
      '.wbs-slider{width:200px;}',
      '.wbs-zoomval{color:' + ACCENT + ';font-weight:600;min-width:46px;text-align:right;}',
      '.wbs-check{width:18px;height:18px;accent-color:' + ACCENT + ';cursor:pointer;}',
      '.wbs-ft{margin-top:16px;padding-top:13px;border-top:1px solid #1c2530;color:#5f6f7e;font-size:12px;}'
    ].join('');
  }

  function build() {
    var st = document.createElement('style');
    st.textContent = css();
    document.head.appendChild(st);

    var html = '<div class="wbs-box" role="dialog" aria-modal="true" aria-label="' + TITLE + '">' +
      '<div class="wbs-hd"><h2>' + TITLE + '</h2></div>' +
      '<button class="wbs-x" title="关闭 (Esc)">&times;</button><div class="wbs-bd">';

    html += '<div class="wbs-row"><div><div class="lab">全屏模式</div>' +
      '<div class="desc">铺满整个屏幕，按 Esc 或右下角按钮退出</div></div>' +
      '<button class="wbs-btn primary" id="wbs-fs">进入全屏  (F)</button></div>';

    html += '<div class="wbs-row"><div><div class="lab">界面缩放</div>' +
      '<div class="desc">放大或缩小整个界面（浏览器级缩放）</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<input type="range" class="wbs-slider" id="wbs-zoom" min="40" max="200" step="5" value="100">' +
      '<span class="wbs-zoomval" id="wbs-zoomval">100%</span></div></div>';

    html += '<div class="wbs-row"><div><div class="lab">减少动画</div>' +
      '<div class="desc">关闭过渡与循环动画，性能更稳、更护眼</div></div>' +
      '<input type="checkbox" class="wbs-check" id="wbs-reduce"></div>';

    html += '<div class="wbs-row"><div><div class="lab">大字体模式</div>' +
      '<div class="desc">整体放大文字，适合远距离或高 DPI 屏</div></div>' +
      '<input type="checkbox" class="wbs-check" id="wbs-bigfont"></div>';

    html += '<div class="wbs-row"><div><div class="lab">高对比度</div>' +
      '<div class="desc">加深暗部、提亮文字，弱光环境更清晰</div></div>' +
      '<input type="checkbox" class="wbs-check" id="wbs-hc"></div>';

    html += '<div class="wbs-row"><div><div class="lab">重置新手引导</div>' +
      '<div class="desc">清空"已看过说明"标记，刷新后再次自动弹出</div></div>' +
      '<button class="wbs-btn" id="wbs-reset-tut">重置引导</button></div>';

    html += '<div class="wbs-row"><div><div class="lab">恢复默认设置</div>' +
      '<div class="desc">清空所有设置与引导标记，刷新后回到初始状态</div></div>' +
      '<button class="wbs-btn" id="wbs-reset-all">恢复默认</button></div>';

    html += '<div class="wbs-ft">随时点击右下角 ⚙ 重新打开本设置 · <code>Esc</code> 关闭</div>';
    html += '</div></div>';

    var mask = document.createElement('div');
    mask.className = 'wbs-mask';
    mask.innerHTML = html;
    document.body.appendChild(mask);

    var fab = document.createElement('button');
    fab.className = 'wbs-fab';
    fab.textContent = '⚙';
    fab.title = '设置';
    document.body.appendChild(fab);

    function open() { mask.classList.add('on'); }
    function close() { mask.classList.remove('on'); }
    function toggle() { mask.classList.contains('on') ? close() : open(); }

    fab.addEventListener('click', open);
    mask.querySelector('.wbs-x').addEventListener('click', close);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });

    mask.querySelector('#wbs-fs').addEventListener('click', toggleFs);
    mask.querySelector('#wbs-zoom').addEventListener('input', function (e) { applyZoom(+e.target.value); });
    mask.querySelector('#wbs-reduce').addEventListener('change', function (e) { applyReduceMotion(e.target.checked); });
    mask.querySelector('#wbs-bigfont').addEventListener('change', function (e) { applyBigFont(e.target.checked); });
    mask.querySelector('#wbs-hc').addEventListener('change', function (e) { applyHighContrast(e.target.checked); });
    mask.querySelector('#wbs-reset-tut').addEventListener('click', resetTutorial);
    mask.querySelector('#wbs-reset-all').addEventListener('click', resetAll);

    // 面板打开时拦截宿主应用的全局快捷键。4 个应用都在 window 上绑了全局 keydown
    // （重新渲染 / 保存图片 / 删除选中元素 / 角色移动…），不拦截的话在设置面板里按键
    // 会穿透到背后的应用误触发。
    // 只吞 keydown/keypress，**绝不吞 keyup**：否则面板打开前按住的移动键收不到 keyup，
    // 会永远卡在「按住」状态（voxel-world 的 keys[] 就是这么记录的）。
    function isFormField(t) {
      var tag = t && t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(t && t.isContentEditable);
    }
    function onKeyCapture(e) {
      if (!mask.classList.contains('on')) return;
      if (e.type === 'keydown') {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
        if (!isFormField(e.target) && (e.key === 'f' || e.key === 'F') &&
            !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); e.stopPropagation(); toggleFs(); return;
        }
      }
      if (e.key === 'Tab') return;   // 保留键盘焦点遍历
      e.stopPropagation();           // 其余按键不再传给宿主应用（不影响输入框默认行为）
    }
    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('keypress', onKeyCapture, true);

    document.addEventListener('fullscreenchange', syncFs);
    document.addEventListener('webkitfullscreenchange', syncFs);

    var s = load();
    if (s.zoom) applyZoom(s.zoom);
    if (s.reduceMotion) applyReduceMotion(true);
    if (s.bigFont) applyBigFont(true);
    if (s.highContrast) applyHighContrast(true);
    syncFs();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
