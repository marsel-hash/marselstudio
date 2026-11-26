import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Expand,
  Film,
  LayoutGrid,
  Shuffle,
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

interface HelixFrameItem {
  artwork: Artwork;
  index: number;
  group: THREE.Group;
  accentMat: THREE.MeshStandardMaterial;
  clickTargets: THREE.Object3D[];
  camZAdjust: number;
  lookYAdjust: number;
  ensurePlaque: () => void;
  startTextureLoad: () => void;
  texState: 'idle' | 'loading' | 'done';
}

const HELIX_RADIUS = 3.65;
const SPINE_RADIUS = 3.26;
const ANGLE_STEP = 0.74;
const Y_STEP = 0.36;
const BASE_FRAME_Y = 1.65;

const _camTargetPos = new THREE.Vector3();
const _camCurrentPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _lookCurrent = new THREE.Vector3();
const _focusFramePos = new THREE.Vector3();
const _axisFocusPos = new THREE.Vector3();
const _dummyMat4 = new THREE.Matrix4();
const _dummyQuat = new THREE.Quaternion();
const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3(1, 1, 1);
const _upAxis = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();

const _colorFocused = new THREE.Color(0xb84a27);
const _colorIdle = new THREE.Color(0x9f7e48);
const _emissiveFocused = new THREE.Color(0x3b1206);
const _emissiveIdle = new THREE.Color(0x000000);

function createSharedPlaceholderTexture(
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#E5DCC8');
    grad.addColorStop(1, '#CFC1A6');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(34, 27, 21, 0.16)';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, 228, 228);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function downscaleTextureForStage(
  loadedTex: THREE.Texture,
  natW: number,
  natH: number,
  maxDim: number,
  maxAnisotropy: number
): THREE.Texture {
  if (Math.max(natW, natH) <= maxDim) {
    return loadedTex;
  }
  try {
    const scale = maxDim / Math.max(natW, natH);
    const targetW = Math.max(1, Math.round(natW * scale));
    const targetH = Math.max(1, Math.round(natH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    const img = loadedTex.image as CanvasImageSource;
    if (!ctx || !img) return loadedTex;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const compactTex = new THREE.CanvasTexture(canvas);
    compactTex.colorSpace = THREE.SRGBColorSpace;
    compactTex.anisotropy = maxAnisotropy;
    compactTex.generateMipmaps = true;
    compactTex.minFilter = THREE.LinearMipmapLinearFilter;
    compactTex.magFilter = THREE.LinearFilter;
    loadedTex.dispose();
    return compactTex;
  } catch {
    return loadedTex;
  }
}

function createPlaqueTexture(
  artwork: Artwork,
  plateNumber: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8f3e6';
    ctx.fillRect(0, 0, 1024, 256);

    ctx.strokeStyle = 'rgba(34, 27, 21, 0.28)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 1008, 240);

    ctx.fillStyle = '#b84a27';
    ctx.font = '600 40px "IBM Plex Mono", monospace';
    ctx.fillText(
      `NO. ${String(plateNumber).padStart(2, '0')} · ${artwork.category.toUpperCase()} · ${artwork.year}`,
      48,
      90
    );

    ctx.strokeStyle = 'rgba(34, 27, 21, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(48, 114);
    ctx.lineTo(976, 114);
    ctx.stroke();

    ctx.fillStyle = '#221b15';
    ctx.font = '600 60px Georgia, serif';
    const titleText =
      artwork.title.length > 26
        ? `${artwork.title.slice(0, 25)}…`
        : artwork.title;
    ctx.fillText(titleText, 48, 188);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
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
  const gestureSurfaceRef = useRef<HTMLDivElement | null>(null);
  const filmstripRef = useRef<HTMLDivElement | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isOverview, setIsOverview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [isFilmstripOpen, setIsFilmstripOpen] = useState(false);
  const [webglUnsupported, setWebglUnsupported] = useState(false);

  const activeIndexRef = useRef(0);
  const hoveredIndexRef = useRef<number | null>(null);
  const isOverviewRef = useRef(false);
  isOverviewRef.current = isOverview;

  const targetOffsetRef = useRef(0);
  const momentumVelRef = useRef(0);
  const snapTargetRef = useRef<number | null>(0);
  const isDraggingRef = useRef(false);
  const introProgressRef = useRef(1);

  const artworksRef = useRef(artworks);
  artworksRef.current = artworks;

  const onSelectRef = useRef(onSelectArtwork);
  onSelectRef.current = onSelectArtwork;

  // Imperative bridges to WebGL loop
  const requestRenderRef = useRef<(() => void) | null>(null);
  const handleTapAtRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const handleHoverAtRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const handlePointerParallaxRef = useRef<((nx: number, ny: number) => void) | null>(null);
  const handlePointerLeaveRef = useRef<(() => void) | null>(null);

  const goToIndex = (index: number) => {
    const count = artworksRef.current.length;
    if (count === 0) return;
    const clamped = Math.max(0, Math.min(count - 1, index));
    momentumVelRef.current = 0;
    snapTargetRef.current = clamped;
    targetOffsetRef.current = clamped;
    activeIndexRef.current = clamped;
    setActiveIndex(clamped);
    requestRenderRef.current?.();
  };

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    targetOffsetRef.current = 0;
    snapTargetRef.current = 0;
    momentumVelRef.current = 0;
    introProgressRef.current = 1;
    setIsOverview(false);
    isOverviewRef.current = false;
  }, [artworks]);

  useEffect(() => {
    requestRenderRef.current?.();
  }, [isOverview]);

  useEffect(() => {
    if (!isFilmstripOpen || !filmstripRef.current) return;
    const container = filmstripRef.current;
    const activeBtn = container.querySelector<HTMLButtonElement>(
      `[data-film-index="${activeIndex}"]`
    );
    if (activeBtn) {
      const targetLeft =
        activeBtn.offsetLeft -
        container.clientWidth / 2 +
        activeBtn.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth',
      });
    }
  }, [isFilmstripOpen, activeIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (isModalOpen || artworks.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToIndex(Math.min(artworksRef.current.length - 1, activeIndexRef.current + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToIndex(Math.max(0, activeIndexRef.current - 1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        const current = artworksRef.current[activeIndexRef.current];
        if (current) {
          e.preventDefault();
          onSelectRef.current(current);
        }
      } else if (e.key === 'o' || e.key === 'O') {
        setIsOverview((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, artworks.length]);

  // Native non-passive wheel listener on 3D gesture overlay
  useEffect(() => {
    const surface = gestureSurfaceRef.current;
    if (!surface || isLoading || artworks.length === 0) return;

    const onWheel = (e: WheelEvent) => {
      if (isModalOpen) return;
      const count = artworksRef.current.length;
      if (count <= 1) return;
      e.preventDefault();

      introProgressRef.current = Math.min(introProgressRef.current, 0.2);
      const rawDelta =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const stepDelta = THREE.MathUtils.clamp(rawDelta * 0.0042, -1.6, 1.6);

      snapTargetRef.current = null;
      const nextOffset = THREE.MathUtils.clamp(
        targetOffsetRef.current + stepDelta,
        0,
        count - 1
      );
      targetOffsetRef.current = nextOffset;
      momentumVelRef.current = THREE.MathUtils.clamp(
        momentumVelRef.current * 0.55 + stepDelta * 9.5,
        -12,
        12
      );

      const nearest = Math.max(0, Math.min(count - 1, Math.round(nextOffset)));
      if (nearest !== activeIndexRef.current) {
        activeIndexRef.current = nearest;
        setActiveIndex(nearest);
      }
      requestRenderRef.current?.();
    };

    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [isLoading, artworks.length, isModalOpen]);

  // Core Three.js 3D Helical Rotunda Scene
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
    if (prefersReducedMotion || isSoftwareGl) {
      introProgressRef.current = 0;
    }

    let width = Math.max(container.clientWidth, 300);
    let height = Math.max(container.clientHeight, 440);
    const isMobilePerf =
      width < 768 || window.matchMedia('(pointer: coarse)').matches;

    const area = width * height;
    const rawDpr = window.devicePixelRatio || 1;
    const targetDpr = isSoftwareGl
      ? 1
      : isMobilePerf
        ? Math.min(rawDpr, area > 340000 ? 1.5 : 1.75)
        : Math.min(rawDpr, 2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(targetDpr);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = isMobilePerf
      ? THREE.PCFShadowMap
      : THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = 0xeae0ca;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.036);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.44;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const getResponsiveFov = (w: number, h: number) => {
      const aspect = w / h;
      if (aspect < 0.78) return 52;
      if (w < 768 || aspect < 1.0) return 48;
      return 42;
    };

    const camera = new THREE.PerspectiveCamera(
      getResponsiveFov(width, height),
      width / height,
      0.1,
      80
    );

    const getResponsiveCameraConfig = (w: number, h: number, overview: boolean) => {
      const aspect = w / h;
      const baseDist =
        aspect < 1.0
          ? Math.min(6.3, Math.max(4.1, 3.6 / Math.max(0.46, aspect)))
          : 3.95;
      const focusDist = overview ? baseDist + 3.05 : baseDist;
      const camOffsetY = overview
        ? aspect < 0.85
          ? 1.55
          : 1.25
        : aspect < 0.85
          ? 0.42
          : 0.28;
      const angleLead = overview ? 0.36 : 0.14;
      const axisBlend = overview ? 0.82 : 0.22;
      return { focusDist, camOffsetY, angleLead, axisBlend, viewportAspect: aspect };
    };

    // 3-Point Warm Gallery Studio Lighting (rotates dynamically with camera azimuth)
    const hemiLight = new THREE.HemisphereLight(0xfff8eb, 0x6f5b46, 0.52);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 0.82);
    keyLight.position.set(4.5, 6.8, 7.5);
    scene.add(keyLight.target);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      const shadowRes = isMobilePerf ? 512 : 1024;
      keyLight.shadow.mapSize.set(shadowRes, shadowRes);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 26;
      keyLight.shadow.camera.left = -8;
      keyLight.shadow.camera.right = 8;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xebd8bc, 0.4);
    rimLight.position.set(-5.0, 4.0, -5.5);
    scene.add(rimLight);

    const maxAnisotropy = isMobilePerf
      ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
      : renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    // Architectural Materials
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
    const travertineMat = new THREE.MeshStandardMaterial({
      color: 0xd8cab0,
      roughness: 0.84,
      metalness: 0.04,
    });
    const brassSpineMat = new THREE.MeshStandardMaterial({
      color: 0x9f7e48,
      roughness: 0.32,
      metalness: 0.78,
    });
    const bronzeArmMat = new THREE.MeshStandardMaterial({
      color: 0x1e1813,
      roughness: 0.36,
      metalness: 0.72,
    });

    // Rotunda Limestone Floor & Concentric Brass Inlay Rings
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
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

    const brassInlayMat = new THREE.MeshStandardMaterial({
      color: 0x9f7e48,
      roughness: 0.36,
      metalness: 0.78,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    [1.82, HELIX_RADIUS, 5.4].forEach((radius) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.03, radius + 0.03, 72),
        brassInlayMat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      scene.add(ring);
    });

    const rotundaCenterPool = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.44,
      })
    );
    rotundaCenterPool.rotation.x = -Math.PI / 2;
    rotundaCenterPool.position.y = 0.004;
    scene.add(rotundaCenterPool);

    const depthHiddenObjects: THREE.Object3D[] = [rotundaCenterPool];

    // Central Architectural Atrium Core & Pedestal
    const topArtworkY = BASE_FRAME_Y + Math.max(0, artworks.length - 1) * Y_STEP;
    const mastTotalHeight = topArtworkY + 1.35;

    const pedestalLower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.48, 1.56, 0.16, 48),
      travertineMat
    );
    pedestalLower.position.y = 0.08;
    pedestalLower.castShadow = !isSoftwareGl;
    pedestalLower.receiveShadow = !isSoftwareGl;
    scene.add(pedestalLower);

    const pedestalBrassTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.032, 48),
      brassSpineMat
    );
    pedestalBrassTrim.position.y = 0.176;
    scene.add(pedestalBrassTrim);

    const centralMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.68, mastTotalHeight, 36),
      travertineMat
    );
    centralMast.position.y = 0.16 + mastTotalHeight / 2;
    centralMast.castShadow = !isSoftwareGl;
    centralMast.receiveShadow = !isSoftwareGl;
    scene.add(centralMast);

    const mastCapital = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.62, 0.14, 36),
      darkWalnutMat
    );
    mastCapital.position.y = 0.16 + mastTotalHeight + 0.07;
    scene.add(mastCapital);

    // Instanced Brass Collar Rings up the Central Mast
    const collarCount = Math.max(1, Math.floor(mastTotalHeight / 2.6));
    const collarGeo = new THREE.CylinderGeometry(0.66, 0.66, 0.045, 36);
    const collarInstanced = new THREE.InstancedMesh(
      collarGeo,
      brassSpineMat,
      collarCount
    );
    for (let c = 0; c < collarCount; c++) {
      _dummyPos.set(0, 1.15 + c * 2.6, 0);
      _dummyQuat.identity();
      _dummyScale.set(1, 1, 1);
      _dummyMat4.compose(_dummyPos, _dummyQuat, _dummyScale);
      collarInstanced.setMatrixAt(c, _dummyMat4);
    }
    collarInstanced.instanceMatrix.needsUpdate = true;
    collarInstanced.computeBoundingSphere();
    scene.add(collarInstanced);

    // Continuous Helical Brass Spine connecting all artworks
    const curvePoints: THREE.Vector3[] = [];
    const startIdx = -0.35;
    const endIdx = Math.max(0.35, artworks.length - 0.65);
    const sampleSteps = Math.max(24, artworks.length * 4);
    for (let s = 0; s <= sampleSteps; s++) {
      const t = startIdx + (s / sampleSteps) * (endIdx - startIdx);
      const ang = t * ANGLE_STEP;
      const py = BASE_FRAME_Y + t * Y_STEP;
      curvePoints.push(
        new THREE.Vector3(
          SPINE_RADIUS * Math.sin(ang),
          py,
          SPINE_RADIUS * Math.cos(ang)
        )
      );
    }
    const spineCurve = new THREE.CatmullRomCurve3(curvePoints);
    const spineTube = new THREE.Mesh(
      new THREE.TubeGeometry(
        spineCurve,
        Math.max(48, artworks.length * 10),
        0.046,
        8,
        false
      ),
      brassSpineMat
    );
    spineTube.castShadow = !isSoftwareGl;
    scene.add(spineTube);

    // Instanced Radial Tension Struts connecting Central Mast -> Helical Spine
    const strutGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 8);
    const strutInstanced = new THREE.InstancedMesh(
      strutGeo,
      bronzeArmMat,
      artworks.length
    );
    const mastRadius = 0.6;
    const strutLen = Math.max(0.5, SPINE_RADIUS - mastRadius);
    const strutMidRadius = mastRadius + strutLen / 2;

    artworks.forEach((_, idx) => {
      const ang = idx * ANGLE_STEP;
      const py = BASE_FRAME_Y + idx * Y_STEP;
      _dummyPos.set(
        strutMidRadius * Math.sin(ang),
        py,
        strutMidRadius * Math.cos(ang)
      );
      _dirVec.set(Math.sin(ang), 0, Math.cos(ang));
      _dummyQuat.setFromUnitVectors(_upAxis, _dirVec);
      _dummyScale.set(1, strutLen, 1);
      _dummyMat4.compose(_dummyPos, _dummyQuat, _dummyScale);
      strutInstanced.setMatrixAt(idx, _dummyMat4);
    });
    strutInstanced.instanceMatrix.needsUpdate = true;
    strutInstanced.computeBoundingSphere();
    scene.add(strutInstanced);

    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const frameItems: HelixFrameItem[] = [];
    let visibleClickableMeshes: THREE.Object3D[] = [];
    let disposed = false;

    const computeFrameMetrics = (rawAspect: number) => {
      const safeAspect =
        Number.isFinite(rawAspect) && rawAspect > 0.1
          ? Math.max(0.4, Math.min(2.6, rawAspect))
          : 4 / 3;
      const maxW = 1.88;
      const maxH = 1.42;
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
            ? -0.08
            : 0;
      const lookYAdjust = safeAspect < 0.88 ? 0.02 : 0;
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

    const sharedPlaceholderTex = createSharedPlaceholderTexture(maxAnisotropy);
    const sharedPlaqueBlankMat = new THREE.MeshStandardMaterial({
      color: 0xf8f3e6,
      roughness: 0.72,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const sharedPlaqueBackGeo = new THREE.BoxGeometry(1.04, 0.28, 0.022);
    const sharedPlaquePlaneGeo = new THREE.PlaneGeometry(1.0, 0.25);

    const armOffsetZ = SPINE_RADIUS - HELIX_RADIUS; // -0.39 (behind frame)
    const sharedArmGeo = new THREE.BoxGeometry(0.06, 0.08, Math.abs(armOffsetZ) + 0.04);
    const sharedClampGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.14, 12);
    const sharedAccentRingGeo = new THREE.BoxGeometry(0.14, 0.032, 0.09);

    const maxStageTexDim = isMobilePerf ? 1024 : 1600;
    const maxConcurrentLoads = isMobilePerf ? 2 : 4;
    let activeTextureLoads = 0;

    const scheduleNextTextureLoads = () => {
      if (disposed || activeTextureLoads >= maxConcurrentLoads) return;
      const focusIdx = activeIndexRef.current;
      const candidates = frameItems
        .filter((f) => f.texState === 'idle')
        .sort(
          (a, b) =>
            Math.abs(a.index - focusIdx) - Math.abs(b.index - focusIdx)
        );

      for (const candidate of candidates) {
        if (activeTextureLoads >= maxConcurrentLoads) break;
        candidate.startTextureLoad();
      }
    };

    artworks.forEach((artwork, index) => {
      const initialAspect = (artwork.widthRatio || 4) / (artwork.heightRatio || 3);
      let metrics = computeFrameMetrics(initialAspect);

      const angle = index * ANGLE_STEP;
      const frameY = BASE_FRAME_Y + index * Y_STEP;

      const group = new THREE.Group();
      group.position.set(
        HELIX_RADIUS * Math.sin(angle),
        frameY,
        HELIX_RADIUS * Math.cos(angle)
      );
      group.rotation.y = angle;
      stageGroup.add(group);

      // Cantilevered Bracket Arm + Spine Clamp + Accent Light Indicator
      const spineClamp = new THREE.Mesh(sharedClampGeo, brassSpineMat);
      spineClamp.position.set(0, 0, armOffsetZ);
      group.add(spineClamp);

      const bracketArm = new THREE.Mesh(sharedArmGeo, bronzeArmMat);
      bracketArm.position.set(0, 0, armOffsetZ / 2);
      bracketArm.castShadow = !isSoftwareGl;
      group.add(bracketArm);

      const accentMat = new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xb84a27 : 0x9f7e48,
        emissive: index === 0 ? 0x3b1206 : 0x000000,
        roughness: 0.34,
        metalness: 0.58,
      });

      const accentCap = new THREE.Mesh(sharedAccentRingGeo, accentMat);
      accentCap.position.set(0, metrics.outerHeight / 2 + 0.025, 0);
      group.add(accentCap);

      // Solid Walnut Frame
      const outerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(metrics.outerWidth, metrics.outerHeight, 0.08),
        darkWalnutMat
      );
      outerFrame.castShadow = !isSoftwareGl;
      outerFrame.receiveShadow = !isSoftwareGl;
      outerFrame.layers.enable(1);
      outerFrame.userData.artworkIndex = index;
      group.add(outerFrame);

      // Archival Cream Mat Board
      const matBoard = new THREE.Mesh(
        new THREE.BoxGeometry(metrics.matWidth, metrics.matHeight, 0.024),
        matBoardMat
      );
      matBoard.position.set(0, 0, 0.036);
      group.add(matBoard);

      // True sRGB Print Plane
      const photoMat = new THREE.MeshBasicMaterial({
        map: sharedPlaceholderTex,
        toneMapped: false,
        fog: false,
      });
      const photoMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(metrics.photoWidth, metrics.photoHeight),
        photoMat
      );
      photoMesh.position.set(0, 0, 0.052);
      photoMesh.layers.enable(1);
      photoMesh.userData.artworkIndex = index;
      group.add(photoMesh);

      // Hanging Museum Plaque below frame
      const plaqueOffsetY = -(metrics.outerHeight / 2 + 0.17);
      const plaqueBack = new THREE.Mesh(sharedPlaqueBackGeo, darkWalnutMat);
      plaqueBack.position.set(0, plaqueOffsetY, 0.004);
      group.add(plaqueBack);

      const plaqueMesh = new THREE.Mesh(
        sharedPlaquePlaneGeo,
        sharedPlaqueBlankMat
      );
      plaqueMesh.position.set(0, plaqueOffsetY, 0.018);
      group.add(plaqueMesh);

      let plaqueBuilt = false;
      const ensurePlaque = () => {
        if (plaqueBuilt || disposed) return;
        plaqueBuilt = true;
        const plaqueTex = createPlaqueTexture(artwork, index + 1, maxAnisotropy);
        plaqueMesh.material = new THREE.MeshStandardMaterial({
          map: plaqueTex,
          roughness: 0.72,
          metalness: 0.04,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
      };

      const frameItem: HelixFrameItem = {
        artwork,
        index,
        group,
        accentMat,
        clickTargets: [outerFrame, photoMesh],
        camZAdjust: metrics.camZAdjust,
        lookYAdjust: metrics.lookYAdjust,
        ensurePlaque,
        texState: 'idle',
        startTextureLoad: () => {
          if (frameItem.texState !== 'idle' || disposed) return;
          frameItem.texState = 'loading';
          activeTextureLoads += 1;

          textureLoader.load(
            artwork.src,
            (loadedTex) => {
              activeTextureLoads = Math.max(0, activeTextureLoads - 1);
              frameItem.texState = 'done';
              if (disposed) {
                loadedTex.dispose();
                return;
              }

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

              loadedTex.colorSpace = THREE.SRGBColorSpace;
              loadedTex.anisotropy = maxAnisotropy;
              loadedTex.generateMipmaps = true;
              loadedTex.minFilter = THREE.LinearMipmapLinearFilter;
              loadedTex.magFilter = THREE.LinearFilter;

              const finalTex =
                natW > 0 && natH > 0
                  ? downscaleTextureForStage(
                      loadedTex,
                      natW,
                      natH,
                      maxStageTexDim,
                      maxAnisotropy
                    )
                  : loadedTex;

              photoMat.map = finalTex;
              photoMat.needsUpdate = true;

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

                  accentCap.position.y = metrics.outerHeight / 2 + 0.025;
                  const nextPlaqueY = -(metrics.outerHeight / 2 + 0.17);
                  plaqueBack.position.y = nextPlaqueY;
                  plaqueMesh.position.y = nextPlaqueY;

                  frameItem.camZAdjust = metrics.camZAdjust;
                  frameItem.lookYAdjust = metrics.lookYAdjust;
                }
              }

              requestRender();
              scheduleNextTextureLoads();
            },
            undefined,
            () => {
              activeTextureLoads = Math.max(0, activeTextureLoads - 1);
              frameItem.texState = 'done';
              scheduleNextTextureLoads();
            }
          );
        },
      };

      frameItems.push(frameItem);
    });

    scheduleNextTextureLoads();

    let composer: EffectComposer | null = null;
    let dofPass: SubtleDepthOfFieldPass | null = null;
    let outputPass: OutputPass | null = null;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);

      const pixelRatio = renderer.getPixelRatio();
      const msaaSamples = renderer.capabilities.isWebGL2
        ? Math.min(isMobilePerf ? 2 : 4, renderer.capabilities.maxSamples)
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
        focus: 4.0,
        focusDeadZone: isMobilePerf ? 0.85 : 0.65,
        blurRange: 3.0,
        maxBlur: width < 640 ? 0.003 : 0.0044,
        samples: isMobilePerf ? 4 : 12,
        depthScale: isMobilePerf ? 0.25 : 0.45,
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

    // Seed initial camera position (angled Atrium intro if introProgressRef === 1)
    const initCamCfg = getResponsiveCameraConfig(width, height, isOverviewRef.current);
    const initIntro = introProgressRef.current;
    const initAngle = currentOffset * ANGLE_STEP + initCamCfg.angleLead + initIntro * 0.48;
    const initY = BASE_FRAME_Y + currentOffset * Y_STEP;
    const initCamRadius =
      HELIX_RADIUS + initCamCfg.focusDist + initIntro * 2.8;
    _camCurrentPos.set(
      initCamRadius * Math.sin(initAngle),
      initY + initCamCfg.camOffsetY + initIntro * 1.4,
      initCamRadius * Math.cos(initAngle)
    );
    _lookCurrent.set(
      HELIX_RADIUS * (1 - initCamCfg.axisBlend) * Math.sin(currentOffset * ANGLE_STEP),
      initY,
      HELIX_RADIUS * (1 - initCamCfg.axisBlend) * Math.cos(currentOffset * ANGLE_STEP)
    );
    camera.position.copy(_camCurrentPos);
    camera.lookAt(_lookCurrent);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let isAnimActive = false;
    let lastClockMs = performance.now();
    let lastScheduledFocus = activeIndexRef.current;

    function updateHelixVisibilityAndHighlights(
      offsetValue: number,
      colorAlpha: number,
      overview: boolean
    ): boolean {
      const visibilityCutoff = overview
        ? 14.0
        : width < 640
          ? 9.5
          : 11.5;
      let colorAnimating = false;
      const nextClickable: THREE.Object3D[] = [];

      for (const item of frameItems) {
        const absRel = Math.abs(item.index - offsetValue);

        if (absRel > visibilityCutoff) {
          item.group.visible = false;
          continue;
        }

        item.group.visible = true;
        item.ensurePlaque();
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

      if (activeIndexRef.current !== lastScheduledFocus) {
        lastScheduledFocus = activeIndexRef.current;
        scheduleNextTextureLoads();
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

    updateHelixVisibilityAndHighlights(currentOffset, 1, isOverviewRef.current);

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

        const count = frameItems.length;
        const maxIdx = Math.max(0, count - 1);

        // Advance momentum glide after pointer/wheel release
        if (!isDraggingRef.current && Math.abs(momentumVelRef.current) > 0.001) {
          targetOffsetRef.current += momentumVelRef.current * delta;
          if (targetOffsetRef.current < 0) {
            targetOffsetRef.current = 0;
            momentumVelRef.current = 0;
          } else if (targetOffsetRef.current > maxIdx) {
            targetOffsetRef.current = maxIdx;
            momentumVelRef.current = 0;
          } else {
            momentumVelRef.current *= Math.exp(-3.5 * delta);
          }

          if (Math.abs(momentumVelRef.current) < 0.28) {
            momentumVelRef.current = 0;
            snapTargetRef.current = Math.round(targetOffsetRef.current);
          }

          const nearest = Math.max(0, Math.min(maxIdx, Math.round(targetOffsetRef.current)));
          if (nearest !== activeIndexRef.current) {
            activeIndexRef.current = nearest;
            setActiveIndex(nearest);
          }
          renderDirty = true;
        } else if (
          !isDraggingRef.current &&
          snapTargetRef.current !== null &&
          Math.abs(targetOffsetRef.current - snapTargetRef.current) > 0.001
        ) {
          targetOffsetRef.current = THREE.MathUtils.damp(
            targetOffsetRef.current,
            snapTargetRef.current,
            8.5,
            delta
          );
          if (Math.abs(targetOffsetRef.current - snapTargetRef.current) < 0.001) {
            targetOffsetRef.current = snapTargetRef.current;
          } else {
            renderDirty = true;
          }
        }

        // Smooth opening atrium glide
        if (introProgressRef.current > 0.001) {
          const introDamp = isDraggingRef.current ? 8.5 : 2.9;
          introProgressRef.current = THREE.MathUtils.damp(
            introProgressRef.current,
            0,
            introDamp,
            delta
          );
          if (introProgressRef.current < 0.002) {
            introProgressRef.current = 0;
          } else {
            renderDirty = true;
          }
        }

        const goalOffset = targetOffsetRef.current;
        if (prefersReducedMotion || isSoftwareGl) {
          currentOffset = goalOffset;
        } else if (isDraggingRef.current) {
          currentOffset = THREE.MathUtils.damp(currentOffset, goalOffset, 28, delta);
          if (Math.abs(currentOffset - goalOffset) > 0.0008) {
            renderDirty = true;
          }
        } else {
          currentOffset = THREE.MathUtils.damp(currentOffset, goalOffset, 7.2, delta);
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

        const overview = isOverviewRef.current;
        const camCfg = getResponsiveCameraConfig(width, height, overview);
        const framing = getInterpolatedFraming(currentOffset);
        const aspectPullbackScale = camCfg.viewportAspect < 0.85 ? 0.82 : 0.65;

        const spiralAngle = currentOffset * ANGLE_STEP;
        const spiralY = BASE_FRAME_Y + currentOffset * Y_STEP;

        const introT = introProgressRef.current;
        const deltaOffset = goalOffset - currentOffset;
        const travelIntensity = Math.min(1, Math.abs(deltaOffset) * 0.9);
        const arcPullback = travelIntensity * 0.45;

        const camAzimuth =
          spiralAngle +
          camCfg.angleLead +
          introT * 0.42 +
          smoothParallaxX * 0.16;

        const desiredCamRadius =
          HELIX_RADIUS +
          camCfg.focusDist +
          framing.camZAdjust * aspectPullbackScale +
          arcPullback +
          introT * 2.5;

        _camTargetPos.set(
          desiredCamRadius * Math.sin(camAzimuth),
          spiralY +
            camCfg.camOffsetY +
            introT * 1.15 +
            smoothParallaxY * 0.18,
          desiredCamRadius * Math.cos(camAzimuth)
        );

        const focusWeight = 1 - camCfg.axisBlend;
        _lookTarget.set(
          HELIX_RADIUS * focusWeight * Math.sin(spiralAngle) +
            smoothParallaxX * 0.08,
          spiralY + framing.lookYAdjust + (overview ? 0.1 : -0.04),
          HELIX_RADIUS * focusWeight * Math.cos(spiralAngle)
        );

        let colorAlpha = 1;
        if (prefersReducedMotion || isSoftwareGl) {
          _camCurrentPos.copy(_camTargetPos);
          _lookCurrent.copy(_lookTarget);
        } else {
          const posAlpha = 1 - Math.exp(-5.6 * delta);
          const lookAlpha = 1 - Math.exp(-6.8 * delta);
          colorAlpha = 1 - Math.exp(-8.5 * delta);

          _camCurrentPos.lerp(_camTargetPos, posAlpha);
          _lookCurrent.lerp(_lookTarget, lookAlpha);

          if (
            _camCurrentPos.distanceToSquared(_camTargetPos) > 0.000004 ||
            _lookCurrent.distanceToSquared(_lookTarget) > 0.000004
          ) {
            renderDirty = true;
          } else {
            _camCurrentPos.copy(_camTargetPos);
            _lookCurrent.copy(_lookTarget);
          }
        }

        camera.position.copy(_camCurrentPos);
        camera.lookAt(_lookCurrent);

        // Keep directional studio key & rim light rotating cleanly with camera around the 360° helix
        const keyAzimuth = camAzimuth + 0.58;
        keyLight.position.set(
          Math.sin(keyAzimuth) * 8.2,
          _camCurrentPos.y + 4.8,
          Math.cos(keyAzimuth) * 8.2
        );
        keyLight.target.position.set(0, _lookCurrent.y, 0);
        keyLight.target.updateMatrixWorld();

        const rimAzimuth = camAzimuth - 2.35;
        rimLight.position.set(
          Math.sin(rimAzimuth) * 7.5,
          _camCurrentPos.y + 2.2,
          Math.cos(rimAzimuth) * 7.5
        );

        const colorAnimating = updateHelixVisibilityAndHighlights(
          currentOffset,
          colorAlpha,
          overview
        );
        if (colorAnimating) {
          renderDirty = true;
        }

        if (composer && dofPass) {
          _focusFramePos.set(
            HELIX_RADIUS * Math.sin(spiralAngle),
            spiralY,
            HELIX_RADIUS * Math.cos(spiralAngle)
          );
          const focusDist = _camCurrentPos.distanceTo(_focusFramePos);
          dofPass.setFocus(Math.max(1.5, focusDist - 0.05));
          dofPass.uniforms.focusDeadZone.value = overview
            ? 2.8
            : isMobilePerf
              ? 0.85
              : 0.65;
          dofPass.uniforms.maxBlur.value = overview
            ? 0.0014
            : width < 640
              ? 0.003
              : 0.0044;
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
        if (hitIdx === activeIndexRef.current && !isOverviewRef.current) {
          const selected = artworksRef.current[hitIdx];
          if (selected) onSelectRef.current(selected);
        } else {
          setIsOverview(false);
          isOverviewRef.current = false;
          goToIndex(hitIdx);
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
      pointerParallaxX = nx * 0.52;
      pointerParallaxY = ny * 0.42;
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
      sharedPlaceholderTex.dispose();
      sharedPlaqueBlankMat.dispose();
      sharedPlaqueBackGeo.dispose();
      sharedPlaquePlaneGeo.dispose();
      sharedArmGeo.dispose();
      sharedClampGeo.dispose();
      sharedAccentRingGeo.dispose();
      shadowTex.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [artworks, isLoading]);

  // Pointer drag + inertia gesture state
  const pointerStateRef = useRef<{
    activeId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastTime: number;
    downTime: number;
    totalMove: number;
    emaVel: number;
  }>({
    activeId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    downTime: 0,
    totalMove: 0,
    emaVel: 0,
  });

  if (isLoading) {
    return (
      <div className="relative w-full h-[calc(100dvh-8.875rem)] md:h-[calc(100dvh-6.75rem)] min-h-[440px] bg-[#EAE0CA] border-b border-[#221B15]/20 flex items-center justify-center px-6">
        <div className="bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] px-6 py-4 shadow-[4px_4px_0px_rgba(34,27,21,0.1)] text-center">
          <p className="font-mono-retro text-[11px] uppercase tracking-[0.14em] text-[#B84A27]">
            3D Helical Rotunda
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
      <div className="w-full h-[calc(100dvh-8.875rem)] md:h-[calc(100dvh-6.75rem)] min-h-[440px] flex items-center justify-center bg-[#EAE0CA] border-b border-[#221B15]/20 px-6">
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
      <div className="w-full h-[calc(100dvh-8.875rem)] md:h-[calc(100dvh-6.75rem)] min-h-[440px] flex items-center justify-center bg-[#EAE0CA] border-b border-[#221B15]/20 px-6">
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
    if (activeIndex <= 0) {
      goToIndex(artworks.length - 1);
    } else {
      goToIndex(activeIndex - 1);
    }
  };

  const handleNext = () => {
    if (activeIndex >= artworks.length - 1) {
      goToIndex(0);
    } else {
      goToIndex(activeIndex + 1);
    }
  };

  const handleShuffle = () => {
    if (artworks.length <= 1) return;
    let nextIdx = Math.floor(Math.random() * artworks.length);
    if (nextIdx === activeIndex) {
      nextIdx = (activeIndex + 1) % artworks.length;
    }
    goToIndex(nextIdx);
  };

  const interactionHint = hoveredArtwork
    ? hoveredIndex === activeIndex && !isOverview
      ? `Tap to inspect · ${hoveredArtwork.title}`
      : `Tap to fly to · ${hoveredArtwork.title}`
    : isOverview
      ? 'Drag or scroll to orbit spiral · Tap any frame to enter'
      : 'Drag or scroll to spiral · Tap any frame';

  return (
    <div className="relative w-full h-[calc(100dvh-8.875rem)] md:h-[calc(100dvh-6.75rem)] min-h-[440px] bg-[#EAE0CA] border-b border-[#221B15]/20 overflow-hidden select-none">
      {/* Isolated WebGL Container */}
      <div
        ref={mountRef}
        aria-label="Interactive 3D helical exhibition rotunda"
        className="w-full h-full"
      />

      {/* Full-Viewport 2D Drag, Scroll & Raycast Gesture Layer */}
      <div
        ref={gestureSurfaceRef}
        className={`absolute inset-0 z-[5] touch-none ${
          isDragging
            ? 'cursor-grabbing'
            : hoveredIndex !== null
              ? 'cursor-pointer'
              : 'cursor-grab'
        }`}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          const ps = pointerStateRef.current;
          ps.activeId = e.pointerId;
          ps.startX = e.clientX;
          ps.startY = e.clientY;
          ps.lastX = e.clientX;
          ps.lastY = e.clientY;
          ps.lastTime = performance.now();
          ps.downTime = ps.lastTime;
          ps.totalMove = 0;
          ps.emaVel = 0;

          isDraggingRef.current = true;
          setIsDragging(true);
          momentumVelRef.current = 0;
          snapTargetRef.current = null;
          introProgressRef.current = Math.min(introProgressRef.current, 0.2);

          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignore synthetic capture failures
          }
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ps = pointerStateRef.current;

          if (ps.activeId === e.pointerId && isDraggingRef.current) {
            const now = performance.now();
            const dx = e.clientX - ps.lastX;
            const dy = e.clientY - ps.lastY;
            const dt = Math.max(0.004, (now - ps.lastTime) / 1000);

            ps.totalMove += Math.hypot(dx, dy);
            ps.lastX = e.clientX;
            ps.lastY = e.clientY;
            ps.lastTime = now;

            const gainBoost = isOverviewRef.current ? 1.45 : 1.0;
            const scaleX = Math.max(140, rect.width * 0.24);
            const scaleY = Math.max(160, rect.height * 0.34);
            const deltaOffset = ((-dx / scaleX) + (-dy / scaleY)) * gainBoost;

            const count = artworksRef.current.length;
            const maxIdx = Math.max(0, count - 1);
            targetOffsetRef.current = THREE.MathUtils.clamp(
              targetOffsetRef.current + deltaOffset,
              0,
              maxIdx
            );

            const instVel = deltaOffset / dt;
            ps.emaVel = ps.emaVel * 0.62 + instVel * 0.38;

            const nearest = Math.max(
              0,
              Math.min(maxIdx, Math.round(targetOffsetRef.current))
            );
            if (nearest !== activeIndexRef.current) {
              activeIndexRef.current = nearest;
              setActiveIndex(nearest);
            }
            requestRenderRef.current?.();
            return;
          }

          if (e.pointerType === 'mouse') {
            const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            handlePointerParallaxRef.current?.(nx, ny);
            handleHoverAtRef.current?.(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          const ps = pointerStateRef.current;
          if (ps.activeId !== e.pointerId) return;

          ps.activeId = null;
          isDraggingRef.current = false;
          setIsDragging(false);

          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // Ignore release failures
          }

          const elapsed = performance.now() - ps.downTime;
          if (ps.totalMove < 10 && elapsed < 360) {
            snapTargetRef.current = activeIndexRef.current;
            handleTapAtRef.current?.(e.clientX, e.clientY);
            return;
          }

          if (Math.abs(ps.emaVel) > 0.35) {
            momentumVelRef.current = THREE.MathUtils.clamp(ps.emaVel, -14, 14);
          } else {
            snapTargetRef.current = Math.round(targetOffsetRef.current);
          }
          requestRenderRef.current?.();
        }}
        onPointerCancel={(e) => {
          const ps = pointerStateRef.current;
          if (ps.activeId !== e.pointerId) return;
          ps.activeId = null;
          isDraggingRef.current = false;
          setIsDragging(false);
          snapTargetRef.current = Math.round(targetOffsetRef.current);
          requestRenderRef.current?.();
        }}
        onPointerLeave={() => {
          if (!isDraggingRef.current) {
            handlePointerLeaveRef.current?.();
          }
        }}
      />

      {/* Top-Left Compact Exhibition Plaque (No backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 sm:top-5 sm:left-6 z-10 max-w-[min(440px,calc(100%-1.25rem))] bg-[#F8F3E6]/95 border border-[#221B15]/25 px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-[2px] shadow-[2px_2px_0px_rgba(34,27,21,0.12)]">
        {(aboutKicker || aboutPeriod) && (
          <p className="hidden sm:block font-mono-retro text-[10px] uppercase tracking-[0.14em] text-[#B84A27] truncate">
            <span>{aboutKicker}</span>
            {aboutPeriod && (
              <>
                <span aria-hidden="true" className="text-[#635443]"> · </span>
                <span className="tabular-nums text-[#635443]">{aboutPeriod}</span>
              </>
            )}
          </p>
        )}
        <h1 className="font-serif-editorial text-[15px] sm:text-xl font-semibold leading-tight text-[#221B15] truncate">
          {heroTitle}
        </h1>
        <p className="mt-0.5 font-mono-retro text-[9.5px] sm:text-[10px] uppercase tracking-[0.08em] text-[#635443] truncate">
          {activeCategory} · {artworks.length} {artworks.length === 1 ? 'Work' : 'Works'}
          <span className="hidden sm:inline"> · {interactionHint}</span>
        </p>
      </div>

      {/* Collapsible Bottom Thumb-Zone Dock (Zero Viewport Occlusion) */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 bottom-2.5 sm:bottom-5 z-10 w-[min(760px,95%)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
          {isFilmstripOpen && artworks.length > 1 && (
            <div
              ref={filmstripRef}
              aria-label="35mm contact sheet quick jump"
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x py-1.5 px-1.5 bg-[#221B15] rounded-[2px]"
            >
              {artworks.map((artwork, index) => {
                const isSelected = index === activeIndex;
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    data-film-index={index}
                    onClick={() => {
                      setIsOverview(false);
                      goToIndex(index);
                    }}
                    aria-label={`Jump to frame ${index + 1}: ${artwork.title}`}
                    className={`relative shrink-0 snap-center w-14 h-10 overflow-hidden rounded-[1px] border transition-all ${
                      isSelected
                        ? 'border-[#B84A27] ring-1 ring-[#B84A27] opacity-100 scale-[1.03]'
                        : 'border-[#F8F3E6]/20 opacity-65 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={artwork.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 right-0 px-1 bg-[#221B15]/85 font-mono-retro text-[8px] leading-tight text-[#F8F3E6] tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-1.5 sm:gap-2.5">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handlePrev}
                disabled={artworks.length <= 1}
                aria-label="Previous artwork"
                className="min-h-[44px] min-w-[38px] sm:min-w-[42px] inline-flex items-center justify-center border border-[#221B15]/20 bg-[#EFE6D2]/80 hover:border-[#221B15]/50 hover:text-[#B84A27] disabled:opacity-40 rounded-[2px] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={artworks.length <= 1}
                aria-label="Next artwork"
                className="min-h-[44px] min-w-[38px] sm:min-w-[42px] inline-flex items-center justify-center border border-[#221B15]/20 bg-[#EFE6D2]/80 hover:border-[#221B15]/50 hover:text-[#B84A27] disabled:opacity-40 rounded-[2px] transition-colors"
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

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsOverview((v) => !v)}
                aria-pressed={isOverview}
                aria-label={isOverview ? 'Zoom into artwork' : 'Open Atrium spiral overview'}
                className={`min-h-[44px] min-w-[42px] sm:px-2.5 inline-flex items-center justify-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] border rounded-[2px] transition-colors whitespace-nowrap ${
                  isOverview
                    ? 'bg-[#221B15] text-[#F8F3E6] border-[#221B15]'
                    : 'bg-[#EFE6D2] text-[#221B15] border-[#221B15]/25 hover:bg-[#E3D7BE]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden md:inline">Atrium</span>
              </button>

              {artworks.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsFilmstripOpen((v) => !v)}
                    aria-pressed={isFilmstripOpen}
                    aria-label={isFilmstripOpen ? 'Close filmstrip roll' : 'Open filmstrip roll'}
                    className={`min-h-[44px] min-w-[42px] sm:px-2.5 inline-flex items-center justify-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] border rounded-[2px] transition-colors whitespace-nowrap ${
                      isFilmstripOpen
                        ? 'bg-[#221B15] text-[#F8F3E6] border-[#221B15]'
                        : 'bg-[#EFE6D2] text-[#221B15] border-[#221B15]/25 hover:bg-[#E3D7BE]'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="hidden md:inline">Roll</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShuffle}
                    aria-label="Fly to random artwork"
                    className="hidden sm:inline-flex min-h-[44px] min-w-[42px] items-center justify-center border border-[#221B15]/25 bg-[#EFE6D2] text-[#221B15] hover:bg-[#E3D7BE] hover:text-[#B84A27] rounded-[2px] transition-colors"
                  >
                    <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => currentArtwork && onSelectArtwork(currentArtwork)}
                aria-label="Inspect current artwork"
                className="min-h-[44px] min-w-[42px] sm:px-3.5 inline-flex items-center justify-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] bg-[#B84A27] text-[#F8F3E6] hover:bg-[#221B15] rounded-[2px] transition-colors whitespace-nowrap"
              >
                <Expand className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Inspect</span>
              </button>

              <button
                type="button"
                onClick={onExit3D}
                aria-label="Switch to Grid View"
                className="min-h-[44px] min-w-[42px] sm:px-3 inline-flex items-center justify-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] text-[#221B15] bg-[#EFE6D2] hover:bg-[#E3D7BE] border border-[#221B15]/25 rounded-[2px] transition-colors whitespace-nowrap"
              >
                <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Grid</span>
              </button>
            </div>
          </div>

          {artworks.length > 1 && (
            <>
              {/* Mobile Thumb-Friendly Film Scrubber */}
              <div className="sm:hidden flex items-center gap-2.5 pt-0.5">
                <span className="font-mono-retro text-[9.5px] tabular-nums text-[#635443]">
                  01
                </span>
                <input
                  type="range"
                  min={0}
                  max={artworks.length - 1}
                  step={1}
                  value={activeIndex}
                  aria-label="Spiral through artworks"
                  onChange={(e) => {
                    setIsOverview(false);
                    goToIndex(Number(e.target.value));
                  }}
                  className="flex-1 h-2 accent-[#B84A27] cursor-pointer"
                />
                <span className="font-mono-retro text-[9.5px] tabular-nums text-[#635443]">
                  {String(artworks.length).padStart(2, '0')}
                </span>
              </div>

              {/* Desktop Segment Jump Tabs */}
              <div
                role="tablist"
                aria-label="Jump to frame"
                className="hidden sm:flex items-center gap-1.5 pt-0.5"
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
                      onClick={() => {
                        setIsOverview(false);
                        goToIndex(index);
                      }}
                      className={`h-1.5 flex-1 rounded-[1px] transition-colors ${
                        isSelected
                          ? 'bg-[#B84A27]'
                          : 'bg-[#221B15]/15 hover:bg-[#221B15]/35'
                      }`}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
