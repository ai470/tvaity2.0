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
    iframe.dataset.accountId = "915048";
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
      layer.scrollTop = 0;
      layer.querySelector(".gc-layer__inner").scrollTop = 0;
      layer.querySelector(".gc-layer__close").focus({ preventScroll: true });
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

    var contentHeight = 0;

    function resizeFrame() {
      // В самой форме GetCourse кнопка не помещается в 320px. Сохраняем её
      // рабочую ширину, уменьшая весь iframe только на самых узких экранах.
      var scale = Math.min(1, frameContainer.clientWidth / 360);
      if (scale <= 0) return;
      iframe.style.width = scale < 1 ? "360px" : "100%";
      iframe.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
      if (!contentHeight) return;

      // Срезаем собственные отступы блока GetCourse: iframe тянем на полную
      // присланную высоту и сдвигаем вверх, а видимое окно делаем короче.
      var crop = GC_INNER_PADDING;

      iframe.style.height = contentHeight + "px";
      iframe.style.marginTop = -crop * scale + "px";
      frameContainer.style.height = (contentHeight - crop * 2) * scale + "px";
      layer.setAttribute("data-gc-sized", "");
    }

    resizeFrame();
    window.addEventListener("resize", resizeFrame);

    window.addEventListener("message", function (event) {
      if (event.source !== iframe.contentWindow || event.origin !== GC_ACCOUNT_ORIGIN) return;
      var data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      if (!data || typeof data !== "object") return;

      if (data.uniqName && data.uniqName !== GC_UNIQ_NAME) return;

      var height = Number(data.height || data.frameHeight || (data.data && data.data.height));
      if (!isFinite(height) || height < GC_MIN_USABLE_HEIGHT) return;
      height = Math.ceil(height);
      if (height === contentHeight) return;

      contentHeight = height;
      resizeFrame();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
