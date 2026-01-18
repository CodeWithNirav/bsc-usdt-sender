# Deployment Guide (Railway)

This guide helps you deploy your Telegram bot on **Railway**.

## 1. Push to GitHub
Ensure you have the latest code on GitHub (I will handle this).

## 2. Deploy on Railway
1. Go to [Railway Dashboard](https://railway.app/).
2. Click **+ New Project** -> **Deploy from GitHub repo**.
3. Select your repository: `bsc-usdt-sender`.
4. Click **Deploy Now**.

## 3. Set Environment Variables
The bot will fail to start initially because it needs your secrets.
1. Click on your new project card in Railway.
2. Go to the **Variables** tab.
3. Add the following variables:

| Variable | Value |
| :--- | :--- |
| `BOT_TOKEN` | Your Telegram Bot Token |
| `TELEGRAM_USER_ID` | Your Telegram User ID |
| `PRIVATE_KEY` | Your Wallet Private Key |
| `BSCSCAN_API_KEY` | (Optional) For fetching gas prices |

4. Railway will automatically redeploy when you save the variables.

**Done!** Your bot is now live.
