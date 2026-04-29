const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config();

// Inicializar Firebase Admin
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin inicializado correctamente.');
} catch (error) {
    console.error('Error al inicializar Firebase Admin:', error.message);
}

const app = express();
const PORT = process.env.PORT || 80;

// Middleware para verificar el Token de Firebase
const verifyToken = async (req, res, next) => {
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    
    if (!idToken) {
        return res.status(401).json({ error: 'No se proporcionó un token de autenticación.' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error al verificar token:', error);
        res.status(403).json({ error: 'Token inválido o expirado.' });
    }
};

// Middleware de seguridad
app.use(helmet({
    contentSecurityPolicy: false, // Desactivado para permitir scripts externos de Firebase por ahora
}));
app.use(cors());
app.use(express.json());

// Configuración de la base de datos MySQL
const getDbConnection = async () => {
    if (process.env.DATABASE_URL) {
        return await mysql.createConnection(process.env.DATABASE_URL);
    } else {
        return await mysql.createConnection({
            host: process.env.DB_HOST || 'host.docker.internal',
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            port: 3306
        });
    }
};

// Función para inicializar tablas automáticamente
const initializeTables = async () => {
    try {
        const connection = await getDbConnection();
        console.log('Inicializando tablas en MySQL...');

        // 1. Tabla de Perfiles de Usuario
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usuarios_perfiles (
                uid VARCHAR(128) PRIMARY KEY,
                email VARCHAR(255) UNIQUE,
                full_name VARCHAR(255),
                dni VARCHAR(20),
                sector_group VARCHAR(100),
                organization_type VARCHAR(100),
                organization_name VARCHAR(255),
                role_position VARCHAR(100),
                role_detail TEXT,
                cuit VARCHAR(20),
                expiry_date DATE,
                legal_file_url TEXT,
                terms_accepted_version VARCHAR(20),
                terms_accepted_date DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 2. Tabla de Solicitudes de Acceso
        await connection.query(`
            CREATE TABLE IF NOT EXISTS solicitudes_acceso (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_uid VARCHAR(128),
                dashboard_name VARCHAR(255),
                reason TEXT,
                reason_detail TEXT,
                terms_version VARCHAR(20),
                status ENUM('pendiente', 'aprobado', 'rechazado') DEFAULT 'pendiente',
                admin_comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Tabla de Productos Estadísticos
        await connection.query(`
            CREATE TABLE IF NOT EXISTS productos_estadisticos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_uid VARCHAR(128),
                client_name VARCHAR(255),
                client_email VARCHAR(255),
                client_phone VARCHAR(50),
                client_position VARCHAR(100),
                jurisdictions JSON,
                area VARCHAR(255),
                product_types JSON,
                title VARCHAR(255),
                periodicity VARCHAR(50),
                due_date DATE,
                description TEXT,
                formats JSON,
                has_tech_contact BOOLEAN,
                tech_contact_name VARCHAR(255),
                tech_contact_email VARCHAR(255),
                tech_contact_phone VARCHAR(50),
                additional_info TEXT,
                attachment_urls JSON,
                status ENUM('pendiente', 'en_proceso', 'completado', 'rechazado') DEFAULT 'pendiente',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Tabla de Logs de Actividad
        await connection.query(`
            CREATE TABLE IF NOT EXISTS logs_actividad (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_uid VARCHAR(128),
                action VARCHAR(100),
                details JSON,
                ip_address VARCHAR(45),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5. Tabla de Feedback
        await connection.query(`
            CREATE TABLE IF NOT EXISTS feedback_web (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_uid VARCHAR(128),
                is_useful BOOLEAN,
                comment TEXT,
                name_provided VARCHAR(255),
                email_provided VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('Estructura de base de datos lista.');
        await connection.end();
    } catch (error) {
        console.error('Error al inicializar las tablas:', error);
    }
};

// Ejecutar inicialización al arrancar
initializeTables();

// Endpoint de prueba de conexión
app.get('/api/status', async (req, res) => {
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
        return res.status(500).json({
            status: 'error',
            message: 'No se encontró DATABASE_URL ni DB_HOST en las variables de entorno.'
        });
    }

    try {
        const connection = await getDbConnection();
        await connection.ping();
        await connection.end();
        res.json({ 
            status: 'online', 
            database: 'connected',
            auth: 'ready',
            message: '¡Conexión establecida y sistema de seguridad inicializado!' 
        });
    } catch (error) {
        console.error('Error de DB:', error);
        res.status(500).json({ 
            status: 'error', 
            database: 'disconnected',
            message: error.message 
        });
    }
});

// Ruta protegida de prueba (Solo accesible con Login)
app.get('/api/protected-test', verifyToken, (req, res) => {
    res.json({
        message: '¡Felicidades! Has accedido a una ruta protegida.',
        user: {
            email: req.user.email,
            uid: req.user.uid
        }
    });
});


// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '/')));

// Manejar todas las rutas para SPA (opcional, por si usas rutas de JS)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
