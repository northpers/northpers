(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NorthlineShipping = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var ORIGIN = {
    province: "Jawa Barat",
    city: "Karawang",
  };

  var ZONES = {
    karawang: { id: "karawang", label: "Karawang (Lokal)", fee: 10000 },
    jabodetabek: { id: "jabodetabek", label: "Jabodetabek", fee: 15000 },
    jawa: { id: "jawa", label: "Pulau Jawa", fee: 18000 },
    sumatera: { id: "sumatera", label: "Sumatera", fee: 20000 },
    bali_ntt: { id: "bali_ntt", label: "Bali & Nusa Tenggara", fee: 20000 },
    kalimantan: { id: "kalimantan", label: "Kalimantan", fee: 25000 },
    sulawesi: { id: "sulawesi", label: "Sulawesi", fee: 25000 },
    maluku_papua: { id: "maluku_papua", label: "Maluku & Papua", fee: 35000 },
  };

  var PROVINCE_ZONE = {
    "aceh": "sumatera",
    "sumatera utara": "sumatera",
    "sumatera barat": "sumatera",
    "riau": "sumatera",
    "kepulauan riau": "sumatera",
    "jambi": "sumatera",
    "bengkulu": "sumatera",
    "sumatera selatan": "sumatera",
    "lampung": "sumatera",
    "kepulauan bangka belitung": "sumatera",
    "dki jakarta": "jabodetabek",
    "jakarta": "jabodetabek",
    "jawa barat": "jawa",
    "banten": "jawa",
    "jawa tengah": "jawa",
    "di yogyakarta": "jawa",
    "yogyakarta": "jawa",
    "jawa timur": "jawa",
    "bali": "bali_ntt",
    "nusa tenggara barat": "bali_ntt",
    "nusa tenggara timur": "bali_ntt",
    "kalimantan barat": "kalimantan",
    "kalimantan tengah": "kalimantan",
    "kalimantan selatan": "kalimantan",
    "kalimantan timur": "kalimantan",
    "kalimantan utara": "kalimantan",
    "sulawesi utara": "sulawesi",
    "gorontalo": "sulawesi",
    "sulawesi tengah": "sulawesi",
    "sulawesi barat": "sulawesi",
    "sulawesi selatan": "sulawesi",
    "sulawesi tenggara": "sulawesi",
    "maluku": "maluku_papua",
    "maluku utara": "maluku_papua",
    "papua": "maluku_papua",
    "papua barat": "maluku_papua",
  };

  var JABODETABEK_CITIES = ["jakarta", "bogor", "depok", "tangerang", "bekasi"];

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/^(kota|kabupaten|kab\.|kota administrasi|provinsi)\s+/g, "")
      .trim();
  }

  function parseAddress(address) {
    var clean = String(address || "").split(" @Coordinates:")[0];
    var parts = clean.split(" | ");
    return {
      detail: parts[0] || "",
      kecamatan: parts[1] || "",
      kota: parts[2] || "",
      provinsi: parts[3] || "",
      kodepos: parts[4] || "",
    };
  }

  function detectZone(address) {
    var a = parseAddress(address);
    var kota = normalize(a.kota);
    var provinsi = normalize(a.provinsi);

    if (!kota && !provinsi) {
      return { zone: null, reason: "Alamat tidak dikenali" };
    }

    if (provinsi === "jawa barat" && kota.indexOf("karawang") !== -1) {
      return { zone: ZONES.karawang };
    }
    if (JABODETABEK_CITIES.some(function (c) { return kota.indexOf(c) !== -1; })) {
      return { zone: ZONES.jabodetabek };
    }
    var zid = PROVINCE_ZONE[provinsi];
    if (zid) {
      return { zone: ZONES[zid] };
    }
    return {
      zone: null,
      international: true,
      reason: "Pengiriman ke luar Indonesia belum tersedia",
    };
  }

  function getQuote(address) {
    var det = detectZone(address);
    if (!det.zone) {
      return {
        success: false,
        canShip: false,
        international: !!det.international,
        reason: det.reason || "Alamat tidak dikenali",
        zone: null,
        fee: 0,
        label: "",
      };
    }
    return {
      success: true,
      canShip: true,
      international: false,
      reason: null,
      zone: det.zone.id,
      label: det.zone.label,
      fee: det.zone.fee,
      origin: ORIGIN,
    };
  }

  return {
    ORIGIN: ORIGIN,
    ZONES: ZONES,
    parseAddress: parseAddress,
    detectZone: detectZone,
    getQuote: getQuote,
  };
});
