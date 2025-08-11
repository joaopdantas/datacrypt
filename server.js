const express = require('express');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(express.static('public'));

async function processFiles(req, res, action) {
    const { key, algorithm, mode, useRandomIV } = req.body;
    const ivFlag = useRandomIV === 'true' ? '--use-random-iv' : '';

    const zip = new JSZip();

    for (const file of req.files) {
        const tempInputPath = path.join(os.tmpdir(), file.originalname);
        // Use a different output filename to avoid overwriting input before reading
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext);
        const tempOutputPath = path.join(os.tmpdir(), base + '.out' + ext);

        // Save uploaded file to temp input path
        fs.writeFileSync(tempInputPath, file.buffer);

        const jarPath = path.resolve(__dirname, 'secure-properties-tool.jar');
        const command = `java -cp "${jarPath}" com.mulesoft.tools.SecurePropertiesTool file ${action} ${algorithm} ${mode} "${key}" "${tempInputPath}" "${tempOutputPath}" ${ivFlag}`;
        
        try {
            await new Promise((resolve, reject) => {
                exec(command, (error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });

            // Read output and store in ZIP with same filename as original
            if (fs.existsSync(tempOutputPath)) {
                const outputBuffer = fs.readFileSync(tempOutputPath);
                zip.file(file.originalname, outputBuffer);
            } else {
                zip.file(file.originalname + '-error.txt', 'No output file generated.');
            }
        } catch (err) {
            console.error(`Error ${action}ing ${file.originalname}:`, err.message);
            zip.file(file.originalname + '-error.txt', err.message);
        } finally {
            // Clean up temp files
            [tempInputPath, tempOutputPath].forEach(f => {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            });
        }
    }

    // Send zip to client
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Disposition', `attachment; filename="${action}ed-files.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
}

// Encrypt route
app.post('/encrypt', upload.array('yamlFiles'), (req, res) => processFiles(req, res, 'encrypt'));

// Decrypt route
app.post('/decrypt', upload.array('yamlFiles'), (req, res) => processFiles(req, res, 'decrypt'));

app.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
