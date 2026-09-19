/**
 * Маленький helper: переносит рекламные метки из адреса страницы в URL стороннего
 * виджета. Общий для всех мест, где встраивается GetCourse, чтобы метки собирались
 * одинаково.
 *
 * Забирает из window.location.search все utm_* и ref, нормализует имена в lowercase
 * и дописывает их к целевому адресу. Служебные параметры цели (в т.ч. id виджета
 * GetCourse) не трогаются — удаляются только одноимённые метки.
 */
(function (global) {
  "use strict";

  function getTrackingParamName(name) {
    var normalizedName = String(name).toLowerCase();
    if (normalizedName === "ref" || normalizedName.indexOf("utm_") === 0) {
      return normalizedName;
    }
    return null;
  }

  /**
   * Собирает метки с текущей страницы: [["utm_source", "vk"], ["ref", "partner7"]].
   */
  function collectTrackingParams(search) {
    var params = new URLSearchParams(search || "");
    var collected = [];

    params.forEach(function (value, name) {
      var trackingName = getTrackingParamName(name);
      if (trackingName) {
        collected.push([trackingName, value]);
      }
    });

    return collected;
  }

  /**
   * @param {string} baseSrc адрес виджета со своими служебными параметрами
   * @param {Object} [opts] { search, currentHref, documentReferrer, clrtQueryData }
   * @returns {string}
   */
  function withTrackingParams(baseSrc, opts) {
    var options = opts || {};
    var currentHref = options.currentHref || global.location.href;
    var search = options.search !== undefined ? options.search : new URL(currentHref).search;
    var documentReferrer =
      options.documentReferrer !== undefined ? options.documentReferrer : global.document.referrer;
    var clrtQueryData =
      options.clrtQueryData !== undefined ? options.clrtQueryData : global.clrtQueryData;

    var targetUrl = new URL(baseSrc, currentHref);
    var trackingParams = collectTrackingParams(search);

    // Снимаем одноимённые метки, которые уже были в адресе виджета, — регистр не важен.
    trackingParams.forEach(function (pair) {
      Array.from(targetUrl.searchParams.keys()).forEach(function (existingName) {
        if (existingName.toLowerCase() === pair[0]) {
          targetUrl.searchParams.delete(existingName);
        }
      });
    });

    trackingParams.forEach(function (pair) {
      targetUrl.searchParams.append(pair[0], pair[1]);
    });

    // ref из адреса страницы приоритетнее; если его нет — как в родном скрипте GetCourse.
    if (!targetUrl.searchParams.has("ref") && documentReferrer) {
      targetUrl.searchParams.set("ref", documentReferrer);
    }

    // GetCourse разбирает метки ещё и из loc, поэтому отдаём полный адрес страницы.
    targetUrl.searchParams.set("loc", currentHref);

    try {
      if (clrtQueryData) {
        targetUrl.searchParams.set("clrtQueryData", JSON.stringify(clrtQueryData));
      }
    } catch (e) {
      // игнорируем ошибки сериализации
    }

    // Встроенный getGet() формы использует decodeURI и не декодирует "+" в пробел.
    // %20 работает и с этим скриптом, и со стандартным URLSearchParams.
    return targetUrl.toString().replace(/\+/g, "%20");
  }

  global.GcTracking = {
    getTrackingParamName: getTrackingParamName,
    collectTrackingParams: collectTrackingParams,
    withTrackingParams: withTrackingParams,
  };
})(window);
