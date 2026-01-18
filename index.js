import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import morgan from "morgan";
import "./src/bot.js"; // Start the Telegram Bot

dotenv.config();
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// Basic health check
app.get("/", (req, res) => {
  res.send("🤖 Authora Bot Backend is Running");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});
