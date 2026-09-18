(function () {
  var el = document.querySelector('[data-countdown]');
  if (!el) return;

  var target = new Date(el.getAttribute('data-target')).getTime();
  var valueEls = {
    days: el.querySelector('[data-unit="days"]'),
    hours: el.querySelector('[data-unit="hours"]'),
    minutes: el.querySelector('[data-unit="minutes"]'),
    seconds: el.querySelector('[data-unit="seconds"]')
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function tick() {
    var diff = target - Date.now();
    if (diff < 0) diff = 0;

    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);
    var seconds = Math.floor((diff % 60000) / 1000);

    valueEls.days.textContent = pad(days);
    valueEls.hours.textContent = pad(hours);
    valueEls.minutes.textContent = pad(minutes);
    valueEls.seconds.textContent = pad(seconds);
  }

  tick();
  setInterval(tick, 1000);
})();
