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

function renderSellerProductCard(product) {
  const id = product.id;
  const rawImg = product.thumbnail || product.image || "";
  const img = rawImg
    ? /^https?:\/\//.test(rawImg) || rawImg.startsWith("/")
      ? rawImg
      : "/uploads/product/" + rawImg
    : "/public/icons/default.png";
  const discount = product.oldPrice && product.oldPrice > product.price
    ? Math.round((product.oldPrice - product.price) / product.oldPrice * 100) : 0;
  const blocked = product.status === "blocked";
  return '<div class="hover-bottom group bg-white w-[200px] shadow-sm border border-gray-200 hover:border-[#DF414F] cursor-pointer" onclick="editProduct(' + id + ')">'
    + '<div class="relative bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer h-auto">'
    + (blocked ? '<div class="absolute inset-0 z-10 flex items-center justify-center bg-white/20 backdrop-blur-sm"><div class="flex flex-col items-center"><span class="mt-1 text-[#DF414F] text-xs font-bold uppercase">Produk Diblokir</span></div></div>' : '')
    + '<img src="' + img + '" class="w-full h-auto block transition duration-300 ' + (blocked ? "opacity-50" : "") + '" alt="' + product.name + '" loading="lazy">'
    + '</div>'
    + '<div class="relative -mt-[150px] pointer-events-none">'
    + '<img src="https://down-id.img.susercontent.com/file/id-11134258-8224q-mkvvibsp8oowa6.webp" style="height: 180px;" loading="lazy">'
    + '</div>'
    + '<div class="mt-1 px-2">'
    + '<div class="block w-full leading-tight">'
    + '<span class="inline-flex items-center gap-1 text-[10px] -mr-[85px] tracking-wider whitespace-nowrap align-middle select-none">'
    + '<img src="https://nl.hostinesia.my.id/public/image/nrtNorthline.png" class="h-[90px] w-full -mb-[35px] -mt-[40px] -ml-[23px]" loading="lazy">'
    + '</span>'
    + '<h3 class="inline md:hidden text-sm md:text-base text-gray-800 tracking-tighter break-words align-middle" style="-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden;">' + product.name + '</h3></div>'
    + '<div class="flex justify-between items-center">'
    + '<div class="flex items-center gap-1.5">'
    + '<div class="flex flex-col price-container" data-product-id="' + id + '">'
    + '<span class="product-price-box text-[#DF414F] font-bold text-[13px] md:text-base">IDR ' + Number(product.price).toLocaleString("id-ID") + '</span>'
    + '</div>'
    + (discount > 0 ? '<span class="bg-[#fff1ee] text-[#DF414F] text-[9px] px-1 py-0.5 font-medium">-' + discount + '%</span>' : '')
    + '<span class="flex items-center gap-0.5 text-[#DF414F] text-[9px] font-medium">'
    + '<img src="https://img.icons8.com/?size=100&id=52172&format=png&color=DF414F" class="w-5 h-5" loading="lazy">'
    + '</span>'
    + '</div>'
    + '</div>'
    + '<div class="flex items-center gap-1">'
    + '<span id="card-stars-' + id + '" class="text-amber-400 md:text-[13px] text-[10px]">☆☆☆☆☆</span>'
    + '<span class="text-gray-300 md:text-[12px] text-[10px] flex items-center">'
    + '<span id="card-count-' + id + '">0 Reviews</span>'
    + '<span class="mx-1.5 h-2.5 border-l border-gray-100"></span>'
    + '<span>' + (product.stock > 0 ? "Stok " + product.stock : "Habis") + '</span>'
    + '</span>'
    + '</div>'
    + '<div class="bg-gradient-to-r from-[#DF414F] to-[#FFD6DA] text-white text-[10px] md:text-[12px] mt-1 px-2 gap-1 py-[1px] justify-center flex rounded">'
    + '<img src="https://img.icons8.com/?size=100&id=33479&format=png&color=ffffff" class="md:w-4 md:h-4 w-3 h-3" loading="lazy">'
    + 'Garansi Harga Terbaik'
    + '</div>'
    + '<div class="flex items-center gap-1 mt-1 mb-2 text-gray-500">'
    + '<img src="https://img.icons8.com/?size=100&id=llQVff4k5Qsy&format=png&color=9CA3AF" class="w-3 h-3 flex-shrink-0" alt="delivery" loading="lazy">'
    + '<span class="text-[9px] md:text-xs tracking-tight">5-7 Hari</span>'
    + '<span class="h-2.5 border-l border-gray-100 mx-1"></span>'
    + '<img src="https://img.icons8.com/?size=100&id=7880&format=png&color=9CA3AF" class="w-2.5 h-2.5 flex-shrink-0" alt="location" loading="lazy">'
    + '<span class="text-[9px] md:text-xs tracking-tight truncate">' + (product.city || "Kab Karawang") + '</span>'
    + '</div>'
    + '<button onclick="event.stopPropagation(); editProduct(' + id + ')" class="w-full mb-2 border text-white py-2 text-xs bg-[#DF414F] hover:bg-[#c83a47] transition">Edit Produk</button>'
    + '</div>'
    + '</div>';
}

function getMyProductsPage(products) {
  return `

<div class="bg-white border">
<div class="px-4 py-4 border-b flex justify-between items-center">

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

<div class="p-1">

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
        <div id="seller-product-container" class="grid grid-cols-2 md:grid-cols-6 gap-1 md:gap-1 md:p-0 justify-center">

            ${products.map((product) => renderSellerProductCard(product)).join("")}

        </div>
        `
    }

</div>

</div>
`;
}
