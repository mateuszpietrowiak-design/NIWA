import { writeFileSync } from "node:fs";

const key = process.env.XAI_API_KEY;
if (!key) {
  console.error("Brak sekretu XAI_API_KEY. Plik wiedzy nie został ruszony.");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const prompt = `Jesteś Agro Expert. Zrób cotygodniowy przegląd dla gospodarstwa rolnego na Dolnym Śląsku.
Uprawy, o których wolno pisać ogólnie: pszenica, żyto, pszenżyto, jęczmień, rzepak, kukurydza, burak cukrowy, ziemniak skrobiowy, soja, słonecznik, poplony.
NIE znasz nazw pól, badań gleby, kosztów ani danych osobowych. Nie wymyślaj ich. Nie wpisuj nazwiska ani numerów działek.
Sprawdź w internecie tylko rzeczy z ostatnich 14 dni, które mogą zmienić decyzję: nawożenie, gleba, ochrona (rejestracja i wycofania w Polsce), ARiMR, WPR, ekoschematy, maszyny precyzyjne, ceny nawozów i płodów.
Źródła w tej kolejności: IUNG-PIB, IHAR-PIB, IO-PIB, PIORiN, MRiRW, ARiMR, COBORU, Komisja Europejska, EUR-Lex, recenzowane badania. Materiał producenta to trop, nie dowód.
Jak tydzień nic istotnego nie wniósł, ustaw weekEmpty na true i zostaw listy puste albo bardzo krótkie. Nie rób raportu na siłę.
Odpowiedz WYŁĄCZNIE JSON-em:
{"updatedAt":"${today}","weekEmpty":false,"note":"jedno zdanie czego plik nie zastępuje","headlines":[{"grade":"A","text":"","source":""}],"fertilization":[],"soil":[],"protection":[],"subsidies":[],"tech":[],"economy":[],"doNow":[],"watch":[],"sources":[{"title":"","url":""}]}
grade tylko A, B albo C. Maksymalnie 5 headlines, po 3 pozycje w pozostałych listach. Każdy text po polsku, jedno albo dwa zdania. url musi być prawdziwy, ze strony którą naprawdę otworzyłeś.`;

function textFrom(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  const parts = [];
  if (Array.isArray(body?.output)) {
    for (const item of body.output) {
      if (typeof item?.text === "string") parts.push(item.text);
      if (Array.isArray(item?.content)) {
        for (const chunk of item.content) {
          if (typeof chunk?.text === "string") parts.push(chunk.text);
        }
      }
    }
  }
  if (parts.length) return parts.join("\n");
  const choice = body?.choices?.[0]?.message?.content;
  return typeof choice === "string" ? choice : "";
}

async function ask(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${url} ${res.status} ${raw.slice(0, 300)}`);
  return JSON.parse(raw);
}

let rawText = "";
try {
  const body = await ask("https://api.x.ai/v1/responses", {
    model: "grok-4.5",
    input: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search" }],
  });
  rawText = textFrom(body);
} catch (error) {
  console.error(String(error));
  const body = await ask("https://api.x.ai/v1/chat/completions", {
    model: "grok-4.5",
    temperature: 0.2,
    search_parameters: { mode: "on", return_citations: true, max_search_results: 12 },
    messages: [{ role: "user", content: prompt }],
  });
  rawText = textFrom(body);
}

const match = rawText.match(/\{[\s\S]*\}/);
if (!match) {
  console.error(rawText.slice(0, 500));
  throw new Error("Model nie oddał JSON.");
}
const data = JSON.parse(match[0]);
if (!data.updatedAt) data.updatedAt = today;
data.note =
  data.note ||
  "Skrót publiczny. Nie zastępuje etykiety środka, rejestru PIORiN ani strony ARiMR.";
writeFileSync(new URL("../agro-wiedza.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(`Zapisano agro-wiedza.json (${data.updatedAt}).`);
