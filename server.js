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
        // Si existe la URL completa, la usamos (es lo más seguro en Dokploy)
        return await mysql.createConnection(process.env.DATABASE_URL);
    } else {
        // Si no, usamos las variables individuales
        return await mysql.createConnection({
            host: process.env.DB_HOST || 'host.docker.internal',
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            port: 3306
        });
    }
};

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
