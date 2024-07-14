import { PDFDocument, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

export async function POST(request: Request) {
  try {
    // Receive image data as base64 string in request body
    const { imageStr } = await request.json();

    // Decode base64 image data and save it to a file with a unique filename
    const base64Data = imageStr.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const uniqueFileName = `${uuidv4()}.png`; // Generate unique filename
    const tempImagePath = path.join(process.cwd(), 'temp', uniqueFileName);
    await fs.promises.mkdir(path.dirname(tempImagePath), { recursive: true });
    await fs.promises.writeFile(tempImagePath, imageBuffer);

    // Convert image to 300 DPI using sharp
    const outputImagePath = path.join(process.cwd(), 'temp', `${uuidv4()}-300dpi.png`);
    await sharp(tempImagePath)
      .resize({ width: 1200, height: 1800, fit: 'contain' }) // 4R at 300 DPI is 1200x1800 pixels
      .toFile(outputImagePath);

    // Read the converted image
    const updatedImageBuffer = await fs.promises.readFile(outputImagePath);

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([1200, 1800]);
    const { width, height } = page.getSize();

    // Embed the uploaded image into the PDF
    const embeddedImage = await pdfDoc.embedPng(updatedImageBuffer);

    const imageWidth = width; 
    const imageHeight = (imageWidth / embeddedImage.width) * embeddedImage.height;

    const x = (width - imageWidth) / 2;
    const y = (height - imageHeight) / 2;

    page.drawImage(embeddedImage, {
      x,
      y,
      width: imageWidth,
      height: imageHeight,
    });

    // Save the PDF document to a file
    const pdfFilePath = path.join(process.cwd(), 'output.pdf');
    const pdfBytes = await pdfDoc.save();
    await fs.promises.writeFile(pdfFilePath, pdfBytes);

    // Specify the path to SumatraPDF executable in the public directory
    const sumatraExePath = path.join(process.cwd(), 'public', 'SumatraPDF-3.5.2-64.exe');

    // Use exec to call SumatraPDF directly for printing
    exec(`"${sumatraExePath}" -print-to-default -silent "${pdfFilePath}"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return NextResponse.json({ error: 'Failed to print' }, { status: 500 });
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
        return NextResponse.json({ error: 'Failed to print' }, { status: 500 });
      }
      console.log(`Stdout: ${stdout}`);
      return NextResponse.json({ message: 'Printed successfully' });
    });

    // Return a response for the initial request
    return NextResponse.json({ message: 'Printing request received' });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to print' }, { status: 500 });
  }
}
