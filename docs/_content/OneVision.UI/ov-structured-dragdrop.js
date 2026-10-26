const handlers = new WeakMap();
const mime = 'application/x-onevision-drag';

export function attach(root, dotnet, context) {
    if (!root || !dotnet || !context || handlers.has(root)) return;

    let activeTarget = null;

    const clearActive = () => {
        if (activeTarget) activeTarget.classList.remove('ov-drag-target--active');
        activeTarget = null;
    };

    const payloadFrom = source => ({
        context: source.dataset.ovDragContext,
        key: source.dataset.ovDragKey
    });

    const findTarget = event => {
        if (!(event.target instanceof Element)) return null;
        const target = event.target.closest('[data-ov-drop-key][data-ov-drop-context]');
        if (!target || !root.contains(target) || target.dataset.ovDropContext !== context) return null;
        if (target.getAttribute('aria-disabled') === 'true') return null;
        return target;
    };

    const dragstart = event => {
        if (!(event.target instanceof Element) || !event.dataTransfer) return;
        const source = event.target.closest('[data-ov-drag-key][data-ov-drag-context]');
        if (!source || !root.contains(source) || source.dataset.ovDragContext !== context) return;

        const payload = payloadFrom(source);
        if (!payload.key) return;

        event.dataTransfer.clearData();
        event.dataTransfer.setData(mime, JSON.stringify(payload));
        event.dataTransfer.setData('text/plain', payload.key);
        event.dataTransfer.effectAllowed = 'copyMove';
    };

    const dragover = event => {
        const target = findTarget(event);
        if (!target || !event.dataTransfer) {
            clearActive();
            return;
        }

        const raw = event.dataTransfer.getData(mime);
        if (!raw) return;

        try {
            const payload = JSON.parse(raw);
            if (payload.context !== context || !payload.key) return;
        } catch {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        if (activeTarget !== target) {
            clearActive();
            activeTarget = target;
            activeTarget.classList.add('ov-drag-target--active');
        }
    };

    const dragleave = event => {
        if (!activeTarget || !(event.relatedTarget instanceof Node) || activeTarget.contains(event.relatedTarget)) return;
        clearActive();
    };

    const drop = event => {
        const target = findTarget(event);
        if (!target || !event.dataTransfer) return;

        const raw = event.dataTransfer.getData(mime);
        if (!raw) return;

        let payload;
        try {
            payload = JSON.parse(raw);
        } catch {
            return;
        }

        if (payload.context !== context || !payload.key || !target.dataset.ovDropKey) return;

        event.preventDefault();
        clearActive();
        dotnet.invokeMethodAsync('OnNativeDrop', payload.key, target.dataset.ovDropKey);
    };

    const dragend = () => clearActive();

    root.addEventListener('dragstart', dragstart);
    root.addEventListener('dragover', dragover);
    root.addEventListener('dragleave', dragleave);
    root.addEventListener('drop', drop);
    root.addEventListener('dragend', dragend);

    handlers.set(root, { dragstart, dragover, dragleave, drop, dragend, clearActive });
}

export function detach(root) {
    const h = handlers.get(root);
    if (!h) return;

    h.clearActive();
    root.removeEventListener('dragstart', h.dragstart);
    root.removeEventListener('dragover', h.dragover);
    root.removeEventListener('dragleave', h.dragleave);
    root.removeEventListener('drop', h.drop);
    root.removeEventListener('dragend', h.dragend);
    handlers.delete(root);
}
