
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const question =
  "How many tons of sugarcane have all farmers supplied to Sanjivani Sugar Factory in total?";
const client = new Client({
  name: "sanjivani-farmer-client",
  version: "1.0.0",
});

const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", "server.ts"],
  env: {
    ...process.env,
    PGPASSWORD: process.env.PGPASSWORD!,
  },
});

async function main() {
  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    console.log("Available MCP tools:", tools.map((t) => t.name));

    const toolResult = await client.callTool({
      name: "get_farmer_data",
      arguments: { question },
    });

    const farmerData = toolResult.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      instructions:
        "You are a farmer payment assistant for Sanjivani Sugar Factory. Answer using only the supplied database records. Calculate totals accurately, use Indian rupees, and clearly distinguish the amount paid from the payment pending. If the data does not contain an answer, say so.",
      input: `Question: ${question}\n\nFarmer database records:\n${farmerData}`,
    });

    console.log("\nQuestion:", question);
    console.log("\nAI Answer:\n", response.output_text);
  } catch (error) {
    console.error("Application error:", error);
  } finally {
    await client.close();
  }
}

main();