const handlers = new WeakMap();

export function attach(root) {
    if (!root || handlers.has(root)) return;

    const handler = event => {
        const source = event.target instanceof Element
            ? event.target.closest('[draggable="true"]')
            : null;

        if (!source || !root.contains(source) || !event.dataTransfer) return;

        event.dataTransfer.clearData();
        event.dataTransfer.setData('application/x-onevision-structured-field', 'onevision-structured-field');
        event.dataTransfer.setData('text/plain', source.textContent?.trim() || 'OneVision field');
        event.dataTransfer.effectAllowed = 'copyMove';
    };

    root.addEventListener('dragstart', handler);
    handlers.set(root, handler);
}

export function detach(root) {
    const handler = handlers.get(root);
    if (!handler) return;

    root.removeEventListener('dragstart', handler);
    handlers.delete(root);
}
