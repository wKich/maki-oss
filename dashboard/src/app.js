"use strict";

// OpenShell dashboard frontend: vanilla JS, no framework, no build step.
//
// Safety invariant: gateway data reaches the DOM only through `document.
// createTextNode` / `textContent` (the `h()` helper below). This file never
// writes markup strings into element content, and a test asserts that no HTML
// sink identifier appears in the served script.

(function () {
  const bootstrapElement = document.getElementById("dashboard-bootstrap");
  let bootstrap = {};
  try {
    bootstrap = JSON.parse(bootstrapElement ? bootstrapElement.textContent || "{}" : "{}");
  } catch (_) {
    bootstrap = {};
  }
  const state = {
    token: bootstrap.token ?? null,
    readOnly: Boolean(bootstrap.readOnly),
    refreshMs: bootstrap.refreshMs || 3000,
    defaults: bootstrap.defaults || {},
    app: document.getElementById("app"),
    banner: document.getElementById("banner"),
    status: document.getElementById("status"),
    view: "inventory",
    selected: null,
    sandboxes: [],
    detail: null,
    rules: [],
    policyTab: "full",
    logs: {
      lines: [],
      paused: false,
      source: "all",
      level: "all",
      es: null,
      ended: false,
      started: false,
    },
  };

  const LOG_LINE_LIMIT = 5000;
  const LEVEL_RANK = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };

  // -------------------------------------------------------------------------
  // DOM helpers (the only place DOM nodes are created)
  // -------------------------------------------------------------------------

  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = String(value);
        else if (key === "disabled") node.disabled = Boolean(value);
        else if (key === "value") node.value = String(value);
        else if (key === "checked") node.checked = Boolean(value);
        else if (key.indexOf("on") === 0 && typeof value === "function") {
          node.addEventListener(key.slice(2), value);
        } else if (key === "selected") node.selected = Boolean(value);
        else node.setAttribute(key, String(value));
      }
    }
    const list = Array.isArray(children) ? children : children === undefined ? [] : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function shortHash(hash) {
    return typeof hash === "string" && hash.length > 12 ? hash.slice(0, 12) : hash || "";
  }

  function formatTimestamp(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toISOString().replace("T", " ").replace("Z", "Z");
  }

  // -------------------------------------------------------------------------
  // Banner and status
  // -------------------------------------------------------------------------

  function showNotice(message) {
    state.banner.className = "notice";
    state.banner.textContent = message;
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = error && error.detail ? `\n${error.detail}` : "";
    state.banner.className = "error";
    state.banner.textContent = `${message}${detail}`;
  }

  function clearBanner() {
    state.banner.className = "";
    state.banner.textContent = "";
  }

  function renderStatus(doctor) {
    clear(state.status);
    if (!doctor) {
      state.status.append("status unavailable");
      return;
    }
    if (!doctor.cli.ok) {
      state.status.append(`CLI unavailable: ${doctor.cli.error || "openshell not found"}`);
      return;
    }
    const gateway = doctor.gateway.ok
      ? `gateway ${doctor.gateway.gateway || "connected"}`
      : `gateway unreachable`;
    const version = doctor.gateway.version || doctor.cli.version || "";
    const parts = [gateway, version, state.readOnly ? "read-only" : "read-write"];
    state.status.append(parts.filter(Boolean).join(" · "));
    if (!doctor.gateway.ok && doctor.gateway.error) {
      state.status.append(` (${doctor.gateway.error})`);
    }
  }

  // -------------------------------------------------------------------------
  // API access
  // -------------------------------------------------------------------------

  async function request(path, options) {
    const init = { method: (options && options.method) || "GET", headers: {} };
    if (options && options.body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    if (options && options.token) init.headers["x-dashboard-token"] = state.token || "";
    const response = await fetch(path, init);
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }
    if (!response.ok) {
      const raw = data && data.error ? data.error : {};
      const error = new Error(raw.message || `request failed with HTTP ${response.status}`);
      error.kind = raw.kind || "http";
      error.detail = raw.detail || "";
      throw error;
    }
    return data;
  }

  async function mutate(path, body) {
    try {
      return await request(path, { method: "POST", body: body, token: true });
    } catch (error) {
      showError(error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Inventory view
  // -------------------------------------------------------------------------

  async function loadInventory() {
    try {
      const data = await request("/api/sandboxes");
      state.sandboxes = data.sandboxes || [];
      if (state.view === "inventory") updateInventoryTable();
    } catch (error) {
      showError(error);
    }
  }

  function inventoryTable() {
    if (state.sandboxes.length === 0) {
      return h("p", { class: "muted", text: "No sandboxes found." });
    }
    const table = h("table");
    table.append(
      h("thead", null, h("tr", null, [
        h("th", { text: "Name" }),
        h("th", { text: "Phase" }),
        h("th", { text: "Image" }),
        h("th", { text: "Labels" }),
        h("th", { text: "Notes" }),
      ])),
    );
    const body = h("tbody");
    for (const sandbox of state.sandboxes) {
      const labels = Object.keys(sandbox.labels || {})
        .sort()
        .map((key) => `${key}=${sandbox.labels[key]}`)
        .join(", ");
      const image = state.defaults.image || "—";
      body.append(
        h("tr", null, [
          h("td", null, h("button", {
            class: "link",
            text: sandbox.name,
            onclick: () => openDetail(sandbox.name),
          })),
          h("td", { text: sandbox.phase }),
          h("td", null, [
            h("span", { text: image }),
            h("span", { class: "muted", text: " (configured)" }),
          ]),
          h("td", { text: labels || "—" }),
          h("td", { class: sandbox.note ? "warn" : "muted", text: sandbox.note || "—" }),
        ]),
      );
    }
    table.append(body);
    return table;
  }

  function updateInventoryTable() {
    const container = document.getElementById("inventory-table");
    if (!container) return;
    clear(container);
    container.append(inventoryTable());
  }

  function createForm() {
    const fields = {};
    function field(label, key, options) {
      const input = h("input", {
        type: "text",
        value: (options && options.value) || "",
        placeholder: (options && options.placeholder) || "",
        disabled: state.readOnly,
      });
      fields[key] = input;
      return h("label", { class: "field" }, [h("span", { text: label }), input]);
    }

    const defaults = state.defaults || {};
    const form = h("form", {
      class: "card",
      onsubmit: async (event) => {
        event.preventDefault();
        const value = (key) => (fields[key].value || "").trim();
        const providers = value("providers")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        const payload = { name: value("name") };
        if (value("image")) payload.image = value("image");
        if (value("policy")) payload.policy = value("policy");
        if (providers.length) payload.providers = providers;
        if (value("cpu")) payload.cpu = value("cpu");
        if (value("memory")) payload.memory = value("memory");
        try {
          const result = await mutate("/api/sandboxes", payload);
          showNotice(result.message || `created ${payload.name}`);
          fields.name.value = "";
          await loadInventory();
        } catch (_) {
          // Error already surfaced.
        }
      },
    });
    form.append(h("h2", { text: "Create sandbox" }));
    if (state.readOnly) {
      form.append(h("p", { class: "muted", text: "Read-only mode: creation is disabled." }));
    }
    form.append(
      h("div", { class: "form-grid" }, [
        field("Name", "name", { placeholder: "maki-myproject" }),
        field("Image", "image", { value: defaults.image || "" }),
        field("Policy", "policy", { value: defaults.policy || "" }),
        field("Providers (comma-separated)", "providers", {
          value: (defaults.providers || []).join(","),
        }),
        field("CPU", "cpu", { value: defaults.cpu || "" }),
        field("Memory", "memory", { value: defaults.memory || "" }),
      ]),
    );
    form.append(
      h("p", null, h("button", {
        type: "submit",
        text: "Create",
        disabled: state.readOnly,
      })),
    );
    form.append(
      h("p", { class: "muted", text: "Defaults come from the helper's config.toml when present." }),
    );
    return form;
  }

  function renderInventory() {
    clear(state.app);
    state.app.append(createForm());
    const container = h("div", { id: "inventory-table" });
    container.append(inventoryTable());
    state.app.append(container);
  }

  // -------------------------------------------------------------------------
  // Detail view
  // -------------------------------------------------------------------------

  function sandboxSummary(detail) {
    const sandbox = detail.sandbox;
    const rows = [
      ["Phase", sandbox.phase],
      ["Workspace", sandbox.workspace || "—"],
      ["Policy source", sandbox.policySource],
      ["Revision", sandbox.revision === null || sandbox.revision === undefined ? "—" : String(sandbox.revision)],
      ["Current policy version", String(sandbox.currentPolicyVersion)],
      ["Restart policy", sandbox.restartPolicy],
      ["Exit code", sandbox.exitCode === null || sandbox.exitCode === undefined ? "—" : String(sandbox.exitCode)],
      ["Created", sandbox.createdAt || "—"],
    ];
    const table = h("table");
    for (const [label, value] of rows) {
      table.append(h("tr", null, [
        h("th", { text: label }),
        h("td", { text: value }),
      ]));
    }
    if (sandbox.note) {
      table.append(h("tr", null, [
        h("th", { text: "Note" }),
        h("td", { class: "warn", text: sandbox.note }),
      ]));
    }
    for (const condition of sandbox.conditions || []) {
      table.append(h("tr", null, [
        h("th", { text: condition.type }),
        h("td", { text: `${condition.status} ${condition.reason || ""} ${condition.message || ""}`.trim() }),
      ]));
    }
    return table;
  }

  function actionButtons() {
    const bar = h("div", { class: "actions" });
    for (const action of ["start", "stop"]) {
      bar.append(h("button", {
        text: action === "start" ? "Start" : "Stop",
        disabled: state.readOnly,
        onclick: async () => {
          try {
            const result = await mutate(`/api/sandboxes/${encodeURIComponent(state.selected)}/${action}`, undefined);
            showNotice(result.message || `${action} accepted`);
            await refreshDetail();
            await loadInventory();
          } catch (_) {
            await loadInventory();
          }
        },
      }));
    }

    const confirmRow = h("div", { class: "actions" });
    const input = h("input", {
      type: "text",
      placeholder: `type ${state.selected} to confirm`,
      disabled: state.readOnly,
      oninput: () => {
        confirm.disabled = state.readOnly || input.value !== state.selected;
      },
    });
    const confirm = h("button", {
      class: "danger",
      text: "Delete",
      disabled: true,
      onclick: async () => {
        if (input.value !== state.selected) return;
        try {
          const result = await mutate(`/api/sandboxes/${encodeURIComponent(state.selected)}/delete`, undefined);
          showNotice(result.message || "deletion accepted");
          await loadInventory();
          navigate("inventory");
        } catch (_) {
          await loadInventory();
        }
      },
    });
    const deleteToggle = h("button", {
      class: "danger",
      text: "Delete…",
      disabled: state.readOnly,
      onclick: () => {
        clearBanner();
        confirmRow.hidden = !confirmRow.hidden;
      },
    });
    confirmRow.hidden = true;
    confirmRow.append(h("span", { class: "muted", text: "Typed confirmation:" }), input, confirm);

    bar.append(deleteToggle);
    const wrapper = h("div");
    wrapper.append(bar, confirmRow);
    if (state.readOnly) {
      wrapper.append(h("p", { class: "muted", text: "Read-only mode: actions are disabled." }));
    }
    return wrapper;
  }

  function providersTable(providers) {
    if (!providers.length) return h("p", { class: "muted", text: "No providers attached." });
    const table = h("table");
    table.append(h("thead", null, h("tr", null, [
      h("th", { text: "Provider" }),
      h("th", { text: "Type" }),
      h("th", { text: "Credential keys" }),
      h("th", { text: "Config keys" }),
    ])));
    const body = h("tbody");
    for (const provider of providers) {
      body.append(h("tr", null, [
        h("td", { text: provider.name }),
        h("td", { text: provider.type }),
        h("td", { text: (provider.credentialKeys || []).join(", ") || "—" }),
        h("td", { text: (provider.configKeys || []).join(", ") || "—" }),
      ]));
    }
    table.append(body);
    return table;
  }

  function revisionsTable(revisions) {
    if (!revisions.length) return h("p", { class: "muted", text: "No policy revisions." });
    const table = h("table");
    table.append(h("thead", null, h("tr", null, [
      h("th", { text: "Version" }),
      h("th", { text: "Status" }),
      h("th", { text: "Hash" }),
      h("th", { text: "Created" }),
      h("th", { text: "Loaded" }),
      h("th", { text: "Error" }),
    ])));
    const body = h("tbody");
    for (const revision of revisions) {
      body.append(h("tr", null, [
        h("td", { text: String(revision.version) }),
        h("td", { text: revision.status }),
        h("td", { text: shortHash(revision.hash) }),
        h("td", { text: formatTimestamp(revision.createdAtMs) }),
        h("td", { text: formatTimestamp(revision.loadedAtMs) }),
        h("td", { class: revision.loadError ? "warn" : "muted", text: revision.loadError || "—" }),
      ]));
    }
    table.append(body);
    return table;
  }

  async function refreshDetail() {
    if (!state.selected) return;
    try {
      state.detail = await request(`/api/sandboxes/${encodeURIComponent(state.selected)}`);
      if (state.view === "detail") render();
    } catch (error) {
      showError(error);
    }
  }

  function renderDetail() {
    clear(state.app);
    if (!state.detail) {
      state.app.append(h("p", { class: "muted", text: "Loading…" }));
      return;
    }
    const detail = state.detail;
    state.app.append(
      h("div", { class: "card" }, [
        h("div", { class: "row" }, [
          h("h2", { text: detail.sandbox.name }),
          h("button", { text: "← Inventory", onclick: () => navigate("inventory") }),
          subViewButtons(),
          actionButtons(),
        ]),
        sandboxSummary(detail),
      ]),
      h("div", { class: "row" }, [
        h("button", { text: "Logs", onclick: () => navigate("logs") }),
        h("button", { text: "Policy", onclick: () => navigate("policy") }),
        h("button", { text: "Rules", onclick: () => navigate("rules") }),
      ]),
      h("div", { class: "card" }, [h("h3", { text: "Providers" }), providersTable(detail.providers || [])]),
      h("div", { class: "card" }, [h("h3", { text: "Policy revisions" }), revisionsTable(detail.revisions || [])]),
    );
    if (detail.errors && Object.keys(detail.errors).length) {
      showError(new Error(`partial data: ${Object.values(detail.errors).join("; ")}`));
    }
  }

  function subViewButtons() {
    return h("span", { class: "muted", text: state.selected ? `selected: ${state.selected}` : "" });
  }

  async function openDetail(name) {
    state.selected = name;
    state.detail = null;
    state.rules = [];
    cleanupLogStream();
    clearBanner();
    navigate("detail");
    await refreshDetail();
  }

  // -------------------------------------------------------------------------
  // Logs view
  // -------------------------------------------------------------------------

  function parseLogLine(text) {
    const match = /^\[[^\]]+\]\s*\[([^\]]+)\]\s*\[([^\]]+)\]/.exec(text);
    if (!match) return { source: null, level: null };
    // The CLI emits uppercase levels/sources; filters are lowercase.
    return { source: match[1].trim().toLowerCase(), level: match[2].trim().toLowerCase() };
  }

  function logMatches(entry) {
    if (state.logs.source !== "all") {
      if (!entry.source) return true; // unparsed lines are never silently hidden
      if (entry.source !== state.logs.source) return false;
    }
    if (state.logs.level !== "all") {
      if (!entry.level) return true;
      const minimum = LEVEL_RANK[state.logs.level];
      const rank = LEVEL_RANK[entry.level];
      // Unknown levels (for example OCSF) are shown rather than silently hidden.
      if (rank !== undefined && minimum !== undefined && rank < minimum) return false;
    }
    return true;
  }

  function logContainer() {
    return document.getElementById("log-view");
  }

  function appendLogLine(entry) {
    const container = logContainer();
    if (!container || !logMatches(entry)) return;
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 8;
    container.append(h("div", { class: `log-line log-${entry.level || "raw"}`, text: entry.text }));
    if (atBottom) container.scrollTop = container.scrollHeight;
  }

  function rebuildLogView() {
    const container = logContainer();
    if (!container) return;
    clear(container);
    for (const entry of state.logs.lines) {
      if (logMatches(entry)) container.append(h("div", { class: `log-line log-${entry.level || "raw"}`, text: entry.text }));
    }
    container.scrollTop = container.scrollHeight;
  }

  function cleanupLogStream() {
    if (state.logs.es) {
      state.logs.es.close();
      state.logs.es = null;
    }
  }

  function startLogStream() {
    cleanupLogStream();
    state.logs.lines = [];
    state.logs.ended = false;
    state.logs.started = true;
    const source = new EventSource(`/events/logs?name=${encodeURIComponent(state.selected)}`);
    state.logs.es = source;

    source.addEventListener("ready", () => {
      // The server replays its ring buffer on every (re)connect; restart the
      // local view so reconnect does not duplicate lines.
      state.logs.lines = [];
      rebuildLogView();
    });
    source.onmessage = (event) => {
      const entry = { text: event.data, ...parseLogLine(event.data) };
      state.logs.lines.push(entry);
      if (state.logs.lines.length > LOG_LINE_LIMIT) {
        state.logs.lines.shift();
        rebuildLogView();
        return;
      }
      if (!state.logs.paused) appendLogLine(entry);
    };
    source.addEventListener("end", (event) => {
      state.logs.ended = true;
      cleanupLogStream();
      showNotice(`log stream ended (exit ${event.data || "?"}); press Reconnect to tail again`);
    });
    source.addEventListener("failure", (event) => {
      state.logs.ended = true;
      cleanupLogStream();
      showError(new Error(event.data || "log stream failed"));
    });
    source.onerror = () => {
      // Named `end`/`failure` events close the stream deliberately; anything
      // else is a transport hiccup and EventSource retries by itself.
      if (state.logs.ended) cleanupLogStream();
    };
  }

  function logsControls() {
    const sourceSelect = h("select", {
      onchange: () => {
        state.logs.source = sourceSelect.value;
        rebuildLogView();
      },
    });
    for (const option of ["all", "gateway", "sandbox"]) {
      sourceSelect.append(h("option", { value: option, text: `source: ${option}`, selected: state.logs.source === option }));
    }

    const levelSelect = h("select", {
      onchange: () => {
        state.logs.level = levelSelect.value;
        rebuildLogView();
      },
    });
    for (const option of ["all", "error", "warn", "info", "debug", "trace"]) {
      levelSelect.append(h("option", { value: option, text: `min level: ${option}`, selected: state.logs.level === option }));
    }

    const pauseButton = h("button", {
      text: state.logs.paused ? "Resume" : "Pause",
      onclick: () => {
        state.logs.paused = !state.logs.paused;
        pauseButton.textContent = state.logs.paused ? "Resume" : "Pause";
        if (!state.logs.paused) rebuildLogView();
      },
    });

    return h("div", { class: "actions" }, [
      sourceSelect,
      levelSelect,
      pauseButton,
      h("button", {
        text: "Reconnect",
        onclick: () => {
          clearBanner();
          startLogStream();
        },
      }),
      h("button", {
        text: "Clear",
        onclick: () => {
          state.logs.lines = [];
          rebuildLogView();
        },
      }),
    ]);
  }

  function renderLogs() {
    clear(state.app);
    state.app.append(
      h("div", { class: "card" }, [
        h("div", { class: "row" }, [
          h("h2", { text: `Logs: ${state.selected}` }),
          h("button", { text: "← Inventory", onclick: () => navigate("inventory") }),
          h("button", { text: "Detail", onclick: () => navigate("detail") }),
        ]),
        logsControls(),
        h("div", { id: "log-view" }),
      ]),
    );
    rebuildLogView();
  }

  // -------------------------------------------------------------------------
  // Policy view
  // -------------------------------------------------------------------------

  async function loadPolicy() {
    try {
      const data = await request(`/api/sandboxes/${encodeURIComponent(state.selected)}/policy?view=${state.policyTab}`);
      state.policy = data.policy;
      if (state.view === "policy") render();
    } catch (error) {
      showError(error);
    }
  }

  function renderPolicy() {
    clear(state.app);
    const tabButton = (label, value) =>
      h("button", {
        class: state.policyTab === value ? "active" : "",
        text: label,
        onclick: () => {
          state.policyTab = value;
          loadPolicy();
        },
      });
    const card = h("div", { class: "card" }, [
      h("div", { class: "row" }, [
        h("h2", { text: `Policy: ${state.selected}` }),
        h("button", { text: "← Inventory", onclick: () => navigate("inventory") }),
        h("button", { text: "Detail", onclick: () => navigate("detail") }),
      ]),
      h("div", { class: "actions" }, [tabButton("Effective", "full"), tabButton("Base", "base")]),
      h("p", { class: "muted", text: "Read-only. Edit policy files and apply them with the CLI." }),
    ]);
    if (!state.policy) {
      card.append(h("p", { class: "muted", text: "Loading…" }));
    } else {
      const policy = state.policy;
      card.append(
        h("p", { class: "muted", text: `version ${policy.version} · active ${policy.activeVersion} · ${policy.policySource} · ${shortHash(policy.hash)}` }),
        h("pre", { text: JSON.stringify(policy.policy, null, 2) }),
      );
    }
    state.app.append(card);
  }

  // -------------------------------------------------------------------------
  // Rules view
  // -------------------------------------------------------------------------

  async function loadRules() {
    try {
      const data = await request(`/api/sandboxes/${encodeURIComponent(state.selected)}/rules?status=pending`);
      state.rules = data.rules || [];
      if (state.view === "rules") render();
    } catch (error) {
      showError(error);
    }
  }

  function rulesTable() {
    if (!state.rules.length) return h("p", { class: "muted", text: "No pending proposals." });
    const table = h("table");
    table.append(h("thead", null, h("tr", null, [
      h("th", { text: "Chunk" }),
      h("th", { text: "Rule" }),
      h("th", { text: "Rationale" }),
      h("th", { text: "Findings" }),
      h("th", { text: "Endpoints" }),
      h("th", { text: "Actions" }),
    ])));
    const body = h("tbody");
    for (const proposal of state.rules) {
      const reasonInput = h("input", { type: "text", placeholder: "reason (required)", disabled: state.readOnly });
      const rejectButton = h("button", {
        class: "danger",
        text: "Reject",
        disabled: true,
        onclick: async () => {
          if (!reasonInput.value.trim()) return;
          try {
            const result = await mutate(
              `/api/sandboxes/${encodeURIComponent(state.selected)}/rules/${encodeURIComponent(proposal.chunkId)}/reject`,
              { reason: reasonInput.value.trim() },
            );
            showNotice(result.message || "proposal rejected");
            await loadRules();
          } catch (_) {
            await loadRules();
          }
        },
      });
      reasonInput.addEventListener("input", () => {
        rejectButton.disabled = state.readOnly || !reasonInput.value.trim();
      });

      const findings = [proposal.securityNotes, proposal.prover, proposal.applicationError]
        .filter(Boolean)
        .join("; ");

      body.append(h("tr", null, [
        h("td", null, [h("code", { text: proposal.chunkId })]),
        h("td", null, [
          h("div", { text: proposal.ruleName }),
          proposal.confidence !== null && proposal.confidence !== undefined
            ? h("div", { class: "muted", text: `${Math.round(proposal.confidence * 100)}% confidence` })
            : null,
          proposal.binary ? h("div", { class: "muted", text: proposal.binary }) : null,
        ]),
        h("td", { text: proposal.rationale || "—" }),
        h("td", { class: findings ? "warn" : "muted", text: findings || "—" }),
        h("td", { text: proposal.endpoints || "—" }),
        h("td", null, [
          h("button", {
            text: "Approve",
            disabled: state.readOnly,
            onclick: async () => {
              try {
                const result = await mutate(
                  `/api/sandboxes/${encodeURIComponent(state.selected)}/rules/${encodeURIComponent(proposal.chunkId)}/approve`,
                  undefined,
                );
                showNotice(result.message || "proposal approved");
                await loadRules();
              } catch (_) {
                await loadRules();
              }
            },
          }),
          reasonInput,
          rejectButton,
        ]),
      ]));
    }
    table.append(body);
    return table;
  }

  function renderRules() {
    clear(state.app);
    state.app.append(
      h("div", { class: "card" }, [
        h("div", { class: "row" }, [
          h("h2", { text: `Rule proposals: ${state.selected}` }),
          h("button", { text: "← Inventory", onclick: () => navigate("inventory") }),
          h("button", { text: "Detail", onclick: () => navigate("detail") }),
        ]),
        state.readOnly
          ? h("p", { class: "muted", text: "Read-only mode: approval and rejection are disabled." })
          : h("p", { class: "muted", text: "Rejections require a reason; the gateway sends it to the agent." }),
        rulesTable(),
      ]),
    );
  }

  // -------------------------------------------------------------------------
  // Navigation and polling
  // -------------------------------------------------------------------------

  function render() {
    if (state.view === "inventory") renderInventory();
    else if (state.view === "detail") renderDetail();
    else if (state.view === "logs") renderLogs();
    else if (state.view === "policy") renderPolicy();
    else if (state.view === "rules") renderRules();
  }

  function navigate(view) {
    if (state.view === "logs" && view !== "logs") cleanupLogStream();
    state.view = view;
    clearBanner();
    render();
    if (view === "logs") startLogStream();
    if (view === "policy") {
      state.policy = null;
      loadPolicy();
    }
    if (view === "rules") loadRules();
  }
  async function refreshDoctor() {
    try {
      const doctor = await request("/api/doctor");
      renderStatus(doctor);
    } catch (error) {
      clear(state.status);
      state.status.append("dashboard unavailable");
      showError(error);
    }
  }

  function startPolling() {
    window.setInterval(() => {
      loadInventory();
    }, state.refreshMs);
    window.setInterval(() => {
      refreshDoctor();
    }, 30000);
  }

  window.addEventListener("beforeunload", () => {
    cleanupLogStream();
  });

  clearBanner();
  renderInventory();
  loadInventory();
  refreshDoctor();
  startPolling();
})();
