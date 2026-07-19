"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import AtlantisWorld from "./materials/AtlantisWorld";
import SnakeScalesMaterial from "./materials/SnakeScalesMaterial";
import VolcanicFracture from "./materials/VolcanicFracture";
import CrystalCave from "./materials/CrystalCave";
import NebulaIgnition from "./materials/NebulaIgnition";
import { soundEngine } from "@/utils/audio";

interface CarouselProps {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  targetRotation: React.MutableRefObject<number>;
  currentRotation: React.MutableRefObject<number>;
  studyMode: boolean;
  setStudyMode: (mode: boolean) => void;
  loaderState: "loading" | "impact" | "shattering" | "completed";
  reducedMotion?: boolean;
}

const PANEL_COUNT = 5;
const ANGLE_STEP = (2 * Math.PI) / PANEL_COUNT;
const CAROUSEL_RADIUS = 3.2;

export default function Carousel({
  activeIndex,
  setActiveIndex,
  isDragging,
  setIsDragging,
  targetRotation,
  currentRotation,
  studyMode,
  setStudyMode,
  loaderState,
  reducedMotion = false,
}: CarouselProps) {
  const carouselRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Group>(null);
  const panelGroups = useRef<(THREE.Group | null)[]>([]);
  const visualGroups = useRef<(THREE.Group | null)[]>([]);
  const leftHalves = useRef<(THREE.Mesh | null)[]>([]);
  const rightHalves = useRef<(THREE.Mesh | null)[]>([]);
  const screenGroups = useRef<(THREE.Group | null)[]>([]);

  // Mouse parallax tilt refs (adonmo style)
  const mouseTiltX = useRef<number>(0);
  const mouseTiltY = useRef<number>(0);
  const mouseTiltZ = useRef<number>(0);

  // Transition progress ref for custom portal entry motions
  const transitionProgressRef = useRef<number>(0);

  // Physics variables
  const velocityY = useRef<number>(0);
  const lastTime = useRef<number>(0);
  const dragVelocity = useRef<number>(0);
  const lastDragX = useRef<number>(0);
  const lastInteractionTime = useRef<number>(0);
  const autoRotateTimer = useRef<number>(0);

  // Core movement physics (drift/float)
  const coreDriftX = useRef<number>(0);
  const coreDriftY = useRef<number>(0);

  const { gl, size, camera, viewport } = useThree();

  // Attach pointer events for drag-to-spin
  useEffect(() => {
    if (studyMode || loaderState !== "completed") return;

    const canvasEl = gl.domElement;
    let startX = 0;
    let startRot = 0;

    const handlePointerDown = (e: PointerEvent) => {
      setIsDragging(true);
      startX = e.clientX;
      startRot = targetRotation.current;
      lastDragX.current = e.clientX;
      lastTime.current = performance.now();
      dragVelocity.current = 0;
      lastInteractionTime.current = performance.now() / 1000;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;

      // Screen drag delta maps to rotation angle
      const rotDelta = (deltaX / size.width) * Math.PI * 1.5;
      targetRotation.current = startRot + rotDelta;

      // Track drag velocity for inertia on release
      const now = performance.now();
      const dt = (now - lastTime.current) / 1000;
      if (dt > 0.005) {
        dragVelocity.current = (e.clientX - lastDragX.current) / dt;
      }
      lastDragX.current = e.clientX;
      lastTime.current = now;
      lastInteractionTime.current = now / 1000;
    };

    const handlePointerUp = () => {
      if (!isDragging) return;
      setIsDragging(false);

      // Inertia on release
      const releaseVel = (dragVelocity.current / size.width) * Math.PI * 1.5;
      const cappedVel = Math.max(-10, Math.min(10, releaseVel));
      
      // Calculate overshoot target, which will then spring-settle
      targetRotation.current += cappedVel * 0.25;
      lastInteractionTime.current = performance.now() / 1000;
    };

    canvasEl.addEventListener("pointerdown", handlePointerDown);
    canvasEl.addEventListener("pointermove", handlePointerMove);
    canvasEl.addEventListener("pointerup", handlePointerUp);
    canvasEl.addEventListener("pointercancel", handlePointerUp);

    return () => {
      canvasEl.removeEventListener("pointerdown", handlePointerDown);
      canvasEl.removeEventListener("pointermove", handlePointerMove);
      canvasEl.removeEventListener("pointerup", handlePointerUp);
      canvasEl.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [gl, isDragging, setIsDragging, targetRotation, studyMode, loaderState, size.width]);

  // Handle auto-rotate timing
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = state.clock.getElapsedTime();

    // 1. Central Core Lit Ball Drifting Animation
    const core = coreRef.current;
    if (core && loaderState === "completed") {
      // Drift math
      coreDriftX.current = Math.sin(time * 0.8) * 0.12;
      coreDriftY.current = Math.cos(time * 0.6) * 0.10;
      
      let targetZ = 0;
      let targetScale = 0.6;

      if (studyMode) {
        // Move core back and scale down to hide it behind fullscreen panel
        targetZ = -4.0;
        targetScale = 0.0;
      }

      core.position.x += (coreDriftX.current - core.position.x) * 4 * dt;
      core.position.y += (coreDriftY.current - core.position.y) * 4 * dt;
      core.position.z += (targetZ - core.position.z) * 6 * dt;
      
      const currentScale = core.scale.x;
      const newScale = currentScale + (targetScale - currentScale) * 6 * dt;
      core.scale.setScalar(newScale);

      // Spin the core
      core.rotation.y = time * 0.3;
      core.rotation.x = Math.sin(time * 0.2) * 0.15;
    }

    // 2. Carousel Physics (Inertia, Spring Settle, Auto-rotation)
    const carousel = carouselRef.current;
    if (carousel && loaderState === "completed") {
      const nowSec = performance.now() / 1000;
      const timeSinceInteraction = nowSec - lastInteractionTime.current;

      if (!studyMode) {
        // Auto-rotation timer logic (advances every 7 seconds, resume after 3 seconds of inactivity)
        if (timeSinceInteraction > 3.0) {
          autoRotateTimer.current += dt;
          if (autoRotateTimer.current >= 7.0) {
            targetRotation.current -= ANGLE_STEP;
            autoRotateTimer.current = 0;
          }
        } else {
          autoRotateTimer.current = 0;
        }

        // Custom spring equation for inertia and settling
        if (isDragging) {
          currentRotation.current += (targetRotation.current - currentRotation.current) * 15 * dt;
          velocityY.current = 0;
        } else {
          // Snap target rotation to the nearest tile step
          const snappedRotation = Math.round(targetRotation.current / ANGLE_STEP) * ANGLE_STEP;
          targetRotation.current += (snappedRotation - targetRotation.current) * 4 * dt;

          const diff = targetRotation.current - currentRotation.current;
          const k = 22.0; // spring constant
          const c = 7.0;  // damping constant

          const springForce = diff * k;
          const dampingForce = -velocityY.current * c;
          const acceleration = springForce + dampingForce;

          velocityY.current += acceleration * dt;
          currentRotation.current += velocityY.current * dt;
        }

        // Calculate and update the active index
        const rawIndex = currentRotation.current / ANGLE_STEP;
        const roundedIndex = Math.round(rawIndex);
        let calculatedIndex = (-roundedIndex) % PANEL_COUNT;
        if (calculatedIndex < 0) calculatedIndex += PANEL_COUNT;
        if (calculatedIndex !== activeIndex) {
          setActiveIndex(calculatedIndex);
        }

        // Keep the parent carousel group unrotated so that the children's local coordinates match world space for perfect billboarding
        carousel.rotation.set(0, 0, 0);
      } else {
        carousel.rotation.set(0, 0, 0);
      }
    }

    // Update transition progress (slower in reduced motion for a calmer cinematic zoom)
    if (studyMode) {
      transitionProgressRef.current += (1.0 - transitionProgressRef.current) * (reducedMotion ? 2.5 : 4.0) * dt;
    } else {
      transitionProgressRef.current += (0.0 - transitionProgressRef.current) * (reducedMotion ? 3.5 : 6.0) * dt;
    }

    // 3. Tile Transitions (Fliers / Pushing into Fullscreen)
    const aspect = size.width / size.height;
    // Calculate the camera viewport dimensions at z = 0 (casting to PerspectiveCamera to access fov)
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const cameraFov = perspectiveCamera.fov || 45;
    const vHeight = 2.0 * Math.tan((cameraFov * Math.PI) / 360.0) * camera.position.z;
    const vWidth = vHeight * aspect;

    panelGroups.current.forEach((panel, index) => {
      if (!panel) return;

      // Calculate position on the circle, including the carousel rotation
      const panelAngle = index * ANGLE_STEP + currentRotation.current;
      const bob = reducedMotion ? 0.0 : Math.sin(time * 1.8 + index * 1.5) * 0.05;
      
      const rawX = CAROUSEL_RADIUS * Math.sin(panelAngle);
      const rawY = bob;
      const rawZ = CAROUSEL_RADIUS * Math.cos(panelAngle);

      // Apply tilt to orbit path mathematically (equivalent to rotating the carousel group on X axis by 0.22)
      const tilt = studyMode ? 0.0 : 0.22;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      const isActive = index === activeIndex;

      let targetPos = new THREE.Vector3(
        rawX,
        rawY * cosT - rawZ * sinT,
        rawY * sinT + rawZ * cosT
      );
      let targetScale = new THREE.Vector3(0.42, 0.42, 0.42);

      if (studyMode) {
        if (isActive) {
          // Lock to center facing camera, scale to fill screen
          targetPos.set(0, 0, 0);
          // Scale to viewport bounds (slightly larger to avoid edges showing)
          targetScale.set(vWidth / 2.2, vHeight / 2.2, 1.0);
        } else {
          // Inactive tiles shrink to 0
          targetScale.set(0, 0, 0);
          targetPos.copy(panel.position); // stay where they are but shrink
        }
      }

      // Smooth interpolation (slower in reducedMotion)
      const lerpSpeed = reducedMotion ? 4.5 : 8.0;
      panel.position.lerp(targetPos, lerpSpeed * dt);
      
      // Orbit rotation: face outwards along the orbit circle, plus a slight tilt on X (0.12 rad)
      const orbitRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, panelAngle, 0));

      // Target rotation
      const targetQuat = new THREE.Quaternion();
      if (studyMode && isActive) {
        targetQuat.copy(camera.quaternion);
      } else {
        targetQuat.copy(orbitRot);
      }

      panel.quaternion.slerp(targetQuat, lerpSpeed * dt);

      panel.scale.lerp(targetScale, lerpSpeed * dt);

      // Physical split transition and recessed screen scale updates
      const leftHalf = leftHalves.current[index];
      const rightHalf = rightHalves.current[index];
      const screenGroup = screenGroups.current[index];

      const tProg = isActive ? transitionProgressRef.current : 0.0;
      const splitOffset = tProg * 1.5;
      if (leftHalf) {
        leftHalf.position.x = -0.55 - splitOffset;
      }
      if (rightHalf) {
        rightHalf.position.x = 0.55 + splitOffset;
      }

      if (screenGroup) {
        const targetScreenScale = studyMode && isActive ? 0.95 + tProg * 0.05 : 0.95;
        screenGroup.scale.setScalar(targetScreenScale);
      }

      // Apply visual offset group drift & tilt (adonmo-style lag/drift)
      const visual = visualGroups.current[index];
      if (visual) {
        if (!studyMode) {
          // Continuous, slow idle drift/tilt loop (subtle, not distracting)
          const idleX = Math.sin(time * 0.8 + index * 1.5) * 0.025;
          const idleY = Math.cos(time * 0.7 + index * 2.0) * 0.025;
          const idleRotX = Math.sin(time * 0.5 + index * 1.0) * 0.02;
          const idleRotY = Math.cos(time * 0.6 + index * 1.2) * 0.02;

          // Capped, lagged cursor response (decorative life, does not affect hit-testing/click targets)
          const pointer = state.pointer;
          const targetDX = pointer.x * 0.06;
          const targetDY = pointer.y * 0.06;
          const targetDRotX = -pointer.y * 0.04;
          const targetDRotY = pointer.x * 0.04;

          // Target values
          const finalTX = idleX + targetDX;
          const finalTY = idleY + targetDY;
          const finalRotX = idleRotX + targetDRotX;
          const finalRotY = idleRotY + targetDRotY;

          // Lerp/ease position and rotation
          visual.position.x += (finalTX - visual.position.x) * 4.5 * dt;
          visual.position.y += (finalTY - visual.position.y) * 4.5 * dt;
          visual.position.z += (0.0 - visual.position.z) * 4.5 * dt;

          const qStart = visual.quaternion.clone();
          const qTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(finalRotX, finalRotY, 0));
          qStart.slerp(qTarget, 4.5 * dt);
          visual.quaternion.copy(qStart);
        } else {
          // Fullscreen studyMode: Reset position/rotation to zero so it fills screen perfectly
          visual.position.lerp(new THREE.Vector3(0, 0, 0), 8.0 * dt);
          visual.quaternion.slerp(new THREE.Quaternion(), 8.0 * dt);
        }
      }
    });

    // 4. Smooth Camera Push-Through Zoom
    let targetCamZ = 5.0;
    if (studyMode) {
      // Zoom camera in slightly as tile stretches, creating a push-through feel
      targetCamZ = 4.2;
    }
    const camLerpSpeed = reducedMotion ? 3.5 : 6.0;
    camera.position.z += (targetCamZ - camera.position.z) * camLerpSpeed * dt;
  });

  const renderMaterial = (index: number) => {
    const isCurrentActive = activeIndex === index;
    switch (index) {
      case 0:
        return <AtlantisWorld studyMode={studyMode && isCurrentActive} transitionProgress={transitionProgressRef} />;
      case 1:
        return <SnakeScalesMaterial studyMode={studyMode && isCurrentActive} transitionProgress={transitionProgressRef} />;
      case 2:
        return <VolcanicFracture studyMode={studyMode && isCurrentActive} transitionProgress={transitionProgressRef} />;
      case 3:
        return <CrystalCave studyMode={studyMode && isCurrentActive} transitionProgress={transitionProgressRef} />;
      case 4:
        return <NebulaIgnition studyMode={studyMode && isCurrentActive} transitionProgress={transitionProgressRef} />;
      default:
        return null;
    }
  };

  const handleTileClick = (index: number) => {
    if (loaderState !== "completed") return;
    
    if (index === activeIndex) {
      // Click active tile to enter fullscreen
      setStudyMode(true);
      // Play shimmering harmonic chord chime on zoom-in
      soundEngine.playChime();
    } else {
      // Click inactive tile to rotate to it
      targetRotation.current = -index * ANGLE_STEP;
      lastInteractionTime.current = performance.now() / 1000;
    }
  };

  const renderTileContainer = (index: number) => {
    return (
      <group>
        {/* Left half of 3D box body */}
        <mesh
          ref={(el) => {
            leftHalves.current[index] = el;
          }}
          position={[-0.55, 0, -0.01]}
        >
          <boxGeometry args={[1.1, 2.2, 0.16]} />
          <meshPhysicalMaterial
            color="#141518"
            roughness={0.18}
            metalness={0.9}
            clearcoat={1.0}
            clearcoatRoughness={0.1}
          />
        </mesh>
        
        {/* Right half of 3D box body */}
        <mesh
          ref={(el) => {
            rightHalves.current[index] = el;
          }}
          position={[0.55, 0, -0.01]}
        >
          <boxGeometry args={[1.1, 2.2, 0.16]} />
          <meshPhysicalMaterial
            color="#141518"
            roughness={0.18}
            metalness={0.9}
            clearcoat={1.0}
            clearcoatRoughness={0.1}
          />
        </mesh>
        
        {/* Recessed front shader screen */}
        <group
          ref={(el) => {
            screenGroups.current[index] = el;
          }}
          position={[0, 0, 0.081]}
          scale={0.95}
        >
          {renderMaterial(index)}
        </group>
      </group>
    );
  };

  return (
    <group>
      {/* Central energy anchor core ball */}
      {loaderState === "completed" && (
        <group ref={coreRef}>
          {/* Main glowing white ball */}
          <mesh>
            <sphereGeometry args={[0.26, 32, 32]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          {/* Glassy outer atmosphere halo */}
          <mesh>
            <sphereGeometry args={[0.34, 32, 32]} />
            <meshPhysicalMaterial
              color="#00e5ff"
              emissive="#9900ff"
              emissiveIntensity={2.8}
              toneMapped={false}
              roughness={0.02}
              transmission={0.9}
              thickness={0.1}
              transparent
              opacity={0.6}
            />
          </mesh>
        </group>
      )}

      {/* Orbiting Tiles group (unrotated parent, tilt mathematically computed in frame updates) */}
      <group ref={carouselRef} rotation={[0, 0, 0]}>
        {Array.from({ length: PANEL_COUNT }).map((_, index) => (
          <group
            key={index}
            ref={(el) => {
              panelGroups.current[index] = el;
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleTileClick(index);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (loaderState === "completed" && !studyMode) {
                // If it is the active tile, show 'view' cursor state, otherwise standard hover expand
                document.body.setAttribute("data-cursor-state", index === activeIndex ? "view" : "hover");
              }
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              document.body.removeAttribute("data-cursor-state");
            }}
          >
            <group
              ref={(el) => {
                visualGroups.current[index] = el;
              }}
            >
              {renderTileContainer(index)}
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
