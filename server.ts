import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Pool } from "pg";
import * as z from "zod/v4";

const db = new Pool({
  host: "localhost",
  port: 5432,
  database: "sanjivani_sugar_factory",
  user: "postgres",
  password: process.env.PGPASSWORD,
});

serveStdio(() => {
  const server = new McpServer({
    name: "sanjivani-farmer-server",
    version: "1.0.0",
  });

  server.registerTool(
    "get_farmer_data",
    {
      description:
        "Retrieve all farmer records from the Sanjivani Sugar Factory database.",
      inputSchema: {
        question: z.string().describe("The farmer information being requested"),
      },
    },
    async ({ question }) => {
      try {
        const result = await db.query(`
          SELECT farmer_id, farmer_name, village,
                 sugarcane_tons, amount_paid, payment_pending
          FROM farmers
          ORDER BY farmer_id
        `);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                question,
                farmers: result.rows,
              }),
            },
          ],
        };
      } catch (error) {
        console.error("Database error:", error);
        throw new Error("Unable to retrieve farmer data from PostgreSQL.");
      }
    }
  );

  return server;
});
