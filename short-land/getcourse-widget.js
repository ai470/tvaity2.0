(function () {
  "use strict";

  // Из <script src="https://my.tvaity.ru/pl/lite/widget/script?id=1657350">
  var GC_ACCOUNT_ORIGIN = "https://my.tvaity.ru";
  var GC_WIDGET_ID = "1657350";
  var GC_BASE_SRC = GC_ACCOUNT_ORIGIN + "/pl/lite/widget/widget?id=" + GC_WIDGET_ID;
  var GC_UNIQ_NAME = "9bac8499ba59f5edc8a0b37fd896ce498bb63482";

  // Сам блок GetCourse отдаёт вокруг формы свои отступы:
  //   #ltBlock2251705393 .lt-block-wrapper { padding-top: 75px; padding-bottom: 75px }
  // Это чужой домен, CSS туда не достаёт, поэтому пустоту срезаем снаружи.
  // Если отступы блока обнулить в админке GetCourse — поставить здесь 0.
  var GC_INNER_PADDING = 75;

  // Ниже этой высоты считаем, что GetCourse прислал промежуточное значение,
  // и не сжимаем под него контейнер.
  var GC_MIN_USABLE_HEIGHT = GC_INNER_PADDING * 2 + 160;

  function init() {
    var layer = document.getElementById("gc-layer");
    var frameContainer = document.getElementById("gc-frame-container");
    if (!layer || !frameContainer) return;

    var iframeSrc = window.GcTracking.withTrackingParams(GC_BASE_SRC);

    var iframe = document.createElement("iframe");
    iframe.src = iframeSrc;
    iframe.name = GC_UNIQ_NAME;
    iframe.title = "Регистрация — ТВАЙТИ 2.0";
    iframe.loading = "eager";
    iframe.allowFullscreen = true;
    // Удобно проверить собранные метки прямо в DevTools, не заходя в GetCourse.
    iframe.setAttribute("data-gc-src", iframeSrc);
    window.__gcIframeSrc = iframeSrc;
    frameContainer.appendChild(iframe);

    var lastOpener = null;

    function openLayer(opener) {
      lastOpener = opener || null;
      layer.classList.add("is-open");
      layer.setAttribute("aria-hidden", "false");
      document.body.classList.add("gc-layer-open");
    }

    function closeLayer() {
      layer.classList.remove("is-open");
      layer.setAttribute("aria-hidden", "true");
      document.body.classList.remove("gc-layer-open");
      if (lastOpener && typeof lastOpener.focus === "function") {
        lastOpener.focus();
      }
    }

    document.querySelectorAll("[data-gc-open]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        openLayer(btn);
      });
    });

    layer.querySelectorAll("[data-gc-close]").forEach(function (el) {
      el.addEventListener("click", closeLayer);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && layer.classList.contains("is-open")) {
        closeLayer();
      }
    });

    var appliedHeight = 0;

    function applyHeight(height) {
      if (height === appliedHeight) return;
      appliedHeight = height;

      // Срезаем собственные отступы блока GetCourse: iframe тянем на полную
      // присланную высоту и сдвигаем вверх, а видимое окно делаем короче.
      var crop = height >= GC_MIN_USABLE_HEIGHT ? GC_INNER_PADDING : 0;

      iframe.style.height = height + "px";
      iframe.style.marginTop = crop ? -crop + "px" : "";
      frameContainer.style.height = height - crop * 2 + "px";
      layer.setAttribute("data-gc-sized", "");
    }

    window.addEventListener("message", function (event) {
      var data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      if (!data || typeof data !== "object") return;

      // Как проверяет сам GetCourse. Origin не используем как единственный фильтр:
      // аккаунт может отвечать с другого хоста, и тогда высота молча не применялась бы.
      var isOurWidget =
        data.uniqName === GC_UNIQ_NAME ||
        (event.source === iframe.contentWindow && event.origin === GC_ACCOUNT_ORIGIN);
      if (!isOurWidget) return;

      var height = Number(data.height || data.frameHeight || (data.data && data.data.height));
      if (!isFinite(height) || height <= 0) return;

      applyHeight(height);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
