function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

async function getPaymentCsrfToken() {
  try {
    const saved = localStorage.getItem(window.STORAGE_KEYS && window.STORAGE_KEYS.CSRF_TOKEN);
    if (saved) return saved;
    const res = await fetch(_d('9kzs9m}|p7~yuox'), { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.csrfToken) {
      if (window.STORAGE_KEYS) localStorage.setItem(window.STORAGE_KEYS.CSRF_TOKEN, data.csrfToken);
      return data.csrfToken;
    }
  } catch (e) { console.error('CSRF fetch error:', e); }
  return null;
}


const PAYMENT_ORIGINAL_TITLE = document.title;

function paymentHeader() {
  return `
    <div class="flex items-center gap-3 px-4 h-[52px] bg-white border-b border-gray-100 shrink-0">
      <button id="close-modal" class="border-0 bg-none p-0 cursor-pointer flex items-center justify-center w-8 h-8 -ml-1">
        <img src="https://img.icons8.com/?size=100&id=85459&format=png&color=DF414F" class="w-5 h-5" alt="Back">
      </button>
      <h1 class="text-[15px] font-medium text-gray-800">Northline Payment</h1>
    </div>
  `;
}

window.bukaModalPembayaran = async (data) => {
  const mode = data.mode || 'order';
  const existingOverlay = document.getElementById('payment-modal-overlay');
  if (existingOverlay) existingOverlay.remove();

  const qrPreload = new Image();
  qrPreload.src = "https://nl.hostinesia.my.id/public/image/file_000000003c1881fab7655f4a8369bf5cqr.png";
  document.title = mode === 'topup' ? 'Top Up - Northline Payment' : 'Payment | Northline';
  history.replaceState({ payment: mode }, '', `?payment=${mode}`);

  const overlay = document.createElement('div');
  overlay.id = 'payment-modal-overlay';
  overlay.className = 'fixed inset-0 z-[9999] bg-white flex';

  const modal = document.createElement('div');
  modal.className = 'w-full h-full flex flex-col bg-white';

  if (mode === 'topup') {
    showTopupQRIS(data, overlay, modal);
  } else {
    showPaymentMethodScreen(data, overlay, modal);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function closePayment() {
    document.title = PAYMENT_ORIGINAL_TITLE;
    history.pushState({}, '', window.location.pathname);
    window.removeEventListener('popstate', popstateHandler);
    overlay.remove();
  }

  const popstateHandler = () => {
    if (!document.getElementById('payment-modal-overlay')) return;
    document.title = PAYMENT_ORIGINAL_TITLE;
  };
  window.addEventListener('popstate', popstateHandler);

  if (mode !== 'topup') {
    const closeBtn = document.getElementById('close-modal');
    if (closeBtn) closeBtn.onclick = closePayment;
  }

  overlay.onclick = (e) => {
    if (e.target === overlay) closePayment();
  };
};

function showTopupQRIS(data, overlay, modal) {
  const amount = data.amount;
  const adminFee = 1000;
  const total = amount + adminFee;
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);

  document.title = 'Scan QRIS - Top Up NorthPay';
  history.replaceState({ payment: 'topup', qris: true }, '', '?payment=topup&qris=1');

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto">
      <div class="px-4 pt-6 pb-4 text-center">
        <h2 class="text-[17px] font-bold text-gray-800">Top Up Saldo NorthPay</h2>
        <p class="text-[13px] text-gray-500 mt-1">Transfer QRIS untuk menambahkan saldo</p>
      </div>

      <div class="mx-4 mb-4 bg-gray-50 border border-gray-100 p-4">
        <div class="space-y-2 text-[13px]">
          <div class="flex justify-between">
            <span class="text-gray-500">Nominal Top Up</span>
            <span class="font-medium text-gray-800">Rp ${fmt(amount)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Biaya Admin</span>
            <span class="font-medium text-gray-800">Rp ${fmt(adminFee)}</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-gray-200">
            <span class="text-gray-700 font-semibold">Total Dibayar</span>
            <span class="text-[16px] font-bold text-[#DF414F]">Rp ${fmt(total)}</span>
          </div>
        </div>
      </div>

      <div class="mx-4 mb-4 bg-white border border-gray-100 p-5 text-center">
        <h3 class="text-[13px] font-semibold text-gray-700 mb-1">Scan QRIS</h3>
        <p class="text-[11px] text-gray-400 mb-4">Gunakan Dana, OVO, Gopay, ShopeePay,<br>M-Banking atau aplikasi pembayaran lainnya</p>
        <div class="bg-gray-50 border border-gray-100 py-3 mb-4">
          <p class="text-[10px] text-gray-400 uppercase tracking-wide">Pembayaran Berakhir Dalam</p>
          <div id="topup-timer" class="text-[26px] font-bold text-gray-700 tracking-wider mt-1">10:00</div>
        </div>
        <img src="https://nl.hostinesia.my.id/public/image/file_000000003c1881fab7655f4a8369bf5cqr.png"
          class="w-[280px] h-[280px] mx-auto object-contain mb-4" >
        <div class="grid grid-cols-2 gap-3">
          <a href="https://nl.hostinesia.my.id/public/image/file_000000003c1881fab7655f4a8369bf5cqr.png"
            download="Northline-QRIS.jpeg"
            class="h-[35px] border border-gray-200 flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition">
            Download
          </a>
          <button id="btn-batal-topup"
            class="h-[35px] bg-[#DF414F] hover:bg-[#df414ede] flex items-center justify-center gap-2 text-[12px] font-semibold text-white transition">
            Batalkan
          </button>
        </div>
      </div>

      <div class="mx-4 mb-6 bg-gray-50 border border-gray-100 p-4">
        <div class="flex items-start gap-3">
          <img src="https://img.icons8.com/?size=100&id=77&format=png&color=000000" class="w-4 h-4 mt-0.5">
          <div>
            <h4 class="text-[12px] font-medium text-gray-700 mb-2">Informasi Pembayaran</h4>
            <ul class="space-y-1.5 text-[12px] text-gray-500 leading-5">
              <li class="flex items-start gap-1.5">Scan QRIS menggunakan aplikasi e-wallet / mobile banking</li>
              <li class="flex items-start gap-1.5">Pastikan nominal <strong>Rp ${fmt(total)}</strong> sudah sesuai</li>
              <li class="flex items-start gap-1.5">QRIS berlaku selama 10 menit</li>
              <li class="flex items-start gap-1.5">Saldo akan masuk otomatis setelah pembayaran dikonfirmasi</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="text-center pb-6">
        <p class="text-[10px] text-gray-400">Diawasi oleh Bank Indonesia</p>
      </div>
    </div>
  `;

  let timeLeft = 600;
  const timerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timerEl = document.getElementById('topup-timer');
    if (timerEl) timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      overlay.remove();
    }
  }, 1000);

  const requestId = data.requestId;

  // Poll for top-up request status
  let pollInterval = null;
  async function pollTopupStatus() {
    if (!requestId) return;
    try {
      const res = await fetch(_d('9kzs9xy|~rzk$9|o{ o}~9') + requestId, { credentials: 'include' });
      const d = await res.json();
      if (d.success && d.request && d.request.status === 'success') {
        clearInterval(timerInterval);
        clearInterval(pollInterval);
        showTopupSuccessPage(d.request, overlay, modal);
      }
    } catch (e) {
      console.error('Poll topup status error:', e);
    }
  }
  pollInterval = setInterval(pollTopupStatus, 3000);
  pollTopupStatus(); // initial check

  async function cancelTopup() {
    if (requestId) {
      try {
        await fetch(_d('9kzs9xy|~rzk$9mkxmov'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId })
        });
      } catch (e) {
        console.error('Cancel error:', e);
      }
    }
  }

  async function handleTopupClose() {
    clearInterval(timerInterval);
    await cancelTopup();
    document.title = PAYMENT_ORIGINAL_TITLE;
    history.pushState({}, '', window.location.pathname);
    overlay.remove();
  }

  modal.querySelector('#btn-batal-topup').onclick = handleTopupClose;

  const closeBtn = modal.querySelector('#close-modal');
  if (closeBtn) closeBtn.onclick = handleTopupClose;

  window.addEventListener('popstate', () => {
    if (document.getElementById('payment-modal-overlay')) {
      handleTopupClose();
    }
  }, { once: true });
}

function showTopupSuccessPage(request, overlay, modal) {
  document.title = 'Top Up Berhasil - Northline';
  history.replaceState({ payment: 'success', requestId: request.id }, '', `?payment=success&topup=${request.id}`);

  const formatRp = new Intl.NumberFormat('id-ID').format(request.amount);
  const formatDate = new Date(request.created_at).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const invoiceNumber = 'INV-NP-' + request.id.toString().padStart(6, '0');
  const userName = request.user_name || '-';

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto bg-gray-50">
      <div class="bg-gradient-to-b from-gray-200 to-gray-50 px-6 pt-10 pb-16 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-10"></div>
        <div class="relative z-10 flex flex-col items-center text-center">
          <div class="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg mb-4">
            <img src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=DF414F" class="w-12 h-12" />
          </div>
          <h1 class="text-black text-[22px] font-bold">Pembayaran Berhasil</h1>
          <p class="text-black text-[13px]">Top-up NorthPay berhasil dikonfirmasi</p>
        </div>
      </div>

      <div class="px-4 -mt-10 relative z-20">
        <div class="bg-white shadow-sm p-5 border border-gray-100">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <p class="text-[12px] text-gray-400">TOP-UP ID</p>
              <h2 class="text-[14px] font-bold text-gray-800 mt-1">${request.id}</h2>
            </div>
            <div class="bg-gray-50 text-gray-500 px-3 py-1 text-[11px] font-semibold">SUCCESS</div>
          </div>
          <div class="py-4 border-b">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-[12px] text-gray-400">Invoice</p>
                <h3 class="text-[13px] font-semibold text-gray-800 mt-1">${invoiceNumber}</h3>
              </div>
              <div class="text-right">
                <p class="text-[12px] text-gray-400">User</p>
                <p class="text-[13px] font-medium text-gray-800 mt-1">${userName}</p>
              </div>
            </div>
          </div>
          <div class="py-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Tanggal</span>
              <span class="text-[13px] font-medium text-gray-700">${formatDate}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Metode</span>
              <span class="text-[13px] font-medium text-gray-700">QRIS</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Jumlah Top-Up</span>
              <span class="text-[13px] font-medium text-gray-700">Rp ${formatRp}</span>
            </div>
            <div class="flex items-center justify-between pt-3 border-t">
              <span class="text-[14px] font-semibold text-gray-800">Total</span>
              <span class="text-[18px] font-bold text-gray-700">Rp ${formatRp}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 bg-white shadow-sm p-4 border border-gray-100">
          <h3 class="text-[13px] font-semibold text-gray-700 mb-3">Bagikan Invoice</h3>
          <div class="flex items-center justify-center gap-6">
            <button class="share-btn flex flex-col items-center gap-1" data-platform="share">
              <img src="https://img.icons8.com/?size=100&id=82713&format=png&color=000000" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Share</span>
            </button>
            <button class="share-btn flex flex-col items-center gap-1" data-platform="copy">
              <img src="https://img.icons8.com/?size=100&id=59773&format=png&color=000000" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Copy</span>
            </button>
            <button class="share-btn flex flex-col items-center gap-1" data-platform="download">
              <img src="https://img.icons8.com/?size=100&id=83159&format=png&color=000000" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Unduh PNG</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 bg-white border-t border-gray-200 shrink-0">
      <button id="close-topup-success"
        class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
        Kembali
      </button>
    </div>
  `;

  modal.querySelector('#close-topup-success').onclick = () => {
    document.title = PAYMENT_ORIGINAL_TITLE;
    history.pushState({}, '', window.location.pathname);
    overlay.remove();
  };

  modal.querySelectorAll('.share-btn').forEach(btn => {
    btn.onclick = () => handleTopupShare(btn, { invoiceNumber, userName, amount: request.amount, formatRp: new Intl.NumberFormat('id-ID').format(request.amount) });
  });
}

window.showNorthpayTransferSuccess = function(data) {
  document.title = 'Transfer Berhasil - Northline';

  const fmt = n => new Intl.NumberFormat('id-ID').format(n);
  const now = new Date();
  const pad = (n, d) => String(n).padStart(d, '0');
  const dd = pad(now.getDate(), 2);
  const mm = pad(now.getMonth() + 1, 2);
  const yyyy = now.getFullYear();
  const hh = pad(now.getHours(), 2);
  const min = pad(now.getMinutes(), 2);
  const uid = data.userId || '';
  const tid = data.transferId || '';
  const invoiceNumber = 'NL:' + dd + mm + yyyy + uid + 'tf' + tid + hh + min;
  const formatDate = now.toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const overlay = document.createElement('div');
  overlay.id = 'payment-modal-overlay';
  overlay.className = 'fixed inset-0 z-[9999] bg-white flex';

  const modal = document.createElement('div');
  modal.className = 'w-full h-full flex flex-col bg-white';

  modal.innerHTML = `
    <div class="flex items-center gap-3 px-4 h-[52px] bg-white border-b border-gray-100 shrink-0">
      <h1 class="text-[15px] font-medium text-gray-800">Transfer NorthPay</h1>
    </div>

    <div class="flex-1 overflow-y-auto bg-white">
      <div class="px-6 pt-10 pb-16 relative overflow-hidden bg-white">
        <div class="relative z-10 flex flex-col items-center text-center">
          <div class="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center shadow-lg mb-4">
            <img src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=111827" class="w-12 h-12" />
          </div>
          <h1 class="text-gray-900 text-[22px] font-bold">Transfer Berhasil</h1>
          <p class="text-gray-500 text-[13px]">Dana berhasil dikirim ke penerima</p>
        </div>
      </div>

      <div class="px-4 -mt-10 relative z-20">
        <div class="bg-white shadow-sm p-5 border border-gray-200">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <p class="text-[12px] text-gray-400">TRANSFER ID</p>
              <h2 class="text-[14px] font-bold text-gray-800 mt-1">${escapeHtml(invoiceNumber)}</h2>
            </div>
            <div class="bg-gray-100 text-gray-600 px-3 py-1 text-[11px] font-semibold">${escapeHtml(data.status || 'SUCCESS')}</div>
          </div>
          <div class="py-4 border-b">
            <div class="flex gap-3 items-center">
              <div class="w-14 h-14 bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                <img src="${escapeHtml(data.methodLogo || '')}" class="w-full h-full object-contain p-1" onerror="this.src='https://img.icons8.com/?size=100&id=10049&format=png&color=737373'" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-[14px] font-bold text-gray-800">${escapeHtml(data.methodName)}</h3>
                <p class="text-[12px] text-gray-500 mt-0.5">${escapeHtml(data.accountNumber)}</p>
              </div>
            </div>
          </div>
          <div class="py-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Nama Penerima</span>
              <span class="text-[13px] font-medium text-gray-700 truncate ml-3">${escapeHtml(data.accountName)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Tanggal</span>
              <span class="text-[13px] font-medium text-gray-700">${formatDate}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Nominal Transfer</span>
              <span class="text-[13px] font-medium text-gray-700">Rp ${fmt(data.amount)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Biaya Admin</span>
              <span class="text-[13px] font-medium text-gray-700">Rp ${fmt(data.adminFee)}</span>
            </div>
            <div class="flex items-center justify-between pt-3 border-t border-gray-200">
              <span class="text-[14px] font-semibold text-gray-800">Total</span>
              <span class="text-[18px] font-bold text-gray-900">Rp ${fmt(data.total)}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 bg-white shadow-sm p-4 border border-gray-200">
          <h3 class="text-[13px] font-semibold text-gray-700 mb-3">Bagikan Bukti Transfer</h3>
          <div class="flex items-center justify-center gap-6">
            <button class="share-btn flex flex-col items-center gap-1" data-platform="share">
              <img src="https://img.icons8.com/?size=100&id=82713&format=png&color=111827" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Share</span>
            </button>
            <button class="share-btn flex flex-col items-center gap-1" data-platform="copy">
              <img src="https://img.icons8.com/?size=100&id=59773&format=png&color=111827" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Copy</span>
            </button>
            <button class="share-btn flex flex-col items-center gap-1" data-platform="download">
              <img src="https://img.icons8.com/?size=100&id=83988&format=png&color=111827" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Unduh PNG</span>
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>

    <div class="p-4 bg-white border-t border-gray-200 shrink-0">
      <button id="close-transfer-success" class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
        Kembali
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('#close-transfer-success').onclick = () => {
    document.title = PAYMENT_ORIGINAL_TITLE;
    overlay.remove();
  };

  const shareText =
    'TRANSFER NORTHPAY BERHASIL\n\n' +
    'Invoice: ' + invoiceNumber + '\n' +
    'Tujuan: ' + data.methodName + '\n' +
    'Nomor Akun: ' + data.accountNumber + '\n' +
    'Nama Penerima: ' + data.accountName + '\n' +
    'Jumlah: Rp ' + fmt(data.amount) + '\n' +
    'Biaya Admin: Rp ' + fmt(data.adminFee) + '\n' +
    'Total: Rp ' + fmt(data.total) + '\n' +
    'Tanggal: ' + formatDate + '\n\n' +
    'Status: ' + (data.status || 'SUCCESS');

  modal.querySelectorAll('.share-btn').forEach(btn => {
    btn.onclick = async () => {
      const platform = btn.dataset.platform;
      try {
        if (platform === 'copy') {
          await navigator.clipboard.writeText(shareText);
          showIosModal('Bukti transfer disalin!');
          return;
        }
        if (platform === 'download') {
          if (typeof html2canvas !== 'undefined') {
            try {
              const canvas = await html2canvas(overlay, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f3f4f6', logging: false, imageTimeout: 5000, removeContainer: true });
              canvas.toBlob(function (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'bukti-transfer-' + data.transferId + '.png'; a.click();
                URL.revokeObjectURL(url);
              }, 'image/png', 0.92);
            } catch (err) {
              showIosModal('Download gagal');
            }
          } else {
            showIosModal('Fitur tidak tersedia');
          }
          return;
        }
        if (platform === 'share') {
          if (navigator.share) {
            await navigator.share({ title: 'Bukti Transfer NorthPay', text: shareText });
          } else {
            await navigator.clipboard.writeText(shareText);
            showIosModal('Bukti transfer disalin');
          }
        }
      } catch (err) {
        console.log(err);
        showIosModal('Share gagal');
      }
    };
  });
};

async function handleTopupShare(btn, data) {
  const platform = btn.dataset.platform;
  const text =
    'TOP-UP NORTHPAY\n\n' +
    'Invoice: ' + data.invoiceNumber + '\n' +
    'User: ' + data.userName + '\n' +
    'Amount: Rp ' + data.formatRp + '\n' +
    'Status: SUCCESS';
  try {
    if (platform === 'copy') {
      await navigator.clipboard.writeText(text);
      showIosModal('Invoice copied!');
      return;
    }
    if (platform === 'download') {
      const el = document.getElementById('payment-modal-overlay');
      if (el && typeof html2canvas !== 'undefined') {
        try {
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f3f4f6', logging: false, imageTimeout: 5000, removeContainer: true });
          canvas.toBlob(function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'invoice-topup-' + Date.now() + '.png'; a.click();
            URL.revokeObjectURL(url);
          }, 'image/png', 0.92);
        } catch (err) {
          console.log(err);
          showIosModal('Download gagal');
        }
      } else {
        showIosModal('Fitur tidak tersedia');
      }
      return;
    }
    if (platform === 'share') {
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Invoice NorthPay', text: text });
        } else {
          await navigator.clipboard.writeText(text);
          showIosModal('Invoice text copied');
        }
      } catch (err) {
        console.log(err);
      }
    }
  } catch (err) {
    console.log(err);
    showIosModal('Share gagal');
  }
}

function showNorthpayPinModalInline(orderData) {
  var totalPrice = orderData.totalPrice || 0;
  var productName = orderData.productName || '';
  var productImage = orderData.productImage || '';
  var chosenColor = orderData.chosenColor || '';
  var chosenSize = orderData.chosenSize || '';
  var chosenModel = orderData.chosenModel || '';
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5);';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); restoreUrl(); resolve(false); } };
    document.body.appendChild(overlay);
    var originalUrl = window.location.href;
    history.replaceState(null, '', '/cart?verify-northpay=' + Date.now() + '&code=' + Math.random().toString(36).substring(2, 8));
    function restoreUrl() { history.replaceState(null, '', originalUrl); }

    var box = document.createElement('div');
    box.style.cssText = 'width:100%;max-width:420px;background:#fff;padding:0;position:relative;';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:2px;border-bottom:1px solid #eeeeee;';
    var backBtn = document.createElement('div');
    backBtn.style.cssText = 'width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;margin-right:8px;';
    backBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DF414F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    backBtn.onclick = function() { overlay.remove(); resolve(false); };
    var titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'flex:1;text-align:center;';
    var title = document.createElement('h2');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#1a1a1a;margin:0;';
    title.textContent = 'Verify PIN NorthPay';
    titleWrap.appendChild(title);
    header.appendChild(backBtn);
    header.appendChild(titleWrap);

    var body = document.createElement('div');
    body.style.cssText = 'padding:24px 16px;text-align:center;';

    var prodInfo = document.createElement('div');
    prodInfo.style.cssText = 'background:#fafafa;border:1px solid #eeeeee;padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:16px;';
    var imgBox = document.createElement('div');
    imgBox.style.cssText = 'width:48px;height:48px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:12px;color:#9ca3af;overflow:hidden;';
    if (productImage) {
      var img = document.createElement('img');
      img.src = productImage;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.onerror = function() { this.style.display = 'none'; };
      imgBox.appendChild(img);
    } else {
      imgBox.textContent = 'IMG';
    }
    var infoCol = document.createElement('div');
    infoCol.style.cssText = 'flex:1;text-align:left;min-width:0;';
    var prodName = document.createElement('p');
    prodName.style.cssText = 'font-size:14px;font-weight:700;color:#1a1a1a;margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    prodName.textContent = productName || ('Produk senilai Rp ' + totalPrice.toLocaleString('id-ID'));
    infoCol.appendChild(prodName);
    if (chosenColor) {
      var prodColor = document.createElement('p');
      prodColor.style.cssText = 'font-size:12px;color:#6b7280;margin:0;';
      prodColor.textContent = 'Warna: ' + chosenColor;
      infoCol.appendChild(prodColor);
    }
    if (chosenSize) {
      var prodSize = document.createElement('p');
      prodSize.style.cssText = 'font-size:12px;color:#6b7280;margin:0;';
      prodSize.textContent = 'Ukuran: ' + chosenSize;
      infoCol.appendChild(prodSize);
    }
    if (chosenModel) {
      var prodModel = document.createElement('p');
      prodModel.style.cssText = 'font-size:12px;color:#6b7280;margin:0;';
      prodModel.textContent = 'Model: ' + chosenModel;
      infoCol.appendChild(prodModel);
    }
    var prodPrice = document.createElement('span');
    prodPrice.style.cssText = 'font-size:14px;font-weight:700;color:#DF414F;flex-shrink:0;';
    prodPrice.textContent = 'Rp ' + totalPrice.toLocaleString('id-ID');
    prodInfo.appendChild(imgBox);
    prodInfo.appendChild(infoCol);
    prodInfo.appendChild(prodPrice);

    var pinDesc = document.createElement('p');
    pinDesc.style.cssText = 'font-size:14px;color:#6b7280;margin-bottom:16px;';
    pinDesc.textContent = 'Masukkan PIN 6 digit NorthPay untuk melanjutkan';

    var inputsDiv = document.createElement('div');
    inputsDiv.style.cssText = 'display:flex;justify-content:center;gap:12px;margin-bottom:16px;';
    var inputs = [];
    for (var i = 0; i < 6; i++) {
      var inp = document.createElement('input');
      inp.type = 'password';
      inp.maxLength = 1;
      inp.inputMode = 'numeric';
      inp.autocomplete = 'off';
      inp.style.cssText = 'width:44px;height:52px;text-align:center;font-size:20px;font-weight:700;border:1.5px solid #e5e7eb;border-radius:0;outline:none;letter-spacing:0.3em;';
      inp.setAttribute('data-idx', String(i));
      inputsDiv.appendChild(inp);
      inputs.push(inp);
    }

    var errP = document.createElement('p');
    errP.style.cssText = 'font-size:12px;color:#ef4444;text-align:center;display:none;margin-bottom:8px;';

    var submitBtn = document.createElement('button');
    submitBtn.style.cssText = 'width:100%;padding:12px 0;background:#DF414F;color:#fff;font-weight:500;font-size:14px;border:none;cursor:pointer;';
    submitBtn.textContent = 'Verifikasi PIN';
    submitBtn.disabled = true;

    function checkFilled() {
      var filled = inputs.every(function(i) { return i.value.length === 1; });
      submitBtn.disabled = !filled;
    }
    inputs.forEach(function(inp, idx) {
      inp.addEventListener('input', function() {
        var val = inp.value.replace(/[^0-9]/g, '');
        inp.value = val.slice(-1);
        if (val && idx < 5) inputs[idx + 1].focus();
        checkFilled();
      });
      inp.addEventListener('keydown', function(e) {
        if (e.key === 'Backspace' && !inp.value && idx > 0) inputs[idx - 1].focus();
      });
      inp.addEventListener('paste', function(e) {
        e.preventDefault();
        var paste = (e.clipboardData || window.clipboardData).getData('text');
        var digits = paste.replace(/[^0-9]/g, '').slice(0, 6);
        digits.split('').forEach(function(d, i) { if (inputs[i]) inputs[i].value = d; });
        var next = Math.min(digits.length, 5);
        inputs[next].focus();
        checkFilled();
      });
    });

    submitBtn.addEventListener('click', function() {
      var pin = inputs.map(function(i) { return i.value; }).join('');
      if (pin.length !== 6) {
        errP.textContent = 'Masukkan PIN 6 digit';
        errP.style.display = 'block';
        inputs.forEach(function(i) { i.style.borderColor = '#ef4444'; });
        setTimeout(function() { inputs.forEach(function(i) { i.style.borderColor = '#e5e7eb'; }); errP.style.display = 'none'; }, 1200);
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memverifikasi...';
      submitBtn.style.opacity = '0.5';

      fetch(_d('9kzs9xy|~rzk$9}o~~sxq}9zsx9!o|sp$'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verifikasi PIN';
        submitBtn.style.opacity = '1';
        if (d.success) {
          overlay.remove();
          resolve(orderData);
        } else {
          errP.textContent = d.message || 'PIN salah';
          errP.style.display = 'block';
          inputs.forEach(function(i) { i.value = ''; });
          inputs[0].focus();
          checkFilled();
        }
      })
      .catch(function() {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verifikasi PIN';
        submitBtn.style.opacity = '1';
        errP.textContent = 'Gagal menghubungi server';
        errP.style.display = 'block';
      });
    });

    body.appendChild(prodInfo);
    body.appendChild(pinDesc);
    body.appendChild(inputsDiv);
    body.appendChild(errP);
    body.appendChild(submitBtn);
    box.appendChild(header);
    box.appendChild(body);
    overlay.appendChild(box);
    overlay.style.display = 'flex';
    history.replaceState(null, '', '/cart?verify-northpay=' + Date.now() + '&code=' + Math.random().toString(36).substring(2, 8));
    inputs[0].focus();
  });
}

function showPaymentMethodScreen(data, overlay, modal) {
  let selectedMethod = null;
  let northpayBalance = 0;
  let northpayTargetPrice = data.totalPrice || 0;

  const rupiah = (n) => 'Rp ' + parseInt(n).toLocaleString('id-ID');

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto">
      <div class="px-4 py-2 text-[10px] text-gray-400 uppercase font-semibold flex items-center gap-1">
        Northline Guarantee
        <img src="https://img.icons8.com/?size=100&id=z6L43qWhEasn&format=png&color=000000" class="w-3 h-3" />
      </div>

      <div class="bg-white border-t border-b border-gray-100" id="northpay-row">
        <div class="method-option w-full px-4 py-3 flex items-center justify-between cursor-pointer" data-method="northpay">
          <div class="flex items-center gap-3">
            <img src="https://img.icons8.com/?size=100&id=QFJvCyZn0zCW&format=png&color=737373" class="w-6 h-6 object-contain" />
            <div class="text-left">
              <div class="flex items-center gap-2">
                <p class="text-[13px] font-medium text-gray-800">NorthPay</p>
                <span class="bg-[#DF414F] text-white items-center text-[9px] px-1.5 font-bold">NEW</span>
              </div>
              <p class="text-[11px] text-gray-400">Bayar langsung pakai saldo NorthPay</p>
              <p class="text-[10px] text-gray-500 mt-1" id="northpay-balance-info">Mengecek saldo...</p>
            </div>
          </div>
          <div class="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center radio-circle">
          </div>
        </div>
      </div>

      <div class="bg-white border-b border-gray-100">
        <button class="payment-toggle w-full px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="https://img.icons8.com/fluency/48/bank-building.png" class="w-5 h-5 object-contain" />
            <div class="text-left">
              <p class="text-[13px] font-medium text-gray-800">Online Banking</p>
              <p class="text-[11px] text-gray-400">CIMB Clicks</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <img src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-down.png" class="arrow w-3 h-3 transition" />
          </div>
        </button>
        <div class="payment-content">
          <div class="px-4 py-3 border-t border-gray-100 flex items-center gap-3 cursor-pointer hover:bg-gray-50 method-option" data-method="qris">
            <img src="https://images.seeklogo.com/logo-png/39/2/quick-response-code-indonesia-standard-qris-logo-png_seeklogo-391791.png" class="h-8 object-contain" />
            <div class="flex-1">
              <p class="text-[13px] font-medium text-gray-800">QRIS</p>
              <p class="text-[11px] text-gray-400">Bayar dengan aplikasi e-wallet & mobile banking apa saja</p>
            </div>
            <div class="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center radio-circle shrink-0">
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white border-b border-gray-100">
        <button class="payment-toggle w-full px-4 py-3 flex items-center justify-between">
          <img src="https://cdn-icons-png.flaticon.com/512/633/633611.png" class="w-5 h-5 object-contain opacity-50" />
          <div class="text-left flex-1 ml-3">
            <p class="text-[13px] font-medium text-gray-400">Credit / Debit Card</p>
          </div>
          <img src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-down.png" class="arrow w-3 h-3 object-contain transition" />
        </button>
        <div class="payment-content">
          <div class="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div class="flex items-center gap-3 opacity-40">
              <div class="w-6 h-6 border border-gray-300 flex items-center justify-center text-gray-400">+</div>
              <span class="text-[12px] text-gray-400">Add New Credit/Debit Card</span>
            </div>
            <p class="mt-4 text-[11px] leading-4 text-gray-400">I acknowledge that my card information is saved securely...</p>
            <div class="mt-4 text-[11px] text-[#DF414F] font-medium">Credit Card Installment</div>
            <div class="mt-2 bg-red-50 border border-red-100 px-3 py-2 text-[11px] text-red-500">Metode ini masih belum bisa digunakan.</div>
          </div>
        </div>
      </div>

      <div class="bg-white border-b border-gray-100">
        <button class="payment-toggle w-full px-4 py-3 flex items-center justify-between">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/shop.png" class="w-5 h-5 object-contain" />
          <div class="text-left flex-1 ml-3">
            <p class="text-[13px] font-medium text-gray-700">Cash Payment at Convenience Stores</p>
          </div>
          <img src="https://img.icons8.com/ios-glyphs/30/9ca3af/chevron-down.png" class="arrow w-3 h-3 object-contain transition" />
        </button>
        <div class="payment-content">
          <div class="px-4 py-3 border-t border-gray-100 opacity-50 flex items-center gap-3">
            <img src="https://logosmarcas.net/wp-content/uploads/2022/03/Alfamart-Emblema-500x281.png" class="w-5 h-5 object-contain" />
            <span class="text-[12px] text-gray-500">Cash Payment at Alfamart</span>
          </div>
          <div class="px-4 py-3 border-t border-gray-100 opacity-50 flex items-center gap-3">
            <img src="https://iconlogovector.com/uploads/images/2024/03/lg-65e77e076d60d-Indomaret.webp" class="w-5 h-5 object-contain" />
            <span class="text-[12px] text-gray-500">Cash Payment at Indomaret</span>
          </div>
          <div class="px-4 pb-4">
            <div class="bg-red-50 border border-red-100 px-3 py-2 text-[11px] text-red-500">Pembayaran convenience store belum tersedia.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-white p-4 border-t border-gray-200 shrink-0">
      <button id="confirm-btn"
        class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
        CONFIRM
      </button>
    </div>
  `;

  (async () => {
    try {
      const balRes = await fetch(_d('9kzs9xy|~rzk$9lkvkxmo'), { credentials: 'include' });
      const balData = await balRes.json();
      if (balData.success) {
        northpayBalance = parseFloat(balData.balance) || 0;
        if (balData.enabled === false) {
          const row = document.getElementById('northpay-row');
          if (row) row.classList.add('hidden');
        } else {
          const el = document.getElementById('northpay-balance-info');
          if (el) el.textContent = 'Saldo: ' + rupiah(northpayBalance);
          updateNorthpayRowStyle();
        }
      } else {
        const el = document.getElementById('northpay-balance-info');
        if (el) el.textContent = 'Saldo: Rp 0';
        updateNorthpayRowStyle();
      }
    } catch (e) {
      const el = document.getElementById('northpay-balance-info');
      if (el) el.textContent = 'Saldo: Rp 0';
      updateNorthpayRowStyle();
    }
  })();

  function updateNorthpayRowStyle() {
    const row = document.getElementById('northpay-row');
    const info = document.getElementById('northpay-balance-info');
    if (!row || !info) return;
    if (northpayBalance < northpayTargetPrice) {
      row.classList.add('border-red-400', 'bg-red-50');
      row.classList.remove('border-gray-100');
      info.classList.add('text-red-500');
      info.classList.remove('text-gray-500');
      info.textContent = 'Saldo: ' + rupiah(northpayBalance) + ' — Isi saldo';
    } else {
      row.classList.remove('border-red-400', 'bg-red-50');
      row.classList.add('border-gray-100');
      info.classList.remove('text-red-500');
      info.classList.add('text-gray-500');
      info.textContent = 'Saldo: ' + rupiah(northpayBalance);
    }
  }

  modal.querySelectorAll('.payment-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const content = toggle.nextElementSibling;
      const arrow = toggle.querySelector('.arrow');
      if (content) {
        content.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180');
      }
    });
  });

  function selectMethod(method) {
    selectedMethod = method;
    modal.querySelectorAll('.method-option').forEach(opt => {
      if (opt.dataset.method === method) {
        if (opt.dataset.method === 'northpay' && northpayBalance < northpayTargetPrice) {
          showIosModal('Saldo NorthPay tidak mencukupi, silakan isi saldo terlebih dahulu');
        }
        const circle = opt.querySelector('.radio-circle');
        opt.classList.add('bg-[#DF414F]/5');
        circle.classList.remove('border-gray-300');
        circle.classList.add('border-[#DF414F]');
        circle.innerHTML = '<div class="w-2.5 h-2.5 rounded-full bg-[#DF414F]"></div>';
      } else {
        const circle = opt.querySelector('.radio-circle');
        opt.classList.remove('bg-[#DF414F]/5');
        circle.classList.remove('border-[#DF414F]');
        circle.classList.add('border-gray-300');
        circle.innerHTML = '';
      }
    });
  }

  modal.querySelectorAll('.method-option').forEach(opt => {
    opt.addEventListener('click', () => selectMethod(opt.dataset.method));
  });

  modal.querySelector('#confirm-btn').onclick = async () => {
    const btn = modal.querySelector('#confirm-btn');
    if (!selectedMethod) {
      showIosModal('Pilih metode pembayaran terlebih dahulu');
      return;
    }
    btn.disabled = true;
    btn.innerHTML = `
      <div class="flex items-center justify-center gap-2">
        <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
        <span class="text-[12px]">MEMPROSES...</span>
      </div>
    `;

    if (selectedMethod === 'northpay') {
      // Check NorthPay settings first
      try {
        const settingsRes = await fetch(_d('9kzs9xy|~rzk$9}o~~sxq}'), { credentials: 'include' });
        if (!settingsRes.ok) {
          if (settingsRes.status === 401 || settingsRes.status === 403) {
            showIosModal('Sesi tidak valid, silakan login ulang');
            setTimeout(() => {
              closePayment();
              window.location.href = '/AppNorthAuth';
            }, 1500);
          } else {
            showIosModal('Gagal memeriksa pengaturan NorthPay');
          }
          btn.disabled = false;
          btn.innerHTML = 'CONFIRM';
          return;
        }
        const settingsData = await settingsRes.json();
        
        if (!settingsData.success || settingsData.settings.enabled === false) {
          showIosModal('NorthPay sedang dinonaktifkan. Aktifkan kembali melalui Pengaturan NorthPay.');
          btn.disabled = false;
          btn.innerHTML = 'CONFIRM';
          return;
        }

        if (!settingsData.success || !settingsData.settings.hasPin) {
          // No PIN set, redirect to settings
          showIosModal('Anda belum mengatur PIN NorthPay. Arahkan ke pengaturan untuk membuat PIN.');
          setTimeout(() => {
            closePayment();
            window.location.href = '/account#northpaySettings';
          }, 1500);
          btn.disabled = false;
          btn.innerHTML = 'CONFIRM';
          return;
        }
        
        // Show inline full-screen PIN verification (Shopee-style UI, no Tailwind dependency)
        const orderData = await showNorthpayPinModalInline(data);
        if (!orderData) {
          btn.disabled = false;
          btn.innerHTML = 'CONFIRM';
          return;
        }

        // Continue with save-order after PIN verified
        if (orderData.northpayBalance < (orderData.totalPrice || 0)) {
          showIosModal('Saldo NorthPay tidak mencukupi');
          btn.disabled = false;
          btn.innerHTML = 'CONFIRM';
          return;
        }

        if (data.items && data.items.length > 0) {
          const csrfToken = await getPaymentCsrfToken();
          const res = await fetch(_d('9kzs9}k!o7y|no|9l vu'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
            credentials: 'include',
            body: JSON.stringify({
              items: data.items,
              totalPrice: data.totalPrice,
              voucherId: data.voucherId || '',
              status: 'success',
              paymentMethod: 'northpay'
            })
          });
          const result = await res.json();
          if (result.success) {
            tampilkanInvoiceSuccessBulk(data, result, overlay, modal, 'northpay');
          } else {
            showIosModal(result.message || 'Pembayaran gagal');
            btn.disabled = false;
            btn.innerHTML = 'CONFIRM';
          }
          return;
        }

        const csrfToken = await getPaymentCsrfToken();
        const res = await fetch(_d('9kzs9}k!o7y|no|'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
          credentials: 'include',
          body: JSON.stringify({ ...orderData, status: 'success', paymentMethod: 'northpay' })
        });
        const result = await res.json();
        if (result.success) {
          tampilkanInvoiceSuccess({ ...orderData, orderId: result.orderId, totalPrice: orderData.totalPrice, color: orderData.chosenColor, size: orderData.chosenSize, model: orderData.chosenModel }, overlay, modal);
        } else {
          showIosModal(result.message || 'Pembayaran gagal');
          btn.disabled = false;
          btn.innerHTML = 'CONFIRM';
        }
      } catch (e) {
        showIosModal('Gagal memeriksa pengaturan NorthPay');
        btn.disabled = false;
        btn.innerHTML = 'CONFIRM';
        return;
      }
    } else {
      try {
        if (data.items && data.items.length > 0) {
          const csrfToken = await getPaymentCsrfToken();
          const res = await fetch(_d('9kzs9}k!o7y|no|9l vu'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
            credentials: 'include',
            body: JSON.stringify({
              items: data.items,
              totalPrice: data.totalPrice,
              voucherId: data.voucherId || '',
              status: 'pending',
              paymentMethod: 'qris'
            })
          });
          const result = await res.json();
          if (result.success) {
            tampilkanQRISMulti({ ...data, orderIds: result.orders.map(o => o.orderId), subtotal: result.subtotal, discountAmount: result.discountAmount, totalPrice: result.totalPrice }, overlay, modal);
          } else {
            showIosModal(result.message || 'Gagal membuat pesanan');
            btn.disabled = false;
            btn.innerHTML = 'CONFIRM';
          }
          return;
        }
        const csrfToken = await getPaymentCsrfToken();
        const res = await fetch(_d('9kzs9}k!o7y|no|'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
          credentials: 'include',
          body: JSON.stringify({ ...data, status: 'pending', paymentMethod: 'qris' })
        });
        const result = await res.json();
        if (result.success) {
          tampilkanQRIS({ ...data, orderId: result.orderId }, overlay, modal);
        }
      } catch (e) {
        showIosModal('Server sedang sibuk');
        btn.disabled = false;
        btn.innerHTML = 'CONFIRM';
      }
    }
  };
}

async function tampilkanQRIS(data, overlay, modal) {
  const orderId = data.orderId;
  document.title = 'Scan QRIS - Northline';
  history.pushState({ payment: 'qris', orderId }, '', `?payment=qris&order=${orderId}`);

  let timerInterval;
  let pollInterval;

  window.handleCancel = async (id) => {
    try {
      const res = await fetch(_d('9kzs9mkxmov7y|no|9') + id, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        showIosModal('Pesanan dibatalkan.');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        showIosModal('Gagal membatalkan: ' + result.message);
      }
    } catch (e) {
      showIosModal('Terjadi kesalahan sistem!');
    }
  };

  const fmt = new Intl.NumberFormat('id-ID');

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto bg-gray-50">
      <div class="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 class="text-[15px] font-semibold text-gray-800">Pembayaran QRIS</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">Selesaikan pembayaran sebelum expired</p>
        </div>
      </div>

      <div class="p-4">
        <div class="bg-white border border-gray-100 p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="text-[11px] text-gray-400">Invoice ID</p>
              <h2 class="text-[13px] font-bold text-gray-800 mt-1">${orderId}</h2>
            </div>
            <div class="bg-gray-50 text-gray-500 text-[10px] px-2 py-1 font-bold">PENDING</div>
          </div>
          <div class="space-y-2 text-[12px]">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Metode</span>
              <span class="font-medium text-gray-700">QRIS ALL PAYMENT</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Tanggal</span>
              <span class="font-medium text-gray-700">${new Date().toLocaleDateString('id-ID')}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Jam</span>
              <span class="font-medium text-gray-700">${new Date().toLocaleTimeString('id-ID')}</span>
            </div>
            ${data.isDiscounted ? `
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Subtotal</span>
              <span class="font-medium text-gray-700">IDR ${fmt.format(data.subtotal)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-600">Diskon 5%</span>
              <span class="font-semibold text-gray-600">- IDR ${fmt.format(data.discountAmount)}</span>
            </div>
            ` : ''}
            <div class="flex items-center justify-between pt-2 border-t mt-2">
              <span class="text-gray-500 font-medium">Total Bayar</span>
              <span class="text-[16px] font-bold text-gray-500">IDR ${fmt.format(data.totalPrice)}</span>
            </div>
          </div>
        </div>

        ${data.isDiscounted ? `
        <div class="mb-4 bg-gray-50 border border-gray-100 p-4">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 flex items-center justify-center bg-gray-200 rounded-full text-gray-600 text-xs font-bold">!</span>
            <div>
              <h3 class="font-semibold text-gray-700">Selamat!</h3>
              <p class="text-xs text-gray-600 mt-1">Kamu termasuk 10 pembeli pertama dan mendapat diskon 5%.</p>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="bg-white border border-gray-100 p-5 text-center">
          <div class="flex items-center justify-center gap-2 mb-2">
            <span class="text-[11px] text-gray-500 uppercase tracking-wide">Menunggu Pembayaran</span>
          </div>
          <h2 class="text-[18px] font-bold text-gray-800">Scan QRIS</h2>
          <p class="text-[11px] text-gray-400 mt-1 mb-4 leading-4">
            Gunakan Dana, OVO, Gopay, ShopeePay,<br>M-Banking atau aplikasi pembayaran lainnya
          </p>
          <div class="bg-gray-50 border border-gray-100 py-3 mb-5">
            <p class="text-[10px] text-gray-400 uppercase">Pembayaran Berakhir Dalam</p>
            <div id="timer" class="text-[26px] font-bold text-gray-700 tracking-wider mt-1">10:00</div>
          </div>
          <div class="bg-white mb-5">
            <img id="qris-image"
              src="https://nl.hostinesia.my.id/public/image/file_000000003c1881fab7655f4a8369bf5cqr.png"
              class="w-[280px] h-[280px] mx-auto object-contain" >
          </div>
          <div class="grid grid-cols-2 gap-3">
            <a href="/image/file_000000003c1881fab7655f4a8369bf5cqr.png" download="Northline-QRIS.jpeg"
              class="h-[35px] border border-gray-200 flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition">
              Download
            </a>
            <button onclick="window.handleCancel('${orderId}')"
              class="h-[35px] bg-[#DF414F] hover:bg-[#df414ede] flex items-center justify-center gap-2 text-[12px] font-semibold text-white transition">
              Batalkan
            </button>
          </div>
        </div>

        <div class="mt-4 bg-white border border-gray-100 p-4">
          <div class="flex items-start gap-3">
            <img src="https://img.icons8.com/?size=100&id=77&format=png&color=000000" class="w-4 h-4 mt-0.5">
            <div>
              <h3 class="text-[13px] text-gray-700 font-medium">Informasi Pembayaran</h3>
              <ul class="mt-2 space-y-1 text-[12px] text-gray-500 leading-5">
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>Pastikan nominal pembayaran sesuai</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>QRIS hanya berlaku 10 menit</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>Setelah bayar status otomatis berubah</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>Jangan tutup halaman sebelum pembayaran selesai</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let timeLeft = 600;
  timerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timerEl = modal.querySelector('#timer');
    if (timerEl) timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      clearInterval(pollInterval);
      showIosModal('Waktu habis! Transaksi dibatalkan.');
      overlay.remove();
    }
  }, 1000);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(_d('9kzs9mromu7y|no|9') + orderId + _d('I~G') + Date.now());
      const result = await res.json();
      if (result.status === 'success') {
        clearInterval(timerInterval);
        clearInterval(pollInterval);
        tampilkanInvoiceSuccess({
          orderId: result.order?.order_id || orderId,
          productName: result.order?.product_name || data.productName,
          totalPrice: result.order?.total_price || data.totalPrice,
          quantity: result.order?.quantity || data.quantity,
          color: result.order?.chosen_color || data.chosenColor,
          size: result.order?.chosen_size || data.chosenSize,
          model: result.order?.chosen_model || data.chosenModel,
          productImage: result.order?.product_image || data.productImage || document.getElementById('main-preview')?.src || '/public/icons/default.png',
          subtotal: data.subtotal,
          discountAmount: data.discountAmount || 0,
          isDiscounted: data.isDiscounted || false,
          paymentMethod: 'qris',
          createdAt: result.order?.created_at || new Date()
        }, overlay, modal);
      }
    } catch (e) {
      console.error('Polling error:', e);
    }
  }, 3000);
}

async function tampilkanQRISMulti(data, overlay, modal) {
  const orderIds = data.orderIds || [];
  document.title = 'Scan QRIS - Northline';
  history.pushState({ payment: 'qris', bulk: true }, '', '?payment=qris');

  const fmt = new Intl.NumberFormat('id-ID');
  const items = data.items || [];

  window.handleCancelAll = async () => {
    let anyCancelled = false;
    for (const id of orderIds) {
      try {
        const res = await fetch(_d('9kzs9mkxmov7y|no|9') + id, { method: 'DELETE' });
        const r = await res.json();
        if (r.success) anyCancelled = true;
      } catch (e) {}
    }
    if (anyCancelled) showIosModal('Pesanan dibatalkan.');
    setTimeout(() => {
      if (document.getElementById('payment-modal-overlay')) document.getElementById('payment-modal-overlay').remove();
    }, 900);
  };

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto bg-gray-50">
      <div class="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 class="text-[15px] font-semibold text-gray-800">Pembayaran QRIS</h1>
          <p class="text-[11px] text-gray-400 mt-0.5">${items.length} produk — selesaikan pembayaran sebelum expired</p>
        </div>
      </div>

      <div class="p-4">
        <div class="bg-white border border-gray-100 p-4 mb-4">
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-[11px] text-gray-400">Invoice ID</p>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                ${orderIds.map(id => `<span class="bg-gray-50 text-gray-600 text-[10px] px-2 py-1 font-semibold">${id}</span>`).join('')}
              </div>
            </div>
            <div class="bg-gray-50 text-gray-500 text-[10px] px-2 py-1 font-bold">PENDING</div>
          </div>

          <div class="max-h-40 overflow-y-auto border-t border-gray-100 mt-3">
            ${items.map((it) => `
              <div class="flex gap-3 py-3 border-b border-gray-50">
                <div class="w-12 h-12 bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                  <img src="${it.productImage}" class="w-full h-full object-cover" onerror="this.src='/public/icons/default.png'" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-[13px] text-gray-800 leading-5 line-clamp-2">${it.productName}</h3>
                  <div class="flex gap-1.5 mt-1 flex-wrap">
                    ${it.chosenColor ? `<span class="bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">${it.chosenColor}</span>` : ''}
                    ${it.chosenSize ? `<span class="bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">${it.chosenSize}</span>` : ''}
                    ${it.chosenModel ? `<span class="bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">${it.chosenModel}</span>` : ''}
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-[11px] text-gray-500">x${it.quantity || 1}</p>
                  <p class="text-[12px] font-semibold text-gray-700 mt-0.5">IDR ${fmt(it.totalPrice)}</p>
                </div>
              </div>
            `).join('')}
          </div>

          ${data.discountAmount > 0 ? `
          <div class="space-y-2 text-[12px] pt-2">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Subtotal</span>
              <span class="font-medium text-gray-700">IDR ${fmt(data.subtotal)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-600">Diskon Voucher</span>
              <span class="font-semibold text-gray-600">- IDR ${fmt(data.discountAmount)}</span>
            </div>
            <div class="flex items-center justify-between pt-2 border-t">
              <span class="text-gray-500 font-medium">Total Bayar</span>
              <span class="text-[16px] font-bold text-gray-500">IDR ${fmt(data.totalPrice)}</span>
            </div>
          </div>
          ` : `
          <div class="pt-2 border-t mt-2 flex items-center justify-between">
            <span class="text-gray-500 font-medium">Total Bayar</span>
            <span class="text-[16px] font-bold text-gray-500">IDR ${fmt(data.totalPrice)}</span>
          </div>
          `}
        </div>

        <div class="bg-white border border-gray-100 p-5 text-center">
          <div class="flex items-center justify-center gap-2 mb-2">
            <span class="text-[11px] text-gray-500 uppercase tracking-wide">Menunggu Pembayaran</span>
          </div>
          <h2 class="text-[18px] font-bold text-gray-800">Scan QRIS</h2>
          <p class="text-[11px] text-gray-400 mt-1 mb-4 leading-4">
            Gunakan Dana, OVO, Gopay, ShopeePay,<br>M-Banking atau aplikasi pembayaran lainnya
          </p>
          <div class="bg-gray-50 border border-gray-100 py-3 mb-5">
            <p class="text-[10px] text-gray-400 uppercase">Pembayaran Berakhir Dalam</p>
            <div id="timer" class="text-[26px] font-bold text-gray-700 tracking-wider mt-1">10:00</div>
          </div>
          <div class="bg-white mb-5">
            <img id="qris-image"
              src="https://nl.hostinesia.my.id/public/image/file_000000003c1881fab7655f4a8369bf5cqr.png"
              class="w-[280px] h-[280px] mx-auto object-contain" >
          </div>
          <div class="grid grid-cols-2 gap-3">
            <a href="/image/file_000000003c1881fab7655f4a8369bf5cqr.png" download="Northline-QRIS.jpeg"
              class="h-[35px] border border-gray-200 flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition">
              Download
            </a>
            <button onclick="window.handleCancelAll()"
              class="h-[35px] bg-[#DF414F] hover:bg-[#df414ede] flex items-center justify-center gap-2 text-[12px] font-semibold text-white transition">
              Batalkan
            </button>
          </div>
        </div>

        <div class="mt-4 bg-white border border-gray-100 p-4">
          <div class="flex items-start gap-3">
            <img src="https://img.icons8.com/?size=100&id=77&format=png&color=000000" class="w-4 h-4 mt-0.5">
            <div>
              <h3 class="text-[13px] text-gray-700 font-medium">Informasi Pembayaran</h3>
              <ul class="mt-2 space-y-1 text-[12px] text-gray-500 leading-5">
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>Pastikan nominal pembayaran sesuai</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>QRIS hanya berlaku 10 menit</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>Setelah bayar status otomatis berubah</span>
                </li>
                <li class="flex items-start gap-1.5">
                  <span class="flex items-center justify-center w-4 h-4">
                    <img src="https://img.icons8.com/fluency-systems-filled/12/000000/checkmark.png" />
                  </span>
                  <span>Jangan tutup halaman sebelum pembayaran selesai</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  let timeLeft = 600;
  const timerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timerEl = modal.querySelector('#timer');
    if (timerEl) timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      clearInterval(pollInterval);
      showIosModal('Waktu habis! Transaksi dibatalkan.');
      overlay.remove();
    }
  }, 1000);

  const pollInterval = setInterval(async () => {
    try {
      const statuses = await Promise.all(orderIds.map(async (id) => {
        try {
          const res = await fetch(_d('9kzs9mromu7y|no|9') + id + _d('I~G') + Date.now());
          const r = await res.json();
          return r.status;
        } catch (e) { return 'unknown'; }
      }));
      if (statuses.every(s => s === 'success')) {
        clearInterval(timerInterval);
        clearInterval(pollInterval);
        tampilkanInvoiceSuccessBulk(data, {
          orders: items.map((it, i) => ({ orderId: orderIds[i], totalPrice: it.totalPrice, subtotal: it.subtotal, discountAmount: it.discountAmount })),
          totalPrice: data.totalPrice,
          subtotal: data.subtotal,
          discountAmount: data.discountAmount
        }, overlay, modal, 'qris');
      } else if (statuses.some(s => s === 'cancelled')) {
        clearInterval(timerInterval);
        clearInterval(pollInterval);
        showIosModal('Pesanan dibatalkan.');
        overlay.remove();
      }
    } catch (e) {
      console.error('Polling bulk error:', e);
    }
  }, 3000);
}

function tampilkanInvoiceSuccessBulk(data, result, overlay, modal, method) {
  document.title = 'Pembayaran Berhasil - Northline';
  history.pushState({ payment: 'success', bulk: true }, '', '?payment=success');

  const fmt = new Intl.NumberFormat('id-ID');
  const items = (data.items || []).map((it, i) => ({
    ...it,
    orderId: (result.orders && result.orders[i] && result.orders[i].orderId) || it.orderId,
    totalPrice: (result.orders && result.orders[i] && result.orders[i].totalPrice) || it.totalPrice,
  }));

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto bg-gray-50">
      <div class="bg-gradient-to-b from-gray-200 to-gray-50 px-6 pt-10 pb-16 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-10"></div>
        <div class="relative z-10 flex flex-col items-center text-center">
          <div class="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg mb-4">
            <img src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=DF414F" class="w-12 h-12" />
          </div>
          <h1 class="text-black text-[22px] font-bold">Pembayaran Berhasil</h1>
          <p class="text-black text-[13px]">${items.length} pesanan berhasil dibuat</p>
        </div>
      </div>

      <div class="px-4 -mt-10 relative z-20">
        <div class="bg-white shadow-sm p-5 border border-gray-100">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <p class="text-[12px] text-gray-400">ORDER ID</p>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                ${items.map(i => `<span class="bg-gray-50 text-gray-600 text-[10px] px-2 py-1 font-semibold">${i.orderId}</span>`).join('')}
              </div>
            </div>
            <div class="bg-gray-50 text-gray-500 px-3 py-1 text-[11px] font-semibold">SUCCESS</div>
          </div>

          <div class="max-h-56 overflow-y-auto">
            ${items.map((it) => `
              <div class="flex gap-3 py-3 border-b border-gray-100">
                <div class="w-16 h-16 bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                  <img src="${it.productImage}" class="w-full h-full object-cover" onerror="this.src='/public/icons/default.png'" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="text-[14px] text-gray-800 leading-5 line-clamp-2">${it.productName}</h3>
                  <div class="flex gap-2 mt-1.5 flex-wrap">
                    ${it.chosenColor ? `<span class="bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">${it.chosenColor}</span>` : ''}
                    ${it.chosenSize ? `<span class="bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">${it.chosenSize}</span>` : ''}
                    ${it.chosenModel ? `<span class="bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">${it.chosenModel}</span>` : ''}
                    <span class="bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">x${it.quantity || 1}</span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-[13px] font-semibold text-gray-700">IDR ${fmt(it.totalPrice)}</p>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="py-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Metode Pembayaran</span>
              <span class="text-[13px] font-medium text-gray-700">${method === 'northpay' ? 'NorthPay' : 'QRIS'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Subtotal</span>
              <span class="text-[13px] font-medium text-gray-700">IDR ${fmt(result.subtotal)}</span>
            </div>
            ${result.discountAmount > 0 ? `
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Diskon Voucher</span>
              <span class="text-[13px] font-semibold text-gray-700">- IDR ${fmt(result.discountAmount)}</span>
            </div>
            ` : ''}
            <div class="flex items-center justify-between pt-3 border-t">
              <span class="text-[14px] font-semibold text-gray-800">Total Pembayaran</span>
              <span class="text-[18px] font-bold text-gray-700">IDR ${fmt(result.totalPrice)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 bg-white border-t border-gray-200 shrink-0">
      <button id="close-success"
        class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
        CLOSE
      </button>
    </div>
  `;

  modal.querySelector('#close-success').onclick = () => {
    document.title = PAYMENT_ORIGINAL_TITLE;
    history.pushState({}, '', window.location.pathname);
    overlay.remove();
    if (window.__onWishlistCheckoutSuccess) {
      window.__onWishlistCheckoutSuccess(items.map(i => i.orderId));
    }
  };
}

function tampilkanInvoiceSuccess(invoice, overlay, modal) {
  document.title = 'Pembayaran Berhasil - Northline';
  history.pushState({ payment: 'success', orderId: invoice.orderId }, '', `?payment=success&order=${invoice.orderId}`);

  const formatPrice = new Intl.NumberFormat('id-ID').format(invoice.totalPrice);
  const formatDate = new Date(invoice.createdAt).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  modal.innerHTML = `
    ${paymentHeader()}

    <div class="flex-1 overflow-y-auto bg-gray-50">
      <div class="bg-gradient-to-b from-gray-200 to-gray-50 px-6 pt-10 pb-16 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-16 translate-x-10"></div>
        <div class="relative z-10 flex flex-col items-center text-center">
          <div class="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg mb-4">
            <img src="https://img.icons8.com/?size=100&id=oToQuGjJ0zA2&format=png&color=DF414F" class="w-12 h-12" />
          </div>
          <h1 class="text-black text-[22px] font-bold">Pembayaran Berhasil</h1>
          <p class="text-black text-[13px]">Invoice pembayaran berhasil dibuat</p>
        </div>
      </div>

      <div class="px-4 -mt-10 relative z-20">
        <div class="bg-white shadow-sm p-5 border border-gray-100">
          <div class="flex items-center justify-between border-b pb-3">
            <div>
              <p class="text-[12px] text-gray-400">ORDER ID</p>
              <h2 class="text-[14px] font-bold text-gray-800 mt-1">${invoice.orderId}</h2>
            </div>
            <div class="bg-gray-50 text-gray-500 px-3 py-1 text-[11px] font-semibold">SUCCESS</div>
          </div>
          <div class="py-4 border-b">
            <div class="flex gap-3">
              <div class="w-16 h-16 bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
                <img src="${invoice.productImage}" class="w-full h-full object-cover" onerror="this.src='/public/icons/default.png'" />
              </div>
              <div class="flex-1">
                <h3 class="text-[14px] text-gray-800 leading-5">${invoice.productName}</h3>
                 <div class="flex gap-2 mt-2 flex-wrap">
                   ${invoice.color ? `<span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">${invoice.color}</span>` : ''}
                   ${invoice.size ? `<span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">${invoice.size}</span>` : ''}
                   ${invoice.model ? `<span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">${invoice.model}</span>` : ''}
                   <span class="bg-gray-100 px-2 py-1 text-[11px] text-gray-600">${invoice.quantity}</span>
                 </div>
              </div>
            </div>
          </div>
          <div class="py-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Tanggal</span>
              <span class="text-[13px] font-medium text-gray-700">${formatDate}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Metode Pembayaran</span>
              <span class="text-[13px] font-medium text-gray-700">${invoice.paymentMethod === 'northpay' ? 'NorthPay' : 'QRIS'}</span>
            </div>
            ${invoice.isDiscounted ? `
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Subtotal</span>
              <span class="text-[13px] font-medium text-gray-700">IDR ${new Intl.NumberFormat('id-ID').format(invoice.subtotal)}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-[13px] text-gray-500">Diskon 5%</span>
              <span class="text-[13px] font-semibold text-gray-700">- IDR ${new Intl.NumberFormat('id-ID').format(invoice.discountAmount)}</span>
            </div>
            ` : ''}
            <div class="flex items-center justify-between pt-3 border-t">
              <span class="text-[14px] font-semibold text-gray-800">Total Pembayaran</span>
              <span class="text-[18px] font-bold text-gray-700">IDR ${formatPrice}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 bg-white shadow-sm p-4 border border-gray-100">
          <h3 class="text-[13px] font-semibold text-gray-700 mb-3">Bagikan Invoice</h3>
          <div class="flex items-center justify-center gap-6">
            <button class="share-btn flex flex-col items-center gap-1" data-platform="share">
              <img src="https://img.icons8.com/?size=100&id=82713&format=png&color=000000" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Share</span>
            </button>
            <button class="share-btn flex flex-col items-center gap-1" data-platform="copy">
              <img src="https://img.icons8.com/?size=100&id=59773&format=png&color=000000" class="w-6 h-6" />
              <span class="text-[11px] text-gray-500">Copy</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 bg-white border-t border-gray-200 shrink-0">
      <button id="close-success"
        class="w-full h-[35px] bg-[#DF414F] hover:bg-[#df414ede] text-white text-[12px] font-semibold transition">
        CLOSE
      </button>
    </div>
  `;

  modal.querySelector('#close-success').onclick = () => {
    document.title = PAYMENT_ORIGINAL_TITLE;
    history.pushState({}, '', window.location.pathname);
    overlay.remove();
  };

  modal.querySelectorAll('.share-btn').forEach(btn => {
    btn.onclick = () => handleShare(btn, invoice, formatPrice);
  });
}

async function handleShare(btn, invoice, formatPrice) {
  const platform = btn.dataset.platform;
  const text =
    'INVOICE NORTHLINE\n\n' +
    'Order ID: ' + invoice.orderId + '\n' +
    'Product: ' + invoice.productName + '\n' +
    'Color: ' + invoice.color + '\n' +
    'Size: ' + invoice.size + '\n' +
    'Qty: ' + invoice.quantity + '\n' +
    'Total: Rp ' + formatPrice + '\n\n' +
    'Status: SUCCESS';
  try {
    if (platform === 'copy') {
      await navigator.clipboard.writeText(text);
      showIosModal('Invoice copied!');
      return;
    }
    if (platform === 'share') {
      try {
        const canvas = await html2canvas(document.querySelector('#payment-modal-overlay > div'), {
          scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f5f5f5', logging: false, imageTimeout: 5000, removeContainer: true
        });
        canvas.toBlob(async (blob) => {
          const file = new File([blob], 'invoice.png', { type: 'image/png' });
          if (navigator.share) {
            await navigator.share({ title: 'Invoice Northline', text: 'Invoice pembayaran berhasil', files: [file] });
          } else {
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url; a.download = 'invoice.png'; a.click();
            URL.revokeObjectURL(url);
          }
        }, 'image/png', 0.92);
      } catch (err) {
        console.log(err);
        showIosModal('Share gagal');
      }
    }
  } catch (err) {
    console.log(err);
    showIosModal('Share gagal');
  }
}
