import { chromium as baseChromium } from "playwright";
import { addExtra } from "playwright-extra";
import { Browser, BrowserContext, Page } from "playwright-core";
import { BrowserServicePort } from "@/domain/ports/BrowserServicePort";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

const chromium = addExtra(baseChromium);

export class RemotePlaywrightAdapter implements BrowserServicePort {
    private readonly wsEndpoint: string;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    private readonly VIEWPORT = { width: 1280, height: 800 };
    private readonly TIMEOUT_MS = 30000;

    constructor(wsEndpoint: string) {
        this.wsEndpoint = wsEndpoint;
    }

    static createFromEnv(): RemotePlaywrightAdapter {
        const endpoint = process.env.PLAYWRIGHT_WS_ENDPOINT;

        if (!endpoint) {
            throw new Error(
                "Missing PLAYWRIGHT_WS_ENDPOINT. " +
                "Ensure your VPS is running the browser server and the variable is set in .env",
            );
        }

        return new RemotePlaywrightAdapter(endpoint);
    }

    async navigateTo(
        url: string,
        onProgress?: (status: "SETTING_UP" | "LOADING_WEBSITE") => void,
        onLiveScreenshot?: (screenshotBase64: string) => Promise<void>,
    ): Promise<void> {
        try {
            onProgress?.("SETTING_UP");
            console.log(`[BrowserAdapter] Connecting to ${this.wsEndpoint}...`);
            this.browser = await chromium.connect(this.wsEndpoint);

            this.context = await this.browser.newContext({
                viewport: this.VIEWPORT,
                deviceScaleFactor: 1,
                userAgent:
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                locale: "en-US",
                timezoneId: "America/New_York",
                permissions: ["geolocation"],
                extraHTTPHeaders: {
                    "Accept-Language": "en-US,en;q=0.9",
                    "sec-ch-ua":
                        '"Chromium";v="128", "Not=A?Brand";v="24", "Google Chrome";v="128"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"macOS"',
                    "upgrade-insecure-requests": "1",
                },
            });

            this.page = await this.context.newPage();

            console.log(`[BrowserAdapter] Navigating to ${url}...`);

            onProgress?.("LOADING_WEBSITE");

            let isNavigating = true;
            const screenshotInterval = setInterval(async () => {
                if (!isNavigating || !this.page) {
                    clearInterval(screenshotInterval);
                    return;
                }
                try {
                    const buffer = await this.page.screenshot({
                        fullPage: false,
                        type: "jpeg",
                        quality: 40,
                    });
                    const base64 = buffer.toString("base64");
                    await onLiveScreenshot?.(base64);
                } catch (err) {
                    console.log("[BrowserAdapter] Live screenshot capture failed (page may be closing)");
                }
            }, 500);

            try {
                await this.page.goto(url, {
                    waitUntil: "networkidle",
                });
                await this.waitPageCompletely(this.page);
            } catch (err) {
                console.log("[BrowserAdapter] Navigation timeout, proceeding...");
            } finally {
                isNavigating = false;
                clearInterval(screenshotInterval);
            }
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    async scrollDown(pixels: number): Promise<void> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");
        console.log(`[BrowserAdapter] Scrolling down by ${pixels}px...`);
        const scrollStart = Date.now();
        await this.page.evaluate((px) => {
            window.scrollBy(0, px);
        }, pixels);
        await this.page.waitForTimeout(100);
        console.log(`[BrowserAdapter] Scroll down completed in ${Date.now() - scrollStart}ms`);
    }

    async scrollTo(y: number): Promise<void> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");
        console.log(`[BrowserAdapter] Scrolling to Y=${y}...`);
        const scrollStart = Date.now();
        await this.page.evaluate((targetY) => {
            window.scrollTo({ top: targetY, behavior: 'smooth' });
        }, y);
        await this.page.waitForTimeout(100);
        console.log(`[BrowserAdapter] ScrollTo completed in ${Date.now() - scrollStart}ms`);
    }

    async getElementLocation(selector?: string, anchorText?: string): Promise<number | null> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");

        console.log(`[BrowserAdapter] getElementLocation: selector="${selector || 'none'}" anchorText="${anchorText || 'none'}"`);

        const result = await this.page.evaluate(({ sel, txt }) => {
            let element: Element | null = null;

            if (sel) {
                try {
                    element = document.querySelector(sel);
                } catch (e) { }
            }

            if (!element && txt) {
                const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${txt.toLowerCase()}')]`;
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                element = result.singleNodeValue as Element;
            }

            if (element) {
                const rect = element.getBoundingClientRect();
                const y = window.scrollY + rect.top;
                return y;
            }
            return null;
        }, { sel: selector, txt: anchorText });

        console.log(`[BrowserAdapter] getElementLocation result: Y=${result}`);
        return result;
    }

    async captureViewport(): Promise<string> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");
        console.log(`[BrowserAdapter] Capturing viewport screenshot...`);
        const captureStart = Date.now();
        const buffer = await this.page.screenshot({
            fullPage: false,
            type: "jpeg",
            quality: 40,
        });
        const duration = Date.now() - captureStart;
        const base64 = buffer.toString("base64");
        console.log(`[BrowserAdapter] Viewport captured (${buffer.length} bytes, ${base64.length} base64 chars) in ${duration}ms`);
        return base64;
    }

    async captureFullPage(): Promise<string> {
        if (!this.page) throw new Error("Browser not initialized.");

        console.log(`[BrowserAdapter] Capturing full-page screenshot...`);
        const captureStart = Date.now();

        await this.waitPageCompletely(this.page);

        const buffer = await this.page.screenshot({
            fullPage: true,
            type: "jpeg",
            quality: 70
        });

        const duration = Date.now() - captureStart;
        console.log(`[BrowserAdapter] Full-page capture completed (${buffer.length} bytes) in ${duration}ms`);

        return buffer.toString("base64");
    }

    async getCleanedHtml(): Promise<string> {
        if (!this.page) throw new Error("Browser not initialized. Call navigateTo first.");

        console.log(`[BrowserAdapter] Getting cleaned HTML...`);

        try {
            const jsHandle = await this.page.evaluateHandle(function() {
                var isVisible = function(el: HTMLElement) {
                    var style = window.getComputedStyle(el);
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        el.offsetWidth > 0 &&
                        el.offsetHeight > 0
                    );
                };

                function cleanNode(node: Node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return node.textContent ? node.textContent.trim() : "";
                    }

                    if (node.nodeType !== Node.ELEMENT_NODE) return "";

                    var el = node as HTMLElement;
                    var tag = el.tagName.toLowerCase();

                    var skipTags = ["script", "style", "noscript", "svg", "path", "canvas", "img", "iframe"];
                    if (skipTags.indexOf(tag) !== -1) return "";

                    if (!isVisible(el)) return "";

                    var childrenContent = "";
                    var childNodes = el.childNodes;
                    for (var i = 0; i < childNodes.length; i++) {
                        var content = cleanNode(childNodes[i]);
                        if (content) {
                            childrenContent += content + " ";
                        }
                    }

                    childrenContent = childrenContent.trim();
                    if (!childrenContent) return "";

                    var meaningfulTags = ["h1", "h2", "h3", "h4", "h5", "h6", "button", "a"];
                    if (meaningfulTags.indexOf(tag) !== -1) {
                        return "<" + tag + ">" + childrenContent + "</" + tag + ">";
                    }

                    return childrenContent;
                }

                return cleanNode(document.body);
            });
            const html = await jsHandle.jsonValue();
            console.log(`[BrowserAdapter] Cleaned HTML obtained: ${html.length} chars`);
            return html;
        } catch (error) {
            console.warn("[RemotePlaywrightAdapter] getCleanedHtml failed, returning empty string:", (error as Error).message);
            return "";
        }
    }

    async close(): Promise<void> {
        console.log(`[BrowserAdapter] Closing browser session...`);
        if (this.page) await this.page.close().catch(() => { });
        if (this.context) await this.context.close().catch(() => { });
        // disconnect() closes only the client-side WebSocket. The server-side
        // browser process keeps running. Without this, every request leaks a
        // WebSocket connection that accumulates until the browser server degrades.
        // disconnect() closes only the client-side WebSocket. The server-side
        // browser process keeps running. Use optional chaining since older
        // Playwright versions (pre-1.49) don't expose this method on Browser.
        (this.browser as any)?.disconnect?.();
        this.browser = null;
        this.page = null;
        this.context = null;
        console.log(`[BrowserAdapter] Browser session closed.`);
    }

    async captureScreenshot(
        url: string,
        onProgress?: (
            status: "SETTING_UP" | "LOADING_WEBSITE" | "PROCESSING",
        ) => void,
    ): Promise<string> {
        try {
            await this.navigateTo(url, onProgress as any);
            if (!this.page) throw new Error("Navigation failed");

            onProgress?.("PROCESSING");
            await this.page.mouse.move(100, 100);
            await this.waitPageCompletely(this.page);

            const buffer = await this.page.screenshot({
                fullPage: true,
                type: "jpeg",
                quality: 40,
            });

            return buffer.toString("base64");
        } finally {
            await this.close();
        }
    }

    async waitPageCompletely(page: Page): Promise<void> {
        await page.waitForLoadState("load");

        await page
            .waitForLoadState("networkidle")
            .catch(() => console.log("[BrowserAdapter] Network didn't settle, continuing..."));

        const loaderSelector = [
            ':text-matches("loading", "i")',
            '[class*="skeleton"]',
            '[class*="shimmer"]',
            '[class*="loading-indicator"]'
        ].join(', ');

        await page.locator(loaderSelector).first().waitFor({ state: "hidden", timeout: 1500 }).catch(() => { });

        await page.waitForTimeout(250);
    }

    private async waitForDomStability(
        page: Page,
        timeoutMs: number,
    ): Promise<void> {
        console.log(`[BrowserAdapter] Waiting for DOM stability (max ${timeoutMs}ms)...`);
        try {
            await page.evaluate((timeout) => {
                return new Promise<void>((resolve) => {
                    const checkInterval = 500;
                    const stabilityThreshold = 3;
                    let stabilityCount = 0;
                    let lastState = "";
                    const startTime = Date.now();

                    const check = () => {
                        const currentState = `${document.querySelectorAll("*").length}-${document.body.innerText.length}`;

                        if (currentState === lastState) {
                            stabilityCount++;
                        } else {
                            stabilityCount = 0;
                            lastState = currentState;
                        }

                        if (stabilityCount >= stabilityThreshold) {
                            resolve();
                        } else if (Date.now() - startTime > timeout) {
                            console.log("[Stability Check] Reached timeout, continuing...");
                            resolve();
                        } else {
                            setTimeout(check, checkInterval);
                        }
                    };

                    check();
                });
            }, timeoutMs);
            console.log(`[BrowserAdapter] DOM stabilized.`);
        } catch (error) {
            console.log(`[BrowserAdapter] Stability check failed, continuing...`);
        }
    }

    private async waitForLoadersToDisappear(page: Page): Promise<void> {
        try {
            const loaderSelectors = [
                '[role="progressbar"]',
                ".loader",
                ".loading",
                ".skeleton",
                ".shimmer",
                '[data-testid*="skeleton"]',
                '[class*="skeleton"]',
                '[class*="place-holder"]',
                ".ud-skeleton",
            ];

            for (const selector of loaderSelectors) {
                const count = await page.locator(selector).count();
                if (count > 0) {
                    console.log(`[BrowserAdapter] Waiting for ${selector} to disappear...`);
                    await page
                        .locator(selector)
                        .first()
                        .waitFor({ state: "hidden", timeout: 5000 })
                        .catch(() => { });
                }
            }

            console.log(`[BrowserAdapter] Loaders/Skeletons cleared.`);
        } catch (error) {
            console.log(`[BrowserAdapter] Loader wait timed out, continuing...`);
        }
    }

    private async waitForFrameworkRendering(page: Page): Promise<void> {
        try {
            await page
                .evaluate(() => {
                    return new Promise<void>((resolve) => {
                        let attempts = 0;
                        const maxAttempts = 20;
                        const checkInterval = 200;

                        const checkReady = () => {
                            if (document.readyState !== "complete") {
                                if (attempts < maxAttempts) {
                                    attempts++;
                                    setTimeout(checkReady, checkInterval);
                                } else {
                                    resolve();
                                }
                                return;
                            }

                            const hasReact =
                                !!(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
                                !!(window as any).__NEXT_DATA__;
                            const hasAngular = !!(window as any).ng;
                            const hasVue = !!(window as any).__VUE__;

                            if (hasReact || hasAngular || hasVue) {
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        setTimeout(resolve, 1500);
                                    });
                                });
                            } else {
                                setTimeout(resolve, 1500);
                            }
                        };

                        checkReady();
                    });
                })
                .catch(() => { });

            console.log(`[BrowserAdapter] Framework rendering complete.`);
        } catch (error) {
            console.log(`[BrowserAdapter] Framework wait timed out, continuing...`);
        }
    }

    private async waitForImages(page: Page): Promise<void> {
        try {
            console.log(`[BrowserAdapter] Triggering lazy load via slow scroll...`);

            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const scrollDelay = 150;

                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, scrollDelay);
                });
            });

            await page.waitForTimeout(2000);

            console.log(`[BrowserAdapter] Scroll & Image wait complete.`);
        } catch (error) {
            console.log(`[BrowserAdapter] Image wait timed out, continuing...`);
        }
    }
}
