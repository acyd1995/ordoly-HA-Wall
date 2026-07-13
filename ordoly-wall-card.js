/*
 * Ordoly Wall — Home Assistant Lovelace card (FEAT-030).
 *
 * A dashboard element (custom:ordoly-wall-card) that shows ONE Ordoly wall —
 * a per-group wall or a custom wall — live and fully interactive, looking and
 * behaving exactly like the wall in the Ordoly app: check tasks done/undone,
 * request a skip, read task info, browse + buy shop items, view badges.
 *
 * Security: it never stores your account password. You generate an API KEY in
 * the app (Settings → "Home Assistant wall") for a single wall you administer;
 * the card signs in with your Ordoly EMAIL + that key at POST /ha-wall/session
 * for a short, wall-scoped token, and talks only to /ha-wall/*.
 *
 * Self-contained vanilla JS — no build step, no dependencies.
 */

const PALETTE = [
  '#6E63FF', '#FF7B5A', '#34C77B', '#F5A623',
  '#3B9DFF', '#E85DA1', '#11C6C2', '#AA66CC',
];
const defaultWallColor = (id) => PALETTE[Math.abs(Number(id) || 0) % PALETTE.length];

const TIER_COLORS = { grey: '#B5A0FF', bronze: '#CD8B3A', silver: '#B0B8C4', gold: '#E9A934' };
const tierColor = (t) => TIER_COLORS[t] || TIER_COLORS.grey;
// Tier labels are localized per-instance via OrdolyWallCard._tierLabel().
const TIER_ORDER = [null, 'grey', 'bronze', 'silver', 'gold'];
const tierPoints = (t) => Math.max(0, TIER_ORDER.indexOf(t));

const INTERESTED = new Set([
  'wall_changed', 'today_changed', 'tasks_changed', 'members_changed',
  'group_state_changed', 'approvals_changed', 'points_changed',
  'shop_changed', 'badges_changed', 'skip_requests_changed', 'custom_walls_changed',
]);

const STYLES = `
:host {
  --owc-bg: #f6f4ff; --owc-surface: #fff; --owc-surface-2: #f0edff;
  --owc-text: #1c1b22; --owc-text-soft: #6b6680; --owc-text-mute: #8e8aa3;
  --owc-primary: #7c6fff; --owc-primary-soft: rgba(124,111,255,.12);
  --owc-green: #2e9b4a; --owc-green-soft: rgba(46,155,74,.15);
  --owc-orange: #d97706; --owc-orange-soft: rgba(217,119,6,.15);
  --owc-border: rgba(0,0,0,.08); --owc-radius: 16px;
  display: block;
}
@media (prefers-color-scheme: dark) {
  :host {
    --owc-bg: #0e0d14; --owc-surface: #1c1b25; --owc-surface-2: #232231;
    --owc-text: #f0eef6; --owc-text-soft: #b8b3cc; --owc-text-mute: #807ba0;
    --owc-primary: #9f93ff; --owc-primary-soft: rgba(159,147,255,.18);
    --owc-green-soft: rgba(46,155,74,.22); --owc-orange-soft: rgba(217,119,6,.22);
    --owc-border: rgba(255,255,255,.08);
  }
}
* { box-sizing: border-box; }
.owc {
  background: var(--owc-bg); color: var(--owc-text);
  border-radius: var(--owc-radius); overflow: hidden;
  font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  display: flex; flex-direction: column;
}
.owc-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: var(--owc-primary-soft);
  border-bottom: 1px solid var(--owc-border);
}
.owc-header.done { background: var(--owc-green-soft); }
.owc-header-icon {
  width: 34px; height: 34px; border-radius: 10px; background: var(--owc-primary);
  color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px;
}
.owc-header.done .owc-header-icon { background: var(--owc-green); }
.owc-title {
  flex: 1; min-width: 0; font-size: 17px; font-weight: 700; color: var(--owc-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.owc-header.done .owc-title { color: var(--owc-green); }
.owc-count { color: var(--owc-text-soft); font-size: 13px; }
.owc-refresh { border: 0; background: transparent; color: var(--owc-text-soft); cursor: pointer; font-size: 18px; padding: 6px; border-radius: 8px; }
.owc-refresh:hover { background: var(--owc-surface-2); }
.owc-columns {
  display: flex; gap: 12px; padding: 12px; overflow-x: auto; overflow-y: hidden;
  min-height: 120px;
}
.owc-empty, .owc-state {
  padding: 32px; text-align: center; color: var(--owc-text-soft); font-size: 15px;
}
.owc-state.error { color: #c43a3a; }
.col {
  flex: 1 0 320px; min-width: 320px; background: var(--owc-surface);
  border-radius: 16px; border: 1px solid var(--owc-border);
  display: flex; flex-direction: column; overflow: hidden;
}
.col-header {
  display: grid; gap: 6px; padding: 14px; text-align: center;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.col-avatar {
  width: 48px; height: 48px; margin: 0 auto; border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--accent); font-size: 20px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.col-name { font-weight: 700; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-actions { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.action-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 20px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--accent); font-size: 13px; font-weight: 600; cursor: pointer;
}
.action-chip:hover { background: color-mix(in srgb, var(--accent) 28%, transparent); }
.col-bar { height: 6px; background: var(--owc-surface-2); border-radius: 4px; overflow: hidden; }
.col-bar-fill { height: 100%; background: var(--accent); transition: width 250ms ease-out; }
.col-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.col-progress { font-size: 13px; color: var(--owc-text-soft); letter-spacing: .5px; }
.col-balance { font-size: 13px; font-weight: 700; color: #FFC107; }
.col-list { flex: 1; overflow-y: auto; padding: 10px; max-height: var(--owc-col-max, 62vh); }
.col-empty { padding: 24px 8px; text-align: center; color: var(--owc-text-mute); font-size: 14px; }
.cat-header { font-size: 11px; font-weight: 700; letter-spacing: .8px; padding: 8px 4px 4px; }
.task {
  display: flex; align-items: center; gap: 8px; padding: 6px 4px 6px 8px; margin-bottom: 6px;
  border-radius: 12px; background: var(--owc-surface); border: 1px solid var(--owc-border);
  border-left: 4px solid var(--task-strip, var(--owc-primary)); cursor: pointer;
}
.task:hover { background: color-mix(in srgb, var(--task-strip, var(--owc-primary)) 6%, var(--owc-surface)); }
.task.busy { opacity: .55; pointer-events: none; }
.task.done { border-left-color: var(--owc-green); }
.task.done .task-name { color: var(--owc-text-mute); text-decoration: line-through; }
.task.pending { border-left-color: var(--owc-orange); }
.task-icon {
  width: 28px; height: 28px; border-radius: 9px; display: inline-flex; align-items: center;
  justify-content: center; font-size: 15px; flex-shrink: 0;
  background: color-mix(in srgb, var(--task-strip, var(--owc-primary)) 14%, transparent); color: var(--owc-text-soft);
}
.task.done .task-icon { background: color-mix(in srgb, var(--owc-green) 14%, transparent); color: var(--owc-green); }
.task.pending .task-icon { background: color-mix(in srgb, var(--owc-orange) 14%, transparent); color: var(--owc-orange); }
.task-name { flex: 1; font-size: 15px; font-weight: 500; }
.task-actions { display: inline-flex; align-items: center; margin-left: auto; gap: 2px; }
.task-action {
  background: transparent; border: 0; cursor: pointer; font-size: 15px; line-height: 1;
  padding: 6px 7px; border-radius: 8px; color: inherit;
}
.task-action:hover { background: color-mix(in srgb, var(--owc-text-soft) 18%, transparent); }
.grp-header { display: flex; align-items: center; gap: 6px; padding: 8px 4px 4px; margin-top: 4px; }
.grp-header-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--grp-color); flex-shrink: 0; }
.grp-header-name { flex: 1; font-size: 13px; font-weight: 700; color: var(--grp-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grp-header-balance { font-size: 12px; font-weight: 700; color: #FFC107; background: rgba(255,193,7,.14); padding: 2px 7px; border-radius: 10px; }
.grp-countdown { display: flex; flex-direction: column; gap: 4px; padding: 0 4px 6px; }
.grp-countdown-row { display: flex; align-items: center; gap: 6px; }
.grp-countdown-label { font-size: 12px; font-weight: 600; color: var(--grp-color); }
.grp-countdown.ended .grp-countdown-label { color: #E53935; }
/* dialogs */
dialog.owc-panel { border: 0; padding: 0; background: transparent; max-width: none; max-height: none; }
dialog.owc-panel[open] { position: fixed; inset: 0; width: 100%; height: 100%; margin: 0; display: flex; justify-content: flex-end; }
dialog.owc-panel::backdrop { background: rgba(0,0,0,.42); }
.panel-inner { width: min(420px, 100vw); height: 100%; background: var(--owc-surface); color: var(--owc-text); border-left: 1px solid var(--owc-border); box-shadow: -8px 0 32px rgba(0,0,0,.2); display: flex; flex-direction: column; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--owc-border); }
.panel-header h2 { margin: 0; font-size: 18px; }
.panel-close { border: 0; background: transparent; font-size: 22px; cursor: pointer; color: var(--owc-text-soft); }
.panel-body { flex: 1; overflow-y: auto; padding: 8px 20px 24px; }
.panel-group-header { display: flex; align-items: center; gap: 8px; padding: 14px 0 6px; border-top: 1px solid var(--owc-border); margin-top: 8px; }
.panel-group-header:first-child { border-top: none; margin-top: 0; }
.panel-group-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.panel-group-name { flex: 1; font-weight: 700; font-size: 15px; }
.panel-group-balance { font-size: 13px; font-weight: 700; color: #FFC107; background: rgba(255,193,7,.14); padding: 2px 8px; border-radius: 10px; }
.panel-loading, .panel-empty, .panel-error { font-size: 14px; padding: 12px 0; margin: 0; }
.panel-loading { color: var(--owc-text-soft); }
.panel-empty { color: var(--owc-text-mute); }
.panel-error { color: #c43a3a; }
.shop-item { display: flex; align-items: center; gap: 10px; padding: 8px; margin-bottom: 8px; border-radius: 12px; background: var(--owc-surface); border: 1px solid var(--owc-border); border-left: 4px solid var(--shop-strip, var(--owc-primary)); }
.shop-item.disabled { opacity: .55; }
.shop-item-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; background: color-mix(in srgb, var(--shop-strip, var(--owc-primary)) 14%, transparent); }
.shop-item-info { flex: 1; min-width: 0; }
.shop-item-name { font-weight: 700; font-size: 15px; }
.shop-item-desc { font-size: 12px; color: var(--owc-text-soft); }
.shop-item-trailing { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.shop-item-cost { font-size: 13px; font-weight: 700; padding: 4px 10px; border-radius: 12px; color: var(--shop-strip, var(--owc-primary)); background: color-mix(in srgb, var(--shop-strip, var(--owc-primary)) 12%, transparent); }
.shop-buy-btn { padding: 5px 14px; border-radius: 9px; background: transparent; border: 1px solid var(--shop-strip, var(--owc-primary)); color: var(--shop-strip, var(--owc-primary)); font-size: 13px; font-weight: 700; cursor: pointer; }
.shop-buy-btn:disabled { cursor: default; border-color: var(--owc-border); color: var(--owc-text-mute); }
.badge-tile { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--owc-border); }
.badge-tile:last-child { border-bottom: none; }
.badge-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.badge-info { flex: 1; min-width: 0; }
.badge-name { font-weight: 600; font-size: 14px; }
.badge-tier { font-size: 12px; font-weight: 700; }
.badge-progress { font-size: 12px; color: var(--owc-text-soft); }
#owc-info-dialog { border: 0; border-radius: 14px; padding: 18px 22px; background: var(--owc-surface); color: var(--owc-text); max-width: 340px; }
#owc-info-dialog::backdrop { background: rgba(0,0,0,.45); }
#owc-info-dialog h3 { margin: 0 0 10px; font-size: 18px; }
#owc-info-dialog .info-line { margin: 4px 0; font-size: 14px; color: var(--owc-text-soft); }
#owc-info-dialog menu { display: flex; justify-content: flex-end; margin: 12px 0 0; padding: 0; }
#owc-info-dialog menu button { background: var(--owc-primary); color: #fff; border: 0; border-radius: 8px; padding: 6px 14px; cursor: pointer; }
.owc-toast { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); background: #c43a3a; color: #fff; padding: 8px 14px; border-radius: 10px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; }
.owc-toast.show { opacity: 1; }
`;

const esc = (s) => String(s == null ? '' : s).replace(/[&"<>]/g, (c) =>
  ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));

// ── i18n ─────────────────────────────────────────────────────────────────────
// The card ships all 7 Ordoly languages. The active language is chosen in the
// card editor ("Language" → Auto or a specific language); "Auto" follows the
// Home Assistant UI language, then the browser, then English. Wording mirrors
// the Ordoly app where the same concept exists (season/event countdown, task
// statuses, shop, badges, leaderboard) so the wall reads the same everywhere.
const I18N = {
  en: {
    loading: 'Loading…',
    couldNotConnect: 'Could not connect',
    invalidCreds: 'Invalid email or key',
    wallUnavailable: 'This wall is unavailable (the admin may have lost access)',
    tooManyAttempts: 'Too many attempts — try again shortly',
    signInFailed: (n) => `Sign-in failed (${n})`,
    cannotReach: 'Cannot reach the Ordoly server. Check the Server URL.',
    credentialRevoked: 'Credential revoked',
    failedToLoadCode: (n) => `Failed to load (${n})`,
    failedToLoad: 'Failed to load',
    refresh: 'Refresh',
    everyoneDone: "Everyone's done for today! 🎉",
    memberCount: (n) => (n === 1 ? '1 member' : `${n} members`),
    wallInactive: 'This wall is inactive.',
    noContent: 'No content to show right now.',
    shop: 'Shop',
    badges: 'Badges',
    ranking: 'Ranking',
    allDone: 'All done! 🎉',
    seasonEnded: 'Season ended',
    seasonEndsToday: 'Season ends today',
    seasonEndsInDays: (n) => `Season ends in ${n} days`,
    eventPassed: 'The event has passed',
    eventToday: 'The big day is today!',
    eventInDays: (n) => `${n} days to go`,
    requestSkip: 'Request skip',
    info: 'Info',
    skipRequested: 'Skip requested — a parent/admin will approve it',
    skipFailed: 'Could not request skip',
    actionFailed: 'Action failed',
    close: 'Close',
    statusDone: 'Done',
    statusPending: 'Awaiting approval',
    statusSkip: 'Skip requested',
    statusOpen: 'Open',
    pts: (n) => `${n} pts`,
    shopEmpty: 'No items available right now.',
    shopFailed: 'Failed to load shop',
    bought: 'Bought',
    locked: 'Locked',
    closed: 'Closed',
    buy: 'Buy',
    buyDone: 'Done',
    purchaseFailed: 'Purchase failed',
    badgesEmpty: 'No badges earned yet.',
    badgesFailed: 'Failed to load badges',
    tierStarter: 'Starter',
    tierBronze: 'Bronze',
    tierSilver: 'Silver',
    tierGold: 'Gold',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${thr}${u} for ${tier}`,
    rankingEmpty: 'No members yet.',
    rankingFailed: 'Failed to load ranking',
    cfgServerUrl: 'Server URL',
    cfgEmail: 'Ordoly email',
    cfgKey: 'API key',
    cfgTitle: 'Title (optional)',
    cfgLanguage: 'Language',
    cfgLangAuto: 'Auto (Home Assistant)',
    cfgHint: 'Generate the API key in the Ordoly app: Settings → Home Assistant wall. Use your Ordoly account email.',
    errBaseUrl: 'The Server URL is required',
    errCreds: 'Email and key are required — generate the key in the Ordoly app (Settings → Home Assistant wall) and use your Ordoly email',
    pickerDesc: 'Show one Ordoly wall (group or custom) live and interactive.',
  },
  nl: {
    loading: 'Laden…',
    couldNotConnect: 'Kan geen verbinding maken',
    invalidCreds: 'Ongeldig e-mailadres of sleutel',
    wallUnavailable: 'Deze muur is niet beschikbaar (de beheerder heeft mogelijk geen toegang meer)',
    tooManyAttempts: 'Te veel pogingen — probeer het zo opnieuw',
    signInFailed: (n) => `Aanmelden mislukt (${n})`,
    cannotReach: 'Kan de Ordoly-server niet bereiken. Controleer de server-URL.',
    credentialRevoked: 'Toegang ingetrokken',
    failedToLoadCode: (n) => `Laden mislukt (${n})`,
    failedToLoad: 'Laden mislukt',
    refresh: 'Vernieuwen',
    everyoneDone: 'Iedereen is klaar voor vandaag! 🎉',
    memberCount: (n) => (n === 1 ? '1 lid' : `${n} leden`),
    wallInactive: 'Deze muur is inactief.',
    noContent: 'Nu niets om te tonen.',
    shop: 'Winkel',
    badges: 'Badges',
    ranking: 'Ranglijst',
    allDone: 'Alles klaar! 🎉',
    seasonEnded: 'Seizoen afgelopen',
    seasonEndsToday: 'Seizoen eindigt vandaag',
    seasonEndsInDays: (n) => `Seizoen eindigt over ${n} dagen`,
    eventPassed: 'Het evenement is voorbij',
    eventToday: 'De grote dag is vandaag!',
    eventInDays: (n) => `Nog ${n} dagen`,
    requestSkip: 'Overslaan aanvragen',
    info: 'Info',
    skipRequested: 'Overslaan aangevraagd — een ouder/beheerder keurt het goed',
    skipFailed: 'Kon overslaan niet aanvragen',
    actionFailed: 'Actie mislukt',
    close: 'Sluiten',
    statusDone: 'Klaar',
    statusPending: 'Wacht op goedkeuring',
    statusSkip: 'Overslaan aangevraagd',
    statusOpen: 'Open',
    pts: (n) => `${n} ptn`,
    shopEmpty: 'Nu geen items beschikbaar.',
    shopFailed: 'Kan winkel niet laden',
    bought: 'Gekocht',
    locked: 'Vergrendeld',
    closed: 'Gesloten',
    buy: 'Kopen',
    buyDone: 'Klaar',
    purchaseFailed: 'Aankoop mislukt',
    badgesEmpty: 'Nog geen badges verdiend.',
    badgesFailed: 'Kan badges niet laden',
    tierStarter: 'Starter',
    tierBronze: 'Brons',
    tierSilver: 'Zilver',
    tierGold: 'Goud',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${thr}${u} voor ${tier}`,
    rankingEmpty: 'Nog geen leden.',
    rankingFailed: 'Kan ranglijst niet laden',
    cfgServerUrl: 'Server-URL',
    cfgEmail: 'Ordoly-e-mail',
    cfgKey: 'API-sleutel',
    cfgTitle: 'Titel (optioneel)',
    cfgLanguage: 'Taal',
    cfgLangAuto: 'Automatisch (Home Assistant)',
    cfgHint: 'Genereer de API-sleutel in de Ordoly-app: Instellingen → Home Assistant-muur. Gebruik het e-mailadres van je Ordoly-account.',
    errBaseUrl: 'De server-URL is vereist',
    errCreds: 'E-mailadres en sleutel zijn vereist — genereer de sleutel in de Ordoly-app (Instellingen → Home Assistant-muur) en gebruik je Ordoly-e-mailadres',
    pickerDesc: 'Toon één Ordoly-muur (groep of aangepast) live en interactief.',
  },
  fr: {
    loading: 'Chargement…',
    couldNotConnect: 'Connexion impossible',
    invalidCreds: 'E-mail ou clé invalide',
    wallUnavailable: "Ce mur est indisponible (l'administrateur a peut-être perdu l'accès)",
    tooManyAttempts: 'Trop de tentatives — réessayez dans un instant',
    signInFailed: (n) => `Échec de la connexion (${n})`,
    cannotReach: "Impossible de joindre le serveur Ordoly. Vérifiez l'URL du serveur.",
    credentialRevoked: 'Accès révoqué',
    failedToLoadCode: (n) => `Échec du chargement (${n})`,
    failedToLoad: 'Échec du chargement',
    refresh: 'Actualiser',
    everyoneDone: "Tout le monde a fini pour aujourd'hui ! 🎉",
    memberCount: (n) => (n === 1 ? '1 membre' : `${n} membres`),
    wallInactive: 'Ce mur est inactif.',
    noContent: 'Rien à afficher pour le moment.',
    shop: 'Boutique',
    badges: 'Badges',
    ranking: 'Classement',
    allDone: 'Tout fait ! 🎉',
    seasonEnded: 'Saison terminée',
    seasonEndsToday: 'La saison se termine aujourd\'hui',
    seasonEndsInDays: (n) => `La saison se termine dans ${n} jours`,
    eventPassed: "L'événement est passé",
    eventToday: "Le grand jour, c'est aujourd'hui !",
    eventInDays: (n) => `Plus que ${n} jours`,
    requestSkip: 'Demander à passer',
    info: 'Infos',
    skipRequested: 'Demande de saut envoyée — un parent/administrateur validera',
    skipFailed: 'Impossible de demander à passer',
    actionFailed: "Échec de l'action",
    close: 'Fermer',
    statusDone: 'Fait',
    statusPending: "En attente d'approbation",
    statusSkip: 'Saut demandé',
    statusOpen: 'Ouvert',
    pts: (n) => `${n} pts`,
    shopEmpty: 'Aucun article disponible pour le moment.',
    shopFailed: 'Échec du chargement de la boutique',
    bought: 'Acheté',
    locked: 'Verrouillé',
    closed: 'Fermée',
    buy: 'Acheter',
    buyDone: 'Fait',
    purchaseFailed: "Échec de l'achat",
    badgesEmpty: "Aucun badge gagné pour l'instant.",
    badgesFailed: 'Échec du chargement des badges',
    tierStarter: 'Débutant',
    tierBronze: 'Bronze',
    tierSilver: 'Argent',
    tierGold: 'Or',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${thr}${u} pour ${tier}`,
    rankingEmpty: 'Aucun membre pour le moment.',
    rankingFailed: 'Échec du chargement du classement',
    cfgServerUrl: 'URL du serveur',
    cfgEmail: 'E-mail Ordoly',
    cfgKey: 'Clé API',
    cfgTitle: 'Titre (facultatif)',
    cfgLanguage: 'Langue',
    cfgLangAuto: 'Auto (Home Assistant)',
    cfgHint: "Générez la clé API dans l'app Ordoly : Paramètres → Mur Home Assistant. Utilisez l'e-mail de votre compte Ordoly.",
    errBaseUrl: "L'URL du serveur est requise",
    errCreds: "L'e-mail et la clé sont requis — générez la clé dans l'app Ordoly (Paramètres → Mur Home Assistant) et utilisez votre e-mail Ordoly",
    pickerDesc: 'Affichez un mur Ordoly (groupe ou personnalisé) en direct et interactif.',
  },
  es: {
    loading: 'Cargando…',
    couldNotConnect: 'No se pudo conectar',
    invalidCreds: 'Correo o clave no válidos',
    wallUnavailable: 'Este muro no está disponible (puede que el administrador haya perdido el acceso)',
    tooManyAttempts: 'Demasiados intentos — inténtalo de nuevo en un momento',
    signInFailed: (n) => `Error al iniciar sesión (${n})`,
    cannotReach: 'No se puede conectar con el servidor de Ordoly. Comprueba la URL del servidor.',
    credentialRevoked: 'Acceso revocado',
    failedToLoadCode: (n) => `Error al cargar (${n})`,
    failedToLoad: 'Error al cargar',
    refresh: 'Actualizar',
    everyoneDone: '¡Todos han terminado por hoy! 🎉',
    memberCount: (n) => (n === 1 ? '1 miembro' : `${n} miembros`),
    wallInactive: 'Este muro está inactivo.',
    noContent: 'Nada que mostrar ahora mismo.',
    shop: 'Tienda',
    badges: 'Insignias',
    ranking: 'Clasificación',
    allDone: '¡Todo hecho! 🎉',
    seasonEnded: 'Temporada terminada',
    seasonEndsToday: 'La temporada termina hoy',
    seasonEndsInDays: (n) => `La temporada termina en ${n} días`,
    eventPassed: 'El evento ya pasó',
    eventToday: '¡El gran día es hoy!',
    eventInDays: (n) => `Faltan ${n} días`,
    requestSkip: 'Solicitar omitir',
    info: 'Info',
    skipRequested: 'Omisión solicitada — un padre/administrador la aprobará',
    skipFailed: 'No se pudo solicitar la omisión',
    actionFailed: 'La acción falló',
    close: 'Cerrar',
    statusDone: 'Hecho',
    statusPending: 'Pendiente de aprobación',
    statusSkip: 'Omisión solicitada',
    statusOpen: 'Abierto',
    pts: (n) => `${n} pts`,
    shopEmpty: 'No hay artículos disponibles ahora mismo.',
    shopFailed: 'Error al cargar la tienda',
    bought: 'Comprado',
    locked: 'Bloqueado',
    closed: 'Cerrada',
    buy: 'Comprar',
    buyDone: 'Hecho',
    purchaseFailed: 'La compra falló',
    badgesEmpty: 'Aún no se han ganado insignias.',
    badgesFailed: 'Error al cargar las insignias',
    tierStarter: 'Principiante',
    tierBronze: 'Bronce',
    tierSilver: 'Plata',
    tierGold: 'Oro',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${thr}${u} para ${tier}`,
    rankingEmpty: 'Aún no hay miembros.',
    rankingFailed: 'Error al cargar la clasificación',
    cfgServerUrl: 'URL del servidor',
    cfgEmail: 'Correo de Ordoly',
    cfgKey: 'Clave API',
    cfgTitle: 'Título (opcional)',
    cfgLanguage: 'Idioma',
    cfgLangAuto: 'Automático (Home Assistant)',
    cfgHint: 'Genera la clave API en la app de Ordoly: Ajustes → Muro de Home Assistant. Usa el correo de tu cuenta de Ordoly.',
    errBaseUrl: 'La URL del servidor es obligatoria',
    errCreds: 'El correo y la clave son obligatorios — genera la clave en la app de Ordoly (Ajustes → Muro de Home Assistant) y usa tu correo de Ordoly',
    pickerDesc: 'Muestra un muro de Ordoly (de grupo o personalizado) en vivo e interactivo.',
  },
  el: {
    loading: 'Φόρτωση…',
    couldNotConnect: 'Δεν ήταν δυνατή η σύνδεση',
    invalidCreds: 'Μη έγκυρο email ή κλειδί',
    wallUnavailable: 'Αυτός ο τοίχος δεν είναι διαθέσιμος (ο διαχειριστής μπορεί να έχασε την πρόσβαση)',
    tooManyAttempts: 'Πάρα πολλές προσπάθειες — δοκιμάστε ξανά σύντομα',
    signInFailed: (n) => `Η σύνδεση απέτυχε (${n})`,
    cannotReach: 'Δεν είναι δυνατή η σύνδεση με τον διακομιστή Ordoly. Ελέγξτε το URL του διακομιστή.',
    credentialRevoked: 'Η πρόσβαση ανακλήθηκε',
    failedToLoadCode: (n) => `Αποτυχία φόρτωσης (${n})`,
    failedToLoad: 'Αποτυχία φόρτωσης',
    refresh: 'Ανανέωση',
    everyoneDone: 'Όλοι τελείωσαν για σήμερα! 🎉',
    memberCount: (n) => (n === 1 ? '1 μέλος' : `${n} μέλη`),
    wallInactive: 'Αυτός ο τοίχος είναι ανενεργός.',
    noContent: 'Δεν υπάρχει τίποτα για εμφάνιση αυτή τη στιγμή.',
    shop: 'Κατάστημα',
    badges: 'Σήματα',
    ranking: 'Κατάταξη',
    allDone: 'Όλα έτοιμα! 🎉',
    seasonEnded: 'Η σεζόν έληξε',
    seasonEndsToday: 'Η σεζόν τελειώνει σήμερα',
    seasonEndsInDays: (n) => `Η σεζόν τελειώνει σε ${n} ημέρες`,
    eventPassed: 'Η εκδήλωση πέρασε',
    eventToday: 'Η μεγάλη μέρα είναι σήμερα!',
    eventInDays: (n) => `${n} ημέρες ακόμη`,
    requestSkip: 'Αίτημα παράλειψης',
    info: 'Πληροφορίες',
    skipRequested: 'Ζητήθηκε παράλειψη — ένας γονέας/διαχειριστής θα την εγκρίνει',
    skipFailed: 'Δεν ήταν δυνατό το αίτημα παράλειψης',
    actionFailed: 'Η ενέργεια απέτυχε',
    close: 'Κλείσιμο',
    statusDone: 'Έγινε',
    statusPending: 'Αναμονή έγκρισης',
    statusSkip: 'Ζητήθηκε παράλειψη',
    statusOpen: 'Ανοιχτό',
    pts: (n) => `${n} πόντ.`,
    shopEmpty: 'Δεν υπάρχουν διαθέσιμα προϊόντα αυτή τη στιγμή.',
    shopFailed: 'Αποτυχία φόρτωσης καταστήματος',
    bought: 'Αγοράστηκε',
    locked: 'Κλειδωμένο',
    closed: 'Κλειστό',
    buy: 'Αγορά',
    buyDone: 'Έγινε',
    purchaseFailed: 'Η αγορά απέτυχε',
    badgesEmpty: 'Δεν έχουν κερδηθεί σήματα ακόμη.',
    badgesFailed: 'Αποτυχία φόρτωσης σημάτων',
    tierStarter: 'Αρχάριος',
    tierBronze: 'Χάλκινο',
    tierSilver: 'Ασημένιο',
    tierGold: 'Χρυσό',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${thr}${u} για ${tier}`,
    rankingEmpty: 'Δεν υπάρχουν μέλη ακόμη.',
    rankingFailed: 'Αποτυχία φόρτωσης κατάταξης',
    cfgServerUrl: 'URL διακομιστή',
    cfgEmail: 'Email Ordoly',
    cfgKey: 'Κλειδί API',
    cfgTitle: 'Τίτλος (προαιρετικό)',
    cfgLanguage: 'Γλώσσα',
    cfgLangAuto: 'Αυτόματα (Home Assistant)',
    cfgHint: 'Δημιουργήστε το κλειδί API στην εφαρμογή Ordoly: Ρυθμίσεις → Home Assistant wall. Χρησιμοποιήστε το email του λογαριασμού σας Ordoly.',
    errBaseUrl: 'Απαιτείται το URL του διακομιστή',
    errCreds: 'Απαιτούνται email και κλειδί — δημιουργήστε το κλειδί στην εφαρμογή Ordoly (Ρυθμίσεις → Home Assistant wall) και χρησιμοποιήστε το email σας Ordoly',
    pickerDesc: 'Εμφανίστε έναν τοίχο Ordoly (ομάδας ή προσαρμοσμένο) ζωντανά και διαδραστικά.',
  },
  tr: {
    loading: 'Yükleniyor…',
    couldNotConnect: 'Bağlanılamadı',
    invalidCreds: 'Geçersiz e-posta veya anahtar',
    wallUnavailable: 'Bu duvar kullanılamıyor (yönetici erişimi kaybetmiş olabilir)',
    tooManyAttempts: 'Çok fazla deneme — birazdan tekrar deneyin',
    signInFailed: (n) => `Giriş başarısız (${n})`,
    cannotReach: "Ordoly sunucusuna ulaşılamıyor. Sunucu URL'sini kontrol edin.",
    credentialRevoked: 'Erişim iptal edildi',
    failedToLoadCode: (n) => `Yükleme başarısız (${n})`,
    failedToLoad: 'Yükleme başarısız',
    refresh: 'Yenile',
    everyoneDone: 'Bugün herkes bitirdi! 🎉',
    memberCount: (n) => `${n} üye`,
    wallInactive: 'Bu duvar etkin değil.',
    noContent: 'Şu anda gösterilecek bir şey yok.',
    shop: 'Mağaza',
    badges: 'Rozetler',
    ranking: 'Sıralama',
    allDone: 'Hepsi bitti! 🎉',
    seasonEnded: 'Sezon sona erdi',
    seasonEndsToday: 'Sezon bugün bitiyor',
    seasonEndsInDays: (n) => `Sezon ${n} gün içinde bitiyor`,
    eventPassed: 'Etkinlik geçti',
    eventToday: 'Büyük gün bugün!',
    eventInDays: (n) => `${n} gün kaldı`,
    requestSkip: 'Atlama iste',
    info: 'Bilgi',
    skipRequested: 'Atlama istendi — bir ebeveyn/yönetici onaylayacak',
    skipFailed: 'Atlama istenemedi',
    actionFailed: 'İşlem başarısız',
    close: 'Kapat',
    statusDone: 'Tamam',
    statusPending: 'Onay bekliyor',
    statusSkip: 'Atlama istendi',
    statusOpen: 'Açık',
    pts: (n) => `${n} puan`,
    shopEmpty: 'Şu anda mevcut ürün yok.',
    shopFailed: 'Mağaza yüklenemedi',
    bought: 'Alındı',
    locked: 'Kilitli',
    closed: 'Kapalı',
    buy: 'Satın al',
    buyDone: 'Tamam',
    purchaseFailed: 'Satın alma başarısız',
    badgesEmpty: 'Henüz rozet kazanılmadı.',
    badgesFailed: 'Rozetler yüklenemedi',
    tierStarter: 'Başlangıç',
    tierBronze: 'Bronz',
    tierSilver: 'Gümüş',
    tierGold: 'Altın',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${tier} için ${thr}${u}`,
    rankingEmpty: 'Henüz üye yok.',
    rankingFailed: 'Sıralama yüklenemedi',
    cfgServerUrl: "Sunucu URL'si",
    cfgEmail: 'Ordoly e-postası',
    cfgKey: 'API anahtarı',
    cfgTitle: 'Başlık (isteğe bağlı)',
    cfgLanguage: 'Dil',
    cfgLangAuto: 'Otomatik (Home Assistant)',
    cfgHint: 'API anahtarını Ordoly uygulamasında oluşturun: Ayarlar → Home Assistant wall. Ordoly hesap e-postanızı kullanın.',
    errBaseUrl: 'Sunucu URL\'si gerekli',
    errCreds: 'E-posta ve anahtar gerekli — anahtarı Ordoly uygulamasında oluşturun (Ayarlar → Home Assistant wall) ve Ordoly e-postanızı kullanın',
    pickerDesc: 'Bir Ordoly duvarını (grup veya özel) canlı ve etkileşimli gösterin.',
  },
  zh: {
    loading: '加载中…',
    couldNotConnect: '无法连接',
    invalidCreds: '邮箱或密钥无效',
    wallUnavailable: '此墙不可用（管理员可能已失去访问权限）',
    tooManyAttempts: '尝试次数过多 — 请稍后重试',
    signInFailed: (n) => `登录失败（${n}）`,
    cannotReach: '无法连接到 Ordoly 服务器。请检查服务器网址。',
    credentialRevoked: '访问权限已撤销',
    failedToLoadCode: (n) => `加载失败（${n}）`,
    failedToLoad: '加载失败',
    refresh: '刷新',
    everyoneDone: '今天大家都完成了！🎉',
    memberCount: (n) => `${n} 名成员`,
    wallInactive: '此墙未激活。',
    noContent: '暂时没有可显示的内容。',
    shop: '商店',
    badges: '徽章',
    ranking: '排行榜',
    allDone: '全部完成！🎉',
    seasonEnded: '赛季已结束',
    seasonEndsToday: '赛季今日结束',
    seasonEndsInDays: (n) => `赛季将在 ${n} 天后结束`,
    eventPassed: '活动已结束',
    eventToday: '大日子就是今天！',
    eventInDays: (n) => `还有 ${n} 天`,
    requestSkip: '申请跳过',
    info: '信息',
    skipRequested: '已申请跳过 — 家长/管理员将审批',
    skipFailed: '无法申请跳过',
    actionFailed: '操作失败',
    close: '关闭',
    statusDone: '完成',
    statusPending: '等待审批',
    statusSkip: '已申请跳过',
    statusOpen: '未完成',
    pts: (n) => `${n} 分`,
    shopEmpty: '暂时没有可购买的物品。',
    shopFailed: '加载商店失败',
    bought: '已购买',
    locked: '已锁定',
    closed: '已关闭',
    buy: '购买',
    buyDone: '完成',
    purchaseFailed: '购买失败',
    badgesEmpty: '尚未获得徽章。',
    badgesFailed: '加载徽章失败',
    tierStarter: '入门',
    tierBronze: '铜',
    tierSilver: '银',
    tierGold: '金',
    badgeProgress: (metric, u, thr, tier) => `${metric}${u} → ${thr}${u}（${tier}）`,
    rankingEmpty: '暂无成员。',
    rankingFailed: '加载排行榜失败',
    cfgServerUrl: '服务器网址',
    cfgEmail: 'Ordoly 邮箱',
    cfgKey: 'API 密钥',
    cfgTitle: '标题（可选）',
    cfgLanguage: '语言',
    cfgLangAuto: '自动（Home Assistant）',
    cfgHint: '在 Ordoly 应用中生成 API 密钥：设置 → Home Assistant wall。使用你的 Ordoly 账户邮箱。',
    errBaseUrl: '需要服务器网址',
    errCreds: '需要邮箱和密钥 — 在 Ordoly 应用中生成密钥（设置 → Home Assistant wall）并使用你的 Ordoly 邮箱',
    pickerDesc: '实时、可交互地显示一个 Ordoly 墙（群组或自定义）。',
  },
};

// Native language names for the editor dropdown, in a stable display order.
const LANG_ORDER = ['en', 'nl', 'fr', 'es', 'el', 'tr', 'zh'];
const LANG_NAMES = {
  en: 'English', nl: 'Nederlands', fr: 'Français', es: 'Español',
  el: 'Ελληνικά', tr: 'Türkçe', zh: '中文',
};

// Resolve a language code. An explicit choice wins; "auto"/empty follows the
// Home Assistant UI language, then the browser, then English. Region suffixes
// (en-GB, zh-Hans) collapse to the base language.
function resolveLocale(want, haLang) {
  if (want && want !== 'auto' && I18N[want]) return want;
  const raw = String(haLang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en');
  const code = raw.toLowerCase().split(/[-_]/)[0];
  return I18N[code] ? code : 'en';
}

// Translate a key for a locale. Values are either strings or functions (for
// interpolated/plural forms); missing keys fall back to English, then the key.
function tr(loc, key, ...args) {
  const dict = I18N[loc] || I18N.en;
  let v = dict[key];
  if (v == null) v = I18N.en[key];
  if (v == null) return key;
  return typeof v === 'function' ? v(...args) : v;
}

class OrdolyWallCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._built = false;
    this._token = null;
    this._sseToken = null;
    this._wall = null;
    this._stream = null;
    this._reloadDebounce = null;
    this._refreshTimer = null;
    this._safetyTimer = null;
    this._restartTimer = null;
    this._busyTasks = new Set();
  }

  setConfig(config) {
    const loc = resolveLocale(config && config.language, this._haLang);
    if (!config || !config.base_url) throw new Error('ordoly-wall-card: ' + tr(loc, 'errBaseUrl'));
    if (!config.email || !config.key) {
      throw new Error('ordoly-wall-card: ' + tr(loc, 'errCreds'));
    }
    this._config = {
      base_url: String(config.base_url).replace(/\/+$/, ''),
      email: String(config.email),
      key: String(config.key),
      title: config.title || '',
      language: config.language || 'auto',
      height: config.height || '62vh',
    };
    // Debounced: the dashboard editor calls setConfig on every keystroke, so
    // wait until typing pauses before re-authenticating and fetching the wall.
    if (this.isConnected) this._scheduleRestart(700);
  }

  // The card talks to the Ordoly backend directly, but we do read the Home
  // Assistant UI language so "Auto" can follow it. Capture it and re-render the
  // visible wall if the language actually changed while on Auto.
  set hass(hass) {
    const lang = hass && (hass.language || (hass.locale && hass.locale.language));
    if (!lang) return;
    const code = String(lang).toLowerCase().split(/[-_]/)[0];
    if (!code || code === this._haLang) return;
    this._haLang = code;
    const auto = !this._config || !this._config.language || this._config.language === 'auto';
    if (auto && this._built && this._data) this._renderWall(this._data);
  }

  // Active display language + a translator bound to it.
  _locale() { return resolveLocale(this._config && this._config.language, this._haLang); }
  _t(key, ...args) { return tr(this._locale(), key, ...args); }
  _tierLabel(t) {
    const k = { grey: 'tierStarter', bronze: 'tierBronze', silver: 'tierSilver', gold: 'tierGold' }[t];
    return k ? this._t(k) : '';
  }

  getCardSize() { return 8; }
  static getConfigElement() { return document.createElement('ordoly-wall-card-editor'); }
  static getStubConfig() {
    return { base_url: 'http://homeassistant.local:3000', email: '', key: '' };
  }

  connectedCallback() { if (this._config) this._scheduleRestart(0); }
  disconnectedCallback() { this._teardown(); }

  // ── lifecycle ────────────────────────────────────────────────────────────
  _scheduleRestart(delay = 0) {
    clearTimeout(this._restartTimer);
    this._restartTimer = setTimeout(() => this._restart(), delay);
  }

  async _restart() {
    this._teardown();
    this._build();
    this.shadowRoot.host.style.setProperty('--owc-col-max', this._config.height);
    this._setState(this._config.title || this._t('loading'), 'state');
    const ok = await this._authenticate();
    if (!ok) { this._setState(this._authError || this._t('couldNotConnect'), 'error'); return; }
    await this._load();
    this._openStream();
    this._refreshTimer = setInterval(() => this._refreshSession(), 10 * 60 * 1000);
    this._safetyTimer = setInterval(() => this._load(), 60 * 1000);
  }

  _teardown() {
    if (this._stream) { try { this._stream.close(); } catch (_) {} this._stream = null; }
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
    if (this._safetyTimer) { clearInterval(this._safetyTimer); this._safetyTimer = null; }
    if (this._reloadDebounce) { clearTimeout(this._reloadDebounce); this._reloadDebounce = null; }
    if (this._restartTimer) { clearTimeout(this._restartTimer); this._restartTimer = null; }
  }

  _build() {
    if (this._built) return;
    const root = document.createElement('div');
    root.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="owc" style="position:relative">
          <div class="owc-header" id="owc-header" hidden>
            <div class="owc-header-icon" id="owc-header-icon">📋</div>
            <div class="owc-title" id="owc-title"></div>
            <div class="owc-count" id="owc-count"></div>
            <button class="owc-refresh" id="owc-refresh" title="Refresh">⟳</button>
          </div>
          <div class="owc-columns" id="owc-columns" hidden></div>
          <div class="owc-state" id="owc-state"></div>
          <div class="owc-toast" id="owc-toast"></div>
        </div>
      </ha-card>`;
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(root);
    this._headerEl = this.shadowRoot.getElementById('owc-header');
    this._columnsEl = this.shadowRoot.getElementById('owc-columns');
    this._stateEl = this.shadowRoot.getElementById('owc-state');
    this._toastEl = this.shadowRoot.getElementById('owc-toast');
    const refreshBtn = this.shadowRoot.getElementById('owc-refresh');
    refreshBtn.title = this._t('refresh');
    refreshBtn.addEventListener('click', () => this._load());
    this._built = true;
  }

  _setState(text, cls) {
    this._stateEl.textContent = text || '';
    this._stateEl.className = 'owc-state' + (cls === 'error' ? ' error' : '');
    this._stateEl.hidden = !text;
    this._headerEl.hidden = !!text;
    this._columnsEl.hidden = !!text;
  }

  _toast(msg) {
    if (!this._toastEl) return;
    this._toastEl.textContent = msg;
    this._toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this._toastEl.classList.remove('show'), 3000);
  }

  // ── auth + transport ─────────────────────────────────────────────────────
  async _authenticate() {
    try {
      const r = await fetch(`${this._config.base_url}/ha-wall/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this._config.email,
          key: this._config.key,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        this._authError = r.status === 401 ? this._t('invalidCreds')
          : r.status === 403 ? this._t('wallUnavailable')
          : r.status === 429 ? this._t('tooManyAttempts')
          : (j.message || this._t('signInFailed', r.status));
        return false;
      }
      const j = await r.json();
      this._token = j.token;
      this._sseToken = j.sse_token;
      this._wall = j.wall;
      this._caps = j.capabilities || {};
      return true;
    } catch (e) {
      this._authError = this._t('cannotReach');
      return false;
    }
  }

  async _refreshSession() {
    try {
      const r = await fetch(`${this._config.base_url}/ha-wall/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this._token}` },
      });
      if (r.ok) {
        const j = await r.json();
        this._token = j.token; this._sseToken = j.sse_token;
        this._openStream();
        return;
      }
    } catch (_) {}
    // Fall back to a full re-auth (handles expiry past the SSE window).
    if (await this._authenticate()) this._openStream();
  }

  async _api(path, { method = 'GET', body } = {}) {
    const doFetch = () => fetch(`${this._config.base_url}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this._token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let res = await doFetch();
    if (res.status === 401 && await this._authenticate()) res = await doFetch();
    return res;
  }

  // ── data + render ────────────────────────────────────────────────────────
  async _load() {
    try {
      const r = await this._api('/ha-wall/data');
      if (!r.ok) {
        if (r.status === 401) { this._setState(this._authError || this._t('credentialRevoked'), 'error'); return; }
        throw new Error(this._t('failedToLoadCode', r.status));
      }
      this._data = await r.json();
      this._renderWall(this._data);
    } catch (e) {
      // Keep showing the last good wall on a transient blip; only show error if empty.
      if (!this._data) this._setState(e.message || this._t('failedToLoad'), 'error');
    }
  }

  _groupCtx(gid) {
    const groups = (this._data && this._data.groups) || [];
    const g = groups.find((x) => Number(x.id) === Number(gid));
    const caps = (g && g.caps) || {};
    const accentFallback = defaultWallColor(gid);
    return {
      id: Number(gid),
      name: g ? g.name : `Group ${gid}`,
      color: g ? (g.color || accentFallback) : accentFallback,
      hasShop: !!caps.shop,
      hasBadges: !!caps.badges,
      shopIsOpen: g ? this._isShopOpen(g) : true,
      groupType: g ? g.group_type : null,
      seasonEndDate: g ? g.season_end_date : null,
      eventDate: g ? g.event_date : null,
    };
  }

  _isShopOpen(group) {
    if (!group.shop_hours_enabled || !group.shop_opens_at || !group.shop_closes_at) return true;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = String(group.shop_opens_at).split(':').map(Number);
    const [ch, cm] = String(group.shop_closes_at).split(':').map(Number);
    const openMin = oh * 60 + om, closeMin = ch * 60 + cm;
    if (openMin === closeMin) return true;
    if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
    return nowMin >= openMin || nowMin < closeMin;
  }

  _renderWall(data) {
    const users = (data && data.users) || [];
    let totalDue = 0, totalDone = 0;
    for (const u of users) { totalDue += u.total_due_today || 0; totalDone += u.completed_today || 0; }
    const everyoneDone = totalDue > 0 && totalDone >= totalDue;

    this._setState('', null);
    this._headerEl.classList.toggle('done', everyoneDone);
    this.shadowRoot.getElementById('owc-header-icon').textContent = everyoneDone ? '🎉' : '📋';
    this.shadowRoot.getElementById('owc-title').textContent = everyoneDone
      ? this._t('everyoneDone')
      : (this._config.title || (data.wall && data.wall.name) || 'Ordoly Wall');
    this.shadowRoot.getElementById('owc-count').textContent = this._t('memberCount', users.length);

    const cols = this._columnsEl;
    cols.innerHTML = '';
    if (users.length === 0) {
      this._setState(data.inactive ? this._t('wallInactive') : this._t('noContent'), 'state');
      return;
    }
    for (const u of users) cols.appendChild(this._renderColumn(u));
  }

  _renderColumn(u) {
    const user = u.user || {};
    const accent = u.color || defaultWallColor(user.id || 0);
    const total = u.total_due_today || 0;
    const done = u.completed_today || 0;
    const balance = Number(u.points_balance) || 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const groupsBalance = u.groups_balance || {};

    const groupOrder = [];
    const ctxMap = new Map();
    for (const c of (u.tasks || [])) {
      const gId = c.group_id;
      if (gId != null && !ctxMap.has(gId)) { ctxMap.set(gId, this._groupCtx(gId)); groupOrder.push(gId); }
    }
    const shopGroups = groupOrder.map((id) => ctxMap.get(id)).filter((g) => g.hasShop);
    const badgeGroups = groupOrder.map((id) => ctxMap.get(id)).filter((g) => g.hasBadges);
    const showGroupHdrs = ctxMap.size > 1;

    const col = document.createElement('div');
    col.className = 'col';
    col.style.setProperty('--accent', accent);

    const hdr = document.createElement('div');
    hdr.className = 'col-header';
    const av = document.createElement('div');
    av.className = 'col-avatar';
    av.textContent = (user.name || '?').charAt(0).toUpperCase();
    hdr.appendChild(av);
    const nm = document.createElement('div');
    nm.className = 'col-name'; nm.textContent = user.name || '';
    hdr.appendChild(nm);

    if (shopGroups.length || badgeGroups.length) {
      const acts = document.createElement('div');
      acts.className = 'col-actions';
      if (shopGroups.length) {
        const chip = document.createElement('button');
        chip.className = 'action-chip'; chip.textContent = '🛍 ' + this._t('shop');
        chip.addEventListener('click', () => this._openShop(user.id, shopGroups, groupsBalance));
        acts.appendChild(chip);
      }
      if (badgeGroups.length) {
        const b = document.createElement('button');
        b.className = 'action-chip'; b.textContent = '🏅 ' + this._t('badges');
        b.addEventListener('click', () => this._openBadges(user.id, user.name || '?', badgeGroups));
        acts.appendChild(b);
        const r = document.createElement('button');
        r.className = 'action-chip'; r.textContent = '👑 ' + this._t('ranking');
        r.addEventListener('click', () => this._openRanking(badgeGroups));
        acts.appendChild(r);
      }
      hdr.appendChild(acts);
    }

    const barWrap = document.createElement('div');
    barWrap.className = 'col-bar';
    const barFill = document.createElement('div');
    barFill.className = 'col-bar-fill'; barFill.style.width = `${pct}%`;
    barWrap.appendChild(barFill); hdr.appendChild(barWrap);

    const meta = document.createElement('div');
    meta.className = 'col-meta';
    const prog = document.createElement('span');
    prog.className = 'col-progress'; prog.textContent = `${done} / ${total}`;
    meta.appendChild(prog);
    if (balance > 0) {
      const bal = document.createElement('span');
      bal.className = 'col-balance'; bal.textContent = `★ ${balance}`;
      meta.appendChild(bal);
    }
    hdr.appendChild(meta);
    col.appendChild(hdr);

    const list = document.createElement('div');
    list.className = 'col-list';
    const tasks = (u.tasks || []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'col-empty'; empty.textContent = this._t('allDone');
      list.appendChild(empty);
    } else {
      const byGroup = new Map();
      for (const gId of groupOrder) byGroup.set(gId, { ctx: ctxMap.get(gId), byCat: new Map() });
      for (const c of tasks) {
        const gId = c.group_id ?? (groupOrder.length === 1 ? groupOrder[0] : null);
        if (gId == null || !byGroup.has(gId)) continue;
        const catKey = c.category_name || '';
        const grp = byGroup.get(gId);
        if (!grp.byCat.has(catKey)) {
          const grpColor = grp.ctx?.color || accent;
          grp.byCat.set(catKey, {
            name: c.category_name || null,
            color: c.category_color || grpColor,
            sortOrder: c.category_sort_order ?? 9999,
            tasks: [],
          });
        }
        grp.byCat.get(catKey).tasks.push(c);
      }
      for (const [gId, grp] of byGroup) {
        if (grp.byCat.size === 0) continue;
        if (showGroupHdrs) {
          list.appendChild(this._renderGroupHeader(grp.ctx, groupsBalance[String(gId)] ?? null));
          const cd = this._renderCountdown(grp.ctx);
          if (cd) list.appendChild(cd);
        }
        const cats = Array.from(grp.byCat.values()).sort((a, b) => {
          if (!a.name && b.name) return 1;
          if (a.name && !b.name) return -1;
          return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
        });
        for (const cat of cats) {
          if (cat.name) {
            const h = document.createElement('div');
            h.className = 'cat-header'; h.style.color = cat.color;
            h.textContent = cat.name.toUpperCase();
            list.appendChild(h);
          }
          for (const c of cat.tasks) list.appendChild(this._renderTask(c, cat.color, user.id));
        }
      }
    }
    col.appendChild(list);
    return col;
  }

  _renderGroupHeader(gc, balance) {
    const el = document.createElement('div');
    el.className = 'grp-header';
    el.style.setProperty('--grp-color', gc.color || 'var(--owc-primary)');
    const dot = document.createElement('span'); dot.className = 'grp-header-dot';
    const nm = document.createElement('span'); nm.className = 'grp-header-name'; nm.textContent = gc.name || '';
    el.appendChild(dot); el.appendChild(nm);
    if (balance != null && balance > 0) {
      const bal = document.createElement('span');
      bal.className = 'grp-header-balance'; bal.textContent = `★ ${Math.round(balance)}`;
      el.appendChild(bal);
    }
    return el;
  }

  _renderCountdown(gc) {
    if (!gc) return null;
    const daysUntil = (value) => {
      if (!value) return null;
      const d = new Date(value); if (isNaN(d.getTime())) return null;
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return Math.round((end - today) / 86400000);
    };
    let icon, label, ended = false;
    if (gc.groupType === 'challenge' && gc.seasonEndDate) {
      const days = daysUntil(gc.seasonEndDate); if (days == null) return null;
      ended = days < 0; icon = ended ? '🏁' : '⏳';
      label = ended ? this._t('seasonEnded') : days === 0 ? this._t('seasonEndsToday') : this._t('seasonEndsInDays', days);
    } else if (gc.groupType === 'event' && gc.eventDate) {
      const days = daysUntil(gc.eventDate); if (days == null) return null;
      ended = days < 0; icon = ended ? '🏁' : '🎉';
      label = ended ? this._t('eventPassed') : days === 0 ? this._t('eventToday') : this._t('eventInDays', days);
    } else { return null; }
    const el = document.createElement('div');
    el.className = 'grp-countdown' + (ended ? ' ended' : '');
    el.style.setProperty('--grp-color', gc.color || 'var(--owc-primary)');
    const row = document.createElement('div'); row.className = 'grp-countdown-row';
    const ico = document.createElement('span'); ico.textContent = icon;
    const lbl = document.createElement('span'); lbl.className = 'grp-countdown-label'; lbl.textContent = label;
    row.appendChild(ico); row.appendChild(lbl); el.appendChild(row);
    return el;
  }

  _renderTask(c, stripColor, columnUserId) {
    const done = !!c.is_completed;
    const pending = c.completion && c.completion.status === 'pending_approval';
    const skipPending = !!c.skip_requested;

    const row = document.createElement('div');
    row.className = 'task' + (done ? ' done' : pending ? ' pending' : '');
    row.style.setProperty('--task-strip', stripColor || 'var(--owc-primary)');
    if (this._busyTasks.has(`${columnUserId}:${c.id}`)) row.classList.add('busy');

    const ico = document.createElement('span');
    ico.className = 'task-icon';
    ico.textContent = done ? '✔' : pending ? '⏳' : '○';

    const nm = document.createElement('span');
    nm.className = 'task-name'; nm.textContent = c.name || '';

    const sidecar = document.createElement('span');
    sidecar.className = 'task-actions';

    // Skip — only meaningful when not done/pending and not already requested.
    if (!done && !pending && !skipPending) {
      const skip = document.createElement('button');
      skip.className = 'task-action'; skip.title = this._t('requestSkip'); skip.textContent = '⏭';
      skip.addEventListener('click', (e) => { e.stopPropagation(); this._skipTask(columnUserId, c); });
      sidecar.appendChild(skip);
    }
    const info = document.createElement('button');
    info.className = 'task-action'; info.title = this._t('info'); info.textContent = 'ℹ️';
    info.addEventListener('click', (e) => { e.stopPropagation(); this._showInfo(c, done, pending, skipPending); });
    sidecar.appendChild(info);

    row.appendChild(ico); row.appendChild(nm); row.appendChild(sidecar);
    // Tap the row to toggle done/undone — pending awaits approval, so leave it.
    if (!pending) {
      row.addEventListener('click', () => this._toggleTask(columnUserId, c, done));
    }
    return row;
  }

  // ── mutations ────────────────────────────────────────────────────────────
  async _toggleTask(userId, task, wasDone) {
    const key = `${userId}:${task.id}`;
    if (this._busyTasks.has(key)) return;
    this._busyTasks.add(key);
    try {
      const res = wasDone
        ? await this._api('/ha-wall/complete', { method: 'DELETE', body: { user_id: userId, task_id: task.id } })
        : await this._api('/ha-wall/complete', { method: 'POST', body: { user_id: userId, task_id: task.id } });
      if (!res.ok && res.status !== 409) {
        const j = await res.json().catch(() => ({}));
        this._toast(j.message || this._t('actionFailed'));
      }
    } catch (_) { this._toast(this._t('actionFailed')); }
    finally { this._busyTasks.delete(key); await this._load(); }
  }

  async _skipTask(userId, task) {
    try {
      const res = await this._api('/ha-wall/skip', { method: 'POST', body: { user_id: userId, task_id: task.id } });
      if (res.ok) this._toast(this._t('skipRequested'));
      else { const j = await res.json().catch(() => ({})); this._toast(j.message || this._t('skipFailed')); }
    } catch (_) { this._toast(this._t('skipFailed')); }
    finally { await this._load(); }
  }

  // ── info modal ───────────────────────────────────────────────────────────
  _showInfo(c, done, pending, skipPending) {
    let dlg = this.shadowRoot.getElementById('owc-info-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'owc-info-dialog';
      dlg.innerHTML = `<h3></h3><div class="info-body"></div><menu><button value="close"></button></menu>`;
      this.shadowRoot.appendChild(dlg);
      dlg.querySelector('button').addEventListener('click', () => dlg.close());
    }
    dlg.querySelector('menu button').textContent = this._t('close');
    const status = done ? this._t('statusDone') : pending ? this._t('statusPending')
      : skipPending ? this._t('statusSkip') : this._t('statusOpen');
    const parts = [];
    if (c.category_name) parts.push(`<div class="info-line">📂 ${esc(c.category_name)}</div>`);
    parts.push(`<div class="info-line">● ${esc(status)}</div>`);
    if (c.base_points && c.base_points > 0) parts.push(`<div class="info-line">★ ${esc(this._t('pts', Number(c.base_points)))}</div>`);
    dlg.querySelector('h3').textContent = c.name || '';
    dlg.querySelector('.info-body').innerHTML = parts.join('');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // ── shop panel ───────────────────────────────────────────────────────────
  _panel(titleText) {
    let dlg = this.shadowRoot.getElementById('owc-side-panel');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'owc-side-panel'; dlg.className = 'owc-panel';
      dlg.innerHTML = `<div class="panel-inner"><div class="panel-header"><h2></h2><button class="panel-close">✕</button></div><div class="panel-body"></div></div>`;
      this.shadowRoot.appendChild(dlg);
      dlg.querySelector('.panel-close').addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (e) => { if (!e.target.closest('.panel-inner')) dlg.close(); });
    }
    dlg.querySelector('.panel-header h2').textContent = titleText;
    const body = dlg.querySelector('.panel-body');
    body.innerHTML = `<p class="panel-loading">${esc(this._t('loading'))}</p>`;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    return body;
  }

  _panelGroupHeader(gc, balance) {
    const el = document.createElement('div');
    el.className = 'panel-group-header';
    const dot = document.createElement('span'); dot.className = 'panel-group-dot'; dot.style.background = gc.color;
    const nm = document.createElement('span'); nm.className = 'panel-group-name'; nm.style.color = gc.color; nm.textContent = gc.name;
    el.appendChild(dot); el.appendChild(nm);
    if (balance != null && balance > 0) {
      const bal = document.createElement('span'); bal.className = 'panel-group-balance'; bal.textContent = `★ ${Math.round(balance)}`;
      el.appendChild(bal);
    }
    return el;
  }

  async _openShop(userId, shopGroups, groupsBalance) {
    const body = this._panel('🛍 ' + this._t('shop'));
    try {
      const results = await Promise.all(shopGroups.map(async (gc) => {
        const r = await this._api(`/ha-wall/shop?group_id=${gc.id}&user_id=${userId}`);
        return { gc, items: r.ok ? await r.json() : [] };
      }));
      body.innerHTML = '';
      const multi = results.length > 1;
      for (const { gc, items } of results) {
        if (multi) body.appendChild(this._panelGroupHeader(gc, groupsBalance[String(gc.id)] ?? null));
        if (!items.length) {
          const p = document.createElement('p'); p.className = 'panel-empty'; p.textContent = this._t('shopEmpty');
          body.appendChild(p);
        } else { for (const item of items) body.appendChild(this._shopRow(userId, gc, item)); }
      }
    } catch (e) {
      body.innerHTML = `<p class="panel-error">${esc(e.message || this._t('shopFailed'))}</p>`;
    }
  }

  _shopRow(userId, gc, item) {
    const alreadyBought = !!item.one_time_only && !!item.already_purchased;
    const locked = !!item.is_locked;
    const closed = !gc.shopIsOpen;
    const disabled = alreadyBought || locked || closed;
    const row = document.createElement('div');
    row.className = 'shop-item' + (disabled ? ' disabled' : '');
    row.style.setProperty('--shop-strip', gc.color);
    const ico = document.createElement('div'); ico.className = 'shop-item-icon'; ico.textContent = '🎁';
    row.appendChild(ico);
    const info = document.createElement('div'); info.className = 'shop-item-info';
    const nm = document.createElement('div'); nm.className = 'shop-item-name'; nm.textContent = item.name || '';
    info.appendChild(nm);
    if (item.description) { const d = document.createElement('div'); d.className = 'shop-item-desc'; d.textContent = item.description; info.appendChild(d); }
    row.appendChild(info);
    const trailing = document.createElement('div'); trailing.className = 'shop-item-trailing';
    const cost = document.createElement('span'); cost.className = 'shop-item-cost'; cost.textContent = '★ ' + item.cost;
    trailing.appendChild(cost);
    const btn = document.createElement('button'); btn.className = 'shop-buy-btn';
    if (alreadyBought) { btn.disabled = true; btn.textContent = this._t('bought'); }
    else if (locked) { btn.disabled = true; btn.textContent = '🔒 ' + this._t('locked'); }
    else if (closed) { btn.disabled = true; btn.textContent = this._t('closed'); }
    else { btn.textContent = this._t('buy'); btn.addEventListener('click', () => this._buy(userId, gc, item, btn)); }
    trailing.appendChild(btn);
    row.appendChild(trailing);
    return row;
  }

  async _buy(userId, gc, item, btn) {
    btn.disabled = true; btn.textContent = '…';
    try {
      const r = await this._api('/ha-wall/shop/purchase', {
        method: 'POST', body: { group_id: gc.id, user_id: userId, item_id: item.id },
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || this._t('purchaseFailed')); }
      btn.textContent = '✓ ' + this._t('buyDone');
    } catch (e) { btn.disabled = false; btn.textContent = this._t('buy'); this._toast(e.message); }
  }

  // ── badges + ranking ─────────────────────────────────────────────────────
  async _badgeMembers(gc) {
    const r = await this._api(`/ha-wall/badges?group_id=${gc.id}`);
    return r.ok ? await r.json() : [];
  }

  async _openBadges(columnUserId, columnUserName, badgeGroups) {
    const body = this._panel(`🏅 ${columnUserName}`);
    try {
      const results = await Promise.all(badgeGroups.map(async (gc) => {
        const members = await this._badgeMembers(gc);
        const member = members.find((m) => m.user_id === columnUserId);
        return { gc, badges: (member?.badges || []).filter((b) => !!b.reached_tier) };
      }));
      body.innerHTML = '';
      const multi = results.length > 1;
      for (const { gc, badges } of results) {
        if (multi) body.appendChild(this._panelGroupHeader(gc, null));
        if (!badges.length) { const p = document.createElement('p'); p.className = 'panel-empty'; p.textContent = this._t('badgesEmpty'); body.appendChild(p); }
        else { for (const badge of badges) body.appendChild(this._badgeTile(badge)); }
      }
    } catch (e) { body.innerHTML = `<p class="panel-error">${esc(e.message || this._t('badgesFailed'))}</p>`; }
  }

  _badgeTile(badge) {
    const color = tierColor(badge.reached_tier);
    const row = document.createElement('div'); row.className = 'badge-tile';
    const ico = document.createElement('div'); ico.className = 'badge-icon';
    ico.style.background = `${color}22`; ico.style.color = color; ico.textContent = '🏅';
    row.appendChild(ico);
    const info = document.createElement('div'); info.className = 'badge-info';
    const nm = document.createElement('div'); nm.className = 'badge-name'; nm.textContent = badge.name || '';
    const tier = document.createElement('div'); tier.className = 'badge-tier'; tier.style.color = color; tier.textContent = this._tierLabel(badge.reached_tier);
    info.appendChild(nm); info.appendChild(tier);
    if (badge.next_tier && badge.next_threshold != null) {
      const prog = document.createElement('div'); prog.className = 'badge-progress';
      const u = badge.unit ? ` ${badge.unit}` : '';
      prog.textContent = this._t('badgeProgress', badge.metric, u, badge.next_threshold, badge.next_tier);
      info.appendChild(prog);
    }
    row.appendChild(info);
    return row;
  }

  async _openRanking(badgeGroups) {
    const body = this._panel('👑 ' + this._t('ranking'));
    try {
      const results = await Promise.all(badgeGroups.map(async (gc) => ({ gc, members: await this._badgeMembers(gc) })));
      body.innerHTML = '';
      const multi = results.length > 1;
      for (const { gc, members } of results) {
        if (multi) body.appendChild(this._panelGroupHeader(gc, null));
        if (!members.length) { const p = document.createElement('p'); p.className = 'panel-empty'; p.textContent = this._t('rankingEmpty'); body.appendChild(p); continue; }
        const ranked = members
          .map((m) => ({ m, score: (m.badges || []).reduce((s, b) => s + tierPoints(b.reached_tier), 0) }))
          .sort((a, b) => b.score - a.score);
        ranked.forEach((e, i) => body.appendChild(this._rankRow(e.m, i + 1, e.score)));
      }
    } catch (e) { body.innerHTML = `<p class="panel-error">${esc(e.message || this._t('rankingFailed'))}</p>`; }
  }

  _rankRow(member, rank, score) {
    const tone = defaultWallColor(member.user_id || 0);
    const medal = { 1: '#E9A934', 2: '#B0B8C4', 3: '#CD8B3A' }[rank] || 'var(--owc-text-soft)';
    const row = document.createElement('div'); row.className = 'badge-tile';
    const rk = document.createElement('div'); rk.textContent = rank;
    rk.style.cssText = `width:20px;text-align:center;font-weight:800;color:${medal};flex:none`;
    row.appendChild(rk);
    const av = document.createElement('div'); av.className = 'badge-icon';
    av.style.background = tone; av.style.color = '#fff'; av.textContent = (member.name || '?').charAt(0).toUpperCase();
    row.appendChild(av);
    const info = document.createElement('div'); info.className = 'badge-info';
    const nm = document.createElement('div'); nm.className = 'badge-name'; nm.textContent = member.name || '';
    info.appendChild(nm); row.appendChild(info);
    const sc = document.createElement('div'); sc.textContent = score;
    sc.style.cssText = `margin-left:auto;font-weight:800;color:${tone}`;
    row.appendChild(sc);
    return row;
  }

  // ── live updates (SSE) ───────────────────────────────────────────────────
  _openStream() {
    if (this._stream) { try { this._stream.close(); } catch (_) {} this._stream = null; }
    if (!this._sseToken) return;
    const schedule = () => {
      if (this._reloadDebounce) return;
      this._reloadDebounce = setTimeout(() => { this._reloadDebounce = null; this._load(); }, 300);
    };
    const url = `${this._config.base_url}/ha-wall/stream?token=${encodeURIComponent(this._sseToken)}`;
    this._stream = new EventSource(url);
    for (const t of INTERESTED) this._stream.addEventListener(t, schedule);
    this._stream.onerror = () => { /* EventSource auto-reconnects; refresh timer re-mints the token */ };
  }
}

customElements.define('ordoly-wall-card', OrdolyWallCard);

// ── Visual config editor ─────────────────────────────────────────────────────
// [config key, i18n label key, input type, placeholder]
const EDITOR_FIELDS = [
  ['base_url', 'cfgServerUrl', 'text', 'http://homeassistant.local:3000'],
  ['email', 'cfgEmail', 'text', ''],
  ['key', 'cfgKey', 'password', ''],
  ['title', 'cfgTitle', 'text', ''],
];

class OrdolyWallCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    if (!this._built) this._build();
    else this._sync();
  }
  // Follow the Home Assistant UI language for the editor's own chrome (labels,
  // hint). The "Language" dropdown separately controls the card's display
  // language. Relabel in place on a language change — never rebuild, or the
  // <input> being typed in would lose focus.
  set hass(hass) {
    const lang = hass && (hass.language || (hass.locale && hass.locale.language));
    if (!lang) return;
    const code = String(lang).toLowerCase().split(/[-_]/)[0];
    if (!code || code === this._haLang) return;
    this._haLang = code;
    if (this._built) this._applyLabels();
  }
  _locale() { return resolveLocale('auto', this._haLang); }
  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config }, bubbles: true, composed: true,
    }));
  }
  // Build the form DOM ONCE. The old code rebuilt innerHTML on every keystroke
  // (setConfig → re-render), which destroyed and recreated the <input> being
  // typed in — so it lost focus after each character. Now the inputs persist.
  _build() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config || {};
    const langValue = (c.language && I18N[c.language]) ? c.language : 'auto';
    this.shadowRoot.innerHTML = `
      <style>
        .row { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
        label { font-size:13px; color: var(--secondary-text-color, #666); }
        input, select { padding:10px 12px; border-radius:8px; border:1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: var(--primary-text-color, #000); font:inherit; }
        .hint { font-size:12px; color: var(--secondary-text-color, #888); margin: -4px 0 14px; }
      </style>
      <div class="hint" id="owc-hint"></div>
      ${EDITOR_FIELDS.map(([k, , type, ph]) => `
        <div class="row">
          <label for="owc-${k}" data-k="${k}"></label>
          <input id="owc-${k}" type="${type}" placeholder="${esc(ph)}" value="${esc(c[k] || '')}">
        </div>`).join('')}
      <div class="row">
        <label for="owc-language" data-k="language"></label>
        <select id="owc-language">
          <option value="auto"${langValue === 'auto' ? ' selected' : ''}></option>
          ${LANG_ORDER.map((code) => `<option value="${code}"${langValue === code ? ' selected' : ''}>${esc(LANG_NAMES[code])}</option>`).join('')}
        </select>
      </div>`;
    this._inputs = {};
    for (const [k] of EDITOR_FIELDS) {
      const el = this.shadowRoot.getElementById(`owc-${k}`);
      this._inputs[k] = el;
      el.addEventListener('input', (e) => {
        this._config = { ...this._config, type: 'custom:ordoly-wall-card', [k]: e.target.value };
        this._emit();
      });
    }
    this._langSel = this.shadowRoot.getElementById('owc-language');
    this._langSel.addEventListener('change', (e) => {
      this._config = { ...this._config, type: 'custom:ordoly-wall-card', language: e.target.value };
      this._emit();
    });
    this._applyLabels();
    this._built = true;
  }
  // Localize the chrome (field labels, hint, "Auto" option) to the HA UI
  // language, leaving the <input>/<select> values the admin is editing intact.
  _applyLabels() {
    const loc = this._locale();
    const hint = this.shadowRoot.getElementById('owc-hint');
    if (hint) hint.textContent = tr(loc, 'cfgHint');
    for (const [k, i18nKey] of EDITOR_FIELDS) {
      const lbl = this.shadowRoot.querySelector(`label[data-k="${k}"]`);
      if (lbl) lbl.textContent = tr(loc, i18nKey);
    }
    const langLbl = this.shadowRoot.querySelector('label[data-k="language"]');
    if (langLbl) langLbl.textContent = tr(loc, 'cfgLanguage');
    if (this._langSel) {
      const autoOpt = this._langSel.querySelector('option[value="auto"]');
      if (autoOpt) autoOpt.textContent = tr(loc, 'cfgLangAuto');
    }
  }
  // Reflect an external config change without disturbing the field being edited.
  _sync() {
    for (const [k, el] of Object.entries(this._inputs || {})) {
      const v = (this._config && this._config[k]) || '';
      if (el !== this.shadowRoot.activeElement && el.value !== v) el.value = v;
    }
    if (this._langSel && this._langSel !== this.shadowRoot.activeElement) {
      const lv = (this._config && this._config.language && I18N[this._config.language]) ? this._config.language : 'auto';
      if (this._langSel.value !== lv) this._langSel.value = lv;
    }
  }
}
customElements.define('ordoly-wall-card-editor', OrdolyWallCardEditor);

// Register in the Lovelace card picker. The picker runs before `hass` is
// available, so the description best-effort follows the browser language.
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ordoly-wall-card',
  name: 'Ordoly Wall',
  description: tr(resolveLocale('auto', null), 'pickerDesc'),
  preview: false,
  documentationURL: 'https://github.com/your-org/ordoly',
});

// eslint-disable-next-line no-console
console.info('%c ORDOLY-WALL-CARD %c FEAT-030 ', 'background:#7c6fff;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px', 'background:#333;color:#fff;border-radius:0 3px 3px 0;padding:2px 4px');
