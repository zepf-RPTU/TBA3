/**
 * The state patch a material link opens the material view with: the Fach and Typ the
 * link names, written when the switch dispatches, so a switch queued behind another
 * still lands on the selection it asked for.
 * @param {{subject: string, type: string}} selection - The Fach, as the payload names it, and the Typ.
 * @returns {{materialSubject: string, materialType: string}}
 */
export function materialStatePatch({ subject, type }) {
    return { materialSubject: subject, materialType: type };
}
