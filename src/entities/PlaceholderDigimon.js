import * as THREE from 'three';

const VARIANTS = {
  koromon: {
    body: 0xf08c8c,
    accent: 0xffd6c9,
    eye: 0x18202b,
    kind: 'ears',
  },
  tsunomon: {
    body: 0xd6a45c,
    accent: 0xfff0cf,
    eye: 0x2a1d13,
    kind: 'horn',
  },
  tsumemon: {
    body: 0x9a7bd0,
    accent: 0x40255f,
    eye: 0xede4ff,
    kind: 'claws',
  },
};

function addMesh(group, geometry, material, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

export function createPlaceholderDigimon(id) {
  const variant = VARIANTS[id] ?? VARIANTS.koromon;
  const group = new THREE.Group();
  group.name = `PlaceholderDigimon_${id}`;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: variant.body,
    roughness: 0.58,
    metalness: 0.04,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: variant.accent,
    roughness: 0.6,
    metalness: 0.03,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: variant.eye,
    roughness: 0.32,
    metalness: 0.08,
  });

  const body = addMesh(
    group,
    new THREE.SphereGeometry(0.62, 32, 24),
    bodyMaterial,
    [0, 0.68, 0],
  );
  body.scale.set(1, 0.94, 0.94);

  for (const side of [-1, 1]) {
    addMesh(
      group,
      new THREE.SphereGeometry(0.072, 20, 14),
      eyeMaterial,
      [side * 0.19, 0.82, 0.555],
    );
    addMesh(
      group,
      new THREE.SphereGeometry(0.025, 12, 8),
      accentMaterial,
      [side * 0.175, 0.845, 0.615],
    );
  }

  if (variant.kind === 'ears') {
    for (const side of [-1, 1]) {
      const ear = addMesh(
        group,
        new THREE.ConeGeometry(0.13, 0.34, 16),
        accentMaterial,
        [side * 0.33, 1.19, -0.03],
        [0, 0, side * 0.38],
      );
      ear.scale.z = 0.72;
    }
  }

  if (variant.kind === 'horn') {
    addMesh(
      group,
      new THREE.ConeGeometry(0.11, 0.38, 16),
      accentMaterial,
      [0, 1.31, 0.02],
      [0.08, 0, 0],
    );
    for (const side of [-1, 1]) {
      for (let index = 0; index < 2; index += 1) {
        addMesh(
          group,
          new THREE.ConeGeometry(0.07, 0.24, 12),
          accentMaterial,
          [side * (0.4 + index * 0.08), 1.02 - index * 0.16, -0.08],
          [0.2, 0, side * (0.72 + index * 0.2)],
        );
      }
    }
  }

  if (variant.kind === 'claws') {
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2;
      addMesh(
        group,
        new THREE.ConeGeometry(0.075, 0.34, 12),
        accentMaterial,
        [Math.cos(angle) * 0.34, 1.17, Math.sin(angle) * 0.34],
        [
          Math.sin(angle) * 0.34,
          0,
          -Math.cos(angle) * 0.34,
        ],
      );
    }
  }

  for (const side of [-1, 1]) {
    const foot = addMesh(
      group,
      new THREE.SphereGeometry(0.17, 20, 14),
      accentMaterial,
      [side * 0.3, 0.14, 0.18],
    );
    foot.scale.set(1, 0.58, 1.2);
  }

  return group;
}
