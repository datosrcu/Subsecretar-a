const fs = require('fs');

global.document = {
    getElementById: (id) => ({ addEventListener: () => {}, value: '', style: {} }),
    querySelectorAll: () => [],
    addEventListener: () => {}
};
global.window = {};

const adminJs = fs.readFileSync('admin.js', 'utf-8');
const code = adminJs.replace(/import .*/g, ''); // remove imports

try {
    eval(`
        const onAuthStateChanged = () => {};
        const auth = {};
        const signInWithPopup = () => {};
        const signOut = () => {};
        const provider = {};
        ${code}
    `);
    console.log("SUCCESS");
} catch (e) {
    console.error("RUNTIME ERROR:", e.message);
    console.error(e.stack);
}
