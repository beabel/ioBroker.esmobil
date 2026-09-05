"use strict";

const utils = require("@iobroker/adapter-core");
const {
  VpMobilClient,
  parseDayPlan,
  parseAvailableDateKeys,
} = require("./lib/vpmobil");
const {
  loginAndFetch,
  parseHomework,
  parseRemarks,
  parseGrades,
} = require("./lib/homeinfopoint");
const {
  getSchool,
  vpMobilBaseUrl,
  homeworkLoginUrl,
  homeworkDataUrl,
} = require("./lib/schools");
const {
  WEEK_DAY_COUNT,
  WEEKDAY_NAMES,
  formatDateKey,
  isoDateOf,
  mondayOfRelevantWeek,
  slugifySubject,
  parseGradeValue,
  gradeAverageLabel,
  mean,
  roundTo2,
} = require("./lib/helpers");

const DEFAULT_POLL_INTERVAL_MINUTES = 30;
const MIN_POLL_INTERVAL_MINUTES = 5;

class ESmobil extends utils.Adapter {
  constructor(options) {
    super({ ...options, name: "esmobil" });
    this.pollTimer = null;
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  async onReady() {
    // Daemon statt Schedule-Modus, bewusst so gewählt: ein Schedule-Adapter läuft nur
    // kurz je Cron-Tick und steht dazwischen auf "nicht aktiv" (kein dauerhaftes Grün in
    // der Instanzübersicht), und der erste Abruf käme erst zum nächsten Cron-Tick (bis zu
    // Intervalllänge Wartezeit). Als Daemon läuft der Adapter dauerhaft, ruft sofort beim
    // Start einmal ab und plant den jeweils nächsten Abruf erst NACH Abschluss des
    // aktuellen ein (selbst-nachplanender setTimeout statt setInterval) - so können sich
    // bei einem langsamen/hängenden Abruf keine Aufrufe stapeln.
    await this.pollAndReschedule();
  }

  async pollAndReschedule() {
    await this.poll();
    const minutes = Math.max(
      MIN_POLL_INTERVAL_MINUTES,
      Number(this.config.pollIntervalMinutes) || DEFAULT_POLL_INTERVAL_MINUTES,
    );
    this.pollTimer = this.setTimeout(
      () => this.pollAndReschedule(),
      minutes * 60 * 1000,
    );
  }

  async poll() {
    let connected = false;
    try {
      connected = await this.main();
    } catch (err) {
      this.log.error(`Unerwarteter Fehler: ${err.message}`);
    }
    await this.ensureState(
      "info.connection",
      {
        name: "Verbunden mit den Schulservern",
        type: "boolean",
        role: "indicator.connected",
        read: true,
        write: false,
        def: false,
      },
      connected,
    );
  }

  /** @returns {Promise<boolean>} true, wenn mindestens eine der beiden Quellen erfolgreich abgerufen wurde. */
  async main() {
    const config = this.config;
    const school = getSchool(config.school);
    this.log.info(`Schule: ${school.displayName} (${school.id})`);
    let anySuccess = false;

    if (school.hasStundenplan) {
      if (!school.vpHostConfirmed) {
        this.log.warn(
          `Die VpMobil-Adresse für ${school.displayName} ist von der Referenz-App her ` +
            "unbestätigt (nach dem Muster der anderen Schulen geraten, nie verifiziert) - " +
            "bitte die abgerufenen Stundenplan-Daten genau prüfen.",
        );
      }
      if (config.klasse) {
        try {
          await this.updateTimetable(school, config);
          anySuccess = true;
        } catch (err) {
          this.log.error(`VpMobil-Abruf fehlgeschlagen: ${err.message}`);
        }
      } else {
        this.log.warn(
          "Keine Klasse eingetragen - überspringe Stundenplan-Abruf.",
        );
      }
    } else {
      this.log.info(
        `${school.displayName} hat laut Referenz-App keinen Stundenplan über VpMobil - überspringe.`,
      );
    }

    if (config.pollHomeworkEtc) {
      if (config.haUsername) {
        try {
          await this.updateHomeInfoPoint(school, config);
          anySuccess = true;
        } catch (err) {
          this.log.error(`Home.InfoPoint-Abruf fehlgeschlagen: ${err.message}`);
        }
      } else {
        this.log.warn(
          "Kein Home.InfoPoint-Benutzername eingetragen - überspringe Hausaufgaben/Bemerkungen/Zensuren.",
        );
      }
    }

    return anySuccess;
  }

  async updateTimetable(school, config) {
    await this.ensureChannel("plan", "Stundenplan");
    await this.ensureChannel("plan.week", "Wochenplan (alle Tage gebündelt)");
    for (let i = 1; i <= WEEK_DAY_COUNT; i++) {
      await this.ensureChannel(`plan.day${i}`, WEEKDAY_NAMES[i - 1]);
    }

    const baseUrl = vpMobilBaseUrl(school);
    const username = config.vpUsername || school.vpUsernameDefault;
    const client = new VpMobilClient(baseUrl, username, config.vpPassword);
    const fileNames = await client.fetchDirectoryListing();
    const availableKeys = new Set(parseAvailableDateKeys(fileNames));

    // Echte Kalender-Schulwoche (Montag-Freitag), keine rollierenden "nächsten 5
    // verfügbaren Tage" mehr - an einem Sa/So wird bereits die Folgewoche angezeigt,
    // sonst immer die laufende Woche (auch bereits vergangene Wochentage darin).
    const monday = mondayOfRelevantWeek(new Date());

    const weekDays = [];
    let anyLessons = false;
    for (let i = 0; i < WEEK_DAY_COUNT; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const key = formatDateKey(d);
      const prefix = `plan.day${i + 1}`;
      const dayPlan = availableKeys.has(key)
        ? parseDayPlan(
            await client.fetchXml(`PlanKl${key}.xml`),
            key,
            config.klasse,
          )
        : { dateKey: key, lessons: [], sourceTimestamp: null };
      anyLessons = anyLessons || dayPlan.lessons.length > 0;
      await this.writeDayPlan(prefix, dayPlan);
      weekDays.push({
        weekday: WEEKDAY_NAMES[i],
        date: isoDateOf(dayPlan.dateKey),
        sourceTimestamp: dayPlan.sourceTimestamp,
        lessons: dayPlan.lessons,
      });
    }

    if (!anyLessons) {
      this.log.info(
        "VpMobil: für die aktuelle Schulwoche sind aktuell keine Plandaten verfügbar.",
      );
    }

    await this.ensureState(
      "plan.week.days",
      {
        name: "Wochenplan - alle Tage in einem JSON-Array",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(weekDays),
    );
  }

  async writeDayPlan(prefix, dayPlan) {
    await this.ensureState(
      `${prefix}.date`,
      {
        name: "Datum",
        type: "string",
        role: "date",
        read: true,
        write: false,
        def: "",
      },
      isoDateOf(dayPlan.dateKey),
    );
    await this.ensureState(
      `${prefix}.sourceTimestamp`,
      {
        name: "Stand der Daten (Server)",
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: "",
      },
      dayPlan.sourceTimestamp || "",
    );
    await this.ensureState(
      `${prefix}.lessonCount`,
      {
        name: "Anzahl Stunden",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      dayPlan.lessons.length,
    );
    await this.ensureState(
      `${prefix}.lessons`,
      {
        name: "Stunden (JSON)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(dayPlan.lessons),
    );
  }

  async updateHomeInfoPoint(school, config) {
    await this.ensureChannel("homework", "Hausaufgaben");
    await this.ensureChannel("remarks", "Bemerkungen");
    await this.ensureChannel("grades", "Zensuren");
    await this.ensureChannel("grades.subjects", "Zensuren je Fach");

    const loginUrl = homeworkLoginUrl(school);
    const dataUrl = homeworkDataUrl(school);
    const html = await loginAndFetch(
      loginUrl,
      dataUrl,
      config.haUsername,
      config.haPassword,
    );

    const homework = parseHomework(html);
    const newHomework = await this.detectNew(
      "homework",
      homework,
      (h) => `${h.date}|${h.subject}|${h.task}`,
    );
    await this.ensureState(
      "homework.count",
      {
        name: "Anzahl Hausaufgaben",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      homework.length,
    );
    await this.ensureState(
      "homework.entries",
      {
        name: "Hausaufgaben (JSON)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(homework),
    );
    await this.ensureState(
      "homework.newCount",
      {
        name: "Neue Hausaufgaben seit dem letzten Abruf",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      newHomework.length,
    );
    await this.ensureState(
      "homework.newEntries",
      {
        name: "Neue Hausaufgaben seit dem letzten Abruf (JSON)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(newHomework),
    );

    const remarks = parseRemarks(html);
    const newRemarks = await this.detectNew(
      "remarks",
      remarks,
      (r) => `${r.date}|${r.type}|${r.subject}|${r.text}`,
    );
    await this.ensureState(
      "remarks.count",
      {
        name: "Anzahl Bemerkungen",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      remarks.length,
    );
    await this.ensureState(
      "remarks.entries",
      {
        name: "Bemerkungen (JSON)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(remarks),
    );
    await this.ensureState(
      "remarks.newCount",
      {
        name: "Neue Bemerkungen seit dem letzten Abruf",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      newRemarks.length,
    );
    await this.ensureState(
      "remarks.newEntries",
      {
        name: "Neue Bemerkungen seit dem letzten Abruf (JSON)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(newRemarks),
    );

    // parseGrades() liefert JEDES auf der Home.InfoPoint-Seite gelistete Fach, auch
    // solche ganz ohne einzelne Zensur (Home.InfoPoint zeigt dort einfach eine leere
    // Tabelle). "Anzahl Fächer mit Zensuren" darf deshalb nur die Fächer zählen, die
    // wirklich mindestens einen Eintrag haben - vorher zählte es alle 24 gelisteten
    // Fächer, auch die 21 ohne jede Note.
    const gradesBySubject = parseGrades(html);
    const gradesObj = Object.fromEntries(gradesBySubject);
    const subjectsWithGrades = [...gradesBySubject.entries()].filter(
      ([, entries]) => entries.length > 0,
    );

    await this.ensureState(
      "grades.subjectCount",
      {
        name: "Anzahl Fächer mit mindestens einer Zensur",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      subjectsWithGrades.length,
    );
    await this.ensureState(
      "grades.bySubject",
      {
        name: "Alle Fächer als JSON (auch ohne Zensuren)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "{}",
      },
      JSON.stringify(gradesObj),
    );

    // Zusätzlich pro Fach ein eigener, browsbarer Kanal statt nur des einen großen
    // JSON-Blobs - dafür in Admin/Objekte deutlich besser lesbar. Nur Fächer mit
    // mindestens einer Zensur bekommen einen Kanal, um den Baum nicht mit 21 leeren
    // Fächern zuzumüllen. Die Durchschnittsberechnung (parseGradeValue/gradeAverageLabel)
    // ist 1:1 aus content-zensuren.php (noteToFloat/floatToNote) portiert - NUR "1".."6"
    // mit optionalem "+"/"-" zählt als Zensur (z. B. "2+" -> 1.7, "2-" -> 2.3), alles
    // andere (auch "1,5" oder Freitext) fließt NICHT in den Durchschnitt ein, zählt aber
    // weiterhin zu `count`.
    const allNumericGrades = [];
    for (const [label, entries] of subjectsWithGrades) {
      const prefix = `grades.subjects.${slugifySubject(label)}`;
      const numericGrades = entries
        .map((e) => parseGradeValue(e.grade))
        .filter((v) => v !== null);
      allNumericGrades.push(...numericGrades);
      const rawAverage = numericGrades.length > 0 ? mean(numericGrades) : null;

      await this.ensureChannel(prefix, label);
      await this.ensureState(
        `${prefix}.label`,
        {
          name: "Fach",
          type: "string",
          role: "text",
          read: true,
          write: false,
          def: "",
        },
        label,
      );
      await this.ensureState(
        `${prefix}.count`,
        {
          name: "Anzahl Zensuren",
          type: "number",
          role: "value",
          read: true,
          write: false,
          def: 0,
        },
        entries.length,
      );
      await this.ensureState(
        `${prefix}.average`,
        {
          name: "Durchschnitt als Zahl (nur numerisch auswertbare Zensuren)",
          type: "number",
          role: "value",
          read: true,
          write: false,
          def: 0,
        },
        rawAverage !== null ? roundTo2(rawAverage) : null,
      );
      await this.ensureState(
        `${prefix}.averageNote`,
        {
          name: 'Durchschnitt als Zensur (wie im PHP-Original, z. B. "1+")',
          type: "string",
          role: "text",
          read: true,
          write: false,
          def: "-",
        },
        gradeAverageLabel(rawAverage),
      );
      await this.ensureState(
        `${prefix}.entries`,
        {
          name: "Zensuren (JSON)",
          type: "string",
          role: "json",
          read: true,
          write: false,
          def: "[]",
        },
        JSON.stringify(entries),
      );
    }

    // grades.overallAverage/-Note gibt es im PHP-Original nicht (das kennt nur den
    // Durchschnitt je Fach) - als zusätzlicher Komfort-State über alle Fächer hinweg,
    // mit derselben Berechnungslogik.
    const rawOverallAverage =
      allNumericGrades.length > 0 ? mean(allNumericGrades) : null;
    await this.ensureState(
      "grades.overallAverage",
      {
        name: "Durchschnitt über alle Fächer als Zahl (unwertet je Einzelnote, nicht je Fach)",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      rawOverallAverage !== null ? roundTo2(rawOverallAverage) : null,
    );
    await this.ensureState(
      "grades.overallAverageNote",
      {
        name: "Durchschnitt über alle Fächer als Zensur",
        type: "string",
        role: "text",
        read: true,
        write: false,
        def: "-",
      },
      gradeAverageLabel(rawOverallAverage),
    );

    // Für den Neu-Abgleich flach über alle Fächer (Zensuren tragen anders als Hausaufgaben/
    // Bemerkungen kein direktes Datenfeld für "welches Fach", das steckt nur im Gruppierungs-Key).
    const flatGrades = [];
    for (const [subject, entries] of subjectsWithGrades) {
      for (const entry of entries) {
        flatGrades.push({ subject, ...entry });
      }
    }
    const newGrades = await this.detectNew(
      "grades",
      flatGrades,
      (g) => `${g.subject}|${g.date}|${g.grade}|${g.remark}`,
    );
    await this.ensureState(
      "grades.newCount",
      {
        name: "Neue Zensuren seit dem letzten Abruf",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      newGrades.length,
    );
    await this.ensureState(
      "grades.newEntries",
      {
        name: "Neue Zensuren seit dem letzten Abruf (JSON)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
      },
      JSON.stringify(newGrades),
    );

    const totalNew = newHomework.length + newRemarks.length + newGrades.length;
    await this.ensureState(
      "info.newItemsCount",
      {
        name: "Neue Einträge in diesem Abruf (Hausaufgaben+Bemerkungen+Zensuren)",
        type: "number",
        role: "value",
        read: true,
        write: false,
        def: 0,
      },
      totalNew,
    );
    if (totalNew > 0) {
      // Wird bewusst NUR bei echtem Neuzugang geschrieben (nicht bei jedem Poll), damit
      // eine Automatisierung zuverlässig per "State hat sich geändert" auf genau dieses
      // Ereignis reagieren kann - ein einfacher true/false-State könnte bei zwei
      // aufeinanderfolgenden "es gibt Neues"-Zyklen keine erneute Änderung auslösen.
      await this.ensureState(
        "info.lastNewAt",
        {
          name: "Zeitpunkt des letzten Neuzugangs",
          type: "string",
          role: "value.time",
          read: true,
          write: false,
          def: "",
        },
        new Date().toISOString(),
      );
      this.log.info(
        `Neu seit dem letzten Abruf: ${newHomework.length} Hausaufgabe(n), ${newRemarks.length} Bemerkung(en), ${newGrades.length} Zensur(en).`,
      );
    }
  }

  /**
   * Vergleicht `items` mit der beim letzten Lauf unter `${prefix}.seenKeys` gespeicherten
   * Merkliste (stabile Schlüssel via `keyFn`) und liefert nur die neu hinzugekommenen
   * Einträge zurück. Aktualisiert die Merkliste danach auf den aktuellen Stand.
   * Beim allerersten Lauf (noch keine Merkliste vorhanden) gilt bewusst NICHTS als neu -
   * sonst würden beim Erstinstall/Update alle bereits bestehenden Einträge als "neu"
   * gemeldet.
   *
   * @param prefix
   * @param items
   * @param keyFn
   */
  async detectNew(prefix, items, keyFn) {
    const seenId = `${prefix}.seenKeys`;
    const state = await this.getStateAsync(seenId);
    const isFirstRun = !state || state.val === null || state.val === undefined;
    let previousKeys;
    try {
      previousKeys = new Set(isFirstRun ? [] : JSON.parse(state.val));
    } catch {
      previousKeys = new Set();
    }

    const currentKeys = items.map(keyFn);
    const newItems = isFirstRun
      ? []
      : items.filter((_, i) => !previousKeys.has(currentKeys[i]));

    await this.ensureState(
      seenId,
      {
        name: "Interne Merkliste bereits gesehener Einträge (nicht für Nutzer gedacht)",
        type: "string",
        role: "json",
        read: true,
        write: false,
        def: "[]",
        expert: true,
      },
      JSON.stringify(currentKeys),
    );

    return newItems;
  }

  async ensureChannel(id, name) {
    await this.setObjectNotExistsAsync(id, {
      type: "channel",
      common: { name: { en: name, de: name } },
      native: {},
    });
  }

  /**
   * Legt einen State beim ersten Aufruf an (Objekt-Definition) und schreibt danach immer den aktuellen Wert.
   *
   * @param id
   * @param common
   * @param value
   */
  async ensureState(id, common, value) {
    await this.setObjectNotExistsAsync(id, {
      type: "state",
      common: { ...common },
      native: {},
    });
    await this.setStateAsync(id, { val: value, ack: true });
  }

  onUnload(callback) {
    try {
      if (this.pollTimer) {
        this.clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
      callback();
    } catch {
      callback();
    }
  }
}

if (require.main !== module) {
  module.exports = (options) => new ESmobil(options);
} else {
  new ESmobil();
}
