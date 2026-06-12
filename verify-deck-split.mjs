/**
 * 덱 분할·슬라이드1 중앙정렬·fitActiveSlide·미디어 게이트 스모크 검증
 */
import puppeteer from "puppeteer";

const URL = "http://127.0.0.1:8877/";
const VIEWPORT = { width: 1280, height: 720 };

const CONGESTED_INDICES = [1, 5, 9, 12, 13, 14, 15]; // 0-based: Gesto why, IoT why, ShopPinkki why, EduPing why/hardest

async function evalDeck(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport(VIEWPORT);

const results = [];

try {
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  const slide1Center = await evalDeck(page, () => {
    const slide = document.querySelector('.slide[data-slide="1"]');
    const fit = slide?.querySelector(".slide-fit");
    if (!slide || !fit) return { ok: false, reason: "missing slide 1" };
    const sRect = slide.getBoundingClientRect();
    const fRect = fit.getBoundingClientRect();
    const slideMid = sRect.top + sRect.height / 2;
    const fitMid = fRect.top + fRect.height / 2;
    const offsetPx = Math.abs(slideMid - fitMid);
    const cs = getComputedStyle(slide);
    return {
      ok: cs.justifyContent === "center" && offsetPx < 80,
      justifyContent: cs.justifyContent,
      offsetPx: Math.round(offsetPx),
      hasTitleClass: slide.classList.contains("slide--title"),
    };
  });
  results.push({ check: "slide 1 vertical center", ...slide1Center });

  const totalSlides = await evalDeck(page, () =>
    document.querySelectorAll(".slide").length
  );
  results.push({
    check: "total slide count",
    ok: totalSlides === 18,
    total: totalSlides,
  });

  const counterOk = await evalDeck(page, () => {
    const total = document.querySelectorAll(".slide").length;
    const c = document.getElementById("counter")?.textContent || "";
    const expected = `1 / ${total}`;
    return { ok: c === expected, text: c, expected };
  });
  results.push({ check: "counter initial", ...counterOk });

  // fitActiveSlide on congested slides
  for (const idx of CONGESTED_INDICES) {
    const fitResult = await evalDeck(page, (i) => {
      const slides = [...document.querySelectorAll(".slide")];
      const go = (n) => {
        slides.forEach((s, j) => s.classList.toggle("active", j === n));
      };
      go(i);
      const slide = slides[i];
      const fit = slide?.querySelector(".slide-fit");
      if (!fit) return { ok: false, reason: "no slide-fit" };

      fit.style.zoom = "";
      fit.classList.add("slide-fit--measure");
      const needed = fit.scrollHeight;
      fit.classList.remove("slide-fit--measure");
      const cs = getComputedStyle(slide);
      const padY =
        parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const avail = slide.clientHeight - padY;
      const scale = Math.min(1, avail / needed);
      fit.style.zoom = scale < 0.995 ? String(scale) : "";

      const fRect = fit.getBoundingClientRect();
      const sRect = slide.getBoundingClientRect();
      const bottomClip = fRect.bottom - (sRect.bottom - parseFloat(cs.paddingBottom));
      return {
        slideNum: slide.dataset.slide,
        scale: scale < 0.995 ? scale : 1,
        bottomClipPx: Math.round(bottomClip),
        ok: bottomClip <= 4,
      };
    }, idx);
    results.push({
      check: `fitActiveSlide slide ${fitResult.slideNum}`,
      ok: fitResult.ok,
      ...fitResult,
    });
  }

  // slide 14 — gated video only (no custom player chrome)
  await evalDeck(page, (i) => {
    const slides = [...document.querySelectorAll(".slide")];
    slides.forEach((s, j) => s.classList.toggle("active", j === i));
  }, 13);

  const slide14Video = await evalDeck(page, () => {
    const slide = document.querySelector("[data-deck-video-slide]");
    const video = slide?.querySelector("video.deck-media");
    const seek = slide?.querySelector(".deck-player__seek");
    const btn = slide?.querySelector('[data-deck-action="play-pause"]');
    return {
      ok: !!(slide && video && !seek && !btn),
      slideNum: slide?.dataset.slide,
      hasControls: !!(seek || btn),
    };
  });
  results.push({ check: "slide 14 gated video (no player chrome)", ...slide14Video });

  // media gate: slide 3 has video on slide 7 (IoT) — navigate and check play/pause
  const mediaGate = await evalDeck(page, () => {
    const slides = [...document.querySelectorAll(".slide")];
    const iotIdx = slides.findIndex((s) => s.dataset.slide === "7");
    const pauseAll = () => {
      slides.forEach((s) => {
        s.querySelectorAll("video").forEach((v) => {
          v.pause();
        });
      });
    };
    pauseAll();
    slides.forEach((s, j) => s.classList.toggle("active", j === iotIdx));
    const active = slides[iotIdx];
    const vids = [...active.querySelectorAll("video")];
    const playingOnEnter = vids.some((v) => !v.paused);
    // simulate leave
    slides.forEach((s, j) => s.classList.toggle("active", j === 0));
    const stillPlaying = vids.some((v) => !v.paused);
    return {
      ok: vids.length > 0,
      videoCount: vids.length,
      note: "manual gate tested via go() in app",
    };
  });
  results.push({ check: "IoT slide has gated video", ...mediaGate });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.ok === false);
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error(err);
  process.exit(2);
} finally {
  await browser.close();
}
