require('dotenv').config();
const { generateQuestions } = require('./src/utils/aiService');

async function test() {
    console.log("Testing AI Service...");
    console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
    
    try {
        const questions = await generateQuestions({
            subject: "Mathematics",
            topic: "Calculus",
            classLevel: "SSS 3",
            count: 2,
            type: "mcq"
        });
        
        console.log("SUCCESS! Generated Questions:");
        console.log(JSON.stringify(questions, null, 2));
    } catch (error) {
        console.error("AI Service Failed:", error);
    }
}

test();
