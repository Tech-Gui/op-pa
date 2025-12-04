const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const OpenAI = require("openai");
const pdfParseModule = require("pdf-parse");

const router = express.Router();
const BOOK_NAME = "Science Engineering and Technology edition 3";
const DATA_DIR = path.join(__dirname, "..", "data");
const BOOK_DATA_PATH = path.join(
  DATA_DIR,
  "science-engineering-technology-ed3.json"
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const ensureAudioDirectory = () => {
  const audioDir = path.join("uploads", "audio");
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
  return audioDir;
};

ensureAudioDirectory();

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".oga",
  ".ogg",
  ".wav",
  ".webm",
]);

const audioStorage = multer.diskStorage({
  destination: path.join("uploads", "audio"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".webm";
    const safeName = (file.originalname || "audio")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 50);
    cb(null, `${Date.now()}-${safeName}${ext}`);
  },
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!SUPPORTED_AUDIO_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          `Unsupported audio format. Allowed: ${Array.from(
            SUPPORTED_AUDIO_EXTENSIONS
          ).join(", ")}`
        )
      );
    }
    cb(null, true);
  },
});

const loadBookSections = () => {
  try {
    const raw = fs.readFileSync(BOOK_DATA_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load book data:", err.message);
    return [];
  }
};

const buildSectionText = (section) =>
  [
    section.title,
    section.section,
    section.summary,
    `Skills: ${section.skills?.join(", ") || ""}`,
    `Careers: ${section.careerExamples?.join(", ") || ""}`,
    `Activities: ${section.practicalActivities?.join(", ") || ""}`,
  ]
    .filter(Boolean)
    .join(". ");

const tokenize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const keywordScore = (sectionText, queryTokens) => {
  const sectionTokens = new Set(tokenize(sectionText));
  if (queryTokens.length === 0) return 0;
  let overlap = 0;
  queryTokens.forEach((token) => {
    if (sectionTokens.has(token)) {
      overlap += 1;
    }
  });
  return overlap / queryTokens.length;
};

const normalize = (vector) => {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
};

const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
};

let cachedSections = null;
let cachedPdfChunks = null;

const findPdfPath = () => {
  if (!fs.existsSync(DATA_DIR)) return null;
  const files = fs.readdirSync(DATA_DIR);
  const pdfCandidates = files.filter((file) =>
    file.toLowerCase().endsWith(".pdf")
  );

  if (pdfCandidates.length === 0) return null;

  const preferred = pdfCandidates.find((name) =>
    name.toLowerCase().includes("science")
  );

  return path.join(DATA_DIR, preferred || pdfCandidates[0]);
};

const chunkText = (text, maxChars = 1200) => {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  paragraphs.forEach((p) => {
    if ((current + " " + p).trim().length <= maxChars) {
      current = (current + " " + p).trim();
    } else {
      if (current) chunks.push(current);
      current = p;
    }
  });

  if (current) chunks.push(current);
  return chunks;
};

const loadPdfChunks = async () => {
  if (cachedPdfChunks) return cachedPdfChunks;

  const pdfPath = findPdfPath();
  if (!pdfPath) {
    cachedPdfChunks = [];
    return cachedPdfChunks;
  }

  try {
    const buffer = fs.readFileSync(pdfPath);
    let rawText = "";

    if (pdfParseModule.PDFParse) {
      // pdf-parse v2 exposes a class API
      const parser = new pdfParseModule.PDFParse({ data: buffer });
      const parsed = await parser.getText();
      rawText = parsed.text || "";
      if (typeof parser.destroy === "function") {
        await parser.destroy();
      }
    } else if (typeof pdfParseModule === "function") {
      const parsed = await pdfParseModule(buffer);
      rawText = parsed.text || "";
    } else if (pdfParseModule.default && typeof pdfParseModule.default === "function") {
      const parsed = await pdfParseModule.default(buffer);
      rawText = parsed.text || "";
    }

    const chunks = chunkText(rawText);

    cachedPdfChunks = chunks.map((content, idx) => ({
      id: `pdf-${idx + 1}`,
      title: `PDF Segment ${idx + 1}`,
      section: "PDF",
      summary: content,
      sectionText: content,
    }));
  } catch (err) {
    console.error("Failed to parse PDF for RAG:", err.message);
    cachedPdfChunks = [];
  }

  return cachedPdfChunks;
};

const ensureSectionEmbeddings = async () => {
  if (cachedSections) return cachedSections;
  const pdfChunks = await loadPdfChunks();
  const sections = [...loadBookSections(), ...pdfChunks];

  if (!openai) {
    cachedSections = sections.map((section) => ({
      ...section,
      sectionText: buildSectionText(section),
    }));
    return cachedSections;
  }

  try {
    const embeddingsResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: sections.map((section) => buildSectionText(section)),
    });

    cachedSections = sections.map((section, idx) => ({
      ...section,
      embedding: normalize(embeddingsResponse.data[idx].embedding),
      sectionText: buildSectionText(section),
    }));
  } catch (err) {
    console.error("Embedding creation failed, falling back to keywords:", err);
    cachedSections = sections.map((section) => ({
      ...section,
      sectionText: buildSectionText(section),
    }));
  }

  return cachedSections;
};

const embedQuery = async (query) => {
  if (!openai) return null;
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    return normalize(response.data[0].embedding);
  } catch (err) {
    console.error("Query embedding failed:", err);
    return null;
  }
};

const retrieveContext = async (query, maxSections = 3) => {
  const sections = await ensureSectionEmbeddings();
  if (sections.length === 0) return [];

  const queryTokens = tokenize(query);
  const queryEmbedding = await embedQuery(query);

  const scored = sections
    .map((section) => {
      if (section.embedding && queryEmbedding) {
        return {
          score: cosineSimilarity(section.embedding, queryEmbedding),
          section,
        };
      }

      return {
        score: keywordScore(section.sectionText, queryTokens),
        section,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSections);

  return scored;
};

const transcribeAudio = async (filePath) => {
  if (!openai) {
    throw new Error("OpenAI API key is required for transcription");
  }

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "en",
  });

  return transcription.text;
};

const generateSpeech = async (text) => {
  if (!openai) return null;
  const speechResponse = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "alloy",
    input: text,
  });

  const buffer = Buffer.from(await speechResponse.arrayBuffer());
  return buffer.toString("base64");
};

const parseStructuredAnswer = (content) => {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error("Failed to parse structured answer:", err);
  }
  return null;
};

const extractAnswerField = (raw) => {
  if (!raw) return "";
  if (typeof raw === "object" && raw.answer) return raw.answer;
  if (typeof raw !== "string") return String(raw);

  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && parsed.answer) {
      return parsed.answer;
    }
  } catch (e) {
    // ignore
  }

  const match = trimmed.match(/"answer"\s*:\s*"([\s\S]*?)"\s*(,|\})/);
  if (match) {
    return match[1].replace(/\\"/g, '"');
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim();
  }

  return raw;
};

router.post("/careers", uploadAudio.single("audio"), async (req, res) => {
  let userQuery = (req.body.query || "").trim();
  const wantsVoice =
    req.body.voiceOutput === "true" || req.body.voiceOutput === true;
  const maxSections = parseInt(req.body.maxSections, 10) || 3;

  try {
    if (req.file && !userQuery) {
      userQuery = await transcribeAudio(req.file.path);
    }

    if (!userQuery) {
      return res.status(400).json({
        success: false,
        error: "A text query or audio file is required",
      });
    }

    if (!openai) {
      return res.status(503).json({
        success: false,
        error: "OpenAI API key missing",
        message:
          "Set OPENAI_API_KEY to enable Science Engineering and Technology RAG answers.",
      });
    }

    const retrieved = await retrieveContext(userQuery, maxSections);
    const contextBlock = retrieved
      .map(
        ({ section }, idx) =>
          `Source ${idx + 1} (${section.id} - ${section.title}): ${
            section.summary
          } Skills: ${section.skills?.join(", ") || "n/a"}. Careers: ${
            section.careerExamples?.join(", ") || "n/a"
          }. Activities: ${section.practicalActivities?.join("; ") || "n/a"}.`
      )
      .join("\n---\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `You are a careers guide for ${BOOK_NAME}. Answer using only the provided context. Provide concise, encouraging guidance grounded in the book.`,
        },
          {
            role: "user",
            content: `Context:\n${contextBlock}\n\nLearner question: ${userQuery}\n\nRules:\n- Use ONLY the context above. If the context lacks the requested details (e.g., specific contacts), clearly state that and give a concise fallback action (visit official site, call admissions, etc.).\n- Do not return empty or generic answers; make them specific to the context provided.\n- Keep answers concise and actionable.\n\nRespond in JSON:\n{\n  "answer": "grounded guidance that references the context explicitly and includes requested details when present; if unavailable, say so and suggest the right fallback action",\n  "bookName": "${BOOK_NAME}",\n  "sources": [{"id": "string", "title": "string", "whyRelevant": "string"}],\n  "voiceScript": "short script that can be read aloud",\n  "nextSteps": ["step 1", "step 2"]\n}`,
          },
        ],
      });

      const modelContent = completion.choices[0].message.content || "";
      const structured = parseStructuredAnswer(modelContent);
      let answerText =
        extractAnswerField(structured?.answer || modelContent) ||
        "No answer generated.";

      // If the model answered too vaguely, provide a clear fallback.
      const cleaned = (answerText || "").trim();
      if (!cleaned || cleaned.length < 24) {
        answerText =
          "No specific contact details were found in the provided context. Please check the official university site or admissions office for current contact information.";
      }

      const voiceScript = structured?.voiceScript || answerText;
    let speechBase64 = null;

    if (wantsVoice) {
      speechBase64 = await generateSpeech(voiceScript);
    }

    res.json({
      success: true,
      query: userQuery,
      answer: answerText,
      voiceScript,
      sources:
        structured?.sources ||
        retrieved.map(({ section }) => ({
          id: section.id,
          title: section.title,
          whyRelevant: section.summary,
        })),
      nextSteps: structured?.nextSteps || [],
      audio:
        wantsVoice && speechBase64
          ? { format: "mp3", base64: speechBase64 }
          : null,
      rawModelResponse: modelContent,
    });
  } catch (error) {
    console.error("SET careers RAG error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete RAG request",
      message: error.message,
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

module.exports = router;
