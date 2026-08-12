let modal, card;
let startX = 0;
let startY = 0;
let isDragging = false;
let autoCloseTimer;
let isExpanded = false;
let notifStartTime = null;
let msgEl, timeEl, arrow;

document.addEventListener("DOMContentLoaded", () => {
    modal = document.getElementById("ios-warning-modal");
    card = document.getElementById("notif-card");

    msgEl = document.getElementById("ios-modal-message");
    timeEl = document.getElementById("notif-time");
    arrow = document.getElementById("arrow");

    timeEl.addEventListener("click", (e) => {
        e.stopPropagation();

        isExpanded = !isExpanded;

        if (isExpanded) {
            msgEl.classList.remove("truncate");
            msgEl.classList.add("whitespace-normal");
            arrow.style.transform = "rotate(90deg)";
            clearTimeout(autoCloseTimer);
        } else {
            msgEl.classList.add("truncate");
            msgEl.classList.remove("whitespace-normal");
            arrow.style.transform = "rotate(0deg)";

            autoCloseTimer = setTimeout(closeIosModal, 3000);
        }
    });

    card.addEventListener("mousedown", startDrag);
    card.addEventListener("touchstart", startDrag);
});

function showIosModal(message) {
    if (!modal || !card) return;

    const titleEl = document.getElementById("ios-modal-title");

    titleEl.textContent = "Northline";
    if (message) msgEl.textContent = message;


    isExpanded = false;
    msgEl.classList.add("truncate");
    msgEl.classList.remove("whitespace-normal");
    arrow.style.transform = "rotate(0deg)";

    notifStartTime = new Date();
    updateTimeLabel();

    card.style.transform = "translate(0,0)";
    card.style.opacity = "1";

    modal.classList.remove("opacity-0", "translate-y-[-120%]");
    modal.classList.add("opacity-100", "translate-y-[10px]");

    clearTimeout(autoCloseTimer);
    autoCloseTimer = setTimeout(closeIosModal, 4000);
}

function closeIosModal() {
    const modal = document.getElementById("ios-warning-modal");
    const card = document.getElementById("notif-card");

    if (!modal || !card) return;

    modal.classList.remove("opacity-100", "translate-y-[10px]");
    modal.classList.add("opacity-0", "translate-y-[-120%]");

    card.style.transform = "translate(0,0)";
}

function startDrag(e) {
    isDragging = true;
    card.style.transition = "none";

    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
}

document.addEventListener("mousemove", onDrag);
document.addEventListener("touchmove", onDrag);

function onDrag(e) {
    if (!isDragging) return;

    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;

    const diffX = x - startX;
    const diffY = y - startY;

    card.style.transform = `translate(${diffX}px, ${diffY}px)`;
}

document.addEventListener("mouseup", endDrag);
document.addEventListener("touchend", endDrag);

function endDrag() {
    if (!isDragging) return;
    isDragging = false;

    card.style.transition = "all 0.25s ease";

    const transform = card.style.transform;
    const match = transform.match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)/);

    let x = 0, y = 0;
    if (match) {
        x = parseFloat(match[1]);
        y = parseFloat(match[2]);
    }

    if (Math.abs(x) > 120 || y < -80) {
        card.style.transform = `translate(${x * 2}px, ${y * 2}px)`;
        card.style.opacity = "0";

        setTimeout(closeIosModal, 200);
    } else {
        card.style.transform = "translate(0,0)";
    }
}

function updateTimeLabel() {
    if (!notifStartTime || !timeEl) return;

    const now = new Date();
    const diff = Math.floor((now - notifStartTime) / 1000);

    let text = "Just now";

    if (diff > 5 && diff < 60) {
        text = `${diff}s ago`;
    } else if (diff >= 60 && diff < 3600) {
        text = `${Math.floor(diff / 60)}m ago`;
    } else if (diff >= 3600) {
        text = `${Math.floor(diff / 3600)}h ago`;
    }

    timeEl.childNodes[0].nodeValue = text + " ";
}

setInterval(updateTimeLabel, 1000);