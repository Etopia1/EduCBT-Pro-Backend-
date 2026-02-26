/**
 * AI Service for KICC CBT
 * This service handles AI-powered question generation using Google Gemini.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Utility to clean AI output
function cleanJsonString(str) {
    // Remove markdown code blocks if present
    let cleaned = str.replace(/```json\n?|```/g, '').trim();
    // Sometimes the model adds extra text before or after the JSON array
    const startBracket = cleaned.indexOf('[');
    const endBracket = cleaned.lastIndexOf(']');
    if (startBracket !== -1 && endBracket !== -1) {
        cleaned = cleaned.substring(startBracket, endBracket + 1);
    }
    return cleaned;
}

exports.generateQuestions = async ({ subject, topic, classLevel, count, type = 'mcq' }) => {
    console.log(`[AI SERVICE] Generating ${count} ${type} questions for ${subject} (${topic}) - ${classLevel}`);

    if (!process.env.GEMINI_API_KEY) {
        console.warn("[AI SERVICE] Missing GEMINI_API_KEY. Falling back to mock data.");
        return generateMockQuestions({ subject, topic, classLevel, count, type });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
            You are a senior educational assessment specialized in Nigerian Secondary School curricula (JSS/SSS).
            Task: Generate ${count} ${type} questions for ${subject} on the topic: "${topic}".
            Target Students: ${classLevel}.

            MANDATORY JSON FORMAT:
            Return ONLY a raw JSON array of objects. No markdown, no pre-amble.

            OBJECT SCHEMA:
            {
              "text": "The full question text",
              "type": "${type}",
              "marks": 2,
              "options": ["Option A", "Option B", "Option C", "Option D"], 
              "correctOptions": [0],
              "correctAnswer": ""
            }

            STRICT RULES:
            1. For 'mcq', you MUST provide EXACTLY 4 strings in the "options" array.
            2. For 'mcq', "correctOptions" MUST be an array containing the index (0-3) of the correct string in "options".
            3. For 'true_false', "options" MUST be exactly ["True", "False"].
            4. For 'fib' (fill in the blank), "options" should be an empty array [] and "correctAnswer" MUST be the string answer.
            5. For 'essay', both "options" and "correctOptions" should be empty arrays.
            6. Ensure questions are academically accurate for ${classLevel} Nigerian standards.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const rawText = response.text();
        const text = cleanJsonString(rawText);
        
        try {
            const questions = JSON.parse(text);
            
            // Post-processing to ensure stability
            return questions.map(q => ({
                text: q.text || "Untitled Question",
                type: q.type || type,
                marks: q.marks || 2,
                options: Array.isArray(q.options) ? q.options : (type === 'mcq' ? ["A", "B", "C", "D"] : []),
                correctOptions: Array.isArray(q.correctOptions) ? q.correctOptions : [0],
                correctAnswer: q.correctAnswer || "",
                imageUrl: ""
            }));
        } catch (parseError) {
            console.error("[AI SERVICE] JSON Parse Error. Raw text was:", rawText);
            throw parseError;
        }

    } catch (error) {
        console.error("[AI SERVICE] Error during Gemini generation:", error);
        return generateMockQuestions({ subject, topic, classLevel, count, type });
    }
};

function generateMockQuestions({ subject, topic, classLevel, count, type }) {
    const mockQuestions = [];
    for (let i = 1; i <= count; i++) {
        if (type === 'mcq') {
            mockQuestions.push({
                text: `[STABILITY MOCK] Which of these relates to ${topic} in ${subject}?`,
                type: 'mcq',
                options: ['Option Segment Alpha', 'Option Segment Beta', 'Option Segment Gamma', 'Option Segment Delta'],
                correctOptions: [0],
                marks: 2,
                correctAnswer: "",
                imageUrl: ""
            });
        } else if (type === 'true_false') {
            mockQuestions.push({
                text: `[STABILITY MOCK] ${topic} is considered a core pillar of ${subject}.`,
                type: 'true_false',
                options: ['True', 'False'],
                correctOptions: [0],
                marks: 2,
                correctAnswer: "",
                imageUrl: ""
            });
        } else if (type === 'fib') {
            mockQuestions.push({
                text: `[STABILITY MOCK] The fundamental principle of ${topic} is known as __________.`,
                type: 'fib',
                options: [],
                correctOptions: [],
                correctAnswer: 'the standard',
                marks: 2,
                imageUrl: ""
            });
        } else {
            mockQuestions.push({
                text: `[STABILITY MOCK] Provide a comprehensive analysis of ${topic} within the ${subject} curriculum.`,
                type: 'essay',
                options: [],
                correctOptions: [],
                marks: 5,
                correctAnswer: "",
                imageUrl: ""
            });
        }
    }
    return mockQuestions;
}
