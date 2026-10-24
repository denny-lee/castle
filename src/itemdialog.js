// A small paper-coloured window with a text box, for typing the items of a new
// card. Resolves to the text on Ctrl+Enter, or to null on Escape / Cancel.

export function askItems(subject) {
  return new Promise((resolve) => {
    const shade = document.createElement('div');
    shade.style.cssText = 'position:fixed;inset:0;background:rgba(23,21,15,.45);'
      + 'display:flex;align-items:center;justify-content:center;z-index:10;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#f8f5ea;border:1.5px solid #3a362e;padding:20px 24px;'
      + 'width:min(560px,90vw);font:15px/1.5 Georgia,serif;color:#3a362e;cursor:default;'
      + 'box-shadow:0 6px 30px rgba(0,0,0,.3);';

    const title = document.createElement('div');
    title.textContent = `Add a card to ${subject}`;
    title.style.cssText = 'font-weight:bold;font-size:18px;margin-bottom:4px;';

    const hint = document.createElement('div');
    hint.textContent = 'One item per line.   Ctrl+Enter  add the card     Esc  cancel';
    hint.style.cssText = 'font-size:12px;opacity:.6;margin-bottom:10px;';

    const area = document.createElement('textarea');
    area.rows = 10;
    area.spellcheck = false;
    area.style.cssText = 'width:100%;box-sizing:border-box;font:15px/1.5 Georgia,serif;'
      + 'background:#fffdf6;color:#3a362e;border:1px solid #8a8272;padding:8px;resize:vertical;';

    box.append(title, hint, area);
    shade.append(box);
    document.body.append(shade);
    area.focus();

    let composing = false;
    area.addEventListener('compositionstart', () => { composing = true; });
    area.addEventListener('compositionend', () => { composing = false; });

    const finish = (value) => {
      shade.remove();
      resolve(value);
    };
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (composing || e.isComposing) return;   // Enter confirms an IME candidate
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(area.value); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    });
    shade.addEventListener('mousedown', (e) => { if (e.target === shade) finish(null); });
  });
}

/** A one-line prompt. Resolves to the typed text on Enter, or null on Escape. */
export function askText(title, { initial = '', confirm = 'create' } = {}) {
  return new Promise((resolve) => {
    const shade = document.createElement('div');
    shade.style.cssText = 'position:fixed;inset:0;background:rgba(23,21,15,.45);'
      + 'display:flex;align-items:center;justify-content:center;z-index:10;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#f8f5ea;border:1.5px solid #3a362e;padding:20px 24px;'
      + 'width:min(420px,90vw);font:15px/1.5 Georgia,serif;color:#3a362e;cursor:default;'
      + 'box-shadow:0 6px 30px rgba(0,0,0,.3);';

    const head = document.createElement('div');
    head.textContent = title;
    head.style.cssText = 'font-weight:bold;font-size:18px;margin-bottom:4px;';

    const hint = document.createElement('div');
    hint.textContent = `Enter  ${confirm}     Esc  cancel`;
    hint.style.cssText = 'font-size:12px;opacity:.6;margin-bottom:10px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 60;
    input.spellcheck = false;
    input.value = initial;
    input.style.cssText = 'width:100%;box-sizing:border-box;font:16px Georgia,serif;'
      + 'background:#fffdf6;color:#3a362e;border:1px solid #8a8272;padding:8px;';

    box.append(head, hint, input);
    shade.append(box);
    document.body.append(shade);
    input.focus();
    input.select();

    let composing = false;
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });

    const finish = (value) => { shade.remove(); resolve(value); };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (composing || e.isComposing) return;   // Enter confirms an IME candidate
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    });
    shade.addEventListener('mousedown', (e) => { if (e.target === shade) finish(null); });
  });
}
