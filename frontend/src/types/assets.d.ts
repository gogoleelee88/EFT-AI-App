declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.css';

// CSS 모듈 타입
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

// SVG React 컴포넌트 타입
declare module '*.svg?react' {
  import * as React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;
  export default ReactComponent;
}

// 미디어/문서 타입
declare module '*.mp3' {
  const src: string;
  export default src;
}
declare module '*.mp4' {
  const src: string;
  export default src;
}
declare module '*.wav' {
  const src: string;
  export default src;
}
declare module '*.woff' {
  const src: string;
  export default src;
}
declare module '*.woff2' {
  const src: string;
  export default src;
}