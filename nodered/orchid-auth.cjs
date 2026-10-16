// Dang nhap cho Node-RED: Basic auth cho dashboard (HTTP + socket.io) va dang nhap editor.
// Tai khoan nam trong file JSON ngoai repo (ORCHID_AUTH_FILE), mat khau luu dang scrypt.
// Vai tro: admin (editor + dieu khien), operator (dieu khien dashboard), viewer (chi xem).
const crypto = require("node:crypto");
const fs = require("node:fs");

const ROLES = ["admin", "operator", "viewer"];
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const CACHE_MS = 10 * 60 * 1000;

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH, SCRYPT);
  return { salt: salt.toString("base64"), hash: hash.toString("base64") };
}

function loadUsers(file) {
  if (!file) {
    throw new Error("ORCHID_AUTH_FILE is not set. Start Node-RED with nodered/start-node-red.ps1 (or .sh).");
  }
  if (!fs.existsSync(file)) {
    throw new Error(`Dashboard login is not configured (${file} not found). Run: node nodered/set-dashboard-password.cjs "${file}" --user <name> --role admin`);
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const users = Array.isArray(data.users) ? data.users : [];
  for (const account of users) {
    const valid = typeof account.user === "string" && account.user && ROLES.includes(account.role) &&
      typeof account.salt === "string" && typeof account.hash === "string";
    if (!valid) throw new Error(`Invalid account entry in ${file}`);
  }
  if (!users.some((account) => account.role === "admin")) {
    throw new Error(`${file} needs at least one admin account`);
  }
  return users;
}

function verify(users, username, password) {
  const account = users.find((item) => item.user === username);
  // Van tinh scrypt khi sai ten de thoi gian phan hoi khong lo tai khoan nao ton tai.
  const salt = account ? Buffer.from(account.salt, "base64") : Buffer.alloc(16);
  const expected = account ? Buffer.from(account.hash, "base64") : Buffer.alloc(KEY_LENGTH);
  const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected) && account ? { user: account.user, role: account.role } : null;
}

function parseBasicAuth(header) {
  if (typeof header !== "string" || !header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  return separator < 0 ? null : { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

function createGuard(users) {
  const cache = new Map();
  const sessions = new Map();

  // Trinh duyet gui lai Basic auth cho moi file cua dashboard; cache ket qua dung de khong chay scrypt moi request.
  function check(header) {
    const key = crypto.createHash("sha256").update(String(header || "")).digest("hex");
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.account;
    const credentials = parseBasicAuth(header);
    const account = credentials ? verify(users, credentials.user, credentials.password) : null;
    if (account) cache.set(key, { account, expires: Date.now() + CACHE_MS });
    return account;
  }

  return {
    http(req, res, next) {
      const account = check(req.headers.authorization);
      if (account) {
        req.orchidUser = account;
        next();
        return;
      }
      res.set("WWW-Authenticate", 'Basic realm="Orchid dashboard", charset="UTF-8"');
      res.status(401).send("Login required");
    },

    // Thay middleware mac dinh cua Dashboard 2, nen giu lai hai kiem tra cua no truoc khi kiem tra dang nhap.
    socket(socket, next) {
      if (socket.request.url.includes("transport=websocket")) {
        socket.client.conn.close();
        return;
      }
      if (socket.handshake.xdomain !== false) {
        next(new Error("Cross-origin dashboard connection rejected"));
        return;
      }
      const account = check(socket.request.headers.authorization);
      if (!account) {
        next(new Error("Login required"));
        return;
      }
      sessions.set(socket.id, account);
      socket.on("disconnect", () => sessions.delete(socket.id));
      next();
    },

    // Function node goi qua global.get('orchidDashboardUser')(msg._client.socketId).
    userForSocket(socketId) {
      return sessions.get(socketId) || null;
    },

    adminAuth: {
      type: "credentials",
      users: async (username) => {
        const account = users.find((item) => item.user === username && item.role === "admin");
        return account ? { username: account.user, permissions: "*" } : null;
      },
      authenticate: async (username, password) => {
        const account = verify(users, username, password);
        return account && account.role === "admin" ? { username: account.user, permissions: "*" } : null;
      },
    },
  };
}

module.exports = { ROLES, hashPassword, loadUsers, verify, parseBasicAuth, createGuard };
