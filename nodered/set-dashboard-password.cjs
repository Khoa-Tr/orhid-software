// Tao / cap nhat tai khoan dang nhap Node-RED (dashboard + editor).
// Cach dung: node nodered/set-dashboard-password.cjs <auth-file> --user <ten> [--role admin|operator|viewer]
// Mat khau duoc hoi an trong terminal (hoac lay tu bien ORCHID_NEW_PASSWORD khi chay tu dong).
const fs = require("node:fs");
const path = require("node:path");
const { ROLES, hashPassword } = require("./orchid-auth.cjs");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error("Run this in a terminal, or set ORCHID_NEW_PASSWORD"));
      return;
    }
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      process.stdout.write("\n");
    };
    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    }
    input.on("data", onData);
  });
}

async function main() {
  const file = process.argv[2];
  const user = argument("--user");
  const role = argument("--role", "operator");
  if (!file || file.startsWith("--") || !user) {
    throw new Error("Usage: node nodered/set-dashboard-password.cjs <auth-file> --user <name> [--role admin|operator|viewer]");
  }
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(user)) throw new Error("User name: 3-32 letters, digits, dot, dash or underscore");
  if (!ROLES.includes(role)) throw new Error(`Role must be one of: ${ROLES.join(", ")}`);

  let password = process.env.ORCHID_NEW_PASSWORD;
  if (!password) {
    password = await readHidden(`Password for ${user}: `);
    const again = await readHidden("Repeat password: ");
    if (password !== again) throw new Error("Passwords do not match");
  }
  if (password.length < 8) throw new Error("Password must have at least 8 characters");

  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { users: [] };
  const users = (data.users || []).filter((account) => account.user !== user);
  users.push({ user, role, ...hashPassword(password), updated_at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ users }, null, 2) + "\n", { mode: 0o600 });
  console.log(`Saved ${role} account "${user}" in ${file}`);
  if (!users.some((account) => account.role === "admin")) {
    console.log("Note: Node-RED needs at least one admin account before it will start.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
