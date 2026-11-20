// One tap full screen: on phones and tablets the first tap anywhere puts the game in full screen (and turns it
// sideways where the phone allows it). The ⛶ button switches full screen on and off on any device. If you leave
// full screen with the button, it stays off until you press the button again; if the phone drops out of full
// screen by itself (a swipe, a call), the next tap brings it back.
// iPhones do not allow full screen for web pages: there "Add to Home Screen" opens the game full screen instead.

VM.fullscreen = (() => {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
  const isOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  let off = false;
  try { off = localStorage.getItem('sams-gama-fs-off') === '1'; } catch (e) { /* private mode */ }
  const lock = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not allowed */ } };
  const enter = () => {
    if (!req || isOn()) return;
    try { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.then) p.then(lock).catch(() => {}); else lock(); } catch (e) { /* needs a tap */ }
  };
  const exit = () => { if (exitFn && isOn()) try { exitFn.call(document); } catch (e) { /* already out */ } };
  const remember = (v) => { off = v; try { localStorage.setItem('sams-gama-fs-off', v ? '1' : '0'); } catch (e) { /* private mode */ } };
  return {
    supported: !!req,
    isOn,
    enter,
    exit,
    toggle() { if (isOn()) { remember(true); exit(); } else { remember(false); enter(); } },
    get off() { return off; },
  };
})();

window.addEventListener('load', () => {
  const fs = VM.fullscreen, btn = document.getElementById('fsbtn');
  const touch = document.body.classList.contains('is-touch') || matchMedia('(pointer: coarse)').matches;
  const show = () => { if (!btn) return; btn.textContent = fs.isOn() ? '🗗' : '⛶'; btn.setAttribute('aria-label', fs.isOn() ? 'Leave full screen' : 'Full screen'); btn.title = btn.getAttribute('aria-label'); };
  if (btn) {
    btn.hidden = !fs.supported;
    btn.addEventListener('click', (e) => { e.stopPropagation(); fs.toggle(); });
  }
  document.addEventListener('fullscreenchange', show);
  document.addEventListener('webkitfullscreenchange', show);
  show();
  // phones: the first tap anywhere goes full screen (unless the player switched it off with the button)
  if (touch && fs.supported) {
    const tap = (e) => { if (btn && e.target === btn) return; if (!fs.off && !fs.isOn()) fs.enter(); };
    document.addEventListener('pointerup', tap, true);
    document.addEventListener('touchend', tap, true);
  }
});
