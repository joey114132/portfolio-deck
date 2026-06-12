/**
 * 덱 슬라이드별 하단 여백·미디어 열 내부 gap·zoom 측정
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const URL = process.env.DECK_URL || "http://127.0.0.1:8766/presentation/portfolio-deck.html";
const VIEWPORT = { width: 1920, height: 1080 };
const OUT_DIR = path.join(process.cwd(), "presentation", "audit-screenshots");

const BOTTOM_GAP_FLAG = 80;
const LABEL_MEDIA_GAP_FLAG = 40;

async function measureSlide(page, idx) {
  return page.evaluate(
    ({ i, bottomFlag, labelFlag }) => {
      const slides = [...document.querySelectorAll(".slide")];
      const go = (n) => {
        slides.forEach((s, j) => s.classList.toggle("active", j === n));
      };
      go(i);
      const slide = slides[i];
      if (!slide) return { ok: false, reason: "missing slide" };

      const fit = slide.querySelector(".slide-fit");
      if (!fit) return { ok: false, reason: "missing slide-fit" };

      // replicate measureAndFitSlide
      fit.style.zoom = "";
      slide.classList.add("slide--prefit");
      const needed = fit.scrollHeight;
      slide.classList.remove("slide--prefit");
      const cs = getComputedStyle(slide);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const padBottom = parseFloat(cs.paddingBottom);
      const avail = slide.clientHeight - padY;
      let scale = Math.min(1, avail / needed);
      const hasGrid2 = slide.querySelector(".slide-body.grid-2");
      const isLooseSparse =
        (slide.classList.contains("slide--title") ||
          slide.classList.contains("slide--sparse")) &&
        !hasGrid2;
      if (isLooseSparse && needed > 0 && needed < avail * 0.68) {
        scale = Math.min(1.15, avail / needed);
      }
      fit.style.zoom = Math.abs(scale - 1) > 0.005 ? String(scale) : "";

      const sRect = slide.getBoundingClientRect();
      const fRect = fit.getBoundingClientRect();
      const contentBottom = fRect.bottom;
      const slideContentBottom = sRect.bottom - padBottom;
      const bottomGap = slideContentBottom - contentBottom;

      const mediaGaps = [];
      slide.querySelectorAll(".slide-col--media, .slide-col--media-feature, .glass--deck-demo").forEach((col) => {
        const label = col.querySelector(".yt-label, .deck-label, label.yt-label");
        const media = col.querySelector(".yt-thumb, .deck-media, .media-wrap img, .media-wrap video, .media-wrap--yt img, .media-wrap--deck16 video, .media-wrap--deck16 img");
        if (label && media) {
          const lRect = label.getBoundingClientRect();
          const mRect = media.getBoundingClientRect();
          const gap = mRect.top - lRect.bottom;
          mediaGaps.push({
            selector: col.className,
            gapPx: Math.round(gap),
            flagged: gap > labelFlag,
          });
        }
      });

      // header intro media gaps
      slide.querySelectorAll(".slide-header-intro__media").forEach((col) => {
        const label = col.querySelector(".yt-label");
        const media = col.querySelector(".yt-thumb, .deck-media, video, img");
        if (label && media) {
          const gap = media.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
          mediaGaps.push({
            selector: "slide-header-intro__media",
            gapPx: Math.round(gap),
            flagged: gap > labelFlag,
          });
        }
      });

      const maxMediaGap = mediaGaps.length ? Math.max(...mediaGaps.map((g) => g.gapPx)) : 0;

      return {
        slideNum: slide.dataset.slide || String(i + 1),
        idx: i,
        bottomGapPx: Math.round(bottomGap),
        bottomFlagged: bottomGap > bottomFlag,
        zoom: Math.abs(scale - 1) > 0.005 ? scale : 1,
        zoomStr: fit.style.zoom || "1",
        sparse: slide.classList.contains("slide--sparse"),
        dense: slide.classList.contains("slide-dense"),
        title: slide.classList.contains("slide--title"),
        fitHeight: Math.round(fRect.height),
        slideHeight: Math.round(sRect.height),
        maxMediaGapPx: maxMediaGap,
        mediaGaps,
        mediaGapFlagged: mediaGaps.some((g) => g.flagged),
        flagged: bottomGap > bottomFlag || mediaGaps.some((g) => g.flagged),
      };
    },
    { i: idx, bottomFlag: BOTTOM_GAP_FLAG, labelFlag: LABEL_MEDIA_GAP_FLAG }
  );
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize(VIEWPORT);

await mkdir(OUT_DIR, { recursive: true });

try {
  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForSelector("body.deck-ready", { timeout: 60000 });

  const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
  const results = [];

  for (let i = 0; i < total; i++) {
    const m = await measureSlide(page, i);
    results.push(m);
    if (m.flagged) {
      await page.evaluate((idx) => {
        const slides = [...document.querySelectorAll(".slide")];
        slides.forEach((s, j) => s.classList.toggle("active", j === idx));
      }, i);
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(OUT_DIR, `slide-${String(m.slideNum).padStart(2, "0")}-before.png`),
        fullPage: false,
      });
    }
  }

  const flagged = results.filter((r) => r.flagged);
  const report = {
    viewport: VIEWPORT,
    thresholds: { bottomGap: BOTTOM_GAP_FLAG, labelMediaGap: LABEL_MEDIA_GAP_FLAG },
    total,
    flaggedCount: flagged.length,
    results,
    flaggedSlides: flagged.map((r) => r.slideNum),
  };

  await writeFile(path.join(OUT_DIR, "audit-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(flagged.length ? 0 : 0);
} catch (err) {
  console.error(err);
  process.exit(2);
} finally {
  await browser.close();
}
