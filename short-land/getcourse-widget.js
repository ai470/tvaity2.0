(function () {
  "use strict";

  // Из <script src="https://my.tvaity.ru/pl/lite/widget/script?id=1657350">
  var GC_ACCOUNT_ORIGIN = "https://my.tvaity.ru";
  var GC_WIDGET_ID = "1657350";
  var GC_BASE_SRC = GC_ACCOUNT_ORIGIN + "/pl/lite/widget/widget?id=" + GC_WIDGET_ID;
  var GC_UNIQ_NAME = "9bac8499ba59f5edc8a0b37fd896ce498bb63482";

  function getTrackingParamName(name) {
    var normalizedName = name.toLowerCase();
    if (normalizedName === "ref" || normalizedName.indexOf("utm_") === 0) {
      return normalizedName;
    }
    return null;
  }

  function buildGetCourseIframeSrc(opts) {
    var baseSrc = opts.baseSrc;
    var currentHref = opts.currentHref;
    var documentReferrer = opts.documentReferrer || "";
    var clrtQueryData = opts.clrtQueryData;

    var targetUrl = new URL(baseSrc);
    var currentUrl = new URL(currentHref);
    var trackingParams = [];

    currentUrl.searchParams.forEach(function (value, name) {
      var trackingName = getTrackingParamName(name);
      if (trackingName) {
        trackingParams.push([trackingName, value]);
      }
    });

    trackingParams.forEach(function (pair) {
      var name = pair[0];
      Array.from(targetUrl.searchParams.keys()).forEach(function (existingName) {
        if (existingName.toLowerCase() === name) {
          targetUrl.searchParams.delete(existingName);
        }
      });
    });

    trackingParams.forEach(function (pair) {
      targetUrl.searchParams.append(pair[0], pair[1]);
    });

    if (!targetUrl.searchParams.has("ref") && documentReferrer) {
      targetUrl.searchParams.set("ref", documentReferrer);
    }

    targetUrl.searchParams.set("loc", currentHref);

    try {
      if (clrtQueryData) {
        targetUrl.searchParams.set("clrtQueryData", JSON.stringify(clrtQueryData));
      }
    } catch (e) {
      // игнорируем ошибки сериализации
    }

    return targetUrl.toString();
  }

  function init() {
    var modal = document.getElementById("gc-modal");
    var frameContainer = document.getElementById("gc-frame-container");
    if (!modal || !frameContainer) return;

    var iframeSrc = buildGetCourseIframeSrc({
      baseSrc: GC_BASE_SRC,
      currentHref: window.location.href,
      documentReferrer: document.referrer,
      clrtQueryData: window.clrtQueryData,
    });

    var iframe = document.createElement("iframe");
    iframe.src = iframeSrc;
    iframe.name = GC_UNIQ_NAME;
    iframe.title = "Регистрация — ТВАЙТИ 2.0";
    iframe.loading = "eager";
    iframe.allowFullscreen = true;
    frameContainer.appendChild(iframe);

    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("gc-modal-open");
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("gc-modal-open");
    }

    document.querySelectorAll("[data-gc-open]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        openModal();
      });
    });

    modal.querySelectorAll("[data-gc-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal.classList.contains("is-open")) {
        closeModal();
      }
    });

    window.addEventListener("message", function (event) {
      if (event.origin !== GC_ACCOUNT_ORIGIN) return;

      var data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (e) {
          return;
        }
      }
      if (!data || typeof data !== "object") return;

      var frameId = data.uniqName || data.scriptId || data.iframeName || data.name;
      if (frameId && frameId !== GC_UNIQ_NAME) return;

      var height = data.height || data.frameHeight || (data.data && data.data.height);
      if (height) {
        iframe.style.height = height + "px";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
