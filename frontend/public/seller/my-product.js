function _d(s){let r="";for(let i=0;i<s.length;i++){r+=String.fromCharCode(((s.charCodeAt(i)-32-10+95)%95)+32);}return r;}

function loadSellerPage(page) {
  const content = document.getElementById("seller-main-content");

  if (page === "add-product") {
    content.innerHTML = getAddProductPage();
    return;
  }

  if (page === "my-products") {
    loadMyProducts();
    return;
  }

  if (page === "blocked-products") {
    loadBlockedProducts();
    return;
  }
}

let _sellerUser = null;
(async () => {
  try {
    const meRes = await fetch(_d('9kzs9k ~r9wo'), { credentials: "include" });
    if (meRes.ok) {
      const meData = await meRes.json();
      _sellerUser = meData.data || meData.user || meData;
    }
  } catch (e) {}
})();

async function loadMyProducts() {
  if (!_sellerUser) return;
  const sellerRes = await fetch(`/api/seller/status/${_sellerUser.id}`);
  const sellerData = await sellerRes.json();
  if (!sellerData.success) {
    return;
  }
  const sellerId = sellerData.seller.id;
  const productRes = await fetch(`/api/seller/products/${sellerId}`);
  const productData = await productRes.json();

  document.getElementById("seller-main-content").innerHTML = getMyProductsPage(
    productData.products || [],
  );
}

function getMyProductsPage(products) {
  return `

<div class="bg-white border">
<div class="px-6 py-4 border-b flex justify-between items-center">

    <div>
        <h2 class="text-xl font-semibold">
            Produk Saya
        </h2>
        <p class="text-sm text-gray-500">
            Kelola seluruh produk toko Anda
        </p>
    </div>

    <button
        onclick="loadSellerPage('add-product')"
        class="bg-[#DF414F] text-white px-4 py-2 text-sm">
        + Tambah Produk
    </button>

</div>

<div class="p-6">

    ${
      !products.length
        ? `
        <div class="text-center py-20">

            <img
                src="https://img.icons8.com/?size=100&id=8440&format=png&color=000000"
                class="mx-auto w-16 mb-3">

            <p class="text-gray-500">
                Belum ada produk
            </p>

        </div>
        `
        : `
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">

            ${products
              .map(
                (product) => `

                <div class="group bg-white p-2 border border-gray-200 cursor-pointer transition-all">

                    <div class="relative bg-gray-50 overflow-hidden">
                    <img
                        src="/uploads/product/${product.thumbnail || ""}"
                        class="w-full aspect-square object-cover transition duration-300 ${
                        product.status === "blocked" ? "opacity-50" : ""
                        }"
                        alt="${product.name}">
                    ${
                    product.status === "blocked"
                        ? `
                        <div class="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-sm">
                            <div
                                class="flex flex-col items-center">
                                <img
                                    src="https://img.icons8.com/?size=100&id=Ss9sfCwuPUH9&format=png&color=DF414F"
                                    class="w-12 h-12">
                                <span
                                    class="mt-1 text-[#DF414F] text-xs font-bold uppercase">
                                    Produk Diblokir
                                </span>
                            </div>
                        </div>
                        `
                        : ""
                    }

                </div>

                    <div class="mt-2 px-1">

                        <div class="relative -mt-[150px] pointer-events-none">
                            <img src="https://down-id.img.susercontent.com/file/id-11134258-8224z-mkvwcf6270g1ad.webp"
                                style="height: 180px;">
                        </div>

                        <div class="block w-full leading-tight">
                            <span
                                class="inline-flex items-center gap-1 bg-red-600 text-white font-bold px-1.5 py-0.5 text-[8px] uppercase tracking-wider shadow-sm whitespace-nowrap mr-1 align-middle">
                                <img
                                    src="https://img.icons8.com/?size=100&id=F8sJNbgWH2bt&format=png&color=ffffff"
                                    class="w-2.5 h-2.5">
                                ${product.store_name}
                            </span>
                            <h3
                                class="inline text-[15px] text-gray-800 tracking-tight break-words">
                                ${product.name}
                            </h3>

                        </div>

                        <div class="flex justify-between items-center mt-2">

                            <div class="flex flex-col">
                                <span
                                    class="text-[#DF414F] font-bold text-sm md:text-base">
                                    IDR ${Number(product.price).toLocaleString("id-ID")}
                                </span>
                            </div>

                        </div>

                        <div class="flex justify-between items-center">

                            <div class="flex items-center gap-1">
                                <span
                                    class="text-amber-400 text-[13px]">
                                    ★★★★★
                                </span>

                                <span
                                    class="text-gray-400 text-[13px]">
                                    0 Reviews
                                </span>

                                <img
                                    src="https://img.icons8.com/?size=100&id=o79YYeFnMJ9A&format=png&color=9CA3AF"
                                    class="w-3 h-3">

                                <span
                                    class="text-[12px] text-gray-400">
                                    Stok ${product.stock}
                                </span>
                            </div>

                        </div>

                            <div class="flex items-center gap-1 mt-1 text-gray-500">

                                <img src="https://img.icons8.com/?size=100&id=llQVff4k5Qsy&format=png&color=9CA3AF"
                                    class="w-3 h-3 flex-shrink-0"
                                    alt="delivery">

                                <span class="text-[10px] md:text-xs tracking-tight">
                                    5-7 Hari
                                </span>

                                <span class="h-2.5 border-l border-gray-100 mx-1"></span>

                                <img src="https://img.icons8.com/?size=100&id=7880&format=png&color=9CA3AF"
                                    class="w-2.5 h-2.5 flex-shrink-0"
                                    alt="location">

                                <!-- CITY DARI DB -->
                                <span class="text-[10px] md:text-xs tracking-tight truncate">
                                    ${product.city || "Loading..."}
                                </span>

                            </div>

                        <button
                            onclick="editProduct(${product.id})"
                            class="w-full mt-3 border text-white py-2 text-xs bg-[#DF414F] hover:text-white transition">
                            Edit Produk
                        </button>

                    </div>

                </div>

                `,
              )
              .join("")}

        </div>
        `
    }

</div>

</div>
`;
}
