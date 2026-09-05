'use strict';

const axios = require('axios');

/**
 * Client + Parser für den persönlichen Moodle-Kalender-Export (iCalendar), 1:1 portiert aus
 * der Kotlin-Referenzimplementierung (MoodleRepository.kt / MoodleIcsParser.kt) einer
 * bestehenden Android-App. Die vom Nutzer hinterlegte URL enthält bereits ein privates
 * Auth-Token (Moodle "Kalender exportieren") - anders als beim Stundenplan gibt es hier
 * bewusst keinen gemeinsamen Standardwert, jede Person nutzt ihre eigene URL aus ihrem
 * eigenen Moodle-Konto. Die URL ist funktional gleichwertig zu einem Passwort und wird
 * deshalb nirgends geloggt (auch nicht teilweise).
 */

/**
 * @param {string} calendarUrl die persönliche Moodle-Kalender-Export-URL
 * @returns {Promise<string>} rohes iCalendar-Dokument (.ics)
 */
async function fetchMoodleCalendar(calendarUrl) {
    const response = await axios.get(calendarUrl, {
        timeout: 15000,
        responseType: 'text',
        transformResponse: data => data,
    });
    if (typeof response.data !== 'string' || response.data.length === 0) {
        throw new Error('Leere Antwort vom Moodle-Kalender-Export');
    }
    return response.data;
}

/**
 * RFC 5545: fortgesetzte Zeilen beginnen mit einem Leerzeichen/Tab und gehören zur vorigen Zeile.
 *
 * @param {string} ics rohes iCalendar-Dokument
 * @returns {string} das Dokument mit aufgelösten Zeilenumbrüchen
 */
function unfold(ics) {
    return ics.replace(/\r?\n[ \t]/g, '');
}

/**
 * @param {string} text roher Property-Wert
 * @returns {string} unescapeter, einzeiliger Text (z. B. für SUMMARY)
 */
function unescapeText(text) {
    return text.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').replace(/\\\\/g, '\\').trim();
}

/**
 * Wie unescapeText, behält aber Zeilenumbrüche (für mehrzeilige DESCRIPTION-Texte).
 *
 * @param {string} text roher Property-Wert
 * @returns {string} unescapeter, mehrzeiliger Text
 */
function unescapeMultiline(text) {
    return text.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n').replace(/\\\\/g, '\\').trim();
}

/**
 * "08m2-INF-2026m" -> "INF" (Klasse-Fach-Jahr, wie in CATEGORIES von Moodle geliefert).
 *
 * @param {string|null} categories roher CATEGORIES-Wert
 * @returns {string} das extrahierte Fachkürzel, oder "Moodle" als Fallback
 */
function subjectFromCategories(categories) {
    if (!categories || !categories.trim()) {
        return 'Moodle';
    }
    const parts = categories.split('-');
    return parts.length >= 2 ? parts[1].trim() : categories.trim();
}

/**
 * "yyyyMMdd" oder "yyyyMMdd'T'HHmmss['Z']" -> "dd.MM.yyyy" (nur der Datumsanteil zählt,
 * wie im Original), passend zum Datumsformat der Home.InfoPoint-Hausaufgaben, damit beide
 * Quellen in derselben Liste landen.
 *
 * @param {string} raw DTSTART-Wert eines VEVENT
 * @returns {string|null} formatiertes Datum, oder null falls nicht auswertbar
 */
function formatIcsDate(raw) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec((raw || '').trim());
    if (!m) {
        return null;
    }
    const [, y, mo, d] = m;
    return `${d}.${mo}.${y}`;
}

/**
 * Parst den iCalendar-Export des persönlichen Moodle-Kalenders in dieselben
 * {date, subject, task}-Objekte, die auch für Home.InfoPoint-Hausaufgaben verwendet werden -
 * so landen Moodle-Termine ohne weiteren Code in derselben Liste (siehe main.js).
 *
 * @param {string} ics rohes iCalendar-Dokument
 * @returns {Array<{date: string, subject: string, task: string, source: string, description?: string}>}
 */
function parseMoodleIcs(ics) {
    const entries = [];
    let inEvent = false;
    let summary = null;
    let description = null;
    let dtstart = null;
    let categories = null;

    const lines = unfold(ics)
        .split(/\r?\n/)
        .map(line => line.replace(/\r$/, ''));

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            inEvent = true;
            summary = null;
            description = null;
            dtstart = null;
            categories = null;
        } else if (line === 'END:VEVENT') {
            if (inEvent) {
                const date = dtstart ? formatIcsDate(dtstart) : null;
                if (summary && date) {
                    const entry = { date, subject: subjectFromCategories(categories), task: summary, source: 'moodle' };
                    const desc = description ? description.trim() : '';
                    if (desc && desc !== summary) {
                        entry.description = desc;
                    }
                    entries.push(entry);
                }
            }
            inEvent = false;
        } else if (inEvent && line.startsWith('SUMMARY')) {
            summary = unescapeText(line.slice(line.indexOf(':') + 1));
        } else if (inEvent && line.startsWith('DESCRIPTION')) {
            description = unescapeMultiline(line.slice(line.indexOf(':') + 1));
        } else if (inEvent && line.startsWith('DTSTART')) {
            dtstart = line.slice(line.indexOf(':') + 1);
        } else if (inEvent && line.startsWith('CATEGORIES')) {
            categories = line.slice(line.indexOf(':') + 1);
        }
    }
    return entries;
}

module.exports = {
    fetchMoodleCalendar,
    parseMoodleIcs,
};
