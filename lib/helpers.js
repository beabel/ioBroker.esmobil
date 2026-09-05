'use strict';

/**
 * Reine Hilfsfunktionen ohne jede ioBroker-Abhängigkeit (kein @iobroker/adapter-core!).
 * Bewusst in ein eigenes Modul ausgelagert, damit sie in Unit-Tests direkt importiert
 * werden können - ein `require('../../main')` würde über @iobroker/adapter-core einen
 * fatalen `process.exit(10)` ("Cannot find js-controller") auslösen, sobald der Code
 * nicht innerhalb einer echten ioBroker-Installation läuft (z. B. in mocha).
 */

const WEEK_DAY_COUNT = 5;
const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

/** "20260904" -> "2026-09-04"; leerer dateKey (kein Plandatum verfügbar) -> "". */
function isoDateOf(dateKey) {
    return dateKey ? `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}` : '';
}

/**
 * Montag der "relevanten" Schulwoche: an einem Werktag die laufende Woche (auch wenn
 * Montag schon vergangen ist - die Wochenansicht soll die ganze Woche zeigen, nicht nur
 * die restlichen Tage), an einem Sa/So bereits die kommende Woche.
 */
function mondayOfRelevantWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=So, 1=Mo, ..., 6=Sa
    if (day === 0) {
        d.setDate(d.getDate() + 1); // So -> morgiger Montag
    } else if (day === 6) {
        d.setDate(d.getDate() + 2); // Sa -> übermorgiger Montag
    } else {
        d.setDate(d.getDate() - (day - 1)); // zurück auf den Montag dieser Woche
    }
    return d;
}

/**
 * "DE - Deutsch (Schuster)" -> "de"; nimmt das Fachkürzel vor dem ersten " - " und macht
 * daraus eine sichere ioBroker-Objekt-ID (keine Punkte/Leerzeichen/Klammern etc.).
 */
function slugifySubject(label) {
    const code = label.split(' - ')[0] || label;
    const slug = code
        .trim()
        .toLowerCase()
        .replace(/[.\s]+/g, '_')
        .replace(/[^\p{L}\p{N}_-]/gu, '')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    return slug || 'fach';
}

/**
 * Portiert 1:1 aus content-zensuren.php (noteToFloat): NUR eine einzelne Ziffer 1-6 mit
 * optionalem "+"/"-" gilt als gültige Zensur - "+" macht sie um 0.3 besser (kleinerer
 * Wert), "-" um 0.3 schlechter (größerer Wert), z. B. "2+" -> 1.7, "2-" -> 2.3. Alles
 * andere (auch ein Dezimalkomma wie "1,5" oder Freitext wie "e.n.") liefert null und
 * fließt NICHT in den Durchschnitt ein - das entspricht exakt dem PHP-Original, auch wenn
 * es auf den ersten Blick strenger wirkt als nötig.
 */
function parseGradeValue(grade) {
    if (grade === null || grade === undefined) return null;
    const match = /^([1-6])([+-]?)$/.exec(String(grade).trim());
    if (!match) return null;
    const base = parseInt(match[1], 10);
    if (match[2] === '+') return base - 0.3;
    if (match[2] === '-') return base + 0.3;
    return base;
}

/**
 * Wertetabelle aus content-zensuren.php (floatToNote) - bewusst ohne "5+"/"5-"/"6+"/"6-".
 * ALS ARRAY, nicht als Objekt: JS würde bei einem Objekt Keys wie "1"/"2"/... (gültige
 * Array-Indizes) automatisch vor allen anderen Keys einsortieren, unabhängig von der
 * Schreibreihenfolge - anders als PHPs assoziative Arrays, die immer Einfügereihenfolge
 * behalten. Bei einem exakten Gleichstand zweier Kandidaten (z. B. Durchschnitt genau
 * 0.85, mittig zwischen "1+"=0.7 und "1"=1.0) würde das sonst ein anderes Ergebnis als im
 * PHP-Original liefern - als Array bleibt die Iterationsreihenfolge exakt wie unten notiert.
 */
const NOTE_VALUES = [
    ['1+', 0.7], ['1', 1.0], ['1-', 1.3],
    ['2+', 1.7], ['2', 2.0], ['2-', 2.3],
    ['3+', 2.7], ['3', 3.0], ['3-', 3.3],
    ['4+', 3.7], ['4', 4.0], ['4-', 4.3],
    ['5', 5.0], ['6', 6.0]
];

/**
 * Portiert 1:1 aus content-zensuren.php (floatToNote): bildet einen Durchschnittswert auf
 * die nächstgelegene "echte" Zensur-Schreibweise ab (z. B. 1.8 -> "2+"), inklusive der
 * Randbehandlung <=1.0 -> "1" und >=6.0 -> "6" aus dem Original. `null` (keine einzige
 * numerisch auswertbare Zensur vorhanden) ergibt "-", wie im PHP-Original.
 */
function gradeAverageLabel(value) {
    if (value === null || value === undefined) return '-';
    const v = roundTo2(value);
    if (v <= 1.0) return '1';
    if (v >= 6.0) return '6';
    let closestNote = '1';
    let minDiff = 99;
    for (const [note, w] of NOTE_VALUES) {
        const diff = Math.abs(v - w);
        if (diff < minDiff) {
            minDiff = diff;
            closestNote = note;
        }
    }
    return closestNote;
}

function mean(numbers) {
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function roundTo2(n) {
    return Math.round(n * 100) / 100;
}

module.exports = {
    WEEK_DAY_COUNT,
    WEEKDAY_NAMES,
    formatDateKey,
    isoDateOf,
    mondayOfRelevantWeek,
    slugifySubject,
    parseGradeValue,
    gradeAverageLabel,
    mean,
    roundTo2
};
