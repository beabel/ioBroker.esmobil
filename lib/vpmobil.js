"use strict";

const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");

/**
 * Client + Parser für die VpMobil/Indiware-XML-Schnittstelle, wie sie auch von der
 * offiziellen VpMobil24-App und diversen Stundenplan-Webseiten genutzt wird. Portiert
 * 1:1 aus der Kotlin-Referenzimplementierung (VpMobilApi.kt / VpMobilXmlParser.kt) einer
 * bestehenden Android-App, die dieselbe Schnittstelle anspricht.
 *
 * XML-Struktur (vereinfacht):
 *   VpMobil > Kopf > zeitstempel
 *   VpMobil > Klassen > Kl > Kurz                          (Klassenname, z. B. "08m2")
 *   VpMobil > Klassen > Kl > Pl > Std > (St, Beginn, Ende, Fa[@FaAe], Le, Ra, If)
 */

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  // Diese Elemente kommen in der Praxis mal einzeln, mal mehrfach vor - ohne diese
  // Regel würde fast-xml-parser bei genau einem Treffer ein einzelnes Objekt statt
  // eines Arrays liefern, was den Aufrufcode verzweigen lassen müsste. So ist die
  // Form immer garantiert ein Array (siehe auch asArray() als zusätzliche Absicherung).
  isArray: (name) => ["Kl", "Std", "Ku", "Ue"].includes(name),
});

/**
 * Normalisiert einen fast-xml-parser-Knoten (String | {"#text": string, ...} | undefined) zu einem getrimmten String.
 *
 * @param node
 */
function textOf(node) {
  if (node === undefined || node === null) {
    return "";
  }
  if (typeof node === "string") {
    return node.trim();
  }
  if (typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }
  if (typeof node === "object" && "#text" in node) {
    return String(node["#text"]).trim();
  }
  return "";
}

/**
 * Normalisiert (undefined | einzelnes Objekt | Array) zu immer einem Array.
 *
 * @param node
 */
function asArray(node) {
  if (node === undefined || node === null) {
    return [];
  }
  return Array.isArray(node) ? node : [node];
}

/**
 * Error thrown when a VpMobil/Indiware request fails (network or unexpected HTTP status).
 */
class VpMobilError extends Error {
  /**
   * @param {string} message error message
   * @param {number} [httpCode] HTTP status code, if the request reached the server
   */
  constructor(message, httpCode) {
    super(message);
    this.name = "VpMobilError";
    this.httpCode = httpCode;
  }
}

class VpMobilClient {
  /**
   * @param {string} baseUrl z. B. "https://stundenplan.example.de/schule/klassenplan" (OHNE
   *   trailing slash, wie von VpMobilApi.kt vorausgesetzt - wird hier zusätzlich getrimmt)
   * @param {string} username
   * @param {string} password
   */
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  async #get(path) {
    try {
      const response = await axios.get(this.baseUrl + path, {
        auth: { username: this.username, password: this.password },
        timeout: 15000,
        responseType: "text",
        // axios würde eine Antwort mit Text/XML sonst ggf. selbst zu parsen versuchen -
        // wir wollen den rohen String, um ihn selbst mit fast-xml-parser zu verarbeiten.
        transformResponse: (data) => data,
      });
      return response.data;
    } catch (err) {
      const code = err.response ? err.response.status : undefined;
      throw new VpMobilError(`HTTP ${code || err.message} bei ${path}`, code);
    }
  }

  /**
   * Lädt eine einzelne mobdaten-Datei (z. B. "Klassen.xml" oder "PlanKl20260904.xml") als Rohtext.
   *
   * @param fileName
   */
  async fetchXml(fileName) {
    return this.#get(`/mobdaten/${fileName}`);
  }

  /**
   * Fragt _phpmob/vpdir.php ab: liefert die Liste aller Dateien, die der Server gerade
   * bereitstellt (Format "datei1;hash1;datei2;hash2;..."). Feste Werte pw/art/User-Agent
   * sind Teil des öffentlichen VpMobil-Protokolls (kein echtes Geheimnis, siehe VpMobilApi.kt).
   */
  async fetchDirectoryListing() {
    try {
      const params = new URLSearchParams();
      params.append("pw", "I N D I W A R E");
      params.append("art", "mobk");
      const response = await axios.post(
        `${this.baseUrl}/_phpmob/vpdir.php`,
        params,
        {
          auth: { username: this.username, password: this.password },
          headers: { "User-Agent": "VpMobil24-2.6-VpDir" },
          timeout: 15000,
          responseType: "text",
          transformResponse: (data) => data,
        },
      );
      const text = response.data;
      return text
        .split(";")
        .map((s) => s.trim())
        .filter((_, index) => index % 2 === 0)
        .filter((s) => s.length > 0);
    } catch (err) {
      const code = err.response ? err.response.status : undefined;
      throw new VpMobilError(
        `HTTP ${code || err.message} beim Laden der Dateiliste`,
        code,
      );
    }
  }
}

/**
 * Extrahiert die Datums-Schlüssel (yyyyMMdd) aller PlanKl-Dateien aus einer vpdir.php-Listing-Antwort.
 *
 * @param fileNames
 */
function parseAvailableDateKeys(fileNames) {
  const regex = /PlanKl(\d{8})\.xml/;
  const keys = new Set();
  for (const name of fileNames) {
    const m = regex.exec(name);
    if (m) {
      keys.add(m[1]);
    }
  }
  return [...keys];
}

/**
 * Alle Klassennamen aus Klassen.xml, natürlich sortiert (z. B. "07m2" vor "10a").
 *
 * @param xml
 */
function parseKlassen(xml) {
  const doc = xmlParser.parse(xml);
  const kl = asArray(doc?.VpMobil?.Klassen?.Kl);
  const classes = kl.map((k) => textOf(k.Kurz)).filter((v) => v.length > 0);
  return [...new Set(classes)].sort(naturalCompare);
}

/**
 * Parst den Tagesplan einer bestimmten Klasse aus einer PlanKlYYYYMMDD.xml-Datei.
 *
 * @param xml
 * @param dateKey
 * @param klasse
 * @returns {{dateKey: string, lessons: Array<object>, sourceTimestamp: string|null}}
 */
function parseDayPlan(xml, dateKey, klasse) {
  const doc = xmlParser.parse(xml);
  const root = doc?.VpMobil || {};
  const sourceTimestamp = textOf(root?.Kopf?.zeitstempel) || null;

  const klList = asArray(root?.Klassen?.Kl);
  const target = klList.find((k) => textOf(k.Kurz) === klasse);
  const lessons = [];

  if (target) {
    const stdList = asArray(target?.Pl?.Std);
    for (const std of stdList) {
      const faNode = std.Fa;
      const faText = textOf(faNode);
      const faChanged = !!(
        faNode &&
        typeof faNode === "object" &&
        faNode["@_FaAe"] !== undefined
      );
      const beginn = textOf(std.Beginn);
      const ende = textOf(std.Ende);

      const subjects = faText
        .split(/[/,;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s !== "---");

      if (subjects.length > 0) {
        lessons.push({
          period: textOf(std.St),
          begin: beginn,
          // Fehlt <Ende>, NICHT auf "23:59" ausweichen (ließe die Stunde fälschlich als
          // "aktuell laufend" gelten) - Beginnzeit als neutraler Fallback stattdessen.
          end: ende || beginn,
          subjects,
          teacher: textOf(std.Le),
          room: textOf(std.Ra),
          info: textOf(std.If) || null,
          changed: faChanged,
        });
      }
    }
  }

  return { dateKey, lessons, sourceTimestamp };
}

/**
 * Natürliche Sortierung für Klassen-/Fachnamen wie "07m2", "10a" (Ziffernblöcke numerisch vergleichen).
 *
 * @param a
 * @param b
 */
function naturalCompare(a, b) {
  const re = /(\d+|\D+)/g;
  const partsA = a.match(re) || [];
  const partsB = b.match(re) || [];
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = partsA[i] || "";
    const pb = partsB[i] || "";
    const na = /^\d+$/.test(pa) ? parseInt(pa, 10) : null;
    const nb = /^\d+$/.test(pb) ? parseInt(pb, 10) : null;
    if (na !== null && nb !== null) {
      if (na !== nb) {
        return na - nb;
      }
    } else if (pa !== pb) {
      return pa < pb ? -1 : 1;
    }
  }
  return 0;
}

module.exports = {
  VpMobilClient,
  VpMobilError,
  parseAvailableDateKeys,
  parseKlassen,
  parseDayPlan,
};
