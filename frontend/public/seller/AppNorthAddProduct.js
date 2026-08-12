let selectedImages = [];

const categoryEl = document.getElementById("product-category");
const wrapper = document.getElementById("size-wrapper");

const fashionCategories = ["1", "2", "3", "4"];

function renderImagePreview() {
  const preview = document.getElementById("product-image-preview");

  preview.innerHTML = "";

  for (let i = 0; i < 9; i++) {
    const file = selectedImages[i];

    if (file) {
      const reader = new FileReader();

      reader.onload = (ev) => {
        const wrapper = document.createElement("div");

        wrapper.className =
            "relative aspect-square border overflow-hidden group";

        wrapper.innerHTML = `
          <img
            src="${ev.target.result}"
            class="w-full h-full object-cover transition-all duration-200 group-hover:blur-sm"
          >

          <div
            class="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition"
          ></div>

          <button
            type="button"
            onclick="removeImage(${i})"
            class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                   bg-red-600 text-white text-[8px]
                   opacity-0 group-hover:opacity-100 transition z-10 px-1.5 py-0.5"
          >
            Hapus
          </button>
        `;

        preview.appendChild(wrapper);
      };

      reader.readAsDataURL(file);
    } else {
      const label = document.createElement("label");

      label.setAttribute("for", "product-images");

      label.className =
        "aspect-square border bg-[#fafafa] flex flex-col items-center justify-center cursor-pointer hover:border-[#DF414F]";

      label.innerHTML = `
        <img src="https://img.icons8.com/ios/100/image--v1.png" class="w-4 opacity-40">
        <span class="text-[8px] text-gray-500 mt-1">Tambah</span>
      `;

      preview.appendChild(label);
    }
  }
}

function removeImage(index) {
  selectedImages.splice(index, 1);

  document.getElementById("product-images").value = "";

  renderImagePreview();
}

function getAddProductPage() {
  return `
<div class="bg-white border">

    <div class="px-4 py-4 border-b">
        <h2 class="text-xl font-semibold">
            Tambah Produk Baru
        </h2>
        <p class="text-sm text-gray-500 mt-1">
            Lengkapi informasi produk yang akan dijual.
        </p>
    </div>

    <div class="p-1">

<div class="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div class="md:col-span-4">
                <h3 class="font-semibold text-gray-800 mb-3">
                    Foto Produk
                </h3>
                <input
                    id="product-images"
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png"
                    class="hidden">
                <div
                    id="product-image-preview"
                    class="grid grid-cols-6 gap-2">

                    ${Array(9)
                      .fill("")
                      .map(
                        () => `
                        <label
                            for="product-images"
                            class="aspect-square border bg-[#fafafa]
                                   flex flex-col items-center
                                   justify-center cursor-pointer
                                   hover:border-[#DF414F]">
                            <img
                                src="https://img.icons8.com/ios/100/image--v1.png"
                                class="w-4 opacity-40">
                            <span
                                class="text-[8px] text-gray-500 mt-1">
                                Tambah
                            </span>
                        </label>
                    `,
                      )
                      .join("")}
                </div>
                <p class="text-xs text-gray-500 mt-4">
                    Maksimal 9 foto • JPG, JPEG, PNG • Maks 1MB/foto
                </p>
            </div>

            <div class="md:col-span-8">

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

                    <!-- KOLOM 1 -->
                    <div class="space-y-4">

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Nama Produk
                            </label>

                            <input
                                id="product-name"
                                type="text"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                            <p class="mt-1 text-[11px] text-red-500">
                                Maksimal 255 karakter.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Kategori
                            </label>

                            <select
                                id="product-category"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                                <option value="">Pilih Kategori</option>
                                <option value="1">Kaos</option>
                                <option value="2">Kemeja</option>
                                <option value="3">Hoodie</option>
                                <option value="4">Jaket</option>
                                <option value="other">Lainnya</option>

                            </select>

                            <p class="mt-1 text-[11px] text-red-500">
                                Pilih kategori yang paling sesuai.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Brand
                            </label>

                            <input
                                id="product-brand"
                                type="text"
                                placeholder="Contoh: Northline"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                            <p class="mt-1 text-[11px] text-red-500">
                                Gunakan nama brand agar produk lebih mudah ditemukan.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                SKU
                            </label>

                            <input
                                id="product-sku"
                                type="text"
                                placeholder="Contoh: NTL-LS-BLK-M"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                            <p class="mt-1 text-[11px] text-red-500">
                                SKU digunakan untuk pengelolaan stok produk.
                            </p>
                        </div>

                    </div>

                    <!-- KOLOM 2 -->
                    <div class="space-y-4">

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Kondisi
                            </label>

                            <select
                                id="product-condition"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                                <option value="baru">Baru</option>
                                <option value="bekas">Bekas</option>

                            </select>

                            <p class="mt-1 text-[11px] text-red-500">
                                Pilih kondisi produk sesuai keadaan sebenarnya.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Harga
                            </label>
                            <div class="relative">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                                    IDR
                                </span>
                                <input
                                    id="product-price"
                                    type="number"
                                    class="w-full h-10 border border-gray-300 pl-12 pr-3 text-sm
                                    focus:outline-none focus:ring-0 focus:border-gray-300">
                            </div>
                            <p class="mt-1 text-[11px] text-red-500">
                                Masukkan harga tanpa titik atau koma.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Minimum Pembelian
                            </label>

                            <input
                                id="product-min-order"
                                type="number"
                                value="1"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                            <p class="mt-1 text-[11px] text-red-500">
                                Jumlah minimum produk yang dapat dibeli.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Stok
                            </label>

                            <input
                                id="product-stock"
                                type="number"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                            <p class="mt-1 text-[11px] text-red-500">
                                Jumlah stok yang tersedia.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Berat (gram)
                            </label>

                            <input
                                id="product-weight"
                                type="number"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                            <p class="mt-1 text-[11px] text-red-500">
                                Digunakan untuk perhitungan ongkos kirim.
                            </p>
                        </div>

                    </div>

                    <!-- KOLOM 3 -->
                    <div class="space-y-4">

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Kategori Produk
                            </label>

                            <select
                                id="product-type"
                                class="w-full h-10 border border-gray-300 px-3 text-sm
                                focus:outline-none focus:ring-0 focus:border-gray-300">

                                <option value="">Pilih Kategori</option>
                                <option value="fashion">Fashion / Apparel</option>
                                <option value="accessories">Accessories</option>
                                <option value="merchandise">Merchandise</option>
                                <option value="others">Lainnya</option>

                            </select>

                            <p class="mt-1 text-[11px] text-red-500">
                                Tentukan jenis produk yang dijual.
                            </p>
                        </div>

                        <div id="size-wrapper">
                            <label class="block text-sm font-medium mb-2">
                                Ukuran Tersedia
                            </label>

                            <div class="grid grid-cols-3 gap-2 text-sm">

                                <label><input type="checkbox" value="S" class="product-size"> S</label>
                                <label><input type="checkbox" value="M" class="product-size"> M</label>
                                <label><input type="checkbox" value="L" class="product-size"> L</label>
                                <label><input type="checkbox" value="XL" class="product-size"> XL</label>
                                <label><input type="checkbox" value="XXL" class="product-size"> XXL</label>

                            </div>

                            <p class="mt-1 text-[11px] text-red-500">
                                Pilih ukuran yang tersedia untuk produk ini.
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium mb-2">
                                Deskripsi Produk
                            </label>

                            <textarea
                                id="product-description"
                                rows="11"
                                class="w-full border border-gray-300 px-3 py-2 text-sm resize-none
                                focus:outline-none focus:ring-0 focus:border-gray-300"></textarea>

                            <p class="mt-1 text-[11px] text-red-500">
                                Jelaskan produk secara detail untuk meningkatkan konversi penjualan.
                            </p>
                        </div>

                    </div>

                </div>

                <div class="pt-6 mt-6 border-t">

                    <button
                        onclick="submitProduct()"
                        class="bg-[#DF414F]
                        hover:bg-[#c83a47]
                        text-white
                        text-[12px]
                        font-semibold
                        px-6
                        h-10">

                        SIMPAN PRODUK

                    </button>

                </div>

            </div>
        </div>
    </div>
</div>
`;
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "product-category") return;

  const wrapper = document.getElementById("size-wrapper");
  const fashionCategories = ["1", "2", "3", "4"];

  wrapper.classList.toggle(
    "hidden",
    !fashionCategories.includes(e.target.value),
  );
});

document.addEventListener("change", (e) => {
  if (e.target.id !== "product-images") return;

  const files = Array.from(e.target.files);

  const MAX_SIZE = 1 * 1024 * 1024;

  for (const file of files) {
    if (file.size > MAX_SIZE) {
      e.target.value = "";
      return showIosModal(`Gambar "${file.name}" terlalu besar. Maksimal 1MB`);
    }
  }

  selectedImages = [...selectedImages, ...files].slice(0, 9);

  renderImagePreview();

  e.target.value = "";
});

function updateSizeVisibility(value) {
  wrapper.classList.toggle("hidden", !fashionCategories.includes(value));
}

document.addEventListener("change", (e) => {
  if (e.target.id !== "product-category") return;
  updateSizeVisibility(e.target.value);
});

if (categoryEl) {
  updateSizeVisibility(categoryEl.value);
}

async function submitProduct() {
  const user = _sellerUser;

  if (!user || !user.id) {
    return showIosModal("Silakan login terlebih dahulu");
  }

  const name = document.getElementById("product-name").value.trim();

  const description = document
    .getElementById("product-description")
    .value.trim();

  const price = document.getElementById("product-price").value;

  const stock = document.getElementById("product-stock").value;

  const weight = document.getElementById("product-weight").value;

  const files = selectedImages;

  const categoryId = document.getElementById("product-category").value;

  const brand = document.getElementById("product-brand").value.trim();

  const sku = document.getElementById("product-sku").value.trim();

  const conditionType = document.getElementById("product-condition").value;

  const minOrder = document.getElementById("product-min-order").value || 1;

  const category = document.getElementById("product-type").value;

  const sizes = [...document.querySelectorAll(".product-size:checked")].map(
    (x) => x.value,
  );

  if (!name) {
    return showIosModal("Nama produk wajib diisi");
  }

  if (!description) {
    return showIosModal("Deskripsi produk wajib diisi");
  }

  if (!categoryId) {
    return showIosModal("Kategori wajib dipilih");
  }

  if (!price || Number(price) <= 0) {
    return showIosModal("Harga produk tidak valid");
  }

  if (!stock || Number(stock) < 0) {
    return showIosModal("Stok produk wajib diisi");
  }

  if (!weight || Number(weight) <= 0) {
    return showIosModal("Berat produk wajib diisi");
  }

  if (files.length === 0) {
    return showIosModal("Minimal 1 foto produk");
  }

  const MAX_SIZE = 1 * 1024 * 1024;

  for (const file of files) {
    if (file.size > MAX_SIZE) {
      return showIosModal(
        `Gambar "${file.name}" terlalu besar. Maksimal 1MB per gambar.`,
      );
    }
  }

  if (["1", "2", "3", "4"].includes(categoryId) && sizes.length === 0) {
    return showIosModal("Pilih minimal 1 ukuran produk");
  }

  const formData = new FormData();

  formData.append("user_id", user.id);
  formData.append("name", name);
  formData.append("description", description);
  formData.append("price", price);
  formData.append("stock", stock);
  formData.append("weight", weight);

  formData.append("category_id", categoryId);
  formData.append("category", category);

  formData.append("brand", brand);
  formData.append("sku", sku);

  formData.append("condition_type", conditionType);

  formData.append("min_order", minOrder);

  formData.append("sizes", JSON.stringify(sizes));

  for (const file of files) {
    formData.append("images", file);
  }

  try {
    const btn = document.querySelector('[onclick="submitProduct()"]');

    if (btn) {
      btn.disabled = true;
      btn.innerText = "MENGUPLOAD...";
    }

    const response = await fetch("/api/product/create", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      showIosModal("Produk berhasil ditambahkan");

      document.getElementById("product-name").value = "";
      document.getElementById("product-description").value = "";
      document.getElementById("product-price").value = "";
      document.getElementById("product-stock").value = "";
      document.getElementById("product-weight").value = "";
      document.getElementById("product-brand").value = "";
      document.getElementById("product-sku").value = "";
      document.getElementById("product-images").value = "";

      document
        .querySelectorAll(".product-size")
        .forEach((el) => (el.checked = false));

      selectedImages = [];
      renderImagePreview();
    } else {
      showIosModal(result.message || "Gagal menambahkan produk");
    }
  } catch (err) {
    console.error(err);

    showIosModal("Maaf server sedang sibuk!");
  } finally {
    const btn = document.querySelector('[onclick="submitProduct()"]');

    if (btn) {
      btn.disabled = false;
      btn.innerText = "SIMPAN PRODUK";
    }
  }
}
