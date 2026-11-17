"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[4583], {
5146(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_rswpzmm5_mjs__rspack_import_0 = __webpack_require__(573);
/* import */ var remotion__rspack_import_1 = __webpack_require__(3947);


// src/snow-fall.ts

var { createEffect } = remotion__rspack_import_1.Internals;
var DEFAULTS = {
  ..._index_rswpzmm5_mjs__rspack_import_0/* .COMMON_WEATHER_DEFAULTS */.I_,
  size: 3,
  speed: 100,
  wind: 25,
  windVariation: 0.5,
  color: "#ffffff",
  opacity: 1,
  transferMode: "composite",
  flakes: 1e4,
  sizeVariation: 0.5,
  speedVariation: 0.5,
  wiggleAmount: 2,
  wiggleAmountVariation: 0.5,
  wiggleFrequency: 1,
  wiggleFrequencyVariation: 0.5
};
var snowFallSchema = {
  flakes: {
    type: "number",
    min: 0,
    max: 200000,
    step: 1,
    integer: true,
    default: DEFAULTS.flakes,
    description: "Flakes",
    hiddenFromList: false
  },
  sizeVariation: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULTS.sizeVariation,
    description: "Size variation",
    hiddenFromList: false
  },
  speedVariation: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULTS.speedVariation,
    description: "Speed variation",
    hiddenFromList: false
  },
  wiggleAmount: {
    type: "number",
    min: 0,
    max: 100,
    step: 0.01,
    default: DEFAULTS.wiggleAmount,
    description: "Wiggle amount",
    hiddenFromList: false
  },
  wiggleAmountVariation: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULTS.wiggleAmountVariation,
    description: "Wiggle amount variation",
    hiddenFromList: false
  },
  wiggleFrequency: {
    type: "number",
    min: 0,
    max: 20,
    step: 0.01,
    default: DEFAULTS.wiggleFrequency,
    description: "Wiggle frequency",
    hiddenFromList: false
  },
  wiggleFrequencyVariation: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULTS.wiggleFrequencyVariation,
    description: "Wiggle frequency variation",
    hiddenFromList: false
  },
  ...(0,_index_rswpzmm5_mjs__rspack_import_0/* .createWeatherSchema */.UX)(DEFAULTS, 5000, 5000)
};
var resolve = (params) => ({
  ...(0,_index_rswpzmm5_mjs__rspack_import_0/* .resolveWeatherParams */.r8)(params, DEFAULTS),
  count: params.flakes ?? DEFAULTS.flakes,
  sizeVariation: params.sizeVariation ?? DEFAULTS.sizeVariation,
  speedVariation: params.speedVariation ?? DEFAULTS.speedVariation,
  wiggleAmount: params.wiggleAmount ?? DEFAULTS.wiggleAmount,
  wiggleAmountVariation: params.wiggleAmountVariation ?? DEFAULTS.wiggleAmountVariation,
  wiggleFrequency: params.wiggleFrequency ?? DEFAULTS.wiggleFrequency,
  wiggleFrequencyVariation: params.wiggleFrequencyVariation ?? DEFAULTS.wiggleFrequencyVariation,
  appearance: "soft-solid"
});
var snowFall = createEffect({
  type: "remotion/snow-fall",
  label: "snowFall()",
  documentationLink: "https://www.remotion.dev/docs/effects/snow-fall",
  calculateKey: (params) => `snow-fall-${JSON.stringify(resolve(params))}`,
  implementations: {
    webgpu: remotion__rspack_import_1.Internals.createEffectImplementation({
      setup: _index_rswpzmm5_mjs__rspack_import_0/* .setupWeatherWebGpu */.Kf,
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice)
          throw new Error("A WebGPU device is required for the snow fall effect");
        (0,_index_rswpzmm5_mjs__rspack_import_0/* .drawWeatherWebGpu */.Tf)({
          source,
          width,
          height,
          params: resolve(params),
          state,
          device: gpuDevice,
          type: "snow"
        });
      },
      cleanup: _index_rswpzmm5_mjs__rspack_import_0/* .cleanupWeatherWebGpu */.Tv
    }),
    webgl2: remotion__rspack_import_1.Internals.createEffectImplementation({
      setup: (target) => (0,_index_rswpzmm5_mjs__rspack_import_0/* .setupWeather */.yB)(target, "snow fall"),
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        (0,_index_rswpzmm5_mjs__rspack_import_0/* .drawWeather */.tY)({
          state,
          source,
          width,
          height,
          flipSourceY,
          params: resolve(params),
          type: "snow"
        });
      },
      cleanup: _index_rswpzmm5_mjs__rspack_import_0/* .cleanupWeather */.H9
    })
  },
  schema: snowFallSchema,
  validateParams: (params) => {
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherParams */.zC)(params, "Snow fall", 5000, 5000);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.flakes, "flakes", 0, 200000);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.sizeVariation, "sizeVariation", 0, 1);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.speedVariation, "speedVariation", 0, 1);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.wiggleAmount, "wiggleAmount", 0, 100);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.wiggleAmountVariation, "wiggleAmountVariation", 0, 1);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.wiggleFrequency, "wiggleFrequency", 0, 20);
    (0,_index_rswpzmm5_mjs__rspack_import_0/* .validateWeatherRange */.Sl)(params.wiggleFrequencyVariation, "wiggleFrequencyVariation", 0, 1);
    if (params.flakes !== undefined && !Number.isInteger(params.flakes)) {
      throw new TypeError('"flakes" must be an integer');
    }
  }
});


__webpack_require__.d(__webpack_exports__, {
}, {
  snowFall: snowFall,
  snowFallSchema: snowFallSchema
});


},

}]);
//# sourceMappingURL=4583.bundle.js.map