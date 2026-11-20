// Touch controls for phones and tablets: a joystick on the left and a "Use" button on the right.
// The scene reads VM.input every frame (keyboard is handled in the scene itself).

VM.input = { x: 0, y: 0, action: false, eat: false };

(function () {
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const action = document.getElementById('action');
  const RADIUS = 40;
  let pointer = null, cx = 0, cy = 0;

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('is-touch');
  window.addEventListener('touchstart', () => document.body.classList.add('is-touch'), { once: true });

  function move(e) {
    let [dx, dy] = VM.turnXY ? VM.turnXY(e.clientX - cx, e.clientY - cy) : [e.clientX - cx, e.clientY - cy]; // the page may be turned sideways
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
    VM.input.x = dx / RADIUS;
    VM.input.y = dy / RADIUS;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function end(e) {
    if (e.pointerId !== pointer) return;
    pointer = null;
    VM.input.x = 0; VM.input.y = 0;
    knob.style.transform = 'translate(-50%, -50%)';
  }

  stick.addEventListener('pointerdown', (e) => {
    pointer = e.pointerId;
    stick.setPointerCapture(pointer);
    const box = stick.getBoundingClientRect();
    cx = box.left + box.width / 2;
    cy = box.top + box.height / 2;
    move(e);
  });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) move(e); });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  action.addEventListener('pointerdown', (e) => { e.preventDefault(); VM.input.action = true; });
})();
