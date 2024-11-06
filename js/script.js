window.addEventListener('scroll', function() {
    const p1 = document.querySelector('.p1');
    const scrollPosition = window.scrollY;

    if (scrollPosition > 150) {
        const blurValue = Math.min((scrollPosition - 150) / 100, 10);
        p1.style.filter = `blur(${2}px)`;
    } else {
        p1.style.filter = 'blur(0px)';
    }
});

let currentImageIndex = 0;
const images = [
    'images/sesame.png',
    'images/br.png'
];

const rotatingImage = document.getElementById('rotating-image');

function changeImage() {
    currentImageIndex = (currentImageIndex + 1) % images.length; 
    rotatingImage.style.opacity = 0; 

    setTimeout(() => {
        rotatingImage.src = images[currentImageIndex]; 
        rotatingImage.style.opacity = 1
    }, 500);
}
setInterval(changeImage, 5000);

let currentIndex = 0;

document.getElementById('prev-button').addEventListener('click', function() {
    currentIndex = (currentIndex > 0) ? currentIndex - 1 : images.length - 1;
    rotatingImage.src = images[currentIndex];
});

document.getElementById('next-button').addEventListener('click', function() {
    currentIndex = (currentIndex < images.length - 1) ? currentIndex + 1 : 0;
    rotatingImage.src = images[currentIndex];
});

document.addEventListener('touchmove', function(event) {

    if (event.touches.length === 1) {
  
  
      event.preventDefault();
  
  
    }
  
  
  }, { passive: false });
}

// async function getGoogleRating() {
//     const response = await fetch('https://g.co/kgs/nJGLpzC'); 
//     const data = await response.json();
//     return data.rating;
// }
