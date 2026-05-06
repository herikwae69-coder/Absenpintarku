import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route untuk mengambil lirik
  app.post("/api/lyrics", async (req, res) => {
    try {
      const { title, artist } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Gemini API Key tidak terkonfigurasi di server." });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `Berikan lirik lengkap untuk lagu "${title}" oleh "${artist || 'Artis Tidak Diketahui'}". 
      Hanya berikan liriknya saja tanpa penjelasan tambahan. Jika lirik tidak ditemukan, katakan "Lirik tidak ditemukan".`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      res.json({ lyrics: response.text || 'Lirik tidak tersedia.' });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: "Gagal mengambil lirik dari AI." });
    }
  });

  // Vite middleware untuk development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
