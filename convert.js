const fs = require('fs');

const categoryScales = {
  '직장생활': ['리더십', '협업성', '적응력', '업무지향성', '관계지향성'],
  '인간관계': ['외향성', '공감능력', '갈등해결', '사교성', '협력성'],  
  '감정조절': ['정서안정성', '감정표현', '자기조절', '회복력', '감정인식'],
  '스트레스갈등': ['문제해결', '회복탄력성', '스트레스내성', '적응력', '인내력'],
  '개인가치관': ['성취지향', '관계지향', '자율성', '안정추구', '성장지향'],
  '자기인식': ['자기인식', '성찰능력', '정체성', '자기효능감', '자기수용']
};

function generateScores(category, optionIndex) {
  const scales = categoryScales[category] || ['기본척도1', '기본척도2', '기본척도3', '기본척도4', '기본척도5'];
  const scores = {};
  
  // 각 선택지별 점수 패턴
  const patterns = [
    [4, 5, 4, 5, 4], // A - 적극적
    [4, 4, 5, 4, 4], // B - 협력적  
    [3, 3, 3, 3, 3], // C - 중간
    [5, 4, 3, 4, 5], // D - 관계중심
    [2, 3, 2, 2, 3]  // E - 소극적
  ];
  
  const pattern = patterns[optionIndex] || [3,3,3,3,3];
  
  scales.forEach((scale, i) => {
    scores[scale] = pattern[i] || 3;
  });
  
  return scores;
}

try {
  console.log('📖 200문항.md 파일 읽는 중...');
  
  const mdContent = fs.readFileSync('200문항.md', 'utf8');
  const lines = mdContent.split('\n').filter(line => line.trim());
  
  console.log('📝 총 라인 수:', lines.length);
  
  const questions = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 8) continue;
    
    const [numCol, category, question, optA, optB, optC, optD, optE] = parts.map(p => p.trim());
    
    // 번호 추출
    const match = numCol.match(/(\d+)/);
    if (!match || !question || !optA) continue;
    
    const id = parseInt(match[1]);
    
    // 선택지가 모두 있는지 확인
    if (!optB || !optC || !optD || !optE) {
      console.log(`⚠️  ${id}번 문항 선택지 부족:`, {optA, optB, optC, optD, optE});
      continue;
    }
    
    questions.push({
      id,
      category,
      question,
      options: [
        { id: 'A', text: optA, scores: generateScores(category, 0) },
        { id: 'B', text: optB, scores: generateScores(category, 1) },
        { id: 'C', text: optC, scores: generateScores(category, 2) },
        { id: 'D', text: optD, scores: generateScores(category, 3) },
        { id: 'E', text: optE, scores: generateScores(category, 4) }
      ]
    });
  }

  console.log('✨ 파싱된 문항 수:', questions.length);

  // JSON 데이터 구조 생성
  const jsonData = {
    questionnaire: {
      title: '200문항 성격 및 심리 특성 검사',
      description: '직장생활, 인간관계, 감정조절, 스트레스 대처, 성격 특성, 애착 스타일, 회복탄력성, 가치관 체계를 측정하는 종합 심리 검사',
      version: '1.0',
      totalQuestions: questions.length,
      categories: {
        '직장생활': {
          description: '업무 환경에서의 적응력, 리더십, 협업 능력, 스트레스 관리',
          scales: categoryScales['직장생활']
        },
        '인간관계': {
          description: '대인관계 패턴, 소통 방식, 갈등 해결, 사회적 기술', 
          scales: categoryScales['인간관계']
        },
        '감정조절': {
          description: '감정 인식, 표현, 조절 능력, 정서적 안정성',
          scales: categoryScales['감정조절']
        },
        '스트레스갈등': {
          description: '스트레스 대처 방식, 문제 해결 능력, 회복탄력성',
          scales: categoryScales['스트레스갈등']
        },
        '개인가치관': {
          description: '인생 철학, 가치 체계, 목표 지향성, 의미 추구',
          scales: categoryScales['개인가치관']
        },
        '자기인식': {
          description: '자기 이해, 성찰 능력, 정체성 확립',
          scales: categoryScales['자기인식']
        }
      },
      scoringSystem: {
        scaleRange: [1, 5],
        description: '각 선택지는 해당 척도에 1-5점의 가중치를 가짐'
      }
    },
    questions: questions.sort((a,b) => a.id - b.id)
  };

  // JSON 파일로 저장
  fs.writeFileSync('./assets/data/personality-quest-200.json', JSON.stringify(jsonData, null, 2));

  console.log('✅ 변환 완료! 총', questions.length, '문항이 JSON으로 변환되었습니다.');
  console.log('📁 저장 위치: ./assets/data/personality-quest-200.json');

  // 카테고리별 개수 확인
  const counts = {};
  questions.forEach(q => counts[q.category] = (counts[q.category] || 0) + 1);
  
  console.log('\n📊 카테고리별 문항 수:');
  Object.entries(counts).forEach(([cat, cnt]) => {
    console.log(`  - ${cat}: ${cnt}문항`);
  });

  // 문항 번호 연속성 확인
  const ids = questions.map(q => q.id).sort((a,b) => a-b);
  const missing = [];
  for (let i = 1; i <= 200; i++) {
    if (!ids.includes(i)) missing.push(i);
  }
  
  if (missing.length > 0) {
    console.log('\n⚠️  누락된 문항 번호:', missing);
  } else {
    console.log('\n✅ 모든 1-200번 문항이 정상적으로 포함되었습니다!');
  }

} catch (error) {
  console.error('❌ 변환 중 오류:', error.message);
  console.error(error.stack);
}