/**
 * If the computer's own DNS can't find a host (ENOTFOUND), ask public DNS (1.1.1.1, 8.8.8.8)
 * instead. Some home and mobile networks can't resolve the Arc RPC; this lets scripts run anyway.
 */
const dns = require("dns");

const resolver = new dns.Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
const original = dns.lookup;

dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") [callback, options] = [options, {}];
  if (typeof options === "number") options = { family: options };
  original.call(dns, hostname, options, (err, address, family) => {
    if (!err || err.code !== "ENOTFOUND") return callback(err, address, family);
    resolver.resolve4(hostname, (err4, addrs) => {
      if (err4 || !addrs.length) return callback(err);
      if (options.all) return callback(null, addrs.map((a) => ({ address: a, family: 4 })));
      callback(null, addrs[0], 4);
    });
  });
};
