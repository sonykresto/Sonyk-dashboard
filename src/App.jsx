import { useState, useEffect, useMemo, useCallback } from "react";
import Papa from "papaparse";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, MessageSquareWarning } from "lucide-react";

// ---------------------------------------------------------------------------
// CONFIG MULTI-CLIENTS — un lien par restaurant via ?client=xxx dans l'URL
// ---------------------------------------------------------------------------
const CLIENTS = {
  batbout: { spreadsheetId: "10EsXW5HTPr2D_51roBCZyIFSibcBFLLHL8VBl44wUbk", label: "Batbout++" },
  lacrosta: { spreadsheetId: "1F1ayIWUhhu9tM1K2AggSiU2JhjEsmp8XC_Ldgw6GEVo", label: "La Crosta Trattoria" },
};

const GREEN = "#2ecc8a";
const BLUE = "#2E6FFF";
const ORANGE = "#f59e0b";
const GRAY = "#9ca3af";
const RED = "#ef4444";

function gvizUrl(spreadsheetId, sheetName) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

// mois_courant / total_rapport are laid out VERTICALLY: col A = variable name, col B = value
function parseVerticalSheet(csvText) {
  const { data } = Papa.parse(csvText, { skipEmptyLines: true });
  const obj = {};
  for (const row of data) {
    if (!row || row.length < 2) continue;
    const key = (row[0] || "").trim();
    const raw = (row[1] || "").trim();
    if (!key) continue;
    const num = Number(raw.replace(",", "."));
    obj[key] = raw !== "" && !Number.isNaN(num) ? num : raw;
  }
  return obj;
}

// historique_mensuel is laid out HORIZONTALLY: row 1 = headers, one row per month
function parseHistoriqueSheet(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return data
    .filter((row) => row.mois)
    .map((row) => {
      const out = { mois: row.mois };
      for (const k of Object.keys(row)) {
        if (k === "mois") continue;
        if (k === "niveau_sonyk") { out[k] = row[k]; continue; }
        const num = Number(String(row[k]).replace(",", "."));
        out[k] = Number.isNaN(num) ? row[k] : num;
      }
      return out;
    });
}

// Commentaire tab: raw row-per-review log, used for the negative reviews summary
function parseCommentaireSheet(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return data;
}

function parseAnyDate(value) {
  if (!value) return null;
  const d1 = new Date(value);
  if (!Number.isNaN(d1.getTime())) return d1;
  const parts = String(value).split(/[\/\-]/);
  if (parts.length === 3) {
    let d, m, y;
    if (parts[0].length === 4) { [y, m, d] = parts; } else { [d, m, y] = parts; }
    const d2 = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(d2.getTime())) return d2;
  }
  return null;
}

function buildMonthEntry(dateLabel, m) {
  const total =
    (m.total_positif || 0) + (m.total_negatif || 0) + (m.total_ignorer || 0) + (m.total_etoile_positive || 0);
  const d = parseAnyDate(dateLabel);
  return {
    key: dateLabel,
    year: d ? d.getFullYear() : null,
    month: d ? d.getMonth() : null, // 0-indexed
    label: formatMonthLabel(dateLabel),
    total,
    positif: m.total_positif || 0,
    negatif: m.total_negatif || 0,
    ignorer: m.total_ignorer || 0,
    etoile_positive: m.total_etoile_positive || 0,
    score: m.score_sonyk || 0,
    niveau: m.niveau_sonyk || "",
    fr: m.total_fr || 0,
    en: m.total_en || 0,
    mix: m.total_mix || 0,
    autre: m.total_autre || 0,
  };
}

function formatMonthLabel(dateStr) {
  const d = parseAnyDate(dateStr);
  const MOIS_FR = ["Jan.", "Fév.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sep.", "Oct.", "Nov.", "Déc."];
  if (d) return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
  return String(dateStr || "—");
}

const INFO_RAPPORT_LABEL = {
  insultant: "Insultant",
  accusation_grave: "Accusation grave",
  experience_grave: "Expérience grave",
  experience_negative: "Expérience négative",
};
const INFO_RAPPORT_COLOR = {
  insultant: RED,
  accusation_grave: RED,
  experience_grave: ORANGE,
  experience_negative: ORANGE,
};

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------

function Delta({ current, previous, suffix = "", invert = false }) {
  const diff = current - previous;
  const good = invert ? diff < 0 : diff > 0;
  const flat = diff === 0;
  const Icon = flat ? Minus : good ? TrendingUp : TrendingDown;
  const color = flat ? "text-gray-400" : good ? "text-[#2ecc8a]" : "text-red-500";
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${color}`}>
      <Icon size={15} strokeWidth={2.5} />
      {diff > 0 ? "+" : ""}{diff}{suffix}
    </span>
  );
}

function KPICard({ label, value, sub, delta, accent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1.5 shadow-sm">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color: accent }}>{value}</span>
        {sub && <span className="text-sm text-gray-400 pb-1">{sub}</span>}
      </div>
      {delta}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="leading-5">
          {p.name} : <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Invalid / missing client screen
// ---------------------------------------------------------------------------
function InvalidClientScreen() {
  return (
    <div className="min-h-full w-full bg-[#f7f8fa] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <span className="text-xl font-extrabold tracking-tight" style={{ color: BLUE }}>SONYK</span>
        <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2">Lien invalide</h1>
        <p className="text-gray-500 text-sm">
          Ce lien ne correspond à aucun restaurant. Vérifie l'adresse ou contacte Sonyk pour obtenir ton lien.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SonykDashboardLive() {
  const clientKey = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("client");
  }, []);
  const client = clientKey ? CLIENTS[clientKey] : null;

  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [negativeReviews, setNegativeReviews] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lastFetched, setLastFetched] = useState(null);

  const load = useCallback(async () => {
    if (!client) return;
    setStatus((s) => (s === "ok" ? "refreshing" : "loading"));
    setErrorMsg("");
    try {
      const [curRes, histRes, commentRes] = await Promise.all([
        fetch(gvizUrl(client.spreadsheetId, "mois_courant")),
        fetch(gvizUrl(client.spreadsheetId, "historique_mensuel")),
        fetch(gvizUrl(client.spreadsheetId, "Commentaire")),
      ]);
      if (!curRes.ok || !histRes.ok || !commentRes.ok) {
        throw new Error("Impossible de lire la feuille (vérifie le partage public).");
      }

      const curText = await curRes.text();
      const histText = await histRes.text();
      const commentText = await commentRes.text();

      const curObj = parseVerticalSheet(curText);
      const histRows = parseHistoriqueSheet(histText);
      const commentRows = parseCommentaireSheet(commentText);

      const curEntry = buildMonthEntry(curObj.mois_cible, curObj);
      const histEntries = histRows.map((r) => buildMonthEntry(r.mois, r));
      const combined = [...histEntries, curEntry];

      setHistory(combined);
      setNegativeReviews(commentRows);
      setSelectedIdx(combined.length - 1);
      setLastFetched(new Date());
      setStatus("ok");
    } catch (e) {
      setErrorMsg(e.message || "Erreur inconnue");
      setStatus("error");
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [client, load]);

  if (!client) return <InvalidClientScreen />;

  const series = history;
  const sel = series[selectedIdx];
  const prev = series[selectedIdx - 1];
  const hasPrevious = !!prev;

  const langueData = useMemo(() => {
    if (!sel) return [];
    return [
      { name: "Français", value: sel.fr, color: BLUE },
      { name: "Anglais", value: sel.en, color: GREEN },
      { name: "Mix", value: sel.mix, color: ORANGE },
      { name: "Autre", value: sel.autre, color: GRAY },
    ].filter((d) => d.value > 0);
  }, [sel]);

  // Filter negative reviews to the currently selected month, most recent first
  const negativeForMonth = useMemo(() => {
    if (!sel || sel.year === null) return [];
    return negativeReviews
      .filter((r) => {
        if ((r.type || "").trim().toLowerCase() !== "negatif") return false;
        const d = parseAnyDate(r.mois_cible);
        if (!d) return false;
        return d.getFullYear() === sel.year && d.getMonth() === sel.month;
      })
      .filter((r) => r.resume_client && r.resume_client.trim())
      .sort((a, b) => (parseAnyDate(b.mois_cible) || 0) - (parseAnyDate(a.mois_cible) || 0))
      .slice(0, 8);
  }, [negativeReviews, sel]);

  return (
    <div className="min-h-full w-full bg-[#f7f8fa] p-6 md:p-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight" style={{ color: BLUE }}>SONYK</span>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-500">Tableau de bord réputation</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{client.label}</h1>
          </div>

          <div className="flex items-center gap-3">
            {series.length > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
                {series.map((m, i) => (
                  <button
                    key={m.key + i}
                    onClick={() => setSelectedIdx(i)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      i === selectedIdx ? "text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                    style={i === selectedIdx ? { backgroundColor: BLUE } : {}}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 bg-white rounded-lg px-3 py-2 shrink-0"
            >
              <RefreshCw size={14} className={status === "loading" || status === "refreshing" ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>
        </div>

        {status === "loading" && (
          <div className="mb-6 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg px-4 py-3">
            Chargement des données depuis Google Sheets…
          </div>
        )}
        {status === "error" && (
          <div className="mb-6 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Impossible de charger les données en direct.</p>
              <p className="text-red-600 mt-0.5">{errorMsg} Vérifie que le fichier Google Sheet est bien partagé en "Lecteur" pour "Toute personne disposant du lien".</p>
            </div>
          </div>
        )}
        {(status === "ok" || status === "refreshing") && lastFetched && (
          <div className="mb-6 text-xs text-gray-400">
            Dernière mise à jour : {lastFetched.toLocaleTimeString("fr-CA")} · Actualisation auto toutes les 60s
          </div>
        )}

        {sel && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KPICard
                label="Score Sonyk"
                value={`${sel.score}%`}
                sub={sel.niveau}
                accent={GREEN}
                delta={hasPrevious && <Delta current={sel.score} previous={prev.score} suffix=" pts" />}
              />
              <KPICard
                label="Total avis"
                value={sel.total}
                accent={BLUE}
                delta={hasPrevious && <Delta current={sel.total} previous={prev.total} />}
              />
              <KPICard
                label="Avis positifs"
                value={sel.positif}
                accent={GREEN}
                delta={hasPrevious && <Delta current={sel.positif} previous={prev.positif} />}
              />
              <KPICard
                label="Avis négatifs"
                value={sel.negatif}
                accent={ORANGE}
                delta={hasPrevious && <Delta current={sel.negatif} previous={prev.negatif} invert />}
              />
            </div>

            {series.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">Évolution du Score Sonyk</h2>
                  <span className="text-xs text-gray-400">{series.length} mois disponibles</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="score" name="Score Sonyk" stroke={GREEN} strokeWidth={2.5} fill="url(#scoreFill)" dot={{ r: 3, fill: GREEN }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {series.length > 1 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="font-semibold text-gray-800 mb-4">Répartition des avis par mois</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="positif" name="Positif" stackId="a" fill={GREEN} />
                      <Bar dataKey="etoile_positive" name="Sans commentaire" stackId="a" fill="#a7f3d0" />
                      <Bar dataKey="negatif" name="Négatif" stackId="a" fill={ORANGE} />
                      <Bar dataKey="ignorer" name="Ignoré" stackId="a" fill="#d1d5db" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h2 className="font-semibold text-gray-800 mb-4">Langue des avis — {sel.label}</h2>
                {langueData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={langueData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {langueData.map((d) => <Cell key={d.name} fill={d.color} stroke="none" />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 py-10 text-center">Pas encore de données de langue pour ce mois.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
              <h2 className="font-semibold text-gray-800 mb-4">
                {sel.label} vs {hasPrevious ? prev.label : "—"}
              </h2>
              {hasPrevious ? (
                <div className="space-y-3">
                  {[
                    { label: "Score Sonyk", cur: sel.score, prv: prev.score, suffix: " pts" },
                    { label: "Total avis", cur: sel.total, prv: prev.total },
                    { label: "Avis positifs", cur: sel.positif, prv: prev.positif },
                    { label: "Avis négatifs", cur: sel.negatif, prv: prev.negatif, invert: true },
                    { label: "Sans commentaire", cur: sel.etoile_positive, prv: prev.etoile_positive },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{row.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 tabular-nums">{row.prv} → </span>
                        <span className="font-semibold text-gray-800 tabular-nums">{row.cur}</span>
                        <Delta current={row.cur} previous={row.prv} suffix={row.suffix || ""} invert={row.invert} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Pas encore de mois précédent archivé pour comparer.
                </p>
              )}
            </div>

            {/* Résumé des avis négatifs */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquareWarning size={18} className="text-orange-500" />
                <h2 className="font-semibold text-gray-800">Avis négatifs — {sel.label}</h2>
              </div>
              {negativeForMonth.length > 0 ? (
                <div className="space-y-3">
                  {negativeForMonth.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
                      <span
                        className="mt-1 shrink-0 w-2 h-2 rounded-full"
                        style={{ backgroundColor: INFO_RAPPORT_COLOR[r.info_rapport] || GRAY }}
                      />
                      <div>
                        {r.info_rapport && INFO_RAPPORT_LABEL[r.info_rapport] && (
                          <span className="text-xs font-medium text-gray-400 block mb-0.5">
                            {INFO_RAPPORT_LABEL[r.info_rapport]}
                          </span>
                        )}
                        <p className="text-sm text-gray-700">{r.resume_client}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun avis négatif détaillé pour ce mois.</p>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
