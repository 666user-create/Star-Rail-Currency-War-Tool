"use strict";
(self["rspackChunkpromo_video"] = self["rspackChunkpromo_video"] || []).push([[5034], {
6654(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
/* import */ var _index_evy8hyah_mjs__rspack_import_0 = __webpack_require__(9028);


// src/blur/blur-shaders.ts
var BLUR_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
	vUv = aUv;
	gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
var BLUR_FS_HORIZONTAL = (0,_index_evy8hyah_mjs__rspack_import_0/* .buildGaussianBlurFs */.c)("horizontal");
var BLUR_FS_VERTICAL = (0,_index_evy8hyah_mjs__rspack_import_0/* .buildGaussianBlurFs */.c)("vertical");



__webpack_require__.d(__webpack_exports__, {
}, {
  F7: BLUR_FS_HORIZONTAL,
  FG: BLUR_FS_VERTICAL,
  WV: BLUR_VS
});


},
8060(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
// src/uv-coordinate.ts
var publicUvToShaderUv = (uv) => {
  return [uv[0], 1 - uv[1]];
};



__webpack_require__.d(__webpack_exports__, {
}, {
  S: publicUvToShaderUv
});


},
3313(__unused_rspack___webpack_module__, __webpack_exports__, __webpack_require__) {
__webpack_require__.r(__webpack_exports__);
/* import */ var _index_kkvzt8b7_mjs__rspack_import_0 = __webpack_require__(7223);
/* import */ var _index_618ky75w_mjs__rspack_import_1 = __webpack_require__(224);
/* import */ var _index_b86qstcs_mjs__rspack_import_2 = __webpack_require__(6654);
/* import */ var _index_gnsce796_mjs__rspack_import_4 = __webpack_require__(8060);
/* import */ var _index_wxhvgv2s_mjs__rspack_import_6 = __webpack_require__(8197);
/* import */ var _index_4fvp93ps_mjs__rspack_import_5 = __webpack_require__(4075);
/* import */ var remotion__rspack_import_3 = __webpack_require__(3947);







// src/region-blur/index.ts


// src/region-blur/region-blur-runtime.ts

var { createWebGL2ContextError } = remotion__rspack_import_3.Internals;
var COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;
uniform sampler2D uBlurred;
uniform vec2 uResolution;
uniform vec2 uTopLeft;
uniform vec2 uBottomRight;
uniform float uFeather;
uniform float uRoundness;

float roundedBoxDistance(vec2 point, vec2 center, vec2 halfSize, float radius) {
	vec2 offset = abs(point - center) - halfSize + vec2(radius);
	return length(max(offset, vec2(0.0))) + min(max(offset.x, offset.y), 0.0) - radius;
}

void main() {
	vec2 minimum = vec2(uTopLeft.x, uBottomRight.y) * uResolution;
	vec2 maximum = vec2(uBottomRight.x, uTopLeft.y) * uResolution;
	vec2 halfSize = (maximum - minimum) * 0.5;
	vec2 center = (minimum + maximum) * 0.5;
	float cornerRadius = min(halfSize.x, halfSize.y) * uRoundness;
	float distanceToRegion = roundedBoxDistance(
		vUv * uResolution,
		center,
		halfSize,
		cornerRadius
	);
	float mask = uFeather <= 0.0
		? (distanceToRegion <= 0.0 ? 1.0 : 0.0)
		: 1.0 - smoothstep(-uFeather * 0.5, uFeather * 0.5, distanceToRegion);

	fragColor = mix(texture(uSource, vUv), texture(uBlurred, vUv), mask);
}
`;
var compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create WebGL shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? "(no log)"}`);
  }
  return shader;
};
var createProgram = (gl, vertexSource, fragmentSource) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create WebGL program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log ?? "(no log)"}`);
  }
  return program;
};
var createTexture = (gl) => {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("Failed to create WebGL texture");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
};
var getBlurUniforms = (gl, program) => ({
  source: gl.getUniformLocation(program, "uSource"),
  radius: gl.getUniformLocation(program, "uRadius"),
  texelSize: gl.getUniformLocation(program, "uTexelSize")
});
var setupRegionBlur = (target) => {
  const gl = target.getContext("webgl2", {
    premultipliedAlpha: true,
    alpha: true,
    preserveDrawingBuffer: true
  });
  if (!gl) {
    throw createWebGL2ContextError("region blur effect");
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const horizontalProgram = createProgram(gl, _index_b86qstcs_mjs__rspack_import_2/* .BLUR_VS */.WV, _index_b86qstcs_mjs__rspack_import_2/* .BLUR_FS_HORIZONTAL */.F7);
  const verticalProgram = createProgram(gl, _index_b86qstcs_mjs__rspack_import_2/* .BLUR_VS */.WV, _index_b86qstcs_mjs__rspack_import_2/* .BLUR_FS_VERTICAL */.FG);
  const compositeProgram = createProgram(gl, _index_b86qstcs_mjs__rspack_import_2/* .BLUR_VS */.WV, COMPOSITE_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const framebuffer = gl.createFramebuffer();
  if (!vao || !vbo || !framebuffer) {
    throw new Error("Failed to create region blur WebGL resources");
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);
  return {
    gl,
    horizontalProgram,
    verticalProgram,
    compositeProgram,
    vao,
    vbo,
    sourceTexture: createTexture(gl),
    horizontalTexture: createTexture(gl),
    blurredTexture: createTexture(gl),
    framebuffer,
    horizontalUniforms: getBlurUniforms(gl, horizontalProgram),
    verticalUniforms: getBlurUniforms(gl, verticalProgram),
    compositeUniforms: {
      source: gl.getUniformLocation(compositeProgram, "uSource"),
      blurred: gl.getUniformLocation(compositeProgram, "uBlurred"),
      resolution: gl.getUniformLocation(compositeProgram, "uResolution"),
      topLeft: gl.getUniformLocation(compositeProgram, "uTopLeft"),
      bottomRight: gl.getUniformLocation(compositeProgram, "uBottomRight"),
      feather: gl.getUniformLocation(compositeProgram, "uFeather"),
      roundness: gl.getUniformLocation(compositeProgram, "uRoundness")
    }
  };
};
var draw = (state) => {
  state.gl.bindVertexArray(state.vao);
  state.gl.drawArrays(state.gl.TRIANGLE_STRIP, 0, 4);
  state.gl.bindVertexArray(null);
};
var allocateTexture = (gl, texture, width, height) => {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
};
var renderBlurPass = ({
  state,
  program,
  uniforms,
  input,
  output,
  width,
  height,
  radius
}) => {
  const { gl } = state;
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, output, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Region blur framebuffer is incomplete");
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.useProgram(program);
  if (uniforms.source)
    gl.uniform1i(uniforms.source, 0);
  if (uniforms.radius)
    gl.uniform1f(uniforms.radius, radius);
  if (uniforms.texelSize) {
    gl.uniform2f(uniforms.texelSize, 1 / width, 1 / height);
  }
  draw(state);
};
var applyRegionBlur = ({
  state,
  source,
  width,
  height,
  flipSourceY,
  topLeft,
  bottomRight,
  blurRadius,
  feather,
  roundness
}) => {
  const { gl } = state;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipSourceY);
  gl.bindTexture(gl.TEXTURE_2D, state.sourceTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  allocateTexture(gl, state.horizontalTexture, width, height);
  allocateTexture(gl, state.blurredTexture, width, height);
  renderBlurPass({
    state,
    program: state.horizontalProgram,
    uniforms: state.horizontalUniforms,
    input: state.sourceTexture,
    output: state.horizontalTexture,
    width,
    height,
    radius: blurRadius
  });
  renderBlurPass({
    state,
    program: state.verticalProgram,
    uniforms: state.verticalUniforms,
    input: state.horizontalTexture,
    output: state.blurredTexture,
    width,
    height,
    radius: blurRadius
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(state.compositeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.sourceTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, state.blurredTexture);
  const topLeftShader = (0,_index_gnsce796_mjs__rspack_import_4/* .publicUvToShaderUv */.S)(topLeft);
  const bottomRightShader = (0,_index_gnsce796_mjs__rspack_import_4/* .publicUvToShaderUv */.S)(bottomRight);
  const uniforms = state.compositeUniforms;
  if (uniforms.source)
    gl.uniform1i(uniforms.source, 0);
  if (uniforms.blurred)
    gl.uniform1i(uniforms.blurred, 1);
  if (uniforms.resolution)
    gl.uniform2f(uniforms.resolution, width, height);
  if (uniforms.topLeft) {
    gl.uniform2f(uniforms.topLeft, topLeftShader[0], topLeftShader[1]);
  }
  if (uniforms.bottomRight) {
    gl.uniform2f(uniforms.bottomRight, bottomRightShader[0], bottomRightShader[1]);
  }
  if (uniforms.feather)
    gl.uniform1f(uniforms.feather, feather);
  if (uniforms.roundness)
    gl.uniform1f(uniforms.roundness, roundness);
  draw(state);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.useProgram(null);
};
var cleanupRegionBlur = (state) => {
  const { gl } = state;
  gl.deleteFramebuffer(state.framebuffer);
  gl.deleteTexture(state.sourceTexture);
  gl.deleteTexture(state.horizontalTexture);
  gl.deleteTexture(state.blurredTexture);
  gl.deleteBuffer(state.vbo);
  gl.deleteVertexArray(state.vao);
  gl.deleteProgram(state.horizontalProgram);
  gl.deleteProgram(state.verticalProgram);
  gl.deleteProgram(state.compositeProgram);
};

// src/region-blur/webgpu-shader.ts
var REGION_BLUR_WEBGPU_SHADER = `
${_index_kkvzt8b7_mjs__rspack_import_0/* .WEBGPU_MULTIPASS_BINDINGS */.NK}
struct Params {resolution: vec2f, feather: f32, roundness: f32, corners: vec4f,}
@fragment fn fragment(input: VertexOutput) -> @location(0) vec4f {
 let minimum = params.corners.xy * params.resolution;
 let maximum = params.corners.zw * params.resolution;
 let halfSize = (maximum - minimum) * 0.5;
 let center = (minimum + maximum) * 0.5;
 let radius = min(halfSize.x, halfSize.y) * params.roundness;
 let offset = abs(input.uv * params.resolution - center) - halfSize + vec2f(radius);
 let distance = length(max(offset, vec2f(0))) + min(max(offset.x, offset.y), 0.0) - radius;
 var mask = select(0.0, 1.0, distance <= 0.0);
 if (params.feather > 0.0) {mask = 1.0 - smoothstep(-params.feather * 0.5, params.feather * 0.5, distance);}
 return mix(textureSampleLevel(source, sourceSampler, input.uv, 0), textureSampleLevel(secondary, sourceSampler, input.uv, 0), mask);
}
`;

// src/region-blur/index.ts
var { createEffect } = remotion__rspack_import_3.Internals;
var DEFAULT_BLUR_RADIUS = 40;
var DEFAULT_FEATHER = 0;
var DEFAULT_ROUNDNESS = 0;
var regionBlurSchema = {
  topLeft: {
    type: "uv-coordinate",
    min: -1,
    max: 2,
    step: 0.01,
    default: undefined,
    description: "Top left"
  },
  bottomRight: {
    type: "uv-coordinate",
    min: -1,
    max: 2,
    step: 0.01,
    default: undefined,
    description: "Bottom right"
  },
  blurRadius: {
    type: "number",
    min: 0,
    max: 200,
    step: 1,
    default: DEFAULT_BLUR_RADIUS,
    description: "Blur radius",
    hiddenFromList: false
  },
  feather: {
    type: "number",
    min: 0,
    max: 200,
    step: 1,
    default: DEFAULT_FEATHER,
    description: "Feather",
    hiddenFromList: false
  },
  roundness: {
    type: "number",
    min: 0,
    max: 1,
    step: 0.01,
    default: DEFAULT_ROUNDNESS,
    description: "Roundness",
    hiddenFromList: false
  }
};
var resolve = (params) => ({
  topLeft: [...params.topLeft],
  bottomRight: [...params.bottomRight],
  blurRadius: params.blurRadius ?? DEFAULT_BLUR_RADIUS,
  feather: params.feather ?? DEFAULT_FEATHER,
  roundness: params.roundness ?? DEFAULT_ROUNDNESS
});
var assertRequiredUvCoordinate = (value, name) => {
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new TypeError(`"${name}" must be a [number, number] tuple`);
  }
};
var validateRegionBlurParams = (params) => {
  (0,_index_4fvp93ps_mjs__rspack_import_5/* .assertEffectParamsObject */.db)(params, "Region blur");
  assertRequiredUvCoordinate(params.topLeft, "topLeft");
  assertRequiredUvCoordinate(params.bottomRight, "bottomRight");
  (0,_index_wxhvgv2s_mjs__rspack_import_6/* .assertOptionalFiniteNumber */.FC)(params.blurRadius, "blurRadius");
  (0,_index_wxhvgv2s_mjs__rspack_import_6/* .assertOptionalFiniteNumber */.FC)(params.feather, "feather");
  (0,_index_wxhvgv2s_mjs__rspack_import_6/* .assertOptionalFiniteNumber */.FC)(params.roundness, "roundness");
  const resolved = resolve(params);
  (0,_index_wxhvgv2s_mjs__rspack_import_6/* .validateNonNegative */.XP)(resolved.blurRadius, "blurRadius");
  (0,_index_wxhvgv2s_mjs__rspack_import_6/* .validateNonNegative */.XP)(resolved.feather, "feather");
  (0,_index_wxhvgv2s_mjs__rspack_import_6/* .validateUnitInterval */.yk)(resolved.roundness, "roundness");
  if (resolved.topLeft[0] >= resolved.bottomRight[0] || resolved.topLeft[1] >= resolved.bottomRight[1]) {
    throw new TypeError('"topLeft" must be above and to the left of "bottomRight"');
  }
};
var regionBlur = createEffect({
  type: "remotion/region-blur",
  label: "regionBlur()",
  documentationLink: "https://www.remotion.dev/docs/effects/region-blur",
  calculateKey: (params) => {
    const resolved = resolve(params);
    return `region-blur-${resolved.topLeft.join(":")}-${resolved.bottomRight.join(":")}-${resolved.blurRadius}-${resolved.feather}-${resolved.roundness}`;
  },
  implementations: {
    webgpu: remotion__rspack_import_3.Internals.createEffectImplementation({
      setup: (target) => (0,_index_kkvzt8b7_mjs__rspack_import_0/* .setupWebGpuMultipass */.SB)(target, "region-blur"),
      apply: ({ source, width, height, params, state, gpuDevice }) => {
        if (!gpuDevice)
          throw new Error("A WebGPU device is required for this effect");
        const r = resolve(params);
        (0,_index_kkvzt8b7_mjs__rspack_import_0/* .applyWebGpuMultipass */.JM)({
          auxiliarySource: null,
          state,
          source,
          width,
          height,
          device: gpuDevice,
          passes: [
            {
              shader: _index_618ky75w_mjs__rspack_import_1/* .GAUSSIAN_BLUR_WEBGPU_SHADER */.j,
              uniforms: new Float32Array([
                width,
                height,
                1,
                0,
                r.blurRadius,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0
              ]),
              source: -1,
              secondary: -1
            },
            {
              shader: _index_618ky75w_mjs__rspack_import_1/* .GAUSSIAN_BLUR_WEBGPU_SHADER */.j,
              uniforms: new Float32Array([
                width,
                height,
                0,
                1,
                r.blurRadius,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0
              ]),
              source: 0,
              secondary: -1
            },
            {
              shader: REGION_BLUR_WEBGPU_SHADER,
              uniforms: new Float32Array([
                width,
                height,
                r.feather,
                r.roundness,
                ...r.topLeft,
                ...r.bottomRight
              ]),
              source: -1,
              secondary: 1
            }
          ]
        });
      },
      cleanup: _index_kkvzt8b7_mjs__rspack_import_0/* .cleanupWebGpuMultipass */.$h
    }),
    webgl2: remotion__rspack_import_3.Internals.createEffectImplementation({
      setup: (target) => setupRegionBlur(target),
      apply: ({ source, width, height, params, state, flipSourceY }) => {
        const resolved = resolve(params);
        applyRegionBlur({
          state,
          source,
          width,
          height,
          flipSourceY,
          ...resolved
        });
      },
      cleanup: (state) => cleanupRegionBlur(state)
    })
  },
  schema: regionBlurSchema,
  validateParams: validateRegionBlurParams
});


__webpack_require__.d(__webpack_exports__, {
}, {
  regionBlur: regionBlur
});


},

}]);
//# sourceMappingURL=5034.bundle.js.map