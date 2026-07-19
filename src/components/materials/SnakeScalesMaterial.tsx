"use client";

import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
  uniform float uTransition;
  varying vec2 vUv;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Grid parting transition: split the plane in the center along X axis
    // As transition progress goes 0.0 -> 0.5, we split and push the halves outward
    // When transition reaches 1.0 (fullscreen completed), the grid wraps back to closed (0.0 split)
    float splitProgress = uTransition * (1.0 - uTransition) * 4.0;
    float sideDir = pos.x >= 0.0 ? 1.0 : -1.0;
    pos.x += sideDir * splitProgress * 1.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uAspect;
  uniform float uStudyMode;
  varying vec2 vUv;
  varying vec3 vViewPosition;

  // Hexagon distance function
  float hexDist(vec2 p) {
    p = abs(p);
    float d = dot(p, normalize(vec2(1.0, 1.73205)));
    return max(d, p.x);
  }

  // Hexagon grid helper: returns local uv (xy) and cell ID (zw)
  vec4 hexGrid(vec2 p) {
    vec2 r = vec2(1.0, 1.73205);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    return dot(a, a) < dot(b, b) ? vec4(a, p - a) : vec4(b, p - b);
  }

  // Iridescent spectrum calculation
  vec3 getIridescentColor(float cosTheta, float cellSeed) {
    vec3 c1 = vec3(0.0, 0.8, 0.65); // emerald cyan
    vec3 c2 = vec3(0.65, 0.1, 0.8); // violet purple
    vec3 c3 = vec3(0.95, 0.4, 0.05); // amber gold
    
    // Wave ripple based on uTime and position seed
    float t = cosTheta * 3.1415 + uTime * 0.6 + cellSeed * 5.0;
    vec3 color = c1 * sin(t) + c2 * sin(t + 2.0) + c3 * sin(t + 4.0);
    return abs(color) * 0.75 + 0.25;
  }

  void main() {
    // Correct UV for aspect ratio
    vec2 uv = vUv;
    if (uAspect > 1.0) {
      uv.x = (vUv.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      uv.y = (vUv.y - 0.5) / uAspect + 0.5;
    }

    // Scale grid coordinate space
    vec2 hexUV = uv * 9.0;
    
    // Get hex grid cell details
    vec4 h = hexGrid(hexUV);
    vec2 localUV = h.xy;
    vec2 cellID = h.zw;

    // Distance to hexagon border
    float d = hexDist(localUV);
    
    // Ambient wave ripple in preview mode
    float cellSeed = sin(cellID.x * 0.5) + cos(cellID.y * 0.5);
    float wave = sin(uTime * 1.5 - length(cellID) * 0.4) * 0.05;

    // Heat displacement from mouse cursor (active in fullscreen studyMode)
    vec2 mouseUV = uMouse;
    if (uAspect > 1.0) {
      mouseUV.x = (uMouse.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      mouseUV.y = (uMouse.y - 0.5) / uAspect + 0.5;
    }
    vec2 cellWorldUV = cellID / 9.0;
    float distToMouse = distance(cellWorldUV, mouseUV);
    float mouseHeat = exp(-distToMouse * 4.5) * uStudyMode;
    
    // Apply displacement to hexagon center
    float cellElevation = mix(wave, mouseHeat * 0.18, uStudyMode);

    // Reconstruct 3D normal for lighting on flat plane
    // Smooth bump profile per hexagon scale
    float bump = 1.0 - smoothstep(0.0, 0.48, d);
    vec2 grad = vec2(dFdx(bump), dFdy(bump)) * 8.0;
    vec3 normal = normalize(vec3(-grad, 0.6 + cellElevation));

    // Combine diffuse and specular light reflections
    vec3 lightDir = normalize(vec3(3.0, 4.0, 5.0));
    vec3 viewDir = normalize(vViewPosition);
    
    float cosTheta = max(dot(normal, viewDir), 0.0);
    vec3 iridescence = getIridescentColor(cosTheta, cellSeed);

    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 30.0) * 1.8;
    float diffuse = max(dot(normal, lightDir), 0.0) * 0.75 + 0.25;

    // Dark tile borders
    float gridBorder = smoothstep(0.44, 0.48, d);
    
    vec3 finalColor = mix(iridescence * diffuse + vec3(1.0) * spec, vec3(0.01), gridBorder);
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface SnakeScalesMaterialProps {
  studyMode?: boolean;
  transitionProgress?: React.RefObject<number>;
}

export default function SnakeScalesMaterial({ studyMode = false, transitionProgress }: SnakeScalesMaterialProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  const aspect = studyMode ? (size.width / size.height) : 1.0;

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1.0 },
      uStudyMode: { value: 0.0 },
      uTransition: { value: 0.0 },
    };
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uAspect.value = aspect;
      materialRef.current.uniforms.uStudyMode.value = studyMode ? 1.0 : 0.0;
      materialRef.current.uniforms.uTransition.value = transitionProgress?.current ?? 0.0;

      if (studyMode) {
        const pointer = state.pointer;
        const mx = pointer.x * 0.5 + 0.5;
        const my = pointer.y * 0.5 + 0.5;
        materialRef.current.uniforms.uMouse.value.x += (mx - materialRef.current.uniforms.uMouse.value.x) * 6.5 * delta;
        materialRef.current.uniforms.uMouse.value.y += (my - materialRef.current.uniforms.uMouse.value.y) * 6.5 * delta;
      } else {
        // Slow circular drift for preview
        const targetMx = 0.5 + Math.sin(time * 0.5) * 0.1;
        const targetMy = 0.5 + Math.cos(time * 0.5) * 0.1;
        materialRef.current.uniforms.uMouse.value.x += (targetMx - materialRef.current.uniforms.uMouse.value.x) * 3.0 * delta;
        materialRef.current.uniforms.uMouse.value.y += (targetMy - materialRef.current.uniforms.uMouse.value.y) * 3.0 * delta;
      }
    }
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <planeGeometry args={[2.2, 2.2]} />
        <shaderMaterial
          ref={materialRef}
          attach="material"
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>

      {/* Frame border */}
      {!studyMode && (
        <mesh position={[0, 0, 0.015]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(2.2, 2.2)]} />
          <lineBasicMaterial color="#ffffff" opacity={0.06} transparent />
        </mesh>
      )}
    </group>
  );
}
