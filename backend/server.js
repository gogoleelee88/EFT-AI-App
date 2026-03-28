// C:\Users\lco20\EFT-AI-App\backend\server.js 파일 내용

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import OpenAI from 'openai'; // 🌟 V4 문법으로 수정됨

// 환경 변수 로드
dotenv.config();

// 몽고DB 연결
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors()); // CORS 허용
app.use(express.json()); // JSON 요청 본문 파싱

// 🌟 OpenAI 설정 (V4 형식으로 변경)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


// --- API 경로: EFT 스크립트 요청 처리 ---
app.post('/api/chat', async (req, res) => {
    const { strict_intake } = req.body;
    
    // 이 임시 더미 코드를 통해 프론트엔드가 제대로 통신하는지 테스트할 수 있습니다.
    if (!strict_intake) {
        return res.status(400).json({ error: "Intake data is missing." });
    }

    try {
        // 실제 AI 로직은 여기에 구현되어야 합니다.
        // 임시 더미 응답 (이게 성공하면 프론트엔드에서 스크립트가 뜹니다)
        const dummyScript = {
            setup_phrase: `비록 이 심한 ${strict_intake.target_emotion}이(가) 있지만, 나는 나를 깊이, 그리고 전적으로 받아들입니다.`,
            focus_words: [
                "심한 통증", 
                strict_intake.intensity_label, 
                strict_intake.target_emotion
            ],
            target_emotion: strict_intake.target_emotion,
            intensity_label: strict_intake.intensity_label,
            round_phrases: [
                `이 ${strict_intake.target_emotion} 에너지`,
                `${strict_intake.intensity_label}의 통증`,
                `나는 안전하다`
            ]
        };

        console.log(`[EFT] 스크립트 생성 시뮬레이션 완료: ${strict_intake.target_emotion}`);
        
        // 프론트엔드가 요구하는 형식으로 응답
        res.json({ eft_script: dummyScript }); 

    } catch (error) {
        console.error('API 처리 중 오류 발생:', error);
        res.status(500).json({ error: 'EFT 스크립트 생성에 실패했습니다. (AI 서버 오류)' });
    }
});


// --- 서버 시작 ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
