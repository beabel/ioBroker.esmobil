const { expect } = require('chai');
const { parseAvailableDateKeys, parseKlassen, parseDayPlan } = require('../../lib/vpmobil');
const { parseHomework, parseRemarks, parseGrades } = require('../../lib/homeinfopoint');
const { parseMoodleIcs } = require('../../lib/moodle');
const { getSchool, vpMobilBaseUrl, homeworkLoginUrl, homeworkDataUrl } = require('../../lib/schools');
const {
    mondayOfRelevantWeek,
    formatDateKey,
    slugifySubject,
    parseGradeValue,
    gradeAverageLabel,
    mean,
    roundTo2
} = require('../../lib/helpers');

// Diese Werte sind 1:1 aus content-zensuren.php (noteToFloat/floatToNote) übernommen -
// die Testfälle stellen sicher, dass die JS-Portierung exakt dasselbe Ergebnis liefert.
describe('main.js Notendurchschnitt (Portierung aus content-zensuren.php)', () => {
    it('parseGradeValue liest ganze Noten 1-6', () => {
        expect(parseGradeValue('1')).to.equal(1);
        expect(parseGradeValue('6')).to.equal(6);
    });

    it('parseGradeValue wendet Tendenz-Zeichen mit +-0.3 an (NICHT einfach ignorieren)', () => {
        expect(parseGradeValue('2+')).to.equal(1.7);
        expect(parseGradeValue('2-')).to.equal(2.3);
        expect(parseGradeValue('1-')).to.equal(1.3);
        expect(parseGradeValue('6+')).to.equal(5.7);
    });

    it('parseGradeValue akzeptiert KEIN Dezimalkomma (anders als generisches parseFloat)', () => {
        expect(parseGradeValue('1,5')).to.equal(null);
    });

    it('parseGradeValue liefert null für nicht als Zensur lesbaren Freitext', () => {
        expect(parseGradeValue('e.n.')).to.equal(null);
        expect(parseGradeValue('')).to.equal(null);
        expect(parseGradeValue(null)).to.equal(null);
        expect(parseGradeValue(undefined)).to.equal(null);
        expect(parseGradeValue('7')).to.equal(null);
        expect(parseGradeValue('0')).to.equal(null);
    });

    it('gradeAverageLabel bildet auf die nächstgelegene Zensur-Schreibweise ab', () => {
        expect(gradeAverageLabel(1.7)).to.equal('2+');
        expect(gradeAverageLabel(2.3)).to.equal('2-');
        expect(gradeAverageLabel(3.0)).to.equal('3');
        expect(gradeAverageLabel(1.33)).to.equal('1-');
    });

    it('gradeAverageLabel klemmt an den Rändern auf "1"/"6"', () => {
        expect(gradeAverageLabel(0.5)).to.equal('1');
        expect(gradeAverageLabel(1.0)).to.equal('1');
        expect(gradeAverageLabel(6.0)).to.equal('6');
        expect(gradeAverageLabel(7)).to.equal('6');
    });

    it('gradeAverageLabel liefert "-" für null (keine numerisch auswertbare Zensur)', () => {
        expect(gradeAverageLabel(null)).to.equal('-');
    });

    it('gradeAverageLabel bei einem rechnerischen Gleichstand: IEEE-754-Rundung entscheidet, nicht Iterationsreihenfolge', () => {
        // 1.85 liegt rein rechnerisch exakt mittig zwischen "2+" (1.7) und "2" (2.0) - in
        // Fließkomma-Arithmetik sind |1.85-1.7| und |1.85-2.0| aber NICHT exakt gleich groß
        // (0.15000000000000013 vs. 0.1499999999999999, IEEE-754-Doubles können 0.15 nicht
        // exakt darstellen). Das Ergebnis "2" ist deshalb deterministisch und entspricht
        // genau dem, was auch PHP mit denselben IEEE-754-Doubles liefern würde - ein echter
        // exakter Gleichstand ist mit diesen Notenwerten praktisch nicht erreichbar. Die
        // Array- statt Objekt-Struktur von NOTE_VALUES bleibt trotzdem die korrekte
        // Portierung: sie garantiert dieselbe Iterationsreihenfolge wie PHPs assoziatives
        // Array, für den (hier nicht eintretenden) Fall eines echten Gleichstands.
        expect(gradeAverageLabel(1.85)).to.equal('2');
    });

    it('mean/roundTo2 berechnen den erwarteten Durchschnitt', () => {
        expect(roundTo2(mean([1, 1]))).to.equal(1);
        expect(roundTo2(mean([1, 2, 3]))).to.equal(2);
        expect(roundTo2(mean([1, 2]))).to.equal(1.5);
        expect(roundTo2(mean([1, 1, 2]))).to.equal(1.33);
    });

    it('End-to-End wie im realen Beispiel: DE-Zensuren "1","1" -> Durchschnitt "1"', () => {
        const values = ['1', '1'].map(parseGradeValue).filter(v => v !== null);
        expect(gradeAverageLabel(mean(values))).to.equal('1');
    });
});

describe('main.js slugifySubject', () => {
    it('nimmt das Fachkürzel vor dem ersten " - " und macht es klein', () => {
        expect(slugifySubject('DE - Deutsch (Schuster)')).to.equal('de');
        expect(slugifySubject('BIO - Biologie (Nagy)')).to.equal('bio');
    });

    it('macht aus Sonderzeichen im Kürzel eine sichere ID', () => {
        expect(slugifySubject('FÖ_MA - Förderung Mathematik (Ilin)')).to.equal('fö_ma');
        expect(slugifySubject('FöLRS - Fördern LRS (Schaarschmidt)')).to.equal('fölrs');
    });

    it('liefert einen Fallback für ein leeres/unerwartetes Label', () => {
        expect(slugifySubject('')).to.equal('fach');
        expect(slugifySubject('   ')).to.equal('fach');
    });

    it('erzeugt für unterschiedliche Fächer unterschiedliche Slugs (keine Kollisionen in den Beispieldaten)', () => {
        const labels = [
            'BIO - Biologie (Nagy)', 'CH - Chemie (Freytag)', 'DE - Deutsch (Schuster)',
            'EN - Englisch (Taylor)', 'ETH - Ethik (Winkler)', 'FR - Französisch (Handke)',
            'GE - Geschichte (Marek)', 'GEO - Geographie (Gluthmann)', 'INF - Informatik (Gluthmann)',
            'KLS - Klassenleiterstunde (Kraft)', 'KU - Kunst (Tantow)', 'MU - Musik (Heidenreich)',
            'MA - Mathematik (Kraft)', 'PF - Profilfach (Lorenz)', 'PH - Physik (Löwel)',
            'SPA - Spanisch (Valverde Dominguez)', 'SPO - Sport (Cepic)', 'FÖ_MA - Förderung Mathematik (Ilin)',
            'WTH - Wirtschaft-Technik-Haushalt/Soziales (Kraft)', 'FöLRS - Fördern LRS (Schaarschmidt)',
            'FRK - Französisch Konversation (Diallo)', 'ZENA - Zertifikatskurs (Ssempuuma)',
            'SPK - Spanisch Konversation (Valverde Dominguez)'
        ];
        const slugs = labels.map(slugifySubject);
        expect(new Set(slugs).size).to.equal(labels.length);
    });
});

describe('main.js Wochenlogik', () => {
    // Referenztage: Mo 2026-08-31 .. So 2026-09-06
    const monday = new Date(2026, 7, 31); // Monat 0-indiziert: 7 = August
    const wednesday = new Date(2026, 8, 2);
    const friday = new Date(2026, 8, 4);
    const saturday = new Date(2026, 8, 5);
    const sunday = new Date(2026, 8, 6);

    it('an einem Werktag ist der Montag derselben Woche relevant', () => {
        expect(formatDateKey(mondayOfRelevantWeek(monday))).to.equal('20260831');
        expect(formatDateKey(mondayOfRelevantWeek(wednesday))).to.equal('20260831');
        expect(formatDateKey(mondayOfRelevantWeek(friday))).to.equal('20260831');
    });

    it('am Samstag ist bereits der Montag der Folgewoche relevant', () => {
        expect(formatDateKey(mondayOfRelevantWeek(saturday))).to.equal('20260907');
    });

    it('am Sonntag ist bereits der Montag der Folgewoche relevant', () => {
        expect(formatDateKey(mondayOfRelevantWeek(sunday))).to.equal('20260907');
    });
});

describe('lib/schools', () => {
    it('kennt genau die vier TEGW-Schulen', () => {
        for (const id of ['eosw', 'egw', 'eosh', 'egl']) {
            expect(getSchool(id).id).to.equal(id);
        }
    });

    it('fällt bei unbekannter Schul-ID auf EOSW zurück', () => {
        expect(getSchool('unbekannt').id).to.equal('eosw');
    });

    it('EOSW und EGW teilen sich dieselbe VpMobil-Basis-URL', () => {
        expect(vpMobilBaseUrl(getSchool('eosw'))).to.equal(vpMobilBaseUrl(getSchool('egw')));
        expect(vpMobilBaseUrl(getSchool('eosw'))).to.equal('https://stundenplan.tegw.de/eosw/klassenplan');
    });

    it('EGL hat keine VpMobil-Basis-URL (kein Stundenplan)', () => {
        expect(vpMobilBaseUrl(getSchool('egl'))).to.equal(null);
        expect(getSchool('egl').hasStundenplan).to.equal(false);
    });

    it('EOSH ist ausdrücklich als unbestätigt markiert', () => {
        expect(getSchool('eosh').vpHostConfirmed).to.equal(false);
    });

    it('Home.InfoPoint-URLs nutzen den schuleigenen Ordner, auch bei EOSW/EGW', () => {
        expect(homeworkLoginUrl(getSchool('eosw'))).to.equal('https://infopoint.tegw.de/eosw/login.php');
        expect(homeworkLoginUrl(getSchool('egw'))).to.equal('https://infopoint.tegw.de/egw/login.php');
        expect(homeworkDataUrl(getSchool('egl'))).to.equal('https://infopoint.tegw.de/egl/getdata.php');
    });
});

describe('lib/vpmobil', () => {
    describe('parseAvailableDateKeys', () => {
        it('extrahiert yyyyMMdd aus PlanKl-Dateinamen und ignoriert alles andere', () => {
            const files = ['PlanKl20260904.xml', 'Klassen.xml', 'PlanKl20260905.xml', 'PlanKl20260904.xml'];
            expect(parseAvailableDateKeys(files)).to.deep.equal(['20260904', '20260905']);
        });
    });

    describe('parseKlassen', () => {
        it('sortiert Klassennamen natürlich (Ziffernblöcke numerisch)', () => {
            const xml = `<VpMobil><Klassen>
                <Kl><Kurz>10a</Kurz></Kl>
                <Kl><Kurz>07m2</Kurz></Kl>
                <Kl><Kurz>2a</Kurz></Kl>
            </Klassen></VpMobil>`;
            expect(parseKlassen(xml)).to.deep.equal(['2a', '07m2', '10a']);
        });
    });

    describe('parseDayPlan', () => {
        const xml = `<VpMobil>
            <Kopf><zeitstempel>04.09.2026, 06:30</zeitstempel></Kopf>
            <Klassen>
                <Kl>
                    <Kurz>08m2</Kurz>
                    <Pl>
                        <Std>
                            <St>1</St>
                            <Beginn>08:00</Beginn>
                            <Ende>08:45</Ende>
                            <Fa FaAe="1">MA</Fa>
                            <Le>Mül</Le>
                            <Ra>101</Ra>
                            <If>Vertretung</If>
                        </Std>
                        <Std>
                            <St>2</St>
                            <Beginn>08:50</Beginn>
                            <Fa>DE/EN</Fa>
                            <Le>Sch</Le>
                            <Ra></Ra>
                        </Std>
                    </Pl>
                </Kl>
                <Kl>
                    <Kurz>08m1</Kurz>
                    <Pl><Std><St>1</St><Beginn>08:00</Beginn><Ende>08:45</Ende><Fa>PH</Fa></Std></Pl>
                </Kl>
            </Klassen>
        </VpMobil>`;

        it('liest den Zeitstempel aus dem Kopf', () => {
            const result = parseDayPlan(xml, '20260904', '08m2');
            expect(result.sourceTimestamp).to.equal('04.09.2026, 06:30');
        });

        it('erkennt eine geänderte Stunde am FaAe-Attribut', () => {
            const result = parseDayPlan(xml, '20260904', '08m2');
            expect(result.lessons[0].changed).to.equal(true);
            expect(result.lessons[0].subjects).to.deep.equal(['MA']);
        });

        it('splittet mehrere Fächer und markiert unveränderte Stunden korrekt', () => {
            const result = parseDayPlan(xml, '20260904', '08m2');
            expect(result.lessons[1].changed).to.equal(false);
            expect(result.lessons[1].subjects).to.deep.equal(['DE', 'EN']);
        });

        it('fällt bei fehlendem <Ende> auf die Beginnzeit zurück statt 23:59 zu erfinden', () => {
            const result = parseDayPlan(xml, '20260904', '08m2');
            expect(result.lessons[1].end).to.equal(result.lessons[1].begin);
        });

        it('liefert nur die Stunden der angefragten Klasse', () => {
            const result = parseDayPlan(xml, '20260904', '08m1');
            expect(result.lessons).to.have.lengthOf(1);
            expect(result.lessons[0].subjects).to.deep.equal(['PH']);
        });

        it('liefert eine leere Stundenliste für eine unbekannte Klasse', () => {
            const result = parseDayPlan(xml, '20260904', 'nicht-vorhanden');
            expect(result.lessons).to.deep.equal([]);
        });
    });
});

describe('lib/homeinfopoint', () => {
    const html = `<html><body>
        <h2><a name="hausaufgaben"></a>Hausaufgaben</h2>
        <table>
            <tr><th>Datum</th><th>Fach</th><th>Aufgabe</th></tr>
            <tr><td>04.09.2026</td><td>MA</td><td>S. 42, Nr. 3-5</td></tr>
        </table>
        <h2><a name="bemerkungen"></a>Bemerkungen</h2>
        <table>
            <tr><th>Datum</th><th>Typ</th><th>?</th><th>Fach</th><th>Text</th></tr>
            <tr><td>03.09.2026</td><td>Lob</td><td>-</td><td>DE</td><td>Gute Mitarbeit</td></tr>
        </table>
        <h2><a name="noten"></a>Zensuren</h2>
        <h3><a>BIO - Biologie (Nagy)</a></h3>
        <table>
            <tr><th>Datum</th><th>Zensur</th><th>Bemerkung</th></tr>
            <tr><td>01.09.2026</td><td>2</td><td>Test</td></tr>
        </table>
        <h3><a>MA - Mathematik (Mül)</a></h3>
        <table>
            <tr><th>Datum</th><th>Zensur</th><th>Bemerkung</th></tr>
            <tr><td>28.08.2026</td><td>1</td><td>Klausur</td></tr>
        </table>
    </body></html>`;

    it('parseHomework liest Datum/Fach/Aufgabe und überspringt die Kopfzeile', () => {
        const result = parseHomework(html);
        expect(result).to.deep.equal([{ date: '04.09.2026', subject: 'MA', task: 'S. 42, Nr. 3-5' }]);
    });

    it('parseRemarks liest Datum/Typ/Fach/Text an den richtigen Spaltenindizes', () => {
        const result = parseRemarks(html);
        expect(result).to.deep.equal([{ date: '03.09.2026', type: 'Lob', subject: 'DE', text: 'Gute Mitarbeit' }]);
    });

    it('parseGrades gruppiert nach vollständigem Fachlabel in Dokumentreihenfolge', () => {
        const result = parseGrades(html);
        expect([...result.keys()]).to.deep.equal(['BIO - Biologie (Nagy)', 'MA - Mathematik (Mül)']);
        expect(result.get('BIO - Biologie (Nagy)')).to.deep.equal([{ date: '01.09.2026', grade: '2', remark: 'Test' }]);
        expect(result.get('MA - Mathematik (Mül)')).to.deep.equal([{ date: '28.08.2026', grade: '1', remark: 'Klausur' }]);
    });
});

describe('lib/moodle', () => {
    it('parseMoodleIcs liest SUMMARY/DTSTART/CATEGORIES eines all-day VEVENT', () => {
        const ics = [
            'BEGIN:VCALENDAR',
            'BEGIN:VEVENT',
            'SUMMARY:Abgabe Praktikumsbericht',
            'DTSTART;VALUE=DATE:20260910',
            'CATEGORIES:08m2-INF-2026m',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');
        expect(parseMoodleIcs(ics)).to.deep.equal([
            { date: '10.09.2026', subject: 'INF', task: 'Abgabe Praktikumsbericht', source: 'moodle' }
        ]);
    });

    it('parseMoodleIcs wertet eine DTSTART mit Uhrzeit/UTC-"Z" nur nach dem Datumsanteil aus', () => {
        const ics = ['BEGIN:VEVENT', 'SUMMARY:Test', 'DTSTART:20260910T235900Z', 'END:VEVENT'].join('\r\n');
        expect(parseMoodleIcs(ics)[0].date).to.equal('10.09.2026');
    });

    it('parseMoodleIcs löst gefaltete (fortgesetzte) Zeilen nach RFC 5545 auf', () => {
        // RFC 5545: das (einzelne) Leerzeichen direkt nach dem Zeilenumbruch ist selbst nur
        // die Faltmarkierung und wird beim Entfalten entfernt - ein tatsächliches Leerzeichen
        // an der Umbruchstelle muss deshalb schon VOR dem Umbruch im Originaltext stehen.
        const ics = [
            'BEGIN:VEVENT',
            'SUMMARY:Ein sehr langer ',
            ' Titel über zwei Zeilen',
            'DTSTART:20260910',
            'END:VEVENT'
        ].join('\r\n');
        expect(parseMoodleIcs(ics)[0].task).to.equal('Ein sehr langer Titel über zwei Zeilen');
    });

    it('parseMoodleIcs übernimmt eine DESCRIPTION nur, wenn sie sich von SUMMARY unterscheidet', () => {
        const withDescription = ['BEGIN:VEVENT', 'SUMMARY:Test', 'DTSTART:20260910', 'DESCRIPTION:Mehr Details', 'END:VEVENT'].join(
            '\r\n'
        );
        expect(parseMoodleIcs(withDescription)[0].description).to.equal('Mehr Details');

        const sameAsSummary = ['BEGIN:VEVENT', 'SUMMARY:Test', 'DTSTART:20260910', 'DESCRIPTION:Test', 'END:VEVENT'].join('\r\n');
        expect(parseMoodleIcs(sameAsSummary)[0]).to.not.have.property('description');
    });

    it('parseMoodleIcs fällt ohne CATEGORIES auf "Moodle" als Fach zurück', () => {
        const ics = ['BEGIN:VEVENT', 'SUMMARY:Test', 'DTSTART:20260910', 'END:VEVENT'].join('\r\n');
        expect(parseMoodleIcs(ics)[0].subject).to.equal('Moodle');
    });

    it('parseMoodleIcs überspringt VEVENTs ohne SUMMARY oder ohne auswertbares DTSTART', () => {
        const missingSummary = ['BEGIN:VEVENT', 'DTSTART:20260910', 'END:VEVENT'].join('\r\n');
        expect(parseMoodleIcs(missingSummary)).to.deep.equal([]);

        const missingDate = ['BEGIN:VEVENT', 'SUMMARY:Test', 'END:VEVENT'].join('\r\n');
        expect(parseMoodleIcs(missingDate)).to.deep.equal([]);
    });
});
