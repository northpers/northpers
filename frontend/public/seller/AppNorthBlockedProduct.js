async function loadBlockedProducts() {
  if (!_sellerUser) await _initSellerUser();
  const user = _sellerUser;
  const response = await fetch(`/api/seller/blocked-products/${user.id}`);
  const result = await response.json();
  const content = document.getElementById("seller-main-content");
  if (!result.success) {
    content.innerHTML =
      "<div class='bg-white border p-6'>Gagal memuat data</div>";
    return;
  }

  content.innerHTML = `
        <div class="bg-white border">

            <div class="px-6 py-4 border-b">
                <h2 class="text-xl font-semibold">
                    Produk Diblokir
                </h2>
                <p class="text-sm text-gray-500">
                    Produk yang diblokir oleh Northline.
                </p>
            </div>

            <div class="divide-y">

                ${
                  result.products.length
                    ? result.products
                        .map(
                          (p) => `
                        <div class="p-5 flex items-center justify-between">

                            <div>
                                <div class="font-medium">
                                    ${p.name}
                                </div>

                                <div class="text-xs text-red-500 mt-1">
                                    ${p.block_reason || "Melanggar kebijakan platform"}
                                </div>
                            </div>

                            <span
                                class="text-xs bg-red-100 text-red-600 px-3 py-1">
                                DIBLOKIR
                            </span>

                        </div>
                    `,
                        )
                        .join("")
                    : `
                        <div class="py-10 text-center text-gray-400">
                            Tidak ada produk diblokir.
                        </div>
                    `
                }

            </div>

        </div>
    `;
}
