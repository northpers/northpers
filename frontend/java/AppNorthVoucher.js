(function () {
  'use strict';

  var _vcPending = 0;

  function showDataLoader() {
    _vcPending++;
    var el = document.getElementById('vc-data-loader');
    if (el) el.classList.remove('hidden');
  }

  function hideDataLoader() {
    _vcPending = Math.max(0, _vcPending - 1);
    if (_vcPending === 0) {
      var el = document.getElementById('vc-data-loader');
      if (el) el.classList.add('hidden');
    }
  }

  var VOUCHER_IMAGE = '/public/image/file_000000003c1881fab7655f4a8369bf5v - Diedit.webp';

  function isLoggedIn() {
    var cookies = document.cookie.split(';');
    return cookies.some(function (c) { return c.trim().startsWith('logged_in='); }) || cookies.some(function (c) { return c.trim().startsWith('nl_jwt='); });
  }

  window.isLoggedIn = isLoggedIn;

  function apiGet(endpoint) {
    return fetch(endpoint, { credentials: 'include' }).then(function (r) {
      if (r.status === 401) return { success: false, unauthorized: true };
      return r.json();
    });
  }

  function apiPost(endpoint, body) {
    return fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) {
      if (r.status === 401) return { success: false, unauthorized: true };
      return r.json();
    });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function expiryText(v) {
    if (v.expiryDay == null) return 'Berlaku tanpa batas';
    return 'Berlaku sampai ' + pad(v.expiryDay) + '/' + pad(v.expiryMonth) + '/' + v.expiryYear;
  }

  function requirementText(v) {
    var parts = [];
    if (v.minQty && v.minQty > 1) parts.push('Min. pembelian ' + v.minQty + ' produk');
    if (v.minPurchase && v.minPurchase > 0) parts.push('Min. belanja Rp ' + Number(v.minPurchase).toLocaleString('id-ID'));
    return parts.join(' • ');
  }

  function claimWindowText(v) {
    return '';
  }

  function categoryBadge(v) {
    if (v.category === 'northpay') {
      return '<span class="vc-badge">NorthPay</span>';
    }
    if (v.category === 'npinjam') {
      return '<span class="vc-badge">NPinjam</span>';
    }
    return '';
  }

  function toast(message) {
    var el = document.getElementById('vc-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  function cardShell(v, image, right) {
    return '<div class="vc-card">' +
      '<img src="' + VOUCHER_IMAGE + '" alt="voucher" style="width:84px;height:70px;object-fit:contain;flex-shrink:0;background:#fff;">' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:14px;font-weight:700;color:#1f2937;margin-bottom:2px;">' + v.label + '</div>' +
        '<div style="font-size:11px;color:#6b7280;margin-bottom:2px;">' + (v.desc || '') + '</div>' +
        (requirementText(v) ? '<div style="font-size:10px;color:#9CA3AF;margin-bottom:4px;">' + requirementText(v) + '</div>' : '') +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' + categoryBadge(v) + '</div>' +
        '<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">' + expiryText(v) + '</div>' +
      '</div>' +
      '<div style="flex-shrink:0;text-align:center;">' + right + '</div>' +
    '</div>';
  }

  function claimButton(v) {
    if (v.expired) return '<button class="vc-btn" disabled>KADALUARSA</button>';
    if (!v.claimRequired) return '<span class="vc-badge" style="border-color:#9CA3AF;color:#9CA3AF;">OTOMATIS</span>';
    if (v.claimStatus === 'used') return '<button class="vc-btn" disabled>TERPAKAI</button>';
    if (v.claimed) return '<button class="vc-btn" disabled>DIKLAIM</button>';
    if (v.claimable === false) {
      return '<button class="vc-btn" disabled>KLAIM</button>';
    }
    return '<button class="vc-btn" onclick="VoucherCenter.claim(\'' + v.code + '\')">KLAIM</button>';
  }

  function mineButton(v) {
    if (!v.claimRequired) return '<span class="vc-badge" style="border-color:#9CA3AF;color:#9CA3AF;">OTOMATIS</span>';
    if (v.claimStatus === 'used') return '<button class="vc-btn" disabled>TERPAKAI</button>';
    if (v.claimStatus === 'expired' || v.expired) return '<button class="vc-btn" disabled>KADALUARSA</button>';
    return '<button class="vc-btn" disabled>DIKLAIM</button>';
  }

  var FREE_SHIPPING_DEFAULT = {
    code: 'free_shipping',
    label: 'Gratis Ongkir',
    desc: 'Bebas biaya kirim untuk semua produk Northline',
    claimRequired: false,
    group: 'free',
    productCategories: [],
  };

  var SECTION_DEFS = [
    { cat: 'shortsleeve', title: 'Voucher Tshirt' },
    { cat: 'hoodie', title: 'Voucher Hoodie' },
    { cat: 'workshirt', title: 'Voucher Workshirt' },
    { cat: null, title: 'Voucher Lainnya' },
  ];

  function renderAvailable(list) {
    var el = document.getElementById('vc-available');
    if (!list || list.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:60px 24px;color:#9CA3AF;font-size:12px;">Belum ada voucher tersedia</div>';
      return;
    }
    var html = '';
    SECTION_DEFS.forEach(function (sec) {
      var vouchers = list.filter(function (v) {
        if (sec.cat === null) return !v.productCategories || v.productCategories.length === 0;
        return v.productCategories && v.productCategories.indexOf(sec.cat) !== -1;
      });
      if (vouchers.length === 0) return;
      html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.5px;text-transform:uppercase;padding:12px 4px 6px;">' + sec.title + '</div>';
      html += vouchers.map(function (v) {
        return cardShell(v, VOUCHER_IMAGE, claimButton(v));
      }).join('');
    });
    el.innerHTML = html;
  }

  function renderMine(list) {
    var el = document.getElementById('vc-mine');
    var mine = (list || []).filter(function (v) { return v.claimStatus !== 'used'; });
    if (mine.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = mine.map(function (v) {
      var extra = v.claimedAt ? '<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">Diklaim ' + formatDate(v.claimedAt) + '</div>' : '';
      return cardShell(v, VOUCHER_IMAGE, mineButton(v)).replace('</div>', extra + '</div>');
    }).join('');
  }

  window.VoucherCenter = {
    state: {
      available: [],
      mine: [],
      flags: {},
      tab: 'available',
    },

    showGuest: function () {
      var guest = document.getElementById('vc-page-guest');
      var main = document.getElementById('vc-page-main');
      if (guest) guest.classList.remove('hidden');
      if (main) main.classList.add('hidden');
    },

    showMain: function () {
      var guest = document.getElementById('vc-page-guest');
      var main = document.getElementById('vc-page-main');
      if (guest) guest.classList.add('hidden');
      if (main) main.classList.remove('hidden');
    },

    init: function () {
      var self = this;
      showDataLoader();
      if (typeof isLoggedIn === 'function' && isLoggedIn()) {
        self.showMain();
      }
      this.applyTabDisplay(this.state.tab);
      this.loadAvailable();
      this.loadMine();
    },

    applyTabDisplay: function (name) {
      var av = document.getElementById('vc-available');
      var mine = document.getElementById('vc-mine');
      if (av) av.style.display = (name === 'available') ? 'flex' : 'none';
      if (mine) mine.style.display = (name === 'mine') ? 'flex' : 'none';
    },

    loadAvailable: function () {
      var self = this;
      apiGet('/api/vouchers').then(function (data) {
        if (data.unauthorized) {
          self.showGuest();
          hideDataLoader();
          return;
        }
        if (data.success) {
          self.showMain();
          self.state.available = data.vouchers || [];
          self.state.flags = data.flags || {};
          if (self.state.tab === 'available') renderAvailable(self.state.available);
        }
        hideDataLoader();
      }).catch(function () {
        renderAvailable([]);
        hideDataLoader();
      });
    },

    loadMine: function () {
      var self = this;
      apiGet('/api/vouchers/my').then(function (data) {
        if (data.unauthorized) {
          self.showGuest();
          hideDataLoader();
          return;
        }
        if (data.success) {
          var mine = data.vouchers || [];
          var free = (self.state.available || []).find(function (v) { return v.code === 'free_shipping'; }) || FREE_SHIPPING_DEFAULT;
          self.state.mine = [free].concat(mine.filter(function (v) { return v.code !== 'free_shipping'; }));
          if (self.state.tab === 'mine') renderMine(self.state.mine);
        }
        hideDataLoader();
      }).catch(function () {
        if (self.state.tab === 'mine') renderMine([]);
        hideDataLoader();
      });
    },

    switchTab: function (name) {
      this.state.tab = name;
      document.getElementById('vc-tab-available').classList.toggle('active', name === 'available');
      document.getElementById('vc-tab-mine').classList.toggle('active', name === 'mine');
      this.applyTabDisplay(name);
      if (name === 'mine') {
        var mine = document.getElementById('vc-mine');
        if (mine) mine.innerHTML = '';
        this.loadMine();
      }
    },

    claim: function (code) {
      var self = this;
      var voucher = (this.state.available || []).find(function (v) { return v.code === code; });
      if (voucher && voucher.claimable === false) {
        toast(voucher.claimableMessage || 'Voucher belum bisa diklaim');
        return;
      }
      if (voucher && !voucher.eligible) {
        toast(voucher.category === 'northpay' ? 'Aktifkan NorthPay dulu untuk klaim voucher ini' : 'Aktifkan NPinjam dulu untuk klaim voucher ini');
        return;
      }
      apiPost('/api/vouchers/claim/' + encodeURIComponent(code)).then(function (data) {
        if (data.success) {
          toast('Voucher berhasil diklaim');
          self.loadAvailable();
          self.loadMine();
        } else {
          toast(data.message || 'Gagal klaim voucher');
        }
      }).catch(function () {
        toast('Gagal klaim voucher');
      });
    },
  };
})();
