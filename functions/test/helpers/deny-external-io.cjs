// Local regression suites must inject mocks; unexpected network access fails closed.
const deny = () => {throw new Error("External network access is disabled for local finance tests.");};
global.fetch = async () => deny();
for (const module of ["node:http", "node:https"]) {
  const api = require(module); api.request = deny; api.get = deny;
}
require("node:net").connect = deny;
require("node:net").createConnection = deny;
require("node:net").Socket.prototype.connect = deny;
require("node:tls").connect = deny;
require("node:http2").connect = deny;
