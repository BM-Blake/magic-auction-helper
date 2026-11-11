const fs = require("fs");
const path = require("path");

const files = ["app.js", "index.html", "sw.js", "manifest.webmanifest"];

function versionsIn(text) {
  const found = new Set();
  for (const match of text.matchAll(/[?&]v=(\d+)/g)) found.add(match[1]);
  for (const match of text.matchAll(/magic-auction-v(\d+)/g)) found.add(match[1]);
  return [...found];
}

function cacheVersions(root) {
  const versions = new Set();
  const missing = [];
  for (const file of files) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
      continue;
    }
    const found = versionsIn(fs.readFileSync(fullPath, "utf8"));
    if (found.length === 0) missing.push(file);
    for (const version of found) versions.add(version);
  }
  return { versions: [...versions], missing };
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(input).command || "";
  } catch (error) {
    command = "";
  }
  if (!/\bgit(\.exe)?\s+commit\b/.test(command)) {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
    return;
  }
  const { versions, missing } = cacheVersions(process.cwd());
  if (missing.length === 0 && versions.length === 1) {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
    return;
  }
  const detail = missing.length
    ? `No cache version in ${missing.join(", ")}.`
    : `Cache versions disagree: ${versions.join(", ")}.`;
  const message = `${detail} Bump app.js, index.html, sw.js, and manifest.webmanifest together.`;
  process.stdout.write(JSON.stringify({
    permission: "deny",
    user_message: message,
    agent_message: `${message} privacy.html stays on its own stylesheet version.`
  }));
});
