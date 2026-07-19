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
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollRange = scrollHeight - clientHeight;
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
      {/* Phase 6B: 6 Typography Content Overlays */}
      {loaderState === "completed" && (
        <>
          {/* Section 1: Faceted Glass */}
          <div 
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% - ${scrollProgress * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, (0.08 - scrollProgress) * 12.5)), // fades out fully by 0.08
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
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
              FACETED GLASS
            </span>
            <h1 style={{ 
              fontFamily: "var(--font-serif)", 
              fontSize: "2.5rem", 
              fontWeight: 300, 
              lineHeight: "1.15",
              marginBottom: "1.0rem",
              letterSpacing: "0.02em"
            }}>
              Luxury, Editorial, & Jewelry
            </h1>
            <p style={{ 
              fontSize: "0.85rem", 
              lineHeight: "1.65", 
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: "0.04em"
            }}>
              A delicate, refracting crystalline skin that bounces light across sharp, geometric vertices. Suited to premium editorial layouts and luxury brands.
            </p>
          </div>

          {/* Section 2: Liquid Metal */}
          <div 
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.2 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.13) * 14.2, (0.27 - scrollProgress) * 14.2))), // peaks at 0.20, range 0.13-0.27
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
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
              LIQUID METAL
            </span>
            <h1 style={{ 
              fontFamily: "var(--font-serif)", 
              fontSize: "2.5rem", 
              fontWeight: 300, 
              lineHeight: "1.15",
              marginBottom: "1.0rem",
              letterSpacing: "0.02em"
            }}>
              Tech Launches & Automotive
            </h1>
            <p style={{ 
              fontSize: "0.85rem", 
              lineHeight: "1.65", 
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: "0.04em"
            }}>
              Organic waves deforming rigid edges. A highly reflective mercury-like surface reflecting the currents of its void. Suited to bold, technical product announcements.
            </p>
          </div>

          {/* Section 3: Crystal Growth */}
          <div 
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.4 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.33) * 14.2, (0.47 - scrollProgress) * 14.2))), // peaks at 0.40, range 0.33-0.47
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
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
              CRYSTAL GROWTH
            </span>
            <h1 style={{ 
              fontFamily: "var(--font-serif)", 
              fontSize: "2.5rem", 
              fontWeight: 300, 
              lineHeight: "1.15",
              marginBottom: "1.0rem",
              letterSpacing: "0.02em"
            }}>
              Beauty, Skincare, & Premium Retail
            </h1>
            <p style={{ 
              fontSize: "0.85rem", 
              lineHeight: "1.65", 
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: "0.04em"
            }}>
              Sharp prismatic ridges protruding outwards. An iridescent color-shifting quartz structure that glows from within. Suited to boutique retail and cosmetics.
            </p>
          </div>

          {/* Section 4: Dark Obsidian */}
          <div 
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.6 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.53) * 14.2, (0.67 - scrollProgress) * 14.2))), // peaks at 0.60, range 0.53-0.67
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
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
              DARK OBSIDIAN
            </span>
            <h1 style={{ 
              fontFamily: "var(--font-serif)", 
              fontSize: "2.5rem", 
              fontWeight: 300, 
              lineHeight: "1.15",
              marginBottom: "1.0rem",
              letterSpacing: "0.02em"
            }}>
              Music, Entertainment, & Nightlife
            </h1>
            <span style={{ 
              fontSize: "0.80rem",
              color: "rgba(255, 255, 255, 0.5)",
              display: "block",
              marginBottom: "0.8rem",
              letterSpacing: "0.02em"
            }}>
              — suited to music, entertainment, and nightlife brands.
            </span>
            <p style={{ 
              fontSize: "0.85rem", 
              lineHeight: "1.65", 
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: "0.04em"
            }}>
              A deep, glossy obsidian shell reflecting sharp, high-contrast rim highlights. Suited to immersive nightlife and music platforms.
            </p>
          </div>

          {/* Section 5: Pure Light */}
          <div 
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.8 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.73) * 14.2, (0.87 - scrollProgress) * 14.2))), // peaks at 0.80, range 0.73-0.87
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
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
              PURE LIGHT
            </span>
            <h1 style={{ 
              fontFamily: "var(--font-serif)", 
              fontSize: "2.5rem", 
              fontWeight: 300, 
              lineHeight: "1.15",
              marginBottom: "1.0rem",
              letterSpacing: "0.02em"
            }}>
              Wellness, Meditation, & Spiritual
            </h1>
            <span style={{ 
              fontSize: "0.80rem",
              color: "rgba(255, 255, 255, 0.5)",
              display: "block",
              marginBottom: "0.8rem",
              letterSpacing: "0.02em"
            }}>
              — suited to wellness, meditation, and spiritual brands.
            </span>
            <p style={{ 
              fontSize: "0.85rem", 
              lineHeight: "1.65", 
              color: "rgba(255, 255, 255, 0.45)",
              letterSpacing: "0.04em"
            }}>
              A luminous, pulsing, semi-transparent plasma structure at peak brightness. Suited to high-end wellness and spiritual platforms.
            </p>
          </div>

          {/* Section 6: Closing Statement */}
          <div 
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(1.0 - scrollProgress) * 60}px))`,
              maxWidth: "500px",
              opacity: Math.max(0, Math.min(1.0, (scrollProgress - 0.93) * 14.2)), // fades in starting at 0.93
              transition: "opacity 0.3s ease-out, transform 0.3s ease-out",
              color: "#f5f5f7",
              pointerEvents: "none",
              zIndex: 3,
              textShadow: "0 2px 10px rgba(0,0,0,0.5)"
            }}
          >
            <h1 style={{ 
              fontFamily: "var(--font-serif)", 
              fontSize: "3.2rem", 
              fontWeight: 300, 
              lineHeight: "1.1",
              marginBottom: "1.2rem",
              letterSpacing: "0.02em"
            }}>
              One object.<br />Five surfaces.
            </h1>
            <p style={{ 
              fontSize: "1.15rem", 
              lineHeight: "1.65", 
              color: "#00e5ff",
              letterSpacing: "0.06em",
              fontWeight: 300
            }}>
              Built to show what's possible.
            </p>
          </div>
        </>
      )}
      {loaderState === "completed" && (
        <div 
          className="scroll-spacer" 
          style={{ height: "500vh", pointerEvents: "none" }} 
        />
      )}
    </>
  );
}

// Phase 6B Scroll-Driven Camera Choreography Rig
function CameraRig({ scrollProgress }: { scrollProgress: number }) {
  const targetPos = useRef(new THREE.Vector3(0, 0, 5));

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);

    // Camera orbit coordinates:
    // State 0 (Glass): [0.0, 0.0, 5.0]
    // State 1 (Liquid Metal): [2.2, 0.8, 3.8]
    // State 2 (Crystal Growth): [-2.0, -1.0, 4.0]
    // State 3 (Dark Obsidian): [0.0, 2.5, 4.0]
    // State 4 (Pure Light): [0.0, 0.0, 3.2]
    // Closing: [0.0, 0.0, 5.5]
    const p0 = new THREE.Vector3(0.0, 0.0, 5.0);
    const p1 = new THREE.Vector3(2.2, 0.8, 3.8);
    const p2 = new THREE.Vector3(-2.0, -1.0, 4.0);
    const p3 = new THREE.Vector3(0.0, 2.5, 4.0);
    const p4 = new THREE.Vector3(0.0, 0.0, 3.2);
    const p5 = new THREE.Vector3(0.0, 0.0, 5.5);

    if (scrollProgress <= 0.2) {
      const factor = scrollProgress / 0.2;
      targetPos.current.lerpVectors(p0, p1, factor);
    } else if (scrollProgress <= 0.4) {
      const factor = (scrollProgress - 0.2) / 0.2;
      targetPos.current.lerpVectors(p1, p2, factor);
    } else if (scrollProgress <= 0.6) {
      const factor = (scrollProgress - 0.4) / 0.2;
      targetPos.current.lerpVectors(p2, p3, factor);
    } else if (scrollProgress <= 0.8) {
      const factor = (scrollProgress - 0.6) / 0.2;
      targetPos.current.lerpVectors(p3, p4, factor);
    } else {
      const factor = (scrollProgress - 0.8) / 0.2;
      targetPos.current.lerpVectors(p4, p5, factor);
    }

    // Smoothly interpolate the camera position
    state.camera.position.lerp(targetPos.current, 5.0 * dt);
    
    // Always look at the core center
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}
