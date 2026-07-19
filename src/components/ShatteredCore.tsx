"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Custom GLSL shaders for the crystal core supporting 3-state transitions
// Custom GLSL shaders for the crystal core supporting 5-state transitions
const coreVertexShader = `
  uniform float uTime;
  uniform float uTransition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    
    // Displace vertices along normals for liquid metal, crystal growth, and pure light states
    vec3 pos = position;
    if (uTransition > 3.0) {
      // Pure Light pulsing plasma displacement
      float transitionFactor = uTransition - 3.0;
      float pulse = sin(uTime * 3.5 + position.x * 3.0 + position.y * 3.0) * 0.05 * transitionFactor;
      pos += normal * pulse;
    } else if (uTransition > 2.0) {
      // Flattening spiky crystal displacement
      float transitionFactor = uTransition - 2.0;
      float spikyDisplacement = pow(abs(sin(position.x * 12.0) * cos(position.y * 12.0)), 2.0) * 0.12;
      float displacement = mix(spikyDisplacement, 0.0, transitionFactor);
      pos += normal * displacement;
    } else if (uTransition > 1.0) {
      float transitionFactor = uTransition - 1.0;
      float wave = sin(position.x * 4.5 + position.y * 4.5 + uTime * 2.8) * cos(position.z * 4.5 + uTime * 2.2);
      float rippleDisplacement = wave * 0.065;
      
      // Spiky crystal displacement
      float spikyDisplacement = pow(abs(sin(position.x * 12.0) * cos(position.y * 12.0)), 2.0) * 0.12;
      
      float displacement = mix(rippleDisplacement, spikyDisplacement, transitionFactor);
      pos += normal * displacement;
    } else if (uTransition > 0.0) {
      float wave = sin(position.x * 4.5 + position.y * 4.5 + uTime * 2.8) * cos(position.z * 4.5 + uTime * 2.2);
      float displacement = wave * 0.065 * uTransition;
      pos += normal * displacement;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const coreFragmentShader = `
  uniform float uTime;
  uniform float uTransition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Dynamic normal ripples for liquid metal surface (fades out in state 2, remains 0 in 3 and 4)
    if (uTransition > 0.0) {
      vec3 perturb = vec3(
        sin(vWorldPosition.y * 10.0 + uTime * 3.5) * 0.12,
        cos(vWorldPosition.z * 10.0 + uTime * 3.5) * 0.12,
        sin(vWorldPosition.x * 10.0 + uTime * 3.5) * 0.12
      );
      float scale = 0.0;
      if (uTransition <= 1.0) {
        scale = uTransition;
      } else if (uTransition <= 2.0) {
        scale = 2.0 - uTransition;
      }
      normal = normalize(normal + perturb * scale);
    }

    // Base colors (pink-to-blue gradient identity)
    float diag = vWorldPosition.x - vWorldPosition.y;
    float gradRatio = clamp((diag + 0.6) / 1.2, 0.0, 1.0);
    
    vec3 pinkWhite = vec3(1.0, 0.72, 0.85);
    vec3 coolBlue = vec3(0.35, 0.78, 1.0);
    vec3 baseGlassColor = mix(pinkWhite, coolBlue, gradRatio);

    // GLASS STATE SHADING (uTransition = 0.0)
    vec3 refractDir = refract(-viewDir, normal, 0.65);
    float cosTheta = max(dot(normal, viewDir), 0.0);
    float dispersion = sin(refractDir.x * 12.0 + uTime * 0.7) * 0.5 + 0.5;
    vec3 causticColor = mix(pinkWhite * 0.92, coolBlue * 1.25, dispersion);

    vec3 lightDir = normalize(vec3(3.0, 5.0, 4.0));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 90.0) * 3.0;
    vec3 specularFlash = vec3(1.0, 1.0, 1.0) * spec;

    float fresnel = pow(1.0 - cosTheta, 3.0) * 0.5;
    vec3 glassColor = baseGlassColor * (causticColor * 0.65 + 0.35) * (fresnel * 0.75 + 0.25) + specularFlash;
    vec3 emissiveGlow = vec3(0.0, 0.9, 1.0) * 0.38;
    vec3 finalGlassColor = mix(glassColor, emissiveGlow, 0.22) + specularFlash * 0.7;

    // LIQUID METAL STATE SHADING (uTransition = 1.0)
    vec3 reflectDir = reflect(-viewDir, normal);
    float reflectionGrad = reflectDir.y * 0.5 + 0.5;
    vec3 skyGradient = mix(coolBlue * 1.3, pinkWhite * 1.15, reflectionGrad);
    
    vec3 mercuryBase = vec3(0.94, 0.95, 0.97);
    vec3 liquidMetalColor = mix(mercuryBase, skyGradient, 0.55);
    
    float metalSpec = pow(max(dot(normal, halfVec), 0.0), 120.0) * 4.5;
    vec3 specularMetal = vec3(1.0, 0.96, 0.99) * metalSpec;
    
    float metalFresnel = pow(1.0 - cosTheta, 4.0) * 0.75;
    vec3 metalEdgeGlow = vec3(0.0, 0.85, 1.0) * metalFresnel;
    
    vec3 finalMetalColor = liquidMetalColor + specularMetal + metalEdgeGlow;

    // CRYSTAL GROWTH STATE SHADING (uTransition = 2.0)
    float crystalFresnel = pow(1.0 - cosTheta, 3.0);
    vec3 crystalCaustic = mix(pinkWhite * 1.5, coolBlue * 1.7, sin(dot(normal, viewDir) * 6.28) * 0.5 + 0.5);
    vec3 crystalColor = baseGlassColor * (crystalCaustic * 0.8 + 0.2) + specularFlash * 0.5;
    
    // Glowing internal quartz veins (color-shifting rose/cyan)
    vec3 emissiveQuartzGlow = mix(vec3(1.0, 0.3, 0.75), vec3(0.0, 0.95, 1.0), sin(vWorldPosition.y * 8.0 + uTime * 1.5) * 0.5 + 0.5) * 0.45;
    float crystalSpecPower = pow(max(dot(normal, halfVec), 0.0), 50.0) * 4.0;
    vec3 specularCrystal = vec3(1.0, 0.85, 0.95) * crystalSpecPower;
    
    vec3 finalCrystalColor = mix(crystalColor, emissiveQuartzGlow, 0.38) + specularCrystal * 1.2;

    // DARK OBSIDIAN STATE SHADING (uTransition = 3.0)
    vec3 obsidianColor = vec3(0.02, 0.02, 0.03);
    float obsidianFresnel = pow(1.0 - cosTheta, 4.0);
    vec3 obsidianEdgeGlow = mix(pinkWhite * 1.5, coolBlue * 1.8, sin(uTime + normal.y * 2.0) * 0.5 + 0.5) * obsidianFresnel;
    vec3 obsidianVeins = mix(pinkWhite, coolBlue, sin(vWorldPosition.y * 6.0 + uTime * 1.0) * 0.5 + 0.5) * 0.08;
    vec3 finalObsidianColor = obsidianColor + obsidianEdgeGlow + obsidianVeins + specularFlash * 0.4;
    float obsidianOpacity = 0.98;

    // PURE LIGHT STATE SHADING (uTransition = 4.0)
    vec3 pureLightBase = mix(pinkWhite, coolBlue, sin(uTime * 0.5) * 0.5 + 0.5);
    vec3 pureLightColor = mix(pureLightBase * 1.5, vec3(1.0, 1.0, 1.0), 0.7);
    float centerBrightness = pow(cosTheta, 2.0) * 2.2;
    vec3 finalPureLightColor = pureLightColor * (centerBrightness + 0.5) + specularFlash * 1.5;
    float pureLightOpacity = mix(0.25, 0.65, cosTheta);

    // INTERPOLATE MATERIAL STATES
    vec3 finalColor = vec3(0.0);
    float finalOpacity = 1.0;
    
    if (uTransition <= 1.0) {
      finalColor = mix(finalGlassColor, finalMetalColor, uTransition);
      finalOpacity = mix(0.96, 1.0, uTransition);
    } else if (uTransition <= 2.0) {
      float transitionFactor = uTransition - 1.0;
      finalColor = mix(finalMetalColor, finalCrystalColor, transitionFactor);
      finalOpacity = mix(1.0, 0.82, transitionFactor);
    } else if (uTransition <= 3.0) {
      float transitionFactor = uTransition - 2.0;
      finalColor = mix(finalCrystalColor, finalObsidianColor, transitionFactor);
      finalOpacity = mix(0.82, 0.98, transitionFactor);
    } else {
      float transitionFactor = clamp(uTransition - 3.0, 0.0, 1.0);
      finalColor = mix(finalObsidianColor, finalPureLightColor, transitionFactor);
      float targetLightOpacity = pureLightOpacity;
      finalOpacity = mix(0.98, targetLightOpacity, transitionFactor);
    }

    gl_FragColor = vec4(finalColor, finalOpacity);
  }
`;

interface ShatteredCoreProps {
  gradientTexture: THREE.CanvasTexture | null;
  studyMode?: boolean;
  scrollProgress?: number;
}

export default function ShatteredCore({ studyMode = false, scrollProgress = 0 }: ShatteredCoreProps) {
  const visualGroupRef = useRef<THREE.Group>(null);

  // Drag physics state variables
  const isDragging = useRef<boolean>(false);
  const startX = useRef<number>(0);
  const startY = useRef<number>(0);
  const startRotX = useRef<number>(0);
  const startRotY = useRef<number>(0);
  const lastDragTime = useRef<number>(0);

  const targetRotX = useRef<number>(0);
  const targetRotY = useRef<number>(0);
  const currentRotX = useRef<number>(0);
  const currentRotY = useRef<number>(0);

  const velX = useRef<number>(0);
  const velY = useRef<number>(0);
  const lastMouseX = useRef<number>(0);
  const lastMouseY = useRef<number>(0);

  const { gl, size } = useThree();

  // Create core shader material manually to avoid R3F uniforms reference re-assignment issues
  const coreMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: coreVertexShader,
      fragmentShader: coreFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uTransition: { value: 0 },
      },
      transparent: true,
      depthWrite: true,
    });
  }, []);

  // Attach canvas-wide pointer events for tactile drag-to-rotate
  useEffect(() => {
    const canvasEl = gl.domElement;
    if (!canvasEl) return;

    const handlePointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startY.current = e.clientY;
      startRotX.current = targetRotX.current;
      startRotY.current = targetRotY.current;
      lastMouseX.current = e.clientX;
      lastMouseY.current = e.clientY;
      lastDragTime.current = performance.now();
      velX.current = 0;
      velY.current = 0;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;

      const deltaX = e.clientX - startX.current;
      const deltaY = e.clientY - startY.current;

      // Map screen move delta to 3D rotation angles (damped and scaled)
      targetRotY.current = startRotY.current + (deltaX / size.width) * Math.PI * 1.5;
      targetRotX.current = startRotX.current + (deltaY / size.height) * Math.PI * 1.2;

      // Clamp X rotation to prevent flipping upside down
      targetRotX.current = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, targetRotX.current));

      // Calculate move velocity for release inertia
      const now = performance.now();
      const dt = (now - lastDragTime.current) / 1000;
      if (dt > 0.005) {
        velY.current = ((e.clientX - lastMouseX.current) / size.width) * Math.PI * 1.5 / dt;
        velX.current = ((e.clientY - lastMouseY.current) / size.height) * Math.PI * 1.2 / dt;
      }

      lastMouseX.current = e.clientX;
      lastMouseY.current = e.clientY;
      lastDragTime.current = now;
    };

    const handlePointerUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;

      // Cap momentum velocity to avoid infinite wild spins
      const maxVel = 8.0;
      velX.current = Math.max(-maxVel, Math.min(maxVel, velX.current * 0.18));
      velY.current = Math.max(-maxVel, Math.min(maxVel, velY.current * 0.18));
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
  }, [gl, size.width, size.height]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const time = state.clock.getElapsedTime();

    // Update shader uniforms with organic lerping
    if (coreMaterial) {
      coreMaterial.uniforms.uTime.value = time;
      
      // Interpolate transition progress smoothly
      const currentTransition = coreMaterial.uniforms.uTransition.value;
      let targetTransition = 0.0;
      if (scrollProgress <= 0.2) {
        targetTransition = (scrollProgress / 0.2) * 1.0;
      } else if (scrollProgress <= 0.4) {
        targetTransition = 1.0 + ((scrollProgress - 0.2) / 0.2) * 1.0;
      } else if (scrollProgress <= 0.6) {
        targetTransition = 2.0 + ((scrollProgress - 0.4) / 0.2) * 1.0;
      } else if (scrollProgress <= 0.8) {
        targetTransition = 3.0 + ((scrollProgress - 0.6) / 0.2) * 1.0;
      } else {
        targetTransition = 4.0;
      }
      coreMaterial.uniforms.uTransition.value += (targetTransition - currentTransition) * 5.0 * dt;
    }

    // 1. Interpolate rotations
    if (isDragging.current) {
      // Smooth follow during drag
      currentRotX.current += (targetRotX.current - currentRotX.current) * 16 * dt;
      currentRotY.current += (targetRotY.current - currentRotY.current) * 16 * dt;
    } else {
      // Apply momentum decay on release (spring friction model)
      velX.current *= Math.exp(-3.2 * dt);
      velY.current *= Math.exp(-3.2 * dt);

      currentRotX.current += velX.current * dt;
      currentRotY.current += velY.current * dt;

      // Enforce X clamping during inertia drift
      currentRotX.current = Math.max(-Math.PI / 2.8, Math.min(Math.PI / 2.8, currentRotX.current));
      
      // Update targets to settle on current angles
      targetRotX.current = currentRotX.current;
      targetRotY.current = currentRotY.current;
    }

    // 2. Slow continuous idle ambient drift & wobble (AdOnMo standard)
    const idleX = Math.sin(time * 0.3) * 0.08;
    const idleY = time * 0.06; // continuous gentle Y spin
    const idleZ = Math.cos(time * 0.25) * 0.05;

    // Apply rotation only to the visual group ref, leaving parent collision bounds static
    const visual = visualGroupRef.current;
    if (visual) {
      visual.rotation.set(
        currentRotX.current + idleX,
        currentRotY.current + idleY,
        idleZ
      );
    }
  });

  return (
    <group>
      {/* Visual core geometry node */}
      <group ref={visualGroupRef}>
        {/* Faceted Crystal Core Polyhedron */}
        <mesh>
          <icosahedronGeometry args={[0.58, 2]} />
          <primitive object={coreMaterial} attach="material" />
        </mesh>
        
        {/* Glowing border wireframe highlighting facets */}
        <mesh>
          <icosahedronGeometry args={[0.582, 2]} />
          <meshBasicMaterial
            color="#00e5ff"
            wireframe
            transparent
            opacity={0.12}
          />
        </mesh>
      </group>

      {/* Invisible static hitbox sphere to keep grab checks completely stable */}
      <mesh>
        <sphereGeometry args={[0.65, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
