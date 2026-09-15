/**
 * Append a segmented button’s label, glossary-stamped when a key is given.
 * @param {HTMLElement} button - The button to label.
 * @param {object} [options] - The label text and its optional glossary key.
 * @param {string} [options.label=''] - Text shown on the button.
 * @param {string|null} [options.glossaryKey] - Entry the label resolves to, when it names a term.
 */
function appendSegmentedButtonLabel(button, { label = '', glossaryKey = null } = {}) {
    if (glossaryKey) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label;
        labelElement.dataset.glossaryKey = glossaryKey;
        labelElement.classList.add('glossary-term');
        button.appendChild(labelElement);
        return;
    }

    button.textContent = label;
}

/**
 * Create the row that segmented choice buttons sit in.
 * @param {string} [className=''] - Extra class for a caller-specific variant.
 * @returns {HTMLDivElement} The empty row.
 */
export function createSegmentedButtonRow(className = '') {
    const row = document.createElement('div');
    row.className = ['btn-group', 'btn-group--segmented', 'btn-group--wrap', className]
        .filter(Boolean)
        .join(' ');
    return row;
}

/**
 * Sync a segmented button’s selected state: its active class, `aria-pressed`, and — for
 * mode switches — the disabled state that stops re-selecting the current choice.
 * @param {HTMLButtonElement} button - The button to restyle.
 * @param {boolean} isActive - Whether it is the current choice.
 * @param {object} [options] - Selection behaviour.
 * @param {boolean} [options.disableWhenActive=false] - Disable the button while it is the current choice.
 */
export function setSegmentedChoiceButtonState(button, isActive, options = {}) {
    const { disableWhenActive = false } = options;

    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
    button.disabled = disableWhenActive ? isActive : false;
}

/**
 * Create one segmented choice button.
 * @param {object} [options] - Its label, glossary key, initial state and extra classes.
 * @returns {HTMLButtonElement} The button, ready to append to a row.
 */
export function createSegmentedChoiceButton(options = {}) {
    const {
        label = '',
        glossaryKey = null,
        tooltipText = null,
        buttonClass = '',
        isActive = false,
        disableWhenActive = false,
    } = options;

    const button = document.createElement('button');
    button.className = [buttonClass, 'btn btn--text'].filter(Boolean).join(' ');

    if (tooltipText) {
        button.dataset.tooltipText = tooltipText;
    }

    appendSegmentedButtonLabel(button, { label, glossaryKey });
    setSegmentedChoiceButtonState(button, isActive, { disableWhenActive });

    return button;
}
