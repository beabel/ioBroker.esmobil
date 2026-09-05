![Logo](admin/esmobil.png)
# ioBroker.esmobil

[![NPM version](https://img.shields.io/npm/v/iobroker.esmobil.svg)](https://www.npmjs.com/package/iobroker.esmobil)
[![Downloads](https://img.shields.io/npm/dm/iobroker.esmobil.svg)](https://www.npmjs.com/package/iobroker.esmobil)
![Number of Installations](https://iobroker.live/badges/esmobil-installed.svg)

[![NPM](https://nodei.co/npm/iobroker.esmobil.png?downloads=true)](https://nodei.co/npm/iobroker.esmobil/)

## ESmobil adapter for ioBroker

ioBroker-Adapter für Stundenplan (**VpMobil/Indiware**) und Hausaufgaben/Bemerkungen/
Zensuren (**Home.InfoPoint**) - **ausschließlich für die vier Schulen des
TEGW-Schulverbunds**:

- **EOSW** - Europäische Oberschule Waldenburg
- **EGW** - Europäisches Gymnasium Waldenburg
- **EOSH** - Europäische Oberschule Hartmannsdorf
- **EGL** - Europäische Grundschule Lichtenstein

Dies ist bewusst **kein** generischer VpMobil/Indiware-Adapter: die Server-Adressen
sind je Schule fest im Code hinterlegt (sie sind kein Geheimnis, siehe unten), nicht
frei konfigurierbar. In der Adapter-Konfiguration wird nur die eigene Schule aus einer
festen Liste ausgewählt. Namensgeber und Datenquelle für dieses Wissen ist die
Android-App **ESmobil** desselben Verbunds - dieser Adapter portiert deren
VpMobil-/Home.InfoPoint-Anbindung 1:1 nach Node.js.

Der Adapter läuft dauerhaft im Hintergrund (Daemon-Modus, wie die meisten
ioBroker-Adapter - kein Cronjob): er ruft die konfigurierten Quellen sofort
beim Start ab und danach in einem einstellbaren Intervall erneut (Standard:
alle 30 Minuten, einstellbar in der Adapter-Konfiguration).

Dieser Adapter ist ein unabhängiges Community-Projekt und steht in keiner
Verbindung zu den Betreibern von VpMobil/Indiware oder Home.InfoPoint.

## Was funktioniert bei welcher Schule?

| Schule | Stundenplan (VpMobil) | Hausaufgaben/Bemerkungen/Zensuren (Home.InfoPoint) |
| --- | --- | --- |
| EOSW | ✅ | ✅ |
| EGW | ✅ (teilt sich die VpMobil-Instanz mit EOSW, eigener Home.InfoPoint-Bereich) | ✅ |
| EOSH | ⚠️ **unbestätigt** - Adresse nach dem Muster der anderen Schulen geraten, nie verifiziert (siehe `lib/schools.js`) | ✅ |
| EGL | ❌ kein VpMobil-Stundenplan vorhanden | ✅ |

Der Adapter blendet den Stundenplan-Teil der Konfiguration für EGL automatisch aus
und warnt beim Start zusätzlich im Log, wenn EOSH gewählt ist, damit die
unbestätigte Adresse nicht unbemerkt bleibt.

## Konfiguration

### Schule

Auswahl aus den vier oben genannten Schulen. Alles Weitere (Server-Adressen) wird
daraus automatisch abgeleitet.

### Stundenplan (VpMobil / Indiware)

Nur sichtbar, wenn die gewählte Schule einen Stundenplan hat (nicht bei EGL).

| Feld | Beschreibung |
| --- | --- |
| Klasse | Klassenname genau wie von VpMobil geliefert, z. B. `08m2` |
| Benutzername | Schulweit gleicher Zugang, kein persönliches Login - ist mit `schueler` vorbelegt |
| Passwort | Schulweit gleiches VpMobil-Passwort |

### Hausaufgaben / Bemerkungen / Zensuren (Home.InfoPoint)

Optional, über die Checkbox "Auch Hausaufgaben, Bemerkungen und Zensuren
abrufen" aktivierbar - für alle vier Schulen verfügbar.

| Feld | Beschreibung |
| --- | --- |
| Benutzername / Passwort | Persönlicher Zugang der Schülerin/des Schülers |

## State-Baum

```
esmobil.0.info.connection          boolean  - mindestens eine Quelle erfolgreich abgerufen
esmobil.0.plan.day1.date           string   - Datum (yyyy-MM-dd) des Montags der Schulwoche
esmobil.0.plan.day1.sourceTimestamp string  - Stand der Daten laut Server
esmobil.0.plan.day1.lessonCount    number   - Anzahl Stunden
esmobil.0.plan.day1.lessons        string   - Stunden als JSON-Array
esmobil.0.plan.day2.* ... plan.day5.*       - dieselben States für Dienstag bis Freitag derselben Woche
esmobil.0.plan.week.days           string   - kompletter Wochenplan (day1-day5) als ein JSON-Array, siehe unten
esmobil.0.homework.count           number   - Anzahl Hausaufgaben-Einträge
esmobil.0.homework.entries         string   - Hausaufgaben als JSON-Array
esmobil.0.homework.newCount        number   - Anzahl NEUER Hausaufgaben seit dem letzten Abruf
esmobil.0.homework.newEntries      string   - neue Hausaufgaben seit dem letzten Abruf, als JSON-Array
esmobil.0.remarks.count            number   - Anzahl Bemerkungen
esmobil.0.remarks.entries          string   - Bemerkungen als JSON-Array
esmobil.0.remarks.newCount         number   - Anzahl NEUER Bemerkungen seit dem letzten Abruf
esmobil.0.remarks.newEntries       string   - neue Bemerkungen seit dem letzten Abruf, als JSON-Array
esmobil.0.grades.subjectCount      number   - Anzahl Fächer MIT mindestens einer Zensur
esmobil.0.grades.bySubject         string   - alle Fächer als JSON-Objekt (auch Fächer ganz ohne Zensur)
esmobil.0.grades.subjects.<fach>.label       string - Fachlabel, z. B. "DE - Deutsch (Schuster)"
esmobil.0.grades.subjects.<fach>.count       number - Anzahl Zensuren in diesem Fach
esmobil.0.grades.subjects.<fach>.average     number - Durchschnitt dieses Fachs als Zahl, z. B. 1.7
esmobil.0.grades.subjects.<fach>.averageNote string - Durchschnitt dieses Fachs als Zensur, z. B. "2+"
esmobil.0.grades.subjects.<fach>.entries     string - Zensuren dieses Fachs als JSON-Array
esmobil.0.grades.overallAverage    number   - Durchschnitt über alle Fächer zusammen als Zahl (je Einzelnote, nicht je Fach gewichtet)
esmobil.0.grades.overallAverageNote string  - derselbe Durchschnitt als Zensur
esmobil.0.grades.newCount          number   - Anzahl NEUER Zensuren seit dem letzten Abruf
esmobil.0.grades.newEntries        string   - neue Zensuren seit dem letzten Abruf, als JSON-Array (inkl. Fach)
esmobil.0.info.newItemsCount       number   - neue Hausaufgaben+Bemerkungen+Zensuren in diesem Abruf zusammen
esmobil.0.info.lastNewAt           string   - Zeitpunkt (ISO) des letzten Abrufs mit mindestens einem neuen Eintrag
```

### Benachrichtigt werden, wenn es etwas Neues gibt

Der Adapter selbst verschickt keine Push-Nachrichten (er kennt eure
Telegram/Pushover/etc.-Einrichtung nicht) - er liefert aber alles, was eine
eigene Automatisierung (Skript, Blockly, Node-RED) dafür braucht:

- `esmobil.0.info.lastNewAt` ändert sich **ausschließlich** dann, wenn ein
  Abruf mindestens einen neuen Eintrag gefunden hat - der zuverlässigste
  Auslösepunkt für "on state change", da er nicht durch zwei aufeinander-
  folgende gleich große Neuzugänge "verschluckt" werden kann (anders als ein
  simpler true/false- oder Zähler-State, der bei gleichem Wert u. U. keine
  erneute Änderung auslöst).
- `esmobil.0.info.newItemsCount` sowie `homework.newCount`/`remarks.newCount`/
  `grades.newCount` sagen, wie viele es waren.
- `homework.newEntries`/`remarks.newEntries`/`grades.newEntries` enthalten
  die neuen Einträge selbst (Text für die Nachricht).

Beispiel für ein einfaches JavaScript-Adapter-Skript:

```js
on({ id: 'esmobil.0.info.lastNewAt', change: 'ne' }, () => {
    const homework = JSON.parse(getState('esmobil.0.homework.newEntries').val);
    const grades = JSON.parse(getState('esmobil.0.grades.newEntries').val);
    // hier z. B. sendTo('telegram.0', 'send', { text: '...' });
});
```

Auf dem allerersten Lauf nach Installation/Update gilt nichts als "neu"
(sonst würden alle bereits bestehenden Einträge einmalig als neu gemeldet) -
erst ab dem zweiten Abruf werden echte Neuzugänge erkannt.

`plan.day1` bis `plan.day5` entsprechen immer Montag bis Freitag einer
echten Kalenderwoche - nicht "die nächsten 5 verfügbaren Tage". An einem
Werktag ist das die laufende Woche (auch bereits vergangene Wochentage
darin, damit die Wochenansicht immer vollständig ist), an einem Samstag/
Sonntag bereits die kommende Woche. Tage ohne Daten vom Server (z. B. Ferien,
oder ein bereits vergangener Wochentag, den VpMobil nicht mehr vorhält)
liefern ein korrektes Datum mit `lessonCount: 0` und leerem `lessons`-Array,
statt zu fehlen. Bei EGL bleiben alle diese States leer, da dort kein
VpMobil-Stundenplan existiert.

Für eine Wochenansicht (z. B. in einem eigenen Dashboard/vis-Widget) am
einfachsten `plan.week.days` verwenden - ein einzelnes JSON-Array mit allen
fünf Tagen in der Form:

```json
[
  { "weekday": "Montag", "date": "2026-09-07", "sourceTimestamp": "04.09.2026, 10:36", "lessons": [ /* wie unten */ ] },
  { "weekday": "Dienstag", "date": "2026-09-08", "sourceTimestamp": "...", "lessons": [] }
]
```

Home.InfoPoint listet auf der Zensuren-Seite grundsätzlich **alle** Fächer der
Klasse, auch solche ganz ohne eingetragene Note (dort steht dann nur eine
leere Tabelle) - `grades.subjectCount`/`grades.bySubject` würden das sonst
mitzählen. Für eine übersichtliche, browsbare Darstellung in Admin →
Objekte gibt es deshalb zusätzlich pro Fach **mit mindestens einer Zensur**
einen eigenen Kanal `grades.subjects.<fachkürzel>` (z. B.
`grades.subjects.de`, `grades.subjects.bio`) mit `label`, `count`,
`average`, `averageNote` und `entries`. Fächer ohne jede Zensur bekommen
absichtlich keinen eigenen Kanal, um die Objektliste nicht mit leeren
Einträgen zu überladen - sie tauchen nur (mit leerem Array) in
`grades.bySubject` auf.

**Die Durchschnittsberechnung ist 1:1 aus einem bestehenden PHP-Projekt
portiert** (`content-zensuren.php`, `noteToFloat`/`floatToNote`), damit
beide Systeme exakt dieselben Werte liefern:

- Als Zensur zählt **nur** eine einzelne Ziffer "1".."6" mit optionalem
  "+"/"-" (z. B. "2", "2+", "2-"). "+" verbessert den Wert um 0.3, "-"
  verschlechtert ihn um 0.3 (z. B. "2+" → 1.7, "2-" → 2.3). Alles andere -
  auch ein Dezimalkomma wie "1,5" oder Freitext wie "e.n." - zählt zwar
  weiterhin zu `count`, fließt aber **nicht** in den Durchschnitt ein.
- `average`/`grades.overallAverage` sind die daraus gemittelten Zahlenwerte
  (auf 2 Nachkommastellen gerundet).
- `averageNote`/`grades.overallAverageNote` bilden diesen Zahlenwert wieder
  auf die nächstgelegene "echte" Zensur-Schreibweise ab (z. B. 1.7 → "2+"),
  exakt wie es die PHP-Seite als "⌀"-Anzeige zeigt. Ohne jede numerisch
  auswertbare Zensur liefern beide "-".
- `grades.overallAverage`/`overallAverageNote` gibt es im PHP-Original nicht
  (dort nur je Fach) - als zusätzlicher Komfort-State über alle Fächer
  hinweg, mit derselben Berechnung, gewichtet je Einzelnote (nicht je Fach).

Ein `lessons`-Eintrag hat die Form:

```json
{
  "period": "3",
  "begin": "09:50",
  "end": "10:35",
  "subjects": ["MA"],
  "teacher": "Mül",
  "room": "101",
  "info": "Vertretung",
  "changed": true
}
```

## Installation auf einer laufenden ioBroker-Instanz

### Weg 1: über GitHub (sobald das Repo dort liegt)

```bash
iobroker url https://github.com/beabel/ioBroker.ESmobil
```

Danach im Admin-Adapterbaum eine Instanz von "ESmobil" anlegen und konfigurieren.

### Weg 2: manuelle Kopie (zum schnellen Testen ohne GitHub-Push)

```bash
scp -r ioBroker.ESmobil root@iobroker-host:/opt/iobroker/node_modules/iobroker.esmobil
ssh root@iobroker-host "cd /opt/iobroker/node_modules/iobroker.esmobil && npm install --production"
ssh root@iobroker-host "cd /opt/iobroker && iobroker upload esmobil && iobroker add esmobil"
```

Danach im Admin die neue Instanz konfigurieren (Schule auswählen,
Zugangsdaten eintragen) und speichern - der Adapter läuft dauerhaft im
Hintergrund und ruft direkt nach dem Speichern/Neustart der Instanz einmal
sofort ab (siehe "Testen nach der Installation" unten).

### Testen nach der Installation

1. Instanz aktivieren/starten (Schalter in Admin → Instanzen bei "esmobil.0").
   Es gibt keinen Cronjob und keine Wartezeit - der erste Abruf passiert
   sofort beim Start, danach im eingestellten Intervall erneut.
2. Log prüfen: `iobroker logs esmobil.0` (oder Admin → Log, Filter auf
   "esmobil") - insbesondere auf die Warnung bei EOSH sowie auf
   `VpMobil-Abruf fehlgeschlagen`/`Home.InfoPoint-Abruf fehlgeschlagen` achten.
3. Werte prüfen: Admin → Objekte → `esmobil.0.*`, oder per CLI z. B.
   `iobroker state get esmobil.0.plan.day1.lessons`.
4. `esmobil.0.info.connection` sollte nach einem erfolgreichen Lauf `true`
   sein.

## Entwicklung

```bash
npm install
npm test
```

`npm test` läuft (44 Paket-Checks + 34 Unit-Tests, alle grün) und wurde vor
Version 0.4.3 auch tatsächlich ausgeführt. Die Unit-Tests decken die reine
Berechnungslogik ab (Notendurchschnitt, Wochenlogik, Slug-Erzeugung, HTML-/
XML-Parsing) - ein echter Testlauf gegen die vier Schulserver selbst (echte
Zugangsdaten, echtes Netzwerk) ist damit nicht ersetzt und sollte vor der
Veröffentlichung zusätzlich einmal gemacht werden, insbesondere gegen EOSH
(siehe Tabelle oben).

### Veröffentlichung / Aufnahme in die ioBroker-Adapterliste

Ein Install per `iobroker url <github-repo>` bleibt dauerhaft an genau dem
Stand hängen, der zum Installationszeitpunkt im Repo lag - Admin kennt dabei
keine "aktuell neueste Version" zum Vergleich und zeigt deshalb nie ein
Update an. Damit normale Ein-Klick-Updates funktionieren, muss der Adapter:

1. Als öffentliches npm-Paket veröffentlicht werden (`npm publish`, Paketname
   `iobroker.esmobil` passend zu `package.json`). Erst danach existiert
   überhaupt eine "Version X ist die neueste" - Information, die irgendwer
   abfragen kann.
2. Den offiziellen Adapter-Check bestehen (`@iobroker/repochecker`, bzw. der
   Web-Check unter https://adapter-check.iobroker.in/) - prüft u. a. genau
   die Dinge, die in diesem README bereits angepasst wurden (License-
   Abschnitt, Changelog-Format/Version, package.json/io-package.json-
   Konsistenz).
3. Per Pull Request in `github.com/ioBroker/ioBroker.repositories`
   (`sources-dist.json`) eingetragen werden. Erst ab dann taucht "ESmobil"
   in Admin unter "Adapter" (Repository "latest") auf, und **erst ab dann**
   erkennt Admin automatisch neue Versionen und bietet ein Update an -
   vorher bleibt nur der manuelle Weg (Dateien erneut kopieren/`iobroker url`
   erneut ausführen).

Ein GitHub Actions Workflow für `npm test` liegt bereits unter
[.github/workflows/test.yml](.github/workflows/test.yml) bei - das ist ein
in der Praxis erwartetes Signal für Schritt 2, aber keine harte Voraussetzung.

### Checkliste (Anforderungen für die ioBroker-Adapterliste)

| Anforderung | Status |
| --- | --- |
| GitHub-Repository heißt exakt `ioBroker.<Adaptername>` (großes B) | ⚠️ Repo noch nicht angelegt - bitte exakt `ioBroker.ESmobil` verwenden |
| `package.json`-Name komplett kleingeschrieben (`iobroker.<adaptername>`) | ✅ `"name": "iobroker.esmobil"` |
| Repository-Topics gesetzt (`iobroker`, `smart-home`, `adapter`, ...), Wort "ioBroker" nicht im Repo-Titel/-Beschreibungstext | ⚠️ Reine GitHub-Repo-Einstellung, nach dem Anlegen manuell unter Settings → Topics/Description nachzutragen |
| Gültige Open-Source-Lizenz (z. B. MIT) | ✅ MIT (`LICENSE`, `package.json`, `io-package.json`) |
| Version via npm veröffentlicht | ❌ noch offen, braucht `npm publish` mit echtem npm-Account |
| `common.type` aus der offiziellen Kategorie-Liste | ✅ `"date-and-time"` (geprüft gegen [ioBroker.repositories/README.md](https://github.com/ioBroker/ioBroker.repositories) - `"school"` existiert dort nicht) |

## License

MIT License

Copyright (c) 2026 Maik Ries & Christian Winter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Changelog

### 0.4.4 (2026-09-05)
* `repository`/`homepage`/`bugs`-URLs in `package.json`/`io-package.json` korrigiert (mussten die tatsächliche, gemischt geschriebene GitHub-Repo-Adresse `ioBroker.ESmobil` referenzieren statt der npm-typischen Kleinschreibung) - sonst schlägt die case-sensitive Suche des offiziellen `addToLatest`-Skripts fehl

### 0.4.3 (2026-09-05)
Erstveröffentlichung.
* Stundenplan (VpMobil/Indiware) als echte Kalender-Schulwoche (Montag-Freitag, `plan.day1`-`plan.day5`) für EOSW/EGW/EOSH/EGL, inkl. gebündeltem `plan.week.days`-JSON
* Hausaufgaben, Bemerkungen und Zensuren (Home.InfoPoint) für alle vier Schulen, inkl. Notendurchschnitt je Fach (`grades.subjects.<fach>.average`/`.averageNote`) und gesamt (`grades.overallAverage`/`.overallAverageNote`) - 1:1 aus dem bestehenden PHP-Referenzprojekt (`content-zensuren.php`) portiert
* Erkennung neuer Einträge (`info.lastNewAt`/`info.newItemsCount`, `*.newCount`/`*.newEntries`) als Basis für eigene Benachrichtigungs-Automatisierungen
* Läuft als Daemon (kein Cronjob): sofortiger erster Abruf, danach konfigurierbares Intervall
* Reine Hilfsfunktionen in `lib/helpers.js` ausgelagert, damit die Testsuite unabhängig von einer echten ioBroker-Installation läuft - alle 78 Tests (`npm test`) jetzt erstmals ausgeführt und grün
* Schulauswahl statt freier URL-Konfiguration - Serveradressen sind je Schule fest hinterlegt; EOSH-Stundenplanadresse ist als unbestätigt markiert und wird beim Start entsprechend geloggt
