'use strict';

/**
 * Schul-Register, 1:1 aus der Referenz-App (School.kt, "ESmobil") portiert. Dieser
 * Adapter ist bewusst NICHT generisch für beliebige VpMobil/Home.InfoPoint-Installationen
 * gedacht, sondern ausschließlich für die vier Schulen im TEGW-Schulverbund - deshalb
 * stecken die Server-Adressen fest im Code (sie sind ohnehin kein Geheimnis, siehe
 * School.kt-Kommentar in der App) und Nutzer:innen wählen in der Adapter-Konfiguration
 * nur ihre Schule aus einer festen Liste.
 *
 * WICHTIG - siehe App-Quelle: bei EOSH ist die VpMobil-Adresse dort ausdrücklich als
 * "UNBESTÄTIGT" markiert (nach dem bei EOSW/EGW beobachteten Muster geraten, nie
 * verifiziert). Das wird hier über `vpHostConfirmed: false` weitergetragen und in
 * main.js als Warnung geloggt, statt es als sicher funktionierend darzustellen.
 */
const SCHOOLS = {
    eosw: {
        id: 'eosw',
        displayName: 'Europäische Oberschule Waldenburg',
        hasStundenplan: true,
        vpHost: 'stundenplan.tegw.de/eosw',
        vpUsernameDefault: 'schueler',
        vpHostConfirmed: true,
        homeworkFolder: 'eosw',
    },
    egw: {
        id: 'egw',
        displayName: 'Europäisches Gymnasium Waldenburg',
        hasStundenplan: true,
        // Gleiche Schulnummer wie EOSW -> dieselbe VpMobil-Instanz (identischer vpHost!).
        // Der Home.InfoPoint-Ordner ist dagegen eigenständig ("egw").
        vpHost: 'stundenplan.tegw.de/eosw',
        vpUsernameDefault: 'schueler',
        vpHostConfirmed: true,
        homeworkFolder: 'egw',
    },
    eosh: {
        id: 'eosh',
        displayName: 'Europäische Oberschule Hartmannsdorf',
        hasStundenplan: true,
        vpHost: 'stundenplan.tegw.de/eosh',
        vpUsernameDefault: 'schueler',
        vpHostConfirmed: false,
        homeworkFolder: 'eosh',
    },
    egl: {
        id: 'egl',
        displayName: 'Europäische Grundschule Lichtenstein',
        hasStundenplan: false,
        vpHost: null,
        vpUsernameDefault: null,
        vpHostConfirmed: false,
        homeworkFolder: 'egl',
    },
};

/**
 * @param {string} id school id from the adapter config
 * @returns {object} the matching school, or EOSW as fallback for an unknown id
 */
function getSchool(id) {
    return SCHOOLS[id] || SCHOOLS.eosw;
}

/**
 * null, wenn die Schule kein VpMobil hat (aktuell nur EGL).
 *
 * @param school
 */
function vpMobilBaseUrl(school) {
    return school.vpHost ? `https://${school.vpHost}/klassenplan` : null;
}

/**
 * @param {object} school the school
 * @returns {string} Home.InfoPoint login URL for this school
 */
function homeworkLoginUrl(school) {
    return `https://infopoint.tegw.de/${school.homeworkFolder}/login.php`;
}

/**
 * @param {object} school the school
 * @returns {string} Home.InfoPoint data URL for this school
 */
function homeworkDataUrl(school) {
    return `https://infopoint.tegw.de/${school.homeworkFolder}/getdata.php`;
}

module.exports = {
    SCHOOLS,
    getSchool,
    vpMobilBaseUrl,
    homeworkLoginUrl,
    homeworkDataUrl,
};
