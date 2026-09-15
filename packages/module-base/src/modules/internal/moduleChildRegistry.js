class ModuleChildRegistry {
    #ownerId;
    #children;

    constructor(ownerId) {
        this.#ownerId = ownerId;
        this.#children = new Set();
    }

    get children() {
        return this.#children;
    }

    register(childModule) {
        if (childModule && typeof childModule.destroy === 'function') {
            this.#children.add(childModule);
        } else {
            console.warn(
                `BaseModule[${this.#ownerId}]: Cannot register child module without destroy method`,
            );
        }
    }

    unregister(childModule) {
        this.#children.delete(childModule);
    }

    destroyAll() {
        for (const child of this.#children) {
            try {
                child.destroy();
            } catch (error) {
                console.error(
                    `BaseModule[${this.#ownerId}]: Error destroying child module:`,
                    error,
                );
            }
        }
        this.#children.clear();
    }

    destroyAndUnregister(childModule, container) {
        if (!childModule) return null;
        this.unregister(childModule);
        childModule.destroy();
        if (container instanceof HTMLElement) {
            container.innerHTML = '';
        }
        return null;
    }

    destroyAndUnregisterAll(collection, container) {
        const modules = collection instanceof Map ? collection.values() : collection;
        for (const child of modules) {
            if (child && typeof child.destroy === 'function') {
                try {
                    this.unregister(child);
                    child.destroy();
                } catch (error) {
                    console.error(
                        `BaseModule[${this.#ownerId}]: Error in destroyAndUnregisterAll:`,
                        error,
                    );
                }
            }
        }
        collection.clear();
        if (container instanceof HTMLElement) {
            container.innerHTML = '';
        }
    }

    showAll() {
        this.#children.forEach((childModule) => {
            if (childModule && typeof childModule.show === 'function') {
                childModule.show();
            }
        });
    }

    hideAll() {
        this.#children.forEach((childModule) => {
            if (childModule && typeof childModule.hide === 'function') {
                childModule.hide();
            }
        });
    }
}

export { ModuleChildRegistry };
