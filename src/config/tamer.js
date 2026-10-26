export const TAMER_STORAGE_KEY = 'game-ia:tamer';
export const TAMER_LEGACY_KEYS = ['game-ia.tamer', 'tamer', 'tamerName'];

export const TAMER_NAME = Object.freeze({
  min: 3,
  max: 16,
});

export const TAMER_MODEL = Object.freeze({
  url: '/models/project_playtime_player.glb',
  height: 1.9,
});

export const CREATION = Object.freeze({
  platformY: 0.16,
  platformRadius: 5.4,
  camera: Object.freeze({
    fov: 46,
    yaw: 0.36,
    pitch: 0.16,
    distance: 5.7,
    targetHeight: 1.0,
    minYaw: -1.15,
    maxYaw: 1.15,
    minPitch: -0.02,
    maxPitch: 0.42,
    minDistance: 4.6,
    maxDistance: 7.8,
    damping: 7,
    autoSpeed: 0.085,
    autoPause: 4,
  }),
});

export const TRANSITION = Object.freeze({
  duration: 5.2,
  runStart: 0.5,
  runEnd: 4.15,
  tamerZ: 20.5,
  messageHide: 2.4,
  roomReveal: 4.55,
});

export const ROOM = Object.freeze({
  floorY: 0.16,
  floorZ: 29,
  floorRadius: 15.5,
  tamerX: -4.15,
  tamerZ: 21.35,
  carouselZ: 29.15,
  carouselRadius: 4.55,
  cameraFov: 49,
  cameraX: 0,
  cameraY: 3,
  cameraDistance: 6.35,
  lookAtX: -1,
  lookAtY: 1.95,
  lookAtZ: 26.25,
  portraitFov: 58,
  portraitCameraX: 0,
  portraitCameraY: 3.95,
  portraitCameraDistance: 7.2,
  portraitLookAtX: 0,
  portraitLookAtY: 1.1,
  portraitAspect: 0.82,
});

export const PEDESTALS = Object.freeze([
  Object.freeze({
    number: 1,
    angle: 0,
    digimonId: 'koromon',
  }),
  Object.freeze({
    number: 2,
    angle: (Math.PI * 2) / 3,
    digimonId: 'tsunomon',
  }),
  Object.freeze({
    number: 3,
    angle: -(Math.PI * 2) / 3,
    digimonId: 'tsumemon',
  }),
]);

export const DIGIMON_MODELS = Object.freeze({
  koromon: Object.freeze({
    format: 'obj',
    objUrl: '/models/babys/Koromon/Koromon.obj',
    mtlUrl: '/models/babys/Koromon/Koromon.mtl',
    height: 1.12,
    rotationY: Math.PI,
    publicRelease: false,
  }),
  tsunomon: Object.freeze({
    format: 'obj',
    objUrl: '/models/babys/Tsunomon/Tsunomon.obj',
    mtlUrl: '/models/babys/Tsunomon/Tsunomon.mtl',
    height: 1.18,
    rotationY: Math.PI,
    publicRelease: false,
  }),
  tsumemon: Object.freeze({
    format: 'fbx',
    fbxUrl: '/models/babys/Tsumemon/chr631.fbx',
    height: 0.95,
    rotationY: Math.PI,
    idleClipName: 'chr631_br01',
    publicRelease: false,
    textures: Object.freeze({
      chr631_mat_000: '/models/babys/Tsumemon/chr631a01.png',
      chr631_mat_001: '/models/babys/Tsumemon/chr631a01.png',
      chr631_mat_002: '/models/babys/Tsumemon/chr631a01s.png',
    }),
  }),
});

export const TAMER_PALETTE = Object.freeze({
  cyan: 0x6ce8ff,
  blue: 0x2b8fe0,
  deepBlue: 0x0a1c35,
  gold: 0xffc766,
  metal: 0x1a2f49,
  darkMetal: 0x0c1728,
  skyTop: 0x0a2b59,
  skyHorizon: 0x86c7ef,
  fog: 0x0b2140,
});
