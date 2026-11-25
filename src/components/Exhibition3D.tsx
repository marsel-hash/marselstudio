import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Expand,
  LayoutGrid,
  RotateCcw,
} from 'lucide-react';
import type { Artwork } from '../types/gallery';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
  disposeObject3D,
} from '../utils/webglHelpers';
import { buildVintageCameraAssembly } from '../utils/cameraModel3D';

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

interface FrameTarget {
  artwork: Artwork;
  index: number;
  centerX: number;
  focusCamPos: THREE.Vector3;
  focusLookAt: THREE.Vector3;
  frameAccentMat: THREE.MeshStandardMaterial;
}

const _camGoal = new THREE.Vector3();
const _targetGoal = new THREE.Vector3();

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

function createArchivePlaqueTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8f3e6';
    ctx.fillRect(0, 0, 384, 96);

    ctx.strokeStyle = 'rgba(34, 27, 21, 0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 376, 88);

    ctx.fillStyle = '#b84a27';
    ctx.font = 'bold 17px "IBM Plex Mono", monospace';
    ctx.fillText('ANALOG ARCHIVE · 35MM', 20, 34);

    ctx.fillStyle = '#221b15';
    ctx.font = 'bold 23px Georgia, serif';
    ctx.fillText('Rangefinder & Film', 20, 70);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createWallWashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 96, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(255, 244, 214, 0.72)');
    grad.addColorStop(0.55, 'rgba(255, 238, 200, 0.26)');
    grad.addColorStop(1, 'rgba(255, 238, 200, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredCameraProp, setHoveredCameraProp] = useState(false);
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);
  const [webglUnsupported, setWebglUnsupported] = useState(false);

  const focusedIndexRef = useRef(0);
  const hoveredIndexRef = useRef<number | null>(null);
  const hoveredCameraRef = useRef(false);
  const artworksRef = useRef(artworks);
  artworksRef.current = artworks;

  const isModalOpenRef = useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;

  const onSelectRef = useRef(onSelectArtwork);
  onSelectRef.current = onSelectArtwork;

  const focusTriggerRef = useRef<((idx: number) => void) | null>(null);
  const resetTriggerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setFocusedIndex(0);
    focusedIndexRef.current = 0;
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

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 460);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
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
    scene.fog = new THREE.FogExp2(bgHex, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Compute exact non-overlapping horizontal layout for every artwork
    const frameGap = 1.15;
    const layoutMetrics = artworks.map((artwork) => {
      const aspect = Math.max(
        0.62,
        Math.min(1.75, (artwork.widthRatio || 4) / (artwork.heightRatio || 3))
      );
      const photoHeight = aspect >= 1 ? 1.32 : 1.54;
      const photoWidth = photoHeight * aspect;
      const matWidth = photoWidth + 0.3;
      const matHeight = photoHeight + 0.3;
      const outerWidth = matWidth + 0.12;
      const outerHeight = matHeight + 0.12;
      return {
        artwork,
        photoWidth,
        photoHeight,
        matWidth,
        matHeight,
        outerWidth,
        outerHeight,
      };
    });

    const totalFramesSpan =
      layoutMetrics.reduce((acc, m) => acc + m.outerWidth, 0) +
      frameGap * Math.max(0, layoutMetrics.length - 1);

    const aspectView = width / height;
    const camera = new THREE.PerspectiveCamera(40, aspectView, 0.1, 80);

    // Frame overview cleanly: fit all works when <= 4, or comfortably frame opening gallery wing
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspectView);
    const initialSpanToShow =
      artworks.length <= 4
        ? Math.max(4.8, totalFramesSpan + 2.4)
        : Math.max(6.8, layoutMetrics.slice(0, 3).reduce((a, m) => a + m.outerWidth, 0) + frameGap * 2 + 2.0);
    const overviewZ = THREE.MathUtils.clamp(
      (initialSpanToShow / 2 / Math.tan(hFov / 2)) * 1.1,
      4.4,
      9.4
    );
    const overviewX =
      artworks.length <= 4
        ? 0
        : -totalFramesSpan / 2 +
          (layoutMetrics[0].outerWidth +
            layoutMetrics[1].outerWidth +
            layoutMetrics[2].outerWidth) /
            2 +
          frameGap;

    const defaultCamPos = new THREE.Vector3(overviewX, 1.85, overviewZ);
    const defaultLookAt = new THREE.Vector3(overviewX, 1.58, 0);
    camera.position.copy(defaultCamPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(defaultLookAt);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.0;
    controls.maxDistance = 12.5;
    controls.minPolarAngle = Math.PI * 0.24;
    controls.maxPolarAngle = Math.PI * 0.5;
    controls.minAzimuthAngle = -Math.PI * 0.34;
    controls.maxAzimuthAngle = Math.PI * 0.34;
    controls.screenSpacePanning = true;
    controls.update();

    // 3-Point Warm Museum Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xfff8eb, 0x735e47, 0.92);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff2da, 1.95);
    keyLight.position.set(4.0, 8.8, 7.5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 32;
      keyLight.shadow.camera.left = -12;
      keyLight.shadow.camera.right = 12;
      keyLight.shadow.camera.top = 10;
      keyLight.shadow.camera.bottom = -10;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xebd8bb, 0.72);
    fillLight.position.set(-5.0, 4.2, 5.5);
    scene.add(fillLight);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const shadowTex = createContactShadowTexture();
    const wallWashTex = createWallWashTexture();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    // Museum Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(72, 36),
      new THREE.MeshStandardMaterial({
        color: 0xe3d7be,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 8);
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    // Architectural Exhibition Gallery Wall
    const wallWidth = Math.max(14, totalFramesSpan + 9.0);
    const wallHeight = 4.15;
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(wallWidth, wallHeight, 0.24),
      new THREE.MeshStandardMaterial({
        color: 0xf4ecda,
        roughness: 0.94,
        metalness: 0.01,
      })
    );
    wallMesh.position.set(0, wallHeight / 2, -0.14);
    wallMesh.receiveShadow = !isSoftwareGl;
    scene.add(wallMesh);

    const darkWalnutMat = new THREE.MeshStandardMaterial({
      color: 0x261d16,
      roughness: 0.46,
      metalness: 0.12,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xa27e46,
      roughness: 0.36,
      metalness: 0.76,
    });
    const matBoardMat = new THREE.MeshStandardMaterial({
      color: 0xf9f5eb,
      roughness: 0.88,
      metalness: 0.02,
    });
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xd6c7aa,
      roughness: 0.82,
      metalness: 0.05,
    });
    const lampMetalMat = new THREE.MeshStandardMaterial({
      color: 0x221b15,
      roughness: 0.38,
      metalness: 0.75,
    });
    const lampGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfff3d4,
      emissive: 0xffd796,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });

    // Baseboard Molding + Picture Rail + Inlaid Brass Floor Line
    const baseboard = new THREE.Mesh(
      new THREE.BoxGeometry(wallWidth, 0.18, 0.04),
      darkWalnutMat
    );
    baseboard.position.set(0, 0.09, 0.0);
    scene.add(baseboard);

    const pictureRail = new THREE.Mesh(
      new THREE.BoxGeometry(wallWidth, 0.045, 0.04),
      brassMat
    );
    pictureRail.position.set(0, 3.22, 0.0);
    scene.add(pictureRail);

    const floorBrassGuide = new THREE.Mesh(
      new THREE.PlaneGeometry(wallWidth - 2.0, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0x9f7e48,
        roughness: 0.38,
        metalness: 0.76,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    floorBrassGuide.rotation.x = -Math.PI / 2;
    floorBrassGuide.position.set(0, 0.004, 1.35);
    scene.add(floorBrassGuide);

    // Overhead Suspended Lighting Track Bar
    const trackLength = Math.max(6.5, totalFramesSpan + 2.2);
    const trackBar = new THREE.Mesh(
      new THREE.BoxGeometry(trackLength, 0.055, 0.06),
      lampMetalMat
    );
    trackBar.position.set(0, 3.55, 0.92);
    scene.add(trackBar);

    // Low Walnut Museum Bench positioned well below frames in the foreground
    const benchGroup = new THREE.Group();
    benchGroup.position.set(overviewX, 0, 2.75);
    scene.add(benchGroup);

    const benchShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 1.0),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.52,
      })
    );
    benchShadow.rotation.x = -Math.PI / 2;
    benchShadow.position.y = 0.004;
    benchGroup.add(benchShadow);

    const benchSeat = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.07, 0.5),
      darkWalnutMat
    );
    benchSeat.position.y = 0.39;
    benchSeat.castShadow = !isSoftwareGl;
    benchSeat.receiveShadow = !isSoftwareGl;
    benchGroup.add(benchSeat);

    const benchLegGeo = new THREE.BoxGeometry(0.08, 0.36, 0.42);
    const leftBenchLeg = new THREE.Mesh(benchLegGeo, pedestalMat);
    leftBenchLeg.position.set(-0.7, 0.18, 0);
    leftBenchLeg.castShadow = !isSoftwareGl;
    benchGroup.add(leftBenchLeg);

    const rightBenchLeg = new THREE.Mesh(benchLegGeo, pedestalMat);
    rightBenchLeg.position.set(0.7, 0.18, 0);
    rightBenchLeg.castShadow = !isSoftwareGl;
    benchGroup.add(rightBenchLeg);

    // Curator's 3D Vintage 35mm Camera Plinth parked cleanly to the left wing (never blocks artworks)
    const cameraPlinthGroup = new THREE.Group();
    const plinthX = -totalFramesSpan / 2 - 1.95;
    cameraPlinthGroup.position.set(plinthX, 0, 1.05);
    cameraPlinthGroup.rotation.y = 0.38;
    scene.add(cameraPlinthGroup);

    const plinthShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.45, 1.45),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.65,
      })
    );
    plinthShadow.rotation.x = -Math.PI / 2;
    plinthShadow.position.y = 0.004;
    cameraPlinthGroup.add(plinthShadow);

    const camPedestal = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.78, 0.76),
      pedestalMat
    );
    camPedestal.position.y = 0.39;
    camPedestal.castShadow = !isSoftwareGl;
    camPedestal.receiveShadow = !isSoftwareGl;
    cameraPlinthGroup.add(camPedestal);

    const camPedestalTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.03, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0xb84a27,
        roughness: 0.36,
        metalness: 0.52,
      })
    );
    camPedestalTrim.position.y = 0.795;
    cameraPlinthGroup.add(camPedestalTrim);

    const archivePlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.16),
      new THREE.MeshStandardMaterial({
        map: createArchivePlaqueTexture(maxAnisotropy),
        roughness: 0.72,
        metalness: 0.04,
      })
    );
    archivePlaque.position.set(0, 0.58, 0.384);
    cameraPlinthGroup.add(archivePlaque);

    const camAssembly = buildVintageCameraAssembly(maxAnisotropy, isSoftwareGl);
    camAssembly.root.scale.setScalar(0.35);
    camAssembly.root.position.set(-0.04, 0.81, 0);
    cameraPlinthGroup.add(camAssembly.root);

    const camHitProxy = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.55, 0.68),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    camHitProxy.position.set(0, 1.06, 0);
    camHitProxy.layers.enable(1);
    camHitProxy.userData.isCameraProp = true;
    cameraPlinthGroup.add(camHitProxy);

    // Gallery Wall Mounted Artworks (Eye-level shared datum y = 1.72, strictly non-overlapping X)
    const framesGroup = new THREE.Group();
    scene.add(framesGroup);

    const frameTargets: FrameTarget[] = [];
    const clickableMeshes: THREE.Object3D[] = [camHitProxy];
    let disposed = false;

    const eyeLevelY = 1.72;
    let cursorX = -totalFramesSpan / 2;

    layoutMetrics.forEach((m, index) => {
      const centerX = cursorX + m.outerWidth / 2;
      cursorX += m.outerWidth + frameGap;

      const plateGroup = new THREE.Group();
      plateGroup.position.set(centerX, 0, 0);
      framesGroup.add(plateGroup);

      // Subtle warm spotlight wash on the wall behind the print
      const wallWash = new THREE.Mesh(
        new THREE.PlaneGeometry(m.outerWidth + 1.15, m.outerHeight + 1.25),
        new THREE.MeshBasicMaterial({
          map: wallWashTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.62,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      wallWash.position.set(0, eyeLevelY + 0.05, -0.012);
      plateGroup.add(wallWash);

      // Overhead Track Spotlight Head aimed at this print
      const lampHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.082, 0.22, 18),
        lampMetalMat
      );
      lampHousing.position.set(0, 3.43, 0.92);
      lampHousing.rotation.x = 0.58;
      plateGroup.add(lampHousing);

      const lampLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.07, 16),
        lampGlowMat
      );
      lampLens.position.set(0, 3.34, 0.86);
      lampLens.rotation.x = Math.PI / 2 + 0.58;
      plateGroup.add(lampLens);

      // Outer Walnut Gallery Frame mounted flush to wall
      const outerFrame = new THREE.Mesh(
        new THREE.BoxGeometry(m.outerWidth, m.outerHeight, 0.075),
        darkWalnutMat
      );
      outerFrame.position.set(0, eyeLevelY, 0.02);
      outerFrame.castShadow = !isSoftwareGl;
      outerFrame.receiveShadow = !isSoftwareGl;
      outerFrame.layers.enable(1);
      outerFrame.userData.artworkIndex = index;
      plateGroup.add(outerFrame);
      clickableMeshes.push(outerFrame);

      // Subtle bottom terracotta/brass selection accent bar beneath frame
      const frameAccentMat = new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xb84a27 : 0x9f7e48,
        emissive: index === 0 ? 0x3b1206 : 0x000000,
        roughness: 0.35,
        metalness: 0.65,
      });
      const frameAccentBar = new THREE.Mesh(
        new THREE.BoxGeometry(m.outerWidth * 0.45, 0.018, 0.082),
        frameAccentMat
      );
      frameAccentBar.position.set(0, eyeLevelY - m.outerHeight / 2 - 0.025, 0.02);
      plateGroup.add(frameAccentBar);

      // Archival Cream Mat Board
      const matBoard = new THREE.Mesh(
        new THREE.BoxGeometry(m.matWidth, m.matHeight, 0.024),
        matBoardMat
      );
      matBoard.position.set(0, eyeLevelY, 0.052);
      plateGroup.add(matBoard);

      // Photo Plane
      const fallbackTex = createFallbackArtworkTexture(m.artwork, maxAnisotropy);
      const photoMat = new THREE.MeshStandardMaterial({
        map: fallbackTex,
        roughness: 0.34,
        metalness: 0.02,
      });
      const photoMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(m.photoWidth, m.photoHeight),
        photoMat
      );
      photoMesh.position.set(0, eyeLevelY, 0.068);
      photoMesh.layers.enable(1);
      photoMesh.userData.artworkIndex = index;
      plateGroup.add(photoMesh);
      clickableMeshes.push(photoMesh);

      textureLoader.load(
        m.artwork.src,
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
          requestRender();
        },
        undefined,
        () => {
          // Keep clean procedural canvas fallback on CORS/load failure
        }
      );

      // Museum Wall Plaque directly beneath frame
      const plaqueTex = createPlaqueTexture(m.artwork, index + 1, maxAnisotropy);
      const plaqueMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.23),
        new THREE.MeshStandardMaterial({
          map: plaqueTex,
          roughness: 0.75,
          metalness: 0.04,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      plaqueMesh.position.set(0, eyeLevelY - m.outerHeight / 2 - 0.22, -0.005);
      plateGroup.add(plaqueMesh);

      // Ideal straight-on viewing distance scaled by print size
      const focusDistance = Math.max(2.6, Math.max(m.outerWidth, m.outerHeight) * 1.48);
      frameTargets.push({
        artwork: m.artwork,
        index,
        centerX,
        focusCamPos: new THREE.Vector3(centerX, eyeLevelY - 0.04, focusDistance),
        focusLookAt: new THREE.Vector3(centerX, eyeLevelY - 0.06, 0.05),
        frameAccentMat,
      });
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let isTransitioning = false;
    let shutterPulse = 0;
    let lastClockMs = performance.now();

    function syncTrimHighlights() {
      for (const target of frameTargets) {
        const isActive =
          target.index === focusedIndexRef.current ||
          target.index === hoveredIndexRef.current;
        target.frameAccentMat.color.setHex(isActive ? 0xb84a27 : 0x9f7e48);
        target.frameAccentMat.emissive.setHex(isActive ? 0x3b1206 : 0x000000);
      }
    }

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
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        const now = performance.now();
        const delta = Math.min((now - lastClockMs) / 1000, 0.08);
        lastClockMs = now;

        if (shutterPulse > 0.005) {
          shutterPulse = THREE.MathUtils.damp(shutterPulse, 0, 12, delta);
          camAssembly.shutterButton.position.y =
            camAssembly.shutterRestY - shutterPulse * 0.036;
          camAssembly.shutterDialGroup.rotation.y = shutterPulse * 0.45;
          renderDirty = true;
        } else if (shutterPulse !== 0) {
          shutterPulse = 0;
          camAssembly.shutterButton.position.y = camAssembly.shutterRestY;
        }

        if (isTransitioning) {
          const lambda = 6.5;
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            _camGoal.x,
            lambda,
            delta
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            _camGoal.y,
            lambda,
            delta
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            _camGoal.z,
            lambda,
            delta
          );

          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            _targetGoal.x,
            lambda,
            delta
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            _targetGoal.y,
            lambda,
            delta
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            _targetGoal.z,
            lambda,
            delta
          );

          const remaining =
            camera.position.distanceTo(_camGoal) +
            controls.target.distanceTo(_targetGoal);
          if (remaining < 0.015) {
            camera.position.copy(_camGoal);
            controls.target.copy(_targetGoal);
            isTransitioning = false;
          } else {
            renderDirty = true;
          }
        }

        const didDamp = controls.update();
        if (didDamp) {
          renderDirty = true;
        }

        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) {
            requestRender();
          }
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    const focusFrame = (idx: number) => {
      const target = frameTargets[idx];
      if (!target) return;
      focusedIndexRef.current = idx;
      setFocusedIndex(idx);
      syncTrimHighlights();
      _camGoal.copy(target.focusCamPos);
      _targetGoal.copy(target.focusLookAt);
      isTransitioning = true;
      lastClockMs = performance.now();
      requestRender();
    };

    const resetOverview = () => {
      _camGoal.copy(defaultCamPos);
      _targetGoal.copy(defaultLookAt);
      isTransitioning = true;
      lastClockMs = performance.now();
      requestRender();
    };

    focusTriggerRef.current = focusFrame;
    resetTriggerRef.current = resetOverview;

    const onControlStart = () => {
      isTransitioning = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastHoverCheck = 0;

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);

      let nextHoveredFrame: number | null = null;
      let nextHoveredCam = false;
      if (hits.length > 0) {
        const hitData = hits[0].object.userData;
        if (hitData.isCameraProp) {
          nextHoveredCam = true;
        } else if (typeof hitData.artworkIndex === 'number') {
          nextHoveredFrame = hitData.artworkIndex;
        }
      }

      if (nextHoveredFrame !== hoveredIndexRef.current) {
        hoveredIndexRef.current = nextHoveredFrame;
        setHoveredIndex(nextHoveredFrame);
        syncTrimHighlights();
        requestRender();
      }
      if (nextHoveredCam !== hoveredCameraRef.current) {
        hoveredCameraRef.current = nextHoveredCam;
        setHoveredCameraProp(nextHoveredCam);
      }

      renderer.domElement.style.cursor =
        nextHoveredFrame !== null || nextHoveredCam ? 'pointer' : 'grab';
    };

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitData = hits[0].object.userData;
        if (hitData.isCameraProp) {
          shutterPulse = 1;
          lastClockMs = performance.now();
          requestRender();
          return;
        }
        if (typeof hitData.artworkIndex === 'number') {
          const hitIdx = hitData.artworkIndex;
          if (hitIdx === focusedIndexRef.current) {
            const selected = artworksRef.current[hitIdx];
            if (selected) onSelectRef.current(selected);
          } else {
            focusFrame(hitIdx);
          }
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (artworksRef.current.length === 0) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const nextIdx =
          (focusedIndexRef.current + 1) % artworksRef.current.length;
        focusFrame(nextIdx);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevIdx =
          (focusedIndexRef.current - 1 + artworksRef.current.length) %
          artworksRef.current.length;
        focusFrame(prevIdx);
      } else if (e.key === 'Escape') {
        resetOverview();
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 460);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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
      focusTriggerRef.current = null;
      resetTriggerRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver?.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('keydown', onKeyDown);
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
      <div className="relative w-full h-[calc(100dvh-6.75rem)] min-h-[500px] bg-[#EAE0CA] border-b border-[#221B15]/20 flex items-center justify-center px-6">
        <div className="bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] px-6 py-4 shadow-[4px_4px_0px_rgba(34,27,21,0.1)] text-center">
          <p className="font-mono-retro text-[11px] uppercase tracking-[0.14em] text-[#B84A27]">
            3D Exhibition Room
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
      <div className="w-full h-[calc(100dvh-6.75rem)] min-h-[460px] flex items-center justify-center bg-[#EAE0CA] border-b border-[#221B15]/20 px-6">
        <div className="py-12 px-8 text-center bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] shadow-[4px_4px_0px_rgba(34,27,21,0.1)]">
          <p className="font-serif-editorial text-2xl text-[#221B15]">
            No artworks in this category yet.
          </p>
          <button
            type="button"
            onClick={onExit3D}
            className="mt-4 min-h-[40px] px-4 font-mono-retro text-[11px] uppercase tracking-[0.08em] bg-[#221B15] text-[#F8F3E6] hover:bg-[#B84A27] rounded-[2px] transition-colors"
          >
            Switch to Grid View
          </button>
        </div>
      </div>
    );
  }

  if (webglUnsupported) {
    return (
      <div className="w-full h-[calc(100dvh-6.75rem)] min-h-[460px] flex items-center justify-center bg-[#EAE0CA] border-b border-[#221B15]/20 px-6">
        <div className="p-8 text-center bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] shadow-[4px_4px_0px_rgba(34,27,21,0.12)] max-w-md">
          <p className="font-serif-editorial text-xl text-[#221B15]">
            3D Exhibition requires WebGL support in your browser.
          </p>
          <button
            type="button"
            onClick={onExit3D}
            className="mt-4 min-h-[40px] px-4 py-2 font-mono-retro text-xs uppercase tracking-wider bg-[#221B15] text-[#F8F3E6] hover:bg-[#B84A27] rounded-[2px] transition-colors"
          >
            Open Grid View
          </button>
        </div>
      </div>
    );
  }

  const currentArtwork = artworks[focusedIndex] ?? artworks[0];
  const hoveredArtwork =
    hoveredIndex !== null ? artworks[hoveredIndex] : undefined;

  const handlePrev = () => {
    const nextIdx = (focusedIndex - 1 + artworks.length) % artworks.length;
    focusTriggerRef.current?.(nextIdx);
  };

  const handleNext = () => {
    const nextIdx = (focusedIndex + 1) % artworks.length;
    focusTriggerRef.current?.(nextIdx);
  };

  let interactionHint = 'Drag to orbit · Right-drag to pan · Click frame to focus';
  if (hoveredCameraProp) {
    interactionHint = 'Click 35mm rangefinder camera to fire shutter';
  } else if (hoveredArtwork) {
    interactionHint =
      hoveredIndex === focusedIndex
        ? `Click again to inspect · ${hoveredArtwork.title}`
        : `Click to focus · ${hoveredArtwork.title}`;
  }

  return (
    <div className="relative w-full h-[calc(100dvh-6.75rem)] min-h-[500px] bg-[#EAE0CA] border-b border-[#221B15]/20 overflow-hidden select-none">
      {/* Isolated WebGL Container */}
      <div
        ref={mountRef}
        aria-label="Interactive 3D museum exhibition wall"
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Top-Left Editorial Title Plaque (No backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute top-3.5 left-3.5 sm:top-5 sm:left-6 z-10 max-w-[min(430px,calc(100%-2rem))] bg-[#F8F3E6]/95 border border-[#221B15]/25 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-[2px] shadow-[3px_3px_0px_rgba(34,27,21,0.12)]">
        {(aboutKicker || aboutPeriod) && (
          <p className="font-mono-retro text-[10px] uppercase tracking-[0.14em] text-[#B84A27] truncate">
            <span>{aboutKicker}</span>
            {aboutPeriod && (
              <>
                <span aria-hidden="true" className="text-[#635443]"> · </span>
                <span className="tabular-nums text-[#635443]">{aboutPeriod}</span>
              </>
            )}
          </p>
        )}
        <h1 className="mt-0.5 font-serif-editorial text-lg sm:text-xl font-semibold leading-tight text-[#221B15] truncate">
          {heroTitle}
        </h1>
        <p className="mt-1 font-mono-retro text-[10px] uppercase tracking-[0.09em] text-[#635443] truncate">
          {activeCategory} · {artworks.length} {artworks.length === 1 ? 'Work' : 'Works'} · {interactionHint}
        </p>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 bottom-3 sm:bottom-5 z-10 w-[min(780px,95%)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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

        <div className="bg-[#F8F3E6] border border-[#221B15]/25 rounded-[2px] shadow-[4px_4px_0px_rgba(34,27,21,0.16)] px-3 py-2.5 sm:px-4 sm:py-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrev}
              disabled={artworks.length <= 1}
              aria-label="Focus previous frame"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center border border-[#221B15]/20 bg-[#EFE6D2]/70 hover:border-[#221B15]/50 hover:text-[#B84A27] disabled:opacity-40 rounded-[2px] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={artworks.length <= 1}
              aria-label="Focus next frame"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center border border-[#221B15]/20 bg-[#EFE6D2]/70 hover:border-[#221B15]/50 hover:text-[#B84A27] disabled:opacity-40 rounded-[2px] transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="min-w-0 flex-1 px-1 text-center sm:text-left">
            <p className="font-mono-retro text-[10px] uppercase tracking-[0.12em] text-[#B84A27] tabular-nums">
              Frame {String(focusedIndex + 1).padStart(2, '0')} /{' '}
              {String(artworks.length).padStart(2, '0')} · {currentArtwork?.category}
            </p>
            <p className="font-serif-editorial text-sm sm:text-base font-semibold text-[#221B15] truncate">
              {currentArtwork?.title}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => resetTriggerRef.current?.()}
              aria-label="Reset 3D camera overview"
              title="Reset overview"
              className="min-h-[38px] px-2.5 inline-flex items-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] text-[#635443] hover:text-[#221B15] border border-[#221B15]/20 hover:border-[#221B15]/50 rounded-[2px] transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Overview</span>
            </button>

            <button
              type="button"
              onClick={() => currentArtwork && onSelectArtwork(currentArtwork)}
              className="min-h-[38px] px-3 inline-flex items-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] bg-[#B84A27] text-[#F8F3E6] hover:bg-[#221B15] rounded-[2px] transition-colors whitespace-nowrap"
            >
              <Expand className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Inspect Photo</span>
            </button>

            <button
              type="button"
              onClick={onExit3D}
              className="min-h-[38px] px-2.5 inline-flex items-center gap-1.5 font-mono-retro text-[10px] uppercase tracking-[0.08em] text-[#221B15] bg-[#EFE6D2] hover:bg-[#E3D7BE] border border-[#221B15]/25 rounded-[2px] transition-colors whitespace-nowrap"
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Grid View</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
