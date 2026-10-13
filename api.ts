import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { resolve } from "node:path";

const app = express();
const PORT = 3000;
const projectDir = process.cwd();

app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

const apiKey = process.env.OPENAI_API_KEY;
const dbPassword = process.env.PGPASSWORD;

if (!apiKey) {
  console.error("ERROR: OPENAI_API_KEY is missing.");
  process.exit(1);
}

if (!dbPassword) {
  console.error("ERROR: PGPASSWORD is missing.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

const mcpClient = new Client({
  name: "sanjivani-farmer-api",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    resolve(projectDir, "node_modules/tsx/dist/cli.mjs"),
    resolve(projectDir, "server.ts"),
  ],
  cwd: projectDir,
  env: process.env,
});

let mcpConnected = false;

async function connectMcp(): Promise<void> {
  if (mcpConnected) return;

  await mcpClient.connect(transport);
  mcpConnected = true;

  console.log("Connected to Sanjivani MCP server.");
}

async function getFarmerData(): Promise<string> {
  await connectMcp();

  const result = await mcpClient.callTool({
    name: "get_farmer_data",
    arguments: {
      question: "Retrieve all farmer records",
    },
  });

  if (result.isError) {
    throw new Error("The MCP tool returned an error.");
  }

  const content = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  if (!content) {
    throw new Error("The MCP server returned no farmer data.");
  }

  return content;
}

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Sanjivani API is running",
  });
});

app.get("/api/farmers", async (_req, res) => {
  try {
    const rawData = await getFarmerData();
    const parsed: unknown = JSON.parse(rawData);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "farmers" in parsed &&
      Array.isArray(parsed.farmers)
    ) {
      res.json(parsed.farmers);
      return;
    }

    if (Array.isArray(parsed)) {
      res.json(parsed);
      return;
    }

    throw new Error(
      "Unexpected data format. Check the response from server.ts."
    );
  } catch (error) {
    console.error("GET /api/farmers failed:", error);
    res.status(500).json({
      error: "Unable to retrieve farmer records.",
    });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { question, language = "English" } = req.body ?? {};

    if (
      typeof question !== "string" ||
      question.trim().length === 0 ||
      question.length > 1000
    ) {
      res.status(400).json({
        error: "Enter a question of up to 1000 characters.",
      });
      return;
    }

    if (
      typeof language !== "string" ||
      !["English", "Hindi", "Marathi"].includes(language)
    ) {
      res.status(400).json({
        error: "Choose English, Hindi, or Marathi.",
      });
      return;
    }

    const farmerData = await getFarmerData();

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      instructions:
        `You are a farmer payment assistant for Sanjivani Sugar Factory. ` +
        `Answer in ${language}. Use only the supplied database records. ` +
        "Calculate totals carefully, use Indian rupees, distinguish amount paid " +
        "from payment pending, and do not invent records.",
      input:
        `Question: ${question.trim()}\n\n` +
        `Farmer database records:\n${farmerData}`,
    });

    res.json({
      success: true,
      answer: response.output_text,
    });
  } catch (error) {
    console.error("POST /api/chat failed:", error);
    res.status(500).json({
      error: "Unable to answer. Check the backend terminal.",
    });
  }
});

async function start(): Promise<void> {
  try {
    console.log("Starting Sanjivani API...");

    await connectMcp();

    app.listen(PORT, () => {
      console.log(`Sanjivani API running at http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error("API startup failed:", error);
    process.exitCode = 1;
  }
}

start();