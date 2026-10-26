// Starts the existing API and frontend together. No extra dependencies or shell policy changes.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = (name, fallback) => {
  const value = Number(
    process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ||
      fallback,
  );
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error(`Invalid ${name}`);
  return value;
};
const apiPort = port("backend-port", 8000);
const frontendPort = port("frontend-port", 5173);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const python = join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const vite = join(root, "frontend/node_modules/vite/bin/vite.js");
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

async function available(number) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${number} is occupied. No process was stopped. Use --frontend-port=5174 --backend-port=8001 to select other ports.`,
        ),
      ),
    );
    server.listen(number, "127.0.0.1", () => server.close(resolve));
  });
}

function launch(name, command, args, cwd, environment) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${name} could not start: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${name} stopped (${code}). Restart with npm.cmd run dev.`);
      stop(code || 1);
    }
  });
}

async function ready(url, json = false) {
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok && (!json || (await response.json()).status === "ok"))
        return;
    } catch {
      /* Startup is asynchronous; retry without printing connection details. */
    }
    await delay(250);
  }
  throw new Error(
    `Startup verification failed at ${url}. Check the server errors above and ensure PostgreSQL is running.`,
  );
}

try {
  if (!existsSync(python) || !existsSync(vite))
    throw new Error(
      "Dependencies are missing. Follow README.md installation instructions first.",
    );
  if (!existsSync(join(root, ".env")))
    throw new Error(
      "Configure PostgreSQL first: cd backend, then run ..\\.venv\\Scripts\\python.exe -m app.setup_postgres",
    );
  if (apiPort === frontendPort)
    throw new Error("Frontend and backend ports must differ.");
  await available(apiPort);
  await available(frontendPort);
  launch(
    "API",
    python,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(apiPort),
    ],
    join(root, "backend"),
    { FRONTEND_ORIGIN: frontendUrl },
  );
  launch(
    "Frontend",
    process.execPath,
    [
      vite,
      "--host",
      "127.0.0.1",
      "--port",
      String(frontendPort),
      "--strictPort",
    ],
    join(root, "frontend"),
    { VITE_API_TARGET: apiUrl },
  );
  await Promise.all([ready(apiUrl + "/api/health", true), ready(frontendUrl)]);
  await ready(frontendUrl + "/api/health", true);
  if (!stopping)
    console.log(
      `\nVelora is ready: ${frontendUrl}\nAPI docs: ${apiUrl}/docs\nBoth servers must stay running. Press Ctrl+C to stop them.\n`,
    );
} catch (error) {
  console.error(error.message);
  stop(1);
}
