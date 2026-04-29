const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 80;

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
            message: '¡Conexión establecida exitosamente usando la URL de Dokploy!' 
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


// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '/')));

// Manejar todas las rutas para SPA (opcional, por si usas rutas de JS)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
