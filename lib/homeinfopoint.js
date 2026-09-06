'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');

/**
 * Client + Parser für Home.InfoPoint (Hausaufgaben, Bemerkungen, Zensuren). Portiert 1:1
 * aus der Kotlin-Referenzimplementierung (HomeworkApi.kt / HomeworkHtmlParser.kt) einer
 * bestehenden Android-App, die dieselbe Schnittstelle anspricht.
 *
 * Ablauf beim Login (siehe loginAndFetch): der Server verlangt zwingend, dass VOR dem
 * eigentlichen Login-POST erst per GET eine Session-Cookie "geprimed" wird - ein POST ohne
 * vorherige GET-Anfrage wird mit einem Redirect auf "?err=Session" abgelehnt. Falsche
 * Zugangsdaten liefern trotzdem HTTP 200 zurück (der HTTP-Status ist hier NICHT
 * aussagekräftig) - erkennbar nur daran, dass die Antwort wieder ein
 * action="login.php"-Formular enthält statt der Datenseite.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

/**
 * Error thrown when a Home.InfoPoint request fails (login, network, or parsing).
 */
class HomeInfoPointError extends Error {
    /**
     * @param {string} message error message
     */
    constructor(message) {
        super(message);
        this.name = 'HomeInfoPointError';
    }
}

/**
 * Führt Login + Datenabruf in einer gemeinsamen Cookie-Session durch und liefert das rohe HTML der Datenseite.
 *
 * @param loginUrl
 * @param dataUrl
 * @param username
 * @param password
 */
async function loginAndFetch(loginUrl, dataUrl, username, password) {
    const jar = new CookieJar();

    const cookieHeaderFor = async url => {
        const cookie = await jar.getCookieString(url);
        return cookie ? { Cookie: cookie } : {};
    };
    const storeCookies = async (url, response) => {
        const setCookie = response.headers['set-cookie'];
        if (!setCookie) {
            return;
        }
        for (const c of setCookie) {
            await jar.setCookie(c, url);
        }
    };

    // Schritt 1: Session-Cookie "primen" (siehe Klassenkommentar oben).
    const primeResponse = await axios.get(loginUrl, {
        headers: { 'User-Agent': USER_AGENT, ...(await cookieHeaderFor(loginUrl)) },
        timeout: 15000,
        responseType: 'text',
        transformResponse: data => data,
        maxRedirects: 5,
        validateStatus: () => true,
    });
    await storeCookies(loginUrl, primeResponse);

    // Schritt 2: eigentlicher Login-POST.
    const form = new URLSearchParams();
    form.append('username', username);
    form.append('password', password);
    form.append('login', 'Anmelden');

    const loginResponse = await axios.post(loginUrl, form, {
        headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(await cookieHeaderFor(loginUrl)),
        },
        timeout: 15000,
        responseType: 'text',
        transformResponse: data => data,
        maxRedirects: 5,
        validateStatus: () => true,
    });
    await storeCookies(loginUrl, loginResponse);

    // Schritt 3: Datenseite abrufen.
    const dataResponse = await axios.get(dataUrl, {
        headers: { 'User-Agent': USER_AGENT, ...(await cookieHeaderFor(dataUrl)) },
        timeout: 15000,
        responseType: 'text',
        transformResponse: data => data,
        maxRedirects: 5,
        validateStatus: () => true,
    });
    await storeCookies(dataUrl, dataResponse);

    const html = dataResponse.data;
    // HTTP-Status ist hier bewusst NICHT das Kriterium (siehe Klassenkommentar oben) -
    // falsche Zugangsdaten liefern HTTP 200 mit dem Login-Formular zurück.
    if (typeof html === 'string' && html.includes('action="login.php"')) {
        throw new HomeInfoPointError('Login fehlgeschlagen - bitte Benutzername/Passwort prüfen');
    }
    return html;
}

/**
 * [Datum, Fach, Aufgabe] je Zeile unter der Überschrift "hausaufgaben".
 *
 * @param html
 */
function parseHomework(html) {
    const $ = cheerio.load(html);
    const table = $('h2:has(a[name="hausaufgaben"])').nextAll('table').first();
    const entries = [];
    table.find('tr').each((i, row) => {
        if (i === 0) {
            return;
        } // Kopfzeile überspringen
        const cells = $(row).find('td');
        if (cells.length < 3) {
            return;
        }
        entries.push({
            date: cellText($, cells, 0),
            subject: cellText($, cells, 1),
            task: cellText($, cells, 2),
        });
    });
    return entries;
}

/**
 * [Datum, Typ, _, Fach, Text] je Zeile unter der Überschrift "bemerkungen".
 *
 * @param html
 */
function parseRemarks(html) {
    const $ = cheerio.load(html);
    const table = $('h2:has(a[name="bemerkungen"])').nextAll('table').first();
    const entries = [];
    table.find('tr').each((i, row) => {
        if (i === 0) {
            return;
        }
        const cells = $(row).find('td');
        if (cells.length < 5) {
            return;
        }
        entries.push({
            date: cellText($, cells, 0),
            type: cellText($, cells, 1),
            subject: cellText($, cells, 3),
            text: cellText($, cells, 4),
        });
    });
    return entries;
}

/**
 * Unter der Überschrift "noten" folgt je Fach ein <h3> (Text = vollständiges Fachlabel,
 * z. B. "BIO - Biologie (Nagy)") und direkt danach dessen eigene Tabelle mit
 * [Datum, Zensur, Bemerkung] je Zeile. Ergebnis gruppiert nach Fachlabel (Einfüge-Reihenfolge erhalten).
 *
 * @param html
 */
function parseGrades(html) {
    const $ = cheerio.load(html);
    const heading = $('h2:has(a[name="noten"])').get(0);
    const grouped = new Map();
    if (!heading) {
        return grouped;
    }

    let node = $(heading).next();
    while (node.length > 0) {
        const el = node.get(0);
        if (el && el.tagName && el.tagName.toLowerCase() === 'h3' && node.find('a').length > 0) {
            const subjectLabel = node.text().trim();
            const table = node.nextAll('table').first();
            const rows = [];
            table.find('tr').each((i, row) => {
                if (i === 0) {
                    return;
                }
                const cells = $(row).find('td');
                if (cells.length < 3) {
                    return;
                }
                rows.push({
                    date: cellText($, cells, 0),
                    grade: cellText($, cells, 1),
                    remark: cellText($, cells, 2),
                });
            });
            if (subjectLabel) {
                grouped.set(subjectLabel, rows);
            }
        }
        node = node.next();
    }
    return grouped;
}

function cellText($, cells, index) {
    const cell = cells.get(index);
    return cell ? $(cell).text().trim() : '';
}

module.exports = {
    HomeInfoPointError,
    loginAndFetch,
    parseHomework,
    parseRemarks,
    parseGrades,
};
