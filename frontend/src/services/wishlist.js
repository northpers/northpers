window.WishlistManager = {
  updateNavbarBadge: function () {
    const badge = document.getElementById("wishlist-badge");
    const mobileBadge = document.getElementById("wishlist-badge-mobile");
    const countHeader = document.getElementById("popup-wishlist-count");
    const currentItems =
      JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];
    const total = currentItems.reduce(
      (acc, item) => acc + (item.quantity || 1),
      0,
    );

    [badge, mobileBadge].forEach((el) => {
      if (el) {
        if (total > 0) {
          el.innerText = total > 9 ? "9+" : total;
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      }
    });

    if (countHeader) {
      if (total > 0) {
        countHeader.innerText = total > 9 ? "9+" : total;
        countHeader.classList.remove("hidden");
      } else {
        countHeader.classList.add("hidden");
      }
    }
  },

  save: function (idOrEvent, name, price, img) {
    let targetId = idOrEvent;
    let targetName = name;
    let targetPrice = price;
    let targetImg = img;

    if (
      idOrEvent &&
      typeof idOrEvent === "object" &&
      idOrEvent.preventDefault
    ) {
      const e = idOrEvent;
      e.preventDefault();
      e.stopPropagation();

      const btn = e.currentTarget || e.target;
      const card = btn.closest(".group") || btn.parentElement;

      const nameEl = card.querySelector("h3, h2, .product-name");
      targetName = nameEl ? nameEl.textContent.trim() : "Northline Product";
      targetId = nameEl
        ? "id-" + targetName.replace(/\s+/g, "-").toLowerCase()
        : "auto-" + Date.now();

      const productImgEl = Array.from(card.querySelectorAll("img")).find(
        (i) => !i.getAttribute("src")?.includes("icons8"),
      );
      targetImg = productImgEl
        ? productImgEl.getAttribute("src")
        : "/public/image/default.png";

      const priceEl = Array.from(
        card.querySelectorAll(
          ".text-northline-orange, .font-bold, .price, p, span, b, strong",
        ),
      ).find(
        (el) => el.textContent.includes("IDR") && el.textContent.length < 25,
      );

      targetPrice = priceEl
        ? priceEl.textContent.trim().replace(/\s+/g, " ")
        : "IDR0";
    }

    let currentItems =
      JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];
    const index = currentItems.findIndex((i) => i.id === targetId);

    if (index > -1) {
      currentItems[index].quantity = (currentItems[index].quantity || 1) + 1;
    } else {
      currentItems.push({
        id: targetId,
        name: targetName,
        price: targetPrice,
        img: targetImg,
        quantity: 1,
      });
    }

    localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(currentItems));
    this.updateNavbarBadge();
    renderChatSuggestion();

    const badge = document.getElementById("wishlist-badge");
    if (badge) {
      badge.classList.add("scale-125", "bg-red-600");
      setTimeout(() => badge.classList.remove("scale-125", "bg-red-600"), 300);
    }
  },

  saveFromModal: function () {
    if (!window.currentProduct) {
      showIosModal("Produk tidak ditemukan");
      return;
    }

    const product = window.currentProduct;

    const currentPrice = getCurrentPrice(product);

    const wishlistId = [
      product.id,
      selectedColor,
      selectedModel,
      selectedSize,
    ].join("-");

    let currentItems =
      JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];

    const existing = currentItems.findIndex((item) => item.id === wishlistId);

    if (existing > -1) {
      currentItems[existing].quantity += 1;
    } else {
      currentItems.push({
        id: wishlistId,
        productId: product.id,
        name: product.name,
        price: `IDR ${currentPrice.toLocaleString("id-ID")}`,
        img: document.getElementById("main-preview")?.src || product.images[0],

        color: selectedColor,
        model: selectedModel,
        size: selectedSize,

        quantity: 1,
      });
    }

    localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(currentItems));

    this.updateNavbarBadge();
    renderChatSuggestion();

    showIosModal("Produk berhasil ditambahkan ke wishlist");
  },

  togglePopup: function () {
    const popup = document.getElementById("wishlist-popup");
    if (!popup) return;
    popup.classList.toggle("hidden");
    if (!popup.classList.contains("hidden")) this.renderPopupItems();
  },

  renderPopupItems: function () {
    const container = document.getElementById("popup-items-container");
    const emptyState = document.getElementById("popup-empty-state");
    const countHeader = document.getElementById("popup-wishlist-count");

    if (!container || !emptyState || !countHeader) return;

    const items = JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];

    countHeader.innerText = items.reduce(
      (acc, item) => acc + (item.quantity || 1),
      0,
    );

    container
      .querySelectorAll(".wishlist-swipe-wrapper, .popup-skeleton-item")
      .forEach((el) => el.remove());

    emptyState.classList.add("hidden");

    if (items.length === 0) {
      emptyState.classList.remove("hidden");
    } else {
      items.forEach((item) => {
        const finalImgSrc =
          item.img.startsWith("http") || item.img.startsWith("/")
            ? item.img
            : `/public/image/${item.img}`;

        const shortName =
          item.name.length > 40
            ? item.name.substring(0, 40) + "..."
            : item.name;

        container.insertAdjacentHTML(
          "beforeend",
          `
                    <div class="wishlist-swipe-wrapper relative overflow-hidden cursor-pointer border border-gray-100">

                        <div class="absolute top-0 right-0 h-full w-16 bg-gray-50 flex items-center justify-center">
                            <button
                                type="button"
                                onclick="event.preventDefault(); event.stopPropagation(); WishlistManager.removeProduct('${item.id}')"
                                class="w-full h-full flex items-center justify-center">

                                <img
                                    src="https://img.icons8.com/?size=100&id=87397&format=png&color=000000"
                                    class="w-5 h-5">
                            </button>
                        </div>

                        <div data-product-id="${item.productId}" class="wishlist-card bg-white p-3 flex items-start gap-4 relative z-10 transition-transform duration-300">

                            <div class="relative w-20 h-15 bg-white overflow-hidden flex-shrink-0 border border-gray-200/60 flex items-center justify-center">

                                <img
                                    src="${finalImgSrc}"
                                    class="w-full h-full object-contain"
                                    onerror="this.src='/public/icons/default.png'">

                            </div>

                            <div class="flex-1 min-w-0 space-y-1">

                                <h4 class="text-gray-900 text-[13px]">
                                    ${shortName}
                                </h4>

                                <div class="flex flex-wrap gap-1">
                                    <span class="px-1 py-[1px] bg-white border text-[9px]">
                                        ${item.color || "-"}
                                    </span>

                                    <span class="px-1 py-[1px] bg-white border text-[9px]">
                                        ${item.model || "-"}
                                    </span>

                                    <span class="px-1 py-[1px] bg-white border text-[9px]">
                                        ${item.size || "-"}
                                    </span>
                                </div>

                                <p class="text-[12px] text-black">
                                    ${item.price}
                                </p>

                            </div>

                             ${
                               item.quantity > 1
                                 ? `
                                    <div class="absolute bottom-1 right-1 text-black text-[10px] min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                                        ×${item.quantity}
                                    </div>
                                    `
                                 : ""
                             }

                        </div>

                    </div>
                `,
        );
      });
    }

    setTimeout(() => {
      WishlistManager.initSwipeDelete();
    }, 50);

    document.querySelectorAll('.wishlist-card').forEach(card => {
        card.addEventListener('click', function() {

            const productId = this.dataset.productId;
            openProductDetail(productId);
        });
    });
  },

  initSwipeDelete: function () {
    document.querySelectorAll(".wishlist-swipe-wrapper").forEach((wrapper) => {
      const card = wrapper.querySelector(".wishlist-card");

      let startX = 0;
      let currentX = 0;
      let isDragging = false;

      card.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
      });

      card.addEventListener("touchmove", (e) => {
        if (!isDragging) return;

        currentX = e.touches[0].clientX;
        const diff = currentX - startX;

        if (diff < 0) {
          card.style.transform = `translateX(${Math.max(diff, -64)}px)`;
        }
      });

      card.addEventListener("touchend", () => {
        isDragging = false;

        const diff = currentX - startX;

        if (diff < -40) {
          document.querySelectorAll(".wishlist-card").forEach((el) => {
            if (el !== card) {
              el.style.transform = "translateX(0)";
            }
          });

          card.style.transform = "translateX(-64px)";
        } else {
          card.style.transform = "translateX(0)";
        }
      });

      let mouseDown = false;

      card.addEventListener("mousedown", (e) => {
        mouseDown = true;
        startX = e.clientX;
        card.style.transition = "none";
      });

      window.addEventListener("mousemove", (e) => {
        if (!mouseDown) return;

        currentX = e.clientX;
        const diff = currentX - startX;

        if (diff < 0) {
          card.style.transform = `translateX(${Math.max(diff, -64)}px)`;
        }
      });

      window.addEventListener("mouseup", () => {
        if (!mouseDown) return;

        mouseDown = false;
        card.style.transition = "transform .3s ease";

        const diff = currentX - startX;

        if (diff < -40) {
          document.querySelectorAll(".wishlist-card").forEach((el) => {
            if (el !== card) {
              el.style.transform = "translateX(0)";
            }
          });

          card.style.transform = "translateX(-64px)";
        } else {
          card.style.transform = "translateX(0)";
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".wishlist-swipe-wrapper")) {
        document.querySelectorAll(".wishlist-card").forEach((card) => {
          card.style.transform = "translateX(0)";
        });
      }
    });
  },

  removeProduct: function (id) {
    let items = JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST)) || [];
    items = items.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(items));
    this.updateNavbarBadge();
    this.renderPopupItems();
    renderChatSuggestion();
  },
};

WishlistManager.updateNavbarBadge();

if (typeof renderChatSuggestion === "function") {
    renderChatSuggestion();
}