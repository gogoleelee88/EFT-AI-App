/**
 * ARHolisticTest_게이밍네이션0128tsx 파일에 .tsx 확장자를 붙여
 * esbuild가 TSX로 인식하도록 이름을 바꿉니다.
 * 사용: node scripts/rename-arholistic-tsx.js
 */
const fs = require("fs");
const path = require("path");

const pagesDir = path.join(__dirname, "..", "src", "pages");
const badName = "ARHolisticTest_게이밍네이션0128tsx";
const goodName = "ARHolisticTest_게이밍네이션0128.tsx";

const badPath = path.join(pagesDir, badName);
const goodPath = path.join(pagesDir, goodName);

if (!fs.existsSync(badPath)) {
  console.log("대상 파일이 없습니다:", badPath);
  if (fs.existsSync(goodPath)) {
    console.log("이미 .tsx 로 이름이 바뀐 파일이 있습니다.");
  }
  process.exit(1);
}

if (fs.existsSync(goodPath)) {
  console.log("이미 존재함:", goodPath);
  process.exit(0);
}

fs.renameSync(badPath, goodPath);
console.log("이름 변경 완료:", badName, "->", goodName);
