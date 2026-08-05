// api/dashboard-data.js
//
// Fonction serverless Vercel. Tourne côté serveur, jamais envoyée au navigateur.
// C'est ICI, et uniquement ici, que vivent les IDs de fichiers Google Sheets
// et les mots de passe des clients — le navigateur ne les voit jamais.

const CLIENTS = {
  batbout: {
    spreadsheetId: "10EsXW5HTPr2D_51roBCZyIFSibcBFLLHL8VBl44wUbk",
    label: "Batbout++",
    password: "Moez2026!",
  },
  lacrosta: {
    spreadsheetId: "1F1ayIWUhhu9tM1K2AggSiU2JhjEsmp8XC_Ldgw6GEVo",
    label: "La Crosta Trattoria",
    password: "Salah2026!",
  },
};

// URL du webhook Make.com qui écrit dans Sonyk_Analytics > Visites.
// À remplacer par la vraie URL une fois le scénario Make créé.
const VISIT_WEBHOOK_URL = "COLLE_ICI_TON_URL_WEBHOOK_MAKE";

function gvizUrl(spreadsheetId, sheetName) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

// Log une "vraie" consultation — jamais appelée pour les actualisations
// automatiques toutes les 60s, ni pour le bouton "Actualiser" manuel.
// Volontairement "fire-and-forget" : si Make ne répond pas ou est lent,
// ça ne ralentit jamais le chargement du dashboard pour le restaurateur.
function logVisit(clientKey) {
  if (!VISIT_WEBHOOK_URL || VISIT_WEBHOOK_URL.startsWith("COLLE_ICI")) return;
  fetch(VISIT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: clientKey }),
  }).catch(() => {});
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const { client: clientKey, password, event } = req.body || {};
  const client = CLIENTS[clientKey];

  if (!client) {
    return res.status(404).json({ error: "Restaurant introuvable" });
  }
  if (password !== client.password) {
    return res.status(401).json({ error: "Mot de passe incorrect" });
  }

  // Une "visite" = ouverture réelle du dashboard (mot de passe tapé, ou
  // reconnexion automatique via l'appareil mémorisé). Les actualisations
  // périodiques (event = "refresh") ne comptent jamais.
  if (event === "open") {
    logVisit(clientKey);
  }

  try {
    const [curRes, histRes, commentRes] = await Promise.all([
      fetch(gvizUrl(client.spreadsheetId, "mois_courant")),
      fetch(gvizUrl(client.spreadsheetId, "historique_mensuel")),
      fetch(gvizUrl(client.spreadsheetId, "Commentaire")),
    ]);

    if (!curRes.ok || !histRes.ok || !commentRes.ok) {
      throw new Error("Impossible de lire la feuille Google Sheets.");
    }

    const [moisCourant, historique, commentaire] = await Promise.all([
      curRes.text(),
      histRes.text(),
      commentRes.text(),
    ]);

    return res.status(200).json({
      label: client.label,
      moisCourant,
      historique,
      commentaire,
    });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Erreur serveur" });
  }
}
