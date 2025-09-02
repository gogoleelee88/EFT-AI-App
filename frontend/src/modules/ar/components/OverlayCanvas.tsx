import React, { useEffect, useRef } from "react";

export default function OverlayCanvas({ draw, width, height }: { 
  draw: (ctx:CanvasRenderingContext2D)=>void; 
  width:number; 
  height:number; 
}){
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(()=>{ 
    const ctx = ref.current!.getContext("2d")!; 
    draw(ctx); 
  },[draw]);
  return <canvas ref={ref} width={width} height={height} className="absolute inset-0 pointer-events-none"/>;
}