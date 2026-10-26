import {
  AnimationMixer,
  Box3,
  CapsuleGeometry,
  Group,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  MathUtils,
  Vector3,
} from 'three';
import { CREATION, TAMER_MODEL, TAMER_PALETTE } from '../config/tamer.js';
import { loadGLB } from '../loaders/GLBLoader.js';

const IDLE_MATCHES = ['menu_idle', 'idle'];
const RUN_MATCHES = ['a_player_run', 'run'];
const WALK_MATCHES = ['a_player_walk', 'walk'];
const EXCLUDED_MATCHES = ['backward', 'backwards', 'turn', 'start', 'stop'];

function findClip(clips, matches) {
  for (const match of matches) {
    const clip = clips.find((candidate) => {
      const name = candidate.name.toLowerCase();
      return (
        name.includes(match) &&
        !EXCLUDED_MATCHES.some((blocked) => name.includes(blocked))
      );
    });

    if (clip) return clip;
  }

  return null;
}

export default class Tamer {
  constructor() {
    this.group = new Group();
    this.group.name = 'Tamer';
    this.group.position.y = CREATION.platformY;
    this.visual = new Group();
    this.group.add(this.visual);

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.clips = [];
    this.currentAction = null;
    this.currentState = 'idle';
    this.placeholder = null;
    this.placeholderParts = null;
    this.usingFallback = false;
    this.loaded = false;
    this.error = null;
    this.elapsed = 0;
  }

  async load(onProgress) {
    try {
      const gltf = await loadGLB(TAMER_MODEL.url, (progress) => {
        onProgress?.(progress);
      });

      this.installModel(gltf);
      return { usingFallback: false, error: null };
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.usingFallback = true;
      this.loaded = true;
      this.installPlaceholder();
      return { usingFallback: true, error: this.error };
    }
  }

  installModel(gltf) {
    const model = gltf.scene;
    model.updateMatrixWorld(true);

    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = TAMER_MODEL.height / Math.max(size.y, 0.001);

    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);

    const scaledBounds = new Box3().setFromObject(model);
    const scaledCenter = scaledBounds.getCenter(new Vector3());

    model.position.x -= scaledCenter.x;
    model.position.z -= scaledCenter.z;
    model.position.y -= scaledBounds.min.y;
    model.updateMatrixWorld(true);

    model.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!material) continue;

        if (material.map) {
          material.map.anisotropy = 4;
        }

        material.needsUpdate = true;
      }
    });

    this.removePlaceholder();
    this.model = model;
    this.clips = gltf.animations ?? [];
    this.mixer = new AnimationMixer(model);
    this.setupActions();
    this.visual.add(model);
    this.loaded = true;
    this.usingFallback = false;
    this.setLocomotion('idle', 0);
  }

  setupActions() {
    const idleClip = findClip(this.clips, IDLE_MATCHES);
    const runClip = findClip(this.clips, RUN_MATCHES) ?? findClip(this.clips, WALK_MATCHES);
    const walkClip = findClip(this.clips, WALK_MATCHES) ?? runClip;

    if (idleClip) this.actions.idle = this.createAction(idleClip);
    if (runClip) this.actions.run = this.createAction(runClip);
    if (walkClip) this.actions.walk = this.createAction(walkClip);
  }

  createAction(clip) {
    const action = this.mixer.clipAction(clip);
    action.setLoop(LoopRepeat, Infinity);
    action.enabled = true;
    action.setEffectiveWeight(1);
    action.setEffectiveTimeScale(1);
    return action;
  }

  setLocomotion(state, fade = 0.28) {
    this.currentState = state;
    const nextAction = this.actions[state] ?? this.actions.idle;

    if (!nextAction || nextAction === this.currentAction) return;

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);

    if (fade > 0) {
      nextAction.fadeIn(fade);
      this.currentAction?.fadeOut(fade);
    }

    nextAction.play();
    this.currentAction = nextAction;
  }

  playRun() {
    this.setLocomotion('run', 0.22);
  }

  playIdle() {
    this.setLocomotion('idle', 0.3);
  }

  installPlaceholder() {
    this.removePlaceholder();

    const placeholder = new Group();
    placeholder.name = 'TamerPlaceholder';

    const armor = new MeshStandardMaterial({
      color: TAMER_PALETTE.deepBlue,
      metalness: 0.62,
      roughness: 0.32,
      emissive: 0x071a33,
      emissiveIntensity: 0.7,
    });
    const cyan = new MeshStandardMaterial({
      color: TAMER_PALETTE.cyan,
      metalness: 0.25,
      roughness: 0.22,
      emissive: TAMER_PALETTE.cyan,
      emissiveIntensity: 1.8,
    });
    const gold = new MeshStandardMaterial({
      color: TAMER_PALETTE.gold,
      metalness: 0.55,
      roughness: 0.3,
      emissive: 0x5f3b0b,
      emissiveIntensity: 0.9,
    });

    const torso = new Mesh(new CapsuleGeometry(0.23, 0.48, 6, 12), armor);
    torso.position.y = 1.08;

    const hips = new Mesh(new CapsuleGeometry(0.2, 0.13, 4, 10), armor);
    hips.position.y = 0.76;

    const head = new Mesh(new SphereGeometry(0.22, 18, 14), armor);
    head.position.y = 1.62;

    const visor = new Mesh(new BoxGeometry(0.28, 0.065, 0.035), cyan);
    visor.position.set(0, 1.64, 0.2);

    const core = new Mesh(new TorusGeometry(0.085, 0.014, 8, 28), gold);
    core.position.set(0, 1.16, 0.24);
    core.rotation.x = Math.PI / 2;

    const leftArm = new Group();
    leftArm.position.set(-0.3, 1.32, 0);
    const leftArmMesh = new Mesh(new CapsuleGeometry(0.07, 0.42, 4, 8), armor);
    leftArmMesh.position.y = -0.24;
    leftArm.add(leftArmMesh);

    const rightArm = new Group();
    rightArm.position.set(0.3, 1.32, 0);
    const rightArmMesh = new Mesh(new CapsuleGeometry(0.07, 0.42, 4, 8), armor);
    rightArmMesh.position.y = -0.24;
    rightArm.add(rightArmMesh);

    const leftLeg = new Mesh(new CapsuleGeometry(0.085, 0.5, 4, 8), armor);
    leftLeg.position.set(-0.11, 0.38, 0);

    const rightLeg = new Mesh(new CapsuleGeometry(0.085, 0.5, 4, 8), armor);
    rightLeg.position.set(0.11, 0.38, 0);

    const ring = new Mesh(new TorusGeometry(0.46, 0.01, 6, 64), cyan);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.025;

    placeholder.add(
      torso,
      hips,
      head,
      visor,
      core,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      ring,
    );
    placeholder.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    this.placeholder = placeholder;
    this.placeholderParts = { torso, head, leftArm, rightArm, ring };
    this.visual.add(placeholder);
  }

  removePlaceholder() {
    if (!this.placeholder) return;

    this.visual.remove(this.placeholder);
    this.placeholder.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material?.dispose());
    });
    this.placeholder = null;
    this.placeholderParts = null;
  }

  update(delta, elapsed) {
    this.elapsed = elapsed;
    this.mixer?.update(delta);

    if (!this.placeholderParts) return;

    const { torso, head, leftArm, rightArm, ring } = this.placeholderParts;
    const bob = Math.sin(elapsed * 1.8) * 0.012;

    torso.position.y = 1.08 + bob;
    head.position.y = 1.62 + bob;
    leftArm.rotation.x = Math.sin(elapsed * 1.5) * 0.1;
    rightArm.rotation.x = -Math.sin(elapsed * 1.5) * 0.1;
    ring.rotation.z = elapsed * 0.16;
    ring.scale.setScalar(1 + Math.sin(elapsed * 1.2) * 0.025);
  }

  getPosition() {
    return this.group.position;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  moveAlongZ(z) {
    this.group.position.z = MathUtils.clamp(z, 0, 60);
  }

  dispose() {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.visual.clear();
  }
}
