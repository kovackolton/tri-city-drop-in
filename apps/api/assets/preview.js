const photo = document.querySelector('[data-fallback]');
if (photo) photo.addEventListener('error', () => { photo.src = photo.dataset.fallback; photo.alt = 'Soccer ball'; document.querySelector('.photo-credit')?.setAttribute('hidden', ''); }, { once: true });
