const { execSync } = require("child_process");
const net = require("net");

const SITE = "https://nl.hostinesia.my.id/";
const ORIGIN = "http://localhost:9000/";
const TUNNEL_CMD = "cloudflared.*tunnel run";
const TUNNEL_COOLDOWN = 120000;
const PM2_COOLDOWN = 180000;

let publicFail = 0;
let originFail = 0;
let lastTunnelFix = 0;
let lastPm2Fix = 0;

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function tcpOk(host, port) {
  return new Promise((resolve) => {
    const s = net.connect(port, host);
    const done = (v) => { s.destroy(); resolve(v); };
    s.setTimeout(5000, () => done(false));
    s.on("connect", () => done(true));
    s.on("error", () => done(false));
  });
}

function code(url) {
  try {
    return execSync(
      `curl -s -o /dev/null -w "%{http_code}" --max-time 10 ${url}`,
      { encoding: "utf8" }
    ).trim();
  } catch {
    return "000";
  }
}

function tunnelPids() {
  try {
    return execSync(`pgrep -f '${TUNNEL_CMD}'`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid !== process.pid);
  } catch {
    return [];
  }
}

function restartTunnel() {
  const pids = tunnelPids();
  if (pids.length === 0) return false;

  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      killed++;
    } catch (e) {
      log("kill pid", pid, "gagal:", e.message);
    }
  }
  if (killed > 0) lastTunnelFix = Date.now();
  log("TUNNEL MATI -> kill cloudflared pid", killed, "(systemd start ulang otomatis)");
  return killed > 0;
}

async function check() {
  try {
    const online = await tcpOk("1.1.1.1", 443);
    if (!online) return;

    const publicCode = code(SITE);
    if (publicCode === "200") {
      publicFail = 0;
      originFail = 0;
      return;
    }

    publicFail++;
    log("site publik gagal, percobaan ke-" + publicFail, "kode=" + publicCode);

    const originCode = code(ORIGIN);
    if (originCode !== "200") {
      originFail++;
      log("origin lokal juga gagal, percobaan ke-" + originFail, "kode=" + originCode);
      if (originFail >= 2 && Date.now() - lastPm2Fix > PM2_COOLDOWN) {
        lastPm2Fix = Date.now();
        try {
          execSync("pm2 restart northline northline-2");
          log("PM2 northline di-restart");
        } catch (e) {
          log("pm2 restart gagal:", e.message);
        }
        originFail = 0;
      }
      return;
    }

    originFail = 0;
    log("origin lokal SEHAT, jadi yang mati adalah tunnel");
    if (publicFail >= 2 && Date.now() - lastTunnelFix > TUNNEL_COOLDOWN) {
      if (restartTunnel()) publicFail = 0;
    }
  } catch (e) {
    log("check error:", e.message);
  }
}

setInterval(check, 60000);
log("tunnel-watchdog aktif, cek tiap 60 detik");
