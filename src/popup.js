import { getSettings, saveSettings } from "./storage.js";

const $ = (id) => document.getElementById(id);
const hostOf = (address) => address.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");

const EMPTY = {
  address: "Enter the address you open Jellyseerr at.",
  key: "Paste the API key from Jellyseerr.",
};

// One entry per reason the background's testConnection can return.
const FAILURES = {
  noAnswer: {
    chip: "Offline",
    title: "No answer from server",
    sub: (host) => `Nothing came back from ${host}.`,
    field: "address",
    fieldError: "No answer from this address. Check it and that Jellyseerr is running.",
    fix: { ordered: false, steps: ["Check that Jellyseerr is running on that machine.", "Check the address, including the port."] },
  },
  notJellyseerr: {
    chip: "Not Jellyseerr",
    title: "That isn’t Jellyseerr",
    sub: (host) => `${host} answered, but not as Jellyseerr.`,
    field: "address",
    fieldError: "This address answered, but it isn’t Jellyseerr. Check the port.",
    fix: { ordered: false, steps: ["Check the address, including the port.", "Use the address you open Jellyseerr at in your browser."] },
  },
  rejected: {
    chip: "Key rejected",
    title: "API key rejected",
    sub: (host, onOpen) => (onOpen ? "Your server answered but no longer accepts the saved key." : "The server answered but did not accept this key."),
    field: "key",
    fieldError: "The server refused this key. Copy it again from Settings, General, API Key.",
    fix: { ordered: true, steps: ["In Jellyseerr, open Settings, then General.", "Copy the API Key.", "Choose Edit and paste it."] },
  },
};

// phase: setup | editing | checking | connected | failed
// failure: a FAILURES key, from the last check of the saved (failed) or drafted (setup, editing) details.
// missing: the field left empty on submit.
let state = { phase: "setup", saved: null, version: "", draft: { address: "", key: "" }, busy: false, failure: null, missing: null, back: null };

const inForm = (s) => s.phase === "setup" || s.phase === "editing";

function view(s) {
  const host = hostOf(inForm(s) ? s.draft.address : s.saved.address);
  if (s.busy || s.phase === "checking") return { tone: "busy", chip: "Checking", title: "Checking connection", sub: `Reaching ${host}` };
  if (s.failure) {
    const f = FAILURES[s.failure];
    return { tone: "bad", chip: f.chip, title: f.title, sub: f.sub(host, !inForm(s)) };
  }
  if (s.phase === "connected") return { tone: "ok", chip: "Connected", title: "You’re connected", sub: "Request buttons are live on Letterboxd." };
  if (s.phase === "editing") return { tone: "idle", chip: "Editing", title: "Edit connection", sub: "Saving checks the new details before they replace the current ones." };
  return { tone: "idle", chip: "Not connected", title: "Connect to Jellyseerr", sub: "Letterboxd film pages get a request button." };
}

const SPIN = '<svg class="spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="5.5" opacity=".3"/><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"/></svg>';

function actions(s) {
  const submit = (label) => ({ kind: "cta", label: s.busy ? `${SPIN}Checking` : `${label} <kbd>↵</kbd>`, submit: true, disabled: s.busy });
  if (s.phase === "setup") return [null, submit("Connect")];
  if (s.phase === "editing") return [{ kind: "ghost", label: "Cancel", act: "cancel", disabled: s.busy }, submit("Save")];
  if (s.phase === "failed") return [{ kind: "ghost", label: "Edit connection <kbd>E</kbd>", act: "edit" }, { kind: "cta", label: "Try again <kbd>↵</kbd>", act: "retry" }];
  return [null, { kind: "soft", label: "Edit connection <kbd>E</kbd>", act: "edit", disabled: s.phase === "checking" }];
}

function fieldError(s, field) {
  if (s.missing === field) return EMPTY[field];
  if (inForm(s) && s.failure && FAILURES[s.failure].field === field) return FAILURES[s.failure].fieldError;
  return "";
}

function render() {
  const s = state;
  const v = view(s);
  $("popup").dataset.tone = v.tone;
  $("chip").textContent = v.chip;
  $("title").textContent = v.title;
  $("sub").textContent = v.sub;

  $("form").hidden = !inForm(s);
  $("saved").hidden = !(s.phase === "checking" || s.phase === "connected");
  $("trouble").hidden = s.phase !== "failed";
  $("help-key").hidden = !inForm(s) || Boolean(fieldError(s, "key"));

  if (inForm(s)) {
    for (const field of ["address", "key"]) {
      const input = $(field);
      if (input.value !== s.draft[field]) input.value = s.draft[field];
      input.disabled = s.busy;
      const message = fieldError(s, field);
      $(`field-${field}`).classList.toggle("invalid", Boolean(message));
      input.setAttribute("aria-invalid", String(Boolean(message)));
      $(`error-${field}`).hidden = !message;
      $(`error-${field}`).innerHTML = message ? '<svg><use href="#i-alert"/></svg><span></span>' : "";
      if (message) $(`error-${field}`).querySelector("span").textContent = message;
    }
  }
  if (s.saved) {
    $("saved-host").textContent = hostOf(s.saved.address);
    $("saved-version").textContent = `v${s.version}`;
    $("saved-version").hidden = s.phase !== "connected";
  }
  if (s.phase === "failed") {
    const fix = FAILURES[s.failure].fix;
    $("fix").classList.toggle("plain", !fix.ordered);
    $("fix").replaceChildren(...fix.steps.map((step) => Object.assign(document.createElement("li"), { textContent: step })));
  }

  const [secondary, primary] = actions(s);
  const button = (b) =>
    `<button class="btn ${b.kind}" ${b.submit ? 'type="submit" form="form"' : `type="button" data-act="${b.act}"`} ${b.disabled ? "disabled" : ""}>${b.label}</button>`;
  $("bar").innerHTML = (secondary ? button(secondary) : "") + '<span class="grow"></span>' + (primary ? button(primary) : "");
}

// Morph between states with a view transition.
function set(patch) {
  const prev = state;
  state = { ...state, ...patch };
  const morph = state.phase !== prev.phase || state.busy !== prev.busy || state.failure !== prev.failure;
  if (morph && !matchMedia("(prefers-reduced-motion: reduce)").matches) document.startViewTransition(render);
  else render();
}

const check = ({ address, key }) =>
  chrome.runtime.sendMessage({ type: "testConnection", settings: { jellyseerr: { lanBaseUrl: address, apiKey: key } } });

async function verifySaved() {
  set({ phase: "checking", failure: null });
  const result = await check(state.saved);
  set(result.ok ? { phase: "connected", version: result.version } : { phase: "failed", failure: result.reason });
}

async function submit(event) {
  event.preventDefault();
  const draft = { address: $("address").value.trim(), key: $("key").value.trim() };
  const missing = !draft.address ? "address" : !draft.key ? "key" : null;
  if (missing) {
    set({ draft, missing, failure: null });
    return $(missing).focus();
  }
  set({ draft, missing: null, failure: null, busy: true });
  const result = await check(draft);
  if (!result.ok) return set({ busy: false, failure: result.reason });
  await saveSettings({ jellyseerr: { lanBaseUrl: draft.address, apiKey: draft.key } });
  set({ phase: "connected", saved: draft, version: result.version, busy: false });
}

const ACTS = {
  edit: () => set({ back: { phase: state.phase, failure: state.failure }, phase: "editing", draft: { ...state.saved }, failure: null, missing: null }),
  cancel: () => set({ ...state.back, missing: null }),
  retry: verifySaved,
};

$("form").addEventListener("submit", submit);
$("bar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (b) ACTS[b.dataset.act]();
});
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.toLowerCase() === "e" && (state.phase === "connected" || state.phase === "failed")) {
    e.preventDefault();
    ACTS.edit();
  }
  if (e.key === "Enter" && state.phase === "failed") {
    e.preventDefault();
    ACTS.retry();
  }
});
$("reveal").addEventListener("click", () => {
  const shown = $("key").type === "text";
  $("key").type = shown ? "password" : "text";
  $("key").classList.toggle("secret", shown);
  $("reveal").setAttribute("aria-pressed", String(!shown));
  $("reveal").setAttribute("aria-label", shown ? "Show API key" : "Hide API key");
  $("reveal").querySelector(".i-eye").toggleAttribute("hidden", !shown);
  $("reveal").querySelector(".i-eye-off").toggleAttribute("hidden", shown);
});
for (const field of ["address", "key"]) {
  $(field).addEventListener("input", () => {
    state.draft = { ...state.draft, [field]: $(field).value };
    const owned = state.missing === field || (state.failure && FAILURES[state.failure].field === field);
    if (owned) set({ missing: null, failure: null });
  });
}

const { jellyseerr } = await getSettings();
if (jellyseerr.lanBaseUrl && jellyseerr.apiKey) {
  state.saved = { address: jellyseerr.lanBaseUrl, key: jellyseerr.apiKey };
  verifySaved();
} else {
  render();
}
