/**
 * The student list of a stats card: a toggle between two groups (gelöst / nicht
 * gelöst, say), then the active group's names, each a button that opens that student.
 */

import { escapeHtml, trusted } from '@tba3/module-base';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { formatStudentName } from '../domain/studentIdentity.js';

/**
 * @typedef {object} StudentGroupMember
 * @property {import('../domain/studentIdentity.js').StudentName} student - Named "Nachname, Vorname"; its id is what `onStudent` receives.
 * @property {string} [detail] - Shown after the name (the student's rate, say).
 * @property {boolean} [flagged] - Marks the name with `*`, which the list's `flag` explains.
 */

/**
 * @typedef {object} StudentGroup
 * @property {string} id - The group id, handed to `onGroup`.
 * @property {string} label - The toggle label; the count is added.
 * @property {string} heading - The list's heading while the group shows.
 * @property {string} emptyText - Said instead of an empty list while the other group has students.
 * @property {StudentGroupMember[]} members - The students, in display order.
 */

/**
 * The group to show while the viewer has not picked one: the smaller, so the list names
 * the exceptions; a tie goes to the first.
 * @param {readonly [StudentGroup, StudentGroup]} groups
 * @returns {string} The group id.
 */
function defaultStudentGroup([first, second]) {
    return first.members.length <= second.members.length ? first.id : second.id;
}

/**
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {object} list
 * @param {readonly [StudentGroup, StudentGroup]} list.groups
 * @param {string} list.noDataText - Said in both groups while both are empty: a group's own empty text would state a finding the data does not hold.
 * @param {string} [list.flag] - What a `*` means ("nicht bearbeitet", say): said to a screen reader on each flagged name and explained below the list.
 * @param {string|null} list.activeId - The group the viewer picked; `null` shows the default.
 * @param {(groupId: string) => void} list.onGroup - A toggle click.
 * @param {(studentId: string) => void} list.onStudent - A name click.
 * @returns {import('lit').TemplateResult}
 */
export function studentGroupListTemplate(
    glossary,
    { groups, noDataText, flag, activeId, onGroup, onStudent },
) {
    const shownId = activeId ?? defaultStudentGroup(groups);
    const active = groups.find((group) => group.id === shownId) ?? groups[0];
    const linkText = glossary.getRequiredEntryText('general.student-groups.student-link');
    // The sentences name glossary terms (Schüler:innen, Lösungsquote), linked as in the
    // rest of the card.
    const annotated = (/** @type {string} */ text) =>
        trusted(glossary.annotateHTML(escapeHtml(text)));

    const toggle = groups.map((group) => {
        const isActive = group === active;
        return html`<button
            type="button"
            class="btn btn--text student-group-button${isActive ? ' is-active' : ''}"
            aria-pressed=${String(isActive)}
            @click=${() => onGroup(group.id)}
        >
            ${group.label} (${group.members.length})
        </button>`;
    });

    const names = repeat(
        active.members,
        (member) => member.student.studentId,
        (member) => {
            const studentId = member.student.studentId;
            const name = formatStudentName(member.student);
            const spoken = [name, member.detail, member.flagged && `(${flag})`]
                .filter(Boolean)
                .join(' ');
            return html`<li>
                <button
                    type="button"
                    class="detail-student-name interactive-subtle${
                        member.flagged ? ' is-flagged' : ''
                    }"
                    aria-label=${applyTemplateTokens(linkText, { name: spoken })}
                    @click=${() => onStudent(studentId)}
                >
                    <span>${name}</span>${
                        member.detail
                            ? html`<span class="detail-student-name-detail">${member.detail}</span>`
                            : nothing
                    }${
                        member.flagged
                            ? html`<span class="detail-student-name-flag" aria-hidden="true"
                                  >*</span
                              >`
                            : nothing
                    }
                </button>
            </li>`;
        },
    );
    const legend = active.members.some((member) => member.flagged)
        ? html`<p class="detail-student-legend">* ${flag}</p>`
        : nothing;
    // Names that carry a detail need wider columns.
    const hasDetail = active.members.some((member) => member.detail);
    const emptyText = groups.some((group) => group.members.length > 0)
        ? active.emptyText
        : noDataText;
    const body =
        active.members.length > 0
            ? html`<ul
                      class="detail-student-grid${hasDetail ? ' detail-student-grid--detail' : ''}"
                  >
                      ${names}
                  </ul>
                  ${legend}`
            : html`<p class="empty-message">${annotated(emptyText)}</p>`;

    return html`<div class="detail-section">
        <h4>${annotated(active.heading)}</h4>
        <div
            class="btn-group btn-group--segmented student-group-toggle"
            role="group"
            aria-label=${glossary.getRequiredEntryText('general.student-groups.toggle-label')}
        >
            ${toggle}
        </div>
        ${body}
    </div>`;
}
