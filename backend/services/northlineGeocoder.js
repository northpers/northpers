// northlineGeocoder.js
// Abstraction geocoding untuk NPinjam Scanner.
//
// Prioritas provider (sesuai spec bagian 17):
//   1. Google Maps Platform Geocoding API  -> dipakai kalau GOOGLE_MAPS_API_KEY ada
//   2. Nominatim / OpenStreetMap            -> fallback, precedent sudah dipakai di
//                                             frontend/java/AppNorthAccount.js
//
// Aturan keras (spec bagian 18):
//   - JANGAN PERNAH membuat koordinat. Tidak ada lokasi -> LOCATION_NOT_FOUND.
//   - Hasil ambigu -> LOCATION_REVIEW_REQUIRED + kandidat untuk dipilih user.
//   - API key hanya dibaca dari environment server, tidak pernah dikembalikan.

const GOOGLE_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_BASE = "https://www.openstreetmap.org/";

// Jarak (meter) antar dua kandidat yang dianggap "kandidat berbeda".
// Di bawah nilai ini, hasilnya dianggap satu lokasi yang sama.
const AMBIGUITY_DISTANCE_M = 150;

class GeocoderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GeocoderError";
    this.code = code;
  }
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// Haversine. Dipakai hanya untuk MENGUKUR jarak antar kandidat yang sudah
// dikembalikan provider, bukan untuk mengarang koordinat.
function distanceMeters(a, b) {
  const R = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isValidCoordinate(lat, lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  if (!isFinite(latitude) || !isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

/**
 * Label dari Nominatim dipakai user untuk memilih kandidat, jadi nama jalan
 * justru informatif dan TIDAK boleh dibuang. Yang dibuang hanya prefiks yang
 * cuma mengulang nama jalan ("Jalan Mawar, Mawar, ...") agar label tidak
 * membingungkan.
 */
function trimNominatimLabel(label) {
  const parts = String(label || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    const first = parts[0];
    const nameOnly = first.replace(/^(gang|jl\.?|jalan|street|street name)\s+/i, "").trim();
    if (nameOnly && nameOnly.toLowerCase() === parts[1].toLowerCase()) {
      parts.splice(0, 2, nameOnly);
    }
  }

  return parts.join(", ") || String(label || "");
}

/**
 * Susun alamat lengkap dari field yang sudah dikonfirmasi user.
 * Mengembalikan null kalau tidak ada isi sama sekali.
 */
function buildFormattedAddress(address) {
  const src = address && typeof address === "object" ? address : {};
  const rtRw = String(src.rt_rw || "").trim();

  const parts = [
    String(src.alamat || "").trim(),
    rtRw ? `RT ${rtRw.replace(/\s*\/\s*/, "/")}` : "",
    String(src.kelurahan_desa || "").trim(),
    String(src.kecamatan || "").trim(),
    String(src.kabupaten_kota || "").trim(),
    String(src.provinsi || "").trim(),
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

/**
 * Levels query untuk geocoding.
 *
 * Geocoder (terutama Nominatim) tidak cope dengan alamat lengkap bertingkat
 * Indonesia. Dua hal yang diamati saat uji:
 *
 * 1. Free-text query panjang menghasilkan 0 hasil. Contoh
 *    "Jl. Raya Telukjambe, RT 02/05, Telukjambe, Telukjambe Timur, Karawang,
 *    Jawa Barat" -> 0 hasil, karena RT/RW dan pengulangan nama desa tidak
 *    pernah terindeks.
 * 2. Free-text query pendek justru mengembalikan POI yang kebetulan memuat
 *    kata yang sama. Contoh "Telukjambe Timur, Karawang, Jawa Barat" ->
 *    SMP Negeri 2 (sekolah), Kator Camat, rm. seafood.
 *    Query terstruktur (city=/state=/country=) untuk query yang sama justru
 *    mengembalikan entitas administrative yang benar: Telukjambe (village).
 *
 * Jadi setiap level punya mode sendiri: 'text' untuk percobaan spesifik
 * (jalan + RT/RW), 'structured' untuk area administrative.
 * Kita mencoba dari paling spesifik ke paling umum lalu MELAPORKAN level mana
 * yang benar-benar menghasilkan koordinat.
 *
 * Ini bukan menebak: koordinat selalu datang dari provider. Yang kita lakukan
 * hanya memilih tingkat ketelitian query, dan tingkat itu ikut dikembalikan ke
 * user supaya tahu seberapa pasti lokasinya.
 */
const QUERY_LEVELS = [
  { id: "street_rt", mode: "text", precision: "street", needs: ["alamat", "rt_rw", "kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi"] },
  { id: "street", mode: "text", precision: "street", needs: ["alamat", "kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi"] },
  { id: "street_structured", mode: "structured", precision: "street", needs: ["alamat", "kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi"] },
  { id: "village", mode: "structured", precision: "village", needs: ["kelurahan_desa", "kecamatan", "kabupaten_kota", "provinsi"] },
  { id: "district", mode: "structured", precision: "district", needs: ["kecamatan", "kabupaten_kota", "provinsi"] },
  { id: "city", mode: "structured", precision: "city", needs: ["kabupaten_kota", "provinsi"] },
];

// Precision di bawah "street" berarti koordinat yang kita dapat adalah pusat
// desa/kecamatan/kota, bukan lokasi persis alamat. Itu tidak boleh lolos sebagai
// LOCATION_CONFIRMED karena user akan mengira marker-nya tepat di alamatnya.
const PRECISION_CONFIRMABLE = new Set(["street"]);

// Urutan presisi, dari yang paling spesifik. Dipakai untuk menurunkan
// presisi ketika field yang dibutuhkan level tidak tersedia.
const PRECISION_RANK = { street: 3, village: 2, district: 1, city: 0 };

/**
 * Presisi terbaik yang mungkin dicapai dari field yang benar-benar terisi.
 *
 * Level `street_rt` mendeklarasikan presisi 'street', tapi kalau user hanya
 * mengisi kabupaten/kota, query-nya secara teknis tetap jalan. Men anderem laporkan
 * 'street' akan membuat user mengira marker-nya presisi. Karena itu presisi
 * level dibatasi oleh field yang ada.
 */
function availablePrecision(address) {
  const src = address && typeof address === "object" ? address : {};
  if (String(src.alamat || "").trim()) return "street";
  if (String(src.kelurahan_desa || "").trim()) return "village";
  if (String(src.kecamatan || "").trim()) return "district";
  return "city";
}

function effectivePrecision(level, address) {
  const ceiling = PRECISION_RANK[level.precision] ?? 0;
  const available = PRECISION_RANK[availablePrecision(address)] ?? 0;
  const best = Math.min(ceiling, available);
  return Object.keys(PRECISION_RANK).find((k) => PRECISION_RANK[k] === best);
}

// ---------------------------------------------------------------------------
// Guard konsistensi wilayah
// ---------------------------------------------------------------------------

// Prefiks administratif yang sering muncul di data KTP dan di formatted_address
// OpenStreetMap. Semuanya dibuang supaya perbandingan hanya memakai nama intinya.
const REGION_PREFIX_NOISE = new RegExp(
  "\\b(kabupaten|kab\\.?|kota|kota\\.?|kotamadya|kotamadya\\.?|administrasi|" +
    "daerah|autonomous|region|propinsi|prov\\.?|negara|state|district\\.?|kec\\.?|" +
    "kelurahan|kel\\.?|desa|sub\\.?|new|south|north|east|west)\\.?\\b",
  "gi"
);

/**
 * Sederhanakan nama wilayah menjadi token yang bisa dibandingkan.
 * "Kab. Sukoharjo" -> "sukoharjo", "KOTA JAKARTA SELATAN" -> "jakarta selatan".
 */
function regionTokens(value) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(REGION_PREFIX_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw;
}

/**
 * Cocokkan satu nilai wilayah terhadap nilai dari level yang sama.
 * return true = cocok, false = pasti beda, null = tidak bisa dipastikan.
 */
function matchLevelComponent(candidateValue, wantedValue) {
  const wanted = regionTokens(wantedValue);
  // Nama yang terlalu pendek tidak aman dibandingkan: "Blitar" bisa cocok
  // dengan wilayah lain yang namanya memuat kata itu.
  if (wanted.length < 4 || !candidateValue) return null;
  const actual = regionTokens(candidateValue);
  if (!actual) return null;
  return actual === wanted;
}

/**
 * Ringkasan wilayah yang diminta, dipakai untuk menandai kandidat.
 */
function requestedRegion(address) {
  const src = address && typeof address === "object" ? address : {};
  return {
    kabupaten_kota: String(src.kabupaten_kota || "").trim(),
    provinsi: String(src.provinsi || "").trim(),
  };
}

/**
 * Periksa satu kandidat terhadap wilayah yang diminta.
 *
 * Perbandingan dilakukan per level administratif, bukan dengan mencari nama di
 * dalam formatted_address. Alasannya: nama yang sama bisa muncul di level lain.
 * Contoh nyata dari Nominatim:
 *   display_name : "Sukoharjo, Kutoarjo, Purworejo, Jawa Tengah"
 *   county       : "Purworejo"    -> inilah kabupaten-nya
 *   city_district: "Sukoharjo"    -> ini district di dalam Kutoarjo
 * Kalau yang dibandingkan hanya display_name, "Kabupaten Sukoharjo" akan
 * dianggap cocok padahal koordinatnya ada di kabupaten lain.
 *
 * return true = cocok, false = pasti beda, null = tidak bisa dipastikan.
 */
function candidateRegionMatch(candidate, region) {
  const addr = (candidate && candidate.address) || {};
  const checks = [
    // Kabupaten/kota -> level kabupaten/kota (county / administrative_area_level_2).
    matchLevelComponent(addr.county, region.kabupaten_kota),
    // Provinsi -> level provinsi (state / administrative_area_level_1).
    matchLevelComponent(addr.state, region.provinsi),
  ].filter((v) => v !== null);

  // Provider tidak memberi breakdown level -> tidak ada yang bisa dipastikan.
  if (checks.length === 0) return null;
  return checks.every(Boolean);
}

/**
 * Urutan prioritas kandidat berdasarkan konsistensi wilayah.
 * true (cocok) > null (tidak bisa dipastikan) > false (pasti beda wilayah).
 */
function rankRegion(regionMatch) {
  if (regionMatch === true) return 2;
  if (regionMatch === null) return 1;
  return 0;
}

/** Nama wilayah bersih untuk ditampilkan di pesan error. */
function regionLabel(value) {
  const cleaned = regionTokens(value);
  return cleaned || String(value || "").trim();
}


// Hierarki Indonesian -> parameter terstruktur Nominatim.
// `city` di Nominatim mencakup city/town/village, jadi kelurahan/desa dan
// kecamatan dipetakan ke sana sesuai urutan kecocokan terbaik.
// Pilihan field per level didefinisikan eksplisit di STRUCTURED_FIELDS_BY_LEVEL
// supaya tidak ditebak dari `needs`.
const STRUCTURED_FIELDS_BY_LEVEL = {
  street_structured: { street: ["alamat"], city: ["kelurahan_desa", "kecamatan"], county: ["kabupaten_kota"], state: ["provinsi"] },
  village: { city: ["kelurahan_desa"], county: ["kabupaten_kota"], state: ["provinsi"] },
  district: { city: ["kecamatan"], county: ["kabupaten_kota"], state: ["provinsi"] },
  city: { city: ["kabupaten_kota"], state: ["provinsi"] },
};

function pickFirst(src, keys) {
  for (const key of keys) {
    const value = String(src[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function buildLevelQuery(address, level) {
  const src = address && typeof address === "object" ? address : {};
  const rtRw = String(src.rt_rw || "").trim();
  const rtPart = rtRw ? `RT ${rtRw.replace(/\s*\/\s*/, "/")}` : "";

  const missing = level.needs.filter((key) => {
    if (key === "rt_rw") return !rtPart;
    return !String(src[key] || "").trim();
  });

  if (level.mode === "structured") {
    const mapping = STRUCTURED_FIELDS_BY_LEVEL[level.id] || {};
    const params = { country: "Indonesia" };
    let any = false;

    for (const [param, keys] of Object.entries(mapping)) {
      const value = pickFirst(src, keys);
      if (!value) continue;
      params[param] = value;
      any = true;
    }

    if (!any) return null;

    // Label manusia untuk logging/ditampilkan ke user.
    const label = Object.values(params).filter((v) => v !== "Indonesia").join(", ");

    return {
      query: label,
      params,
      mode: "structured",
      missing,
    };
  }

  const parts = [];
  for (const key of level.needs) {
    const value = String(src[key] || "").trim();
    if (!value) continue;
    parts.push(key === "rt_rw" ? rtPart : value);
  }

  const query = parts.filter(Boolean).join(", ");
  if (!query) return null;

  return { query, params: null, mode: "text", missing };
}

// ---------------------------------------------------------------------------
// Provider: Google Maps Platform
// ---------------------------------------------------------------------------

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * Ambil level administrative dari address_components Google.
 * Hasilnya memakai key yang sama dengan Nominatim supaya perbandingan
 * wilayah cukup satu implementasi:
 *   county -> kabupaten/kota (administrative_area_level_2)
 *   state  -> provinsi        (administrative_area_level_1)
 */
function googleAddressLevels(components) {
  const out = {};
  if (!Array.isArray(components)) return out;
  for (const comp of components) {
    if (!Array.isArray(comp.types)) continue;
    const name = String(comp.long_name || comp.short_name || "").trim();
    if (!name) continue;
    if (comp.types.includes("administrative_area_level_2")) {
      out.county = name;
    } else if (comp.types.includes("administrative_area_level_1")) {
      out.state = name;
    } else if (comp.types.includes("country")) {
      out.country = name;
    }
  }
  return out;
}

async function googleSearch({ query, apiKey }) {
  const url =
    `${GOOGLE_ENDPOINT}?address=${encodeURIComponent(query)}` +
    `&region=id&language=id&components=country:ID&key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let payload;

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new GeocoderError("GEOCODER_ERROR", `Google Geocoding error ${res.status}`);
    }
    payload = await res.json();
  } catch (err) {
    if (err instanceof GeocoderError) throw err;
    if (err && err.name === "AbortError") {
      throw new GeocoderError("GEOCODER_TIMEOUT", "Google Geocoding timeout.");
    }
    throw new GeocoderError("GEOCODER_UNAVAILABLE", "Google Geocoding tidak dapat dihubungi.");
  } finally {
    clearTimeout(timeout);
  }

  const status = payload && payload.status;
  if (status === "ZERO_RESULTS") return [];
  if (status === "OVER_QUERY_LIMIT") {
    throw new GeocoderError("GEOCODER_RATE_LIMIT", "Kuota Google Geocoding habis.");
  }
  if (status !== "OK") {
    throw new GeocoderError("GEOCODER_ERROR", `Google Geocoding status ${status || "unknown"}.`);
  }

  const results = Array.isArray(payload.results) ? payload.results : [];

  return results
    .slice(0, 5)
    .map((r) => {
      const geo = r.geometry && r.geometry.location;
      if (!geo) return null;
      const coord = isValidCoordinate(geo.lat, geo.lng);
      if (!coord) return null;
      return {
        latitude: coord.latitude,
        longitude: coord.longitude,
        place_id: r.place_id || "",
        formatted_address: r.formatted_address || "",
        types: Array.isArray(r.types) ? r.types : [],
        // address_components dipecah per level supaya perbandingan wilayah
        // bisa level-aware, bukan sekadar pencarian nama di dalam string.
        address: googleAddressLevels(r.address_components),
        partial_match: !!r.partial_match,
        source: "google",
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Provider: Nominatim / OpenStreetMap
// ---------------------------------------------------------------------------

// Nominatim/Linux Hub guidelines: max 1 request/detik, User-Agent wajib,
// email contact disarankan. Kita antre di memori per proses.
let nominatimQueue = Promise.resolve();
let nominatimLastCall = 0;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

function scheduleNominatim(task) {
  const run = nominatimQueue.then(async () => {
    const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - nominatimLastCall);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    nominatimLastCall = Date.now();
    return task();
  });
  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function nominatimSearch({ query, params }) {
  const search = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    countrycodes: "id",
    "accept-language": "id",
  });

  if (params && Object.keys(params).length > 0) {
    // Query terstruktur: Nominatim mencocokkan tiap parameter ke kolomnya
    // sendiri, sehingga entitas administrative lebih Likely ketemu
    // daripada POI yang kebetulan memuat kata yang sama.
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
  } else {
    search.set("q", query);
  }

  const url = `${NOMINATIM_SEARCH}?${search.toString()}`;

  return scheduleNominatim(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let rows;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": `Northline-NPinjamScanner/1.0 (${NOMINATIM_BASE})`,
        },
        signal: controller.signal,
      });
      if (res.status === 429) {
        throw new GeocoderError("GEOCODER_RATE_LIMIT", "Nominatim membatasi laju permintaan.");
      }
      if (!res.ok) {
        throw new GeocoderError("GEOCODER_ERROR", `Nominatim error ${res.status}`);
      }
      rows = await res.json();
    } catch (err) {
      if (err instanceof GeocoderError) throw err;
      if (err && err.name === "AbortError") {
        throw new GeocoderError("GEOCODER_TIMEOUT", "Nominatim timeout.");
      }
      throw new GeocoderError("GEOCODER_UNAVAILABLE", "Nominatim tidak dapat dihubungi.");
    } finally {
      clearTimeout(timeout);
    }

    if (!Array.isArray(rows)) return [];

    return rows
      .map((r) => {
        const coord = isValidCoordinate(r.lat, r.lon);
        if (!coord) return null;
        return {
          latitude: coord.latitude,
          longitude: coord.longitude,
          place_id: r.osm_type && r.osm_id ? `${r.osm_type}:${r.osm_id}` : "",
          formatted_address: trimNominatimLabel(r.display_name),
// type saja tidak cukup untuk membedakan area administrative dari
          // POI, jadi category ikut dimasukkan (mis. "place", "amenity").
          types: [r.category, r.type].filter(Boolean),
          // Objek addresslevel-wise dari Nominatim (county = kabupaten/kota,
          // state = provinsi). Tanpa ini kita tidak bisa membedakan
          // "Sukoharjo kota di Purworejo" dari "Kabupaten Sukoharjo".
          address: r.address && typeof r.address === "object" ? r.address : {},
          partial_match: false,
          source: "nominatim",
        };
      })
      .filter(Boolean);
  });
}

// ---------------------------------------------------------------------------
// Orchestrasi
// ---------------------------------------------------------------------------

function activeProvider() {
  return isGoogleConfigured() ? "google" : "nominatim";
}

async function runProvider(name, built) {
  if (name === "google") {
    // Google selalu pakai free-text; dia sudah bagus dengan alamat lengkap.
    return googleSearch({ query: built.query, apiKey: process.env.GOOGLE_MAPS_API_KEY });
  }
  return nominatimSearch({ query: built.query, params: built.params });
}

/**
 * Geocode satu alamat yang sudah dikonfirmasi user.
 *
 * Return: {
 *   status: 'LOCATION_CONFIRMED' | 'LOCATION_REVIEW_REQUIRED' | 'LOCATION_NOT_FOUND',
 *   provider: 'google' | 'nominatim',
 *   query: string,            // query yang benar-benar menghasilkan hasil
 *   attempted_queries: string[],
 *   match_level: string,      // id level QUERY_LEVELS yang berhasil
 *   match_precision: 'street' | 'village' | 'district' | 'city' | null,
 *   primary: { latitude, longitude, place_id, formatted_address } | null,
 *   candidates: [ ... ]
 * }
 *
 * Tidak pernah mengarang koordinat: primary null kalau tidak ada hasil valid.
 */
async function geocodeAddress(address) {
  const full = buildFormattedAddress(address);
  if (!full) {
    throw new GeocoderError("ADDRESS_EMPTY", "Alamat kosong.");
  }

  // Susun level yang isinya, dari paling spesifik sampai paling umum.
  const attempts = [];
  for (const level of QUERY_LEVELS) {
    const built = buildLevelQuery(address, level);
    if (!built) continue;
    // Dedup per mode+query supaya tidak memanggil provider dua kali untuk
    // request yang identik (Nominatim membatasi 1 request/detik).
    const signature = `${built.mode}|${built.query}`;
    if (attempts.some((a) => a.signature === signature)) continue;
    attempts.push({ level, built, query: built.query, signature });
  }

  if (attempts.length === 0) {
    throw new GeocoderError("ADDRESS_EMPTY", "Alamat kosong.");
  }

  const provider = activeProvider();
  const attempted = [];

  // Try both providers: Google dulu kalau dikonfigurasi, lalu Nominatim.
  const chain = provider === "google" ? ["google", "nominatim"] : ["nominatim"];

  let lastError = null;
  let completedAny = false;
  let hit = null;
  let usedProvider = null;

  for (const name of chain) {
    for (const attempt of attempts) {
      attempted.push(`${attempt.built.mode}: ${attempt.query}`);
      try {
        const results = await runProvider(name, attempt.built);
        completedAny = true;
        if (results.length > 0) {
          hit = { results, attempt };
          usedProvider = name;
          break;
        }
      } catch (err) {
        // Rate limit / timeout: coba provider berikutnya.
        lastError = err;
        if (err && err.code === "GEOCODER_RATE_LIMIT") break;
      }
    }
    if (hit) break;
  }

  if (!hit) {
    // Tidak satu pun query selesai (jaringan mati / semua provider error)
    // -> laporkan error. Kalau semua selesai tapi kosong -> NOT_FOUND.
    if (!completedAny && lastError) {
      throw lastError;
    }
    return {
      status: "LOCATION_NOT_FOUND",
      provider,
      query: full,
      attempted_queries: attempted,
      match_level: null,
      match_precision: null,
      primary: null,
      candidates: [],
    };
  }

  const matchedQuery = hit.attempt.query;
  // Precisi efektif, bukan sekadar yang dideklarasikan level. Lihat
  // availablePrecision(): level 'street' dengan alamat kosong harus melorot.
  const matchedPrecision = effectivePrecision(hit.attempt.level, address);
  const requestedPrecision = hit.attempt.level.precision;
  const result = finalizeCandidates(
    usedProvider,
    matchedQuery,
    hit.results,
    address,
    hit.attempt.level.precision
  );
  result.provider = usedProvider;
  result.attempted_queries = attempted;
  result.match_level = hit.attempt.level.id;
  result.match_precision = matchedPrecision;
  result.requested_precision = requestedPrecision;
  result.full_address = full;
  // Provider mengembalikan lokasi yang jelas di wilayah lain. Ini dijawab sebagai
  // "tidak ditemukan" + penjelasan, bukan diam-diam memakai koordinat itu.
  if (result.region_mismatch) {
    const wanted = [regionLabel(region.kabupaten_kota), regionLabel(region.provinsi)]
      .filter(Boolean)
      .join(", ");
    result.message =
      `Lokasi tidak ditemukan di wilayah ${wanted}. ` +
      "Penyedia peta hanya menemukan nama yang sama di wilayah lain, " +
      "jadi koordinat sengaja tidak ditampilkan. Periksa kembali kabupaten/kota dan provinsi.";
  }

  // Precision di bawah "street" berarti koordinat yang dapat adalah pusat
  // desa/kecamatan/kota, bukan lokasi persis alamat. User harus mengetahuinya
  // supaya tidak mengira marker-nya tepat di depanumahnya.
  // Tidak berlaku kalau tidak ada lokasi sama sekali (mis. wilayah tidak cocok).
  if (result.primary && !PRECISION_CONFIRMABLE.has(matchedPrecision)) {
    result.precision_warning =
      `Hasil geocoding hanya mencapai tingkat ${matchedPrecision} ` +
      "(pusat desa/kecamatan/kota), bukan titik persis alamat. " +
      "Geser marker atau pilih kandidat yang sesuai.";
    if (result.status === "LOCATION_CONFIRMED") {
      result.status = "LOCATION_REVIEW_REQUIRED";
    }
  }

  return result;
}

// Nominatim sering mengembalikan POI (sekolah, toko, kantor) sebagai hasil
// teratas. Untuk alamat ini kita lebih membutuhkan area administratif, jadi
// kandidat POI diturunkan urutannya - bukan dibuang, karena user tetap boleh
// memilihnya.
const ADMIN_TYPES = new Set([
  "administrative",
  "boundary",
  "city",
  "town",
  "village",
  "hamlet",
  "suburb",
  "neighbourhood",
  "quarter",
  "city_district",
  "county",
  "state",
  "region",
  "province",
]);

function adminScore(types) {
  if (!Array.isArray(types) || types.length === 0) return 1;
  let score = 0;
  for (const type of types) {
    const key = String(type).toLowerCase();
    if (ADMIN_TYPES.has(key)) score += 2;
    else if (/^(amenity|shop|building|tourism|leisure|office|healthcare)$/.test(key)) score -= 1;
  }
  return score;
}

/**
 * Presisi yang sebenarnya direpresentasikan oleh satu kandidat, diturunkan dari
 * tipe OSM/Google yang dikembalikan provider - bukan dari level query. Level
 * query hanya batas atas (ceiling), bukan jaminan.
 */
function candidatePrecision(types) {
  const set = new Set((Array.isArray(types) ? types : []).map((t) => String(t).toLowerCase()));
  const has = (...names) => names.some((n) => set.has(n));

  if (has("road", "street", "pedestrian", "footway", "residential", "highway", "lane")) {
    return "street";
  }
  if (has("village", "hamlet", "suburb", "neighbourhood", "quarter")) return "village";
  if (has("city_district", "county", "district")) return "district";
  if (has("city", "town", "municipality", "administrative")) return "city";
  return "city";
}

/**
 * Ranking + guard akhir untuk sekumpulan kandidat dari provider.
 *
 * params:
 *   - provider    : nama provider aktif
 *   - query       : query yang menghasilkan kandidat ini
 *   - candidates  : kandidat mentah dari provider
 *   - address     : alamat yang diminta user (untuk cek konsistensi wilayah)
 *   - maxPrecision: batas atas presisi dari level query
 */
function finalizeCandidates(provider, query, candidates, address, maxPrecision) {
  const region = requestedRegion(address);
  const cap = PRECISION_RANK[maxPrecision] ?? PRECISION_RANK.city;

  const scored = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && isValidCoordinate(c.latitude, c.longitude))
    .map((c, index) => {
      const regionMatch = candidateRegionMatch(c, region);
      let precision = PRECISION_RANK[candidatePrecision(c.types)] ?? 0;
      if (precision > cap) precision = cap;
      return {
        item: c,
        index,
        adminScore: adminScore(c.types),
        regionMatch,
        precision: Object.keys(PRECISION_RANK).find((k) => PRECISION_RANK[k] === precision),
      };
    })
    // Kandidat yang wilayahnya jelas-jelas berbeda diturunkan ke bawah. Kalau
    // tidak ada satupun yang cocok, hasilnya justru LOCATION_NOT_FOUND di bawah.
    .sort((a, b) => {
      const regionDiff = rankRegion(b.regionMatch) - rankRegion(a.regionMatch);
      if (regionDiff !== 0) return regionDiff;
      const scoreDiff = b.adminScore - a.adminScore;
      if (scoreDiff !== 0) return scoreDiff;
      // Stabil: urutan asli tetap dipertahankan untuk nilai score yang sama.
      return a.index - b.index;
    })
    .map((entry) => entry);

  if (scored.length === 0) {
    return {
      status: "LOCATION_NOT_FOUND",
      provider,
      query,
      primary: null,
      candidates: [],
      region_mismatch: false,
    };
  }

  // Kalau SEMUA kandidat ada di wilayah lain, lebih baik bilang tidak ditemukan
  // daripada mengembalikan koordinat kabupaten yang keliru. Admin lebih mudah
  // memperbaiki alamatnya daripada unknowingly memakai lokasi yang salah.
  const confirmed = scored.filter((s) => s.regionMatch === false);
  if (confirmed.length === scored.length) {
    return {
      status: "LOCATION_NOT_FOUND",
      provider,
      query,
      primary: null,
      candidates: [],
      region_mismatch: true,
      region_mismatch_detail: {
        requested_kabupaten_kota: region.kabupaten_kota || null,
        requested_provinsi: region.provinsi || null,
        returned: scored.slice(0, 3).map((s) => s.item.formatted_address || null),
      },
    };
  }

  // Hanya kandidat yang wilayahnya cocok atau tidak bisa dipastikan yang
  // boleh ditawarkan sebagai pilihan user.
  const usable = scored.filter((s) => s.regionMatch !== false);

  // Kelompokkan kandidat yang dekat satu sama lain. Sisa kandidat teratas yang
  // benar-benar berbeda lokasi-lokasinya-lah yang membuat hasil ambigu.
  const groups = [];
  for (const entry of usable) {
    const existing = groups.find(
      (g) => distanceMeters(g.center, entry.item) <= AMBIGUITY_DISTANCE_M
    );
    if (existing) {
      existing.members.push(entry);
    } else {
      groups.push({ center: entry.item, members: [entry] });
    }
  }

  const primaryEntry = groups[0].members[0];
  const primary = primaryEntry.item;

  let status = "LOCATION_CONFIRMED";
  if (groups.length > 1) {
    status = "LOCATION_REVIEW_REQUIRED";
  } else if (primary.partial_match) {
    // Google menandai hanya sebagian komponen yang cocok -> jangan otomatis lolos.
    status = "LOCATION_REVIEW_REQUIRED";
  }

  const shape = (entry) => ({
    latitude: entry.item.latitude,
    longitude: entry.item.longitude,
    place_id: entry.item.place_id,
    formatted_address: entry.item.formatted_address,
    types: entry.item.types || [],
    source: entry.item.source || provider,
    admin_score: entry.adminScore,
    match_precision: entry.precision,
    region_match: entry.regionMatch,
  });

  return {
    status,
    provider,
    query,
    primary: shape(primaryEntry),
    candidates: groups.map((g) => shape(g.members[0])),
    region_mismatch: false,
  };
}

module.exports = {
  GeocoderError,
  AMBIGUITY_DISTANCE_M,
  activeProvider,
  buildFormattedAddress,
  candidatePrecision,
  distanceMeters,
  geocodeAddress,
  finalizeCandidates,
  isGoogleConfigured,
  regionLabel,
  requestedRegion,
  trimNominatimLabel,
};