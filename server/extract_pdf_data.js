
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import path from 'path';

const pdfPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\BOQ_FitOut.pdf';

async function run() {
    try {
        if (!fs.existsSync(pdfPath)) {
            console.error("File does not exist:", pdfPath);
            return;
        }
        console.log("Reading file...");
        const dataBuffer = fs.readFileSync(pdfPath);
        console.log("Parsing PDF...");
        const data = await pdf(dataBuffer);
        console.log("PDF CONTENT START");
        console.log(data.text);
        console.log("PDF CONTENT END");
    } catch (error) {
        console.error("Error parsing PDF:", error);
    }
}

run();
