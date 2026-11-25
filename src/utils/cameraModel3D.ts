import * as THREE from 'three';
import {
  createFilmCanisterLabelTexture,
  createKnurledBumpTexture,
  createLeatheretteBumpTexture,
  createShutterDialTexture,
} from './webglHelpers';

function createRoundedBodyShape(
  width: number,
  depth: number,
  radius: number
): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw, hd);

  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return shape;
}

export interface CameraAssemblyResult {
  root: THREE.Group;
  cameraRig: THREE.Group;
  shutterButton: THREE.Mesh;
  shutterDialGroup: THREE.Group;
  shutterRestY: number;
}

export function buildVintageCameraAssembly(
  maxAnisotropy: number,
  isSoftwareGl: boolean
): CameraAssemblyResult {
  const leatherBump = createLeatheretteBumpTexture();
  const knurlBump = createKnurledBumpTexture();
  const shutterDialMap = createShutterDialTexture(maxAnisotropy);
  const filmLabelMap = createFilmCanisterLabelTexture(maxAnisotropy);

  const leatheretteMat = new THREE.MeshStandardMaterial({
    color: 0x221b15,
    roughness: 0.86,
    metalness: 0.04,
    bumpMap: leatherBump,
    bumpScale: 0.012,
  });

  const brushedChromeMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6dfd0,
    metalness: 0.92,
    roughness: 0.22,
    anisotropy: 0.75,
    anisotropyRotation: 0,
  });

  const darkAnodizedMat = new THREE.MeshStandardMaterial({
    color: 0x1b1713,
    metalness: 0.78,
    roughness: 0.34,
    bumpMap: knurlBump,
    bumpScale: 0.008,
  });

  const knurledChromeMat = new THREE.MeshStandardMaterial({
    color: 0xd9d1c0,
    metalness: 0.9,
    roughness: 0.28,
    bumpMap: knurlBump,
    bumpScale: 0.01,
  });

  const terracottaMat = new THREE.MeshStandardMaterial({
    color: 0xb84a27,
    metalness: 0.45,
    roughness: 0.32,
  });

  const opticalGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a4554,
    metalness: 0.05,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.62,
    transparent: true,
    opacity: isSoftwareGl ? 0.52 : 0.78,
    depthWrite: false,
  });

  const brassRingMat = new THREE.MeshStandardMaterial({
    color: 0xc2934b,
    metalness: 0.88,
    roughness: 0.26,
  });

  const root = new THREE.Group();

  // Composite 12-Part Vintage 35mm Rangefinder Camera (bottom-centered at y = 0)
  const cameraRig = new THREE.Group();
  cameraRig.position.set(-0.22, 0, 0);
  root.add(cameraRig);

  // 1. Base Plate
  const baseShape = createRoundedBodyShape(1.96, 0.72, 0.19);
  const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  baseGeo.rotateX(-Math.PI / 2);
  const baseMesh = new THREE.Mesh(baseGeo, brushedChromeMat);
  baseMesh.position.y = 0.015;
  baseMesh.castShadow = !isSoftwareGl;
  baseMesh.receiveShadow = !isSoftwareGl;
  cameraRig.add(baseMesh);

  // 2. Main Leatherette Chassis
  const bodyShape = createRoundedBodyShape(1.93, 0.69, 0.18);
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.74,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  bodyGeo.rotateX(-Math.PI / 2);
  const bodyMesh = new THREE.Mesh(bodyGeo, leatheretteMat);
  bodyMesh.position.y = 0.105;
  bodyMesh.castShadow = !isSoftwareGl;
  bodyMesh.receiveShadow = !isSoftwareGl;
  cameraRig.add(bodyMesh);

  // 3. Brushed Chrome Top Housing
  const topGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: 0.25,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 3,
  });
  topGeo.rotateX(-Math.PI / 2);
  const topMesh = new THREE.Mesh(topGeo, brushedChromeMat);
  topMesh.position.y = 0.855;
  topMesh.castShadow = !isSoftwareGl;
  topMesh.receiveShadow = !isSoftwareGl;
  cameraRig.add(topMesh);

  // 4. Viewfinder & Rangefinder Windows
  const vfFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.17, 0.05),
    darkAnodizedMat
  );
  vfFrame.position.set(0.56, 0.99, 0.345);
  cameraRig.add(vfFrame);

  const vfGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.12),
    opticalGlassMat
  );
  vfGlass.position.set(0.56, 0.99, 0.372);
  vfGlass.renderOrder = 2;
  cameraRig.add(vfGlass);

  const rfWindow = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.11, 0.05),
    darkAnodizedMat
  );
  rfWindow.position.set(-0.34, 0.99, 0.345);
  cameraRig.add(rfWindow);

  const rfPatch = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.075),
    brassRingMat
  );
  rfPatch.position.set(-0.34, 0.99, 0.371);
  cameraRig.add(rfPatch);

  // 5. Stepped Lens Barrel Assembly
  const lensGroup = new THREE.Group();
  lensGroup.position.set(0.02, 0.5, 0.35);
  cameraRig.add(lensGroup);

  const mountRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.44, 0.06, 40),
    brushedChromeMat
  );
  mountRing.rotation.x = Math.PI / 2;
  mountRing.position.z = 0.03;
  mountRing.castShadow = !isSoftwareGl;
  lensGroup.add(mountRing);

  const focusRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.39, 0.39, 0.16, 40),
    darkAnodizedMat
  );
  focusRing.rotation.x = Math.PI / 2;
  focusRing.position.z = 0.14;
  focusRing.castShadow = !isSoftwareGl;
  lensGroup.add(focusRing);

  const apertureRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.365, 0.375, 0.11, 40),
    knurledChromeMat
  );
  apertureRing.rotation.x = Math.PI / 2;
  apertureRing.position.z = 0.27;
  apertureRing.castShadow = !isSoftwareGl;
  lensGroup.add(apertureRing);

  const frontBezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.335, 0.028, 16, 48),
    darkAnodizedMat
  );
  frontBezel.position.z = 0.335;
  lensGroup.add(frontBezel);

  const innerBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.12, 32, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x0d0b09,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
  );
  innerBarrel.rotation.x = Math.PI / 2;
  innerBarrel.position.z = 0.28;
  lensGroup.add(innerBarrel);

  const irisAccent = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.23, 32),
    new THREE.MeshStandardMaterial({
      color: 0x181411,
      roughness: 0.55,
      metalness: 0.4,
    })
  );
  irisAccent.position.z = 0.23;
  lensGroup.add(irisAccent);

  // 6. Optical Front Glass
  const lensGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.34),
    opticalGlassMat
  );
  lensGlass.rotation.x = Math.PI / 2;
  lensGlass.position.z = 0.11;
  lensGlass.renderOrder = 3;
  lensGroup.add(lensGlass);

  const mountDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 12),
    terracottaMat
  );
  mountDot.position.set(0, 0.425, 0.05);
  lensGroup.add(mountDot);

  // 7. Shutter Speed Dial
  const shutterDialGroup = new THREE.Group();
  shutterDialGroup.position.set(-0.34, 1.13, 0.04);
  cameraRig.add(shutterDialGroup);

  const shutterDialRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.075, 32),
    knurledChromeMat
  );
  shutterDialRim.position.y = 0.035;
  shutterDialGroup.add(shutterDialRim);

  const shutterDialCap = new THREE.Mesh(
    new THREE.CircleGeometry(0.155, 32),
    new THREE.MeshStandardMaterial({
      map: shutterDialMap,
      roughness: 0.4,
      metalness: 0.25,
    })
  );
  shutterDialCap.rotation.x = -Math.PI / 2;
  shutterDialCap.position.y = 0.074;
  shutterDialGroup.add(shutterDialCap);

  // 8. Shutter Release Button + Collar
  const shutterCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.095, 0.05, 24),
    terracottaMat
  );
  shutterCollar.position.set(0.62, 1.15, 0.08);
  cameraRig.add(shutterCollar);

  const shutterRestY = 1.185;
  const shutterButton = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 0.06, 24),
    brushedChromeMat
  );
  shutterButton.position.set(0.62, shutterRestY, 0.08);
  cameraRig.add(shutterButton);

  // 9. Film Advance Lever
  const advancePivot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.04, 20),
    brushedChromeMat
  );
  advancePivot.position.set(0.75, 1.145, -0.09);
  cameraRig.add(advancePivot);

  const advanceArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.025, 0.06),
    brushedChromeMat
  );
  advanceArm.position.set(0.63, 1.155, -0.17);
  advanceArm.rotation.y = 0.48;
  cameraRig.add(advanceArm);

  // 10. Rewind Crank
  const rewindBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.14, 0.08, 24),
    knurledChromeMat
  );
  rewindBase.position.set(-0.75, 1.16, -0.02);
  cameraRig.add(rewindBase);

  const rewindHandle = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.022, 0.045),
    brushedChromeMat
  );
  rewindHandle.position.set(-0.7, 1.21, -0.02);
  cameraRig.add(rewindHandle);

  // 11. Hot Shoe + Strap Lugs
  const hotShoe = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.032, 0.24),
    brushedChromeMat
  );
  hotShoe.position.set(0.04, 1.14, -0.02);
  cameraRig.add(hotShoe);

  const hotShoeCenter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.01, 16),
    brassRingMat
  );
  hotShoeCenter.position.set(0.04, 1.158, -0.02);
  cameraRig.add(hotShoeCenter);

  const lugGeo = new THREE.TorusGeometry(0.045, 0.013, 10, 20);
  const leftLug = new THREE.Mesh(lugGeo, brushedChromeMat);
  leftLug.rotation.y = Math.PI / 2;
  leftLug.position.set(-0.985, 0.82, 0);
  cameraRig.add(leftLug);

  const rightLug = new THREE.Mesh(lugGeo, brushedChromeMat);
  rightLug.rotation.y = Math.PI / 2;
  rightLug.position.set(0.985, 0.82, 0);
  cameraRig.add(rightLug);

  // 12. 35mm Film Canister Prop grounded beside camera (y = 0)
  const filmGroup = new THREE.Group();
  filmGroup.position.set(1.18, 0, 0.34);
  filmGroup.rotation.y = -0.45;
  root.add(filmGroup);

  const canisterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.58, 28, 1, false),
    new THREE.MeshStandardMaterial({
      map: filmLabelMap,
      roughness: 0.45,
      metalness: 0.18,
    })
  );
  canisterBody.position.y = 0.29;
  canisterBody.castShadow = !isSoftwareGl;
  canisterBody.receiveShadow = !isSoftwareGl;
  filmGroup.add(canisterBody);

  const canisterCapBottom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.218, 0.218, 0.04, 28),
    darkAnodizedMat
  );
  canisterCapBottom.position.y = 0.02;
  filmGroup.add(canisterCapBottom);

  const canisterCapTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.218, 0.218, 0.04, 28),
    darkAnodizedMat
  );
  canisterCapTop.position.y = 0.56;
  filmGroup.add(canisterCapTop);

  const spoolKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.1, 20),
    darkAnodizedMat
  );
  spoolKnob.position.y = 0.62;
  filmGroup.add(spoolKnob);

  const leaderMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.36),
    new THREE.MeshStandardMaterial({
      color: 0x3b2618,
      roughness: 0.28,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
  );
  leaderMesh.position.set(-0.24, 0.28, 0.14);
  leaderMesh.rotation.y = 0.35;
  filmGroup.add(leaderMesh);

  return {
    root,
    cameraRig,
    shutterButton,
    shutterDialGroup,
    shutterRestY,
  };
}
