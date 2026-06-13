const { spawn } = require("child_process");
const assert = require("assert");
const http = require("http");

const port = 10000 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, HOST: "0.0.0.0", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

function request(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path: pathname, timeout: 3000 }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.on("timeout", () => request.destroy(new Error(`Timeout requesting ${pathname}`)));
    request.on("error", reject);
  });
}

const ready = new Promise((resolve, reject) => {
  child.stdout.once("data", resolve);
  child.stderr.once("data", (data) => reject(new Error(data.toString())));
  child.once("exit", (code) => reject(new Error(`Server exited early with code ${code}`)));
});

ready
  .then(async () => {
    const health = await request("/health");
    const root = await request("/");
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
    assert.equal(root.status, 200);
    assert(root.body.includes("<!doctype html>"));
    console.log("Deploy smoke test passed: /health and / respond on 0.0.0.0.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => child.kill());
