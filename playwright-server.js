const { chromium } = require("playwright-core");
const port = parseInt(process.env.PLAYWRIGHT_PORT || "8081", 10);
const wsPath = process.env.PLAYWRIGHT_WS_PATH || "playwright-ws";

async function main() {
    console.log("[PlaywrightServer] Launching browser server on port " + port + "...");
    const browserServer = await chromium.launchServer({
        port,
        wsPath,
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ]
    });

    const wsEndpoint = browserServer.wsEndpoint();
    console.log("[PlaywrightServer] Browser server ready!");
    console.log("[PlaywrightServer] WebSocket endpoint: " + wsEndpoint);
    console.log("[PlaywrightServer] Connect via: ws://localhost:" + port + "/" + wsPath);

    process.on("SIGINT", async () => {
        console.log("[PlaywrightServer] Shutting down...");
        await browserServer.close();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        console.log("[PlaywrightServer] Shutting down...");
        await browserServer.close();
        process.exit(0);
    });
}

main().catch(function(err) {
    console.error("[PlaywrightServer] Failed to start:", err.message);
    process.exit(1);
});
