// Keyboard -> semantic actions. Scenes receive actions, never raw key events.

const MAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Space: 'open', Enter: 'open', NumpadEnter: 'open',
  Escape: 'back', Backspace: 'back',
  KeyD: 'done', KeyY: 'yes', KeyN: 'no', KeyT: 'timeline',
  KeyE: 'export', KeyI: 'import', Slash: 'help', KeyH: 'help',
};

for (let i = 1; i <= 9; i++) {
  MAP['Digit' + i] = 'shelf' + i;
  MAP['Numpad' + i] = 'shelf' + i;
}

export function installInput(onAction) {
  const held = new Set();

  function keydown(e) {
    const action = MAP[e.code];
    if (!action) return;
    e.preventDefault();
    // Let arrows auto-repeat so holding a key keeps turning; everything else
    // fires once per physical press.
    const repeatable = action === 'left' || action === 'right' ||
                       action === 'up' || action === 'down';
    if (e.repeat && !repeatable) return;
    if (!repeatable && held.has(e.code)) return;
    held.add(e.code);
    onAction(action, e);
  }

  function keyup(e) { held.delete(e.code); }

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', () => held.clear());
  return () => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
  };
}
