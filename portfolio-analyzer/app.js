const sampleHoldings = [
  {
    ticker: "VTI",
    shares: 56,
    price: 261.44,
    costBasis: 228.1,
    targetWeight: 32,
    expectedReturn: 8,
    volatility: 17,
    dividendYield: 1.4,
    momentum: 7.2,
  },
  {
    ticker: "AAPL",
    shares: 32,
    price: 188.91,
    costBasis: 154.32,
    targetWeight: 12,
    expectedReturn: 7,
    volatility: 27,
    dividendYield: 0.5,
    momentum: -2.4,
  },
  {
    ticker: "MSFT",
    shares: 18,
    price: 421.9,
    costBasis: 301.44,
    targetWeight: 13,
    expectedReturn: 10,
    volatility: 25,
    dividendYield: 0.8,
    momentum: 9.6,
  },
  {
    ticker: "SCHD",
    shares: 118,
    price: 78.62,
    costBasis: 72.2,
    targetWeight: 18,
    expectedReturn: 7,
    volatility: 15,
    dividendYield: 3.6,
    momentum: 3.1,
  },
  {
    ticker: "TSLA",
    shares: 22,
    price: 172.63,
    costBasis: 241.12,
    targetWeight: 5,
    expectedReturn: 9,
    volatility: 52,
    dividendYield: 0,
    momentum: -14.5,
  },
];

let holdings = [];

const fields = [
  "ticker",
  "shares",
  "price",
  "targetWeight",
  "expectedReturn",
  "volatility",
  "dividendYield",
  "momentum",
];

const els = {
  body: document.querySelector("#holdingsBody"),
  checkSetup: document.querySelector("#checkSetup"),
  closeCredentials: document.querySelector("#closeCredentials"),
  connectFidelity: document.querySelector("#connectFidelity"),
  credentialDialog: document.querySelector("#credentialDialog"),
  credentialForm: document.querySelector("#credentialForm"),
  connectionMessage: document.querySelector("#connectionMessage"),
  connectionStatus: document.querySelector("#connectionStatus"),
  cancelCredentials: document.querySelector("#cancelCredentials"),
  openCredentials: document.querySelector("#openCredentials"),
  setupPanel: document.querySelector("#setupPanel"),
  portfolioScore: document.querySelector("#portfolioScore"),
  portfolioTone: document.querySelector("#portfolioTone"),
  scoreMeter: document.querySelector("#scoreMeter"),
  totalValue: document.querySelector("#totalValue"),
  signalMix: document.querySelector("#signalMix"),
  riskNote: document.querySelector("#riskNote"),
  insights: document.querySelector("#insights"),
  csvInput: document.querySelector("#csvInput"),
};

const settings = {
  maxPosition: document.querySelector("#maxPosition"),
  targetReturn: document.querySelector("#targetReturn"),
  maxVolatility: document.querySelector("#maxVolatility"),
  dividendWeight: document.querySelector("#dividendWeight"),
};

document.querySelector("#loadSample").addEventListener("click", () => {
  holdings = structuredClone(sampleHoldings);
  render();
});

els.connectFidelity.addEventListener("click", connectFidelity);
els.checkSetup.addEventListener("click", checkBrokerageSetup);
els.openCredentials.addEventListener("click", openCredentialDialog);
els.closeCredentials.addEventListener("click", () => els.credentialDialog.close());
els.cancelCredentials.addEventListener("click", () => els.credentialDialog.close());
els.credentialForm.addEventListener("submit", saveCredentials);

document.querySelector("#addRow").addEventListener("click", () => {
  holdings.push({
    ticker: "",
    shares: 0,
    price: 0,
    targetWeight: 0,
    expectedReturn: 0,
    volatility: 0,
    dividendYield: 0,
    momentum: 0,
  });
  render();
});

document.querySelector("#resetSettings").addEventListener("click", () => {
  settings.maxPosition.value = 15;
  settings.targetReturn.value = 8;
  settings.maxVolatility.value = 28;
  settings.dividendWeight.value = 0.7;
  render();
});

document.querySelector("#exportJson").addEventListener("click", () => {
  const analyzed = analyzePortfolio();
  const blob = new Blob([JSON.stringify(analyzed, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "portfolio-analysis.json";
  link.click();
  URL.revokeObjectURL(url);
});

Object.values(settings).forEach((input) => input.addEventListener("input", render));

els.csvInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  holdings = parseCsv(text);
  render();
  event.target.value = "";
});

handleConnectionCallback();
checkBrokerageSetup({ quiet: true });

function render() {
  const analysis = analyzePortfolio();
  renderTable(analysis.positions);
  renderSummary(analysis);
  renderInsights(analysis);
}

async function connectFidelity() {
  if (window.location.protocol === "file:") {
    setConnectionState("Open local server", "error");
    showConnectionMessage(
      "Open through localhost:",
      "This page is currently opened as a file, so browser API calls cannot reach the brokerage backend. Run node server.js and open http://localhost:8787."
    );
    return;
  }

  setConnectionState("Connecting...", "pending");

  try {
    const setup = await getBrokerageStatus();
    if (!setup.configured) {
      setConnectionState("Setup needed", "error");
      els.setupPanel.hidden = false;
      showConnectionMessage("Credentials needed:", "Enter your SnapTrade API credentials locally before opening the Fidelity consent portal.");
      openCredentialDialog();
      return;
    }

    const response = await fetch(`${getApiBase()}/api/brokerage/snaptrade/login?broker=fidelity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionType: "read",
        customRedirect: window.location.href.split("?")[0],
        immediateRedirect: true,
      }),
    });

    if (!response.ok) {
      const details = await safeJson(response);
      throw new Error(details.message || details.error || `Connection endpoint returned ${response.status}`);
    }

    const data = await response.json();
    const loginUrl = data.loginUrl || data.redirectURI || data.redirectUrl;
    if (!loginUrl) {
      throw new Error("Connection endpoint did not return a login URL");
    }

    window.location.assign(loginUrl);
  } catch (error) {
    setConnectionState("Setup needed", "error");
    els.setupPanel.hidden = false;
    showConnectionMessage(
      "Setup required:",
      error.message
    );
  }
}

async function checkBrokerageSetup(options = {}) {
  if (window.location.protocol === "file:") {
    els.setupPanel.hidden = false;
    return;
  }

  try {
    const status = await getBrokerageStatus();
    if (status.configured) {
      setConnectionState("Ready to connect", "connected");
      els.setupPanel.hidden = true;
      if (!options.quiet) {
        showConnectionMessage("Ready:", "SnapTrade credentials are configured. Click Connect Fidelity to continue.");
      }
      return;
    }

    setConnectionState("Setup needed", "error");
    els.setupPanel.hidden = false;
    showConnectionMessage(
      "Credentials needed:",
      status.message || "Add SnapTrade credentials locally, then restart the server."
    );
  } catch (error) {
    setConnectionState("Server offline", "error");
    els.setupPanel.hidden = false;
    showConnectionMessage("Server offline:", "Start the local server with node server.js, then refresh this page.");
  }
}

async function getBrokerageStatus() {
  const response = await fetch(`${getApiBase()}/api/brokerage/status`);
  if (!response.ok) throw new Error("Unable to check brokerage setup.");
  return response.json();
}

function openCredentialDialog() {
  if (typeof els.credentialDialog.showModal === "function") {
    els.credentialDialog.showModal();
  } else {
    els.credentialDialog.setAttribute("open", "");
  }
}

async function saveCredentials(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.credentialForm).entries());
  setConnectionState("Saving...", "pending");

  try {
    const response = await fetch(`${getApiBase()}/api/brokerage/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await safeJson(response);
    if (!response.ok) {
      throw new Error(result.message || "Unable to save credentials.");
    }

    els.credentialDialog.close();
    els.credentialForm.reset();
    setConnectionState("Ready to connect", "connected");
    els.setupPanel.hidden = true;
    showConnectionMessage("Saved locally:", "SnapTrade credentials were written to .env. Click Connect Fidelity to open the consent portal.");
  } catch (error) {
    setConnectionState("Setup needed", "error");
    showConnectionMessage("Could not save:", error.message);
  }
}

async function handleConnectionCallback() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const connectionId = params.get("connection_id") || params.get("authorizationId");

  if (!status) return;

  if (status === "SUCCESS" && connectionId) {
    setConnectionState("Connected", "connected");
    showConnectionMessage("Connected:", "Fidelity consent completed. Fetching holdings from the backend now.");
    await loadConnectedHoldings(connectionId);
    window.history.replaceState({}, document.title, window.location.href.split("?")[0]);
    return;
  }

  setConnectionState("Connection failed", "error");
  showConnectionMessage(
    "Connection issue:",
    params.get("error_code") || params.get("status_code") || "The Fidelity connection was not completed."
  );
}

async function loadConnectedHoldings(connectionId) {
  try {
    const response = await fetch(`${getApiBase()}/api/brokerage/holdings?connectionId=${encodeURIComponent(connectionId)}`);
    if (!response.ok) {
      const details = await safeJson(response);
      throw new Error(details.message || details.error || `Holdings endpoint returned ${response.status}`);
    }

    const data = await response.json();
    holdings = normalizeProviderHoldings(data);
    render();
    showConnectionMessage("Synced:", `Imported ${holdings.length} holdings from Fidelity.`);
  } catch (error) {
    showConnectionMessage(
      "Connected, but holdings need backend support:",
      `Create /api/brokerage/holdings to normalize provider positions. Details: ${error.message}`
    );
  }
}

function getApiBase() {
  return window.location.origin;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeProviderHoldings(data) {
  const positions = Array.isArray(data) ? data : data.positions || data.holdings || [];
  return positions.map((item) => {
    const symbol = item.ticker || item.symbol || item.universal_symbol?.symbol || item.instrument?.symbol || "";
    const shares = item.shares || item.quantity || item.units || item.position?.quantity;
    const price = item.price || item.lastPrice || item.marketPrice || item.average_purchase_price || item.symbol?.last_price;
    return {
      ticker: String(symbol).toUpperCase(),
      shares: numberFrom(shares),
      price: numberFrom(price),
      costBasis: numberFrom(item.costBasis || item.averagePurchasePrice || item.average_purchase_price),
      targetWeight: 0,
      expectedReturn: 0,
      volatility: 0,
      dividendYield: 0,
      momentum: 0,
    };
  });
}

function setConnectionState(label, state) {
  els.connectionStatus.textContent = label;
  els.connectionStatus.classList.toggle("connected", state === "connected");
  els.connectionStatus.classList.toggle("error", state === "error");
}

function showConnectionMessage(prefix, message) {
  els.connectionMessage.innerHTML = `<strong>${escapeHtml(prefix)}</strong> ${escapeHtml(message)}`;
}

function renderTable(positions) {
  els.body.innerHTML = "";

  positions.forEach((position) => {
    const index = position.sourceIndex;
    const row = document.createElement("tr");

    fields.forEach((field) => {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.value = holdings[index][field] ?? "";
      input.className = field === "ticker" ? "ticker-input" : "";
      input.type = field === "ticker" ? "text" : "number";
      if (field !== "ticker") input.step = "0.01";
      input.addEventListener("input", () => {
        holdings[index][field] = field === "ticker" ? input.value.toUpperCase() : Number(input.value);
        render();
      });
      cell.append(input);
      row.append(cell);
    });

    const signalCell = document.createElement("td");
    const signal = document.createElement("span");
    signal.className = `signal ${position.signal.toLowerCase()}`;
    signal.textContent = position.signal;
    signal.title = position.reasons.join("; ");
    signalCell.append(signal);
    row.append(signalCell);

    const deleteCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "x";
    deleteButton.setAttribute("aria-label", `Remove ${position.ticker || "holding"}`);
    deleteButton.addEventListener("click", () => {
      holdings.splice(index, 1);
      render();
    });
    deleteCell.append(deleteButton);
    row.append(deleteCell);

    els.body.append(row);
  });
}

function renderSummary(analysis) {
  const { totalValue, score, counts, concentrationWarnings } = analysis;
  els.totalValue.textContent = formatCurrency(totalValue);
  els.portfolioScore.textContent = holdings.length ? Math.round(score) : "--";
  els.portfolioTone.textContent = getTone(score, holdings.length);
  els.scoreMeter.style.width = `${Math.max(0, Math.min(100, score))}%`;
  els.signalMix.textContent = `${counts.BUY} buy / ${counts.HOLD} hold / ${counts.SELL} sell`;
  els.riskNote.textContent = concentrationWarnings.length
    ? `${concentrationWarnings.length} position risk flag${concentrationWarnings.length > 1 ? "s" : ""}`
    : "No concentration risk detected";
}

function renderInsights(analysis) {
  els.insights.innerHTML = "";

  if (!analysis.positions.length) {
    addInsight("Start with Fidelity", "Use Connect Fidelity to launch the secure consent flow once the backend endpoint is configured.");
    addInsight("Live sync path", "The frontend expects a short-lived SnapTrade portal URL, then imports holdings after the callback.");
    addInsight("Signal philosophy", "Treat outputs as decision support, then verify before trading.");
    return;
  }

  const topRisk = analysis.positions.find((item) => item.reasons.some((reason) => reason.includes("concentration")));
  const bestBuy = analysis.positions.find((item) => item.signal === "BUY");
  const sellList = analysis.positions.filter((item) => item.signal === "SELL").map((item) => item.ticker).join(", ");

  addInsight(
    "Allocation",
    topRisk
      ? `${topRisk.ticker} is ${topRisk.weight.toFixed(1)}% of the portfolio and exceeds your limit.`
      : "Current position sizing is inside your configured concentration limit."
  );
  addInsight(
    "Best opportunity",
    bestBuy
      ? `${bestBuy.ticker} screens as BUY: ${bestBuy.reasons.join("; ")}.`
      : "No holding currently clears the BUY threshold under these settings."
  );
  addInsight(
    "Watch list",
    sellList ? `${sellList} triggered SELL signals. Review tax impact, thesis, and alternatives before acting.` : "No SELL signals are active."
  );
}

function addInsight(title, copy) {
  const card = document.createElement("article");
  card.className = "insight";
  card.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p>`;
  els.insights.append(card);
}

function analyzePortfolio() {
  const totalValue = holdings.reduce((sum, item) => sum + valueOf(item), 0);
  const config = getConfig();
  const counts = { BUY: 0, HOLD: 0, SELL: 0 };
  const concentrationWarnings = [];

  const positions = holdings.map((item, sourceIndex) => {
    const value = valueOf(item);
    const weight = totalValue ? (value / totalValue) * 100 : 0;
    const result = scorePosition(item, weight, config);
    counts[result.signal] += 1;
    if (weight > config.maxPosition) concentrationWarnings.push(item.ticker);
    return { ...item, sourceIndex, value, weight, ...result };
  });

  const weightedScore = totalValue
    ? positions.reduce((sum, item) => sum + item.score * (item.value / totalValue), 0)
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    totalValue,
    score: weightedScore,
    counts,
    concentrationWarnings,
    positions: positions.sort((a, b) => b.value - a.value),
  };
}

function scorePosition(item, weight, config) {
  const reasons = [];
  let score = 50;

  if (item.expectedReturn >= config.targetReturn + 3) {
    score += 18;
    reasons.push("return outlook above target");
  } else if (item.expectedReturn < config.targetReturn - 2) {
    score -= 16;
    reasons.push("return outlook below target");
  }

  if (item.momentum > 8) {
    score += 12;
    reasons.push("strong momentum");
  } else if (item.momentum < -8) {
    score -= 14;
    reasons.push("weak momentum");
  }

  if (item.volatility > config.maxVolatility) {
    score -= Math.min(18, (item.volatility - config.maxVolatility) * 0.8);
    reasons.push("volatility above limit");
  }

  if (weight > config.maxPosition) {
    score -= Math.min(24, (weight - config.maxPosition) * 1.2);
    reasons.push("position concentration above limit");
  }

  if (item.targetWeight && weight < item.targetWeight * 0.8) {
    score += 8;
    reasons.push("below target allocation");
  } else if (item.targetWeight && weight > item.targetWeight * 1.25) {
    score -= 10;
    reasons.push("above target allocation");
  }

  if (item.dividendYield > 2.5) {
    score += 5 * config.dividendWeight;
    reasons.push("income support");
  }

  score = Math.max(0, Math.min(100, score));
  const signal = score >= 68 ? "BUY" : score <= 38 ? "SELL" : "HOLD";
  if (!reasons.length) reasons.push("balanced against current settings");

  return { score, signal, reasons };
}

function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map(parseCsvLine);
  const headers = rows.shift().map((header) => normalizeHeader(header));
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] ?? "";
      });
      return {
        ticker: String(item.ticker || item.symbol || "").toUpperCase(),
        shares: numberFrom(item.shares || item.quantity),
        price: numberFrom(item.price || item.lastPrice || item.currentPrice),
        costBasis: numberFrom(item.costBasis || item.cost),
        targetWeight: numberFrom(item.targetWeight),
        expectedReturn: numberFrom(item.expectedReturn),
        volatility: numberFrom(item.volatility),
        dividendYield: numberFrom(item.dividendYield || item.yield),
        momentum: numberFrom(item.momentum),
      };
    });
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value.trim());
  return values;
}

function normalizeHeader(value) {
  return String(value).replace(/[^a-zA-Z0-9]/g, "").replace(/^./, (char) => char.toLowerCase());
}

function getConfig() {
  return {
    maxPosition: Number(settings.maxPosition.value) || 15,
    targetReturn: Number(settings.targetReturn.value) || 8,
    maxVolatility: Number(settings.maxVolatility.value) || 28,
    dividendWeight: Number(settings.dividendWeight.value) || 0,
  };
}

function valueOf(item) {
  return Math.max(0, Number(item.shares) || 0) * Math.max(0, Number(item.price) || 0);
}

function numberFrom(value) {
  return Number(String(value ?? "").replace(/[$,%]/g, "")) || 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function getTone(score, hasHoldings) {
  if (!hasHoldings) return "Add holdings to begin";
  if (score >= 72) return "Constructive";
  if (score >= 55) return "Balanced";
  if (score >= 40) return "Cautious";
  return "Defensive";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
