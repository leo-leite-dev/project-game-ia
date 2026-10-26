import * as THREE from 'three';
import { COLORS, PLAYER, WORLD } from '../config/constants.js';
import { loadGLB } from '../loaders/GLBLoader.js';

const IDLE_PATTERNS = [/idle/i, /neutral/i, /bn01/i];
const WALK_PATTERNS = [/walk/i, /caminh/i];
const RUN_PATTERNS = [/run/i, /corr/i];

export default class Player {
  constructor(scene) {
    this.root = new THREE.Group();
    this.visual = new THREE.Group();
    this.root.add(this.visual);

    this.velocity = new THREE.Vector3();
    this.desiredVelocity = new THREE.Vector3();
    this.walkPhase = 0;

    this.mixer = null;
    this.actions = {};
    this.animations = { idle: null, walk: null, run: null };
    this.currentAction = null;
    this.isPlaceholder = true;

    this.buildPlaceholder();

    this.root.position.set(PLAYER.startX, 0, PLAYER.startZ);
    scene.add(this.root);
  }

  buildPlaceholder() {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.body,
      roughness: 0.45,
      metalness: 0.15,
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.head,
      roughness: 0.35,
      metalness: 0.1,
    });
    const limbMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.limb,
      roughness: 0.55,
      metalness: 0.1,
    });
    const visorMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.visor,
      emissive: COLORS.visor,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    });

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.38, 0.6, 8, 16),
      bodyMaterial
    );
    torso.position.y = 1.05;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.visual.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 20, 16),
      headMaterial
    );
    head.position.y = 1.93;
    head.castShadow = true;
    head.receiveShadow = true;
    this.visual.add(head);

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.1, 0.08),
      visorMaterial
    );
    visor.position.set(0, 1.95, 0.24);
    visor.castShadow = true;
    this.visual.add(visor);

    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 0.18),
      limbMaterial
    );
    backpack.position.set(0, 1.12, -0.4);
    backpack.castShadow = true;
    backpack.receiveShadow = true;
    this.visual.add(backpack);

    const legGeometry = new THREE.BoxGeometry(0.17, 0.72, 0.22);
    const armGeometry = new THREE.BoxGeometry(0.14, 0.6, 0.16);

    this.leftLeg = this.createLimb(legGeometry, limbMaterial, -0.19, 0.75, 0);
    this.rightLeg = this.createLimb(legGeometry, limbMaterial, 0.19, 0.75, 0);
    this.leftArm = this.createLimb(armGeometry, limbMaterial, -0.5, 1.55, 0);
    this.rightArm = this.createLimb(armGeometry, limbMaterial, 0.5, 1.55, 0);

    this.visual.add(this.leftLeg, this.rightLeg, this.leftArm, this.rightArm);
  }

  createLimb(geometry, material, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -geometry.parameters.height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    pivot.add(mesh);
    return pivot;
  }

  async loadModel(url) {
    const gltf = await loadGLB(url);
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());

    if (size.y <= 0) {
      throw new Error('O modelo GLB não possui dimensões válidas.');
    }

    model.scale.setScalar(PLAYER.modelHeight / size.y);
    model.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(model);
    model.position.y -= scaledBounds.min.y;

    this.setModel(model, gltf.animations);
    return gltf;
  }

  setModel(model, clips = []) {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.visual);
      this.mixer = null;
    }

    this.root.remove(this.visual);
    this.visual = model;
    this.root.add(this.visual);

    this.actions = {};
    this.animations = { idle: null, walk: null, run: null };
    this.currentAction = null;
    this.isPlaceholder = false;

    if (clips.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);

      for (const clip of clips) {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }

      this.animations.idle = this.findAction(IDLE_PATTERNS);
      this.animations.walk = this.findAction(WALK_PATTERNS);
      this.animations.run = this.findAction(RUN_PATTERNS);

      if (this.animations.idle) {
        this.animations.idle.reset().fadeIn(0.3).play();
        this.currentAction = this.animations.idle;
      }
    }

    return this;
  }

  findAction(patterns) {
    const name = Object.keys(this.actions).find((actionName) =>
      patterns.some((pattern) => pattern.test(actionName))
    );

    return name ? this.actions[name] : null;
  }

  update(dt, moveDirection) {
    const hasInput = moveDirection.lengthSq() > 0.0001;
    const rate = hasInput ? PLAYER.acceleration : PLAYER.deceleration;
    const smooth = 1 - Math.exp(-rate * dt);

    this.desiredVelocity.copy(moveDirection).multiplyScalar(PLAYER.speed);
    this.velocity.lerp(this.desiredVelocity, smooth);

    if (this.velocity.lengthSq() < 0.0004) {
      this.velocity.set(0, 0, 0);
    }

    this.root.position.addScaledVector(this.velocity, dt);
    this.clampToWorld();
    this.updateRotation(dt, moveDirection);
    this.updateAnimation(dt);
  }

  clampToWorld() {
    const limit = WORLD.boundary;

    if (this.root.position.x > limit) {
      this.root.position.x = limit;
      this.velocity.x = 0;
    } else if (this.root.position.x < -limit) {
      this.root.position.x = -limit;
      this.velocity.x = 0;
    }

    if (this.root.position.z > limit) {
      this.root.position.z = limit;
      this.velocity.z = 0;
    } else if (this.root.position.z < -limit) {
      this.root.position.z = -limit;
      this.velocity.z = 0;
    }
  }

  updateRotation(dt, moveDirection) {
    if (moveDirection.lengthSq() <= 0.0001) return;

    const targetYaw = Math.atan2(moveDirection.x, moveDirection.z);
    const delta = Math.atan2(
      Math.sin(targetYaw - this.root.rotation.y),
      Math.cos(targetYaw - this.root.rotation.y)
    );

    this.root.rotation.y += delta * (1 - Math.exp(-PLAYER.turnSpeed * dt));
  }

  updateAnimation(dt) {
    const speedRatio = Math.min(this.velocity.length() / PLAYER.speed, 1);

    if (this.mixer) {
      this.updateAnimationState(speedRatio);
      this.mixer.update(dt);
    }

    if (!this.isPlaceholder) return;

    if (speedRatio > 0.02) {
      this.walkPhase += dt * (4 + speedRatio * 6);
      const swing = Math.sin(this.walkPhase) * 0.65 * speedRatio;

      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.8;
      this.rightArm.rotation.x = swing * 0.8;
      this.visual.position.y =
        Math.abs(Math.sin(this.walkPhase)) * 0.045 * speedRatio;
    } else {
      const settle = 1 - Math.exp(-12 * dt);
      this.walkPhase = 0;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(
        this.leftLeg.rotation.x,
        0,
        settle
      );
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(
        this.rightLeg.rotation.x,
        0,
        settle
      );
      this.leftArm.rotation.x = THREE.MathUtils.lerp(
        this.leftArm.rotation.x,
        0,
        settle
      );
      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        0,
        settle
      );
      this.visual.position.y = THREE.MathUtils.lerp(
        this.visual.position.y,
        0,
        settle
      );
    }
  }

  updateAnimationState(speedRatio) {
    const target =
      speedRatio > 0.05
        ? this.animations.run ?? this.animations.walk ?? this.animations.idle
        : this.animations.idle;

    if (!target || target === this.currentAction) return;

    target.reset().fadeIn(0.25).play();
    if (this.currentAction) this.currentAction.fadeOut(0.25);
    this.currentAction = target;
  }

  playAnimation(name, fade = 0.2) {
    const action = this.actions[name];
    if (!action || action === this.currentAction) return;

    action.reset().fadeIn(fade).play();
    if (this.currentAction) this.currentAction.fadeOut(fade);
    this.currentAction = action;
  }
}
