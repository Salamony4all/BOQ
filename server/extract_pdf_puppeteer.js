
import puppeteer from 'puppeteer';
import path from 'path';

const pdfPath = 'file:///c:/Users/Mohamad60025/Desktop/App/BOQ/BOQ_FitOut.pdf';

async function run() {
    console.log("Launching browser...");
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Opening PDF...");
    // Note: Puppeteer's PDF viewer might not expose text in the DOM easily without some config or might just be a canvas/embed.
    // However, Chrome's internal PDF viewer usually renders text as selectable DOM elements (or similar) in recent versions?
    // Actually, usually it's an <embed> tag.
    // A better way with Puppeteer is to use 'pdf-to-text' libraries, but since I can't restart easily...

    // Let's try to see if we can use a simpler library if this fails.
    // But wait, there's another library `pdf-lib` is for creation/modification.

    // Let's try `pdf-parse` one more time with a very simple usage, maybe I misused it.
    // But I used the standard example.

    // Let's try another lightweight library if possible: `pdf-text-extract`? No, requires system binaries.

    // What about using `pdfjs-dist`? It's the standard. I can install it.
    // Let's try installing `pdfjs-dist`.

    await browser.close();
}

// I will abort this script and try installing pdfjs-dist instead.
