"use client";

import React, { useState, useEffect, useRef, useMemo, useSyncExternalStore } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import GlassShatterLoader from "./GlassShatterLoader";
import CustomCursor from "./CustomCursor";
import ShatteredCore from "./ShatteredCore";
import AmbientBackground from "./AmbientBackground";
import { soundEngine } from "@/utils/audio";
import * as THREE from "three";

const subscribeReducedMotion = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
};

const getReducedMotionSnapshot = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const getReducedMotionServerSnapshot = () => false;

export default function Showcase() {
  const [progress, setProgress] = useState(0);
  const [loaderState, setLoaderState] = useState<"loading" | "impact" | "shattering" | "completed">("loading");
  const [collisionTriggered, setCollisionTriggered] = useState(false);
  
  // Audio state (muted by default)
  const [isMuted, setIsMuted] = useState(true);

  // Reduced motion support via useSyncExternalStore
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  // Canvas-based pink-white-to-blue gradient texture
  const gradientTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
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
    return texture;
  }, []);

  const [scrollProgress, setScrollProgress] = useState(0);

  // Hook into real asset load progress
  const { progress: loadProgress } = useProgress();

  // Loading Progress Simulation (min 2.0s duration)
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("test") === "true") {
        const timer = setTimeout(() => {
          setLoaderState("completed");
          setProgress(100);
          setCollisionTriggered(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }

    if (loaderState !== "loading") return;

    const minimumDuration = 2000; // 2 seconds minimum duration
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    let animationFrameId: number;

    const updateProgress = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - startTime;
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
    if (loaderState !== "completed") return;

    const handleScroll = () => {
      // Allow visual query override for automated screenshot rendering tests in non-production
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
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
      const p = Math.max(0, Math.min(1.0, scrollTop / scrollRange));
      setScrollProgress(p);
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
  // Mobile mode support state
  const [mobileMode, setMobileMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setMobileMode(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Continuous material hum loops and triggers
  useEffect(() => {
    if (loaderState === "completed" && !isMuted) {
      soundEngine.startMaterialHum();
      soundEngine.updateMaterialHum(scrollProgress);
    } else {
      soundEngine.stopMaterialHum();
    }
  }, [loaderState, isMuted, scrollProgress]);

  const isLoading = loaderState === "loading";
  const isCompleted = loaderState === "completed";

  return (
    <>
      <div 
        className={`showcase-container state-${loaderState}`}
      >
      {/* Custom Cursor Overlay */}
      <CustomCursor />

      {/* 3D R3F Canvas */}
      <div 
        className="canvas-wrapper" 
        data-cursor={isCompleted ? "drag" : undefined}
      >
        <Canvas
          dpr={mobileMode ? 1.2 : [1, 2]}
          camera={{ position: [0, 0, 5], fov: 45 }}
          style={{ width: "100%", height: "100%", display: "block", pointerEvents: "auto" }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#000000"]} />
          <CameraRig scrollProgress={scrollProgress} mobileMode={mobileMode} />
          
          {/* Ambient Lighting & Main Directional Keylights */}
          <ambientLight intensity={0.65} />
          <directionalLight position={[3, 10, 5]} intensity={1.5} />
          {/* Intense point lights representing the glowing core's colors, helping tiles catch specular reflections */}
          <pointLight position={[0, 0, 0]} intensity={3.5} distance={12} color="#00ffff" decay={2.0} />
          <pointLight position={[0, 0, 1.2]} intensity={2.0} distance={8} color="#7700ff" decay={1.5} />

          {/* Drifting ambient pink-blue background */}
          <AmbientBackground scrollProgress={scrollProgress} />

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

          {/* Core Ball */}
          {loaderState === "completed" && (
            <ShatteredCore
              gradientTexture={gradientTexture}
              scrollProgress={scrollProgress}
              reducedMotion={reducedMotion}
              mobileMode={mobileMode}
            />
          )}
        </Canvas>
      </div>

      {/* 2D HTML UI Overlay */}
      <div className="ui-overlay">
        {/* Top Header */}
        {loaderState === "completed" && (
          <header className="header fade-in-element">
          <div className="logo-container">
            <svg width="34" height="34" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-icon-svg">
              <defs>
                <linearGradient id="polyPinkWhite" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f472b6" />
                  <stop offset="50%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
                <linearGradient id="polyBlueCyan" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00c6ff" />
                  <stop offset="100%" stopColor="#ff0844" />
                </linearGradient>
                <linearGradient id="polyFacetDark" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ec4899" stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id="polyFacetLight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.7" />
                </linearGradient>
                <filter id="coreGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              {/* Outer Polyhedron Edge Boundary (Icosahedron Silhouette) */}
              <path d="M20 3 L35 11 L35 29 L20 37 L5 29 L5 11 Z" fill="rgba(15, 23, 42, 0.6)" stroke="url(#polyPinkWhite)" strokeWidth="1.6" filter="url(#coreGlow)" />
              {/* Internal Polyhedron Facets (2D Projection of 3D Crystalline Core) */}
              <polygon points="20,3 35,11 20,16 5,11" fill="url(#polyFacetLight)" opacity="0.65" />
              <polygon points="35,11 35,29 20,20 20,16" fill="url(#polyPinkWhite)" opacity="0.8" />
              <polygon points="35,29 20,37 20,20" fill="url(#polyFacetDark)" opacity="0.85" />
              <polygon points="20,37 5,29 20,20" fill="url(#polyBlueCyan)" opacity="0.75" />
              <polygon points="5,11 20,3 20,16 5,29" fill="url(#polyFacetLight)" opacity="0.5" />
              {/* Center Facet Diamond Interlocking Core */}
              <polygon points="20,10 28,20 20,30 12,20" fill="url(#polyPinkWhite)" opacity="0.9" stroke="#ffffff" strokeWidth="0.8" />
              {/* Refracting Wireframe Facet Lines */}
              <polyline points="20,3 20,37" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="1" strokeDasharray="2 2" />
              <polyline points="5,11 35,29" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.8" />
              <polyline points="35,11 5,29" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.8" />
            </svg>
            <div className="logo-text-group">
              <span className="logo-main">FRACTURE</span>
              <span className="logo-sub">CINEMATIC ORBIT NAVIGATION</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
            <div className="instructions">
              <span>DRAG OR SWIPE</span>
            </div>
            <button 
              className="audio-mute-btn" 
              onClick={toggleMute}
              data-cursor="audio"
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
            >
              <span>SOUND: {isMuted ? "OFF" : "ON"}</span>
            </button>
          </div>
          </header>
        )}

        {/* Loading Overlay Center text */}
        {isLoading && (
          <div className="center-instructions loading-instructions">
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
      </div>
      </div>

      {/* Phase 6B: 6 Typography Content Overlays */}
      {loaderState === "completed" && (
        <>
          {/* Section 1: Faceted Glass */}
          <div 
            className="technique-overlay"
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% - ${scrollProgress * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, (0.08 - scrollProgress) * 12.5)), // fades out fully by 0.08
              transition: "opacity 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), transform 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), background 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96)",
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
            className="technique-overlay"
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.2 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.13) * 14.2, (0.27 - scrollProgress) * 14.2))), // peaks at 0.20, range 0.13-0.27
              transition: "opacity 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), transform 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), background 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96)",
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
            className="technique-overlay"
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.4 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.33) * 14.2, (0.47 - scrollProgress) * 14.2))), // peaks at 0.40, range 0.33-0.47
              transition: "opacity 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), transform 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), background 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96)",
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
            className="technique-overlay"
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.6 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.53) * 14.2, (0.67 - scrollProgress) * 14.2))), // peaks at 0.60, range 0.53-0.67
              transition: "opacity 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), transform 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), background 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96)",
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
            className="technique-overlay"
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(0.8 - scrollProgress) * 60}px))`,
              maxWidth: "400px",
              opacity: Math.max(0, Math.min(1.0, Math.min((scrollProgress - 0.73) * 14.2, (0.87 - scrollProgress) * 14.2))), // peaks at 0.80, range 0.73-0.87
              transition: "opacity 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), transform 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), background 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96)",
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
            className="technique-overlay"
            style={{
              position: "fixed",
              left: "8%",
              top: "50%",
              transform: `translateY(calc(-50% + ${(1.0 - scrollProgress) * 60}px))`,
              maxWidth: "500px",
              opacity: Math.max(0, Math.min(1.0, (scrollProgress - 0.93) * 14.2)), // fades in starting at 0.93
              transition: "opacity 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), transform 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96), background 0.8s cubic-bezier(0.25, 1.2, 0.4, 0.96)",
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
              Built to show what&apos;s possible.
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
function CameraRig({ scrollProgress, mobileMode }: { scrollProgress: number; mobileMode?: boolean }) {
  const targetPos = useRef(new THREE.Vector3(0, 0, 5));
  const mobileModeRef = useRef(mobileMode);
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  
  useEffect(() => {
    mobileModeRef.current = mobileMode;
  }, [mobileMode]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const isMobile = mobileModeRef.current;

    // Camera orbit coordinates (adjusted for mobile screen safety):
    const p0 = new THREE.Vector3(0.0, 0.0, 5.0);
    const p1 = isMobile ? new THREE.Vector3(0.0, 0.5, 4.4) : new THREE.Vector3(2.2, 0.8, 3.8);
    const p2 = isMobile ? new THREE.Vector3(0.0, -0.5, 4.4) : new THREE.Vector3(-2.0, -1.0, 4.0);
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

    // Second-order spring damper physics (overshoot inertia feel matching CSS curves)
    const stiffness = 18.0;
    const damping = 5.2;
    
    // Accel = -stiffness * (current - target) - damping * velocity
    const diff = new THREE.Vector3().subVectors(state.camera.position, targetPos.current);
    const force = diff.multiplyScalar(-stiffness).sub(new THREE.Vector3().copy(velocity.current).multiplyScalar(damping));
    
    velocity.current.addScaledVector(force, dt);
    state.camera.position.addScaledVector(velocity.current, dt);
    
    // Always look at the core center
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}
