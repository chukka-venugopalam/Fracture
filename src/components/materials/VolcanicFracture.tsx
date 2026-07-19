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
  uniform float uTransition;
  varying vec2 vUv;
  varying vec3 vViewPosition;
  varying vec3 vWorldPosition;

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

  // Fractional Brownian Motion for complex rock heightmap
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    float frequency = 3.0;
    for (int i = 0; i < 4; i++) {
      value += amplitude * snoise(p * frequency);
      frequency *= 2.05;
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    // Correct UV for aspect ratio to avoid squishing (background-cover behavior)
    vec2 uv = vUv;
    if (uAspect > 1.0) {
      uv.x = (vUv.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      uv.y = (vUv.y - 0.5) / uAspect + 0.5;
    }

    // 1. Heightmap generation for obsidian rock
    float height = fbm(uv * 2.5);

    // 2. Normal reconstruction using screen-space derivatives (bump map)
    vec3 normal = normalize(vec3(-dFdx(height) * 4.0, -dFdy(height) * 4.0, 0.45));

    // 3. Local Cursor Heat Source
    // Correct mouse X/Y for aspect ratio (background-cover)
    vec2 mouseUV = uMouse;
    if (uAspect > 1.0) {
      mouseUV.x = (uMouse.x - 0.5) * uAspect + 0.5;
    } else if (uAspect < 1.0) {
      mouseUV.y = (uMouse.y - 0.5) / uAspect + 0.5;
    }
    float distToMouse = distance(uv, mouseUV);
    float heat = exp(-distToMouse * 3.8);

    // 4. Branching lava crack noise
    float crackNoise = fbm(uv * 4.2 + vec2(snoise(uv * 1.5) * 0.12, uTime * 0.06));
    
    // Cracks expand and open wider near the mouse
    float targetHeight = 0.12;
    // Scale cracks to be wider/bolder in tile preview mode (uStudyMode < 0.5)
    float baseWidth = uStudyMode > 0.5 ? 0.008 : 0.024;
    float heatWidth = uStudyMode > 0.5 ? 0.045 : 0.075;
    
    // Tearing crack transition: uTransition expands the cracks up to a full screen melt!
    float transitionExpansion = uTransition * uTransition * 0.42;
    float crackWidth = baseWidth + heat * heatWidth + transitionExpansion;
    
    // Soften edges dynamically during transition
    float smoothEdge = uTransition * 0.08;
    float crackMask = smoothstep(crackWidth, smoothEdge, abs(crackNoise - targetHeight));

    // 5. Lava Color & Pulsing Glow
    float pulse = 0.6 + 0.4 * sin(uTime * 2.2 + crackNoise * 8.0);
    vec3 lavaColor = mix(
      vec3(0.95, 0.18, 0.01),  // deep red-orange
      vec3(1.0, 0.58, 0.02),   // hot bright orange-yellow
      pulse
    );

    // Make lava extra luminous in tile preview mode for high contrast legibility
    // Boost intensity dynamically as the transition tears open to swallow the frame
    float pulseScale = uStudyMode > 0.5 ? 1.2 : 2.5;
    pulseScale += uTransition * 8.0;
    vec3 emissiveLava = lavaColor * (pulseScale + heat * 3.5) * crackMask;

    // Heat glow aura around cursor
    vec3 heatAura = vec3(0.9, 0.18, 0.0) * heat * (uStudyMode > 0.5 ? 0.42 : 0.65) + vec3(1.0, 0.35, 0.0) * uTransition * uTransition * 0.5;

    // 6. Obsidian specular reflections
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(vec3(3.0, 5.0, 4.0));
    
    // Blinn-Phong specular highlight (high shine obsidian glass)
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfVec), 0.0), 90.0) * 1.8;
    
    // Subtle rocky diffuse base
    float diffuse = max(dot(normal, lightDir), 0.0) * 0.18 + 0.02;
    vec3 obsidianColor = vec3(0.04, 0.04, 0.05) * diffuse + vec3(1.0) * spec * 0.85;

    // Combine obsidian surface and glowing lava cracks
    vec3 finalColor = mix(obsidianColor, emissiveLava, crackMask) + heatAura;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface VolcanicFractureProps {
  studyMode?: boolean;
  transitionProgress?: React.RefObject<number>;
}

export default function VolcanicFracture({ studyMode = false, transitionProgress }: VolcanicFractureProps) {
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
        // Fullscreen Active Mode: Track mouse cursor coordinates in normalized UV space
        const pointer = state.pointer;
        const mx = pointer.x * 0.5 + 0.5;
        const my = pointer.y * 0.5 + 0.5;
        
        materialRef.current.uniforms.uMouse.value.x += (mx - materialRef.current.uniforms.uMouse.value.x) * 6.5 * delta;
        materialRef.current.uniforms.uMouse.value.y += (my - materialRef.current.uniforms.uMouse.value.y) * 6.5 * delta;
      } else {
        // Orbit Preview Mode: Calm, slow procedural circular heat center, zero cursor reaction
        const targetMx = 0.5 + Math.sin(time * 0.6) * 0.12;
        const targetMy = 0.5 + Math.cos(time * 0.6) * 0.12;
        materialRef.current.uniforms.uMouse.value.x += (targetMx - materialRef.current.uniforms.uMouse.value.x) * 3.0 * delta;
        materialRef.current.uniforms.uMouse.value.y += (targetMy - materialRef.current.uniforms.uMouse.value.y) * 3.0 * delta;
      }
    }
  });

  return (
    <group>
      {/* 2D Plane geometry covering full bounds */}
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

      {/* Frame border in tile mode */}
      {!studyMode && (
        <mesh position={[0, 0, 0.015]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(2.2, 2.2)]} />
          <lineBasicMaterial color="#ffffff" opacity={0.06} transparent />
        </mesh>
      )}
    </group>
  );
}
