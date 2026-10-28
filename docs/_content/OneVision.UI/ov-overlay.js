const overlays = new Map();
let scrollLockCount = 0;
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

const selector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',');

function focusables(root) {
  return Array.from(root.querySelectorAll(selector)).filter(element => {
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && !element.hasAttribute('aria-hidden');
  });
}

function initialFocus(surface) {
  const explicit = surface.querySelector('[data-ov-overlay-autofocus]');
  if (explicit instanceof HTMLElement && !explicit.hasAttribute('disabled')) return explicit;

  const body = surface.querySelector('.ov-overlay__body');
  if (body) {
    const bodyItems = focusables(body);
    if (bodyItems.length > 0) return bodyItems[0];
  }

  const close = surface.querySelector('.ov-overlay__close:not([disabled])');
  if (close instanceof HTMLElement) return close;

  const items = focusables(surface);
  return items[0] ?? surface;
}

function acquireScrollLock() {
  if (scrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  }
  scrollLockCount += 1;
}

function releaseScrollLock() {
  if (scrollLockCount === 0) return;
  scrollLockCount -= 1;
  if (scrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.paddingRight = originalBodyPaddingRight;
  }
}

function isTopmost(id) {
  const ids = Array.from(overlays.keys());
  return ids.length > 0 && ids[ids.length - 1] === id;
}

export function activate(id, surface, dotnet, lockScroll) {
  if (!surface || overlays.has(id)) return;

  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (lockScroll) acquireScrollLock();

  const onKeyDown = event => {
    if (!isTopmost(id)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dotnet.invokeMethodAsync('HandleEscapeFromJs');
      return;
    }

    if (event.key !== 'Tab') return;
    const items = focusables(surface);

    if (items.length === 0) {
      event.preventDefault();
      surface.focus();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !surface.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !surface.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  surface.addEventListener('keydown', onKeyDown, true);
  overlays.set(id, { surface, trigger, dotnet, onKeyDown, lockScroll });
  initialFocus(surface).focus();
}

export function deactivate(id, restoreFocus = true) {
  const state = overlays.get(id);
  if (!state) return;

  state.surface?.removeEventListener('keydown', state.onKeyDown, true);
  if (state.lockScroll) releaseScrollLock();

  if (restoreFocus && state.trigger && document.contains(state.trigger)) {
    state.trigger.focus();
  }

  overlays.delete(id);
}
