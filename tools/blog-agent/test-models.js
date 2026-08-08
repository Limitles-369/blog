import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const pager = await ai.models.list();
  for await (const m of pager) {
    if (m.name.includes('gemini')) console.log(m.name);
  }
}
run();
