#!/usr/bin/env node
/**
 * Smoke test visual untuk halaman NPinjam Scanner.
 *
 * Menjalankan chromium headless, login sebagai admin, membuka halaman
 * scanner, lalu:
 *   1. screenshot state awal
 *   2. cek error console / pageerror
 *   3. membuka pindaian tersimpan supaya panel hasil, peta, dan panel
 *      WhatsApp ikut terender, lalu mencoba mengirim
 *
 * Pakai: node scripts/npsScannerVisualCheck.js [baseUrl]
 */

const puppeteer = require("/home/hostinesia/northline/backend/node_modules/puppeteer");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://[::1]:9100";
const OUT = "/home/hostinesia/.cache/nl-check/shots";
const ADMIN_TOKEN = fs.readFileSync("/home/hostinesia/.cache/nl-check/admin.token", "utf8").trim();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  // server memblokir UA yang mengandung "headless" (BLOCKED_BOT_UA), jadi pakai
  // UA browser biasa tanpa frasa headless.
  await page.setUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console.error: " + m.text());
  });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

  // Set cookie auth sebelum navigasi supaya tidak perlu password admin.
  await page.goto(BASE + "/AppNorthAdmin", { waitUntil: "domcontentloaded" });
  await page.evaluate((token) => {
    document.cookie = "nl_jwt=" + token + "; path=/; SameSite=Lax";
    document.cookie = "logged_in=1; path=/; SameSite=Lax";
  }, ADMIN_TOKEN);

  await page.goto(BASE + "/AppNorthAdmin", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));

  const loggedIn = await page.evaluate(() => !!(window.navTo && document.body.innerText.indexOf("Login") === -1));
  console.log("halaman admin termuat:", loggedIn);

  // Buka halaman scanner.
  const opened = await page.evaluate(() => {
    if (typeof navTo !== "function") return "navTo tidak ada";
    navTo("npinjam-scanner");
    return "ok";
  });
  console.log("navTo(npinjam-scanner):", opened);
  await new Promise((r) => setTimeout(r, 2500));

  const has = await page.evaluate(() => ({
    page: !!document.querySelector(".nps-page"),
    head: !!document.querySelector(".nps-head"),
    drop: !!document.querySelector(".nps-drop"),
    saved: !!document.querySelector("#nps-saved"),
    panels: document.querySelectorAll(".nps-panel").length,
  }));
  console.log("elemen state awal:", JSON.stringify(has));

  await page.screenshot({ path: path.join(OUT, "01-initial.png"), fullPage: true });

  // Paksa panel hasil terisi supaya bisa dicek styling pesan + share.
  const forced = await page.evaluate(() => {
    if (typeof npsOpenSaved !== "function") return "npsOpenSaved tidak ada";
    npsOpenSaved(2);
    return "ok";
  });
  console.log("npsOpenSaved(2):", forced);
  await new Promise((r) => setTimeout(r, 3000));

  const after = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return {
      flags: document.querySelectorAll(".nps-flag").length,
      shareHost: !!document.getElementById("nps-share-host"),
      shareVisible: vis("#nps-share-host"),
      map: vis("#nps-map"),
      savedRows: document.querySelectorAll(".nps-list-item").length,
      // Cek tidak ada warna non-merah yang bocor dari badge shared.
      leakedBadgeClasses: Array.from(document.querySelectorAll(".nps-page [class*='badge-']")).map((e) => e.className),
      // Cek radius/shadow tidak dipakai di halaman scanner.
      rounded: Array.from(document.querySelectorAll(".nps-page *")).filter((e) => {
        const cs = getComputedStyle(e);
        return parseFloat(cs.borderTopLeftRadius) > 0.5;
      }).length,
      shadowed: Array.from(document.querySelectorAll(".nps-page *")).filter((e) => {
        const cs = getComputedStyle(e);
        return cs.boxShadow && cs.boxShadow !== "none";
      }).length,
    };
  });
  console.log("elemen setelah buka pindaian:", JSON.stringify(after, null, 1));

  await page.screenshot({ path: path.join(OUT, "02-loaded.png"), fullPage: true });

  // Isi nomor lalu klik Kirim Alamat.
  await page.evaluate(() => { npsSaved.phone = "081234567890"; npsRenderSharePanel(); });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(OUT, "03-share-form.png"), fullPage: true });

  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("#nps-share-host button"));
    const target = btns.find((b) => /Kirim Alamat/.test(b.textContent));
    if (!target) return "tombol Kirim tidak ditemukan";
    target.click();
    return "diklik";
  });
  console.log("kirim:", clicked);
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(OUT, "04-share-result.png"), fullPage: true });

  const shareOut = await page.evaluate(() => {
    const host = document.getElementById("nps-share-host");
    return host ? host.innerText.replace(/\s+/g, " ").trim().slice(0, 300) : "(tidak ada)";
  });
  console.log("isi panel share:", shareOut);

  // Tampilan sempit.
  await page.setViewport({ width: 430, height: 950 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT, "05-mobile.png"), fullPage: true });

  console.log("\n=== masalah console (" + problems.length + ") ===");
  for (const p of problems.slice(0, 20)) console.log(" -", p);

  await browser.close();
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});
