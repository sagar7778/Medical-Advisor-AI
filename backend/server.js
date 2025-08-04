require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Groq API
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// 🛡️ Rate Limiting: Max 30 requests per IP per minute
const requests = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();

  if (!requests.has(ip) || now - requests.get(ip).timestamp > RATE_LIMIT_WINDOW) {
    requests.set(ip, { count: 1, timestamp: now });
  } else {
    const entry = requests.get(ip);
    entry.count += 1;
    if (entry.count > MAX_REQUESTS_PER_WINDOW) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
  }
  next();
});

// 🤖 Medical Advisor Endpoint
app.post("/api/medical-advisor", async (req, res) => {
  try {
    const { symptoms, age, existingConditions, language } = req.body;

    if (!symptoms || typeof symptoms !== "string") {
      return res.status(400).json({ error: "symptoms (string) required in body" });
    }

    const isHindi = language === "hindi";

    const prompt = `
You are a responsible AI medical advisor. Based on the following details:

- Age: ${age || "Not provided"}
- Existing Conditions: ${existingConditions || "None"}
- Symptoms: ${symptoms}

Respond in ${isHindi ? "Hindi" : "English"} with:
1. Likely possible causes (in simple terms)
2. Urgency level (Low / Moderate / High) with explanation
3. Recommended next steps (doctor visit, home remedy, etc.)
4. Warning signs that need immediate medical help
5. Common OTC medicines (only names, NO dosage)
6. Disclaimer: This is NOT a substitute for professional medical advice. Consult a licensed physician for proper diagnosis and treatment.
`;

    const completion = await openai.chat.completions.create({
      model: "llama3-70b-8192", // Groq-supported model
      messages: [
        {
          role: "system",
          content: `You are a helpful and responsible medical advisor. Respond in ${isHindi ? "Hindi" : "English"}. Never give dosages or act as a substitute for doctors.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 1000,
    });

    const answer = completion.choices[0]?.message?.content;
    if (!answer) {
      return res.status(500).json({ error: "No response from AI model." });
    }

    res.json({ answer });

  } catch (err) {
    console.error("🔥 Error:", err.message);
    res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

// 🌐 Root route
app.get("/", (req, res) => {
  res.send("🩺 Medical Advisor API running with Groq AI.");
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});