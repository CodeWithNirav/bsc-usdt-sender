# Deployment Guide (Render.com)

This guide helps you deploy your Telegram bot for **FREE** on Render.

## 1. Push to GitHub
Ensure your latest code is pushed to your GitHub repository.

## 2. Create Service on Render
1. Log in to [dashboard.render.com](https://dashboard.render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your repository `bsc-usdt-sender` (or whatever you named it).
4. Render will detect the `render.yaml` file.
5. Click **Deploy**.

## 3. Configure Environment Variables
Render will ask for the values of your secrets defined in `render.yaml`. Enter them:

| Variable | Value |
| :--- | :--- |
| `BOT_TOKEN` | Your Telegram Bot Token (from BotFather) |
| `TELEGRAM_USER_ID` | Your Telegram User ID |
| `PRIVATE_KEY` | Your Wallet Private Key (Keep this safe!) |

## 4. Keep It Awake (Critical for Free Tier)
Render's free tier spins down after 15 minutes of inactivity. To prevent this:

1. Copy your Render app URL (e.g., `https://your-bot.onrender.com`).
2. Go to [UptimeRobot](https://uptimerobot.com/) (Free).
3. Create a **New Monitor**:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: My Bot
   - **URL**: Paste your Render URL (it will hit the `/` endpoint).
   - **Monitoring Interval**: 5 minutes.
4. Start the monitor.

**Done!** Your bot will now stay online 24/7 for free.
