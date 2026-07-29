import { useState, useEffect, useMemo, useCallback } from "react";
import Papa from "papaparse";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, MessageSquareWarning, Lock, Tag } from "lucide-react";

// ---------------------------------------------------------------------------
// CONFIG MULTI-CLIENTS — un lien + un mot de passe par restaurant
// ---------------------------------------------------------------------------
const CLIENTS = {
  batbout: {
    spreadsheetId: "10EsXW5HTPr2D_51roBCZyIFSibcBFLLHL8VBl44wUbk",
    label: "Batbout++",
    password: "moez2026!",
  },
  lacrosta: {
    spreadsheetId: "1F1ayIWUhhu9tM1K2AggSiU2JhjEsmp8XC_Ldgw6GEVo",
    label: "La Crosta Trattoria",
    password: "salah2026!",
  },
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

function parseCommentaireSheet(csvText) {
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return data;
}

// Toujours interpréter les dates au format québécois JJ/MM/AAAA en priorité —
// ne jamais laisser new Date() deviner (il suppose MM/JJ/AAAA par défaut,
// ce qui inverse jour et mois silencieusement).
function parseAnyDate(value) {
  if (!value) return null;
  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const parts = s.split(/[\/\-]/);
  if (parts.length === 3) {
    let d, m, y;
    if (parts[0].length === 4) { [y, m, d] = parts; }
    else { [d, m, y] = parts; }
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function buildMonthEntry(dateLabel, m) {
  const total =
    (m.total_positif || 0) + (m.total_negatif || 0) + (m.total_ignorer || 0) + (m.total_etoile_positive || 0);
  const d = parseAnyDate(dateLabel);
  return {
    key: dateLabel,
    year: d ? d.getFullYear() : null,
    month: d ? d.getMonth() : null,
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

function GoogleBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full">
      <svg width="12" height="12" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Google
    </span>
  );
}

function KeywordRow({ k }) {
  const partage = k.positif === k.negatif;
  const dot = partage ? GRAY : k.positif > k.negatif ? GREEN : ORANGE;
  const label = partage
    ? `${k.positif} positifs – ${k.negatif} négatifs`
    : k.negatif === 0 ? "Que des retours positifs"
    : k.positif === 0 ? "Que des retours négatifs"
    : k.positif > k.negatif ? "Majoritairement positif" : "Majoritairement négatif";
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
        <span className="font-medium text-gray-800 text-sm">{k.nom}</span>
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Password gate — mot de passe par restaurant, en mémoire pour la session
// ---------------------------------------------------------------------------
function PasswordGate({ onUnlock, restaurantLabel, correctPassword }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === correctPassword) { onUnlock(); } else { setError(true); }
  };

  return (
    <div className="min-h-full w-full bg-[#f7f8fa] flex items-center justify-center p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl font-extrabold tracking-tight" style={{ color: BLUE }}>SONYK</span>
        </div>
        <p className="text-sm text-gray-500 mb-6">Tableau de bord — {restaurantLabel}</p>

        <div className="flex items-center gap-2 mb-2">
          <Lock size={14} className="text-gray-400" />
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Mot de passe</label>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="••••••••"
          className={`w-full border rounded-lg px-3 py-2.5 text-sm mb-1 outline-none focus:ring-2 ${
            error ? "border-red-300 focus:ring-red-200" : "border-gray-200 focus:ring-blue-200"
          }`}
          autoFocus
        />
        {error && <p className="text-xs text-red-500 mb-3">Mot de passe incorrect.</p>}
        {!error && <div className="mb-3" />}

        <button
          type="button"
          onClick={submit}
          className="w-full text-white text-sm font-medium rounded-lg py-2.5 mt-2 cursor-pointer"
          style={{ backgroundColor: BLUE }}
        >
          Accéder au tableau de bord
        </button>
      </div>
    </div>
  );
}

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
// Main dashboard (après déverrouillage)
// ---------------------------------------------------------------------------
function Dashboard({ client }) {
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [commentRows, setCommentRows] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [lastFetched, setLastFetched] = useState(null);

  const load = useCallback(async () => {
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
      const rawComments = parseCommentaireSheet(commentText);

      const curEntry = buildMonthEntry(curObj.mois_cible, curObj);
      const histEntries = histRows.map((r) => buildMonthEntry(r.mois, r));
      const combined = [...histEntries, curEntry];

      setHistory(combined);
      setCommentRows(rawComments);
      setSelectedIdx(combined.length - 1);
      setLastFetched(new Date());
      setStatus("ok");
    } catch (e) {
      setErrorMsg(e.message || "Erreur inconnue");
      setStatus("error");
    }
  }, [client]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

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

  // Avis négatifs du mois affiché, avec leur resume_client déjà écrit par Claude
  const negativeForMonth = useMemo(() => {
    if (!sel || sel.year === null) return [];
    return commentRows
      .filter((r) => (r.type || "").trim().toLowerCase() === "negatif")
      .filter((r) => {
        const d = parseAnyDate(r.mois_cible);
        return d && d.getFullYear() === sel.year && d.getMonth() === sel.month;
      })
      .filter((r) => r.resume_client && r.resume_client.trim())
      .sort((a, b) => (parseAnyDate(b.mois_cible) || 0) - (parseAnyDate(a.mois_cible) || 0))
      .slice(0, 8);
  }, [commentRows, sel]);

  // Mots-clés fréquents du mois affiché, calculés en direct depuis Commentaire
  const keywordsForMonth = useMemo(() => {
    if (!sel || sel.year === null) return [];
    const counts = {};
    for (const r of commentRows) {
      const type = (r.type || "").trim().toLowerCase();
      if (type !== "positif" && type !== "negatif") continue;
      const d = parseAnyDate(r.mois_cible);
      if (!d || d.getFullYear() !== sel.year || d.getMonth() !== sel.month) continue;
      const rawKeywords = (r.mot_cle || "").trim();
      if (!rawKeywords) continue;
      for (let kw of rawKeywords.split(",")) {
        kw = kw.trim();
        if (!kw) continue;
        const nomAffiche = kw.charAt(0).toUpperCase() + kw.slice(1);
        if (!counts[nomAffiche]) counts[nomAffiche] = { nom: nomAffiche, positif: 0, negatif: 0 };
        counts[nomAffiche][type] += 1;
      }
    }
    return Object.values(counts)
      .sort((a, b) => (b.positif + b.negatif) - (a.positif + a.negatif))
      .slice(0, 5);
  }, [commentRows, sel]);

  return (
    <div className="min-h-full w-full bg-[#f7f8fa] p-6 md:p-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight" style={{ color: BLUE }}>SONYK</span>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-500">Tableau de bord réputation</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-2xl font-bold text-gray-900">{client.label}</h1>
              <GoogleBadge />
            </div>
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
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
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
              <KPICard
                label="Étoile positive"
                value={sel.etoile_positive}
                accent={GREEN}
                delta={hasPrevious && <Delta current={sel.etoile_positive} previous={prev.etoile_positive} />}
              />
              <KPICard
                label="Ignorés"
                value={sel.ignorer}
                accent={GRAY}
                delta={hasPrevious && <Delta current={sel.ignorer} previous={prev.ignorer} invert />}
              />
            </div>

            {series.length > 1 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-800">Évolution du Score Sonyk</h2>
                  <span className="text-xs text-gray-400">{series.length} mois disponibles</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
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
                    <BarChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="positif" name="Positif" stackId="a" fill={GREEN} />
                      <Bar dataKey="etoile_positive" name="Avis étoile positive" stackId="a" fill="#a7f3d0" />
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

            {/* Mots-clés fréquents */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Tag size={18} className="text-blue-500" />
                <h2 className="font-semibold text-gray-800">Sujets les plus mentionnés — {sel.label}</h2>
              </div>
              <p className="text-xs text-gray-400 mb-3">Détectés automatiquement dans les avis Google de ce mois.</p>
              {keywordsForMonth.length > 0 ? (
                <div>
                  {keywordsForMonth.map((k) => <KeywordRow key={k.nom} k={k} />)}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun mot-clé détecté pour ce mois.</p>
              )}
            </div>

            {hasPrevious && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
                <h2 className="font-semibold text-gray-800 mb-4">
                  {sel.label} vs {prev.label}
                </h2>
                <div className="space-y-3">
                  {[
                    { label: "Score Sonyk", cur: sel.score, prv: prev.score, suffix: " pts" },
                    { label: "Total avis", cur: sel.total, prv: prev.total },
                    { label: "Avis positifs", cur: sel.positif, prv: prev.positif },
                    { label: "Avis négatifs", cur: sel.negatif, prv: prev.negatif, invert: true },
                    { label: "Avis étoile positive", cur: sel.etoile_positive, prv: prev.etoile_positive },
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
              </div>
            )}

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

// ---------------------------------------------------------------------------
// Root — lit ?client=xxx dans l'URL, gère le mot de passe, puis affiche le dashboard
// ---------------------------------------------------------------------------
export default function SonykDashboardLive() {
  const clientKey = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("client");
  }, []);
  const client = clientKey ? CLIENTS[clientKey] : null;
  const [unlocked, setUnlocked] = useState(false);

  if (!client) return <InvalidClientScreen />;
  if (!unlocked) {
    return (
      <PasswordGate
        onUnlock={() => setUnlocked(true)}
        restaurantLabel={client.label}
        correctPassword={client.password}
      />
    );
  }
  return <Dashboard client={client} />;
}
