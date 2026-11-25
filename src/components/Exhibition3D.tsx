import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard, Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperInstance } from 'swiper';
import 'swiper/css';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Expand,
  LayoutGrid,
} from 'lucide-react';
import type { Artwork } from '../types/gallery';
import { SubtleDepthOfFieldPass } from '../utils/depthOfFieldPass';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
  disposeObject3D,
} from '../utils/webglHelpers';

interface Exhibition3DProps {
  artworks: Artwork[];
  isLoading?: boolean;
  heroTitle?: string;
  aboutKicker?: string;
  aboutPeriod?: string;
  activeCategory?: string;
  isModalOpen?: boolean;
  onSelectArtwork: (artwork: Artwork) => void;
  onExit3D: () => void;
}

interface CarouselFrameItem {
  artwork: Artwork;
  index: number;
  group: THREE.Group;
  accentMat: THREE.MeshStandardMaterial;
  clickTargets: THREE.Object3D[];
  camZAdjust: number;
  lookYAdjust: number;
}

const _camTargetPos = new THREE.Vector3();
const _camCurrentPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _lookCurrent = new THREE.Vector3();
const _colorFocused = new THREE.Color(0xb84a27);
const _colorIdle = new THREE.Color(0x9f7e48);
const _emissiveFocused = new THREE.Color(0x3b1206);
const _emissiveIdle = new THREE.Color(0x000000);

function createFallbackArtworkTexture(
  artwork: Artwork,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, artwork.placeholderFrom || '#DCDAD4');
    grad.addColorStop(1, artwork.placeholderTo || '#B8B5AE');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(34, 27, 21, 0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 464, 464);

    ctx.fillStyle = '#221b15';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Georgia, serif';
    ctx.fillText(artwork.title.slice(0, 26), 256, 244);

    ctx.fillStyle = '#635443';
    ctx.font = '18px "IBM Plex Mono", monospace';
    ctx.fillText(`${artwork.category} · ${artwork.year}`, 256, 286);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createPlaqueTexture(
  artwork: Artwork,
  plateNumber: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8f3e6';
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = 'rgba(34, 27, 21, 0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = '#b84a27';
    ctx.font = 'bold 20px "IBM Plex Mono", monospace';
    ctx.fillText(
      `NO. ${String(plateNumber).padStart(2, '0')} · ${artwork.category.toUpperCase()} · ${artwork.year}`,
      24,
      44
    );

    ctx.fillStyle = '#221b15';
    ctx.font = 'bold 29px Georgia, serif';
    const titleText =
      artwork.title.length > 26
        ? `${artwork.title.slice(0, 25)}…`
        : artwork.title;
    ctx.fillText(titleText, 24, 92);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function Exhibition3D({
  artworks,
  isLoading = false,
  heroTitle = 'Quiet Spaces of Light & Form',
  aboutKicker,
  aboutPeriod,
  activeCategory = 'All',
  isModalOpen = false,
  onSelectArtwork,
  onExit3D,
}: Exhibition3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const swiperRef = useRef<SwiperInstance | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [webglUnsupported, setWebglUnsupported] = useState(false);

  const activeIndexRef = useRef(0);
  const hoveredIndexRef = useRef<number | null>(null);
  const targetOffsetRef = useRef(0);
  const isTouchingRef = useRef(false);
  const artworksRef = useRef(artworks);
  artworksRef.current = artworks;

  const onSelectRef = useRef(onSelectArtwork);
  onSelectRef.current = onSelectArtwork;

  // Imperative bridge to trigger WebGL render, raycast tap, and pointer hover
  const requestRenderRef = useRef<(() => void) | null>(null);
  const handleTapAtRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const handleHoverAtRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const handlePointerParallaxRef = useRef<((nx: number, ny: number) => void) | null>(null);
  const handlePointerLeaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    targetOffsetRef.current = 0;
    swiperRef.current?.slideTo(0, 0);
  }, [artworks]);

  useEffect(() => {
    if (isLoading || artworks.length === 0) return;
    const container = mountRef.current;
    if (!container) return;

    const { supported, isSoftwareGl } = detectSoftwareWebGL();
    if (!supported) {
      setWebglUnsupported(true);
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let width = Math.max(container.clientWidth, 300);
    let height = Math.max(container.clientHeight, 440);
    const isMobilePerf =
      width < 768 || window.matchMedia('(pointer: coarse)').matches;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(
      isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, isMobilePerf ? 1.5 : 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = 0xeae0ca;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.045);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.42;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const getResponsiveFov = (w: number, h: number) => {
      const aspect = w / h;
      if (aspect < 0.78) return 50;
      if (w < 768 || aspect < 1.0) return 46;
      return 40;
    };

    const camera = new THREE.PerspectiveCamera(
      getResponsiveFov(width, height),
      width / height,
      0.1,
      60
    );

    const getResponsiveCamBase = (w: number, h: number) => {
      const aspect = w / h;
      const baseZ =
        aspect < 1.0
          ? Math.min(7.5, Math.max(3.9, 3.65 / Math.max(0.45, aspect)))
          : 3.82;
      const baseY = aspect < 0.85 ? 1.56 : 1.54;
      const lookY = aspect < 0.85 ? 1.24 : 1.35;
      return { baseZ, baseY, lookY, viewportAspect: aspect };
    };

    const initialCam = getResponsiveCamBase(width, height);
    _camCurrentPos.set(0, initialCam.baseY, initialCam.baseZ);
    _lookCurrent.set(0, initialCam.lookY, 0);
    camera.position.copy(_camCurrentPos);
    camera.lookAt(_lookCurrent);

    // 3-Point Warm Gallery Studio Lighting (balanced for NoToneMapping + true-color prints)
    const hemiLight = new THREE.HemisphereLight(0xfff8eb, 0x6f5b46, 0.48);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 0.84);
    keyLight.position.set(3.2, 6.8, 5.4);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      const shadowRes = isMobilePerf ? 512 : 1024;
      keyLight.shadow.mapSize.set(shadowRes, shadowRes);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 22;
      keyLight.shadow.camera.left = -7;
      keyLight.shadow.camera.right = 7;
      keyLight.shadow.camera.top = 7;
      keyLight.shadow.camera.bottom = -7;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xebd8bc, 0.38);
    rimLight.position.set(-4.2, 3.6, -4.5);
    scene.add(rimLight);

    const maxAnisotropy = isMobilePerf
      ? Math.min(4, renderer.capabilities.getMaxAnisotropy())
      : renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    // Grounded Warm Museum Floor + Inlaid Brass Center Stage Ring
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({
        color: 0xe3d7be,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    const stageRingOuter = new THREE.Mesh(
      new THREE.RingGeometry(1.52, 1.56, 64),
      new THREE.MeshStandardMaterial({
        color: 0x9f7e48,
        roughness: 0.36,
        metalness: 0.78,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    stageRingOuter.rotation.x = -Math.PI / 2;
    stageRingOuter.position.set(0, 0.004, 0.08);
    scene.add(stageRingOuter);

    const stageSpotlightPool = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 2.2),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.38,
      })
    );
    stageSpotlightPool.rotation.x = -Math.PI / 2;
    stageSpotlightPool.position.set(0, 0.003, 0.12);
    scene.add(stageSpotlightPool);

    const depthHiddenObjects: THREE.Object3D[] = [stageSpotlightPool];

    const darkWalnutMat = new THREE.MeshStandardMaterial({
      color: 0x261d16,
      roughness: 0.46,
      metalness: 0.12,
    });
    const matBoardMat = new THREE.MeshStandardMaterial({
      color: 0xf9f5eb,
      roughness: 0.88,
      metalness: 0.02,
    });
    const plinthStoneMat = new THREE.MeshStandardMaterial({
      color: 0xd6c7aa,
      roughness: 0.84,
      metalness: 0.04,
    });
    const stanchionMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e1813,
      roughness: 0.36,
      metalness: 0.72,
    });

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const frameItems: CarouselFrameItem[] = [];
    let visibleClickableMeshes: THREE.Object3D[] = [];
    let disposed = false;

    const frameCenterY = 1.58;

    const computeFrameMetrics = (rawAspect: number) => {
      const safeAspect =
        Number.isFinite(rawAspect) && rawAspect > 0.1
          ? Math.max(0.4, Math.min(2.6, rawAspect))
          : 4 / 3;
      const maxW = 1.9;
      const maxH = 1.44;
      let photoWidth = maxH * safeAspect;
      let photoHeight = maxH;
      if (photoWidth > maxW) {
        photoWidth = maxW;
        photoHeight = maxW / safeAspect;
      }
      const matWidth = photoWidth + 0.22;
      const matHeight = photoHeight + 0.22;
      const outerWidth = matWidth + 0.11;
      const outerHeight = matHeight + 0.11;
      const camZAdjust =
        safeAspect > 1.15
          ? (safeAspect - 1.15) * 0.34
          : safeAspect < 0.88
            ? -0.1
            : 0;
      const lookYAdjust = safeAspect < 0.88 ? 0.03 : 0;
      return {
        safeAspect,
        photoWidth,
        photoHeight,
        matWidth,
        matHeight,
        outerWidth,
        outerHeight,
        camZAdjust,
        lookYAdjust,
      };
    };

    artworks.forEach((artwork, index) => {
      const initialAspect = (artwork.widthRatio || 4) / (artwork.heightRatio || 3);
      let metrics = computeFrameMetrics(initialAspect);

      const group = new THREE.Group();
      stageGroup.add(group);

      const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(metrics.outerWidth + 0.65, 1.15),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.68,
        })
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = 0.005;
      group.add(contactShadow);
      depthHiddenObjects.push(contactShadow);

      const baseHeight = 0.14;
      const plinthBase = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(1.05, metrics.outerWidth * 0.64),
          baseHeight,
          0.42
        ),
        plinthStoneMat
      );
      plinthBase.position.y = baseHeight / 2;
      plinthBase.castShadow = !isSoftwareGl;
      plinthBase.receiveShadow = !isSoftwareGl;
      group.add(plinthBase);

      const accentMat = new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xb84a27 : 0x9f7e48,
        emissive: index === 0 ? 0x3b1206 : 0x000000,
        roughness: 0.34,
        metalness: 0.58,
      });
      const plinthTrim = new THREE.Mesh(
        new THREE.BoxGeometry(
          Math.max(1.09, metrics.outerWidth * 0.66),
          0.028,
          0.44
        ),
        accentMat
      );
      plinthTrim.position.y = baseHeight + 0.014;
      group.add(plinthTrim);

      let frameBottomY = frameCenterY - metrics.outerHeight / 2;
      let stanchionHeight = Math.max(0.24, frameBottomY - baseHeight);
      let sharedStanchionGeo = new THREE.CylinderGeometry(
        0.022,
        0.022,
        stanchionHeight,
        12
      );
      let stanchionX = Math.min(0.42, metrics.outerWidth * 0.24);

      const leftPost = new THREE.Mesh(sharedStanchionGeo, stanchionMetalMat);
      leftPost.position.set(-stanchionX, baseHeight + stanchionHeight / 2, -0.02);
      leftPost.castShadow = !isSoftwareGl;
      group.add(leftPost);

      const rightPost = new THREE.Mesh(sharedStanchionGeo, stanchionMetalMat);
      rightPost.position.set(stanchionX, baseHeight + stanchionHeight / 2, -0.02);
      rightPost.castShadow = !isSoftwareGl;
      group.add(rightPost);

      const outerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(metrics.outerWidth, metrics.outerHeight, 0.08),
        darkWalnutMat
      );
      outerFrame.position.set(0, frameCenterY, 0);
      outerFrame.castShadow = !isSoftwareGl;
      outerFrame.receiveShadow = !isSoftwareGl;
      outerFrame.layers.enable(1);
      outerFrame.userData.artworkIndex = index;
      group.add(outerFrame);

      const matBoard = new THREE.Mesh(
        new THREE.BoxGeometry(metrics.matWidth, metrics.matHeight, 0.024),
        matBoardMat
      );
      matBoard.position.set(0, frameCenterY, 0.036);
      group.add(matBoard);

      const fallbackTex = createFallbackArtworkTexture(artwork, maxAnisotropy);
      const photoMat = new THREE.MeshBasicMaterial({
        map: fallbackTex,
        toneMapped: false,
        fog: false,
      });
      const photoMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(metrics.photoWidth, metrics.photoHeight),
        photoMat
      );
      photoMesh.position.set(0, frameCenterY, 0.052);
      photoMesh.layers.enable(1);
      photoMesh.userData.artworkIndex = index;
      group.add(photoMesh);

      const plaqueBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.24, 0.022),
        darkWalnutMat
      );
      plaqueBack.position.set(0, frameBottomY - 0.16, 0.004);
      group.add(plaqueBack);

      const plaqueTex = createPlaqueTexture(artwork, index + 1, maxAnisotropy);
      const plaqueMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.84, 0.21),
        new THREE.MeshStandardMaterial({
          map: plaqueTex,
          roughness: 0.72,
          metalness: 0.04,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      plaqueMesh.position.set(0, frameBottomY - 0.16, 0.018);
      group.add(plaqueMesh);

      const frameItem: CarouselFrameItem = {
        artwork,
        index,
        group,
        accentMat,
        clickTargets: [outerFrame, photoMesh],
        camZAdjust: metrics.camZAdjust,
        lookYAdjust: metrics.lookYAdjust,
      };
      frameItems.push(frameItem);

      textureLoader.load(
        artwork.src,
        (loadedTex) => {
          if (disposed) {
            loadedTex.dispose();
            return;
          }
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          loadedTex.anisotropy = maxAnisotropy;
          photoMat.map = loadedTex;
          photoMat.needsUpdate = true;
          fallbackTex.dispose();

          const img = loadedTex.image as
            | {
                naturalWidth?: number;
                naturalHeight?: number;
                width?: number;
                height?: number;
              }
            | undefined;
          const natW = img?.naturalWidth || img?.width || 0;
          const natH = img?.naturalHeight || img?.height || 0;
          if (natW > 0 && natH > 0) {
            const naturalAspect = natW / natH;
            if (Math.abs(naturalAspect - metrics.safeAspect) > 0.012) {
              metrics = computeFrameMetrics(naturalAspect);

              photoMesh.geometry.dispose();
              photoMesh.geometry = new THREE.PlaneGeometry(
                metrics.photoWidth,
                metrics.photoHeight
              );

              matBoard.geometry.dispose();
              matBoard.geometry = new THREE.BoxGeometry(
                metrics.matWidth,
                metrics.matHeight,
                0.024
              );

              outerFrame.geometry.dispose();
              outerFrame.geometry = new THREE.BoxGeometry(
                metrics.outerWidth,
                metrics.outerHeight,
                0.08
              );

              plinthBase.geometry.dispose();
              plinthBase.geometry = new THREE.BoxGeometry(
                Math.max(1.05, metrics.outerWidth * 0.64),
                baseHeight,
                0.42
              );

              plinthTrim.geometry.dispose();
              plinthTrim.geometry = new THREE.BoxGeometry(
                Math.max(1.09, metrics.outerWidth * 0.66),
                0.028,
                0.44
              );

              contactShadow.geometry.dispose();
              contactShadow.geometry = new THREE.PlaneGeometry(
                metrics.outerWidth + 0.65,
                1.15
              );

              frameBottomY = frameCenterY - metrics.outerHeight / 2;
              stanchionHeight = Math.max(0.24, frameBottomY - baseHeight);
              stanchionX = Math.min(0.42, metrics.outerWidth * 0.24);
              const nextStanchionGeo = new THREE.CylinderGeometry(
                0.022,
                0.022,
                stanchionHeight,
                12
              );
              leftPost.geometry = nextStanchionGeo;
              rightPost.geometry = nextStanchionGeo;
              sharedStanchionGeo.dispose();
              sharedStanchionGeo = nextStanchionGeo;

              leftPost.position.set(
                -stanchionX,
                baseHeight + stanchionHeight / 2,
                -0.02
              );
              rightPost.position.set(
                stanchionX,
                baseHeight + stanchionHeight / 2,
                -0.02
              );

              plaqueBack.position.y = frameBottomY - 0.16;
              plaqueMesh.position.y = frameBottomY - 0.16;

              frameItem.camZAdjust = metrics.camZAdjust;
              frameItem.lookYAdjust = metrics.lookYAdjust;
            }
          }

          requestRender();
        },
        undefined,
        () => {
          // Keep clean procedural canvas fallback on CORS/load failure
        }
      );
    });

    let composer: EffectComposer | null = null;
    let dofPass: SubtleDepthOfFieldPass | null = null;
    let outputPass: OutputPass | null = null;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);

      const pixelRatio = renderer.getPixelRatio();
      const msaaSamples =
        !isMobilePerf && renderer.capabilities.isWebGL2
          ? Math.min(4, renderer.capabilities.maxSamples)
          : 0;
      const msaaTarget = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(width * pixelRatio)),
        Math.max(1, Math.floor(height * pixelRatio)),
        {
          type: THREE.HalfFloatType,
          samples: msaaSamples,
        }
      );

      composer = new EffectComposer(renderer);
      composer.reset(msaaTarget);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      composer.addPass(new RenderPass(scene, camera));

      dofPass = new SubtleDepthOfFieldPass(scene, camera, {
        focus: _camCurrentPos.z - 0.04,
        focusDeadZone: isMobilePerf ? 0.68 : 0.56,
        blurRange: 2.5,
        maxBlur: width < 640 ? 0.0038 : 0.0052,
        samples: isMobilePerf ? 8 : 14,
        depthScale: isMobilePerf ? 0.35 : 0.5,
        depthHiddenObjects,
      });
      composer.addPass(dofPass);

      outputPass = new OutputPass();
      composer.addPass(outputPass);
    }

    let currentOffset = targetOffsetRef.current;
    let pointerParallaxX = 0;
    let pointerParallaxY = 0;
    let smoothParallaxX = 0;
    let smoothParallaxY = 0;
    let smoothRoll = 0;

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let isAnimActive = false;
    let lastClockMs = performance.now();

    function applyCarouselLayout(offsetValue: number, colorAlpha: number): boolean {
      const slotSpacing = width < 640 ? 2.58 : 2.68;
      const visibilityCutoff = width < 640 ? 2.65 : 4.0;
      let colorAnimating = false;
      const nextClickable: THREE.Object3D[] = [];

      for (const item of frameItems) {
        const rel = item.index - offsetValue;
        const absRel = Math.abs(rel);

        const x = rel * slotSpacing;
        const z = -Math.pow(absRel, 1.12) * 1.08;
        const rotY = THREE.MathUtils.clamp(-rel * 0.29, -0.72, 0.72);
        const scale = Math.max(0.66, 1 - absRel * 0.13);

        item.group.position.set(x, 0, z);
        item.group.rotation.y = rotY;
        item.group.scale.setScalar(scale);

        item.group.visible = absRel <= visibilityCutoff;
        if (!item.group.visible) continue;

        nextClickable.push(item.clickTargets[0], item.clickTargets[1]);

        const isFocusedOrHover =
          item.index === activeIndexRef.current ||
          item.index === hoveredIndexRef.current;
        const targetColor = isFocusedOrHover ? _colorFocused : _colorIdle;
        const targetEmissive = isFocusedOrHover ? _emissiveFocused : _emissiveIdle;

        if (colorAlpha >= 1) {
          item.accentMat.color.copy(targetColor);
          item.accentMat.emissive.copy(targetEmissive);
        } else {
          item.accentMat.color.lerp(targetColor, colorAlpha);
          item.accentMat.emissive.lerp(targetEmissive, colorAlpha);
          if (
            Math.abs(item.accentMat.color.r - targetColor.r) > 0.004 ||
            Math.abs(item.accentMat.color.g - targetColor.g) > 0.004 ||
            Math.abs(item.accentMat.color.b - targetColor.b) > 0.004
          ) {
            colorAnimating = true;
          } else {
            item.accentMat.color.copy(targetColor);
            item.accentMat.emissive.copy(targetEmissive);
          }
        }
      }

      visibleClickableMeshes = nextClickable;
      return colorAnimating;
    }

    function getInterpolatedFraming(offsetValue: number) {
      if (frameItems.length === 0) return { camZAdjust: 0, lookYAdjust: 0 };
      const clamped = THREE.MathUtils.clamp(offsetValue, 0, frameItems.length - 1);
      const lowIdx = Math.floor(clamped);
      const highIdx = Math.min(frameItems.length - 1, lowIdx + 1);
      const frac = clamped - lowIdx;
      const a = frameItems[lowIdx];
      const b = frameItems[highIdx];
      return {
        camZAdjust: THREE.MathUtils.lerp(a.camZAdjust, b.camZAdjust, frac),
        lookYAdjust: THREE.MathUtils.lerp(a.lookYAdjust, b.lookYAdjust, frac),
      };
    }

    applyCarouselLayout(currentOffset, 1);

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      if (!isAnimActive) {
        lastClockMs = performance.now();
        isAnimActive = true;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        const now = performance.now();
        const delta = Math.max(0.001, Math.min((now - lastClockMs) / 1000, 0.05));
        lastClockMs = now;

        const goalOffset = targetOffsetRef.current;
        if (prefersReducedMotion || isSoftwareGl) {
          currentOffset = goalOffset;
        } else if (isTouchingRef.current) {
          // Snappy 1:1 thumb tracking during Swiper touch gesture
          currentOffset = THREE.MathUtils.damp(currentOffset, goalOffset, 32, delta);
          if (Math.abs(currentOffset - goalOffset) > 0.0008) {
            renderDirty = true;
          }
        } else {
          // Smooth exponential glide when settling to a slide
          currentOffset = THREE.MathUtils.damp(currentOffset, goalOffset, 7.0, delta);
          if (Math.abs(currentOffset - goalOffset) < 0.0008) {
            currentOffset = goalOffset;
          } else {
            renderDirty = true;
          }
        }

        if (!prefersReducedMotion && !isSoftwareGl) {
          smoothParallaxX = THREE.MathUtils.damp(
            smoothParallaxX,
            pointerParallaxX,
            5.6,
            delta
          );
          smoothParallaxY = THREE.MathUtils.damp(
            smoothParallaxY,
            pointerParallaxY,
            5.6,
            delta
          );
          if (
            Math.abs(smoothParallaxX - pointerParallaxX) > 0.0008 ||
            Math.abs(smoothParallaxY - pointerParallaxY) > 0.0008
          ) {
            renderDirty = true;
          }
        }

        const camBase = getResponsiveCamBase(width, height);
        const framing = getInterpolatedFraming(currentOffset);
        const aspectPullbackScale = camBase.viewportAspect < 0.85 ? 0.85 : 0.65;

        const deltaOffset = goalOffset - currentOffset;
        const travelIntensity = Math.min(1, Math.abs(deltaOffset) * 1.15);
        const midSlideGap = Math.sin(
          Math.min(1, Math.abs(currentOffset - Math.round(currentOffset)) * 2) *
            (Math.PI * 0.5)
        );
        const arcPullback = Math.max(travelIntensity * 0.34, midSlideGap * 0.22);

        const swipeLeadX = THREE.MathUtils.clamp(deltaOffset * 0.2, -0.3, 0.3);
        const gazeLeadX = THREE.MathUtils.clamp(deltaOffset * 0.15, -0.22, 0.22);

        _camTargetPos.set(
          smoothParallaxX * 0.34 + swipeLeadX,
          camBase.baseY + smoothParallaxY * 0.14 - arcPullback * 0.06,
          camBase.baseZ +
            framing.camZAdjust * aspectPullbackScale +
            arcPullback
        );
        _lookTarget.set(
          smoothParallaxX * 0.08 + gazeLeadX,
          camBase.lookY + framing.lookYAdjust,
          0
        );

        const targetRoll = THREE.MathUtils.clamp(
          -deltaOffset * 0.016 + smoothParallaxX * 0.006,
          -0.022,
          0.022
        );

        let colorAlpha = 1;
        if (prefersReducedMotion || isSoftwareGl) {
          _camCurrentPos.copy(_camTargetPos);
          _lookCurrent.copy(_lookTarget);
          smoothRoll = 0;
        } else {
          const posAlpha = 1 - Math.exp(-5.4 * delta);
          const lookAlpha = 1 - Math.exp(-6.8 * delta);
          colorAlpha = 1 - Math.exp(-8.5 * delta);

          _camCurrentPos.lerp(_camTargetPos, posAlpha);
          _lookCurrent.lerp(_lookTarget, lookAlpha);
          smoothRoll = THREE.MathUtils.damp(smoothRoll, targetRoll, 5.2, delta);

          if (
            _camCurrentPos.distanceToSquared(_camTargetPos) > 0.000001 ||
            _lookCurrent.distanceToSquared(_lookTarget) > 0.000001 ||
            Math.abs(smoothRoll - targetRoll) > 0.0003
          ) {
            renderDirty = true;
          } else {
            _camCurrentPos.copy(_camTargetPos);
            _lookCurrent.copy(_lookTarget);
            smoothRoll = targetRoll;
          }
        }

        camera.position.copy(_camCurrentPos);
        camera.lookAt(_lookCurrent);
        if (Math.abs(smoothRoll) > 0.0001) {
          camera.rotation.z += smoothRoll;
        }

        const colorAnimating = applyCarouselLayout(currentOffset, colorAlpha);
        if (colorAnimating) {
          renderDirty = true;
        }

        if (composer && dofPass) {
          dofPass.setFocus(Math.max(1.5, _camCurrentPos.z - 0.04));
          dofPass.uniforms.maxBlur.value = width < 640 ? 0.0038 : 0.0052;
          composer.render();
        } else {
          renderer.render(scene, camera);
        }

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) {
            requestRender();
          } else {
            isAnimActive = false;
          }
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    requestRenderRef.current = () => {
      requestRender();
    };

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let lastHoverCheck = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    handleTapAtRef.current = (clientX: number, clientY: number) => {
      updateNdc(clientX, clientY);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(visibleClickableMeshes, false);
      if (hits.length > 0 && typeof hits[0].object.userData.artworkIndex === 'number') {
        const hitIdx = hits[0].object.userData.artworkIndex as number;
        if (hitIdx === activeIndexRef.current) {
          const selected = artworksRef.current[hitIdx];
          if (selected) onSelectRef.current(selected);
        } else {
          swiperRef.current?.slideTo(hitIdx);
        }
      }
    };

    handleHoverAtRef.current = (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

      updateNdc(clientX, clientY);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(visibleClickableMeshes, false);
      const nextHovered =
        hits.length > 0 && typeof hits[0].object.userData.artworkIndex === 'number'
          ? (hits[0].object.userData.artworkIndex as number)
          : null;

      if (nextHovered !== hoveredIndexRef.current) {
        hoveredIndexRef.current = nextHovered;
        setHoveredIndex(nextHovered);
        requestRender();
      }
    };

    handlePointerParallaxRef.current = (nx: number, ny: number) => {
      pointerParallaxX = nx * 0.45;
      pointerParallaxY = ny * 0.35;
      requestRender();
    };

    handlePointerLeaveRef.current = () => {
      pointerParallaxX = 0;
      pointerParallaxY = 0;
      if (hoveredIndexRef.current !== null) {
        hoveredIndexRef.current = null;
        setHoveredIndex(null);
      }
      requestRender();
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const handleResize = () => {
      if (!container || disposed) return;
      width = Math.max(container.clientWidth, 300);
      height = Math.max(container.clientHeight, 440);
      camera.fov = getResponsiveFov(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(width, height);
      }
      requestRender();
    };
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(container);

    requestRender();

    return () => {
      disposed = true;
      requestRenderRef.current = null;
      handleTapAtRef.current = null;
      handleHoverAtRef.current = null;
      handlePointerParallaxRef.current = null;
      handlePointerLeaveRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver?.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      dofPass?.dispose();
      outputPass?.dispose();
      composer?.dispose();
      disposeObject3D(scene);
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [artworks, isLoading]);

  if (isLoading) {
    return (
      <div className="relative w-full h-[calc(100dvh-9.5rem)] md:h-[calc(100dvh-6.75rem)] min-h-[460px] bg-[#EAE0CA] border-b border-[#221B15]/20 flex items-center justify-center px-6">
        <div className="bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] px-6 py-4 shadow-[4px_4px_0px_rgba(34,27,21,0.1)] text-center">
          <p className="font-mono-retro text-[11px] uppercase tracking-[0.14em] text-[#B84A27]">
            3D Exhibition Stage
          </p>
          <p className="mt-1 font-serif-editorial text-lg text-[#221B15]">
            Loading curation…
          </p>
        </div>
      </div>
    );
  }

  if (artworks.length === 0) {
    return (
      <div className="w-full h-[calc(100dvh-9.5rem)] md:h-[calc(100dvh-6.75rem)] min-h-[440px] flex items-center justify-center bg-[#EAE0CA] border-b border-[#221B15]/20 px-6">
        <div className="py-12 px-8 text-center bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] shadow-[4px_4px_0px_rgba(34,27,21,0.1)]">
          <p className="font-serif-editorial text-2xl text-[#221B15]">
            No artworks in this category yet.
          </p>
          <button
            type="button"
            onClick={onExit3D}
            className="mt-4 min-h-[44px] px-4 font-mono-retro text-[11px] uppercase tracking-[0.08em] bg-[#221B15] text-[#F8F3E6] hover:bg-[#B84A27] rounded-[2px] transition-colors"
          >
            Switch to Grid View
          </button>
        </div>
      </div>
    );
  }

  if (webglUnsupported) {
    return (
      <div className="w-full h-[calc(100dvh-9.5rem)] md:h-[calc(100dvh-6.75rem)] min-h-[440px] flex items-center justify-center bg-[#EAE0CA] border-b border-[#221B15]/20 px-6">
        <div className="p-8 text-center bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] shadow-[4px_4px_0px_rgba(34,27,21,0.12)] max-w-md">
          <p className="font-serif-editorial text-xl text-[#221B15]">
            3D Exhibition requires WebGL support in your browser.
          </p>
          <button
            type="button"
            onClick={onExit3D}
            className="mt-4 min-h-[44px] px-4 py-2 font-mono-retro text-xs uppercase tracking-wider bg-[#221B15] text-[#F8F3E6] hover:bg-[#B84A27] rounded-[2px] transition-colors"
          >
            Open Grid View
          </button>
        </div>
      </div>
    );
  }

  const currentArtwork = artworks[activeIndex] ?? artworks[0];
  const hoveredArtwork =
    hoveredIndex !== null ? artworks[hoveredIndex] : undefined;

  const handlePrev = () => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    if (activeIndex <= 0) {
      swiper.slideTo(artworks.length - 1);
    } else {
      swiper.slidePrev();
    }
  };

  const handleNext = () => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    if (activeIndex >= artworks.length - 1) {
      swiper.slideTo(0);
    } else {
      swiper.slideNext();
    }
  };

  const interactionHint = hoveredArtwork
    ? hoveredIndex === activeIndex
      ? `Tap to inspect · ${hoveredArtwork.title}`
      : `Tap to view · ${hoveredArtwork.title}`
    : 'Swipe left or right · Tap center frame to inspect';

  return (
    <div className="relative w-full h-[calc(100dvh-9.5rem)] md:h-[calc(100dvh-6.75rem)] min-h-[460px] bg-[#EAE0CA] border-b border-[#221B15]/20 overflow-hidden select-none">
      {/* Isolated WebGL Container */}
      <div
        ref={mountRef}
        aria-label="Interactive 3D exhibition carousel"
        className="w-full h-full"
      />

      {/* Native-Feel Touch & Swipe Layer Powered by Swiper */}
      <div
        className={`absolute inset-0 z-[5] touch-pan-y ${
          hoveredIndex !== null ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const rect = e.currentTarget.getBoundingClientRect();
          const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          handlePointerParallaxRef.current?.(nx, ny);
          handleHoverAtRef.current?.(e.clientX, e.clientY);
        }}
        onPointerLeave={() => {
          handlePointerLeaveRef.current?.();
        }}
      >
        <Swiper
          modules={[Keyboard, Mousewheel]}
          slidesPerView={1}
          speed={560}
          threshold={6}
          touchAngle={45}
          longSwipesRatio={0.22}
          shortSwipes={true}
          resistance={true}
          resistanceRatio={0.65}
          watchSlidesProgress={true}
          simulateTouch={true}
          keyboard={{ enabled: !isModalOpen }}
          mousewheel={{ forceToAxis: true, sensitivity: 1 }}
          className="w-full h-full"
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onTouchStart={() => {
            isTouchingRef.current = true;
          }}
          onTouchEnd={(swiper) => {
            isTouchingRef.current = false;
            const idx = Math.max(
              0,
              Math.min(artworksRef.current.length - 1, swiper.activeIndex)
            );
            targetOffsetRef.current = idx;
            requestRenderRef.current?.();
          }}
          onProgress={(_swiper, progress) => {
            if (!isTouchingRef.current) return;
            const count = artworksRef.current.length;
            targetOffsetRef.current =
              count <= 1 ? 0 : progress * (count - 1);
            requestRenderRef.current?.();
          }}
          onSlideChange={(swiper) => {
            const idx = Math.max(
              0,
              Math.min(artworksRef.current.length - 1, swiper.activeIndex)
            );
            activeIndexRef.current = idx;
            setActiveIndex(idx);
            targetOffsetRef.current = idx;
            requestRenderRef.current?.();
          }}
          onTransitionEnd={(swiper) => {
            const idx = Math.max(
              0,
              Math.min(artworksRef.current.length - 1, swiper.activeIndex)
            );
            targetOffsetRef.current = idx;
            requestRenderRef.current?.();
          }}
          onTap={(_swiper, event) => {
            let clientX: number | undefined;
            let clientY: number | undefined;
            if ('changedTouches' in event && event.changedTouches.length > 0) {
              clientX = event.changedTouches[0].clientX;
              clientY = event.changedTouches[0].clientY;
            } else if ('clientX' in event) {
              clientX = event.clientX;
              clientY = event.clientY;
            }
            if (typeof clientX === 'number' && typeof clientY === 'number') {
              handleTapAtRef.current?.(clientX, clientY);
            }
          }}
        >
          {artworks.map((artwork, index) => (
            <SwiperSlide
              key={artwork.id}
              aria-label={`Slide ${index + 1} of ${artworks.length}: ${artwork.title}`}
              className="w-full h-full"
            />
          ))}
        </Swiper>
      </div>

      {/* Top-Left Compact Exhibition Plaque (No backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 sm:top-5 sm:left-6 z-10 max-w-[min(420px,calc(100%-1.5rem))] bg-[#F8F3E6]/95 border border-[#221B15]/25 px-3 py-2 sm:px-4 sm:py-2.5 rounded-[2px] shadow-[2px_2px_0px_rgba(34,27,21,0.12)]">
        {(aboutKicker || aboutPeriod) && (
          <p className="font-mono-retro text-[9.5px] sm:text-[10px] uppercase tracking-[0.14em] text-[#B84A27] truncate">
            <span>{aboutKicker}</span>
            {aboutPeriod && (
              <>
                <span aria-hidden="true" className="text-[#635443]"> · </span>
                <span className="tabular-nums text-[#635443]">{aboutPeriod}</span>
              </>
            )}
          </p>
        )}
        <h1 className="mt-0.5 font-serif-editorial text-base sm:text-xl font-semibold leading-tight text-[#221B15] truncate">
          {heroTitle}
        </h1>
        <p className="mt-0.5 font-mono-retro text-[9.5px] sm:text-[10px] uppercase tracking-[0.08em] text-[#635443] truncate">
          {activeCategory} · {artworks.length} {artworks.length === 1 ? 'Work' : 'Works'} · {interactionHint}
        </p>
      </div>

      {/* Collapsible Bottom Thumb-Zone Dock (Zero Viewport Occlusion) */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 bottom-2.5 sm:bottom-5 z-10 w-[min(680px,95%)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isDockCollapsed ? 'translate-y-[calc(100%-30px)]' : 'translate-y-0'
        }`}
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setIsDockCollapsed((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F8F3E6] border border-b-0 border-[#221B15]/25 rounded-t-[2px] font-mono-retro text-[10px] uppercase tracking-[0.1em] text-[#635443] hover:text-[#B84A27] transition-colors"
          >
            {isDockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] shadow-[4px_4px_0px_rgba(34,27,21,0.16)] px-2.5 py-2 sm:px-4 sm:py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handlePrev}
                disabled={artworks.length <= 1}
                aria-label="Previous artwork"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#221B15]/20 bg-[#EFE6D2]/80 hover:border-[#221B15]/50 hover:text-[#B84A27] disabled:opacity-40 rounded-[2px] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={artworks.length <= 1}
                aria-label="Next artwork"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#221B15]/20 bg-[#EFE6D2]/80 hover:border-[#221B15]/50 hover:text-[#B84A27] disabled:opacity-40 rounded-[2px] transition-colors"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-w-0 flex-1 px-1 text-left">
              <p className="font-mono-retro text-[10px] uppercase tracking-[0.12em] text-[#B84A27] tabular-nums truncate">
                {String(activeIndex + 1).padStart(2, '0')} /{' '}
                {String(artworks.length).padStart(2, '0')} · {currentArtwork?.category}
              </p>
              <p className="font-serif-editorial text-sm sm:text-base font-semibold text-[#221B15] truncate">
                {currentArtwork?.title}
              </p>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => currentArtwork && onSelectArtwork(currentArtwork)}
                className="min-h-[44px] px-3 sm:px-3.5 inline-flex items-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] bg-[#B84A27] text-[#F8F3E6] hover:bg-[#221B15] rounded-[2px] transition-colors whitespace-nowrap"
              >
                <Expand className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Inspect</span>
              </button>

              <button
                type="button"
                onClick={onExit3D}
                aria-label="Switch to Grid View"
                className="min-h-[44px] px-2.5 sm:px-3 inline-flex items-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] text-[#221B15] bg-[#EFE6D2] hover:bg-[#E3D7BE] border border-[#221B15]/25 rounded-[2px] transition-colors whitespace-nowrap"
              >
                <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </div>
          </div>

          {artworks.length > 1 && (
            <div
              role="tablist"
              aria-label="Jump to frame"
              className="flex items-center gap-1.5 pt-0.5"
            >
              {artworks.map((artwork, index) => {
                const isSelected = index === activeIndex;
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={`View frame ${index + 1}: ${artwork.title}`}
                    onClick={() => swiperRef.current?.slideTo(index)}
                    className={`h-1.5 flex-1 rounded-[1px] transition-colors ${
                      isSelected
                        ? 'bg-[#B84A27]'
                        : 'bg-[#221B15]/15 hover:bg-[#221B15]/35'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
