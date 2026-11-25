import {
  Color,
  HalfFloatType,
  MeshDepthMaterial,
  NearestFilter,
  NoBlending,
  RGBADepthPacking,
  ShaderMaterial,
  UniformsUtils,
  WebGLRenderTarget,
  type Camera,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export interface SubtleDepthOfFieldOptions {
  focus?: number;
  focusDeadZone?: number;
  blurRange?: number;
  maxBlur?: number;
  depthHiddenObjects?: Object3D[];
}

const SubtleDOFShader = {
  name: 'SubtleDOFShader',
  uniforms: {
    tColor: { value: null as Texture | null },
    tDepth: { value: null as Texture | null },
    focus: { value: 3.7 },
    aspect: { value: 1.0 },
    nearClip: { value: 0.1 },
    farClip: { value: 60.0 },
    focusDeadZone: { value: 0.58 },
    blurRange: { value: 2.55 },
    maxBlur: { value: 0.0046 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <common>
    #include <packing>

    varying vec2 vUv;

    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform float focus;
    uniform float aspect;
    uniform float nearClip;
    uniform float farClip;
    uniform float focusDeadZone;
    uniform float blurRange;
    uniform float maxBlur;

    float getViewZ(const in vec2 uv) {
      float packedDepth = unpackRGBAToDepth(texture2D(tDepth, uv));
      return perspectiveDepthToViewZ(packedDepth, nearClip, farClip);
    }

    float computeCoc(const in float viewZ) {
      float distFromFocus = abs(-viewZ - focus);
      return smoothstep(focusDeadZone, focusDeadZone + blurRange, distFromFocus);
    }

    void main() {
      vec4 baseColor = texture2D(tColor, vUv);
      float centerViewZ = getViewZ(vUv);
      float centerCoc = computeCoc(centerViewZ);

      // Keep focused center artwork and foreground frame edges razor sharp
      if (centerCoc < 0.005) {
        gl_FragColor = baseColor;
        return;
      }

      vec2 radius = vec2(maxBlur * centerCoc / max(aspect, 0.25), maxBlur * centerCoc);
      const float GOLDEN_ANGLE = 2.39996323;

      vec4 accum = baseColor;
      float totalWeight = 1.0;

      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float r = sqrt((fi + 0.5) / 16.0);
        float theta = fi * GOLDEN_ANGLE;
        vec2 offset = vec2(cos(theta), sin(theta)) * r * radius;
        vec2 sampleUv = clamp(vUv + offset, vec2(0.001), vec2(0.999));

        float sampleViewZ = getViewZ(sampleUv);
        float sampleCoc = computeCoc(sampleViewZ);

        // Prevent sharp foreground edges from bleeding outward into blurred background
        float isForeground = step(centerViewZ + 0.18, sampleViewZ);
        float w = mix(1.0, smoothstep(0.0, 0.45, sampleCoc) * 0.85 + 0.15, isForeground);

        accum += texture2D(tColor, sampleUv) * w;
        totalWeight += w;
      }

      gl_FragColor = vec4((accum / totalWeight).rgb, baseColor.a);
    }
  `,
};

export class SubtleDepthOfFieldPass extends Pass {
  private scene: Scene;
  private camera: Camera;
  private depthHiddenObjects: Object3D[];
  private renderTargetDepth: WebGLRenderTarget;
  private materialDepth: MeshDepthMaterial;
  private materialDof: ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private oldClearColor = new Color();

  public uniforms: typeof SubtleDOFShader.uniforms;

  constructor(
    scene: Scene,
    camera: Camera,
    options: SubtleDepthOfFieldOptions = {}
  ) {
    super();

    this.scene = scene;
    this.camera = camera;
    this.depthHiddenObjects = options.depthHiddenObjects ?? [];

    this.renderTargetDepth = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      type: HalfFloatType,
    });
    this.renderTargetDepth.texture.name = 'SubtleDOF.depth';

    this.materialDepth = new MeshDepthMaterial();
    this.materialDepth.depthPacking = RGBADepthPacking;
    this.materialDepth.blending = NoBlending;

    const uniforms = UniformsUtils.clone(SubtleDOFShader.uniforms);
    uniforms.tDepth.value = this.renderTargetDepth.texture;
    uniforms.focus.value = options.focus ?? 3.7;
    uniforms.focusDeadZone.value = options.focusDeadZone ?? 0.58;
    uniforms.blurRange.value = options.blurRange ?? 2.55;
    uniforms.maxBlur.value = options.maxBlur ?? 0.0046;
    uniforms.aspect.value =
      'aspect' in camera && typeof camera.aspect === 'number'
        ? camera.aspect
        : 1.0;

    this.materialDof = new ShaderMaterial({
      uniforms,
      vertexShader: SubtleDOFShader.vertexShader,
      fragmentShader: SubtleDOFShader.fragmentShader,
    });
    this.uniforms = this.materialDof.uniforms as typeof SubtleDOFShader.uniforms;
    this.fsQuad = new FullScreenQuad(this.materialDof);
  }

  public setFocus(focusDistance: number) {
    this.uniforms.focus.value = focusDistance;
  }

  public override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget
  ): void {
    const prevOverride = this.scene.overrideMaterial;
    const prevBackground = this.scene.background;
    const prevFog = this.scene.fog;
    const prevVisibility = this.depthHiddenObjects.map((obj) => obj.visible);

    for (const obj of this.depthHiddenObjects) {
      obj.visible = false;
    }

    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.materialDepth;

    renderer.getClearColor(this.oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    renderer.setClearColor(0xffffff, 1.0);
    renderer.setRenderTarget(this.renderTargetDepth);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBackground;
    this.scene.fog = prevFog;
    for (let i = 0; i < this.depthHiddenObjects.length; i++) {
      this.depthHiddenObjects[i].visible = prevVisibility[i];
    }

    renderer.setClearColor(this.oldClearColor, oldClearAlpha);

    this.uniforms.tColor.value = readBuffer.texture;
    if ('near' in this.camera && typeof this.camera.near === 'number') {
      this.uniforms.nearClip.value = this.camera.near;
    }
    if ('far' in this.camera && typeof this.camera.far === 'number') {
      this.uniforms.farClip.value = this.camera.far;
    }

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this.fsQuad.render(renderer);
    }

    renderer.autoClear = oldAutoClear;
  }

  public override setSize(width: number, height: number): void {
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    this.uniforms.aspect.value = safeW / safeH;
    // Half-resolution depth buffer keeps mobile GPU overhead minimal
    this.renderTargetDepth.setSize(
      Math.max(1, Math.floor(safeW * 0.5)),
      Math.max(1, Math.floor(safeH * 0.5))
    );
  }

  public override dispose(): void {
    this.renderTargetDepth.dispose();
    this.materialDepth.dispose();
    this.materialDof.dispose();
    this.fsQuad.dispose();
  }
}
