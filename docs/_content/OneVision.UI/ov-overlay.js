const overlays = new Map();
const anchoredPopovers = new Map();
let activeAnchoredPopoverId = null;
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

function triggerIsMeaningfullyVisible(trigger) {
  if (!trigger || !document.contains(trigger)) return false;
  const rect = trigger.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function positionAnchoredPopover(state) {
  if (!triggerIsMeaningfullyVisible(state.trigger)) {
    requestAnchoredPopoverClose(state.id, true);
    return;
  }

  const gap = 4;
  const viewportGap = 8;
  const triggerRect = state.trigger.getBoundingClientRect();
  const surfaceRect = state.surface.getBoundingClientRect();
  const availableBelow = window.innerHeight - triggerRect.bottom - viewportGap;
  const availableAbove = triggerRect.top - viewportGap;
  const openAbove = availableBelow < surfaceRect.height + gap && availableAbove > availableBelow;

  let top = openAbove
    ? triggerRect.top - surfaceRect.height - gap
    : triggerRect.bottom + gap;

  top = Math.max(viewportGap, Math.min(top, window.innerHeight - surfaceRect.height - viewportGap));

  let left = state.alignRight
    ? triggerRect.right - surfaceRect.width
    : triggerRect.left;

  left = Math.max(viewportGap, Math.min(left, window.innerWidth - surfaceRect.width - viewportGap));

  state.surface.style.top = `${Math.round(top)}px`;
  state.surface.style.left = `${Math.round(left)}px`;
  state.surface.dataset.ovPopoverPlacement = openAbove ? 'above' : 'below';
}

function restoreAnchoredSurface(state) {
  if (!state.surface) return;

  if (state.placeholder?.parentNode) {
    state.placeholder.parentNode.insertBefore(state.surface, state.placeholder);
    state.placeholder.remove();
  } else if (state.surface.isConnected) {
    state.surface.remove();
  }

  state.surface.style.removeProperty('top');
  state.surface.style.removeProperty('left');
  state.surface.style.removeProperty('max-width');
  state.surface.style.removeProperty('max-height');
  state.surface.style.removeProperty('overflow-y');
  delete state.surface.dataset.ovPopoverPlacement;
  delete state.surface.dataset.ovPopoverPortalled;
}

function teardownAnchoredPopover(state, restoreFocus) {
  document.removeEventListener('pointerdown', state.onPointerDown, true);
  document.removeEventListener('keydown', state.onKeyDown, true);
  window.removeEventListener('resize', state.onResize);
  document.removeEventListener('scroll', state.onScroll, true);

  restoreAnchoredSurface(state);

  if (restoreFocus && state.trigger && document.contains(state.trigger)) {
    state.trigger.focus();
  }

  anchoredPopovers.delete(state.id);
  if (activeAnchoredPopoverId === state.id) activeAnchoredPopoverId = null;
}

function requestAnchoredPopoverClose(id, restoreFocus) {
  const state = anchoredPopovers.get(id);
  if (!state || state.closing) return;
  state.closing = true;
  teardownAnchoredPopover(state, restoreFocus);
  state.dotnet.invokeMethodAsync('HandlePopoverCloseFromJs');
}

export function activateAnchoredPopover(id, trigger, surface, dotnet, alignRight = true) {
  if (!trigger || !surface || anchoredPopovers.has(id)) return;

  if (activeAnchoredPopoverId && activeAnchoredPopoverId !== id) {
    requestAnchoredPopoverClose(activeAnchoredPopoverId, true);
  }

  const placeholder = document.createComment(`ov-popover:${id}`);
  surface.parentNode?.insertBefore(placeholder, surface);
  document.body.appendChild(surface);
  surface.dataset.ovPopoverPortalled = 'true';
  surface.style.maxWidth = 'calc(100vw - 16px)';
  surface.style.maxHeight = 'calc(100vh - 16px)';
  surface.style.overflowY = 'auto';

  const state = {
    id,
    trigger,
    surface,
    dotnet,
    alignRight,
    placeholder,
    closing: false,
    onPointerDown: null,
    onKeyDown: null,
    onResize: null,
    onScroll: null
  };

  state.onPointerDown = event => {
    const target = event.target;
    if (state.surface.contains(target) || state.trigger.contains(target)) return;
    requestAnchoredPopoverClose(id, true);
  };

  state.onKeyDown = event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    requestAnchoredPopoverClose(id, true);
  };

  state.onResize = () => positionAnchoredPopover(state);
  state.onScroll = () => positionAnchoredPopover(state);

  anchoredPopovers.set(id, state);
  activeAnchoredPopoverId = id;

  document.addEventListener('pointerdown', state.onPointerDown, true);
  document.addEventListener('keydown', state.onKeyDown, true);
  window.addEventListener('resize', state.onResize);
  document.addEventListener('scroll', state.onScroll, true);

  positionAnchoredPopover(state);

  window.requestAnimationFrame(() => {
    const firstItem = state.surface.querySelector('[role="menuitem"]:not([disabled])');
    if (firstItem instanceof HTMLElement) firstItem.focus();
  });
}

export function deactivateAnchoredPopover(id, restoreFocus = true) {
  const state = anchoredPopovers.get(id);
  if (!state) return;
  teardownAnchoredPopover(state, restoreFocus);
}
