const slider = document.getElementById("mobile-slider");

const indicatorItems = [
  document.getElementById("slide-indicator-0"),
  document.getElementById("slide-indicator-1"),
  document.getElementById("slide-indicator-2"),
];

let index = 0;
const total = 3;

function updateIndicator(activeIndex) {
  indicatorItems.forEach((item, i) => {
    if (i === activeIndex) {
      item.className =
        "h-1 w-5 bg-[#DF414F] rounded-full transition-all duration-300";
    } else {
      item.className =
        "w-1.5 h-1.5 bg-gray-100 rounded-full transition-all duration-300";
    }
  });
}

function moveSlide(i) {
  slider.style.transition = "transform 500ms ease-out";

  slider.style.transform = `translate3d(-${i * 100}%, 0, 0)`;

  updateIndicator(i % total);
}

setInterval(() => {
  index++;

  moveSlide(index);

  if (index === total) {
    setTimeout(() => {
      slider.style.transition = "none";

      slider.style.transform = "translate3d(0, 0, 0)";

      index = 0;

      updateIndicator(0);
    }, 500);
  }
}, 3000);
