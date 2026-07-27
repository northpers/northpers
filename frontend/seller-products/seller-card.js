async function loadSellerProducts() {

    const res =
        await fetch("/api/products");

    const result =
        await res.json();

    const container =
        document.getElementById("seller-product-container");

    container.innerHTML = result.products.map(product => `
    <div
        class="group bg-white w-[200px] border border-gray-200 hover:border-[#DF414F] shadow-sm cursor-pointer"
        onclick="openSellerProductDetail(${product.id})">

        <div class="relative aspect-square bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer">
            <img 
                src="/uploads/product/${product.image}"
                class="w-full h-full object-cover transition duration-300"
                alt="${product.name}">
        </div>

        <div class="mt-2 px-2">

            <div class="block w-full leading-tight">
                <div class="relative -mt-[160px] pointer-events-none">
                    <img src="https://down-id.img.susercontent.com/file/id-11134258-8224z-mkvwcf6270g1ad.webp"
                        style="height: 180px;">
                </div>

                <span class="inline-flex items-center gap-1 bg-red-600 text-white font-bold px-1.5 py-0.5 text-[8px] uppercase tracking-wider shadow-sm whitespace-nowrap mr-1 align-middle select-none">
                    <img src="https://img.icons8.com/?size=100&id=F8sJNbgWH2bt&format=png&color=ffffff"
                        style="height: 10px;">
                    ${product.store_name}
                </span>

                <h3 class="inline text-sm md:text-base text-gray-800 tracking-tighter break-words align-middle">
                    ${product.name}
                </h3>
            </div>

            <div class="flex justify-between items-center">

                <div class="flex items-center gap-1.5">

                    <div class="flex flex-col price-container" data-product-id="${product.id}">
                        <span class="product-price-box text-[#DF414F] font-bold text-sm md:text-base">
                            IDR${Number(product.price).toLocaleString("id-ID")}
                        </span>
                    </div>

                    <span class="flex items-center gap-0.5 text-[#DF414F] text-[9px] font-medium">
                        <img src="https://img.icons8.com/?size=100&id=52172&format=png&color=DF414F"
                            class="w-5 h-5">
                    </span>
                </div>

            </div>

            <div class="flex items-center gap-1">
                <span id="card-stars-${product.id}" class="text-amber-400 md:text-[13px] text-[10px]">☆☆☆☆☆</span>

                <span class="text-gray-300 md:text-[12px] text-[10px] flex items-center">
                    <span id="card-count-${product.id}">0 Reviews</span>
                    <span class="mx-1.5 h-2.5 border-l border-gray-100"></span>

                    <span>${product.stock > 0 ? "Stok Ready" : "Habis"}</span>
                </span>
            </div>

            <div class="flex items-center gap-1 mt-1 pb-1 text-gray-500">

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

                <span class="text-[10px] md:text-xs tracking-tight truncate">
                    ${product.city || "-"}
                </span>

            </div>

        </div>
    </div>
    `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    loadSellerProducts();
});