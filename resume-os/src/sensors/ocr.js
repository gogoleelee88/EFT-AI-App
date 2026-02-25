// OCR 기능 스텁
// 정책상 전체 화면 지속 OCR 은 금지.
// 이 파일은 "ROI 제한 fallback" 코드 경로만을 위한 자리이며 기본적으로 비활성 상태이다.

/**
 * ROI 기반 OCR을 수행하는 자리를 위한 스텁 함수.
 * 현재는 항상 null을 반환하며, 실제 OCR 라이브러리는 연결하지 않는다.
 * @param {{ x: number, y: number, width: number, height: number }} _roi
 * @returns {null}
 */
function runScreenOcrRoi(_roi) {
  // OCR 비활성: 정책상 전체 화면/지속 OCR 금지.
  // ROI 기반 단발성 OCR이 필요해지면 이 함수 내부에만 제한적으로 구현한다.
  return null;
}

module.exports = {
  runScreenOcrRoi,
};

