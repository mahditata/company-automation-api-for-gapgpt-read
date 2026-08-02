const fs = require('fs');
const path = require('path');

const targetDir = './'; // در ریشه پروژه web
const outputFile = 'project-snapshot.txt';

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function(file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
                arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
            }
        } else {
            arrayOfFiles.push(path.join(dirPath, "/", file));
        }
    });
    return arrayOfFiles;
}

const files = getAllFiles(targetDir);
let snapshot = 'PROJECT STRUCTURE AND CONTENT SNAPSHOT\n' + '='.repeat(40) + '\n\n';

files.forEach(file => {
    if (file === outputFile || file.includes('package-lock.json')) return;
    
    snapshot += `\n\n--- FILE: ${file} ---\n`;
    try {
        const content = fs.readFileSync(file, 'utf8');
        snapshot += content;
    } catch (err) {
        snapshot += '[BINARY OR UNREADABLE FILE]';
    }
});

fs.writeFileSync(outputFile, snapshot);
console.log(`Snapshot generated in ${outputFile}`);
