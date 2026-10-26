import * as THREE from 'three';
import { CREATION, ROOM } from '../config/tamer.js';

const smoothstep = (edge0, edge1, value) => {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export default class TamerCameraRig {
  constructor({ camera, domElement }) {
    this.camera = camera;
    this.domElement = domElement;
    this.mode = 'idle';
    this.enabled = false;
    this.dragging = false;
    this.pointerId = null;
    this.lastPointer = new THREE.Vector2();
    this.lastInteraction = performance.now();
    this.autoTime = 0;

    this.yaw = CREATION.camera.yaw;
    this.targetYaw = CREATION.camera.yaw;
    this.pitch = CREATION.camera.pitch;
    this.targetPitch = CREATION.camera.pitch;
    this.distance = CREATION.camera.distance;
    this.targetDistance = CREATION.camera.distance;

    this.lookAt = new THREE.Vector3(0, CREATION.camera.targetHeight, 0);
    this.desiredLookAt = this.lookAt.clone();
    this.position = new THREE.Vector3();
    this.roomPosition = new THREE.Vector3();
    this.roomLookAt = new THREE.Vector3();
    this.tempPosition = new THREE.Vector3();
    this.tempLookAt = new THREE.Vector3();
    this.tempOrbit = new THREE.Vector3();
    this.tempFollow = new THREE.Vector3();

    this.transitionStartPosition = new THREE.Vector3();
    this.transitionStartYaw = 0;
    this.transitionStartDistance = 0;
    this.transitionStartFov = CREATION.camera.fov;

    this.camera.fov = CREATION.camera.fov;
    this.camera.near = 0.1;
    this.camera.far = 220;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 2, 5.4);
    this.camera.lookAt(this.lookAt);

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);

    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('pointercancel', this.handlePointerUp);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  enableCreation() {
    this.mode = 'creation';
    this.enabled = true;
    this.yaw = CREATION.camera.yaw;
    this.targetYaw = CREATION.camera.yaw;
    this.pitch = CREATION.camera.pitch;
    this.targetPitch = CREATION.camera.pitch;
    this.distance = CREATION.camera.distance;
    this.targetDistance = CREATION.camera.distance;
    this.lookAt.set(0, CREATION.camera.targetHeight, 0);
    this.desiredLookAt.copy(this.lookAt);
    this.lastInteraction = performance.now();
    this.camera.fov = CREATION.camera.fov;
    this.camera.updateProjectionMatrix();
    this.applyCreationPose(0);
  }

  handlePointerDown(event) {
    if (!this.enabled || event.button > 0) return;

    this.dragging = true;
    this.pointerId = event.pointerId;
    this.lastPointer.set(event.clientX, event.clientY);
    this.lastInteraction = performance.now();
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    if (!this.enabled || !this.dragging || event.pointerId !== this.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer.set(event.clientX, event.clientY);
    this.lastInteraction = performance.now();

    this.targetYaw = THREE.MathUtils.clamp(
      this.targetYaw - deltaX * 0.0045,
      CREATION.camera.minYaw,
      CREATION.camera.maxYaw,
    );
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch - deltaY * 0.0032,
      CREATION.camera.minPitch,
      CREATION.camera.maxPitch,
    );
  }

  handlePointerUp(event) {
    if (event.pointerId !== this.pointerId) return;

    this.dragging = false;
    this.pointerId = null;
    this.lastInteraction = performance.now();
    this.domElement.releasePointerCapture?.(event.pointerId);
  }

  handleWheel(event) {
    if (!this.enabled) return;

    event.preventDefault();
    this.lastInteraction = performance.now();
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + event.deltaY * 0.0032,
      CREATION.camera.minDistance,
      CREATION.camera.maxDistance,
    );
  }

  update(delta, elapsed) {
    if (this.mode === 'creation') {
      this.updateCreation(delta, elapsed);
    }
  }

  updateCreation(delta, elapsed) {
    this.autoTime += delta;
    const now = performance.now();

    if (
      !this.dragging &&
      now - this.lastInteraction > CREATION.camera.autoPause * 1000
    ) {
      this.targetYaw =
        CREATION.camera.yaw +
        Math.sin(this.autoTime * CREATION.camera.autoSpeed) * 0.24;
    }

    const damping = 1 - Math.exp(-CREATION.camera.damping * delta);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, damping);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, damping);
    this.distance = THREE.MathUtils.lerp(
      this.distance,
      this.targetDistance,
      damping,
    );

    this.applyCreationPose(elapsed);
  }

  applyCreationPose(elapsed) {
    const cameraConfig = CREATION.camera;
    const horizontal = Math.cos(this.pitch) * this.distance;
    const breathe = Math.sin(elapsed * 0.55) * 0.012;

    this.position.set(
      Math.sin(this.yaw) * horizontal,
      cameraConfig.targetHeight + Math.sin(this.pitch) * this.distance + breathe,
      Math.cos(this.yaw) * horizontal,
    );

    this.desiredLookAt.set(
      0,
      cameraConfig.targetHeight + Math.sin(elapsed * 0.4) * 0.008,
      0,
    );

    this.lookAt.lerp(this.desiredLookAt, 0.16);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
  }

  startTransition() {
    this.mode = 'transition';
    this.enabled = false;
    this.dragging = false;
    this.pointerId = null;
    this.transitionStartPosition.copy(this.camera.position);
    this.transitionStartYaw = this.yaw;
    this.transitionStartDistance = this.distance;
    this.transitionStartFov = this.camera.fov;
  }

  updateTransition(progress, tamerPosition) {
    const t = THREE.MathUtils.clamp(progress, 0, 1);
    const followBlend = smoothstep(0.22, 0.68, t);
    const roomBlend = smoothstep(0.68, 1, t);
    const orbitYaw =
      this.transitionStartYaw + Math.PI * 1.18 * smoothstep(0, 0.55, t);
    const orbitRadius = THREE.MathUtils.lerp(
      this.transitionStartDistance,
      4.1,
      smoothstep(0, 0.45, t),
    );
    const orbitHeight = THREE.MathUtils.lerp(
      this.transitionStartPosition.y,
      2.15,
      smoothstep(0, 0.4, t),
    );

    this.tempOrbit.set(
      Math.sin(orbitYaw) * orbitRadius,
      orbitHeight,
      Math.cos(orbitYaw) * orbitRadius,
    );

    const followLook = this.tempLookAt.set(
      tamerPosition.x,
      tamerPosition.y + 1.05,
      tamerPosition.z + 3.1,
    );
    const followPosition = this.tempFollow.set(
      tamerPosition.x,
      tamerPosition.y + 2.5,
      tamerPosition.z - 4.6,
    );

    const roomPose = this.getRoomPose();
    const orbitLook = new THREE.Vector3(
      0,
      CREATION.camera.targetHeight,
      0,
    );
    const lookAt = orbitLook.lerp(followLook, followBlend).lerp(roomPose.lookAt, roomBlend);

    const position = this.tempOrbit
      .clone()
      .lerp(followPosition, followBlend)
      .lerp(roomPose.position, roomBlend);

    if (t < 0.02) {
      position.lerp(this.transitionStartPosition, 1 - smoothstep(0, 0.02, t));
    }

    const targetFov = roomPose.fov;
    const fov =
      this.transitionStartFov +
      (targetFov - this.transitionStartFov) * smoothstep(0.35, 0.92, t);

    this.camera.position.copy(position);
    this.camera.fov = fov;
    this.camera.lookAt(lookAt);
    this.camera.updateProjectionMatrix();
    this.lookAt.copy(lookAt);
  }

  enterRoom() {
    this.mode = 'room';
    this.enabled = false;
    this.dragging = false;
    this.pointerId = null;
    this.updateRoom(0, 0, true);
  }

  updateRoom(delta, elapsed, snap = false) {
    const roomPose = this.getRoomPose();
    const damping = snap ? 1 : 1 - Math.exp(-4.5 * Math.max(delta, 0.001));
    const sway = Math.sin(elapsed * 0.32) * 0.035;

    this.roomPosition.set(
      roomPose.position.x + sway,
      roomPose.position.y + Math.sin(elapsed * 0.24) * 0.02,
      roomPose.position.z,
    );
    this.roomLookAt.copy(roomPose.lookAt);

    this.camera.position.lerp(this.roomPosition, damping);
    this.lookAt.lerp(this.roomLookAt, damping);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, roomPose.fov, damping);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
  }

  getRoomPose() {
    const aspect = this.camera.aspect || 1;
    const portraitBlend =
      1 - smoothstep(ROOM.portraitAspect, 1.28, aspect);
    const fov = THREE.MathUtils.lerp(
      ROOM.cameraFov,
      ROOM.portraitFov,
      portraitBlend,
    );
    const distance = THREE.MathUtils.lerp(
      ROOM.cameraDistance,
      ROOM.portraitCameraDistance,
      portraitBlend,
    );
    const cameraX = THREE.MathUtils.lerp(
      ROOM.cameraX,
      ROOM.portraitCameraX,
      portraitBlend,
    );
    const cameraY = THREE.MathUtils.lerp(
      ROOM.cameraY,
      ROOM.portraitCameraY,
      portraitBlend,
    );
    const lookAtX = THREE.MathUtils.lerp(
      ROOM.lookAtX,
      ROOM.portraitLookAtX,
      portraitBlend,
    );
    const lookAtY = THREE.MathUtils.lerp(
      ROOM.lookAtY,
      ROOM.portraitLookAtY,
      portraitBlend,
    );

    const position = new THREE.Vector3(
      cameraX,
      cameraY,
      ROOM.lookAtZ - distance,
    );
    const lookAt = new THREE.Vector3(lookAtX, lookAtY, ROOM.lookAtZ);

    return { position, lookAt, fov };
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.domElement.removeEventListener('wheel', this.handleWheel);
  }
}
