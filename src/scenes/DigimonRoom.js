import * as THREE from 'three';
import { PEDESTALS, ROOM, TAMER_PALETTE } from '../config/tamer.js';

function glowMaterial(color, opacity = 0.5) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function findIdleClip(animations, preferredName) {
  if (!Array.isArray(animations) || animations.length === 0) return null;

  if (preferredName) {
    const preferred = animations.find(
      (clip) =>
        clip.name === preferredName ||
        clip.name.endsWith(`|${preferredName}`) ||
        clip.name.includes(preferredName),
    );
    if (preferred) return preferred;
  }

  return (
    animations.find((clip) =>
      /(^|[|_\-\s])(idle|stand|wait|breath)([|_\-\s0-9]|$)/i.test(clip.name),
    ) ?? null
  );
}

function createNumberSprite(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  context.clearRect(0, 0, 256, 256);
  context.beginPath();
  context.arc(128, 128, 102, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(108, 232, 255, 0.42)';
  context.lineWidth = 3;
  context.stroke();

  context.beginPath();
  context.arc(128, 128, 88, -0.3, Math.PI * 1.1);
  context.strokeStyle = 'rgba(255, 199, 102, 0.62)';
  context.lineWidth = 2;
  context.stroke();

  context.font = '700 116px "Orbitron", "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#ffe0a0';
  context.shadowColor = '#ffb84d';
  context.shadowBlur = 26;
  context.fillText(String(number), 128, 132);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.25, 1.25, 1);
  return sprite;
}

export default class DigimonRoom {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'DigimonRoom';
    this.pedestals = [];
    this.anchors = [];
    this.models = [];
    this.rings = [];
    this.lights = [];
    this.activeIndex = 0;
    this.hoveredIndex = -1;
    this.targetCarouselRotation = 0;

    this.createWalkway();
    this.createFloor();

    this.carousel = new THREE.Group();
    this.carousel.name = 'DigimonCarousel';
    this.carousel.position.set(0, 0, ROOM.carouselZ);
    this.group.add(this.carousel);

    this.createPedestals();
    this.createEntranceArch();
    this.createBackdrop();
    this.createCeiling();
    this.createLights();

    scene.add(this.group);
  }

  createWalkway() {
    const walkway = new THREE.Group();
    const length = 23;
    const centerZ = 10.5;

    const base = new THREE.Mesh(
      new THREE.BoxGeometry(4.3, 0.18, length),
      new THREE.MeshStandardMaterial({
        color: 0x152a42,
        metalness: 0.44,
        roughness: 0.42,
      }),
    );
    base.position.set(0, 0.07, centerZ);
    base.receiveShadow = true;

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(4.05, length - 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x0a2034,
        metalness: 0.42,
        roughness: 0.42,
        emissive: 0x071a2c,
        emissiveIntensity: 0.9,
      }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, 0.162, centerZ);
    top.receiveShadow = true;

    const seamMaterial = new THREE.MeshBasicMaterial({
      color: TAMER_PALETTE.cyan,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    for (let index = 0; index < 16; index += 1) {
      const seam = new THREE.Mesh(
        new THREE.PlaneGeometry(4.05, 0.018),
        seamMaterial,
      );
      seam.rotation.x = -Math.PI / 2;
      seam.position.set(0, 0.166, 0.6 + index * 1.35);
      walkway.add(seam);
    }

    for (const x of [-2.1, 2.1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.035, length),
        glowMaterial(TAMER_PALETTE.cyan, 0.48),
      );
      edge.position.set(x, 0.17, centerZ);
      walkway.add(edge);
    }

    const underGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, length),
      new THREE.MeshBasicMaterial({
        color: 0x0c3356,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    underGlow.rotation.x = -Math.PI / 2;
    underGlow.position.set(0, 0.163, centerZ);

    walkway.add(base, top, underGlow);
    this.group.add(walkway);
  }

  createFloor() {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(
        ROOM.floorRadius,
        ROOM.floorRadius + 0.3,
        0.2,
        128,
      ),
      new THREE.MeshStandardMaterial({
        color: 0x0a1d31,
        metalness: 0.45,
        roughness: 0.5,
        emissive: 0x071b30,
        emissiveIntensity: 0.85,
      }),
    );
    floor.position.set(0, ROOM.floorY - 0.1, ROOM.floorZ);
    floor.receiveShadow = true;
    this.group.add(floor);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(ROOM.floorRadius, 0.055, 8, 180),
      glowMaterial(TAMER_PALETTE.cyan, 0.35),
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.set(0, ROOM.floorY + 0.012, ROOM.floorZ);
    this.group.add(edge);

    const ringConfigs = [
      { radius: 5.4, width: 0.02, color: TAMER_PALETTE.gold, opacity: 0.28 },
      { radius: 8.6, width: 0.025, color: TAMER_PALETTE.cyan, opacity: 0.22 },
      { radius: 12.4, width: 0.018, color: TAMER_PALETTE.blue, opacity: 0.25 },
    ];

    for (const config of ringConfigs) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(
          config.radius - config.width,
          config.radius + config.width,
          160,
        ),
        glowMaterial(config.color, config.opacity),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, ROOM.floorY + 0.013, ROOM.floorZ);
      this.rings.push({
        mesh: ring,
        speed: config.radius % 2 === 0 ? 0.025 : -0.018,
      });
      this.group.add(ring);
    }

    const radialPositions = [];
    for (let index = 0; index < 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2;
      radialPositions.push(
        Math.cos(angle) * 4.5,
        ROOM.floorY + 0.014,
        ROOM.floorZ + Math.sin(angle) * 4.5,
        Math.cos(angle) * 14.7,
        ROOM.floorY + 0.014,
        ROOM.floorZ + Math.sin(angle) * 14.7,
      );
    }

    const radialGeometry = new THREE.BufferGeometry();
    radialGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(radialPositions, 3),
    );
    const radialLines = new THREE.LineSegments(
      radialGeometry,
      new THREE.LineBasicMaterial({
        color: TAMER_PALETTE.cyan,
        transparent: true,
        opacity: 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.group.add(radialLines);

    const centerGlow = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 80),
      new THREE.MeshBasicMaterial({
        color: TAMER_PALETTE.cyan,
        transparent: true,
        opacity: 0.035,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    centerGlow.rotation.x = -Math.PI / 2;
    centerGlow.position.set(0, ROOM.floorY + 0.007, ROOM.floorZ);
    this.group.add(centerGlow);
  }

  createPedestals() {
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x15263b,
      metalness: 0.45,
      roughness: 0.4,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0x29435f,
      metalness: 0.5,
      roughness: 0.35,
    });
    const topMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b2238,
      metalness: 0.5,
      roughness: 0.34,
      emissive: 0x082038,
      emissiveIntensity: 1,
    });

    for (let index = 0; index < PEDESTALS.length; index += 1) {
      const config = PEDESTALS[index];
      const pedestal = new THREE.Group();
      pedestal.name = `Pedestal${config.number}`;
      pedestal.userData.pedestalIndex = index;
      pedestal.userData.digimonId = config.digimonId;
      pedestal.position.set(
        Math.sin(config.angle) * ROOM.carouselRadius,
        0,
        -Math.cos(config.angle) * ROOM.carouselRadius,
      );

      const floorHalo = new THREE.Mesh(
        new THREE.RingGeometry(1.68, 1.82, 64),
        glowMaterial(TAMER_PALETTE.cyan, 0.22),
      );
      floorHalo.rotation.x = -Math.PI / 2;
      floorHalo.position.y = ROOM.floorY + 0.016;

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.65, 1.9, 0.22, 48),
        darkMetal,
      );
      base.position.y = ROOM.floorY + 0.11;

      const baseRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.63, 0.022, 8, 80),
        glowMaterial(config.number % 2 === 0 ? TAMER_PALETTE.gold : TAMER_PALETTE.cyan, 0.46),
      );
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.y = ROOM.floorY + 0.225;

      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 1.28, 0.9, 40),
        metal,
      );
      column.position.y = ROOM.floorY + 0.66;

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.02, 0.16, 40),
        darkMetal,
      );
      collar.position.y = ROOM.floorY + 1.16;

      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(1.46, 1.25, 0.17, 48),
        topMaterial,
      );
      top.position.y = ROOM.floorY + 1.27;

      const topRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.04, 0.024, 8, 80),
        glowMaterial(TAMER_PALETTE.cyan, 0.58),
      );
      topRing.rotation.x = Math.PI / 2;
      topRing.position.y = ROOM.floorY + 1.36;

      const innerDisc = new THREE.Mesh(
        new THREE.CircleGeometry(0.92, 64),
        new THREE.MeshBasicMaterial({
          color: 0x0a2f50,
          transparent: true,
          opacity: 0.52,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      innerDisc.rotation.x = -Math.PI / 2;
      innerDisc.position.y = ROOM.floorY + 1.362;

      const scanRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.08, 0.012, 6, 80),
        glowMaterial(
          config.number % 2 === 0 ? TAMER_PALETTE.gold : TAMER_PALETTE.cyan,
          0.3,
        ),
      );
      scanRing.rotation.x = Math.PI / 2;
      scanRing.position.y = ROOM.floorY + 1.72;

      const numberSprite = createNumberSprite(config.number);
      const numberSpriteBaseY = ROOM.floorY + 2.95;
      numberSprite.position.y = numberSpriteBaseY;

      const anchor = new THREE.Object3D();
      anchor.name = `PedestalAnchor${config.number}`;
      anchor.position.y = ROOM.floorY + 1.38;

      base.castShadow = true;
      base.receiveShadow = true;
      column.castShadow = true;
      column.receiveShadow = true;
      collar.castShadow = true;
      top.castShadow = true;
      top.receiveShadow = true;

      pedestal.add(
        floorHalo,
        base,
        baseRing,
        column,
        collar,
        top,
        topRing,
        innerDisc,
        scanRing,
        numberSprite,
        anchor,
      );

      this.pedestals.push({
        index,
        number: config.number,
        angle: config.angle,
        digimonId: config.digimonId,
        group: pedestal,
        anchor,
        scanRing,
        topRing,
        innerDisc,
        baseRing,
        numberSprite,
        numberSpriteBaseY,
        phase: config.number * 0.9,
        isActive: index === 0,
        isHovered: false,
      });
      this.anchors.push(anchor);
      this.carousel.add(pedestal);
    }
  }

  createEntranceArch() {
    const arch = new THREE.Group();
    arch.position.z = 16.5;

    const columnMaterial = new THREE.MeshStandardMaterial({
      color: 0x243b59,
      metalness: 0.45,
      roughness: 0.38,
    });

    for (const x of [-4.75, 4.75]) {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 6.1, 0.8),
        columnMaterial,
      );
      column.position.set(x, ROOM.floorY + 3.05, 0);
      column.castShadow = true;
      column.receiveShadow = true;

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 4.9, 0.04),
        glowMaterial(TAMER_PALETTE.cyan, 0.62),
      );
      strip.position.set(x + (x < 0 ? 0.38 : -0.38), 3.2, 0.42);

      arch.add(column, strip);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(10.25, 0.62, 0.8),
      columnMaterial,
    );
    beam.position.y = ROOM.floorY + 6.1;
    beam.castShadow = true;
    beam.receiveShadow = true;

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(8.7, 0.09, 0.06),
      glowMaterial(TAMER_PALETTE.gold, 0.72),
    );
    lintel.position.set(0, ROOM.floorY + 5.75, 0.43);

    const sigil = new THREE.Mesh(
      new THREE.TorusGeometry(0.64, 0.026, 8, 64),
      glowMaterial(TAMER_PALETTE.gold, 0.65),
    );
    sigil.position.set(0, ROOM.floorY + 6.1, 0.44);

    const innerSigil = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 48),
      glowMaterial(TAMER_PALETTE.cyan, 0.12),
    );
    innerSigil.position.set(0, ROOM.floorY + 6.1, 0.42);

    arch.add(beam, lintel, sigil, innerSigil);
    this.rings.push({ mesh: sigil, speed: -0.18 });
    this.group.add(arch);
  }

  createBackdrop() {
    const pillarMaterial = new THREE.MeshStandardMaterial({
      color: 0x10283f,
      metalness: 0.4,
      roughness: 0.45,
    });
    const angles = [-1.18, -0.86, -0.55, -0.27, 0, 0.27, 0.55, 0.86, 1.18];

    for (let index = 0; index < angles.length; index += 1) {
      const angle = angles[index];
      const radius = 18.5;
      const height = index % 2 === 0 ? 8.4 : 10.2;
      const pillar = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, height, 1.1),
        pillarMaterial,
      );
      body.position.y = height / 2 + ROOM.floorY;
      body.castShadow = false;
      body.receiveShadow = true;

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, height * 0.72, 0.05),
        glowMaterial(
          index % 3 === 0 ? TAMER_PALETTE.gold : TAMER_PALETTE.cyan,
          0.36,
        ),
      );
      strip.position.set(0, height * 0.56 + ROOM.floorY, 0.58);

      const capital = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.22, 1.7),
        pillarMaterial,
      );
      capital.position.y = height + ROOM.floorY;

      pillar.add(body, strip, capital);
      pillar.position.set(
        Math.sin(angle) * radius,
        0,
        ROOM.floorZ + Math.cos(angle) * radius,
      );
      pillar.lookAt(0, 0, ROOM.floorZ);
      this.group.add(pillar);
    }

    const halo = new THREE.Group();
    halo.position.set(0, 7.2, ROOM.floorZ + 17.5);

    const outerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(10.2, 0.04, 8, 160),
      glowMaterial(TAMER_PALETTE.cyan, 0.2),
    );
    const innerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(7.4, 0.02, 8, 140),
      glowMaterial(TAMER_PALETTE.gold, 0.16),
    );
    const haloCore = new THREE.Mesh(
      new THREE.CircleGeometry(7.1, 96),
      new THREE.MeshBasicMaterial({
        color: 0x0b2e4f,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    haloCore.position.z = -0.06;
    halo.add(outerHalo, innerHalo, haloCore);
    halo.userData.outer = outerHalo;
    halo.userData.inner = innerHalo;
    this.rings.push({ mesh: halo, speed: -0.018 });
    this.group.add(halo);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 16),
      new THREE.MeshStandardMaterial({
        color: 0x06172a,
        roughness: 0.8,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
    );
    backWall.position.set(0, 7.6, ROOM.floorZ + 23);
    this.group.add(backWall);
  }

  createCeiling() {
    this.ceiling = new THREE.Group();
    this.ceiling.position.set(0, 8.6, ROOM.floorZ);

    const ringConfigs = [
      { radius: 4.8, tube: 0.035, color: TAMER_PALETTE.cyan, opacity: 0.28, speed: 0.06 },
      { radius: 6.8, tube: 0.022, color: TAMER_PALETTE.gold, opacity: 0.22, speed: -0.04 },
      { radius: 9.2, tube: 0.018, color: TAMER_PALETTE.blue, opacity: 0.24, speed: 0.028 },
    ];

    for (let index = 0; index < ringConfigs.length; index += 1) {
      const config = ringConfigs[index];
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(config.radius, config.tube, 8, 140),
        glowMaterial(config.color, config.opacity),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = index * 0.12;
      this.rings.push({ mesh: ring, speed: config.speed });
      this.ceiling.add(ring);
    }

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 24, 18),
      new THREE.MeshStandardMaterial({
        color: TAMER_PALETTE.cyan,
        emissive: TAMER_PALETTE.cyan,
        emissiveIntensity: 2.4,
        metalness: 0.1,
        roughness: 0.2,
      }),
    );
    core.position.y = -0.5;
    this.ceiling.add(core);
    this.ceiling.userData.core = core;

    this.group.add(this.ceiling);
  }

  createLights() {
    const left = new THREE.PointLight(TAMER_PALETTE.cyan, 95, 24, 2);
    left.position.set(-7.5, 4.8, 29);

    const right = new THREE.PointLight(TAMER_PALETTE.gold, 76, 22, 2);
    right.position.set(7.5, 4.8, 29);

    this.lights.push(left, right);
    this.group.add(left, right);
  }

  update(delta, elapsed) {
    const rotationDamping = 1 - Math.exp(-5.2 * Math.max(delta, 0.001));
    this.carousel.rotation.y = THREE.MathUtils.lerp(
      this.carousel.rotation.y,
      this.targetCarouselRotation,
      rotationDamping,
    );

    for (const item of this.rings) {
      item.mesh.rotation.z += delta * item.speed;
    }

    for (const pedestal of this.pedestals) {
      const pulse = Math.sin(elapsed * 1.25 + pedestal.phase) * 0.5 + 0.5;
      const emphasis = pedestal.isActive ? 1 : pedestal.isHovered ? 0.55 : 0;
      pedestal.topRing.material.opacity =
        0.38 + pulse * 0.28 + emphasis * 0.2;
      pedestal.baseRing.material.opacity =
        0.24 + pulse * 0.16 + emphasis * 0.14;
      pedestal.innerDisc.material.opacity =
        0.35 + pulse * 0.2 + emphasis * 0.12;
      pedestal.scanRing.position.y =
        ROOM.floorY + 1.55 + Math.sin(elapsed * 0.7 + pedestal.phase) * 0.22;
      pedestal.scanRing.material.opacity =
        0.12 + pulse * 0.2 + emphasis * 0.12;
      pedestal.numberSprite.position.y =
        pedestal.numberSpriteBaseY +
        Math.sin(elapsed * 0.85 + pedestal.phase) * 0.06;
      pedestal.numberSprite.material.opacity =
        0.78 + pulse * 0.16 + emphasis * 0.1;
      const ringScale = pedestal.isActive
        ? 1.04 + pulse * 0.025
        : pedestal.isHovered
          ? 1.02
          : 1;
      pedestal.topRing.scale.setScalar(ringScale);
    }

    for (let index = 0; index < this.models.length; index += 1) {
      const model = this.models[index];
      if (!model) continue;

      const active = index === this.activeIndex;
      const bobAmplitude = model.nativeIdle
        ? active
          ? 0.006
          : 0.003
        : active
          ? 0.022
          : 0.012;
      const swayAmplitude = model.nativeIdle
        ? active
          ? 0.025
          : 0.012
        : active
          ? 0.075
          : 0.035;

      model.root.position.y =
        model.baseY + Math.sin(elapsed * 1.15 + model.phase) * bobAmplitude;
      model.root.rotation.y =
        Math.sin(elapsed * 0.42 + model.phase) * swayAmplitude;

      if (model.mixer) {
        model.mixer.update(delta);
      } else {
        const breath =
          1 + Math.sin(elapsed * 1.05 + model.phase) * (active ? 0.008 : 0.004);
        model.object.scale
          .copy(model.baseObjectScale)
          .multiplyScalar(breath);
      }
    }

    if (this.ceiling.userData.core) {
      const core = this.ceiling.userData.core;
      core.scale.setScalar(1 + Math.sin(elapsed * 0.9) * 0.05);
      core.rotation.y += delta * 0.18;
    }

    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      const base = [95, 76][index];
      light.intensity = base + Math.sin(elapsed * 0.75 + index) * base * 0.06;
    }
  }

  addDigimonModel(
    index,
    object,
    { height = 1.1, rotationY = 0, idleClipName = null } = {},
  ) {
    const anchor = this.anchors[index];
    if (!anchor || !object) return null;

    const previous = this.models[index];
    if (previous) {
      previous.mixer?.stopAllAction();
      if (previous.object) previous.mixer?.uncacheRoot(previous.object);
      anchor.remove(previous.root);
      this.models[index] = null;
    }

    const idleClip = findIdleClip(object.animations, idleClipName);
    let mixer = null;

    if (idleClip) {
      mixer = new THREE.AnimationMixer(object);
      mixer.clipAction(idleClip).play();
      mixer.update(0);
    }

    const root = new THREE.Group();
    root.name = `DigimonModel${index + 1}`;
    root.add(object);
    object.rotation.y = rotationY;
    root.updateMatrixWorld(true);

    const initialBounds = new THREE.Box3().setFromObject(root);
    const initialSize = initialBounds.getSize(new THREE.Vector3());
    root.scale.setScalar(height / Math.max(initialSize.y, 0.001));
    root.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(root);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -scaledBounds.min.y, -center.z);

    object.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!material) continue;
        material.side = THREE.DoubleSide;
        if (material.map) {
          material.map.colorSpace = THREE.SRGBColorSpace;
          material.map.anisotropy = 8;
        }
        material.needsUpdate = true;
      }
    });

    anchor.add(root);
    this.models[index] = {
      root,
      object,
      baseY: root.position.y,
      baseObjectScale: object.scale.clone(),
      phase: index * 1.1,
      mixer,
      nativeIdle: Boolean(mixer),
      idleClipName: idleClip?.name ?? null,
    };

    return root;
  }

  setActivePedestal(index, { immediate = false } = {}) {
    const safeIndex = THREE.MathUtils.clamp(
      index,
      0,
      Math.max(this.pedestals.length - 1, 0),
    );

    this.activeIndex = safeIndex;

    for (const pedestal of this.pedestals) {
      pedestal.isActive = pedestal.index === safeIndex;
      const color = pedestal.isActive
        ? TAMER_PALETTE.gold
        : TAMER_PALETTE.cyan;
      pedestal.topRing.material.color.setHex(color);
      pedestal.scanRing.material.color.setHex(color);
    }

    const desiredRotation = -PEDESTALS[safeIndex].angle;
    if (immediate) {
      this.carousel.rotation.y = desiredRotation;
      this.targetCarouselRotation = desiredRotation;
      return;
    }

    const current = this.carousel.rotation.y;
    const difference = Math.atan2(
      Math.sin(desiredRotation - current),
      Math.cos(desiredRotation - current),
    );
    this.targetCarouselRotation = current + difference;
  }

  setHoveredPedestal(index) {
    if (this.hoveredIndex === index) return;

    this.hoveredIndex = index;
    for (const pedestal of this.pedestals) {
      pedestal.isHovered = pedestal.index === index;
    }
  }

  pickPedestal(raycaster) {
    const hits = raycaster.intersectObjects(
      this.pedestals.map((pedestal) => pedestal.group),
      true,
    );
    if (!hits.length) return -1;

    let object = hits[0].object;
    while (object) {
      if (Number.isInteger(object.userData?.pedestalIndex)) {
        return object.userData.pedestalIndex;
      }
      object = object.parent;
    }

    return -1;
  }

  getPedestalAnchor(index) {
    return this.anchors[index] ?? null;
  }

  getPedestalPosition(index) {
    return this.pedestals[index]?.group.position ?? null;
  }
}
