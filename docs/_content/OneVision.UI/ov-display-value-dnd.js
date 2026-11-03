const registrations = new WeakMap();

export function attach(root, dotnet) {
    if (!root || registrations.has(root)) return;

    root.dataset.dragReady = 'true';
    let sourceId = null;

    const tokenFrom = target => target instanceof Element
        ? target.closest('[data-segment-id]')
        : null;

    const onDragStart = event => {
        const token = tokenFrom(event.target);
        if (!token || !token.draggable) return;

        sourceId = token.dataset.segmentId || null;
        if (!sourceId) return;

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', sourceId);
        token.classList.add('ov-display-value-builder__segment--dragging');
    };

    const onDragOver = event => {
        if (!sourceId || !tokenFrom(event.target)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    };

    const onDrop = event => {
        const target = tokenFrom(event.target);
        if (!target || !sourceId) return;

        event.preventDefault();
        const transferred = event.dataTransfer.getData('text/plain');
        const from = transferred || sourceId;
        const to = target.dataset.segmentId;

        clearDragging(root);
        sourceId = null;

        if (from && to && from !== to)
            void dotnet.invokeMethodAsync('HandleDisplayValueDrop', from, to);
    };

    const onDragEnd = () => {
        clearDragging(root);
        sourceId = null;
    };

    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);

    registrations.set(root, { onDragStart, onDragOver, onDrop, onDragEnd });
}

export function detach(root) {
    const registration = root ? registrations.get(root) : null;
    if (!root || !registration) return;

    root.removeEventListener('dragstart', registration.onDragStart);
    root.removeEventListener('dragover', registration.onDragOver);
    root.removeEventListener('drop', registration.onDrop);
    root.removeEventListener('dragend', registration.onDragEnd);
    registrations.delete(root);
    delete root.dataset.dragReady;
    clearDragging(root);
}

function clearDragging(root) {
    root.querySelectorAll('.ov-display-value-builder__segment--dragging')
        .forEach(token => token.classList.remove('ov-display-value-builder__segment--dragging'));
}
