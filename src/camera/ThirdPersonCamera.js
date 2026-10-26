import * as THREE from 'three';
import { CAMERA } from '../config/constants.js';

export default class ThirdPersonCamera {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this.yaw = 0;

    this.desiredPosition = new THREE.Vector3();
    this.desiredLookAt = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();

    const position = this.target.position;
    this.camera.position.set(
      position.x - Math.sin(this.yaw) * CAMERA.distance,
      position.y + CAMERA.height,
      position.z - Math.cos(this.yaw) * CAMERA.distance
    );
    this.lookAt.set(
      position.x,
      position.y + CAMERA.lookAtHeight,
      position.z
    );
    this.camera.lookAt(this.lookAt);
  }

  getForward() {
    return this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  getRight() {
    return this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  update(dt) {
    const target = this.target.position;

    this.desiredPosition.set(
      target.x - Math.sin(this.yaw) * CAMERA.distance,
      target.y + CAMERA.height,
      target.z - Math.cos(this.yaw) * CAMERA.distance
    );

    const positionAlpha = 1 - Math.exp(-CAMERA.positionDamping * dt);
    this.camera.position.lerp(this.desiredPosition, positionAlpha);

    this.desiredLookAt.set(
      target.x,
      target.y + CAMERA.lookAtHeight,
      target.z
    );

    const lookAlpha = 1 - Math.exp(-CAMERA.lookDamping * dt);
    this.lookAt.lerp(this.desiredLookAt, lookAlpha);
    this.camera.lookAt(this.lookAt);
  }
}
