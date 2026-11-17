"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[4612], {
5263(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_rswpzmm5_mjs__rspack_import_0 = __webpack_require__(573);
/* import */ var remotion__rspack_import_1 = __webpack_require__(3947);


// src/rain-fall.ts

var { createEffect } = remotion__rspack_import_1.Internals;
var DEFAULTS = {
  ..._index_rswpzmm5_mjs__rspack_import_0/* .COMMON_WEATHER_DEFAULTS */.I_,
  size: 1,
  speed: 4000,
  wind: 0,
  windVariation: 0,
  color: "#cccccc",
  opacity: 0.25,
  transferMode: "lighten",
  drops: 1e5,
  appearance: "refracting"
};
var rainFallSchema = {
  drops: {
    type: "number",
    min: 0,
    max: 1e5,
    step: 1,
    integer: true,
    default: DEFAULTS.drops,
    description: "Drops",
    hiddenFromList: false
  },
  ...(0,_index_rswpzmm5_mjs__rspack_import_0/* .createWeatherSchema */.UX)(DEFAULTS, 20000, 1e4),
  appearance: {
    type: "enum",
    variants: { refracting: {}, "soft-solid": {} },
    default: DEFAULTS.appearance,
    description: "Appearance"
  }
};
var resolve = (params) => ({
  ...(0,_index_rswpzmm5_mjs__rspack_import_0/* .resolveWeatherParams */.r8)(params, DEFAULTS),
  count: params.drops ?? DEFAULTS.drops,
  sizeVariation: 0,
  speedVariation: 0,
  wiggleAmount: 0,
  wiggleAmountVariation: 0,
  wiggleFrequency: 0,
  wiggleFrequencyVariation: 0,
  appearance: params.appearance ?? DEFAULTS.appearance
});
var rainFall = createEffect({
  type: "remotion/rain-fall",
  label: "rainFall()",
  documentationLink: "https://www.remotion.dev/docs/effects/rain-fall",
  calculateKey: (params) => `rain-fall-${JSON.stringify(resolve(params))}`,
  implementations: {
    webgpu: remotion__rspack_import_1.Internals.createEffectImplementation({
      setup: _index_rswpzmm5_mjs__rspack_import_0/* .setupWeatherWebGpu */.Kf,
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice)
          throw new Error("A WebGPU device is required for the rain fall effect");
        (0,_index_rswpzmm5_mjs__rspack_import_0/* .drawWeatherWebGpu */.Tf)({
          source,
          width,
          height,
          params: resolve(params),
          state,
          device: gpuDevice,
          type: "rain"
        });
      },
      cleanup: _index_rswpzmm5_mjs__rspack_import_0/* .cleanupWeatherWebGpu */.Tv
    }),
    webgl2: remotion__rspack_import_1.Internals.createEffectImplementation({
      setup: (target) => (0,_index_rswpzmm5_mjs__rspack_import_0/* .setupWeather */.yB)(target, "rain fall"),
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        (0,_index_rswpzmm5_mjs__rspack_import_0/* .drawWeather */.tY)({
          state,
          source,
          width,
          height,
          flipSourceY,
          params: resolve(params),
          type: "rain"
        });
      },
      cleanup: _index_rswpzmm5_mjs__rspack_import_0/* .cleanupWeather */.H9
    })
  },
  schema: rainFallSchema,
  validateParams: (params) => {
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherParams */.zC)(params, "Rain fall", 20000, 1e4);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.drops, "drops", 0, 1e5);
    if (params.drops !== undefined && !Number.isInteger(params.drops)) {
      throw new TypeError('"drops" must be an integer');
    }
    if (params.appearance !== undefined && params.appearance !== "refracting" && params.appearance !== "soft-solid") {
      throw new TypeError('"appearance" must be "refracting" or "soft-solid"');
    }
  }
});


__webpack_require__.d(__webpack_exports__, {
}, {
  rainFall: rainFall,
  rainFallSchema: rainFallSchema
});


},

}]);
//# sourceMappingURL=4612.bundle.js.map