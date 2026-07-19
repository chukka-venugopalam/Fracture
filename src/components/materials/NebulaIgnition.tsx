"use client";

import React, { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
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
  varying vec3 vWorldPosition;

  // Hash helper
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Permutation helper
  // Standard Ashima Arts 2D Simplex Noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                        0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                       -0.577350269189626,  // -1.0 + 2.0 * C.x
                        0.024390243902439); // 1.0 / 41.0
    // First corner
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);

    // Other corners
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    // Permutations
    i = mod289(i); // Avoid truncation effects in permutation
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  		+ i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

    // Gradients
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    // Normalise gradients implicitly by scaling m
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    // Compute final noise value
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fractional Brownian Motion for gas detail
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 3.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * snoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Correct UV for aspect ratio to avoid stretching (background-cover behavior)
    vec2 uv = vUv;
    if (uAspect > 1.0) {
      uv.x = (vUv.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      uv.y = (vUv.y - 0.5) / uAspect + 0.5;
    }

    // 1. Mouse coordinates gravity perturbation
    // Correct mouse X/Y for aspect ratio (background-cover)
    vec2 mouseUV = uMouse;
    if (uAspect > 1.0) {
      mouseUV.x = (uMouse.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      mouseUV.y = (uMouse.y - 0.5) / uAspect + 0.5;
    }
    float distToMouse = distance(uv, mouseUV);
    float gravityPull = exp(-distToMouse * 4.0);
    vec2 dirToMouse = normalize(mouseUV - uv);
    
    // Physically pull gas coordinates towards mouse gravity well
    vec2 gasUV = uv - dirToMouse * gravityPull * 0.12;

    // 2. Swirling Nebula Gas via Domain Warping
    vec2 q = vec2(
      fbm(gasUV * 1.5 + vec2(0.0, uTime * 0.05)),
      fbm(gasUV * 1.5 + vec2(2.4, uTime * 0.04))
    );
    vec2 r = vec2(
      fbm(gasUV * 2.0 + 4.0 * q + vec2(1.7, 9.2) + uTime * 0.08),
      fbm(gasUV * 2.0 + 4.0 * q + vec2(8.3, 2.8) - uTime * 0.06)
    );
    // Lower frequency gas clouds in tile mode for high contrast legibility
    float gasIntensity = fbm(gasUV * (uStudyMode > 0.5 ? 2.5 : 1.6) + 4.0 * r);

    // Dark base color + cosmic cyan-magenta-violet gradient
    vec3 gasColor = mix(
      vec3(0.04, 0.0, 0.08),   // deep space indigo
      vec3(0.0, 0.52, 0.65),   // glowing cyan
      gasIntensity
    );
    
    // Mix in violet/magenta clouds based on warping detail
    gasColor = mix(
      gasColor,
      vec3(0.65, 0.0, 0.45),  // cosmic violet-magenta
      length(q) * 0.5
    );

    // Apply gas glow amplitude
    vec3 nebulaGlow = gasColor * (gasIntensity * 1.6 + 0.1);

    // 3. Procedural Star Grid & Ignition Simulation
    float starGridScale = 22.0;
    vec2 starCell = floor(uv * starGridScale);
    vec2 starFrac = fract(uv * starGridScale) - 0.5;
    
    float starSeed = hash(starCell);
    float hasStar = step(0.978, starSeed); // ~2.2% of cells get stars

    // Stars slowly ignite one by one based on time
    float cycleDuration = 14.0;
    float timeInCycle = mod(uTime, cycleDuration);
    float ignitionThreshold = timeInCycle / cycleDuration;
    
    float cellIgnitionSeed = hash(starCell * 13.5);
    float starIgnition = smoothstep(cellIgnitionSeed - 0.1, cellIgnitionSeed, ignitionThreshold);

    // Twinkling effect
    float twinkle = 0.5 + 0.5 * sin(uTime * 3.5 + starSeed * 100.0);
    
    // Enlarge stars in tile preview mode so they don't resolve as microscopic noise
    float starSize = uStudyMode > 0.5 ? (0.02 + 0.06 * starSeed) : (0.05 + 0.12 * starSeed);
    float starPoint = smoothstep(starSize, 0.0, length(starFrac));
    
    // Bright white center, subtle colored corona
    vec3 starColor = vec3(1.0, 0.95, 0.9) * starPoint * hasStar * twinkle * starIgnition * 1.6;

    // Combine nebula gas and stars
    vec3 finalColor = nebulaGlow + starColor;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface NebulaIgnitionProps {
  studyMode?: boolean;
  transitionProgress?: React.RefObject<number>;
}

export default function NebulaIgnition({ studyMode = false, transitionProgress }: NebulaIgnitionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Plane is a square in tile mode, widescreen in studyMode
  const aspect = studyMode ? (size.width / size.height) : 1.0;

  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1.0 },
      uStudyMode: { value: 0.0 },
    };
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      materialRef.current.uniforms.uAspect.value = aspect;
      materialRef.current.uniforms.uStudyMode.value = studyMode ? 1.0 : 0.0;

      if (studyMode) {
        // Fullscreen Active Mode: Track pointer coordinates in UV space
        const pointer = state.pointer;
        const mx = pointer.x * 0.5 + 0.5;
        const my = pointer.y * 0.5 + 0.5;

        // Smooth lerp mouse coordinates
        materialRef.current.uniforms.uMouse.value.x += (mx - materialRef.current.uniforms.uMouse.value.x) * 6.0 * delta;
        materialRef.current.uniforms.uMouse.value.y += (my - materialRef.current.uniforms.uMouse.value.y) * 6.0 * delta;
      } else {
        // Orbit Preview Mode: Calm, slow procedural circular focus point, zero mouse reaction
        const targetMx = 0.5 + Math.cos(time * 0.4) * 0.15;
        const targetMy = 0.5 + Math.sin(time * 0.4) * 0.15;
        materialRef.current.uniforms.uMouse.value.x += (targetMx - materialRef.current.uniforms.uMouse.value.x) * 2.5 * delta;
        materialRef.current.uniforms.uMouse.value.y += (targetMy - materialRef.current.uniforms.uMouse.value.y) * 2.5 * delta;
      }
    }

    const transProg = transitionProgress?.current ?? 0.0;
    
    // Weightless drift effect: add floating drift that sweeps as we transition
    const grp = groupRef.current;
    if (grp) {
      // Slow continuous float + transition weightless roll
      grp.position.x = Math.sin(time * 0.4) * 0.15 * transProg;
      grp.position.y = Math.cos(time * 0.35) * 0.15 * transProg;
      grp.position.z = (1.0 - transProg) * -1.8; // Pulled outward -> drifts into view
      grp.rotation.z = time * 0.03 + transProg * 0.42; // weightless roll
    }
  });

  return (
    <group ref={groupRef}>
      {/* Mesh plane for full screen shader rendering */}
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
