const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('admin.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });

dom.window.document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('DOMContentLoaded fired');
        const adminJs = fs.readFileSync('admin.js', 'utf-8');
        // We will just eval the code in the window context to see if it throws
        dom.window.eval(`
            try {
                ${adminJs.replace(/import .*/g, '')}
                console.log("admin.js parsed and executed successfully");
                if (window.openInformeModal) {
                    console.log("window.openInformeModal is defined!");
                } else {
                    console.log("window.openInformeModal is MISSING!");
                }
            } catch (e) {
                console.error("Error in admin.js:", e.message, e.stack);
            }
        `);
    } catch (e) {
        console.error("Error:", e);
    }
});
