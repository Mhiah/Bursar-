// Same as deploy-all.js, but actually deploys (when the wallet has enough).
process.env.DEPLOY = "yes";
require("./deploy-all.js");
