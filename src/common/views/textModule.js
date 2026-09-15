/**
 * TextModule — a titled text block on ContentModule.
 *
 * Title and body both come from the glossary entry under `glossaryKey` (its `title`
 * and `body` fields); the module renders no copy of its own.
 */

import { ContentModule } from '@tba3/module-base';

class TextModule extends ContentModule {
    constructor(id, container, options = {}) {
        super(id, container, options);
        this.setDefaults({ showModuleTitle: true });
    }

    /**
     * Render body text into the content container.
     * @override
     * @param {*} _data - Data payload from parent view (unused)
     */
    async _doRenderContent(_data) {
        const html = this.glossaryBody ?? '';
        if (html) {
            this.contentContainer.innerHTML = html;
        }
    }
}

export { TextModule };
