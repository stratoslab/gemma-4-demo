// Polyfill crypto.hash for Node 21.6.x (added in 20.12 / 21.7 / 22.0).
// Vite 7+ uses crypto.hash(). Load via NODE_OPTIONS="--require ./scripts/crypto-hash-polyfill.cjs"
const crypto = require("node:crypto");
if (typeof crypto.hash !== "function") {
  crypto.hash = (algorithm, data, outputEncoding = "hex") =>
    crypto.createHash(algorithm).update(data).digest(outputEncoding);
}
