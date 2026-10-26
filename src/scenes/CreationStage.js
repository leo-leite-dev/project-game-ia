import * as THREE from 'three';
import { TAMER_PALETTE } from '../config/tamer.js';

function glowMaterial(color, opacity = 0.55) {
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

export default class CreationStage {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'CreationStage';
    this.rings = [];
    this.shards = [];
    this.pylons = [];
    this.gateway = new THREE.Group();
    this.lights = [];

    this.createPlatform();
    this.createEnergyField();
    this.createGateway();
    this.createPylons();
    this.createShards();
    this.createLights();

    scene.add(this.group);
  }

  createPlatform() {
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 6.55, 0.12, 96),
      new THREE.MeshStandardMaterial({
        color: TAMER_PALETTE.darkMetal,
        metalness: 0.62,
        roughness: 0.44,
      }),
    );
    lower.position.y = 0.02;
    lower.castShadow = true;
    lower.receiveShadow = true;

    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(5.78, 5.95, 0.16, 96),
      new THREE.MeshStandardMaterial({
        color: TAMER_PALETTE.metal,
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    upper.position.y = 0.08;
    upper.castShadow = true;
    upper.receiveShadow = true;

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(5.58, 5.58, 0.012, 96),
      new THREE.MeshStandardMaterial({
        color: 0x04101f,
        metalness: 0.82,
        roughness: 0.24,
        emissive: 0x071d36,
        emissiveIntensity: 0.7,
      }),
    );
    top.position.y = 0.159;
    top.receiveShadow = true;

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(5.78, 0.035, 8, 128),
      glowMaterial(TAMER_PALETTE.cyan, 0.62),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.172;

    this.group.add(lower, upper, top, rim);
  }

  createEnergyField() {
    const configs = [
      { radius: 4.8, width: 0.018, color: TAMER_PALETTE.cyan, opacity: 0.35, speed: 0.06 },
      { radius: 3.35, width: 0.03, color: TAMER_PALETTE.blue, opacity: 0.45, speed: -0.08 },
      { radius: 2.1, width: 0.014, color: TAMER_PALETTE.gold, opacity: 0.42, speed: 0.11 },
      { radius: 1.52, width: 0.045, color: TAMER_PALETTE.cyan, opacity: 0.52, speed: -0.04 },
    ];

    for (const config of configs) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(
          config.radius - config.width,
          config.radius + config.width,
          128,
        ),
        glowMaterial(config.color, config.opacity),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.171;
      this.rings.push({
        mesh: ring,
        speed: config.speed,
        phase: Math.random() * Math.PI * 2,
        baseScale: 1,
      });
      this.group.add(ring);
    }

    const dashRing = new THREE.Group();
    const dashMaterial = glowMaterial(TAMER_PALETTE.gold, 0.48);
    for (let index = 0; index < 32; index += 1) {
      const dash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, 0.44),
        dashMaterial,
      );
      const angle = (index / 32) * Math.PI * 2;
      dash.position.set(Math.cos(angle) * 3.95, 0.172, Math.sin(angle) * 3.95);
      dash.rotation.x = -Math.PI / 2;
      dash.rotation.z = -angle;
      dashRing.add(dash);
    }
    this.rings.push({
      mesh: dashRing,
      speed: -0.035,
      phase: 0,
      baseScale: 1,
    });
    this.group.add(dashRing);

    const positions = [];
    for (let index = 0; index < 36; index += 1) {
      const angle = (index / 36) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * 2.2,
        0.174,
        Math.sin(angle) * 2.2,
        Math.cos(angle) * 5.1,
        0.174,
        Math.sin(angle) * 5.1,
      );
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: TAMER_PALETTE.cyan,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.group.add(lines);

    const centerHalo = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 64),
      new THREE.MeshBasicMaterial({
        color: TAMER_PALETTE.cyan,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    centerHalo.rotation.x = -Math.PI / 2;
    centerHalo.position.y = 0.168;
    this.group.add(centerHalo);
  }

  createGateway() {
    this.gateway.position.set(0, 5.1, -9.5);
    this.gateway.name = 'CreationGateway';

    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(5.1, 0.035, 8, 160),
      glowMaterial(TAMER_PALETTE.cyan, 0.36),
    );
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(4.65, 0.022, 8, 160),
      glowMaterial(TAMER_PALETTE.gold, 0.28),
    );
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(4.4, 96),
      new THREE.MeshBasicMaterial({
        color: 0x0c3e66,
        transparent: true,
        opacity: 0.11,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    core.position.z = -0.05;

    this.gateway.add(outer, inner, core);
    this.gateway.userData.outer = outer;
    this.gateway.userData.inner = inner;

    const runeMaterial = glowMaterial(TAMER_PALETTE.cyan, 0.3);
    for (let index = 0; index < 12; index += 1) {
      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.09, 0.6),
        runeMaterial,
      );
      const angle = (index / 12) * Math.PI * 2;
      rune.position.set(Math.cos(angle) * 5.38, Math.sin(angle) * 5.38, 0);
      rune.rotation.z = angle + Math.PI / 2;
      this.gateway.add(rune);
    }

    this.rings.push({
      mesh: this.gateway,
      speed: 0.012,
      phase: 0,
      baseScale: 1,
    });

    const beams = new THREE.Group();
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: TAMER_PALETTE.cyan,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    for (const x of [-6.4, 6.4]) {
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.7, 11, 18, 1, true),
        beamMaterial,
      );
      beam.position.set(x, 5.1, -8.7);
      beams.add(beam);
    }
    this.group.add(beams);

    this.group.add(this.gateway);
  }

  createPylons() {
    const angles = [0.57, 0.72, 0.87, 1.13, 1.28, 1.43];
    const heights = [4.2, 6.2, 5.4, 5.9, 6.6, 4.5];

    for (let index = 0; index < angles.length; index += 1) {
      const angle = angles[index] * Math.PI;
      const pylon = new THREE.Group();
      const height = heights[index];
      const x = Math.sin(angle) * 9.4;
      const z = Math.cos(angle) * 9.4;

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.92, 0.42, 8),
        new THREE.MeshStandardMaterial({
          color: TAMER_PALETTE.darkMetal,
          metalness: 0.6,
          roughness: 0.4,
        }),
      );
      base.position.y = 0.21;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, height, 0.6),
        new THREE.MeshStandardMaterial({
          color: TAMER_PALETTE.metal,
          metalness: 0.72,
          roughness: 0.34,
        }),
      );
      body.position.y = height / 2 + 0.4;

      const stripMaterial = new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? TAMER_PALETTE.cyan : TAMER_PALETTE.gold,
        transparent: true,
        opacity: 0.68,
        toneMapped: false,
      });
      for (const offset of [
        [0, 0, 0.31],
        [0, 0, -0.31],
        [0.31, 0, 0],
        [-0.31, 0, 0],
      ]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(
            offset[0] === 0 ? 0.055 : 0.012,
            height * 0.66,
            offset[2] === 0 ? 0.055 : 0.012,
          ),
          stripMaterial,
        );
        strip.position.set(
          offset[0],
          height * 0.54 + 0.4,
          offset[2],
        );
        pylon.add(strip);
      }

      const crown = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.46, 0),
        new THREE.MeshStandardMaterial({
          color: index % 2 === 0 ? TAMER_PALETTE.cyan : TAMER_PALETTE.gold,
          emissive: index % 2 === 0
            ? TAMER_PALETTE.cyan
            : TAMER_PALETTE.gold,
          emissiveIntensity: 1.1,
          metalness: 0.2,
          roughness: 0.25,
        }),
      );
      crown.position.y = height + 0.9;

      base.castShadow = true;
      base.receiveShadow = true;
      body.castShadow = true;
      body.receiveShadow = true;
      crown.castShadow = true;

      pylon.add(base, body, crown);
      pylon.position.set(x, 0, z);
      pylon.lookAt(0, 0, 0);
      pylon.userData.crown = crown;
      pylon.userData.bodyHeight = height;
      this.pylons.push(pylon);
      this.group.add(pylon);
    }
  }

  createShards() {
    const shardMaterial = new THREE.MeshStandardMaterial({
      color: TAMER_PALETTE.gold,
      emissive: 0x7b4d13,
      emissiveIntensity: 0.8,
      metalness: 0.5,
      roughness: 0.3,
    });

    for (let index = 0; index < 11; index += 1) {
      const angle = (index / 11) * Math.PI * 2;
      const radius = THREE.MathUtils.randFloat(6.6, 8.3);
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(
          THREE.MathUtils.randFloat(0.1, 0.28),
          0,
        ),
        shardMaterial,
      );
      const baseY = THREE.MathUtils.randFloat(1.1, 4.8);
      shard.position.set(
        Math.cos(angle) * radius,
        baseY,
        Math.sin(angle) * radius,
      );
      shard.castShadow = true;
      this.shards.push({
        mesh: shard,
        baseY,
        phase: Math.random() * Math.PI * 2,
        speed: THREE.MathUtils.randFloat(0.4, 0.9),
      });
      this.group.add(shard);
    }
  }

  createLights() {
    const coreLight = new THREE.PointLight(
      TAMER_PALETTE.cyan,
      22,
      15,
      2,
    );
    coreLight.position.set(0, 2.5, 1.4);

    const gatewayLight = new THREE.PointLight(
      TAMER_PALETTE.gold,
      55,
      24,
      2,
    );
    gatewayLight.position.set(0, 5.4, -8);

    this.lights.push(coreLight, gatewayLight);
    this.group.add(coreLight, gatewayLight);
  }

  update(delta, elapsed) {
    for (const item of this.rings) {
      item.mesh.rotation.z += delta * item.speed;
      const pulse = 1 + Math.sin(elapsed * 0.9 + item.phase) * 0.018;
      item.mesh.scale.setScalar(item.baseScale * pulse);
    }

    if (this.gateway.userData.outer) {
      this.gateway.userData.outer.rotation.z -= delta * 0.06;
      this.gateway.userData.inner.rotation.z += delta * 0.1;
    }

    for (const pylon of this.pylons) {
      const crown = pylon.userData.crown;
      crown.rotation.y += delta * 0.55;
      crown.position.y =
        pylon.userData.bodyHeight +
        0.9 +
        Math.sin(elapsed * 1.2 + pylon.position.x) * 0.08;
    }

    for (const shard of this.shards) {
      shard.mesh.rotation.x += delta * shard.speed * 0.6;
      shard.mesh.rotation.y += delta * shard.speed;
      shard.mesh.position.y =
        shard.baseY + Math.sin(elapsed * shard.speed + shard.phase) * 0.22;
    }

    if (this.lights[0]) {
      this.lights[0].intensity = 20 + Math.sin(elapsed * 1.1) * 3;
    }
  }
}
