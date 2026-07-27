const slider = document.getElementById("mobile-slider");

let index = 0;
const total = 3;

function moveSlide(i) {
  slider.style.transition = "transform 500ms ease-out";
  slider.style.transform = `translateX(-${i * 100}%)`;
}

setInterval(() => {
  index++;

  moveSlide(index);

  if (index === total) {
    setTimeout(() => {
      slider.style.transition = "none";
      slider.style.transform = "translateX(0)";
      index = 0;
    }, 500);
  }
}, 3000);
