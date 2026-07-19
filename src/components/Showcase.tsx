"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import Carousel from "./Carousel";
import GlassShatterLoader from "./GlassShatterLoader";
import CustomCursor from "./CustomCursor";
import ShatteredCore from "./ShatteredCore";
import AmbientBackground from "./AmbientBackground";
import { soundEngine } from "@/utils/audio";
import * as THREE from "three";

const PANEL_COUNT = 5;
const ANGLE_STEP = (2 * Math.PI) / PANEL_COUNT;

const panelNames = [
  "ATLANTIS",
  "HEX SNAKE SCALES",
  "VOLCANIC FRACTURE",
  "CRYSTAL CAVE GROWTH",
  "NEBULA IGNITION"
];

const panelShortDescriptors = [
  "submerged ruins",
  "iridescent scales",
  "obsidian fractures",
  "timelapse growth",
  "weightless field"
];

const isPhase1Isolated = true; // Toggle for Phase 1 Signature Moment isolation

export default function Showcase() {
  const [progress, setProgress] = useState(0);
  const [loaderState, setLoaderState] = useState<"loading" | "impact" | "shattering" | "completed">("loading");
  const [collisionTriggered, setCollisionTriggered] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  
  // Audio state (muted by default)
  const [isMuted, setIsMuted] = useState(true);

  // Reduced motion support state
  const [reducedMotion, setReducedMotion] = useState(false);

  const targetRotation = useRef<number>(0);
  const currentRotation = useRef<number>(0);

  // Canvas-based pink-white-to-blue gradient texture (client-only state)
  const [gradientTexture, setGradientTexture] = useState<THREE.CanvasTexture | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0.0, "#ffeef8"); // pale pink-white
      grad.addColorStop(0.4, "#f3e5f5"); // soft purple-pink
      grad.addColorStop(1.0, "#64b5f6"); // cool light blue
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    setGradientTexture(texture);
  }, []);

  // Hook into real asset load progress
  const { progress: loadProgress } = useProgress();

  // Query prefers-reduced-motion media settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);

    const handleQueryChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleQueryChange);
    return () => mediaQuery.removeEventListener("change", handleQueryChange);
  }, []);

  // Loading Progress Simulation (min 2.0s duration) with ?test=true bypass
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("test") === "true") {
        setLoaderState("completed");
        setProgress(100);
        setCollisionTriggered(true);
        return;
      }
    }

    if (loaderState !== "loading") return;

    const minimumDuration = 2000; // 2 seconds minimum duration
    const startTime = Date.now();
    let animationFrameId: number;

    const updateProgress = () => {
      // Guard against race conditions during client hydration
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("test") === "true") {
          setLoaderState("completed");
          setProgress(100);
          setCollisionTriggered(true);
          return;
        }
      }

      const elapsed = Date.now() - startTime;
      const simulatedProgress = Math.min((elapsed / minimumDuration) * 100, 100);

      // Mix simulated progress with actual load progress
      const currentLoadProgress = loadProgress > 0 ? loadProgress : 100;
      const combinedProgress = Math.min(simulatedProgress, currentLoadProgress);

      setProgress(combinedProgress);

      if (combinedProgress < 100) {
        animationFrameId = requestAnimationFrame(updateProgress);
      } else {
        // Transition to impact state after loading completes
        setLoaderState("impact");
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [loaderState, loadProgress]);

  // Track window scroll progress for material transition
  useEffect(() => {
    if (loaderState !== "completed") {
      setScrollProgress(0);
      return;
    }

    const handleScroll = () => {
      // Allow visual query override for automated screenshot rendering tests
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const testScroll = urlParams.get("scroll");
        if (testScroll !== null) {
          setScrollProgress(parseFloat(testScroll));
          return;
        }
      }

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollRange = window.innerHeight; // 1 viewport height scroll distance
      if (scrollRange <= 0) return;
      const progress = Math.max(0, Math.min(1.0, scrollTop / scrollRange));
      setScrollProgress(progress);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [loaderState]);

  // Dynamically toggle body, html, and main height/overflow properties based on loader completion
  useEffect(() => {
    if (typeof document === "undefined") return;
    
    const mainEl = document.querySelector("main");
    if (loaderState === "completed") {
      document.body.style.overflow = "auto";
      document.body.style.height = "auto";
      document.documentElement.style.overflow = "auto";
      document.documentElement.style.height = "auto";
      if (mainEl) {
        mainEl.style.overflow = "visible";
        mainEl.style.height = "auto";
      }
    } else {
      document.body.style.overflow = "hidden";
      document.body.style.height = "100%";
      document.documentElement.style.overflow = "hidden";
      document.documentElement.style.height = "100%";
      if (mainEl) {
        mainEl.style.overflow = "hidden";
        mainEl.style.height = "100%";
      }
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.height = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
      if (mainEl) {
        mainEl.style.overflow = "";
        mainEl.style.height = "";
      }
    };
  }, [loaderState]);

  // Sync mute state on first click interaction to handle browser autoplay policies
  useEffect(() => {
    const handleFirstInteraction = () => {
      soundEngine.init();
      soundEngine.setMute(isMuted);
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction);
    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, [isMuted]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.init();
    const newMute = !isMuted;
    setIsMuted(newMute);
    soundEngine.setMute(newMute);
  };

  // Orbit navigation snap-to-index selector
  const goToPanel = (index: number) => {
    if (loaderState !== "completed" || studyMode) return;
    const angleForIndex = -index * ANGLE_STEP;
    const currentRot = targetRotation.current;
    
    const twoPi = 2 * Math.PI;
    const diff = ((angleForIndex - currentRot) % twoPi + twoPi) % twoPi;
    
    let targetDiff = diff;
    if (targetDiff > Math.PI) {
      targetDiff -= twoPi;
    }
    
    targetRotation.current = currentRot + targetDiff;
    setActiveIndex(index);
  };

  const isLoading = loaderState === "loading";
  const isCompleted = loaderState === "completed";

  return (
    <>
      <div 
        className={`showcase-container state-${loaderState} ${studyMode ? "study-active" : ""}`}
      >
      {/* Custom Cursor Overlay */}
      <CustomCursor />

      {/* 3D R3F Canvas */}
      <div 
        className="canvas-wrapper" 
        data-cursor={isCompleted && !studyMode ? "drag" : undefined}
      >
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          style={{ width: "100%", height: "100%", display: "block", pointerEvents: "auto" }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#000000"]} />
          <CameraRig scrollProgress={scrollProgress} />
          
          {/* Ambient Lighting & Main Directional Keylights */}
          <ambientLight intensity={0.65} />
          <directionalLight position={[3, 10, 5]} intensity={1.5} />
          {/* Intense point lights representing the glowing core's colors, helping tiles catch specular reflections */}
          <pointLight position={[0, 0, 0]} intensity={3.5} distance={12} color="#00ffff" decay={2.0} />
          <pointLight position={[0, 0, 1.2]} intensity={2.0} distance={8} color="#7700ff" decay={1.5} />

          {/* Drifting ambient pink-blue background */}
          <AmbientBackground />

          {/* Intro, Impact, & Shatter Loader Component */}
          {loaderState !== "completed" && (
            <GlassShatterLoader
              progress={progress}
              loaderState={loaderState}
              setLoaderState={setLoaderState}
              collisionTriggered={collisionTriggered}
              setCollisionTriggered={setCollisionTriggered}
              reducedMotion={reducedMotion}
            />
          )}

            {/* Interactive Orbit Carousel Ring & Anchored Core */}
            {!isPhase1Isolated && (loaderState === "shattering" || loaderState === "completed") && (
              <Carousel
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                targetRotation={targetRotation}
                currentRotation={currentRotation}
                studyMode={studyMode}
                setStudyMode={setStudyMode}
                loaderState={loaderState}
                reducedMotion={reducedMotion}
              />
            )}

            {/* Phase 1 Isolated Core Ball Placeholder */}
            {isPhase1Isolated && loaderState === "completed" && (
              <ShatteredCore
                gradientTexture={gradientTexture}
                studyMode={studyMode}
                scrollProgress={scrollProgress}
              />
            )}
          </Canvas>
      </div>

      {/* 2D HTML UI Overlay */}
      <div className="ui-overlay">
        {/* Top Header */}
        {!isPhase1Isolated && loaderState === "completed" && (
          <header className="header fade-in-element">
          <div className="logo-container">
            <span className="logo-main">FRACTURE</span>
            <span className="logo-sub">CINEMATIC ORBIT NAVIGATION</span>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <div className="instructions">
              <span>DRAG OR SWIPE</span>
            </div>
            <button 
              className="audio-mute-btn"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute experience audio" : "Mute experience audio"}
            >
              {isMuted ? "SOUND: OFF" : "SOUND: ON"}
            </button>
          </div>
        </header>
        )}

        {/* Real Loading Indicator Overlay (Minimal: completeness of the ball is feedback) */}
        {isLoading && (
          <div className="loading-indicator-overlay">
            <div className="loading-indicator-content" style={{ textAlign: "center" }}>
              {/* Single serif accent title reserved for loading page */}
              <h1 
                className="serif-accent" 
                style={{ 
                  fontSize: "3.2rem", 
                  color: "#ffffff", 
                  marginBottom: "0.4rem", 
                  letterSpacing: "0.22em", 
                  textTransform: "uppercase" 
                }}
              >
                Fracture
              </h1>
              <span className="loading-label" style={{ opacity: 0.35 }}>Stitching Core Anchor</span>
            </div>
          </div>
        )}

        {/* Bottom Details panel - quiet, single-line label format in orbit mode */}
        {!isPhase1Isolated && loaderState === "completed" && (
          <footer className="footer fade-in-element">
          <div className="material-info">
            <div className="material-number">
              {(activeIndex + 1).toString().padStart(2, "0")}
            </div>
            <div className="material-details">
              <span className="material-label">ACTIVE PORTAL PREVIEW</span>
              <h2 className="material-name" style={{ fontSize: "1.15rem", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 400 }}>
                {panelNames[activeIndex]} <span className="serif-accent" style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.95rem", marginLeft: "0.6rem" }}>— {panelShortDescriptors[activeIndex]}</span>
              </h2>
            </div>
          </div>

          <div className="navigation-dots">
            {panelNames.map((_, index) => (
              <button
                key={index}
                className={`nav-dot ${index === activeIndex ? "active" : ""}`}
                onClick={() => goToPanel(index)}
                aria-label={`Orbit to ${panelNames[index]}`}
              />
            ))}
          </div>
          </footer>
        )}

        {/* Phase 1 Isolated Overlay Text */}
        {isPhase1Isolated && loaderState === "completed" && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "rgba(255, 255, 255, 0.4)",
            fontFamily: "var(--font-sans)",
            fontSize: "0.85rem",
            letterSpacing: "0.45em",
            pointerEvents: "none",
            textTransform: "uppercase"
          }}>
            CORE PLACEHOLDER
          </div>
        )}

        {/* Back To Orbit Affordance (only visible in fullscreen mode) */}
        {studyMode && (
          <div className="study-hud">
            <button 
              className="back-btn" 
              onClick={() => setStudyMode(false)}
              data-cursor="back"
            >
              <span>BACK TO ORBIT</span>
            </button>
            <div className="active-study-details">
              <span className="study-tag">ACTIVE SHADER WORLD</span>
              <h1 className="study-title">{panelNames[activeIndex]}</h1>
            </div>
          </div>
        )}
      </div>
      </div>
      {/* Temporary Debug Scroll Progress Readout */}
      {loaderState === "completed" && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          color: "#00e5ff",
          padding: "8px 12px",
          fontFamily: "monospace",
          fontSize: "12px",
          zIndex: 9999,
          borderRadius: "4px",
          pointerEvents: "none"
        }}>
          SCROLL: {scrollProgress.toFixed(3)}
        </div>
      )}
      {/* Scroll-triggered content section (Phase 5) */}
      {loaderState === "completed" && (
        <div 
          style={{
            position: "fixed",
            left: "8%",
            top: "50%",
            transform: `translateY(calc(-50% + ${(1.0 - scrollProgress) * 30}px))`,
            maxWidth: "400px",
            opacity: Math.max(0, Math.min(1.0, (scrollProgress - 0.25) * 3.5)), // fades in between scrollProgress 0.25 and 0.54
            transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
            color: "#f5f5f7",
            pointerEvents: "none",
            zIndex: 3,
            textShadow: "0 2px 10px rgba(0,0,0,0.5)"
          }}
        >
          <span style={{ 
            fontSize: "0.7rem", 
            letterSpacing: "0.35em", 
            color: "#00e5ff", 
            textTransform: "uppercase",
            display: "block",
            marginBottom: "0.6rem",
            fontWeight: 500
          }}>
            STAGE I — THE SHIFT
          </span>
          <h1 style={{ 
            fontFamily: "var(--font-serif)", 
            fontSize: "2.5rem", 
            fontWeight: 300, 
            lineHeight: "1.15",
            marginBottom: "1.0rem",
            letterSpacing: "0.02em"
          }}>
            Liquid Mercury
          </h1>
          <p style={{ 
            fontSize: "0.85rem", 
            lineHeight: "1.65", 
            color: "rgba(255, 255, 255, 0.45)",
            letterSpacing: "0.04em"
          }}>
            Rigid glass edges soften and liquefy. The core resolves into a reflective, mercury-like sphere that ripples under atmospheric pressure, mirroring the pink-blue auroral currents of the void.
          </p>
        </div>
      )}
      {loaderState === "completed" && (
        <div 
          className="scroll-spacer" 
          style={{ height: "200vh", pointerEvents: "none" }} 
        />
      )}
    </>
  );
}

// Phase 5 Scroll-Driven Camera Choreography Rig
function CameraRig({ scrollProgress }: { scrollProgress: number }) {
  const targetPos = useRef(new THREE.Vector3(0, 0, 5));

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);

    // Camera starts at [0, 0, 5] (front view of glass)
    // Orbits to [2.2, 0.8, 3.8] (side/top view looking down on liquid metal core)
    const startPos = new THREE.Vector3(0, 0, 5);
    const endPos = new THREE.Vector3(2.2, 0.8, 3.8);

    targetPos.current.lerpVectors(startPos, endPos, scrollProgress);

    // Smoothly interpolate the camera position
    state.camera.position.lerp(targetPos.current, 5.0 * dt);
    
    // Always look at the core center
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}
