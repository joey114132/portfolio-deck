/**
 * iPhone SE (375×667) 반응형 스모크 — 클리핑·가로 오버플로·과도한 축소 검사
 */
import puppeteer from "puppeteer";

const URL = "http://127.0.0.1:8877/";
// iPhone SE 2nd/3rd gen logical viewport
const VIEWPORT = { width: 375, height: 667, isMobile: true, hasTouch: true };

async function waitDeckReady(page) {
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForFunction(
    () => document.body.classList.contains("deck-ready"),
    { timeout: 90000 }
  );
  await new Promise((r) => setTimeout(r, 400));
}

function auditSlide(page, idx) {
  return page.evaluate((i) => {
    const slides = [...document.querySelectorAll(".slide")];
    const isMobile = window.matchMedia("(max-width: 480px)").matches;

    const measureLikeApp = (slide) => {
      const fit = slide?.querySelector(".slide-fit");
      if (!fit) return { zoom: 1, scroll: false };
      fit.style.zoom = "";
      slide.classList.remove("slide--scroll");
      slide.classList.add("slide--prefit");
      const needed = fit.scrollHeight;
      slide.classList.remove("slide--prefit");
      const cs = getComputedStyle(slide);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const avail = slide.clientHeight - padY;
      if (isMobile) {
        if (needed > avail + 2) slide.classList.add("slide--scroll");
        fit.style.zoom = "";
        return { zoom: 1, scroll: slide.classList.contains("slide--scroll") };
      }
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
      return { zoom: parseFloat(fit.style.zoom || "1") || 1, scroll: false };
    };

    slides.forEach((s, j) => s.classList.toggle("active", j === i));
    const slide = slides[i];
    const fit = slide?.querySelector(".slide-fit");
    const fitState = measureLikeApp(slide);

    const sRect = slide.getBoundingClientRect();
    const fRect = fit?.getBoundingClientRect();
    const padB = parseFloat(getComputedStyle(slide).paddingBottom);
    const bottomClip = fitState.scroll
      ? 0
      : fRect
        ? fRect.bottom - (sRect.bottom - padB)
        : 0;
    const docW = document.documentElement.clientWidth;
    let horizOverflow = false;
    let maxRight = 0;
    slide.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right > docW + 2) horizOverflow = true;
      maxRight = Math.max(maxRight, r.right);
    });

    const minBodyFontPx = (() => {
      let min = 999;
      slide.querySelectorAll("p, li, .problem-solution__body").forEach((el) => {
        if (el.closest(".muted, .eyebrow, .yt-label, .slide-title-meta")) return;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs > 0) min = Math.min(min, fs);
      });
      return min === 999 ? 0 : min;
    })();

    return {
      slideNum: slide?.dataset.slide,
      bottomClipPx: Math.round(bottomClip),
      horizOverflow,
      maxRightPx: Math.round(maxRight),
      viewportW: docW,
      zoom: fitState.zoom,
      scroll: fitState.scroll,
      minBodyFontPx: Math.round(minBodyFontPx * 10) / 10,
      ok:
        !horizOverflow &&
        fitState.zoom === 1 &&
        (fitState.scroll || bottomClip <= 6) &&
        minBodyFontPx >= 12,
    };
  }, idx);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport(VIEWPORT);

const results = [];
try {
  await waitDeckReady(page);
  const total = await page.evaluate(() => document.querySelectorAll(".slide").length);
  for (let i = 0; i < total; i++) {
    results.push(await auditSlide(page, i));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ viewport: VIEWPORT, total, failed: failed.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error(err);
  process.exit(2);
} finally {
  await browser.close();
}
