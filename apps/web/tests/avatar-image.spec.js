// apps/web/tests/avatar-image.spec.js
// A big, wide photo becomes a small 256 x 256 JPEG that fits the API's body limit.
import { test, expect } from "@playwright/test";

test("a large wide photo is cropped square and shrunk", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { prepareAvatar, squareCrop } = await import("/src/avatarImage.js");
    const c = document.createElement("canvas");
    c.width = 4000;
    c.height = 2500;
    const ctx = c.getContext("2d");
    for (let i = 0; i < 400; i++) { // noisy on purpose: noise compresses badly
      ctx.fillStyle = `hsl(${(i * 37) % 360} 70% 50%)`;
      ctx.fillRect((i * 97) % 4000, (i * 53) % 2500, 300, 300);
    }
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "big.png", { type: "image/png" });
    const url = await prepareAvatar(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { inputBytes: file.size, outBytes: url.length, w: img.naturalWidth, h: img.naturalHeight, type: url.slice(0, 23), crop: squareCrop(4000, 2500) };
  });
  expect(result.w).toBe(256);
  expect(result.h).toBe(256);
  expect(result.type).toBe("data:image/jpeg;base64,");
  expect(result.outBytes).toBeLessThan(100 * 1024); // express.json() default limit
  expect(result.crop).toEqual({ sx: 750, sy: 0, side: 2500 });
});
