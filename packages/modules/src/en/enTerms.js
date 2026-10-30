/**
 * The German field vocabulary only the Englisch-8 surfaces label with; the words every
 * app shares are `TERM_CONSTANTS`. One map, so a chart, a table and an export label the
 * same thing with the same word.
 */

/**
 * The scale the EN levels belong to, in the forms German copy needs: the payload names
 * the levels but not their framework, so the term is fixed here, once. The glossary takes
 * them as `{{Skala}}`, `{{Stufe}}` and `{{Stufen}}`, resolved when it is assembled.
 */
export const EN_GLOSSARY_TERMS = Object.freeze({
    Skala: 'GER',
    Stufe: 'GER-Stufe',
    Stufen: 'GER-Stufen',
});

export const EN_TERMS = Object.freeze({
    STYLE: 'Stil',
    STYLES: 'Stile',

    // Column title, and the tooltip/column prefix before a domain name ("GER Hören")
    SCALE: EN_GLOSSARY_TERMS.Skala,
});
