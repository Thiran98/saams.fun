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
  // drawn icons (an emoji or symbol can show as an empty box on some phones)
  const ICON_ON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';
  const show = () => { if (!btn) return; btn.innerHTML = fs.isOn() ? ICON_OFF : ICON_ON; btn.setAttribute('aria-label', fs.isOn() ? 'Leave full screen' : 'Full screen'); btn.title = btn.getAttribute('aria-label'); };
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
