/**
 * Generates data/raw/docs/product-brochure-2026.pdf — a realistic multi-page brochure with a
 * repeating header/footer and page numbers so the PDF parser's boilerplate removal is exercised.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs";

const pages: { heading: string; paragraphs: string[] }[] = [
  {
    heading: "Dravix Health Plans at a Glance",
    paragraphs: [
      "Silver Plan: our entry-level health insurance plan with sum insured of Rs 3 lakh or Rs 5 lakh. Premium starts at Rs 6,200 per year for individuals aged 18-35. Room rent is covered up to 1% of the sum insured per day.",
      "Gold Plan: sum insured of Rs 5 lakh or Rs 10 lakh with a single private room, maternity cover up to Rs 50,000 after 24 months, AYUSH treatment and a free annual health check-up. Premium starts at Rs 9,800 per year.",
      "Platinum Plan: sum insured of Rs 10 lakh, 25 lakh or 50 lakh, any room category, global emergency hospitalisation, 100% restore benefit and OPD cover up to Rs 10,000 per year. Premium starts at Rs 16,500 per year.",
    ],
  },
  {
    heading: "Benefits Included in Every Plan",
    paragraphs: [
      "Pre-hospitalisation expenses for 60 days and post-hospitalisation expenses for 90 days are covered. Day-care procedures that need less than 24 hours of hospitalisation are covered.",
      "Restore benefit: if the sum insured is exhausted during the year, it is restored once for unrelated illnesses (Gold restores 50%, Platinum restores 100%; Silver has no restore benefit).",
      "Ambulance charges are covered up to Rs 2,000 per hospitalisation. Organ donor expenses are covered up to the sum insured.",
    ],
  },
  {
    heading: "How to Buy and Next Steps",
    paragraphs: [
      "Step 1: share basic details – age of each member, city, health conditions and preferred sum insured. Step 2: receive a personalised quote. Step 3: complete the proposal form and, if required, the free home medical check-up. Step 4: pay annually or in 12 monthly instalments.",
      "Customers can request a callback at a convenient time or speak to a licensed advisor on 1800-200-3344.",
    ],
  },
];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle("Dravix Health Product Brochure 2026");
  pages.forEach((p, i) => {
    const page = doc.addPage([595, 842]);
    page.drawText("Dravix Health | Product Brochure 2026", { x: 50, y: 800, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(p.heading, { x: 50, y: 760, size: 16, font: bold });
    let y = 730;
    for (const para of p.paragraphs) {
      const words = para.split(" ");
      let line = "";
      for (const w of words) {
        if (font.widthOfTextAtSize(line + w + " ", 11) > 495) {
          page.drawText(line.trim(), { x: 50, y, size: 11, font });
          y -= 16;
          line = "";
        }
        line += w + " ";
      }
      page.drawText(line.trim(), { x: 50, y, size: 11, font });
      y -= 28;
    }
    page.drawText(`Confidential - for customer use only | Page ${i + 1} of ${pages.length}`, { x: 50, y: 30, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  });
  fs.writeFileSync("data/raw/docs/product-brochure-2026.pdf", await doc.save());
  console.log("wrote data/raw/docs/product-brochure-2026.pdf");
}
main();
