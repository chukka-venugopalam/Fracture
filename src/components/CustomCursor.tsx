"use client";

import React, { useEffect, useState, useRef } from "react";

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  
  const [hoverType, setHoverType] = useState<"view" | "drag" | "back" | "hover" | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const mousePos = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Hide default cursor globally
    document.body.style.cursor = "none";
    const elementsToHide = document.querySelectorAll("button, a, [role='button']");
    elementsToHide.forEach(el => {
      (el as HTMLElement).style.cursor = "none";
    });

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    const handleMouseOver = (e: MouseEvent) => {
      let target = e.target as HTMLElement | null;
      
      // Bubble up to check for data-cursor attributes
      while (target && target !== document.body) {
        const cursorAttr = target.getAttribute("data-cursor");
        if (cursorAttr === "view") {
          setHoverType("view");
          return;
        }
        if (cursorAttr === "drag") {
          setHoverType("drag");
          return;
        }
        if (cursorAttr === "back") {
          setHoverType("back");
          return;
        }
        if (
          target.tagName === "BUTTON" || 
          target.tagName === "A" || 
          target.classList.contains("nav-dot")
        ) {
          setHoverType("hover");
          return;
        }
        target = target.parentElement;
      }
      setHoverType(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("mouseover", handleMouseOver);

    // Smooth animation loop for the outer ring lag
    let animationFrameId: number;
    const updateCursor = () => {
      // Direct placement for core dot
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${mousePos.current.x}px, ${mousePos.current.y}px, 0)`;
      }

      // Eased placement for lagging outer ring
      const ease = 0.16; // Lerp easing constant
      ringPos.current.x += (mousePos.current.x - ringPos.current.x) * ease;
      ringPos.current.y += (mousePos.current.y - ringPos.current.y) * ease;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPos.current.x}px, ${ringPos.current.y}px, 0)`;
      }

      animationFrameId = requestAnimationFrame(updateCursor);
    };

    animationFrameId = requestAnimationFrame(updateCursor);

    return () => {
      document.body.style.cursor = "auto";
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("mouseover", handleMouseOver);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <>
      {/* Central core dot */}
      <div 
        ref={dotRef} 
        className={`custom-cursor-dot ${hoverType ? "active" : ""}`} 
      />

      {/* Lagging outer ring */}
      <div 
        ref={ringRef} 
        className={`custom-cursor-ring type-${hoverType || "default"}`}
      >
        {hoverType === "view" && <span className="cursor-label">VIEW</span>}
        {hoverType === "drag" && <span className="cursor-label">DRAG</span>}
        {hoverType === "back" && <span className="cursor-label">BACK</span>}
      </div>
    </>
  );
}
