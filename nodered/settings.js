const { loadUsers, createGuard } = require("./orchid-auth.cjs");

// Dang nhap bat buoc. File tai khoan nam ngoai repo; tao bang nodered/set-dashboard-password.cjs.
const guard = createGuard(loadUsers(process.env.ORCHID_AUTH_FILE));

module.exports = {
  uiHost: "127.0.0.1",
  uiPort: Number(process.env.ORCHID_NODE_RED_PORT) || 1880,
  flowFile: "flows.json",
  credentialSecret: "orchid-local-demo-only",
  adminAuth: guard.adminAuth,
  // httpNodeMiddleware chi ap cho node HTTP In; Dashboard 2 can middleware rieng cho trang va socket.io.
  httpNodeMiddleware: guard.http,
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
