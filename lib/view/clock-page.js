// lib/view/clock-page.js -- the clock (panels/extra/clock.html; D-unified-dock: the
// dock's box between the lists, in place of a logo). The local time, HH:MM:SS,
// as large as the box lets it be, and the date under it when there is room.
// Only shows: no keys, nothing on the bus, not one of the panels focused last.
(function () {
  'use strict';
  var T = window.Tezcatl;
  var params = new URLSearchParams(location.search);
  T.bus.identify({ role: 'clock', name: params.get('name') || null });
  var timeEl = document.getElementById('time');
  var dateEl = document.getElementById('date');

  function two(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var d = new Date();
    timeEl.textContent = two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
    dateEl.textContent = d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' +
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  }

  // the time as large as fits: 8 cells wide, and the date's line left under it when there is room
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    var withDate = h > 44;
    dateEl.style.display = withDate ? '' : 'none';
    var size = Math.max(9, Math.floor(Math.min(w / 5.2, (h - (withDate ? 18 : 0)) * 0.8)));
    timeEl.style.fontSize = size + 'px';
  }

  tick();
  fit();
  // to the next second, then every second
  setTimeout(function () { tick(); setInterval(tick, 1000); }, 1000 - new Date().getMilliseconds());
  window.addEventListener('resize', fit);
})();
