// Always landscape on phones: when a phone is held upright, the whole game is shown turned sideways
// (nobody is asked to rotate). While turned:
//  - window.innerWidth / innerHeight report the landscape size (the game, 3D views and ride use them),
//  - the screen-size rules in the style sheet are re-checked as if the screen were landscape,
//  - the joystick turns its directions to match.

(function () {
  const root = document.documentElement;
  const realW = () => root.clientWidth || screen.width;
  const realH = () => root.clientHeight || screen.height;
  const isPhone = () => window.matchMedia('(pointer: coarse)').matches && Math.min(realW(), realH()) < 900;
  VM.turned = false;

  try {
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => (VM.turned ? realH() : realW()) });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => (VM.turned ? realW() : realH()) });
  } catch (e) { /* not allowed: the page simply stays upright */ }

  // ---- screen-size rules (@media) checked against the landscape size while turned
  let saved = null, extra = null;
  function matches(cond, w, h) {
    return cond.split(',').some((alt) => alt.split(/\band\b/).every((part) => {
      const m = part.trim().match(/^\(\s*([a-z-]+)\s*:\s*([^)]+)\)$/);
      if (!m) return window.matchMedia(part.trim()).matches;
      const [, f, v] = m, px = parseFloat(v);
      switch (f) {
        case 'orientation': return v.trim() === (w >= h ? 'landscape' : 'portrait');
        case 'max-width': return w <= px; case 'min-width': return w >= px;
        case 'max-height': return h <= px; case 'min-height': return h >= px;
        default: return window.matchMedia(part.trim()).matches;
      }
    }));
  }
  function sizeRule(r) { return r.type === CSSRule.MEDIA_RULE && /(width|height|orientation)/.test(r.conditionText || r.media.mediaText); }
  function turnMedia(on) {
    const sheets = [...document.styleSheets].filter((s) => { try { return s.cssRules && s.href && /style\.css/.test(s.href); } catch (e) { return false; } });
    if (on && !saved) {
      saved = [];
      let css = '';
      const w = realH(), h = realW();
      sheets.forEach((sheet) => {
        for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
          const r = sheet.cssRules[i];
          if (!sizeRule(r)) continue;
          saved.unshift({ sheet, i, text: r.cssText, cond: r.conditionText || r.media.mediaText, inner: [...r.cssRules].map((x) => x.cssText).join('\n') });
          sheet.deleteRule(i);
        }
      });
      saved.forEach((s) => { if (matches(s.cond, w, h)) css += s.inner + '\n'; });
      extra = document.createElement('style'); extra.id = 'turned-media'; extra.textContent = css; document.head.appendChild(extra);
    } else if (!on && saved) {
      saved.forEach((s) => { try { s.sheet.insertRule(s.text, Math.min(s.i, s.sheet.cssRules.length)); } catch (e) { /* skip */ } });
      saved = null;
      if (extra) { extra.remove(); extra = null; }
    }
  }

  function update() {
    const turn = isPhone() && realH() > realW();
    if (turn === VM.turned) return;
    VM.turned = turn;
    root.classList.toggle('force-landscape', turn);
    turnMedia(turn);
    if (VM.game && VM.game.scale) VM.game.scale.resize(window.innerWidth, window.innerHeight);
    window.dispatchEvent(new Event('resize'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update); else update();
  window.addEventListener('load', () => { if (VM.turned) { turnMedia(false); turnMedia(true); } else update(); });
  window.addEventListener('resize', () => { update(); const sc = VM.game && VM.game.scale; if (sc && sc.scaleMode === Phaser.Scale.NONE) sc.resize(window.innerWidth, window.innerHeight); });
  window.addEventListener('orientationchange', () => setTimeout(update, 200));

  // a touch movement on the turned page: screen down = page right, screen left = page down
  VM.turnXY = (dx, dy) => (VM.turned ? [dy, -dx] : [dx, dy]);
})();
