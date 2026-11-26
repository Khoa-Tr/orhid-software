const { loadUsers, createGuard } = require("./orchid-auth.cjs");

// Dang nhap bat buoc. File tai khoan nam ngoai repo; tao bang nodered/set-dashboard-password.cjs.
const guard = createGuard(loadUsers(process.env.ORCHID_AUTH_FILE));

module.exports = {
  uiHost: "127.0.0.1",
  uiPort: Number(process.env.ORCHID_NODE_RED_PORT) || 1880,
  httpStatic: "c:\\Users\\ACER\\OneDrive\\Documents\\PlatformIO\\Projects\\orhid\\web",
  flowFile: "flows.json",
  credentialSecret: "orchid-local-demo-only",
  adminAuth: guard.adminAuth,
  // httpNodeMiddleware: guard.http, // Cho phep public webhook HTTP In (nhu Q5 ReqBin)
  dashboard: {
    middleware: guard.http,
    ioMiddleware: guard.socket
  },
  functionGlobalContext: {
    orchidDashboardUser: guard.userForSocket
  },
  editorTheme: {
    projects: {
      enabled: false
    }
  }
};
