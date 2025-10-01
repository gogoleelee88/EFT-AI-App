/**
 * SVG를 다양한 크기의 PNG 아이콘으로 변환하는 스크립트
 * PWA manifest.json용 아이콘 생성
 */
import fs from 'fs';
import path from 'path';

// 🎨 간단한 SVG → Canvas → PNG 변환
const svgToPng = (svgContent, size) => {
  // SVG content를 data URL로 변환
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;

  return `
  <!-- 실제로는 sharp나 puppeteer를 사용해야 하지만, 간단한 대안으로 HTML5 Canvas 사용 -->
  <canvas id="canvas-${size}" width="${size}" height="${size}"></canvas>
  <script>
    const canvas = document.getElementById('canvas-${size}');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = function() {
      ctx.drawImage(img, 0, 0, ${size}, ${size});
      // PNG로 다운로드
      const link = document.createElement('a');
      link.download = 'icon-${size}x${size}.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = '${svgDataUrl}';
  </script>
  `;
};

// 🌟 대안: 간단한 컬러 PNG 아이콘 생성 (SVG 대신)
const createSimplePngIcon = (size) => {
  // Base64로 인코딩된 간단한 PNG 아이콘 생성
  // 실제로는 이 부분에서 proper PNG 생성 라이브러리를 사용해야 함

  console.log(`Creating ${size}x${size} icon...`);

  // 🎯 간단한 EFT 로고 색상으로 PNG 생성 (placeholder)
  const canvas = `
<!DOCTYPE html>
<html>
<head><title>Icon Generator ${size}x${size}</title></head>
<body style="margin: 0; padding: 20px; background: #f0f0f0;">
  <h3>Generate ${size}x${size} PWA Icon</h3>
  <canvas id="canvas" width="${size}" height="${size}" style="border: 1px solid #ccc;"></canvas>
  <br><br>
  <button onclick="downloadIcon()">Download icon-${size}x${size}.png</button>

  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // 🌿 EFT 앱 테마 색상으로 아이콘 생성
    const gradient = ctx.createLinearGradient(0, 0, ${size}, ${size});
    gradient.addColorStop(0, '#4F46E5');  // theme-color
    gradient.addColorStop(1, '#6366F1');  // background-color

    // 배경 그라디언트
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, ${size}, ${size});

    // 중앙에 하얀색 원
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(${size}/2, ${size}/2, ${size}/3, 0, 2 * Math.PI);
    ctx.fill();

    // 🌿 EFT 로고 (잎사귀 모양)
    ctx.fillStyle = '#4F46E5';
    ctx.font = 'bold ${Math.floor(size * 0.4)}px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌿', ${size}/2, ${size}/2);

    function downloadIcon() {
      const link = document.createElement('a');
      link.download = 'icon-${size}x${size}.png';
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('Downloaded icon-${size}x${size}.png');
    }
  </script>
</body>
</html>`;

  return canvas;
};

// 📱 필요한 PWA 아이콘 크기들
const iconSizes = [192, 256, 384, 512];

console.log('🎨 PWA 아이콘 생성기');
console.log('==================');

iconSizes.forEach(size => {
  const html = createSimplePngIcon(size);

  // HTML 파일로 저장해서 브라우저에서 수동 다운로드 가능하게 함
  const filename = `generate-icon-${size}.html`;
  fs.writeFileSync(filename, html);
  console.log(`✅ Generated ${filename} - Open in browser to download icon-${size}x${size}.png`);
});

console.log('\\n📋 다음 단계:');
console.log('1. 각 HTML 파일을 브라우저에서 열기');
console.log('2. "Download" 버튼 클릭해서 PNG 파일 다운로드');
console.log('3. 다운로드한 PNG 파일들을 public/icons/ 폴더로 이동');
console.log('4. manifest.json 업데이트');