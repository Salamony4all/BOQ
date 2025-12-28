
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\BOQ_FitOut.pdf';

async function run() {
    try {
        console.log("Reading file...");
        const data = new Uint8Array(fs.readFileSync(pdfPath));
        console.log("Parsing PDF...");
        const loadingTask = pdfjsLib.getDocument(data);
        const doc = await loadingTask.promise;
        console.log(`Pages: ${doc.numPages}`);

        let fullText = "";
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            // content.items has str
            const strings = content.items.map(item => item.str);
            fullText += strings.join(" ") + "\n";
        }
        // console.log("PDF CONTENT START");
        // console.log(fullText);
        // console.log("PDF CONTENT END");
        fs.writeFileSync('server/extracted_text.txt', fullText, 'utf8');
        console.log("Text written to server/extracted_text.txt");
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
