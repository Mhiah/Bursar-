// Copies the compiled ABIs into the website so both stay in step.
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "..", "app", "src", "lib", "abi");
fs.mkdirSync(out, { recursive: true });
for (const name of ["BursarVault", "BursarFactory", "BursarSavings", "BursarSavingsFactory"]) {
  const { abi } = require(`../artifacts/contracts/${name}.sol/${name}.json`);
  const varName = name[0].toLowerCase() + name.slice(1) + "Abi";
  fs.writeFileSync(
    path.join(out, `${name}.ts`),
    `// Generated from contracts/artifacts. Re-run after changing the contracts.\nexport const ${varName} = ${JSON.stringify(abi, null, 2)} as const;\n`,
  );
}
console.log("ABIs written to", out);
