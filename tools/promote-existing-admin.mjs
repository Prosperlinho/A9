import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../node_modules/convex/bin/main.js", import.meta.url));
const email = "prosperlinho@gmail.com";
const secret = randomBytes(32).toString("base64url");
const validationOnlyPassword = `A9x3-${randomBytes(24).toString("base64url")}`;

const run = (args, input) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    input,
    windowsHide: true,
  });

const set = (name, value) => {
  const result = run(["env", "set", name, "--prod"], value);
  if (result.status !== 0) throw new Error(`Could not configure temporary ${name}.`);
};

let promoted = false;
let cleanupFailed = false;
try {
  set("A9_ADMIN_EMAIL", email);
  set("A9_ADMIN_BOOTSTRAP_SECRET", secret);
  const args = JSON.stringify({
    email,
    password: validationOnlyPassword,
    bootstrapSecret: secret,
  });
  const result = run(["run", "admin:bootstrapAdmin", args, "--prod", "--typecheck", "disable"]);
  if (result.status !== 0 || !/"created"\s*:\s*false/.test(result.stdout)) {
    throw new Error("Protected bootstrap did not confirm the existing-account path.");
  }
  promoted = /"promoted"\s*:\s*true/.test(result.stdout);
  if (!promoted) throw new Error("Protected bootstrap did not confirm role promotion.");
} finally {
  for (const name of ["A9_ADMIN_BOOTSTRAP_SECRET", "A9_ADMIN_EMAIL"]) {
    const result = run(["env", "remove", name, "--prod"]);
    if (result.status !== 0) cleanupFailed = true;
  }
}

if (cleanupFailed) throw new Error("Temporary bootstrap environment cleanup needs attention.");
console.log("Existing linked profile promoted by protected bootstrap; temporary environment settings removed.");
