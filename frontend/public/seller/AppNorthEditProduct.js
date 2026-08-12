let editingProductId = null;

async function editProduct(productId) {
    try {

        const res = await fetch(`/api/product/${productId}`);
        const result = await res.json();

        if (!result.success) {
            return showIosModal("Produk tidak ditemukan");
        }

        const product = result.product;

        loadSellerPage("add-product");

        setTimeout(() => {

            document.getElementById("product-name").value =
                product.name || "";

            document.getElementById("product-description").value =
                product.description || "";

            document.getElementById("product-price").value =
                product.price || "";

            document.getElementById("product-stock").value =
                product.stock || "";

            document.getElementById("product-weight").value =
                product.weight || "";

            editingProductId = product.id;

            const btn =
                document.querySelector(
                    '[onclick="submitProduct()"]'
                );

            if (btn) {
                btn.innerText = "UPDATE PRODUK";
                btn.setAttribute(
                    "onclick",
                    "updateProduct()"
                );
            }

        }, 100);

    } catch (err) {
        console.error(err);
        showIosModal("Gagal memuat produk");
    }
}

async function updateProduct() {

    try {

        const formData = new FormData();

        formData.append(
            "name",
            document.getElementById("product-name").value
        );

        formData.append(
            "description",
            document.getElementById("product-description").value
        );

        formData.append(
            "price",
            document.getElementById("product-price").value
        );

        formData.append(
            "stock",
            document.getElementById("product-stock").value
        );

        formData.append(
            "weight",
            document.getElementById("product-weight").value
        );

        const files =
            document.getElementById("product-images").files;

        for (const file of files) {
            formData.append("images", file);
        }

        const res = await fetch(
            `/api/product/${editingProductId}`,
            {
                method: "PUT",
                body: formData
            }
        );

        const result = await res.json();

        if (!result.success) {
            return showIosModal(
                result.message || "Gagal update"
            );
        }

        showIosModal("Produk berhasil diupdate");

        editingProductId = null;

        loadMyProducts();

    } catch (err) {
        console.error(err);
        showIosModal("Terjadi kesalahan");
    }
}