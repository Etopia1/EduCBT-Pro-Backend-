console.log("Listing Available AI Models...");
try {
  require('dotenv').config();
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());

  (async () => {
    // There is no direct listModels on genAI, but we can try to find how the local SDK expects to be used or if it has an admin/list method.
    // Actually, listing models usually requires the Google AI rest API or specialized client.
    // Let's try gemini-2.0-flash-exp which is a newer one.
    const models = ["gemini-2.5-flash", "gemini-2.1-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest"];
    
    for (const m of models) {
      try {
        console.log(`Checking ${m}...`);
        const model = genAI.getGenerativeModel({ model: m });
        const result = await model.generateContent("test");
        if (result) {
            console.log(`>>> SUCCESS: ${m} is available and working.`);
            return;
        }
      } catch (err) {
        console.log(`--- ${m} failed: ${err.message.split('\n')[0]}`);
      }
    }
  })();
} catch (e) {
  console.error(e);
}
