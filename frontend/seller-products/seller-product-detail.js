let sellerProduct = null;
let sellerSelectedColor = "";
let sellerSelectedSize = "";
let sellerCurrentProductId = null;
let modalReady = false;

async function loadModalStructure() {
    if (document.getElementById("product-modal")) {
        modalReady = true;
        return;
    }
    try {
        const response = await fetch('/nrtModalProducts.html');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);

        modalReady = true;
    } catch (err) {
        console.error("Modal gagal load:", err);
    }
}

function waitModalReady(callback) {
    if (modalReady) return callback();

    setTimeout(() => waitModalReady(callback), 50);
}

window.addEventListener('DOMContentLoaded', loadModalStructure);

async function openSellerProductDetail(productId) {
    try {
        const res = await fetch(`/api/product/${productId}`);
        const data = await res.json();

        if (!data.success || !data.product) {
            return showIosModal("Produk tidak ditemukan");
        }

        const product = data.product;

        product.sizes =
            typeof product.sizes === "string"
                ? JSON.parse(product.sizes || "[]")
                : (product.sizes || []);

        product.images =
            (data.images || []).map(
                img => `/uploads/product/${img.image_url}`
            );

        waitModalReady(() => {

            sellerProduct = product;
            sellerCurrentProductId = product.id;

            sellerSelectedColor = "";
            sellerSelectedSize = product.sizes?.[0] || "";

            const qtyInput =
                document.getElementById("modal-qty-input");

            if (qtyInput) {
                qtyInput.value = 1;
            }

            const storeNameEl =
                document.getElementById("detail-store-name");

            if (storeNameEl) {
                storeNameEl.innerHTML = `
                    <img
                        src="https://img.icons8.com/?size=100&id=F8sJNbgWH2bt&format=png&color=ffffff"
                        style="height:10px;">
                    ${product.store_name || "Official Store"}
                `;
            }

            document.getElementById("detail-name").innerText =
                product.name || "-";

            document.getElementById("detail-price").innerHTML =
                `IDR${Number(product.price || 0).toLocaleString("id-ID")}`;

            const oldPriceEl =
                document.getElementById("detail-old-price");

            oldPriceEl?.classList.add("hidden");

            const images = product.images || [];

            const mainPreview =
                document.getElementById("main-preview");

            mainPreview.src = images[0] || "";

            const thumbContainer =
                document.getElementById("thumb-container");

            thumbContainer.innerHTML = images.map((img, i) => `
                <div
                    onclick="sellerChangePreview('${img}', this)"
                    class="thumb-item aspect-square w-12 border cursor-pointer overflow-hidden ${
                        i === 0 ? "border-[#DF414F]" : "border-gray-200"
                    }">

                    <img
                        src="${img}"
                        class="w-full h-full object-cover">
                </div>
            `).join("");

            const colorContainer =
                document.getElementById("color-options");

            colorContainer.innerHTML = `
                <span class="text-xs text-gray-400">
                    Tidak ada varian warna
                </span>
            `;

            const sizeContainer =
                document.getElementById("size-options");

            const sizeSection =
                document.getElementById("product-size-section");

            const sizeGuideSection =
                document.getElementById("size-guide-section");

            const isClothing =
                [1, 2, 3, 4].includes(
                    Number(product.category_id)
                );

            if (isClothing) {

                sizeSection?.classList.remove("hidden");
                sizeGuideSection?.classList.remove("hidden");

                sizeContainer.innerHTML =
                    product.sizes.map((size, i) => `
                        <button
                            onclick="sellerSelectSize('${size}', this)"
                            class="seller-size-btn px-2 py-1 border text-xs uppercase font-bold ${
                                i === 0
                                    ? "border-[#DF414F] bg-[#fff1ee]"
                                    : "border-gray-200"
                            }">
                            ${size}
                        </button>
                    `).join("");

            } else {

                sellerSelectedSize = "";

                sizeSection?.classList.add("hidden");
                sizeGuideSection?.classList.add("hidden");

                sizeContainer.innerHTML = "";
            }

            sellerUpdateLabels();

            if (typeof loadProductComments === "function") {
                loadProductComments(product.id);
            }

            const modal =
                document.getElementById("product-modal");

            modal.classList.remove("hidden");
            modal.classList.add("flex");

            document.body.style.overflow = "hidden";
        });

    } catch (err) {
        console.error(err);
        showIosModal("Gagal memuat detail produk");
    }
}

function sellerChangePreview(src, el, current, total) {
    const preview = document.getElementById('main-preview');

    preview.src = src;

    document.querySelectorAll('.thumb-item').forEach(t => {
        t.classList.remove('border-[#DF414F]', 'ring-1');
        t.classList.add('border-gray-200');
    });

    el.classList.add('border-[#DF414F]', 'ring-1');
}

function sellerSelectColor(color, el) {
    sellerSelectedColor = color;
    sellerUpdateLabels();

    document.querySelectorAll('.seller-color-btn').forEach(b => {
        b.className = "seller-color-btn px-2 py-1 border text-xs uppercase font-bold border-gray-200";
    });

    el.className = "seller-color-btn px-2 py-1 border text-xs uppercase font-bold border-[#DF414F] bg-[#fff1ee] text-[#DF414F]";
}

function sellerSelectSize(size, el) {
    sellerSelectedSize = size;
    sellerUpdateLabels();

    document.querySelectorAll('.seller-size-btn').forEach(b => {
        b.className = "seller-size-btn px-2 py-1 border text-xs uppercase font-bold border-gray-200";
    });

    el.className = "seller-size-btn px-2 py-1 border text-xs uppercase font-bold border-[#DF414F] bg-[#fff1ee] text-[#DF414F]";
}

function sellerUpdateLabels() {
    const c = document.getElementById('selected-color-text');
    const s = document.getElementById('selected-size-text');

    if (c) c.innerText = sellerSelectedColor;
    if (s) s.innerText = sellerSelectedSize;
}

window.shareProduct = async function () {
  const title =
    document.getElementById("detail-name")?.textContent.trim() ||
    "Produk Northline";
  const price =
    document.getElementById("detail-price")?.textContent.trim() || "";
  const productId = currentProductId;
  const url = `${location.origin}/?product=${productId}`;
  try {
    if (navigator.share) {
      await navigator.share({
        title,
        text: `${title}\n${price}`,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      showIosModal("Link produk berhasil disalin");
    }
  } catch (err) {
    console.log(err);
  }
};

window.addEventListener("DOMContentLoaded", async () => {
  await loadModalStructure();

  const params = new URLSearchParams(window.location.search);
  const productId = parseInt(params.get("product"));

  if (productId) {
    setTimeout(() => {
      openProductDetail(productId);
    }, 300);
  }
});