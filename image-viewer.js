(() => {
  const images = Array.from(document.querySelectorAll('main img'));
  const viewer = document.querySelector('.image-viewer');
  const image = viewer.querySelector('.viewer-image');
  const counter = viewer.querySelector('.viewer-counter');
  const stage = viewer.querySelector('.viewer-stage');
  let currentIndex = 0;
  let opener = null;
  let swipe = null;

  function showImage(index) {
    currentIndex = (index + images.length) % images.length;
    const source = images[currentIndex];
    image.src = source.currentSrc || source.src;
    image.alt = source.alt;
    counter.textContent = `Bild ${currentIndex + 1} av ${images.length}`;
  }

  images.forEach((thumbnail, index) => {
    thumbnail.setAttribute('role', 'button');
    thumbnail.setAttribute('tabindex', '0');
    thumbnail.setAttribute('aria-haspopup', 'dialog');
    thumbnail.setAttribute('aria-label', `Öppna bild: ${thumbnail.alt}`);

    function open() {
      opener = thumbnail;
      showImage(index);
      document.documentElement.classList.add('viewer-open');
      viewer.showModal();
    }

    thumbnail.addEventListener('click', open);
    thumbnail.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });

  viewer.querySelector('.viewer-close').addEventListener('click', () => viewer.close());
  viewer.querySelector('.viewer-previous').addEventListener('click', () => showImage(currentIndex - 1));
  viewer.querySelector('.viewer-next').addEventListener('click', () => showImage(currentIndex + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showImage(currentIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  viewer.addEventListener('close', () => {
    document.documentElement.classList.remove('viewer-open');
    swipe = null;
    image.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });

  // Native vertical scrolling and pinch zoom cancel the pointer gesture.
  // Only a deliberate, predominantly horizontal swipe changes the photo.
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary) {
      swipe = null;
      return;
    }
    if (event.button !== 0) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      showImage(currentIndex + (dx < 0 ? 1 : -1));
    }
  });
  stage.addEventListener('pointercancel', () => { swipe = null; });
  stage.addEventListener('lostpointercapture', () => { swipe = null; });
})();
