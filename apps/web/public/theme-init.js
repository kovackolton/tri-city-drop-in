// Apply before CSS/app startup to avoid a bright first frame for dark-mode users.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('tri-city-theme'); } catch (_) { /* Storage may be disabled. */ }
  var dark = saved === 'dark' || (saved !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
