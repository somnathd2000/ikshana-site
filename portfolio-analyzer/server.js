const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT || 8787);
loadEnvFile(path.join(root, ".env"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/brokerage/snaptrade/login" && req.method === "POST") {
      await handleSnapTradeLogin(req, res);
      return;
    }

    if (url.pathname === "/api/brokerage/status" && req.method === "GET") {
      const missing = getMissingSnapTradeConfig();
      sendJson(res, 200, {
        configured: missing.length === 0,
        missing,
        message:
          missing.length === 0
            ? "SnapTrade credentials are configured."
            : `Fill in the missing SnapTrade values in portfolio-analyzer/.env, then restart node server.js.`,
      });
      return;
    }

    if (url.pathname === "/api/brokerage/config" && req.method === "POST") {
      await handleConfigSave(req, res);
      return;
    }

    if (url.pathname === "/api/brokerage/holdings" && req.method === "GET") {
      sendJson(res, 501, {
        error: "holdings_endpoint_not_implemented",
        message:
          "Fidelity consent can be connected after SnapTrade account/account-position calls are wired here.",
      });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: "server_error", message: error.message });
  }
});

server.listen(port, () => {
  console.log(`Portfolio analyzer running at http://localhost:${port}`);
});

async function handleSnapTradeLogin(req, res) {
  const missing = getMissingSnapTradeConfig();

  if (missing.length) {
    sendJson(res, 503, {
      error: "snaptrade_not_configured",
      missing,
      message: "Fill in the missing SnapTrade values in portfolio-analyzer/.env, then restart node server.js.",
    });
    return;
  }

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const userId = process.env.SNAPTRADE_USER_ID;
  const userSecret = process.env.SNAPTRADE_USER_SECRET;
  const body = await readJson(req);
  const query = new URLSearchParams({
    userId,
    userSecret,
    connectionType: body.connectionType || "read",
    immediateRedirect: String(body.immediateRedirect ?? true),
    customRedirect: body.customRedirect || `http://localhost:${port}`,
  });

  const broker = new URL(req.url, `http://${req.headers.host}`).searchParams.get("broker");
  const requestBody = broker ? { broker } : {};

  const response = await fetch(`https://api.snaptrade.com/api/v1/snapTrade/login?${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      clientId,
      consumerKey,
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    sendJson(res, response.status, {
      error: "snaptrade_login_failed",
      message: data.detail || data.message || "SnapTrade did not create a connection portal URL.",
      snapTradeResponse: data,
    });
    return;
  }

  sendJson(res, 200, {
    loginUrl: data.redirectURI || data.redirectUri || data.loginUrl,
    sessionId: data.sessionId,
  });
}

async function handleConfigSave(req, res) {
  const body = await readJson(req);
  const required = ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY", "SNAPTRADE_USER_ID", "SNAPTRADE_USER_SECRET"];
  const missing = required.filter((name) => !String(body[name] || "").trim());

  if (missing.length) {
    sendJson(res, 400, {
      error: "missing_values",
      missing,
      message: "Fill in all SnapTrade credential fields before saving.",
    });
    return;
  }

  const lines = [
    `SNAPTRADE_CLIENT_ID=${envEscape(body.SNAPTRADE_CLIENT_ID)}`,
    `SNAPTRADE_CONSUMER_KEY=${envEscape(body.SNAPTRADE_CONSUMER_KEY)}`,
    `SNAPTRADE_USER_ID=${envEscape(body.SNAPTRADE_USER_ID)}`,
    `SNAPTRADE_USER_SECRET=${envEscape(body.SNAPTRADE_USER_SECRET)}`,
    `PORT=${port}`,
    "",
  ];

  await fs.writeFile(path.join(root, ".env"), lines.join("\n"), "utf8");
  for (const name of required) {
    process.env[name] = String(body[name]).trim();
  }

  sendJson(res, 200, {
    configured: true,
    message: "SnapTrade credentials saved locally.",
  });
}

async function serveStatic(pathname, res) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(root, `.${cleanPath}`);

  if (!filePath.startsWith(root)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(res, 404, "Not found");
      return;
    }
    throw error;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, payload) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(payload);
}

function envEscape(value) {
  const text = String(value || "").trim();
  if (/[\s#"'=]/.test(text)) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

function getMissingSnapTradeConfig() {
  return ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_KEY", "SNAPTRADE_USER_ID", "SNAPTRADE_USER_SECRET"].filter(
    (name) => !process.env[name]
  );
}

function loadEnvFile(filePath) {
  try {
    const text = fsSync.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
