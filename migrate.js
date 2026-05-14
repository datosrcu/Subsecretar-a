const admin = require('firebase-admin');
const mysql = require('mysql2/promise');
require('dotenv').config();

// 1. Configuración de Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const dbFirestore = admin.firestore();

// 2. Configuración de MySQL
const getDbConnection = async () => {
    if (process.env.DATABASE_URL) {
        return await mysql.createConnection(process.env.DATABASE_URL);
    } else {
        return await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            port: 3306
        });
    }
};

async function migrate() {
    let connection;
    try {
        connection = await getDbConnection();
        console.log('--- Iniciando Migración ---');

        // MIGRAR CATEGORÍAS
        console.log('Migrando Categorías...');
        const catSnap = await dbFirestore.collection('categories').get();
        for (const doc of catSnap.docs) {
            const data = doc.data();
            await connection.execute(
                'INSERT IGNORE INTO categorias (id, name, description, icon, type, color, visible, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [doc.id, data.name, data.description || '', data.icon || '', data.type || 'Categorías', data.color || '#000000', data.visible !== false, data.order || 0]
            );
        }

        // MIGRAR TABLEROS
        console.log('Migrando Tableros...');
        const boardSnap = await dbFirestore.collection('buttons').get();
        for (const doc of boardSnap.docs) {
            const data = doc.data();
            await connection.execute(
                'INSERT IGNORE INTO tableros (id, title, icon, iframe_url, enabled, require_login, open_in_new_tab, sort_order, allowed_users, access_expirations, categories, category_legacy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    doc.id, data.title, data.icon || '', data.iframeUrl || '', data.enabled !== false, 
                    data.requireLogin !== false, data.openInNewTab === true, data.order || 0,
                    JSON.stringify(data.allowedUsers || []), JSON.stringify(data.accessExpirations || {}),
                    JSON.stringify(data.categories || []), data.category || ''
                ]
            );
        }

        // MIGRAR CONTACTOS
        console.log('Migrando Contactos...');
        const contactSnap = await dbFirestore.collection('contacts').get();
        for (const doc of contactSnap.docs) {
            const data = doc.data();
            const date = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now());
            await connection.execute(
                'INSERT IGNORE INTO mensajes_contacto (name, email, reason, message, type, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [data.name || 'Anónimo', data.email || '', data.reason || 'Consulta', data.message || '', data.type || 'general', date]
            );
        }

        // MIGRAR RCE
        console.log('Migrando RCE...');
        const rceSnap = await dbFirestore.collection('consent_logs').get();
        for (const doc of rceSnap.docs) {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp) : new Date();
            await connection.execute(
                'INSERT IGNORE INTO rce_consentimientos (user_uid, user_email, user_name, dni, ip_address, terms_version, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [data.user_uid || '', data.user_email || '', data.user_name || '', data.dni || '', data.ip || '', data.version || '', date]
            );
        }

        console.log('--- Migración Completada con Éxito ---');
    } catch (error) {
        console.error('Error durante la migración:', error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

migrate();
