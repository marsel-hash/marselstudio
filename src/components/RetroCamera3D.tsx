import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createContactShadowTexture,
  detectSoftwareWebGL,
  disposeObject3D,
} from '../utils/webglHelpers';
import { buildVintageCameraAssembly } from '../utils/cameraModel3D';

function CameraFallbackSeal() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="w-24 h-24 lg:w-28 lg:h-28 text-[#B84A27]/75 -rotate-6 select-none"
    >
      <circle
        cx="60"
        cy="60"
        r="54"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2.5"
      />
      <circle cx="60" cy="60" r="46" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="60" cy="60" r="24" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M60 36L67 52H53L60 36ZM84 60L68 67V53L84 60ZM60 84L53 68H67L60 84ZM36 60L52 53V67L36 60Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="60" r="4" fill="currentColor" />
    </svg>
  );
}

export function RetroCamera3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const shutterTriggerRef = useRef<(() => void) | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { supported, isSoftwareGl } = detectSoftwareWebGL();
    if (!supported) {
      setWebglUnavailable(true);
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const width = Math.max(container.clientWidth, 220);
    const height = Math.max(container.clientHeight, 180);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 40);
    camera.position.set(1.65, 1.35, 3.85);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.08, 0.56, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.rotateSpeed = 0.72;
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xfff5e4, 0x564636, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d6, 2.35);
    keyLight.position.set(3.2, 4.6, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 14;
      keyLight.shadow.camera.left = -2.4;
      keyLight.shadow.camera.right = 2.4;
      keyLight.shadow.camera.top = 2.4;
      keyLight.shadow.camera.bottom = -2.4;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf6d5b0, 1.35);
    rimLight.position.set(-3.4, 2.8, -3.2);
    scene.add(rimLight);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const shadowMapTex = createContactShadowTexture();

    const rootStage = new THREE.Group();
    scene.add(rootStage);

    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.5),
      new THREE.MeshBasicMaterial({
        map: shadowMapTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(0.12, 0.002, 0);
    rootStage.add(shadowPlane);

    const { root, cameraRig, shutterButton, shutterDialGroup, shutterRestY } =
      buildVintageCameraAssembly(maxAnisotropy, isSoftwareGl);
    rootStage.add(root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let disposed = false;
    let frameId = 0;
    let isDraggingControls = false;
    let shutterPulse = 0;
    let spinBoost = 0;
    let baseYaw = -0.22;

    const triggerShutter = () => {
      shutterPulse = 1;
      spinBoost = 1.4;
    };
    shutterTriggerRef.current = triggerShutter;

    const onControlStart = () => {
      isDraggingControls = true;
    };
    const onControlEnd = () => {
      isDraggingControls = false;
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);

    let downX = 0;
    let downY = 0;
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist < 6) {
        triggerShutter();
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 220);
      const h = Math.max(container.clientHeight, 180);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;
    resizeObserver?.observe(container);

    const clock = new THREE.Clock();

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

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.08);
      const elapsed = clock.getElapsedTime();

      if (!prefersReducedMotion && !isDraggingControls) {
        baseYaw += delta * (0.28 + spinBoost);
      }
      spinBoost = THREE.MathUtils.damp(spinBoost, 0, 3.5, delta);
      shutterPulse = THREE.MathUtils.damp(shutterPulse, 0, 12, delta);

      rootStage.rotation.y = baseYaw;
      if (!prefersReducedMotion) {
        cameraRig.position.y = Math.sin(elapsed * 1.4) * 0.012;
      }

      shutterButton.position.y = shutterRestY - shutterPulse * 0.036;
      shutterDialGroup.rotation.y = shutterPulse * 0.35;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      shutterTriggerRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver?.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('end', onControlEnd);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      disposeObject3D(scene);
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglUnavailable) {
    return (
      <div className="flex items-center justify-center py-2">
        <CameraFallbackSeal />
      </div>
    );
  }

  return (
    <div className="w-full sm:w-64 lg:w-72 shrink-0 flex flex-col items-center">
      <div
        ref={mountRef}
        aria-label="Interactive 3D vintage 35mm rangefinder camera"
        className="w-full h-44 sm:h-48 lg:h-52 cursor-grab active:cursor-grabbing"
      />
      <button
        type="button"
        onClick={() => shutterTriggerRef.current?.()}
        className="mt-1 font-mono-retro text-[10px] uppercase tracking-[0.14em] text-[#635443] hover:text-[#B84A27] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B84A27] rounded-[2px] px-2 py-1"
      >
        Drag to orbit · Click shutter
      </button>
    </div>
  );
}
