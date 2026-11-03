/**
 * If the computer's own DNS can't find a host (ENOTFOUND), ask public DNS instead: first
 * 1.1.1.1 / 8.8.8.8 directly, then Cloudflare's DNS-over-HTTPS at https://1.1.1.1 (no lookup
 * needed). Some home and mobile networks can't resolve the Arc RPC; this lets scripts run anyway.
 * Loaded from hardhat.config.js so it is in place before any network call.
 */
const dns = require("dns");
const https = require("https");

const resolver = new dns.Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
const original = dns.lookup;

function overHttps(hostname, done) {
  const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
  https
    .get(url, { headers: { accept: "application/dns-json" }, timeout: 10000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const addrs = (JSON.parse(body).Answer || []).filter((a) => a.type === 1).map((a) => a.data);
          done(addrs.length ? null : new Error("no address"), addrs);
        } catch (e) {
          done(e);
        }
      });
    })
    .on("error", done)
    .on("timeout", function () {
      this.destroy(new Error("timeout"));
    });
}

dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") [callback, options] = [options, {}];
  if (typeof options === "number") options = { family: options };
  options = options || {};
  original.call(dns, hostname, options, (err, address, family) => {
    if (!err || err.code !== "ENOTFOUND") return callback(err, address, family);
    const answer = (addrs) =>
      options.all ? callback(null, addrs.map((a) => ({ address: a, family: 4 }))) : callback(null, addrs[0], 4);
    resolver.resolve4(hostname, (err4, addrs) => {
      if (!err4 && addrs.length) return answer(addrs);
      overHttps(hostname, (errH, addrsH) => {
        if (!errH) return answer(addrsH);
        console.error(`dns-fallback: couldn't find ${hostname} (${err4 && err4.code}; ${errH.message})`);
        callback(err);
      });
    });
  });
};
